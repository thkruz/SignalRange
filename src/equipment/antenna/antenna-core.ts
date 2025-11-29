import { EventBus } from "@app/events/event-bus";
import { SignalOrigin } from "@app/SignalOrigin";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import { Degrees } from "ootk";
import { Events } from "../../events/events";
import { SimulationManager } from "../../simulation/simulation-manager";
import { dB, dBm, Hertz, RfSignal } from "../../types";
import { AlarmStatus, BaseEquipment } from '../base-equipment';
import { RFFrontEndCore } from "../rf-front-end/rf-front-end-core";
import { Satellite } from "../satellite/satellite";
import { Transmitter } from "../transmitter/transmitter";
import { ANTENNA_CONFIG_KEYS, ANTENNA_CONFIGS, AntennaConfig } from "./antenna-configs";

/**
 * RF Propagation constants for GEO satellite communications
 */
const GEO_SATELLITE_DISTANCE_KM = 38000; // Approximate slant range to GEO satellite (km)

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
  };
}

/**
 * AntennaCore - Abstract base class for antenna implementations
 * Contains all business logic: RF physics, state management, signal processing
 * UI implementations extend this class and implement DOM-specific methods
 */
export abstract class AntennaCore extends BaseEquipment {
  /** Current antenna state */
  state: AntennaState;
  protected lastRenderState: AntennaState;
  protected rfFrontEnd_: RFFrontEndCore | null = null;

  transmitters: Transmitter[] = [];

  /** Antenna physical configuration */
  config: AntennaConfig;

  /** Timeout ID for lock acquisition to prevent memory leaks */
  private lockAcquisitionTimeout_: number | null = null;

  constructor(
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1,
  ) {
    super(teamId);

    // Set antenna configuration
    this.config = ANTENNA_CONFIGS[configId];

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
    };
    // Override with any provided initial state
    this.state = { ...this.state, ...initialState };

    this.lastRenderState = structuredClone(this.state);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().on(Events.DRAW, this.draw.bind(this));
  }

  set configId(configId: ANTENNA_CONFIG_KEYS) {
    this.config = ANTENNA_CONFIGS[configId];
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

  update(): void {
    this.updateSignals_();
    this.computeRfMetrics_();
    this.syncDomWithState();
  }

  sync(data: Partial<AntennaState>): void {
    this.state = { ...this.state, ...data };
    this.updateSignals_();
    this.computeRfMetrics_();
    this.notifyStateChange_();
    this.syncDomWithState();
  }

  // ========================================================================
  // PUBLIC HANDLERS FOR UI CLASSES AND ADAPTERS
  // ========================================================================

  public handlePolarizationChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    this.state.polarization = value as Degrees;
    this.notifyStateChange_();
  }

  public handleAzimuthChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    if (value !== this.state.azimuth) {
      if (this.state.isLocked) {
        SoundManager.getInstance().play(Sfx.FAULT);
      }
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.state.azimuth = value as Degrees;
      this.notifyStateChange_();
    }
  }

  public handleElevationChange(value: number): void {
    if (!this.state.isPowered) {
      return;
    }
    if (value !== this.state.elevation) {
      if (this.state.isLocked) {
        SoundManager.getInstance().play(Sfx.FAULT);
      }
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.state.elevation = value as Degrees;
      this.notifyStateChange_();
    }
  }

  public handleLoopbackToggle(isSwitchUp: boolean): void {
    if (!this.state.isOperational || !this.state.isPowered) {
      return;
    }

    this.state.isLoopback = isSwitchUp;

    this.notifyStateChange_();

    this.updateSignals_();
    this.syncDomWithState();
  }

  public handleAutoTrackToggle(isSwitchUp: boolean): void {
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
    const sats = SimulationManager.getInstance().getSatsByAzEl(this.normalizedAzimuth, this.state.elevation);
    const strongestSignal = sats
      .flatMap(sat => sat.txSignal)
      .reduce((prev, curr) => (prev.power > curr.power ? prev : curr), { power: -Infinity } as RfSignal);

    // hardcoded threshold for lock acquisition - TODO: make configurable
    const LOCK_THRESHOLD_DBM = -100;

    if (isSwitchUp && strongestSignal.power > LOCK_THRESHOLD_DBM) {
      SoundManager.getInstance().play(Sfx.SMALL_MOTOR);
      let differenceBetweenAzAndSatAz = Math.abs(this.state.azimuth - SimulationManager.getInstance().getSatByNoradId(strongestSignal.noradId).az);

      const sat = SimulationManager.getInstance().getSatByNoradId(strongestSignal.noradId);

      if (differenceBetweenAzAndSatAz > 180) {
        this.state.azimuth = (sat.az + 360) as Degrees;
      } else {
        this.state.azimuth = sat.az;
      }
      this.state.elevation = sat.el;
      // Simulate lock acquisition delay with timeout tracking
      this.lockAcquisitionTimeout_ = window.setTimeout(() => {
        SoundManager.getInstance().stop(Sfx.SMALL_MOTOR);
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

  public handlePowerToggle(isPowered?: boolean): void {
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
      this.notifyStateChange_();
      this.updateSignals_();
      this.syncDomWithState();
    }
  }

  // ========================================================================
  // PUBLIC GETTERS
  // ========================================================================

  get normalizedAzimuth(): Degrees {
    // Normalize azimuth between 0 and 359.9999 degrees
    return ((this.state.azimuth % 360) + 360) % 360 as Degrees;
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
        Math.abs((sig.rotation ?? 0) - this.state.polarization) as Degrees,
      );

      // Frequency-dependent feed loss
      const feedLoss = this.feedLossAt_(f_Hz);

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
    sat: Satellite,
    signal: RfSignal,
  }[] {

    const satellites = SimulationManager.getInstance().satellites.filter((sat) => {
      if (
        Math.abs(sat.az - this.normalizedAzimuth) <= 1 &&
        Math.abs(sat.el - this.state.elevation) <= 1
      ) {
        return true;
      }
      return false;
    });

    return satellites.flatMap((sat) => {
      return sat.txSignal.map((signal) => ({
        sat,
        signal,
      }));
    });
  }

  attachRfFrontEnd(rfFrontEnd: RFFrontEndCore): void {
    this.rfFrontEnd_ = rfFrontEnd;
  }

  // ========================================================================
  // PROTECTED STATUS ALARMS
  // ========================================================================

  /**
   * Get status alarms for status bar display
   * Returns array of alarm statuses with severity and message
   */
  protected getStatusAlarms(): AlarmStatus[] {
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
    if (this.state.isAutoTrackEnabled && !this.state.isLocked) {
      alarms.push({ severity: 'warning', message: 'ACQUIRING LOCK...' });
    }

    if (!this.state.rxSignalsIn && !this.state.isLocked && !this.state.isAutoTrackEnabled && !this.state.isLoopback) {
      alarms.push({ severity: 'warning', message: 'DISCONNECTED' });
    }

    // Signal degradation warnings
    const degradedSignals = this.state.rxSignalsIn.filter(sig => sig.isDegraded);
    if (degradedSignals.length > 0) {
      alarms.push({ severity: 'warning', message: `${degradedSignals.length} SIGNAL(S) DEGRADED` });
    }

    // Extreme skew warning
    const absolutePolarization = Math.abs(this.state.polarization);
    if (absolutePolarization > 45) {
      alarms.push({ severity: 'warning', message: `HIGH POLARIZATION (${this.state.polarization}°)` });
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
        .flatMap(sat => sat.txSignal)
        .reduce((prev, curr) => (prev.power > curr.power ? prev : curr), { power: -Infinity } as RfSignal).noradId;

      alarms.push({ severity: 'success', message: `LOCKED ON SATELLITE ${SimulationManager.getInstance().isDeveloperMode ? strongestSignal : ''}`.trimEnd() });
    }

    if (this.rxSignals.flatMap(sat => sat.signal).length > 0 && !this.state.isLoopback && !this.state.isAutoTrackEnabled) {
      alarms.push({ severity: 'info', message: `${this.rxSignals.flatMap(sat => sat.signal).length} SIGNAL(S) RECEIVED` });
    }

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
    // Get visible signals from the satellite and apply propagation effects
    let receivedSignals = this.rxSignals
      .map(({ sat, signal }) => this.applyPropagationEffects_(sat, signal));

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
        const signalPowerLinear = Math.pow(10, signal.power / 10);
        const interferencePowerLinear = Math.pow(10, other.power / 10);
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

  private updateTxSignals_() {
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
    if ((txPolarization === 'H' || txPolarization === 'V') &&
      (rxPolarization === 'H' || rxPolarization === 'V')) {
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
    const frequency = this.state.rxSignalsIn.length > 0
      ? (this.state.rxSignalsIn[0].frequency as Hertz)
      : ((this.config.minRxFrequency + this.config.maxRxFrequency) / 2) as Hertz;

    const elevation = 45 as Degrees; // Standard elevation for GEO

    this.state.rfMetrics = {
      gain_dBi: this.antennaGain_dBi(frequency),
      beamwidth_deg: this.beamwidth3dB_deg_(frequency),
      gOverT_dBK: this.gOverT_dB_perK_(frequency, elevation),
      polLoss_dB: this.polMismatchLoss_dB_(
        'H', // Assume H-pol for display
        this.config.polType ?? 'linear',
        this.state.polarization,
      ),
      atmosLoss_dB: this.calculateAtmosphericLoss_(frequency, elevation),
      skyTemp_K: this.skyTempK_(elevation),
      frequency_GHz: frequency / 1e9,
    };
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
    const eta_surface = Math.exp(-Math.pow((4 * Math.PI * sigma) / lambda, 2));

    // Blockage: simple (1 - ε)² approximation
    const eps = Math.max(0, Math.min(0.3, this.config.blockageFraction ?? 0));
    const eta_block = Math.pow(1 - eps, 2);

    return base * eta_surface * eta_block;
  }

  /**
   * 3 dB beamwidth (degrees)
   * HPBW ≈ k*λ/D where k is typically 70 for parabolic dishes
   */
  private beamwidth3dB_deg_(f_Hz: number): number {
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
    return Math.max(0, 12 * Math.pow(offAxis_deg / bw, 2));
  }

  /**
   * ITU-R 465-type pattern envelope (dBi)
   * Returns gain at off-axis angle including main lobe and sidelobe envelope
   */
  private patternGain_dBi_(theta_deg: number, f_Hz: number): number {
    const Gmax = this.antennaGain_dBi(f_Hz as Hertz);
    const bw = this.beamwidth3dB_deg_(f_Hz);

    // Main lobe approximation (within ~1.2 beamwidths)
    if (theta_deg <= 1.2 * bw) {
      const drop = 12 * Math.pow(theta_deg / bw, 2);
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
  private polMismatchLoss_dB_(
    signalPol: 'H' | 'V' | 'RHCP' | 'LHCP',
    _rxPol: 'linear' | 'circular',
    polarizationMismatch: Degrees
  ): dB {
    if (this.config.polType === 'circular' || signalPol === 'RHCP' || signalPol === 'LHCP') {
      // Circular discrimination
      if (
        (signalPol === 'RHCP' && this.config.polType === 'circular') ||
        (signalPol === 'LHCP' && this.config.polType === 'circular')
      ) {
        return 0.5 as dB; // Small imperfection
      }
      return 3 as dB; // Mismatched handedness
    }

    // Linear: loss ≈ 20*log10|cos(skew)| limited by XPD floor
    const xpd = this.config.xpd_dB ?? 30;
    const cosTerm = Math.abs(Math.cos(polarizationMismatch * Math.PI / 180));
    const ideal = -20 * Math.log10(Math.max(1e-6, cosTerm)); // dB penalty
    return Math.min(xpd, ideal) as dB;
  }

  /**
   * Sky temperature (K) vs elevation - simple C-band model
   * ~8-12 K at zenith, increases at low elevation due to atmospheric path
   */
  private skyTempK_(elev_deg: number): number {
    // sec(z) factor for atmospheric path length
    const secz = 1 / Math.max(0.1, Math.sin(elev_deg * Math.PI / 180));
    return 8 + 4 * (secz - 1); // Tune as needed
  }

  /**
   * Convert loss (dB) at physical temp to equivalent noise temp (K) at LNA input
   * T_equiv = T_phys * (L - 1) where L is linear loss factor
   */
  private noiseFromLossK_(L_dB: number, physK: number = 290): number {
    const L = Math.pow(10, L_dB / 10);
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
    const T = Math.max(Tsys_K, 1);            // K (avoid log of 0)
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
   * Accounts for sky, atmosphere, feed, and LNA contributions
   */
  private systemTempK_(frequency: Hertz, elevation: Degrees): number {
    const Tsky = this.skyTempK_(elevation);
    const Latm = this.calculateAtmosphericLoss_(frequency, elevation);
    const Lfeed = this.feedLossAt_(frequency) + (this.config.rxChainLoss_dB ?? 0);

    const Tant = Tsky + this.noiseFromLossK_(Latm, 260); // Atm ~260 K slab
    const Tfeed = this.noiseFromLossK_(Lfeed, this.config.rxPhysTemp_K ?? 290);

    // LNA noise
    const NF = this.config.lnaNF_dB ?? 1.0;
    const Tlna = 290 * (Math.pow(10, NF / 10) - 1);

    // Friis cascade for noise temps with preceding losses
    const L_atm_linear = Math.pow(10, Latm / 10);
    const L_feed_linear = Math.pow(10, Lfeed / 10);
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
  private applyPropagationEffects_(satellite: Satellite, signal: RfSignal): RfSignal {
    const f_Hz = signal.frequency as number;
    const elev_deg = this.state.elevation;

    // Calculate off-axis angle between antenna pointing and satellite position
    const deltaAz = satellite.az - this.normalizedAzimuth;
    const deltaEl = satellite.el - this.state.elevation;
    const offAxis_deg = Math.hypot(deltaAz, deltaEl);

    // Calculate free-space path loss (downlink from GEO satellite to ground)
    const fspl = this.calculateFreeSpacePathLoss_(signal.frequency, GEO_SATELLITE_DISTANCE_KM);

    // Calculate atmospheric loss using realistic model
    const atmosphericLoss = this.calculateAtmosphericLoss_(signal.frequency, elev_deg);

    // Calculate polarization mismatch loss using new realistic model
    const polarizationLoss = this.polMismatchLoss_dB_(
      signal.polarization as 'H' | 'V' | 'RHCP' | 'LHCP',
      this.config.polType ?? 'linear',
      Math.abs((signal.rotation ?? 0) - this.state.polarization) as Degrees,
    );

    // Use pattern gain (accounts for off-axis angle) instead of just peak gain
    const Grx_dBi = this.patternGain_dBi_(offAxis_deg, f_Hz);

    // Feed loss (frequency-dependent)
    const feedLoss = this.feedLossAt_(f_Hz);

    // Pointing loss (if any off-axis error from wind/jitter)
    const pointingLoss = this.pointingLoss_dB_(offAxis_deg, f_Hz);

    // Apply all losses to signal power
    let receivedPower = signal.power
      - fspl
      - atmosphericLoss
      - polarizationLoss
      - feedLoss
      - pointingLoss
      + Grx_dBi;

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
    if ((frequencyHz < this.config.minRxFrequency || frequencyHz > this.config.maxRxFrequency) &&
      (frequencyHz < this.config.minTxFrequency || frequencyHz > this.config.maxTxFrequency)) {
      console.warn(
        `Warning: Frequency ${f_Hz / 1e9} GHz is outside antenna operating range ` +
        `(${this.config.minRxFrequency / 1e9} - ${this.config.maxRxFrequency / 1e9} GHz for Rx, ` +
        `${this.config.minTxFrequency / 1e9} - ${this.config.maxTxFrequency / 1e9} GHz for Tx). ` +
        `Gain calculation may be inaccurate.`
      );
    }

    // Use new aperture efficiency model (includes Ruze + blockage)
    const lambda = 3e8 / f_Hz;
    const k = Math.PI * (this.config.diameter / lambda);
    const eta = this.apertureEfficiency_(f_Hz);
    const G_linear = eta * (k * k);

    return 10 * Math.log10(G_linear);
  }
}
