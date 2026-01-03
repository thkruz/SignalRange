/**
 * @file TrafficControlManager - Manages traffic ownership and handover between ground stations
 * @description Tracks which ground station "owns" traffic to each satellite,
 * manages explicit handover flow with readiness checks, and emits handover events.
 */

import { GroundStation } from '@app/assets/ground-station/ground-station';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Milliseconds } from 'ootk';

/** Tolerance in degrees for determining if antenna is pointing at satellite */
const POINTING_TOLERANCE_DEG = 2;

/** Traffic ownership state for a satellite */
export interface TrafficOwnership {
  /** Satellite NORAD ID */
  satelliteNoradId: number;
  /** Current owner ground station ID */
  owningGroundStationId: string;
  /** Is a handover currently in progress */
  isHandoverInProgress: boolean;
  /** Target station for handover (null if no handover) */
  handoverTargetStationId: string | null;
  /** Is the source station ready for handover */
  sourceStationReady: boolean;
  /** Is the target station ready for handover */
  targetStationReady: boolean;
}

/** Readiness check result for a ground station */
export interface HandoverReadiness {
  /** Ground station ID */
  groundStationId: string;
  /** Is the station ready for handover */
  isReady: boolean;
  /** Current link margin above threshold in dB */
  linkMargin_dB: number;
  /** Does the receiver have carrier lock */
  hasCarrierLock: boolean;
  /** Current C/N ratio in dB (null if not locked) */
  cnRatio_dB: number | null;
}

/**
 * TrafficControlManager singleton - manages traffic ownership and handover
 *
 * State Machine:
 *   IDLE → [initiateHandover] → IN_PROGRESS
 *                                    ↓
 *                         [both stations ready]
 *                                    ↓
 *                   READY → [executeHandover] → COMPLETE
 */
export class TrafficControlManager {
  private static instance_: TrafficControlManager | null = null;
  private readonly trafficOwnership_: Map<number, TrafficOwnership> = new Map();

  /** Minimum C/N ratio required for handover (dB) */
  static readonly MIN_HANDOVER_CN_RATIO_DB = 8;

  /** Bound handler for cleanup */
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  /** Flag to prevent repeated dual transmission violation events */
  private dualTransmissionViolationEmitted_: boolean = false;

  private constructor() {
    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initialize from scenario data
    this.loadTrafficOwnership_();
  }

  static getInstance(): TrafficControlManager {
    this.instance_ ??= new TrafficControlManager();
    return this.instance_;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  /** Load initial traffic ownership from scenario configuration */
  private loadTrafficOwnership_(): void {
    const settings = ScenarioManager.getInstance().settings;
    const ownership = settings.trafficOwnership;

    if (ownership) {
      for (const o of ownership) {
        this.initializeOwnership(o.satelliteNoradId, o.initialOwnerId);
      }
    }
  }

  /**
   * Initialize traffic ownership for a satellite
   * @param satelliteId - Satellite NORAD ID
   * @param initialOwnerId - Initial owner ground station ID
   */
  initializeOwnership(satelliteId: number, initialOwnerId: string): void {
    this.trafficOwnership_.set(satelliteId, {
      satelliteNoradId: satelliteId,
      owningGroundStationId: initialOwnerId,
      isHandoverInProgress: false,
      handoverTargetStationId: null,
      sourceStationReady: true,
      targetStationReady: false,
    });
  }

  /**
   * Get current owner of satellite traffic
   * @param satelliteId - Satellite NORAD ID
   * @returns Ground station ID or null if not tracked
   */
  getOwner(satelliteId: number): string | null {
    return this.trafficOwnership_.get(satelliteId)?.owningGroundStationId ?? null;
  }

  /**
   * Get traffic ownership state for a satellite
   * @param satelliteId - Satellite NORAD ID
   */
  getOwnershipState(satelliteId: number): TrafficOwnership | null {
    return this.trafficOwnership_.get(satelliteId) ?? null;
  }

  /**
   * Initiate handover process
   * @param satelliteId - Satellite NORAD ID
   * @param targetStationId - Target ground station ID
   * @returns true if handover was initiated
   */
  initiateHandover(satelliteId: number, targetStationId: string): boolean {
    const ownership = this.trafficOwnership_.get(satelliteId);
    if (!ownership) return false;
    if (ownership.isHandoverInProgress) return false;
    if (ownership.owningGroundStationId === targetStationId) return false;

    ownership.isHandoverInProgress = true;
    ownership.handoverTargetStationId = targetStationId;
    ownership.targetStationReady = false;

    EventBus.getInstance().emit(Events.HANDOVER_INITIATED, {
      satelliteId,
      sourceStationId: ownership.owningGroundStationId,
      targetStationId,
    });

    return true;
  }

  /**
   * Mark a station as ready for handover
   * @param satelliteId - Satellite NORAD ID
   * @param stationId - Ground station ID
   * @param isReady - Whether the station is ready
   */
  setStationReady(satelliteId: number, stationId: string, isReady: boolean): void {
    const ownership = this.trafficOwnership_.get(satelliteId);
    if (!ownership?.isHandoverInProgress) return;

    if (stationId === ownership.owningGroundStationId) {
      ownership.sourceStationReady = isReady;
    } else if (stationId === ownership.handoverTargetStationId) {
      ownership.targetStationReady = isReady;
    }

    // Check if both stations are ready
    if (ownership.sourceStationReady && ownership.targetStationReady) {
      EventBus.getInstance().emit(Events.HANDOVER_READY, {
        satelliteId,
        sourceStationId: ownership.owningGroundStationId,
        targetStationId: ownership.handoverTargetStationId,
      });
    }
  }

  /**
   * Execute the handover (requires both stations ready)
   * Automatically controls HPA and BUC on both ground stations:
   * - Source station: HPA off, BUC muted
   * - Target station: BUC unmuted, HPA on
   * @param satelliteId - Satellite NORAD ID
   * @returns true if handover was executed
   */
  executeHandover(satelliteId: number): boolean {
    const ownership = this.trafficOwnership_.get(satelliteId);
    if (!ownership) return false;
    if (!ownership.isHandoverInProgress) return false;
    if (!ownership.sourceStationReady || !ownership.targetStationReady) return false;

    const previousOwner = ownership.owningGroundStationId;
    const newOwner = ownership.handoverTargetStationId;

    // Disable transmission on source station FIRST (HPA off, BUC mute)
    this.disableTransmission_(previousOwner);

    // Update ownership state
    ownership.owningGroundStationId = newOwner;
    ownership.isHandoverInProgress = false;
    ownership.handoverTargetStationId = null;
    ownership.sourceStationReady = true;
    ownership.targetStationReady = false;

    // Enable transmission on target station (BUC unmute, HPA on)
    this.enableTransmission_(newOwner);

    EventBus.getInstance().emit(Events.HANDOVER_COMPLETE, {
      satelliteId,
      previousOwnerId: previousOwner,
      newOwnerId: newOwner,
    });

    return true;
  }

  /**
   * Cancel in-progress handover
   * @param satelliteId - Satellite NORAD ID
   */
  cancelHandover(satelliteId: number): void {
    const ownership = this.trafficOwnership_.get(satelliteId);
    if (!ownership?.isHandoverInProgress) return;

    ownership.isHandoverInProgress = false;
    ownership.handoverTargetStationId = null;
    ownership.targetStationReady = false;

    EventBus.getInstance().emit(Events.HANDOVER_CANCELLED, { satelliteId });
  }

  /**
   * Check handover readiness for a ground station
   * @param groundStationId - Ground station ID
   * @param _satelliteId - Satellite NORAD ID (for future use)
   */
  checkStationReadiness(groundStationId: string, _satelliteId: number): HandoverReadiness {
    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find(g => g.state.id === groundStationId);

    if (!gs) {
      return {
        groundStationId,
        isReady: false,
        linkMargin_dB: -Infinity,
        hasCarrierLock: false,
        cnRatio_dB: null,
      };
    }

    // Check receiver lock and C/N ratio
    const receiver = gs.receivers[0];
    if (!receiver) {
      return {
        groundStationId,
        isReady: false,
        linkMargin_dB: -Infinity,
        hasCarrierLock: false,
        cnRatio_dB: null,
      };
    }

    const activeModem = receiver.state.modems.find(m => m.modemNumber === receiver.state.activeModem);
    if (!activeModem) {
      return {
        groundStationId,
        isReady: false,
        linkMargin_dB: -Infinity,
        hasCarrierLock: false,
        cnRatio_dB: null,
      };
    }

    const signalInfo = receiver.getSignalsInBandwidth(activeModem);
    const cnRatio = receiver.getSnrForModem(activeModem);

    const hasCarrierLock = signalInfo?.hasLock ?? false;
    const linkMargin = (cnRatio ?? -Infinity) - TrafficControlManager.MIN_HANDOVER_CN_RATIO_DB;

    return {
      groundStationId,
      isReady: hasCarrierLock && (cnRatio ?? 0) >= TrafficControlManager.MIN_HANDOVER_CN_RATIO_DB,
      linkMargin_dB: linkMargin,
      hasCarrierLock,
      cnRatio_dB: cnRatio,
    };
  }

  /**
   * Check if a ground station is actively transmitting to a satellite
   * Requires: HPA enabled, BUC unmuted, antenna pointing at satellite
   */
  private isTransmittingToSatellite_(gs: GroundStation, satelliteAz: number, satelliteEl: number): boolean {
    const antenna = gs.antennas[0];
    const rfFrontEnd = gs.rfFrontEnds[0];

    if (!antenna || !rfFrontEnd) return false;

    // Check HPA is enabled
    if (!rfFrontEnd.hpaModule.state.isHpaEnabled) return false;

    // Check BUC is not muted
    if (rfFrontEnd.bucModule.state.isMuted) return false;

    // Check antenna is pointing at satellite (within tolerance)
    const azDiff = Math.abs(antenna.state.azimuth - satelliteAz);
    const elDiff = Math.abs(antenna.state.elevation - satelliteEl);

    // Handle azimuth wraparound (0/360 degrees)
    const normalizedAzDiff = azDiff > 180 ? 360 - azDiff : azDiff;

    return normalizedAzDiff <= POINTING_TOLERANCE_DEG && elDiff <= POINTING_TOLERANCE_DEG;
  }

  /**
   * Check for dual transmission violation (multiple ground stations transmitting to same satellite)
   * Emits DUAL_TRANSMISSION_VIOLATION event if detected (only once per violation)
   */
  private checkDualTransmission_(): void {
    // Skip if we've already emitted a violation
    if (this.dualTransmissionViolationEmitted_) return;

    const sim = SimulationManager.getInstance();

    // Check each tracked satellite
    for (const satId of this.trafficOwnership_.keys()) {
      const satellite = sim.satellites.find(s => s.noradId === satId);
      if (!satellite) continue;

      // Find all ground stations transmitting to this satellite
      const transmittingStations: string[] = [];

      for (const gs of sim.groundStations) {
        if (this.isTransmittingToSatellite_(gs, satellite.az, satellite.el)) {
          transmittingStations.push(gs.state.id);
        }
      }

      // If more than one station is transmitting, emit violation
      if (transmittingStations.length > 1) {
        this.dualTransmissionViolationEmitted_ = true;

        EventBus.getInstance().emit(Events.DUAL_TRANSMISSION_VIOLATION, {
          satelliteNoradId: satId,
          groundStation1Id: transmittingStations[0],
          groundStation2Id: transmittingStations[1],
          detectedAt: Date.now(),
        });

        return; // Only emit once
      }
    }
  }

  /**
   * Disable transmission on a ground station (turn off HPA, mute BUC)
   * Order: HPA off first, then BUC mute
   */
  private disableTransmission_(groundStationId: string): void {
    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find(g => g.state.id === groundStationId);
    if (!gs) return;

    const rfFrontEnd = gs.rfFrontEnds[0];
    if (!rfFrontEnd) return;

    // Turn off HPA first
    if (rfFrontEnd.hpaModule.state.isHpaEnabled) {
      rfFrontEnd.hpaModule.handleHpaToggle();
    }

    // Then mute BUC
    if (!rfFrontEnd.bucModule.state.isMuted) {
      rfFrontEnd.bucModule.handleMuteToggle(true);
    }
  }

  /**
   * Enable transmission on a ground station (unmute BUC, turn on HPA)
   * Order: BUC unmute first, then HPA on (order matters for signal chain)
   */
  private enableTransmission_(groundStationId: string): void {
    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find(g => g.state.id === groundStationId);
    if (!gs) return;

    const rfFrontEnd = gs.rfFrontEnds[0];
    if (!rfFrontEnd) return;

    // Unmute BUC first
    if (rfFrontEnd.bucModule.state.isMuted) {
      rfFrontEnd.bucModule.handleMuteToggle(false);
    }

    // Then turn on HPA
    if (!rfFrontEnd.hpaModule.state.isHpaEnabled) {
      rfFrontEnd.hpaModule.state.isHpaSwitchEnabled = false; // Ensure switch is off before toggling
      rfFrontEnd.hpaModule.handleHpaToggle();
    }
  }

  /** Main update loop - monitors link quality during handover */
  private update_(): void {
    // Check for dual transmission violation (causes scenario failure)
    this.checkDualTransmission_();

    // Monitor link margins during handover
    for (const [satId, ownership] of this.trafficOwnership_) {
      if (!ownership.isHandoverInProgress) continue;
      if (!ownership.handoverTargetStationId) continue;

      // Auto-update target station readiness based on link quality
      const targetReadiness = this.checkStationReadiness(
        ownership.handoverTargetStationId,
        satId
      );

      // Update readiness state
      if (targetReadiness.isReady !== ownership.targetStationReady) {
        this.setStationReady(satId, ownership.handoverTargetStationId, targetReadiness.isReady);
      }
    }
  }

  /** Get all satellites with traffic ownership tracking */
  getTrackedSatellites(): number[] {
    return Array.from(this.trafficOwnership_.keys());
  }
}
