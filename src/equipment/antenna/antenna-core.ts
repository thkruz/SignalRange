import { AlarmStatus, BaseEquipment } from '@app/equipment/base-equipment';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { type ObserverGeometry, type OrbitalObserver, OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Transmitter } from '@app/equipment/transmitter/transmitter';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { InterferenceManager } from '@app/interference/interference-manager';
import { SignalOrigin } from '@app/signal-origin';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { dB, dBm, Hertz, RfSignal } from '@app/types';
import { Degrees } from 'ootk';
import { ANTENNA_CONFIG_KEYS } from './antenna-config-keys';
import { AntennaConfig } from './antenna-configs';
import { type AntennaConfigId, AntennaRegistry } from './antenna-registry';
import { StepTrackController } from './step-track-controller';

/** A satellite's geometry and downlink as seen from one antenna's station. */
export interface SatelliteView {
  az: Degrees;
  el: Degrees;
  rangeKm: number | null;
  predictedAz: Degrees;
  predictedEl: Degrees;
  txSignal: RfSignal[];
}

/**
 * RF Propagation constants for GEO satellite communications
 */
const GEO_SATELLITE_DISTANCE_KM = 38000; // Approximate slant range to GEO satellite (km)

/**
 * ACU Tracking Modes
 * - stow: Safe storage position (Az=0°, El=90°)
 * - maintenance: Feed access position (El=5°)
 * - manual: Operator controls Az/El/Pol directly
 * - program-track: Continuously follow TLE ephemeris with optional step-track optimization
 *
 * Note: Step-track is NOT a separate mode. It's an optimization layer that applies
 * small az/el offsets on top of program-track to maximize beacon signal strength.
 * Enable step-track via isStepTrackEnabled when in program-track mode.
 */
export type TrackingMode = 'stow' | 'maintenance' | 'manual' | 'program-track';

export interface AntennaState {
  /** Current pointing elevation angle */
  elevation: Degrees;
  /** Current pointing azimuth angle without normalization */
  azimuth: Degrees;
  /** Is antenna powered on */
  isPowered: boolean;
  /** Which antenna is this */
  uuid: string;
  /** If there are multiple teams, which team is this antenna part of */
  teamId: number;
  /** Which server is this antenna connected to */
  serverId: number;
  /** Antenna skew between -90 and 90 degrees */
  polarization: Degrees;
  /**
   * Feed handedness for circular-pol antennas with a switchable feed (e.g. a
   * crossed yagi). Opt-in: when undefined the legacy circular-pol behavior
   * applies (any circular signal treated as matched).
   */
  circularHandedness?: 'LHCP' | 'RHCP';
  /** is loopback enabled */
  isLoopback: boolean;
  /** is antenna locked on a satellite */
  isLocked: boolean;
  /** is auto-tracking switch up */
  isAutoTrackSwitchUp: boolean;
  /** is auto-tracking enabled */
  isAutoTrackEnabled: boolean;
  /** is antenna operational */
  isOperational: boolean;
  /** signals currently received */
  rxSignalsIn: RfSignal[];
  /** RF metrics for display (optional, computed on demand) */
  rfMetrics?: {
    gain_dBi: number;
    beamwidth_deg: number;
    gOverT_dBK: number;
    polLoss_dB: number;
    atmosLoss_dB: number;
    skyTemp_K: number;
    frequency_GHz: number;
    /** EIRP in dBW when transmitting (undefined when not transmitting) */
    eirp_dBW?: number;
  };

  // === ACU Tracking Mode ===
  /** Current tracking mode */
  trackingMode: TrackingMode;
  /** Target satellite NORAD ID for program track */
  targetSatelliteId: number | null;

  // === Beacon Tracking ===
  /** Beacon frequency in Hz */
  beaconFrequencyHz: number;
  /** Beacon search bandwidth in Hz (where to LOOK for the beacon - wider) */
  beaconSearchBwHz: number;
  /** Beacon tracking bandwidth in Hz (beacon receiver integration bandwidth for C/N - narrow) */
  beaconTrackingBwHz: number;
  /** Current beacon power measurement in dBm, null if not tracking */
  beaconPower: number | null;
  /** Current beacon C/N ratio in dB, null if not tracking */
  beaconCN: number | null;
  /** Is beacon locked */
  isBeaconLocked: boolean;

  // === Step-Track Optimization (within program-track mode) ===
  /** Is step-track optimization enabled (only applies in program-track mode) */
  isStepTrackEnabled: boolean;
  /** Step-track azimuth offset from program-track predicted position (degrees) */
  stepTrackAzOffset: Degrees;
  /** Step-track elevation offset from program-track predicted position (degrees) */
  stepTrackElOffset: Degrees;

  // === Environmental Controls ===
  /** Is feed heater enabled */
  isHeaterEnabled: boolean;
  /** Is rain blower enabled */
  isRainBlowerEnabled: boolean;
  /** Is precipitation detected (read-only sensor) */
  precipitationDetected: boolean;
  /** Ice accumulation on feed horn in dB (0 = no ice) */
  iceAccumulation_dB: number;
  /** Elevated sky-noise degradation in dB on the receive path (e.g., sun transit). 0 = nominal sky. */
  skyNoiseDegradation_dB: number;
  /**
   * Rain rate over the site in mm/h (WeatherManager rain/storm events). The
   * antenna turns it into a frequency- and elevation-dependent path loss, so
   * Ku/Ka links fade in rain and C-band barely notices. 0 = dry.
   */
  rainRate_mmh: number;
  /** ACU automation controller fault: program-track, step-track, and target
   *  slewing are unavailable; manual/stow/maintenance servo control still works. */
  isAcuAutomationFaulted: boolean;

  // === ACU Identification ===
  /** ACU model number */
  acuModel: string;
  /** ACU serial number */
  acuSerialNumber: string;

  // === Target Position (for slew simulation) ===
  /** Target azimuth - antenna slews toward this */
  targetAzimuth: Degrees;
  /** Target elevation - antenna slews toward this */
  targetElevation: Degrees;
  /** Target polarization - antenna slews toward this */
  targetPolarization: Degrees;
  /** Is antenna currently slewing (actual != target) */
  isSlewing: boolean;

  // === Staged Changes (pending Apply button) ===
  /** Staged target azimuth - pending user approval */
  stagedTargetAzimuth: Degrees | null;
  /** Staged target elevation - pending user approval */
  stagedTargetElevation: Degrees | null;
  /** Staged target polarization - pending user approval */
  stagedTargetPolarization: Degrees | null;
  /** Staged beacon frequency - pending user approval */
  stagedBeaconFrequencyHz: number | null;
  /** Staged beacon search bandwidth - pending user approval */
  stagedBeaconSearchBwHz: number | null;
  /** Are there pending changes to apply */
  hasStagedChanges: boolean;

  // === Fault State ===
  /** Has a fault condition */
  hasFault: boolean;
  /** Fault message for display */
  faultMessage: string | null;
}

/**
 * AntennaCore - Abstract base class for antenna implementations
 * Contains all business logic: RF physics, state management, signal processing
 * UI implementations extend this class and implement DOM-specific methods
 */
export abstract class AntennaCore extends BaseEquipment {
  /** ITU-R P.838-3 rain coefficients (H pol) sampled at these frequencies, GHz */
  private static readonly RAIN_COEFF_F_GHZ = [1, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40];
  private static readonly RAIN_COEFF_K = [0.0000387, 0.000154, 0.00065, 0.00175, 0.00454, 0.0101, 0.0188, 0.0367, 0.0751, 0.124, 0.187, 0.35];
  private static readonly RAIN_COEFF_ALPHA = [0.912, 0.963, 1.121, 1.308, 1.327, 1.276, 1.217, 1.154, 1.099, 1.061, 1.021, 0.939];
  /** Mean rain height above the station for the mid/high-latitude sites in play, km */
  private static readonly RAIN_HEIGHT_KM = 2.5;
  /** Representative frequency per band for the rain-fade alarm */
  private static readonly BAND_CENTRE_HZ: Record<string, number> = { VHF: 0.15e9, UHF: 0.44e9, L: 1.5e9, S: 2.2e9, C: 4e9, X: 7.5e9, Ku: 12e9, Ka: 20e9, Q: 40e9, V: 40e9 };

  /** Current antenna state */
  state: AntennaState;
  protected lastRenderState: AntennaState;
  protected rfFrontEnd_: RFFrontEndCore | null = null;

  /**
   * WGS-84 location of the station this antenna belongs to. Attached by
   * GroundStation; required only for terrestrial-emitter reception (E1) -
   * without it the antenna simply hears no ground emitters, as before.
   */
  protected stationLocation_: { latitude: number; longitude: number; elevationM: number } | null = null;
  /** Same location as an orbital observer; null until the station attaches */
  protected stationObserver_: OrbitalObserver | null = null;

  /**
   * Uplink signalIds this antenna pushed onto each satellite last frame
   * (fixed-gain TX path only). Lets updateTxSignals_ remove exactly its own
   * stale signals when a satellite leaves the beam, without touching other
   * stations' uplinks or injected interference.
   */
  private readonly txFedSignalIds_ = new Map<number, Set<string>>();

  /** Get the attached RF front-end (for signal path calculations) */
  get rfFrontEnd(): RFFrontEndCore | null {
    return this.rfFrontEnd_;
  }

  transmitters: Transmitter[] = [];

  /** Antenna physical configuration */
  config: AntennaConfig;

  /**
   * A clock jump this much beyond the frame time is a time skip (operator
   * skip, checkpoint restore, E2E hook), not a slow frame.
   */
  private static readonly SKIP_DETECT_MS = 250;
  /** Simulated time at the last update, to detect clock jumps. */
  private lastSimNowMs_: number | null = null;
  /**
   * Skipped simulated time the pedestal still has to spend slewing (ms). A
   * program-track pedestal was tracking for the whole of a skip, so it must
   * arrive with the bird rather than chase it at the rate limit afterwards.
   * Carried for two frames: satellites and antennas share the update event,
   * so the target may only move after this antenna's own jump-frame update.
   */
  private skipSlewBudgetMs_ = 0;
  private skipSlewFramesLeft_ = 0;

  /** Tolerance for program-track lock detection (degrees) */
  private static readonly LOCK_TOLERANCE_DEG = 1.5;

  /** Timeout ID for lock acquisition to prevent memory leaks */
  private lockAcquisitionTimeout_: number | null = null;

  /** Step track controller for beacon signal maximization */
  protected stepTrackController_: StepTrackController;

  /** Smoothed C/N for beacon display (EMA) */
  private smoothedBeaconCN_: number | null = null;

  /** Whether we've received at least one real beacon measurement (vs initial state value) */
  private hasReceivedRealBeaconMeasurement_: boolean = false;

  /** Smoothing factor for beacon C/N display */
  private readonly beaconCNSmoothingAlpha_: number = 0.3;

  /** C/N threshold to acquire beacon lock */
  private readonly beaconLockAcquireCN_: number = 6.5;

  constructor(configId: AntennaConfigId = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, initialState: Partial<AntennaState> = {}, teamId: number = 1, serverId: number = 1) {
    super(teamId);

    // Set antenna configuration. Resolved through the registry so plugin
    // antennas work everywhere a built-in does.
    this.config = AntennaRegistry.getInstance().get(configId);

    // Initialize state with defaults
    this.state = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,
      polarization: 0 as Degrees,
      elevation: 0 as Degrees,
      azimuth: 0 as Degrees,
      isLoopback: false,
      isLocked: false,
      isAutoTrackSwitchUp: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      isPowered: true,
      rxSignalsIn: [],
      // ACU Tracking Mode
      trackingMode: 'manual',
      targetSatelliteId: null,
      // Beacon Tracking
      beaconFrequencyHz: 3_948_000_000, // Default 3.948 GHz C-band beacon
      beaconSearchBwHz: 500_000, // Default 500 kHz search bandwidth
      beaconTrackingBwHz: 1_000, // Default 25 kHz tracking bandwidth (typical CW beacon)
      beaconPower: null,
      beaconCN: null,
      isBeaconLocked: false,
      // Step-Track Optimization
      isStepTrackEnabled: false,
      stepTrackAzOffset: 0 as Degrees,
      stepTrackElOffset: 0 as Degrees,
      // Environmental Controls
      isHeaterEnabled: false,
      isRainBlowerEnabled: false,
      precipitationDetected: false,
      iceAccumulation_dB: 0,
      skyNoiseDegradation_dB: 0,
      rainRate_mmh: 0,
      isAcuAutomationFaulted: false,
      // ACU Identification
      acuModel: this.config.acuModel ?? 'Kratos NGC-2200',
      acuSerialNumber: this.config.acuSerialNumber ?? 'ACU-01',
      // Target Position (for slew simulation)
      targetAzimuth: 0 as Degrees,
      targetElevation: 0 as Degrees,
      targetPolarization: 0 as Degrees,
      isSlewing: false,
      // Staged Changes (pending Apply button)
      stagedTargetAzimuth: null,
      stagedTargetElevation: null,
      stagedTargetPolarization: null,
      stagedBeaconFrequencyHz: null,
      stagedBeaconSearchBwHz: null,
      hasStagedChanges: false,
      // Fault State
      hasFault: false,
      faultMessage: null,
    };
    // Override with any provided initial state
    this.state = { ...this.state, ...initialState };

    // In manual mode, ensure targets match actual position to prevent unintended slewing
    // This handles cases where initialState provides position without matching targets
    if (this.state.trackingMode === 'manual') {
      this.state.targetAzimuth = this.state.azimuth;
      this.state.targetElevation = this.state.elevation;
      this.state.targetPolarization = this.state.polarization;
    }

    this.lastRenderState = structuredClone(this.state);

    // Seed beacon smoother from initial state if provided
    // This preserves scenario-defined beaconCN until real measurements take over
    if (this.state.beaconCN !== null) {
      this.smoothedBeaconCN_ = this.state.beaconCN;
    }

    // Initialize step track controller
    this.stepTrackController_ = new StepTrackController(this);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().on(Events.DRAW, this.draw.bind(this));
  }

  set configId(configId: AntennaConfigId) {
    this.config = AntennaRegistry.getInstance().get(configId);
  }

  // ========================================================================
  // ABSTRACT UI METHODS - Must be implemented by UI classes
  // ========================================================================

  /**
   * Initialize DOM elements for the antenna UI
   * Must be implemented by UI subclasses
   */
  protected initializeDom(parentId: string): HTMLElement {
    return super.initializeDom(parentId);
  }

  /**
   * Add event listeners to UI components
   * Must be implemented by UI subclasses
   */
  protected abstract override addListeners_(): void;

  /**
   * Sync DOM with current state
   * Must be implemented by UI subclasses
   */
  abstract syncDomWithState(): void;

  /**
   * Draw visual elements (e.g., polar plot)
   * Must be implemented by UI subclasses
   */
  abstract draw(): void;

  // ========================================================================
  // LIFECYCLE METHODS
  // ========================================================================

  protected initialize_(): void {
    // Start in operational state
    this.updateSignals_();
    this.syncDomWithState();
  }

  update(dtMs?: number): void {
    this.noteClockJump_(dtMs);

    // ACU automation fault: the automation processor (program-track,
    // step-track, lock logic) is offline. Servos and manual control still
    // work - updateSlew_ keeps running so manual/stow/maintenance moves do.
    const automationAvailable = !this.state.isAcuAutomationFaulted;

    // Update program-track position continuously when tracking a satellite
    // This is the base tracking - always follows ephemeris
    if (automationAvailable && this.state.trackingMode === 'program-track' && this.state.targetSatelliteId !== null && this.state.isPowered && this.state.isOperational) {
      this.updateProgramTrackPosition_();
    }

    // Update step-track controller if step-track optimization is enabled (within program-track)
    if (automationAvailable && this.state.isStepTrackEnabled && this.state.isPowered && this.state.isOperational) {
      this.stepTrackController_.update();
    }

    // Slew actual position toward target at maxRate_deg_s
    this.updateSlew_(dtMs);

    // Check for program-track lock whenever a target is being tracked. The
    // tolerance test decides, not the slew flag: a LEO tracker is slewing for
    // the whole pass (the target moves every second), so gating on !isSlewing
    // meant a moving bird could never read LOCKED (phase 16).
    if (automationAvailable && this.state.trackingMode === 'program-track' && this.state.targetSatelliteId !== null) {
      this.checkProgramTrackLock_();
    }

    // Update beacon metrics for all modes
    // Step-track controller handles its own beacon measurement with specialized smoothing,
    // but we still update the display metrics here
    this.updateBeaconMetrics_();

    this.updateSignals_();
    this.computeRfMetrics_();
    this.syncDomWithState();
  }

  /** Bank any simulated time that jumped past this frame as slew budget. */
  private noteClockJump_(dtMs?: number): void {
    const simNow = getSimulatedNowMs();
    if (this.lastSimNowMs_ !== null) {
      const simDeltaMs = simNow - this.lastSimNowMs_;
      const frameMs = dtMs !== undefined && Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 1000 / 60;
      if (simDeltaMs > frameMs + AntennaCore.SKIP_DETECT_MS) {
        this.skipSlewBudgetMs_ += simDeltaMs;
        this.skipSlewFramesLeft_ = 2;
      }
    }
    this.lastSimNowMs_ = simNow;
  }

  /**
   * Update slew - move actual position toward target at configured slew rate
   * Called each update cycle to simulate mechanical antenna movement
   */
  private updateSlew_(dtMs?: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }

    // Get slew rate from config (default 3°/s if not specified)
    const maxRate = this.config.maxRate_deg_s ?? 3.0;
    // Real frame time when the simulation loop supplies it: the clock and the
    // satellites advanced by the same dt, so the pedestal must too, or one
    // long frame leaves it a degree behind a LEO target and off-beam for the
    // frames it takes to catch up. Assume 60 Hz when called without one
    // (tests and direct callers); cap a stalled tab at a few seconds.
    let dt = dtMs !== undefined && Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, 5000) / 1000 : 1 / 60;
    if (this.skipSlewFramesLeft_ > 0) {
      dt += this.skipSlewBudgetMs_ / 1000; // the skip's worth of tracking, spent now
      this.skipSlewFramesLeft_ -= 1;
      if (this.skipSlewFramesLeft_ === 0) {
        this.skipSlewBudgetMs_ = 0;
      }
    }
    const maxDelta = maxRate * dt;

    let isMoving = false;

    // Slew azimuth
    const azDiff = this.state.targetAzimuth - this.state.azimuth;
    if (Math.abs(azDiff) > 0.001) {
      const azStep = Math.sign(azDiff) * Math.min(Math.abs(azDiff), maxDelta);
      this.state.azimuth = (this.state.azimuth + azStep) as Degrees;
      isMoving = true;
    }

    // Slew elevation
    const elDiff = this.state.targetElevation - this.state.elevation;
    if (Math.abs(elDiff) > 0.001) {
      const elStep = Math.sign(elDiff) * Math.min(Math.abs(elDiff), maxDelta);
      this.state.elevation = (this.state.elevation + elStep) as Degrees;
      isMoving = true;
    }

    // Slew polarization (typically faster than main axes)
    const polDiff = this.state.targetPolarization - this.state.polarization;
    if (Math.abs(polDiff) > 0.001) {
      const polStep = Math.sign(polDiff) * Math.min(Math.abs(polDiff), maxDelta * 2);
      this.state.polarization = (this.state.polarization + polStep) as Degrees;
      isMoving = true;
    }

    // Update slewing flag
    this.state.isSlewing = isMoving;
  }

  /**
   * Check if antenna is locked on target satellite in program-track mode.
   * Sets isLocked = true when within tolerance, false otherwise.
   */
  private checkProgramTrackLock_(): void {
    // targetSatelliteId is guaranteed non-null by caller check
    const sat = SimulationManager.getInstance().getSatByNoradId(this.state.targetSatelliteId!);
    if (!sat) {
      if (this.state.isLocked) {
        this.state.isLocked = false;
        this.notifyStateChange_();
      }
      return;
    }

    const view = this.satView_(sat);
    // Shortest-path slews leave state.azimuth outside 0-360 (a pass through
    // north reads -138 for 222), so compare on the circle, not the number line.
    let azDiff = Math.abs(this.normalizedAzimuth - view.az);
    if (azDiff > 180) {
      azDiff = 360 - azDiff;
    }
    const elDiff = Math.abs(this.state.elevation - view.el);
    const withinTolerance = azDiff <= AntennaCore.LOCK_TOLERANCE_DEG && elDiff <= AntennaCore.LOCK_TOLERANCE_DEG;

    if (withinTolerance && !this.state.isLocked) {
      this.state.isLocked = true;
      this.notifyStateChange_();
    } else if (!withinTolerance && this.state.isLocked) {
      this.state.isLocked = false;
      this.notifyStateChange_();
    }
  }

  /**
   * Update antenna target position continuously based on satellite ephemeris.
   * Called every update cycle when in program-track mode with a target satellite.
   * If step-track optimization is enabled, applies az/el offsets on top of predicted position.
   */
  private updateProgramTrackPosition_(): void {
    const sat = SimulationManager.getInstance().getSatByNoradId(this.state.targetSatelliteId!);
    if (!sat) {
      return;
    }

    // Use PREDICTED position (includes ephemeris error from TLE inaccuracy)
    // The beacon signal comes from the TRUE position (sat.az, sat.el),
    // but program-track points to where TLE predicts the satellite to be.
    const view = this.satView_(sat);
    let targetAz = view.predictedAz as number;
    let targetEl = view.predictedEl as number;

    // Step-track offsets correct the ephemeris error by finding the beacon peak
    if (this.state.isStepTrackEnabled) {
      targetAz += this.state.stepTrackAzOffset as number;
      targetEl += this.state.stepTrackElOffset as number;
    }

    // Clamp elevation to valid range
    targetEl = Math.max(0, Math.min(90, targetEl));

    // Use shortest path calculation for azimuth to avoid long slews
    this.state.targetAzimuth = this.calculateShortestPathTarget_(this.state.azimuth, targetAz as Degrees);
    this.state.targetElevation = targetEl as Degrees;
  }

  sync(data: Partial<AntennaState>): void {
    this.state = { ...this.state, ...data };
    this.updateSignals_();
    this.computeRfMetrics_();
    this.notifyStateChange_();
    this.syncDomWithState();
  }

  // ========================================================================
  // HANDLERS FOR UI CLASSES AND ADAPTERS
  // ========================================================================

  handlePolarizationChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    this.state.polarization = value as Degrees;
    this.notifyStateChange_();
  }

  handleCircularHandednessChange(handedness: 'LHCP' | 'RHCP'): void {
    if (!this.state.isPowered) {
      return;
    }
    this.state.circularHandedness = handedness;
    this.notifyStateChange_();
  }

  handleAzimuthChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    if (value !== this.state.azimuth) {
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.state.azimuth = value as Degrees;
      // In manual mode, keep target in sync to prevent unintended slew-back
      if (this.state.trackingMode === 'manual') {
        this.state.targetAzimuth = value as Degrees;
      }
      this.notifyStateChange_();
    }
  }

  handleElevationChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    if (value !== this.state.elevation) {
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.state.elevation = value as Degrees;
      // In manual mode, keep target in sync to prevent unintended slew-back
      if (this.state.trackingMode === 'manual') {
        this.state.targetElevation = value as Degrees;
      }
      this.notifyStateChange_();
    }
  }

  handleLoopbackToggle(isSwitchUp: boolean): void {
    if (!this.state.isOperational || !this.state.isPowered) {
      return;
    }

    this.state.isLoopback = isSwitchUp;

    this.notifyStateChange_();

    this.updateSignals_();
    this.syncDomWithState();
  }

  handleAutoTrackToggle(isSwitchUp: boolean): void {
    if (!this.state.isOperational || !this.state.isPowered) {
      return;
    }

    // Clear any existing timeout to prevent memory leaks
    if (this.lockAcquisitionTimeout_) {
      clearTimeout(this.lockAcquisitionTimeout_);
      this.lockAcquisitionTimeout_ = null;
    }

    this.state.isAutoTrackSwitchUp = isSwitchUp;
    this.state.isAutoTrackEnabled = isSwitchUp;
    const sim = SimulationManager.getInstance();
    // With a station attached, look at the sky from THIS site (two stations see
    // one LEO at different az/el); otherwise keep the canonical coarse lookup.
    const sats = this.stationObserver_
      ? sim.satellites.filter((sat) => {
          const view = this.satView_(sat);
          return Math.abs(view.az - this.normalizedAzimuth) <= 2 && Math.abs(view.el - this.state.elevation) <= 2;
        })
      : sim.getSatsByAzEl(this.normalizedAzimuth, this.state.elevation);
    const strongestSignal = sats.flatMap((sat) => this.satView_(sat).txSignal).reduce((prev, curr) => (prev.power > curr.power ? prev : curr), { power: -Infinity } as RfSignal);

    // hardcoded threshold for lock acquisition - TODO: make configurable
    const LOCK_THRESHOLD_DBM = -100;

    if (isSwitchUp && strongestSignal.power > LOCK_THRESHOLD_DBM) {
      const sat = SimulationManager.getInstance().getSatByNoradId(strongestSignal.noradId);
      const view = this.satView_(sat);

      // Set target position - actual position will slew in update loop
      // Use shortest path calculation to avoid rotating the long way around
      this.state.targetAzimuth = this.calculateShortestPathTarget_(this.state.azimuth, view.az);
      this.state.targetElevation = view.el;

      // Simulate lock acquisition delay with timeout tracking
      this.lockAcquisitionTimeout_ = window.setTimeout(() => {
        this.state.isLocked = true;
        this.lockAcquisitionTimeout_ = null;
        this.updateSignals_();
        this.notifyStateChange_();
        this.syncDomWithState();
      }, 3000); // 3 second delay to acquire lock
    } else {
      this.state.isAutoTrackEnabled = false;
      this.state.isLocked = false;
    }

    this.updateSignals_();
    this.notifyStateChange_();
    this.syncDomWithState();
  }

  handlePowerToggle(isPowered?: boolean): void {
    this.state.isPowered = isPowered ?? !this.state.isPowered;

    // Clear lock acquisition timeout when powering off
    if (!this.state.isPowered && this.lockAcquisitionTimeout_) {
      clearTimeout(this.lockAcquisitionTimeout_);
      this.lockAcquisitionTimeout_ = null;
    }

    // If turning off, also turn off track and locked
    if (this.state.isPowered) {
      // If turning on, ensure operational
      setTimeout(() => {
        this.state.isOperational = true;
        this.notifyStateChange_();
        this.updateSignals_();
        this.syncDomWithState();
      }, 3000); // 3 second power-up delay
    } else {
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.state.trackingMode = 'manual';
      // Sync targets to prevent movement when power is restored
      this.state.targetAzimuth = this.state.azimuth;
      this.state.targetElevation = this.state.elevation;
      this.state.targetPolarization = this.state.polarization;
      this.state.stagedTargetAzimuth = null;
      this.state.stagedTargetElevation = null;
      this.state.stagedTargetPolarization = null;
      this.state.hasStagedChanges = false;
      this.notifyStateChange_();
      this.updateSignals_();
      this.syncDomWithState();
    }
  }

  // ========================================================================
  // TRACKING MODE HANDLERS
  // ========================================================================

  /**
   * Handle tracking mode change
   * Stow: Move to Az=0°, El=90° (safe storage)
   * Maintenance: Move to El=5° for feed access
   * Manual: Operator controls Az/El/Pol directly
   * Program Track: Continuously follow TLE ephemeris (with optional step-track optimization)
   */
  handleTrackingModeChange(mode: TrackingMode): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }

    // Clear any existing lock acquisition timeout
    if (this.lockAcquisitionTimeout_) {
      clearTimeout(this.lockAcquisitionTimeout_);
      this.lockAcquisitionTimeout_ = null;
    }

    // Stop step-track controller if step-track was enabled
    if (this.state.isStepTrackEnabled) {
      this.stepTrackController_.stop();
    }

    this.state.trackingMode = mode;

    // Reset tracking state when changing modes
    this.state.isLocked = false;
    this.state.isBeaconLocked = false;
    this.state.isAutoTrackEnabled = false;
    this.state.isAutoTrackSwitchUp = false;
    this.state.beaconPower = null;
    this.state.beaconCN = null;
    this.smoothedBeaconCN_ = null;
    this.state.targetSatelliteId = null;

    // Clear step-track optimization state
    this.state.isStepTrackEnabled = false;
    this.state.stepTrackAzOffset = 0 as Degrees;
    this.state.stepTrackElOffset = 0 as Degrees;

    switch (mode) {
      case 'stow':
        // Stage target to safe storage position (Az=0°, El=90°)
        // Requires Apply button before antenna moves
        this.state.stagedTargetAzimuth = 0 as Degrees;
        this.state.stagedTargetElevation = 90 as Degrees;
        this.state.hasStagedChanges = true;
        break;

      case 'maintenance':
        // Stage target to maintenance position (low elevation for feed access)
        // Requires Apply button before antenna moves
        this.state.stagedTargetElevation = 5 as Degrees;
        this.state.hasStagedChanges = true;
        break;

      case 'manual':
      case 'program-track':
        // Set target to current position to prevent unintended movement
        // Clear any staged position changes from previous modes (e.g., stow → manual)
        this.state.targetAzimuth = this.state.azimuth;
        this.state.targetElevation = this.state.elevation;
        this.state.targetPolarization = this.state.polarization;
        this.state.stagedTargetAzimuth = null;
        this.state.stagedTargetElevation = null;
        this.state.stagedTargetPolarization = null;
        this.state.hasStagedChanges = false;
        break;
    }

    this.updateSignals_();
    this.notifyStateChange_();
    this.syncDomWithState();
  }

  /**
   * Set target satellite for program track mode
   * Also sets beacon frequency from the satellite's transponder configuration
   */
  handleTargetSatelliteChange(noradId: number | null): void {
    this.state.targetSatelliteId = noradId;

    // Set beacon frequency from satellite's transponder beacon (if available)
    if (noradId !== null) {
      const sat = SimulationManager.getInstance().getSatByNoradId(noradId);
      const beacon = sat?.transponders[0]?.beacon;
      if (beacon?.frequency) {
        this.state.beaconFrequencyHz = beacon.frequency as number;
      }
    }

    this.notifyStateChange_();
  }

  /**
   * Move antenna to target satellite position (for program track)
   */
  moveToTargetSatellite(): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.targetSatelliteId === null) {
      return;
    }
    this.moveToTargetSatellite_();
  }

  private moveToTargetSatellite_(): void {
    if (this.state.targetSatelliteId === null) {
      return;
    }
    const sat = SimulationManager.getInstance().getSatByNoradId(this.state.targetSatelliteId);
    if (!sat) {
      return;
    }

    // Set target position - actual position will slew in update loop
    // Use shortest path calculation to avoid rotating the long way around
    const view = this.satView_(sat);
    this.state.targetAzimuth = this.calculateShortestPathTarget_(this.state.azimuth, view.az);
    this.state.targetElevation = view.el;

    // Set beacon frequency from satellite's transponder beacon (if available)
    const beacon = sat.transponders[0]?.beacon;
    if (beacon?.frequency) {
      this.state.beaconFrequencyHz = beacon.frequency as number;
    }

    this.updateSignals_();
    this.notifyStateChange_();
    this.syncDomWithState();
  }

  // ========================================================================
  // BEACON TRACKING HANDLERS
  // ========================================================================

  handleBeaconFrequencyChange(frequencyHz: number): void {
    this.state.beaconFrequencyHz = frequencyHz;
    this.notifyStateChange_();
  }

  handleBeaconSearchBwChange(bandwidthHz: number): void {
    this.state.beaconSearchBwHz = bandwidthHz;
    this.notifyStateChange_();
  }

  /**
   * Measure beacon metrics and update state
   * Called on each update cycle when antenna is powered and in active mode
   * This is mode-independent - works in manual, program-track, and step-track
   */
  updateBeaconMetrics_(): void {
    // Only measure if powered and operational
    if (!this.state.isPowered || !this.state.isOperational) {
      this.state.beaconPower = null;
      this.state.beaconCN = null;
      this.smoothedBeaconCN_ = null;
      return;
    }

    // Measure beacon metrics
    const { power, cn } = this.measureBeaconMetrics_();

    // Update raw power state
    this.state.beaconPower = power;

    // Apply EMA smoothing to C/N for stable display
    if (cn !== null) {
      // Mark that we've received a real measurement (vs scenario-seeded initial value)
      this.hasReceivedRealBeaconMeasurement_ = true;

      if (this.smoothedBeaconCN_ === null) {
        this.smoothedBeaconCN_ = cn;
      } else {
        this.smoothedBeaconCN_ = this.beaconCNSmoothingAlpha_ * cn + (1 - this.beaconCNSmoothingAlpha_) * this.smoothedBeaconCN_;
      }
      this.state.beaconCN = this.smoothedBeaconCN_;

      // Update lock state based on C/N threshold (only when step-track is not enabled)
      // Step-track manages its own lock state with different thresholds
      if (!this.state.isStepTrackEnabled) {
        const wasLocked = this.state.isBeaconLocked;
        if (!wasLocked && this.smoothedBeaconCN_ >= this.beaconLockAcquireCN_) {
          this.state.isBeaconLocked = true;
        } else if (wasLocked && this.smoothedBeaconCN_ < this.beaconLockAcquireCN_) {
          this.state.isBeaconLocked = false;
        }
      }
    } else if (this.hasReceivedRealBeaconMeasurement_) {
      // Only clear if we've previously received real measurements
      // This preserves scenario-seeded initial values until real signals arrive
      this.smoothedBeaconCN_ = null;
      this.state.beaconCN = null;
      if (!this.state.isStepTrackEnabled) {
        this.state.isBeaconLocked = false;
      }
    }
    // If no measurement and no prior real measurements, preserve initial state values
  }

  /**
   * Measure current beacon power and C/N ratio
   * Filters received signals to find beacon within configured frequency range
   * @returns Object with power (dBm) and cn (dB), both null if no signal
   */
  private measureBeaconMetrics_(): { power: number | null; cn: number | null } {
    // Need RF front-end attached to measure beacon
    if (!this.rfFrontEnd_) {
      return { power: null, cn: null };
    }

    const beaconFreq = this.rfFrontEnd_.lnbModule.state.loFrequency * 1e6 - this.state.beaconFrequencyHz;
    const searchBw = this.state.beaconSearchBwHz;

    // Find signals within beacon search bandwidth (use AGC output for consistency with spectrum analyzer)
    const beaconSignals = this.rfFrontEnd_.agcModule.outputSignals.filter((sig) => {
      const freqDiff = Math.abs((sig.frequency as number) - beaconFreq);
      return freqDiff <= searchBw / 2;
    });

    if (beaconSignals.length === 0) {
      return { power: null, cn: null };
    }

    // Get strongest signal power in beacon range (includes full RX chain gain)
    const strongestPower = beaconSignals.reduce((max, sig) => Math.max(max, sig.power as number), -Infinity);

    if (strongestPower === -Infinity) {
      return { power: null, cn: null };
    }

    // Get noise floor using TRACKING bandwidth (narrow beacon receiver)
    const trackingBw = this.state.beaconTrackingBwHz;
    const { noiseFloorNoGain, shouldApplyGain } = this.rfFrontEnd_.couplerModule.signalPathManager.getNoiseFloorAt(TapPoint.RX_IF, trackingBw as Hertz);

    // Apply gain to noise floor to match signal reference frame
    const noiseFloor = shouldApplyGain ? noiseFloorNoGain + this.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain() : noiseFloorNoGain;

    // C/N = Signal Power - Noise Floor (both with full RX chain gain applied)
    const cn = strongestPower - noiseFloor;

    return { power: strongestPower, cn };
  }

  // ========================================================================
  // ENVIRONMENTAL CONTROL HANDLERS
  // ========================================================================

  handleHeaterToggle(enabled: boolean): void {
    if (!this.state.isPowered) {
      return;
    }
    this.state.isHeaterEnabled = enabled;
    this.notifyStateChange_();
  }

  handleRainBlowerToggle(enabled: boolean): void {
    if (!this.state.isPowered) {
      return;
    }
    this.state.isRainBlowerEnabled = enabled;
    this.notifyStateChange_();
  }

  /**
   * Update ice accumulation on the feed horn (called by WeatherManager)
   * @param degradation_dB - Current ice degradation in dB (0 = no ice)
   */
  updateIceAccumulation(degradation_dB: number): void {
    this.state.iceAccumulation_dB = degradation_dB;
    this.notifyStateChange_();
  }

  /**
   * Update elevated sky-noise degradation on the receive path (called by
   * WeatherManager for sun-transit events). RX-only: the uplink is unaffected.
   * @param degradation_dB - Current sky-noise degradation in dB (0 = nominal)
   */
  updateSkyNoiseDegradation(degradation_dB: number): void {
    this.state.skyNoiseDegradation_dB = degradation_dB;
    this.notifyStateChange_();
  }

  /**
   * Update the rain rate over the site (called by WeatherManager for rain and
   * storm events). Both link directions see the loss, at their own frequency.
   * @param rainRate_mmh - Rain rate in mm/h (0 = dry)
   */
  updateRainRate(rainRate_mmh: number): void {
    this.state.rainRate_mmh = Math.max(0, rainRate_mmh);
    this.notifyStateChange_();
  }

  /**
   * Rain attenuation (dB) along the current slant path at frequency `f_Hz`.
   *
   * ITU-R P.838 specific attenuation gamma = k * R^alpha (dB/km), coefficients
   * interpolated log-log over 1-40 GHz (horizontal polarisation, the worse
   * case), times an effective path length through a 2.5 km rain layer with the
   * P.618 horizontal reduction factor. Typical results: 25 mm/h at 12 GHz is
   * about 4 dB at 30 deg elevation and 8 dB at 10 deg; the same rain at 4 GHz
   * is a tenth of a dB, which is why Campaign 1's C-band links never cared.
   */
  rainAttenuation_dB(f_Hz: number, elevation_deg: number = this.state.elevation): number {
    const R = this.state.rainRate_mmh;
    if (!(R > 0)) {
      return 0;
    }

    const fGHz = Math.min(40, Math.max(1, f_Hz / 1e9));
    const F = AntennaCore.RAIN_COEFF_F_GHZ;
    let i = 0;
    while (i < F.length - 2 && fGHz > F[i + 1]) {
      i++;
    }
    const t = (Math.log(fGHz) - Math.log(F[i])) / (Math.log(F[i + 1]) - Math.log(F[i]));
    const k = Math.exp(Math.log(AntennaCore.RAIN_COEFF_K[i]) + t * (Math.log(AntennaCore.RAIN_COEFF_K[i + 1]) - Math.log(AntennaCore.RAIN_COEFF_K[i])));
    const alpha = AntennaCore.RAIN_COEFF_ALPHA[i] + t * (AntennaCore.RAIN_COEFF_ALPHA[i + 1] - AntennaCore.RAIN_COEFF_ALPHA[i]);
    const gamma_dB_km = k * R ** alpha;

    const elRad = (Math.max(5, elevation_deg) * Math.PI) / 180;
    const slantKm = AntennaCore.RAIN_HEIGHT_KM / Math.sin(elRad);
    const groundKm = slantKm * Math.cos(elRad);
    const reduction = 1 / (1 + groundKm / (35 * Math.exp(-0.015 * R)));

    return gamma_dB_km * slantKm * reduction;
  }

  /** Rain attenuation at this antenna's band centre and current elevation (for alarms and displays). */
  get rainAttenuationDb(): number {
    return this.rainAttenuation_dB(AntennaCore.BAND_CENTRE_HZ[this.config.band] ?? 12e9);
  }

  // ========================================================================
  // FINE ADJUSTMENT METHODS
  // ========================================================================

  /**
   * Adjust azimuth by delta degrees
   * Used by fine adjustment buttons (+/- 0.01, 1, 10 degrees)
   */
  adjustAzimuth(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'manual') {
      return; // Only allow in manual mode
    }
    const newValue = this.state.azimuth + delta;
    this.handleAzimuthChange(newValue);
  }

  /**
   * Adjust elevation by delta degrees
   * Used by fine adjustment buttons (+/- 0.01, 1, 10 degrees)
   */
  adjustElevation(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'manual') {
      return; // Only allow in manual mode
    }
    // Clamp elevation between 0 and 90 degrees
    const newValue = Math.max(0, Math.min(90, this.state.elevation + delta));
    this.handleElevationChange(newValue);
  }

  /**
   * Adjust polarization by delta degrees
   * Used by fine adjustment buttons (+/- 0.01, 1, 10 degrees)
   */
  adjustPolarization(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    // Clamp polarization between -90 and 90 degrees
    const newValue = Math.max(-90, Math.min(90, this.state.polarization + delta));
    this.handlePolarizationChange(newValue);
  }

  // ========================================================================
  // STAGED CHANGES METHODS (Apply Button Pattern)
  // ========================================================================

  /**
   * Stage azimuth change - does not apply until applyChanges() is called
   */
  stageAzimuthChange(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'manual') {
      return; // Only allow in manual mode
    }

    const base = this.state.stagedTargetAzimuth ?? this.state.targetAzimuth;
    let newAz = base + delta;

    // Normalize for continuous azimuth antennas
    if (this.config.azContinuous) {
      newAz = this.normalizeAzimuth_(newAz);
    }

    this.state.stagedTargetAzimuth = newAz as Degrees;
    this.state.hasStagedChanges = true;
    this.notifyStateChange_();
  }

  /**
   * Stage elevation change - does not apply until applyChanges() is called
   */
  stageElevationChange(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'manual') {
      return; // Only allow in manual mode
    }

    const base = this.state.stagedTargetElevation ?? this.state.targetElevation;
    // Clamp elevation between configured range or default 0-90
    const [minEl, maxEl] = this.config.elRange_deg ?? [0, 90];
    const newEl = Math.max(minEl, Math.min(maxEl, base + delta));

    this.state.stagedTargetElevation = newEl as Degrees;
    this.state.hasStagedChanges = true;
    this.notifyStateChange_();
  }

  /**
   * Stage polarization change - does not apply until applyChanges() is called
   */
  stagePolarizationChange(delta: number): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }

    const base = this.state.stagedTargetPolarization ?? this.state.targetPolarization;
    // Clamp polarization between -90 and 90 degrees
    const newPol = Math.max(-90, Math.min(90, base + delta));

    this.state.stagedTargetPolarization = newPol as Degrees;
    this.state.hasStagedChanges = true;
    this.notifyStateChange_();
  }

  /**
   * Stage beacon frequency change - does not apply until applyChanges() is called
   */
  stageBeaconFrequencyChange(frequencyHz: number): void {
    this.state.stagedBeaconFrequencyHz = frequencyHz;
    this.state.hasStagedChanges = true;
    this.notifyStateChange_();
  }

  /**
   * Stage beacon search bandwidth change - does not apply until applyChanges() is called
   */
  stageBeaconSearchBwChange(bandwidthHz: number): void {
    this.state.stagedBeaconSearchBwHz = bandwidthHz;
    this.state.hasStagedChanges = true;
    this.notifyStateChange_();
  }

  /**
   * Toggle step-track optimization on/off within program-track mode.
   * Step-track applies small az/el offsets on top of the program-track position
   * to maximize beacon signal strength.
   */
  handleStepTrackToggle(enabled: boolean): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'program-track') {
      return;
    }

    if (enabled) {
      this.startStepTrack();
    } else {
      this.stopStepTrack();
    }
  }

  /**
   * Start step tracking optimization - begins the hill-climbing algorithm.
   * Step-track applies small az/el offsets on top of the program-track position.
   * Should be called after beacon frequency is configured and in program-track mode.
   */
  startStepTrack(): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }
    if (this.state.trackingMode !== 'program-track') {
      return;
    }

    // Apply any staged beacon settings first
    if (this.state.stagedBeaconFrequencyHz !== null) {
      this.state.beaconFrequencyHz = this.state.stagedBeaconFrequencyHz;
      this.state.stagedBeaconFrequencyHz = null;
    }
    if (this.state.stagedBeaconSearchBwHz !== null) {
      this.state.beaconSearchBwHz = this.state.stagedBeaconSearchBwHz;
      this.state.stagedBeaconSearchBwHz = null;
    }
    this.state.hasStagedChanges = false;

    this.state.isStepTrackEnabled = true;
    this.stepTrackController_.start();
    this.state.isAutoTrackEnabled = true;
    this.state.isAutoTrackSwitchUp = true;
    this.notifyStateChange_();
  }

  /**
   * Stop step tracking optimization.
   * Clears the az/el offsets and returns to pure program-track following.
   */
  stopStepTrack(): void {
    this.stepTrackController_.stop();
    this.state.isStepTrackEnabled = false;
    this.state.stepTrackAzOffset = 0 as Degrees;
    this.state.stepTrackElOffset = 0 as Degrees;
    this.state.isAutoTrackEnabled = false;
    this.state.isAutoTrackSwitchUp = false;
    this.state.isBeaconLocked = false;
    this.notifyStateChange_();
  }

  /**
   * Clear step-track offsets without stopping the optimization.
   * Useful for resetting to the pure program-track position while keeping step-track active.
   */
  clearStepTrackOffsets(): void {
    this.state.stepTrackAzOffset = 0 as Degrees;
    this.state.stepTrackElOffset = 0 as Degrees;
    this.notifyStateChange_();
  }

  /**
   * Apply all staged changes
   * Validates limits before applying and triggers FAULT if exceeded
   */
  applyChanges(): void {
    if (!this.state.isPowered || !this.state.isOperational) {
      return;
    }

    // Clear any previous fault
    this.state.hasFault = false;
    this.state.faultMessage = null;

    // Apply staged azimuth with limit checking
    if (this.state.stagedTargetAzimuth !== null) {
      const az = this.state.stagedTargetAzimuth;

      // Check limits for non-continuous antennas
      if (!this.config.azContinuous) {
        const [minAz, maxAz] = this.config.azRange_deg ?? [-180, 540];
        if (az < minAz || az > maxAz) {
          // FAULT - azimuth limit exceeded
          this.state.hasFault = true;
          this.state.faultMessage = `Azimuth ${az.toFixed(1)}° exceeds limit [${minAz}°, ${maxAz}°]`;
          this.notifyStateChange_();
          return;
        }
      }

      this.state.targetAzimuth = az;
      this.state.stagedTargetAzimuth = null;

      // Break lock when moving in manual mode
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
    }

    // Apply staged elevation with limit checking
    if (this.state.stagedTargetElevation !== null) {
      const el = this.state.stagedTargetElevation;
      const [minEl, maxEl] = this.config.elRange_deg ?? [0, 90];

      if (el < minEl || el > maxEl) {
        // FAULT - elevation limit exceeded
        this.state.hasFault = true;
        this.state.faultMessage = `Elevation ${el.toFixed(1)}° exceeds limit [${minEl}°, ${maxEl}°]`;
        this.notifyStateChange_();
        return;
      }

      this.state.targetElevation = el;
      this.state.stagedTargetElevation = null;

      // Break lock when moving in manual mode
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
    }

    // Apply staged polarization
    if (this.state.stagedTargetPolarization !== null) {
      this.state.targetPolarization = this.state.stagedTargetPolarization;
      this.state.stagedTargetPolarization = null;
    }

    // Apply staged beacon frequency
    if (this.state.stagedBeaconFrequencyHz !== null) {
      this.state.beaconFrequencyHz = this.state.stagedBeaconFrequencyHz;
      this.state.stagedBeaconFrequencyHz = null;
    }

    // Apply staged beacon search bandwidth
    if (this.state.stagedBeaconSearchBwHz !== null) {
      this.state.beaconSearchBwHz = this.state.stagedBeaconSearchBwHz;
      this.state.stagedBeaconSearchBwHz = null;
    }

    this.state.hasStagedChanges = false;
    this.notifyStateChange_();
  }

  /**
   * Discard all staged changes without applying
   */
  discardChanges(): void {
    this.state.stagedTargetAzimuth = null;
    this.state.stagedTargetElevation = null;
    this.state.stagedTargetPolarization = null;
    this.state.stagedBeaconFrequencyHz = null;
    this.state.stagedBeaconSearchBwHz = null;
    this.state.hasStagedChanges = false;
    this.state.hasFault = false;
    this.state.faultMessage = null;
    this.notifyStateChange_();
  }

  /**
   * Normalize azimuth to 0-359.999° range
   * Used for continuous rotation antennas
   */
  private normalizeAzimuth_(az: number): number {
    return ((az % 360) + 360) % 360;
  }

  /**
   * Calculate target azimuth for shortest path rotation to a satellite
   * Returns a target that may be outside 0-360 range to ensure shortest rotation
   */
  private calculateShortestPathTarget_(currentAz: Degrees, satAz: Degrees): Degrees {
    const signedDiff = satAz - currentAz;
    // Normalize difference to [-180, 180] for shortest path
    const shortestDiff = signedDiff > 180 ? signedDiff - 360 : signedDiff < -180 ? signedDiff + 360 : signedDiff;
    return (currentAz + shortestDiff) as Degrees;
  }

  // ========================================================================
  // GETTERS
  // ========================================================================

  get normalizedAzimuth(): Degrees {
    // Normalize azimuth between 0 and 359.9999 degrees
    return (((this.state.azimuth % 360) + 360) % 360) as Degrees;
  }

  get txSignalsIn(): RfSignal[] {
    return this.rfFrontEnd_?.omtModule.txSignalsOut ?? [];
  }

  get txSignalsOut(): RfSignal[] {
    if (!this.rfFrontEnd_) {
      return [];
    }

    return this.rfFrontEnd_.omtModule.txSignalsOut.map((sig: RfSignal) => {
      const f_Hz = sig.frequency as number;

      // Calculate polarization mismatch loss using realistic model
      const polLoss = this.polMismatchLoss_dB_(
        sig.polarization as 'H' | 'V' | 'RHCP' | 'LHCP',
        this.config.polType ?? 'linear',
        Math.abs((sig.rotation ?? 0) - this.state.polarization) as Degrees
      );

      // Frequency-dependent feed loss + ice accumulation on feed horn + rain
      // on the uplink path (Ku/Ka uplinks fade harder than the downlink)
      const feedLoss = this.feedLossAt_(f_Hz) + this.state.iceAccumulation_dB + this.rainAttenuation_dB(f_Hz);

      // Antenna gain with Ruze + blockage
      const antennaGain = this.antennaGain_dBi(sig.frequency);

      // Calculate transmitted power
      const txPower = (sig.power - polLoss - feedLoss + antennaGain) as dBm;

      return {
        ...sig,
        power: txPower,
      };
    });
  }

  get rxSignals(): {
    sat: Satellite;
    signal: RfSignal;
    /** Satellite geometry as seen from this antenna's station */
    view: SatelliteView;
  }[] {
    const views = SimulationManager.getInstance()
      .satellites.map((sat) => ({ sat, view: this.satView_(sat) }))
      .filter(({ view }) => {
        if (Math.abs(view.az - this.normalizedAzimuth) <= 1 && Math.abs(view.el - this.state.elevation) <= 1) {
          return true;
        }

        // Wide-beam antennas (fixed gain model, Campaign 3+): accept satellites
        // out to one full HPBW off boresight, using true angular separation (the
        // planar box above breaks down near zenith). Off-axis loss is still
        // charged by the pattern model. Parabolic antennas (HPBW << 1 deg) keep
        // the legacy 1-degree box, so existing campaigns are unaffected.
        if (this.config.gainModel === 'fixed') {
          const sep = this.angularSeparationDeg_(view.az, view.el);
          return sep <= (this.config.fixedBeamwidth3dB_deg ?? 90);
        }

        return false;
      });

    return views.flatMap(({ sat, view }) =>
      view.txSignal.map((signal) => ({
        sat,
        signal,
        view,
      }))
    );
  }

  attachRfFrontEnd(rfFrontEnd: RFFrontEndCore): void {
    this.rfFrontEnd_ = rfFrontEnd;
  }

  /**
   * Give the antenna its station's geodetic position. Needed for terrestrial
   * emitter reception (E1, Campaign 3) and, for orbital satellites, to see the
   * sky from this site rather than from the satellite's canonical observer
   * (phase 16, multi-station LEO work).
   */
  attachStationLocation(latitude: number, longitude: number, elevationM = 0): void {
    this.stationLocation_ = { latitude, longitude, elevationM };
    this.stationObserver_ = observerFromLocation({ latitude, longitude, elevation: elevationM });
  }

  /**
   * A satellite as seen from THIS antenna. Orbital satellites are propagated
   * per observer once a station location is attached: two sites see one LEO at
   * different az/el/range/Doppler, and its signals rise and set on each site's
   * own horizon. Everything else (GEO, legacy telemetry, no station attached)
   * is the satellite's canonical view, unchanged.
   */
  protected satView_(sat: Satellite): SatelliteView {
    if (this.stationObserver_ && sat instanceof OrbitalSatellite) {
      const g: ObserverGeometry = sat.geometryFor(this.stationObserver_);
      const predicted = sat.predictedFor(this.stationObserver_);
      return {
        az: g.az,
        el: g.el,
        rangeKm: g.rangeKm,
        predictedAz: predicted.az,
        predictedEl: predicted.el,
        txSignal: sat.txSignalsFor(this.stationObserver_),
      };
    }

    return {
      az: sat.az,
      el: sat.el,
      rangeKm: sat.rangeKm,
      predictedAz: sat.predictedAz,
      predictedEl: sat.predictedEl,
      txSignal: sat.txSignal,
    };
  }

  /**
   * True angular separation (degrees) between the antenna boresight and a
   * target az/el, via the spherical law of cosines. Unlike the planar
   * hypot(dAz, dEl) approximation this stays correct near zenith and for
   * large angles (wide-beam Campaign 3 antennas).
   */
  private angularSeparationDeg_(targetAz: number, targetEl: number): number {
    const d2r = Math.PI / 180;
    const el1 = this.state.elevation * d2r;
    const el2 = targetEl * d2r;
    const dAz = (targetAz - this.normalizedAzimuth) * d2r;
    const cosSep = Math.sin(el1) * Math.sin(el2) + Math.cos(el1) * Math.cos(el2) * Math.cos(dAz);
    return Math.acos(Math.max(-1, Math.min(1, cosSep))) / d2r;
  }

  // ========================================================================
  // PROTECTED STATUS ALARMS
  // ========================================================================

  /**
   * Get status alarms for status bar display
   * Returns array of alarm statuses with severity and message
   */
  getStatusAlarms(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];

    // Error conditions
    if (!this.state.isPowered) {
      alarms.push({ severity: 'off', message: '' });
      return alarms;
    }

    if (!this.state.isOperational) {
      alarms.push({ severity: 'error', message: 'ANTENNA NOT OPERATIONAL' });
    }

    // Warning conditions
    if (this.state.isAutoTrackEnabled && !this.state.isLocked && !this.state.isBeaconLocked) {
      alarms.push({ severity: 'warning', message: 'ACQUIRING LOCK...' });
    }

    if (!this.state.rxSignalsIn && !this.state.isLocked && !this.state.isAutoTrackEnabled && !this.state.isLoopback) {
      alarms.push({ severity: 'warning', message: 'DISCONNECTED' });
    }

    // Extreme skew warning
    const absolutePolarization = Math.abs(this.state.polarization);
    if (absolutePolarization > 45) {
      alarms.push({ severity: 'warning', message: `HIGH POLARIZATION (${this.state.polarization}°)` });
    }

    // ACU automation controller fault
    if (this.state.isAcuAutomationFaulted) {
      alarms.push({ severity: 'error', message: 'ACU AUTOMATION FAULT - MANUAL CONTROL ONLY' });
    }

    // Elevated sky-noise warning (sun transit)
    if (this.state.skyNoiseDegradation_dB > 0.5) {
      const sky = this.state.skyNoiseDegradation_dB;
      if (sky >= 6) {
        alarms.push({ severity: 'error', message: `SUN TRANSIT: SKY NOISE CRITICAL (${sky.toFixed(1)} dB)` });
      } else if (sky >= 2) {
        alarms.push({ severity: 'warning', message: `SUN TRANSIT: ELEVATED SKY NOISE (${sky.toFixed(1)} dB)` });
      } else {
        alarms.push({ severity: 'info', message: `ELEVATED SKY NOISE (${sky.toFixed(1)} dB)` });
      }
    }

    // Rain fade (frequency dependent: C-band rarely clears the 0.5 dB floor)
    if (this.state.rainRate_mmh > 0) {
      const rain = this.rainAttenuationDb;
      if (rain >= 6) {
        alarms.push({ severity: 'error', message: `RAIN FADE SEVERE (${rain.toFixed(1)} dB)` });
      } else if (rain >= 2) {
        alarms.push({ severity: 'warning', message: `RAIN FADE (${rain.toFixed(1)} dB)` });
      } else if (rain >= 0.5) {
        alarms.push({ severity: 'info', message: `LIGHT RAIN FADE (${rain.toFixed(1)} dB)` });
      }
    }

    // Ice accumulation warning
    if (this.state.iceAccumulation_dB > 0) {
      const ice = this.state.iceAccumulation_dB;
      if (ice >= 5) {
        alarms.push({ severity: 'error', message: `CRITICAL ICE BUILDUP (${ice.toFixed(1)} dB)` });
      } else if (ice >= 2) {
        alarms.push({ severity: 'warning', message: `ICE ACCUMULATING (${ice.toFixed(1)} dB)` });
      } else {
        alarms.push({ severity: 'info', message: `ICE DETECTED (${ice.toFixed(1)} dB)` });
      }
    }

    // No signal reception warning
    if (!this.state.isLocked && this.state.isAutoTrackSwitchUp && !this.state.isAutoTrackEnabled) {
      alarms.push({ severity: 'warning', message: 'AUTO TRACK FAILED' });
    }

    if (this.state.isLocked && !this.state.isLoopback && this.state.rxSignalsIn.length === 0) {
      alarms.push({ severity: 'warning', message: 'NO SIGNALS RECEIVED' });
    }

    // Info conditions
    if (this.state.isLoopback) {
      alarms.push({ severity: 'info', message: 'LOOPBACK ENABLED' });
    }

    // Success conditions
    if (this.state.isLocked && !this.state.isLoopback) {
      const strongestSignal = SimulationManager.getInstance()
        .getSatsByAzEl(this.normalizedAzimuth, this.state.elevation)
        .flatMap((sat) => sat.txSignal)
        .reduce((prev, curr) => (prev.power > curr.power ? prev : curr), { power: -Infinity } as RfSignal).noradId;

      alarms.push({ severity: 'success', message: `LOCKED ON SATELLITE ${SimulationManager.getInstance().isDeveloperMode ? strongestSignal : ''}`.trimEnd() });
    }

    // if (this.rxSignals.flatMap(sat => sat.signal).length > 0 && !this.state.isLoopback && !this.state.isAutoTrackEnabled) {
    //   alarms.push({ severity: 'info', message: `${this.rxSignals.flatMap(sat => sat.signal).length} SIGNAL(S) RECEIVED` });
    // }

    if (this.state.isPowered && this.state.isOperational && !this.state.isLoopback && !this.state.isAutoTrackEnabled) {
      alarms.push({ severity: 'info', message: `Manual Tracking Enabled` });
    }

    return alarms;
  }

  // ========================================================================
  // PRIVATE METHODS
  // ========================================================================

  private notifyStateChange_(): void {
    this.emit(Events.ANTENNA_STATE_CHANGED, this.state);
  }

  private updateSignals_(): void {
    // Can't receive signals if Not powered or Not operational
    if (!this.state.isPowered || !this.state.isOperational) {
      this.state.rxSignalsIn = [];
      return;
    }

    this.updateTxSignals_();
    this.updateRxSignals_();
  }

  private updateRxSignals_() {
    // Get visible signals from the satellite and apply propagation effects,
    // then add any terrestrial emitters this antenna can hear (E1). Both go
    // through the same C/I blocking/degradation pass below, so a strong
    // ground emitter degrades wanted downlinks exactly like any interferer.
    let receivedSignals = this.rxSignals.map(({ sat, signal, view }) => this.applyPropagationEffects_(sat, signal, view)).concat(this.terrestrialRxSignals_());

    // Apply interference and adjacency logic
    receivedSignals = receivedSignals.filter((signal) => {
      // Get the frequency bounds of this signal
      const halfBandwidth = signal.bandwidth * 0.5;
      const lowerBound = signal.frequency - halfBandwidth;
      const upperBound = signal.frequency + halfBandwidth;

      // Check for stronger interfering signals
      let isBlocked = false;

      for (const other of receivedSignals) {
        if (other.signalId === signal.signalId) continue;

        const otherHalfBandwidth = other.bandwidth * 0.5;
        const otherLowerBound = other.frequency - otherHalfBandwidth;
        const otherUpperBound = other.frequency + otherHalfBandwidth;

        // Calculate overlap
        const overlapLower = Math.max(lowerBound, otherLowerBound);
        const overlapUpper = Math.min(upperBound, otherUpperBound);
        const overlapBandwidth = Math.max(0, overlapUpper - overlapLower);
        const overlapPercent = (overlapBandwidth / signal.bandwidth) * 100;

        if (overlapPercent === 0) continue;

        // Calculate carrier-to-interference ratio
        const signalPowerLinear = 10 ** (signal.power / 10);
        const interferencePowerLinear = 10 ** (other.power / 10);
        const ci_ratio = 10 * Math.log10(signalPowerLinear / interferencePowerLinear);

        // If C/I is less than 10 dB and overlap is significant, signal is degraded or blocked
        if (ci_ratio < 10 && overlapPercent >= 50) {
          if (other.power > signal.power) {
            // Stronger signal blocks this one
            isBlocked = true;
            break;
          } else {
            // Similar strength causes degradation
            signal.isDegraded = true;
          }
        } else if (ci_ratio < 15 && overlapPercent >= 25) {
          // Partial overlap with marginal C/I causes degradation
          signal.isDegraded = true;
        }
      }

      return !isBlocked;
    });

    this.state.rxSignalsIn = receivedSignals;
  }

  /**
   * Terrestrial emitters received directly by this antenna (E1, Campaign 3+).
   * Each active terrestrial interference event is placed at its great-circle
   * bearing on the horizon (el 0) and charged FSPL over ground distance plus
   * this antenna's own off-axis pattern - so sweeping a directional antenna
   * changes the received power (DF gameplay), and NO Doppler ever applies
   * (the fake-beacon tell). Returns [] unless a scenario runs terrestrial
   * events AND the station location is attached - legacy paths unchanged.
   */
  private terrestrialRxSignals_(): RfSignal[] {
    if (!InterferenceManager.isInitialized() || !this.stationLocation_) {
      return [];
    }

    const emissions = InterferenceManager.getInstance().getActiveTerrestrialEmissions();
    if (emissions.length === 0) {
      return [];
    }

    const { latitude, longitude } = this.stationLocation_;

    // An antenna only hears emitters inside its own band: the 70cm yagi does
    // not meaningfully receive a 137 MHz fake beacon (S8 runs both stations
    // in one yard), and modeling it would also spam the out-of-range warning
    // in the gain model every frame.
    const inBand = emissions.filter((emission) => emission.frequencyHz >= this.config.minRxFrequency && emission.frequencyHz <= this.config.maxRxFrequency);

    return inBand.map((emission) => {
      const { bearingDeg, distanceKm } = AntennaCore.groundPath_(latitude, longitude, emission.emitter.latitude, emission.emitter.longitude);

      const f_Hz = emission.frequencyHz;
      const offAxis_deg = this.config.gainModel === 'fixed' ? this.angularSeparationDeg_(bearingDeg, 0) : Math.hypot(bearingDeg - this.normalizedAzimuth, this.state.elevation);

      const fspl = this.calculateFreeSpacePathLoss_(f_Hz, Math.max(0.01, distanceKm));
      const polarizationLoss = this.polMismatchLoss_dB_(emission.polarization, this.config.polType ?? 'linear', Math.abs(this.state.polarization) as Degrees);
      const Grx_dBi = this.patternGain_dBi_(offAxis_deg, f_Hz);
      const feedLoss = this.feedLossAt_(f_Hz) + this.state.iceAccumulation_dB;

      const receivedPower = emission.eirpDbm - fspl - polarizationLoss - feedLoss + Grx_dBi;

      return {
        signalId: emission.signalId,
        serverId: 1,
        noradId: 0,
        frequency: f_Hz,
        polarization: emission.polarization,
        power: receivedPower as dBm,
        bandwidth: emission.bandwidthHz as Hertz,
        modulation: 'null',
        fec: 'null',
        feed: '',
        isDegraded: false,
        origin: SignalOrigin.ANTENNA_RX,
        noiseFloor: null,
        gainInPath: 0,
      } as RfSignal;
    });
  }

  /** Great-circle initial bearing (deg true) and distance (km) between two WGS-84 points */
  private static groundPath_(lat1Deg: number, lon1Deg: number, lat2Deg: number, lon2Deg: number): { bearingDeg: number; distanceKm: number } {
    const d2r = Math.PI / 180;
    const lat1 = lat1Deg * d2r;
    const lat2 = lat2Deg * d2r;
    const dLon = (lon2Deg - lon1Deg) * d2r;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearingDeg = (Math.atan2(y, x) / d2r + 360) % 360;

    const dLat = (lat2Deg - lat1Deg) * d2r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return { bearingDeg, distanceKm };
  }

  private updateTxSignals_() {
    // Legacy (parabolic) path: bit-identical to the original behavior. C1/C2
    // uplinks are calibrated around no-FSPL EIRP-at-satellite numbers, so the
    // link-budget branch below is fixed-gain (Campaign 3+) only.
    if (this.config.gainModel !== 'fixed') {
      const sats = SimulationManager.getInstance().getSatsByAzEl(this.normalizedAzimuth, this.state.elevation);

      // Clear any old signals
      if (sats.length > 0) {
        for (const sat of sats) {
          sat.rxSignal = [];

          // Check transmitters for signals being sent to this antenna
          for (const sig of this.txSignalsOut) {
            if (!this.state.isLoopback) {
              // Check if this signal already exists on the satellite
              sat.rxSignal.push({
                ...sig,
                origin: SignalOrigin.ANTENNA_TX,
              });
            }
          }
        }
      }
      return;
    }

    // Fixed-gain (wide-beam, Campaign 3) uplink path:
    // - beam gate is the antenna's own HPBW via true angular separation
    //   (mirrors rxSignals; the +/-2 deg planar box is meaningless at 40 deg)
    // - real uplink link budget: FSPL over slant range + atmosphere + off-axis
    //   pattern rolloff, so the power arriving at the satellite is physical
    // - circular antennas stamp their handedness on the radiated signal so
    //   the satellite's polarization-matched transponder can accept it
    // - stale uplinks are cleared when a satellite leaves the beam (otherwise
    //   the transponder keeps relaying a signal that is no longer arriving)
    const beamwidth = this.config.fixedBeamwidth3dB_deg ?? 90;
    const allSats = SimulationManager.getInstance().satellites;
    const txSignals = this.state.isLoopback ? [] : this.txSignalsOut;
    const fedIds = this.txFedSignalIds_;

    for (const sat of allSats) {
      const view = this.satView_(sat);
      const inBeam = this.angularSeparationDeg_(view.az, view.el) <= beamwidth;
      const prevIds = fedIds.get(sat.noradId);

      // Nothing radiating (or out of beam): withdraw only what THIS antenna
      // put on the satellite. A receive-only rig must never clear the array -
      // the same yard can hold a wide-beam RX antenna and a transmitting one,
      // and a blanket clear would delete the other rig's uplink depending on
      // station update order. Other stations' signals and injected
      // interference (externalSignal) are never touched.
      if (!inBeam || txSignals.length === 0) {
        if (prevIds) {
          sat.rxSignal = sat.rxSignal.filter((s) => !prevIds.has(s.signalId));
          fedIds.delete(sat.noradId);
        }
        continue;
      }

      // Replace this antenna's previous contribution, keep everything else
      sat.rxSignal = prevIds ? sat.rxSignal.filter((s) => !prevIds.has(s.signalId)) : sat.rxSignal;
      const pushedIds = new Set<string>();

      for (const sig of txSignals) {
        const f_Hz = sig.frequency as number;
        const offAxis_deg = this.angularSeparationDeg_(view.az, view.el);
        const fspl = this.calculateFreeSpacePathLoss_(f_Hz, view.rangeKm ?? GEO_SATELLITE_DISTANCE_KM);
        const atmosphericLoss = this.calculateAtmosphericLoss_(f_Hz, Math.max(1, view.el));
        // txSignalsOut already includes boresight gain; charge only the
        // off-axis rolloff (capped at front-to-back like the RX pattern)
        const offAxisDrop = this.antennaGain_dBi(sig.frequency) - this.patternGain_dBi_(offAxis_deg, f_Hz);

        sat.rxSignal.push({
          ...sig,
          power: (sig.power - fspl - atmosphericLoss - offAxisDrop) as dBm,
          polarization: this.config.polType === 'circular' ? (this.state.circularHandedness ?? sig.polarization) : sig.polarization,
          origin: SignalOrigin.ANTENNA_TX,
        });
        pushedIds.add(sig.signalId);
      }

      if (pushedIds.size > 0) {
        fedIds.set(sat.noradId, pushedIds);
      } else {
        fedIds.delete(sat.noradId);
      }
    }
  }

  // ========================================================================
  // RF PHYSICS CALCULATIONS
  // ========================================================================

  /**
   * Calculate Free-Space Path Loss (FSPL) in dB
   * FSPL = 20*log10(d) + 20*log10(f) + 20*log10(4π/c)
   * where d = distance (m), f = frequency (Hz), c = speed of light (m/s)
   *
   * Simplified: FSPL (dB) = 32.45 + 20*log10(d_km) + 20*log10(f_MHz)
   */
  private calculateFreeSpacePathLoss_(frequencyHz: number, distanceKm: number): number {
    const frequencyMhz = frequencyHz / 1e6;
    const fspl = 32.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMhz);
    return fspl;
  }

  /**
   * Calculate atmospheric loss in dB
   * Accounts for atmospheric absorption, primarily from oxygen and water vapor
   * Frequency dependent - higher at higher frequencies
   * Elevation angle dependent - more atmosphere at low angles
   *
   * Simplified model for clear sky conditions
   */
  private calculateAtmosphericLoss_(frequencyHz: number, elevationAngleDeg: number = 45): number {
    const frequencyGhz = frequencyHz / 1e9;

    // Zenith attenuation (overhead path) varies by frequency
    let zenithAttenuation = 0;

    if (frequencyGhz < 1) {
      zenithAttenuation = 0.01; // Very low at low frequencies
    } else if (frequencyGhz < 10) {
      // L-band to X-band: minimal atmospheric loss
      zenithAttenuation = 0.02 + (frequencyGhz - 1) * 0.005;
    } else if (frequencyGhz < 20) {
      // Ku-band: moderate atmospheric loss
      zenithAttenuation = 0.1 + (frequencyGhz - 10) * 0.02;
    } else {
      // Ka-band and above: significant atmospheric loss
      zenithAttenuation = 0.3 + (frequencyGhz - 20) * 0.05;
    }

    // Elevation angle factor: lower elevation = more atmosphere
    // sec(θ) approximation for slant path through atmosphere
    const elevationRad = (elevationAngleDeg * Math.PI) / 180;
    const slantPathFactor = 1 / Math.sin(elevationRad);

    // Total atmospheric loss
    const atmosphericLoss = zenithAttenuation * Math.min(slantPathFactor, 3); // Cap at 3x for low angles

    return atmosphericLoss;
  }

  /**
   * Calculate polarization mismatch loss between transmit and receive polarizations
   */
  calculatePolarizationLoss_(txPolarization: string | null, rxPolarization: string | null, polarizationAngle: number): number {
    // If either polarization is null, assume matched (0 dB loss)
    if (!txPolarization || !rxPolarization) {
      return 0;
    }

    // Perfect match with no skew
    if (txPolarization === rxPolarization && polarizationAngle === 0) {
      return 0;
    }

    // Cross-polarization (H vs V, LHCP vs RHCP)
    const isCrossPolarized =
      (txPolarization === 'H' && rxPolarization === 'V') ||
      (txPolarization === 'V' && rxPolarization === 'H') ||
      (txPolarization === 'LHCP' && rxPolarization === 'RHCP') ||
      (txPolarization === 'RHCP' && rxPolarization === 'LHCP');

    if (isCrossPolarized) {
      return 20; // 20 dB loss for cross-polarization
    }

    // Polarization loss due to skew (linear polarizations only)
    if ((txPolarization === 'H' || txPolarization === 'V') && (rxPolarization === 'H' || rxPolarization === 'V')) {
      const polarizationRad = (Math.abs(polarizationAngle) * Math.PI) / 180;
      const polarizationLoss = -20 * Math.log10(Math.cos(polarizationRad));
      return polarizationLoss;
    }

    return 0;
  }

  /**
   * Compute current RF metrics for display
   * Uses midband frequency or first signal frequency if available
   */
  private computeRfMetrics_(): void {
    // Use first signal frequency if available, otherwise use midband Rx frequency
    const frequency =
      this.state.rxSignalsIn.length > 0 ? (this.state.rxSignalsIn[0].frequency as Hertz) : (((this.config.minRxFrequency + this.config.maxRxFrequency) / 2) as Hertz);

    const elevation = 45 as Degrees; // Standard elevation for GEO

    // Calculate EIRP if transmitting
    let eirp_dBW: number | undefined;
    const txSignals = this.txSignalsIn;
    if (txSignals.length > 0 && this.rfFrontEnd_) {
      const txSignal = txSignals[0];
      const txFreq = txSignal.frequency as Hertz;
      eirp_dBW = this.calculateEirp_(txSignal.power, txFreq);
    }

    this.state.rfMetrics = {
      gain_dBi: this.antennaGain_dBi(frequency),
      beamwidth_deg: this.beamwidth3dB_deg_(frequency),
      gOverT_dBK: this.gOverT_dB_perK_(frequency, elevation),
      polLoss_dB: this.polMismatchLoss_dB_(
        'H', // Assume H-pol for display
        this.config.polType ?? 'linear',
        this.state.polarization
      ),
      atmosLoss_dB: this.calculateAtmosphericLoss_(frequency, elevation),
      skyTemp_K: this.skyTempK_(elevation),
      frequency_GHz: frequency / 1e9,
      eirp_dBW,
    };
  }

  /**
   * Calculate EIRP (Effective Isotropic Radiated Power)
   *
   * EIRP = Pt (dBW) + Gt (dBi) - feed losses
   *
   * EIRP represents the power that would need to be radiated by an isotropic
   * antenna to produce the same power flux density in the direction of
   * maximum antenna gain.
   *
   * @param txPowerDbm Transmit power at antenna feed input in dBm
   * @param frequencyHz Transmit frequency in Hz
   * @returns EIRP in dBW
   */
  private calculateEirp_(txPowerDbm: dBm, frequencyHz: Hertz): number {
    const antennaGain = this.antennaGain_dBi(frequencyHz);
    const feedLoss = this.feedLossAt_(frequencyHz as number);

    // Convert dBm to dBW: dBW = dBm - 30
    const txPowerDbW = (txPowerDbm as number) - 30;

    // EIRP = Pt + Gt - feed losses
    // Note: Polarization loss is NOT included in EIRP (it's a path/receive-side metric)
    return txPowerDbW + antennaGain - feedLoss;
  }

  /**
   * Frequency-dependent feed loss (dB)
   * Uses feedLossModel if available, otherwise falls back to static feedLoss
   */
  private feedLossAt_(f_Hz: number): number {
    const m = this.config.feedLossModel;
    if (!m) return this.config.feedLoss ?? 0;
    const fGHz = f_Hz / 1e9;
    return m.a + m.b * Math.sqrt(fGHz) + m.c * fGHz;
  }

  /**
   * Aperture efficiency including surface (Ruze) & blockage
   * Base efficiency is illumination + spill only
   * Ruze formula accounts for surface RMS errors
   * Blockage accounts for subreflector/strut shadowing
   */
  private apertureEfficiency_(f_Hz: number): number {
    const base = Math.max(0.01, Math.min(0.95, this.config.efficiency ?? 0.65));
    const lambda = 3e8 / f_Hz;

    // Ruze: η_surface = exp(-(4πσ/λ)²)
    const sigma = this.config.surfaceRms_m ?? 0;
    const eta_surface = Math.exp(-(((4 * Math.PI * sigma) / lambda) ** 2));

    // Blockage: simple (1 - ε)² approximation
    const eps = Math.max(0, Math.min(0.3, this.config.blockageFraction ?? 0));
    const eta_block = (1 - eps) ** 2;

    return base * eta_surface * eta_block;
  }

  /**
   * 3 dB beamwidth (degrees)
   * HPBW ≈ k*λ/D where k is typically 70 for parabolic dishes
   */
  private beamwidth3dB_deg_(f_Hz: number): number {
    if (this.config.gainModel === 'fixed') {
      return this.config.fixedBeamwidth3dB_deg ?? 90;
    }

    const k = this.config.kBeamConst ?? 70;
    const lambda = 3e8 / f_Hz;
    return (k * lambda) / this.config.diameter; // Result in degrees
  }

  /**
   * Pointing loss (dB) using the 12*(Δθ/θ3dB)² rule
   * This represents the gain reduction when pointing off-axis
   */
  private pointingLoss_dB_(offAxis_deg: number, f_Hz: number): number {
    const bw = this.beamwidth3dB_deg_(f_Hz);
    return Math.max(0, 12 * (offAxis_deg / bw) ** 2);
  }

  /**
   * ITU-R 465-type pattern envelope (dBi)
   * Returns gain at off-axis angle including main lobe and sidelobe envelope
   */
  private patternGain_dBi_(theta_deg: number, f_Hz: number): number {
    const Gmax = this.antennaGain_dBi(f_Hz as Hertz);
    const bw = this.beamwidth3dB_deg_(f_Hz);

    // Fixed gain model (wire antennas): main-lobe rolloff capped at the
    // front-to-back ratio — the diameter-based sidelobe envelope below is
    // meaningless for a yagi/QFH/patch.
    if (this.config.gainModel === 'fixed') {
      const drop = 12 * (theta_deg / bw) ** 2;
      return Gmax - Math.min(drop, this.config.fixedFrontToBack_dB ?? 20);
    }

    // Main lobe approximation (within ~1.2 beamwidths)
    if (theta_deg <= 1.2 * bw) {
      const drop = 12 * (theta_deg / bw) ** 2;
      return Gmax - drop;
    }

    // Sidelobe envelope (ITU-R recommendation for parabolic dishes)
    // G(θ) ≤ Gmax - min(32, 25*log10(θ*D/λ))
    const lambda = 3e8 / f_Hz;
    const theta_normalized = (theta_deg * this.config.diameter) / lambda;
    const env = Math.min(32, 25 * Math.log10(Math.max(1e-3, theta_normalized)));
    return Gmax - env;
  }

  /**
   * Polarization mismatch loss (dB) for linear pol & skew angle
   * Combines feed XPD floor and skew-dependent loss
   */
  private polMismatchLoss_dB_(signalPol: 'H' | 'V' | 'RHCP' | 'LHCP', _rxPol: 'linear' | 'circular', polarizationMismatch: Degrees): dB {
    if (this.config.polType === 'circular' || signalPol === 'RHCP' || signalPol === 'LHCP') {
      // Circular discrimination
      if ((signalPol === 'RHCP' && this.config.polType === 'circular') || (signalPol === 'LHCP' && this.config.polType === 'circular')) {
        // Switchable-feed antennas (circularHandedness set) discriminate by
        // handedness; wrong-handed reception costs the configured cross-pol
        // loss. Legacy circular antennas (handedness unset) keep the old
        // matched-by-default behavior.
        const handedness = this.state.circularHandedness;
        if (handedness !== undefined && handedness !== signalPol) {
          return (this.config.circularCrossPolLoss_dB ?? 3) as dB;
        }
        return 0.5 as dB; // Small imperfection
      }
      return 3 as dB; // Mismatched handedness
    }

    // Linear: loss ≈ 20*log10|cos(skew)| limited by XPD floor
    const xpd = this.config.xpd_dB ?? 30;
    const cosTerm = Math.abs(Math.cos((polarizationMismatch * Math.PI) / 180));
    const ideal = -20 * Math.log10(Math.max(1e-6, cosTerm)); // dB penalty
    return Math.min(xpd, ideal) as dB;
  }

  /**
   * Sky temperature (K) vs elevation - simple C-band model
   * ~8-12 K at zenith, increases at low elevation due to atmospheric path
   */
  private skyTempK_(elev_deg: number): number {
    // sec(z) factor for atmospheric path length
    const secz = 1 / Math.max(0.1, Math.sin((elev_deg * Math.PI) / 180));
    return 8 + 4 * (secz - 1); // Tune as needed
  }

  /**
   * Convert loss (dB) at physical temp to equivalent noise temp (K) at LNA input
   * T_equiv = T_phys * (L - 1) where L is linear loss factor
   */
  private noiseFromLossK_(L_dB: number, physK: number = 290): number {
    const L = 10 ** (L_dB / 10);
    return physK * (L - 1);
  }

  /**
   * Thermal noise floor at the antenna output (referred to LNA input) for a
   * given frequency and noise bandwidth.
   *
   * Uses system noise temperature (sky + atmosphere + feed + LNA) and kTB.
   *
   * NOTE:
   * - Returns total noise power in dBm **over noiseBandwidth_Hz**.
   * - If you want noise density, call it with noiseBandwidth_Hz = 1.
   */
  antennaNoiseFloor(frequency: Hertz, noiseBandwidth: Hertz): dBm {
    // Use the actual current pointing elevation
    const elevation = this.state.elevation;
    const Tsys_K = this.systemTempK_(frequency, elevation);

    // Guard against degenerate values
    const T = Math.max(Tsys_K, 1); // K (avoid log of 0)
    const B = Math.max(noiseBandwidth, 1); // Hz (at least 1 Hz)

    // Thermal noise density at 290 K ~ -174 dBm/Hz
    const kTB_290_dBmPerHz = -174;

    // Temperature correction: 10*log10(T/290)
    const tempCorrection_dB = 10 * Math.log10(T / 290);

    // Bandwidth gain: 10*log10(B)
    const bandwidthGain_dB = 10 * Math.log10(B);

    const noise_dBm = kTB_290_dBmPerHz + tempCorrection_dB + bandwidthGain_dB;
    return noise_dBm as dBm;
  }

  /**
   * System noise temperature at LNA input (K)
   * Accounts for sky, atmosphere, feed, ice accumulation, and LNA contributions
   */
  private systemTempK_(frequency: Hertz, elevation: Degrees): number {
    const Tsky = this.skyTempK_(elevation);
    const Latm = this.calculateAtmosphericLoss_(frequency, elevation);
    const Lfeed = this.feedLossAt_(frequency) + (this.config.rxChainLoss_dB ?? 0);

    // Ice accumulation adds to feed loss (ice on feed horn acts as lossy medium).
    // Elevated sky noise (sun transit) and rain on the path are modeled as
    // equivalent RX-path loss (a lossy medium both attenuates and radiates).
    const Lice = this.state.iceAccumulation_dB + this.state.skyNoiseDegradation_dB + this.rainAttenuation_dB(frequency, elevation);
    const LfeedTotal = Lfeed + Lice;

    const Tant = Tsky + this.noiseFromLossK_(Latm, 260); // Atm ~260 K slab
    const Tfeed = this.noiseFromLossK_(LfeedTotal, this.config.rxPhysTemp_K ?? 290);

    // LNA noise
    const NF = this.config.lnaNF_dB ?? 1.0;
    const Tlna = 290 * (10 ** (NF / 10) - 1);

    // Friis cascade for noise temps with preceding losses
    const L_atm_linear = 10 ** (Latm / 10);
    const L_feed_linear = 10 ** (LfeedTotal / 10);
    const L_total = L_atm_linear * L_feed_linear;

    return Tant * L_total + Tfeed * L_atm_linear + Tlna;
  }

  /**
   * G/T (dB/K) at given frequency & elevation
   * Key figure of merit for receive systems
   */
  private gOverT_dB_perK_(frequency: Hertz, elevation: Degrees): number {
    return this.antennaGain_dBi(frequency) - 10 * Math.log10(this.systemTempK_(frequency, elevation));
  }

  /**
   * Current de-pointing (degrees) from wind & servo jitter
   * Returns total off-axis error from environmental factors
   */
  currentDePointing_deg_(wind_mps: number = 0): number {
    const coef = this.config.windDePointingCoef_deg_per_mps ?? 0;
    const randomJitter = (this.config.pointingSigma_deg ?? 0.01) * (Math.random() * 2 - 1);
    return coef * wind_mps + randomJitter;
  }

  /**
   * Apply propagation effects to a received signal
   * Uses realistic RF physics including Ruze, blockage, polarization, and atmospheric effects
   */
  private applyPropagationEffects_(satellite: Satellite, signal: RfSignal, view: SatelliteView = this.satView_(satellite)): RfSignal {
    const f_Hz = signal.frequency as number;
    const elev_deg = this.state.elevation;

    // Calculate off-axis angle between antenna pointing and satellite position.
    // Fixed-gain (wide-beam) antennas use true angular separation - the planar
    // approximation overestimates badly near zenith, where the QFH points.
    // Parabolic antennas keep the legacy planar math bit-identically.
    const deltaAz = view.az - this.normalizedAzimuth;
    const deltaEl = view.el - this.state.elevation;
    const offAxis_deg = this.config.gainModel === 'fixed' ? this.angularSeparationDeg_(view.az, view.el) : Math.hypot(deltaAz, deltaEl);

    // Calculate free-space path loss (downlink from satellite to ground).
    // Orbital satellites report true slant range; legacy fixed-telemetry
    // satellites fall back to the nominal GEO slant range.
    const fspl = this.calculateFreeSpacePathLoss_(signal.frequency, view.rangeKm ?? GEO_SATELLITE_DISTANCE_KM);

    // Calculate atmospheric loss using realistic model
    const atmosphericLoss = this.calculateAtmosphericLoss_(signal.frequency, elev_deg);

    // Calculate polarization mismatch loss using new realistic model
    const polarizationLoss = this.polMismatchLoss_dB_(
      signal.polarization as 'H' | 'V' | 'RHCP' | 'LHCP',
      this.config.polType ?? 'linear',
      Math.abs((signal.rotation ?? 0) - this.state.polarization) as Degrees
    );

    // Use pattern gain (accounts for off-axis angle) instead of just peak gain
    const Grx_dBi = this.patternGain_dBi_(offAxis_deg, f_Hz);

    // Feed loss (frequency-dependent) + ice accumulation on feed horn +
    // elevated sky noise (sun transit) as equivalent RX loss + rain on the path
    const feedLoss = this.feedLossAt_(f_Hz) + this.state.iceAccumulation_dB + this.state.skyNoiseDegradation_dB + this.rainAttenuation_dB(f_Hz, elev_deg);

    // Pointing loss (if any off-axis error from wind/jitter)
    const pointingLoss = this.pointingLoss_dB_(offAxis_deg, f_Hz);

    // Apply all losses to signal power
    const receivedPower = signal.power - fspl - atmosphericLoss - polarizationLoss - feedLoss - pointingLoss + Grx_dBi;

    return {
      ...signal,
      power: receivedPower as dBm,
    };
  }

  /**
   * Calculate antenna gain in dBi with Ruze + blockage model
   * Uses aperture efficiency that includes:
   *   - Base illumination & spill efficiency
   *   - Surface RMS errors (Ruze formula)
   *   - Subreflector/strut blockage
   *
   * Formula: G = η * (πD/λ)²
   * In dB: G_dBi = 10*log10(η) + 20*log10(πD/λ)
   *
   * @param frequencyHz Operating frequency in Hz
   * @returns Antenna gain in dBi
   */
  private antennaGain_dBi(frequencyHz: Hertz): number {
    const f_Hz = frequencyHz as number;

    // Check if frequency is within antenna's operating range
    if (
      (frequencyHz < this.config.minRxFrequency || frequencyHz > this.config.maxRxFrequency) &&
      (frequencyHz < this.config.minTxFrequency || frequencyHz > this.config.maxTxFrequency)
    ) {
      console.warn(
        `Warning: Frequency ${f_Hz / 1e9} GHz is outside antenna operating range ` +
          `(${this.config.minRxFrequency / 1e9} - ${this.config.maxRxFrequency / 1e9} GHz for Rx, ` +
          `${this.config.minTxFrequency / 1e9} - ${this.config.maxTxFrequency / 1e9} GHz for Tx). ` +
          `Gain calculation may be inaccurate.`
      );
    }

    // Fixed gain model (wire antennas): boresight gain comes straight from
    // config — aperture/Ruze/blockage math does not apply.
    if (this.config.gainModel === 'fixed') {
      return this.config.fixedGain_dBi ?? 0;
    }

    // Use new aperture efficiency model (includes Ruze + blockage)
    const lambda = 3e8 / f_Hz;
    const k = Math.PI * (this.config.diameter / lambda);
    const eta = this.apertureEfficiency_(f_Hz);
    const G_linear = eta * (k * k);

    return 10 * Math.log10(G_linear);
  }
}
