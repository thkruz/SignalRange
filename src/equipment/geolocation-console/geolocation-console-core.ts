/**
 * @file GeolocationConsoleCore - Two-satellite geolocation console (Campaign 5)
 * @description Business logic for the interference geolocation console: the
 * operator selects an adjacent satellite, tunes the correlator to the
 * interferer's uplink, and integrates captures while the duty-cycled jammer
 * is transmitting. Successful captures synthesize TDOA/FDOA measurements from
 * the hidden emitter ground truth; COMPUTE FIX runs the weighted solver.
 *
 * Opt-in singleton: only started when the scenario declares
 * `settings.geolocation` (see base-page), so Campaigns 1-4 never construct it.
 * UI concerns live in the Geolocation tab adapter, not here.
 */

import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { InterferenceManager, type InterferenceEventConfig } from '@app/interference/interference-manager';
import { ScenarioManager, type SimulationSettings } from '@app/scenario-manager';
import {
  GeolocationService,
  greatCircleKm,
  type AreaOfInterest,
  type GeolocationFix,
  type GeolocationMeasurement,
} from '@app/services/geolocation-service';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';

/** A measurement plus the console context it was captured under */
export interface ConsoleMeasurement {
  measurement: GeolocationMeasurement;
  /** Adjacent satellite the correlation pair used */
  adjacentNoradId: number;
  /** Interference event the capture correlated against */
  interferenceEventId: string;
}

/**
 * A line of position for map rendering, defined by its constraint: `residual`
 * is zero exactly on the line (predicted minus measured TDOA/FDOA). The map
 * traces the zero contour itself, so lines span the whole view at any zoom.
 */
export interface LopDescriptor {
  kind: 'tdoa' | 'fdoa';
  residual: (lat: number, lon: number) => number;
}

export type CaptureStatus = 'idle' | 'integrating' | 'success' | 'failed';

export interface GeolocationConsoleState {
  selectedAdjacentNoradId: number;
  /** Staged correlator uplink center frequency, MHz */
  stagedFrequencyMHz: number;
  /** Staged correlator bandwidth, MHz */
  stagedBandwidthMHz: number;
  captureStatus: CaptureStatus;
  /** 0-1 progress through the integration window */
  captureProgress: number;
  /** Operator-facing result line for the last capture attempt */
  lastCaptureMessage: string;
  /** Auto-capture loop active (keeps retrying through the interferer duty cycle) */
  autoCapture: boolean;
  measurements: ConsoleMeasurement[];
  fix: GeolocationFix | null;
  /** Great-circle miss distance of the current fix vs truth, km (grading) */
  fixErrorKm: number | null;
}

/** Fraction of the integration window the interferer must be transmitting */
const MIN_ON_FRACTION = 0.7;
const DEFAULT_CAPTURE_WINDOW_S = 10;
/** Staged bandwidth must be within this factor of the interferer bandwidth */
const BANDWIDTH_MATCH_FACTOR = 2;
/** Runaway guard: auto-capture stops itself after this many measurements */
const AUTO_CAPTURE_MAX = 40;

export class GeolocationConsoleCore {
  private static instance_: GeolocationConsoleCore | null = null;

  private readonly config_: NonNullable<SimulationSettings['geolocation']>;
  private readonly primary_: OrbitalSatellite | null;
  private readonly adjacents_: OrbitalSatellite[];
  private readonly stationLocation_: { lat: number; lon: number; altKm: number } | null;
  /** One service per adjacent satellite (a correlation pair is sat-specific) */
  private readonly services_ = new Map<number, GeolocationService>();
  private readonly boundUpdateHandler_: () => void;

  private selectedAdjacentNoradId_: number;
  private stagedFrequencyMHz_ = 6000;
  private stagedBandwidthMHz_ = 5;
  private captureStatus_: CaptureStatus = 'idle';
  private captureStartMs_ = 0;
  private captureProgress_ = 0;
  private captureTicks_ = 0;
  private captureActiveTicks_ = 0;
  private lastCaptureMessage_ = '';
  private autoCapture_ = false;
  private measurements_: ConsoleMeasurement[] = [];
  private fix_: GeolocationFix | null = null;
  private fixErrorKm_: number | null = null;

  private constructor() {
    const settings = ScenarioManager.getInstance().settings;
    if (!settings.geolocation) {
      throw new Error('GeolocationConsoleCore requires settings.geolocation');
    }
    this.config_ = settings.geolocation;

    const sim = SimulationManager.getInstance();
    this.primary_ = GeolocationConsoleCore.findOrbital_(sim, this.config_.primaryNoradId);
    this.adjacents_ = this.config_.adjacentNoradIds
      .map((noradId) => GeolocationConsoleCore.findOrbital_(sim, noradId))
      .filter((sat): sat is OrbitalSatellite => sat !== null);
    this.selectedAdjacentNoradId_ = this.adjacents_[0]?.noradId ?? 0;

    const stationConfig = settings.groundStations[0];
    this.stationLocation_ = stationConfig
      ? {
        lat: stationConfig.location.latitude,
        lon: stationConfig.location.longitude,
        altKm: (stationConfig.location.elevation ?? 0) / 1000,
      }
      : null;

    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): GeolocationConsoleCore {
    this.instance_ ??= new GeolocationConsoleCore();
    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  // ── State access ──────────────────────────────────────────────────────────

  get state(): GeolocationConsoleState {
    return {
      selectedAdjacentNoradId: this.selectedAdjacentNoradId_,
      stagedFrequencyMHz: this.stagedFrequencyMHz_,
      stagedBandwidthMHz: this.stagedBandwidthMHz_,
      captureStatus: this.captureStatus_,
      captureProgress: this.captureProgress_,
      lastCaptureMessage: this.lastCaptureMessage_,
      autoCapture: this.autoCapture_,
      measurements: this.measurements_,
      fix: this.fix_,
      fixErrorKm: this.fixErrorKm_,
    };
  }

  get areaOfInterest(): AreaOfInterest {
    return this.config_.areaOfInterest;
  }

  get primarySatellite(): OrbitalSatellite | null {
    return this.primary_;
  }

  get adjacentSatellites(): OrbitalSatellite[] {
    return this.adjacents_;
  }

  /** Measurements captured with the currently selected correlation pair */
  get pairMeasurements(): ConsoleMeasurement[] {
    return this.measurements_.filter((m) => m.adjacentNoradId === this.selectedAdjacentNoradId_);
  }

  /**
   * TDOA/FDOA line-of-position descriptors for the current pair's
   * measurements, for the map to trace. Each residual is bound to the
   * measurement's epoch and the currently selected correlation service.
   */
  getLopDescriptors(): LopDescriptor[] {
    const service = this.getService_();
    if (!service) {
      return [];
    }

    return this.pairMeasurements.flatMap(({ measurement }): LopDescriptor[] => [
      { kind: 'tdoa', residual: (lat, lon) => service.lopResidual(measurement, 'tdoa', lat, lon) },
      { kind: 'fdoa', residual: (lat, lon) => service.lopResidual(measurement, 'fdoa', lat, lon) },
    ]);
  }

  // ── Operator actions (called by the tab adapter) ──────────────────────────

  selectAdjacent(noradId: number): void {
    if (this.adjacents_.some((sat) => sat.noradId === noradId)) {
      this.selectedAdjacentNoradId_ = noradId;
    }
  }

  setStagedFrequencyMHz(valueMHz: number): void {
    this.stagedFrequencyMHz_ = Math.max(0, valueMHz);
  }

  adjustStagedFrequencyMHz(deltaMHz: number): void {
    this.setStagedFrequencyMHz(this.stagedFrequencyMHz_ + deltaMHz);
  }

  setStagedBandwidthMHz(valueMHz: number): void {
    this.stagedBandwidthMHz_ = Math.min(100, Math.max(0.1, valueMHz));
  }

  adjustStagedBandwidthMHz(deltaMHz: number): void {
    this.setStagedBandwidthMHz(this.stagedBandwidthMHz_ + deltaMHz);
  }

  /** Begin a correlation capture (integrates over the configured window) */
  startCapture(): void {
    if (this.captureStatus_ === 'integrating') {
      return;
    }
    if (!this.primary_ || !this.getSelectedAdjacent_() || !this.stationLocation_) {
      this.captureStatus_ = 'failed';
      this.lastCaptureMessage_ = 'CORRELATOR FAULT - satellite pair unavailable';
      return;
    }

    this.captureStatus_ = 'integrating';
    this.captureStartMs_ = getSimulatedNowMs();
    this.captureProgress_ = 0;
    this.captureTicks_ = 0;
    this.captureActiveTicks_ = 0;
    this.lastCaptureMessage_ = this.autoCapture_ ? 'AUTO: integrating...' : 'INTEGRATING...';
  }

  /**
   * Enable/disable auto-capture: while on, the console keeps launching captures
   * back to back, so it grabs measurements whenever the interferer is
   * transmitting and simply retries through its off windows. It runs until the
   * operator toggles it off (or CLEAR), with a runaway guard at
   * AUTO_CAPTURE_MAX measurements.
   */
  setAutoCapture(on: boolean): void {
    this.autoCapture_ = on;
    if (on && this.captureStatus_ !== 'integrating') {
      this.startCapture();
    }
  }

  toggleAutoCapture(): void {
    this.setAutoCapture(!this.autoCapture_);
  }

  /** Run the solver over the current pair's measurements */
  computeFix(): void {
    const service = this.getService_();
    if (!service) {
      return;
    }

    const pair = this.pairMeasurements;
    this.fix_ = service.solve(pair.map((m) => m.measurement), this.config_.areaOfInterest);
    this.fixErrorKm_ = null;

    if (this.fix_ && pair.length > 0) {
      const event = InterferenceManager.getInstance().getEvent(pair[pair.length - 1].interferenceEventId);
      if (event?.emitter) {
        this.fixErrorKm_ = greatCircleKm(
          { lat: this.fix_.lat, lon: this.fix_.lon },
          { lat: event.emitter.latitude, lon: event.emitter.longitude },
        );
      }
    }
  }

  clearMeasurements(): void {
    this.measurements_ = [];
    this.fix_ = null;
    this.fixErrorKm_ = null;
    this.lastCaptureMessage_ = '';
    this.captureStatus_ = 'idle';
    this.autoCapture_ = false;
  }

  // ── Simulation tick ───────────────────────────────────────────────────────

  private update_(): void {
    if (this.captureStatus_ !== 'integrating') {
      return;
    }

    const windowMs = (this.config_.captureWindowS ?? DEFAULT_CAPTURE_WINDOW_S) * 1000;
    const elapsed = getSimulatedNowMs() - this.captureStartMs_;
    this.captureProgress_ = Math.min(1, Math.max(0, elapsed / windowMs));

    this.captureTicks_++;
    if (this.findTunedActiveEvent_() !== null) {
      this.captureActiveTicks_++;
    }

    if (elapsed >= windowMs) {
      this.finishCapture_();

      // Auto-capture: immediately launch the next attempt so the console keeps
      // trying across the interferer's on/off cycle until the operator stops it
      // (the guard just prevents an unattended runaway).
      if (this.autoCapture_) {
        if (this.pairMeasurements.length >= AUTO_CAPTURE_MAX) {
          this.autoCapture_ = false;
          this.lastCaptureMessage_ = `AUTO stopped: ${this.pairMeasurements.length} measurements collected`;
        } else {
          this.startCapture();
        }
      }
    }
  }

  private finishCapture_(): void {
    const event = this.findTunedEvent_();
    const onFraction = this.captureTicks_ > 0 ? this.captureActiveTicks_ / this.captureTicks_ : 0;

    if (!event) {
      this.captureStatus_ = 'failed';
      this.lastCaptureMessage_ = 'NO CORRELATION - check target frequency and bandwidth';
      return;
    }
    if (onFraction < MIN_ON_FRACTION) {
      this.captureStatus_ = 'failed';
      this.lastCaptureMessage_ = 'NO CORRELATION - interferer not transmitting during integration';
      return;
    }

    const service = this.getService_();
    if (!service || !event.emitter) {
      this.captureStatus_ = 'failed';
      this.lastCaptureMessage_ = 'CORRELATOR FAULT - satellite pair unavailable';
      return;
    }

    const windowMs = (this.config_.captureWindowS ?? DEFAULT_CAPTURE_WINDOW_S) * 1000;
    const midpointMs = this.captureStartMs_ + windowMs / 2;
    const measurement = service.synthesizeMeasurement(
      { lat: event.emitter.latitude, lon: event.emitter.longitude, altKm: event.emitter.altitudeKm ?? 0 },
      midpointMs,
      event.frequency,
      this.config_.tdoaSigmaS,
      this.config_.fdoaSigmaHz,
      this.measurements_.length + 1,
    );

    this.measurements_.push({
      measurement,
      adjacentNoradId: this.selectedAdjacentNoradId_,
      interferenceEventId: event.id,
    });

    this.captureStatus_ = 'success';
    this.lastCaptureMessage_ =
      `CAPTURE ${measurement.id}: TDOA ${(measurement.tdoaS * 1e6).toFixed(2)} us / ` +
      `FDOA ${measurement.fdoaHz.toFixed(1)} Hz`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Emitter-bearing event on the primary satellite matching the staged tuning */
  private findTunedEvent_(): InterferenceEventConfig | null {
    const stagedHz = this.stagedFrequencyMHz_ * 1e6;
    const stagedBwHz = this.stagedBandwidthMHz_ * 1e6;

    for (const event of InterferenceManager.getInstance().getEventsWithEmitters()) {
      if (event.satelliteNoradId !== this.config_.primaryNoradId) continue;
      if (Math.abs(event.frequency - stagedHz) > event.bandwidth / 2) continue;
      if (stagedBwHz > event.bandwidth * BANDWIDTH_MATCH_FACTOR) continue;
      if (stagedBwHz < event.bandwidth / BANDWIDTH_MATCH_FACTOR) continue;
      return event;
    }

    return null;
  }

  private findTunedActiveEvent_(): InterferenceEventConfig | null {
    const event = this.findTunedEvent_();

    return event && InterferenceManager.getInstance().isEventActive(event.id) ? event : null;
  }

  private getSelectedAdjacent_(): OrbitalSatellite | null {
    return this.adjacents_.find((sat) => sat.noradId === this.selectedAdjacentNoradId_) ?? null;
  }

  private getService_(): GeolocationService | null {
    const adjacent = this.getSelectedAdjacent_();
    if (!this.primary_ || !adjacent || !this.stationLocation_) {
      return null;
    }

    let service = this.services_.get(adjacent.noradId);
    if (!service) {
      service = new GeolocationService(this.primary_, adjacent, {
        lat: this.stationLocation_.lat,
        lon: this.stationLocation_.lon,
        altKm: this.stationLocation_.altKm,
      });
      this.services_.set(adjacent.noradId, service);
    }

    return service;
  }

  private static findOrbital_(sim: SimulationManager, noradId: number): OrbitalSatellite | null {
    const satellite = sim.satellites.find((sat) => sat.noradId === noradId);

    return satellite instanceof OrbitalSatellite ? satellite : null;
  }
}
