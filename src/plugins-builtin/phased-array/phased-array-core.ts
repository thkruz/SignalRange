/**
 * PhasedArrayCore (P1): a flat-panel, electronically steered antenna.
 *
 * Extends the headless antenna class through the protected hooks only. The
 * az/el state is the BEAM direction, not the panel's. The panel normal is
 * fixed (config `panelAz_deg`, `panelTilt_deg`). Beam moves are electronic: no
 * mechanical slew, a few ms of settle that the handover outage covers.
 *
 * Scan loss: G(theta_s) = G0 + 10 n log10(cos theta_s), theta_s measured from
 * the panel normal. The 3 dB beamwidth grows as 1/cos(theta_s). Beyond
 * `maxScanDeg` the beam cannot point and the target is dropped. Off the main
 * beam the pattern is a flat floor relative to the scanned peak, not S.580.
 */

import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaCore, type AntennaState, type TrackingMode } from '@app/equipment/antenna/antenna-core';
import type { AntennaConfigId } from '@app/equipment/antenna/antenna-registry';
import type { Satellite } from '@app/equipment/satellite/satellite';
import { noiseFigureToK } from '@app/simulation/noise-model';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import type { Hertz, RfSignal } from '@app/types';
import type { Degrees } from 'ootk';
import { type BeamMode, BeamScheduler, type BeamSchedulerConfig, type LinkDropRecord, type LockResult, type SchedulerSnapshot, type SkySource } from './beam-scheduler';
import { ExclusionZoneSet, GeoArcExclusionZone } from './exclusion-zones';
import { KU_PHASED_ARRAY_UT_CONFIG, type PhasedArrayConfig } from './phased-array-config';
import { PanelGeometry } from './scan-geometry';
import { SimSkySource } from './sim-sky-source';

/** The beam does not broaden by more than 1 / cos(theta) at this scan angle (guards the cos -> 0 singularity) */
const MIN_COS_SCAN = 0.05;

/** Everything the Array Control page (WP4) reads, rebuilt per call from cached scheduler output (about 1 Hz fresh). */
export interface PhasedArrayReadModel extends SchedulerSnapshot {
  /** Beam direction now */
  beam: { az: number; el: number };
  inOutage: boolean;
  outageRemainingMs: number;
  /** Angle of the beam from the panel normal, degrees */
  scanAngleDeg: number;
  /** Gain given up to scanning, dB (positive number) */
  scanLossDb: number;
  maxScanDeg: number;
  /** 3 dB beamwidth at the scanned angle, degrees */
  beamwidthDeg: number;
  /** Peak gain at the scanned angle, dBi (after scan loss) */
  gainDbi: number;
  /** G/T now, dB/K, at the receive band centre */
  gOverTDbK: number;
  geoArc: {
    enabled: boolean;
    widthDeg: number;
    beamInGeoArc: boolean;
    /** Angle from the beam to the nearest point of the visible GEO arc, degrees (Infinity with no arc) */
    separationDeg: number;
    /** Pattern level toward that arc point relative to the scanned peak, dB (0 on the main beam, negative off it) */
    levelTowardArcDb: number;
  };
  /** Last moment the link dropped, or null */
  lastLinkDrop: LinkDropRecord | null;
  panel: { azDeg: number; tiltDeg: number };
}

export class PhasedArrayCore extends AntennaCore {
  private readonly arrayConfig_: PhasedArrayConfig;
  private readonly panel_: PanelGeometry;
  private readonly zones_ = new ExclusionZoneSet();
  private geoZone_: GeoArcExclusionZone | null = null;
  private geoZoneKey_ = '';
  private geoEnabled_ = true;
  private geoWidthDeg_ = GeoArcExclusionZone.DEFAULT_WIDTH_DEG;
  private readonly scheduler_: BeamScheduler;
  private lastSimMs_ = 0;

  constructor(
    configId: AntennaConfigId = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId = 1,
    serverId = 1,
    schedulerConfig: Partial<BeamSchedulerConfig> = {}
  ) {
    super(configId, initialState, teamId, serverId);
    const base = KU_PHASED_ARRAY_UT_CONFIG;
    const c = this.config as Partial<PhasedArrayConfig>;

    this.arrayConfig_ = {
      ...this.config,
      panelAz_deg: c.panelAz_deg ?? base.panelAz_deg,
      panelTilt_deg: c.panelTilt_deg ?? base.panelTilt_deg,
      maxScanDeg: c.maxScanDeg ?? base.maxScanDeg,
      scanLossExponent: c.scanLossExponent ?? base.scanLossExponent,
      sidelobeFloor_dBc: c.sidelobeFloor_dBc ?? base.sidelobeFloor_dBc,
      handoverOutageMs: c.handoverOutageMs ?? base.handoverOutageMs,
      beamSettleMs: c.beamSettleMs ?? base.beamSettleMs,
      servedConstellations: c.servedConstellations ?? base.servedConstellations,
    };
    this.panel_ = new PanelGeometry(this.arrayConfig_.panelAz_deg, this.arrayConfig_.panelTilt_deg, this.arrayConfig_.maxScanDeg);
    this.scheduler_ = new BeamScheduler(
      new SimSkySource({
        servedConstellations: this.arrayConfig_.servedConstellations,
        location: () => this.stationLocation_,
        viewOf: (sat: Satellite) => this.viewOf(sat),
      }),
      this.panel_,
      (az, el) => this.zones_.isExcluded(az, el),
      { handoverOutageMs: Math.max(this.arrayConfig_.handoverOutageMs, this.arrayConfig_.beamSettleMs), ...schedulerConfig }
    );
    this.setBeamState_(this.panel_.normalAzEl.az, this.panel_.normalAzEl.el);
  }

  // ── headless UI stubs (the Array Control page owns the DOM) ───────────────

  protected override initializeDom(_parentId: string): HTMLElement {
    const container = document.createElement('div') as unknown as HTMLElement;

    container.id = `antenna-headless-${this.uuid}`;
    container.className = 'antenna-headless';
    container.style.display = 'none';
    document.body.appendChild(container);
    this.domCache['parent'] = container;

    return container;
  }

  /** Build the hidden DOM stub (the factory calls this; `build` itself is protected). */
  buildHeadless(parentId: string): void {
    this.build(parentId);
  }

  protected override addListeners_(): void {
    // No DOM
  }

  syncDomWithState(): void {
    // No DOM
  }

  draw(): void {
    // No DOM
  }

  // ── gain model ────────────────────────────────────────────────────────────

  get panelGeometry(): PanelGeometry {
    return this.panel_;
  }

  get phasedArrayConfig(): Readonly<PhasedArrayConfig> {
    return this.arrayConfig_;
  }

  /** Angle of the beam from the panel normal, degrees. */
  get scanAngleDeg(): number {
    return this.panel_.scanAngleDeg(this.normalizedAzimuth, this.state.elevation);
  }

  /** Scan loss at a scan angle, dB (positive). Gain falls by 10 n log10(cos theta_s). */
  scanLossDbAt(scanAngleDeg: number): number {
    const theta = Math.min(Math.max(scanAngleDeg, 0), this.arrayConfig_.maxScanDeg);

    return -10 * this.arrayConfig_.scanLossExponent * Math.log10(Math.max(MIN_COS_SCAN, Math.cos((theta * Math.PI) / 180)));
  }

  /** Scan loss at the current beam direction, dB (positive). */
  get scanLossDb(): number {
    return this.scanLossDbAt(this.scanAngleDeg);
  }

  /** Boresight gain: panel peak less the scan loss of the current beam direction. */
  protected override antennaGain_dBi(frequencyHz: Hertz): number {
    return super.antennaGain_dBi(frequencyHz) - this.scanLossDb;
  }

  /** The 3 dB beamwidth broadens as 1 / cos(theta_s). */
  protected override beamwidth3dB_deg_(f_Hz: number): number {
    const theta = Math.min(this.scanAngleDeg, this.arrayConfig_.maxScanDeg);

    return super.beamwidth3dB_deg_(f_Hz) / Math.max(MIN_COS_SCAN, Math.cos((theta * Math.PI) / 180));
  }

  /** Main lobe from the scanned peak, then a flat floor relative to that peak (no S.580 envelope). */
  protected override patternGain_dBi_(theta_deg: number, f_Hz: number): number {
    const peak = this.antennaGain_dBi(f_Hz as Hertz);
    const bw = this.beamwidth3dB_deg_(f_Hz);
    const mainLobe = peak - 12 * (theta_deg / bw) ** 2;

    return Math.min(peak, Math.max(mainLobe, peak + this.arrayConfig_.sidelobeFloor_dBc));
  }

  /**
   * The panel has its own integrated LNA and beamformer, so its receive noise is
   * the config LNA, not the station's LNB module (a 4.5 m station LNB would
   * otherwise set the terminal's noise).
   */
  protected override receiverNoiseK_(): number {
    return noiseFigureToK(this.config.lnaNF_dB ?? 2.0);
  }

  /**
   * No aggregate sidelobe noise from the terminal's own network. The other
   * satellites of the network are scheduled around the terminal in time and
   * frequency; they are not co-channel interferers. (The generic aggregate would
   * add several hundred K and pull G/T to about 3 dB/K.)
   */
  override aggregateNoiseK(_frequency: number): number {
    return 0;
  }

  /** No servo, no wind load: the panel does not move. */
  override get windDePointingDeg(): number {
    return 0;
  }

  /** While the beam is dead after a handover nothing is received. */
  override get rxSignals(): { sat: Satellite; signal: RfSignal; view: ReturnType<AntennaCore['viewOf']> }[] {
    return this.isInOutage ? [] : super.rxSignals;
  }

  // ── ACU-only behaviours: neutral for a flat panel ────────────────────────

  override handleHeaterToggle(_enabled: boolean): void {
    // The panel is self-heating; no operator control
  }

  override handleRainBlowerToggle(_enabled: boolean): void {
    // No feed horn to blow
  }

  override updateIceAccumulation(_degradation_dB: number): void {
    // A heated flat panel does not ice up
    this.state.iceAccumulation_dB = 0;
  }

  override handleStepTrackToggle(_enabled: boolean): void {
    // Electronic beam: no step track
  }

  override startStepTrack(): void {
    // No step track
  }

  override moveToTargetSatellite(): void {
    // Handled by the beam scheduler
  }

  override handleAzimuthChange(_value: number): void {
    // The beam is pointed by the scheduler, not jogged
  }

  override handleElevationChange(_value: number): void {
    // The beam is pointed by the scheduler, not jogged
  }

  /** ACU mode buttons map onto the scheduler: STOW and MAINT park the beam, program-track is auto, manual keeps the current lock. */
  override handleTrackingModeChange(mode: TrackingMode): void {
    if (mode === 'stow' || mode === 'maintenance') {
      this.scheduler_.stow();
    } else if (mode === 'program-track') {
      this.scheduler_.setMode('auto');
    } else {
      this.scheduler_.setMode(this.scheduler_.targetNorad === null ? 'auto' : 'manual');
    }
    this.syncTrackingState_();
  }

  /** Selecting a target satellite is a manual lock; null returns to auto. */
  override handleTargetSatelliteChange(noradId: number | null): void {
    if (noradId === null) {
      this.setBeamMode('auto');

      return;
    }
    this.lock(noradId);
  }

  // ── beam scheduler API ────────────────────────────────────────────────────

  get beamMode(): BeamMode {
    return this.scheduler_.mode;
  }

  setBeamMode(mode: BeamMode): void {
    this.scheduler_.setMode(mode);
    this.syncTrackingState_();
  }

  /** Manual mode: lock the beam on a satellite. Refused outside the scan cone or inside an enabled exclusion zone. */
  lock(norad: number): LockResult {
    const result = this.scheduler_.lock(norad, this.currentSimMs_());

    if (result.ok) {
      this.setBeamState_(this.scheduler_.beam.az, this.scheduler_.beam.el);
    }
    this.syncTrackingState_();

    return result;
  }

  /** Park the beam on the panel normal. */
  stow(): void {
    this.setBeamMode('stow');
  }

  /** True while the beam is dead after a handover (or a new lock). */
  get isInOutage(): boolean {
    return this.scheduler_.isInOutage(this.lastSimMs_ || this.currentSimMs_());
  }

  /** Swap the satellite source (tests, alternative sky models). */
  setSkySource(source: SkySource): void {
    this.scheduler_.setSource(source);
  }

  get scheduler(): BeamScheduler {
    return this.scheduler_;
  }

  // ── exclusion zones (P3) ──────────────────────────────────────────────────

  get exclusionZones(): ExclusionZoneSet {
    return this.zones_;
  }

  /** Turn the GEO arc protection band on or off. */
  setGeoArcEnabled(enabled: boolean): void {
    this.geoEnabled_ = enabled;
    if (this.geoZone_) {
      this.geoZone_.enabled = enabled;
    }
    this.scheduler_.invalidate();
  }

  get geoArcEnabled(): boolean {
    return this.geoEnabled_;
  }

  /** Width of the GEO arc band either side of the arc, degrees. */
  setGeoArcWidthDeg(deg: number): void {
    if (!Number.isFinite(deg)) {
      return;
    }
    this.geoWidthDeg_ = Math.max(GeoArcExclusionZone.MIN_WIDTH_DEG, Math.min(GeoArcExclusionZone.MAX_WIDTH_DEG, deg));
    this.geoZone_?.setWidthDeg(this.geoWidthDeg_);
    this.scheduler_.invalidate();
  }

  get geoArcWidthDeg(): number {
    return this.geoWidthDeg_;
  }

  /** The GEO arc zone for this station, or null until the station location is attached. */
  get geoArcZone(): GeoArcExclusionZone | null {
    return this.ensureGeoZone_();
  }

  /**
   * True when the beam points inside the GEO arc band right now. Answers
   * regardless of whether the exclusion zone is enabled, so the WP5 warning
   * can fire while the player has the protection switched off.
   */
  isBeamInGeoArc(): boolean {
    const zone = this.ensureGeoZone_();

    return zone ? zone.contains(this.normalizedAzimuth, this.state.elevation) : false;
  }

  override attachStationLocation(latitude: number, longitude: number, elevationM = 0): void {
    super.attachStationLocation(latitude, longitude, elevationM);
    this.geoZone_ = null;
    this.geoZoneKey_ = '';
    this.scheduler_.invalidate();
  }

  private ensureGeoZone_(): GeoArcExclusionZone | null {
    const loc = this.stationLocation_;

    if (!loc) {
      return null;
    }
    const key = `${loc.latitude}|${loc.longitude}|${loc.elevationM}`;

    if (!this.geoZone_ || this.geoZoneKey_ !== key) {
      const zone = new GeoArcExclusionZone(loc.latitude, loc.longitude, loc.elevationM / 1000);

      zone.enabled = this.geoEnabled_;
      zone.setWidthDeg(this.geoWidthDeg_);
      this.zones_.replace(zone);
      this.geoZone_ = zone;
      this.geoZoneKey_ = key;
    }

    return this.geoZone_;
  }

  /** Predicted sky path of the current target over the next spanMs (empty with no target). */
  getTargetTrack(spanMs = 5 * 60_000, stepMs = 15_000): { az: number; el: number }[] {
    const norad = this.scheduler_.targetNorad;

    return norad === null ? [] : this.scheduler_.predictTrack(norad, this.lastSimMs_ || this.currentSimMs_(), spanMs, stepMs);
  }

  // ── read model (WP4) ──────────────────────────────────────────────────────

  /** Everything the Array Control page shows, from cached scheduler output (visible list and predictions refresh at about 1 Hz). */
  getReadModel(): PhasedArrayReadModel {
    this.ensureGeoZone_();
    const snap = this.scheduler_.snapshot();
    const f = this.noiseReferenceHz as Hertz;
    const simMs = this.lastSimMs_ || this.currentSimMs_();
    const outage = this.scheduler_.isInOutage(simMs);
    const m = this.state.rfMetrics;

    return {
      ...snap,
      beam: { az: this.normalizedAzimuth, el: this.state.elevation },
      inOutage: outage,
      outageRemainingMs: this.scheduler_.outageRemainingMs(simMs),
      scanAngleDeg: this.scanAngleDeg,
      scanLossDb: this.scanLossDb,
      maxScanDeg: this.arrayConfig_.maxScanDeg,
      beamwidthDeg: this.beamwidth3dB_deg_(f),
      gainDbi: this.antennaGain_dBi(f),
      gOverTDbK: m ? m.gOverT_dBK : Number.NaN,
      geoArc: { enabled: this.geoEnabled_, widthDeg: this.geoWidthDeg_, beamInGeoArc: this.isBeamInGeoArc(), ...this.geoSeparation_(f) },
      lastLinkDrop: this.scheduler_.linkDrops[this.scheduler_.linkDrops.length - 1] ?? null,
      panel: { azDeg: this.arrayConfig_.panelAz_deg, tiltDeg: this.arrayConfig_.panelTilt_deg },
    };
  }

  /** Angle to the nearest GEO arc point and the pattern level toward it relative to the scanned peak. */
  private geoSeparation_(f: Hertz): { separationDeg: number; levelTowardArcDb: number } {
    const zone = this.geoZone_;
    const separationDeg = zone ? zone.distanceToArcDeg(this.normalizedAzimuth, this.state.elevation) : Number.POSITIVE_INFINITY;
    const levelTowardArcDb = Number.isFinite(separationDeg) ? this.patternGain_dBi_(separationDeg, f) - this.antennaGain_dBi(f) : Number.NEGATIVE_INFINITY;

    return { separationDeg, levelTowardArcDb };
  }

  /** Every moment the link dropped, oldest first. */
  get linkDrops(): readonly LinkDropRecord[] {
    return this.scheduler_.linkDrops;
  }

  // ── update ────────────────────────────────────────────────────────────────

  override update(dtMs?: number): void {
    this.ensureGeoZone_();
    const simMs = this.currentSimMs_();

    this.lastSimMs_ = simMs;
    if (this.state.isPowered && this.state.isOperational) {
      this.scheduler_.update(simMs);
    }
    const beam = this.scheduler_.beam;

    this.setBeamState_(beam.az, beam.el);
    this.syncTrackingState_();
    super.update(dtMs);
  }

  /** Beam direction into the shared state; the servo target equals it, so the inherited slew has nothing to do. */
  private setBeamState_(az: number, el: number): void {
    this.state.azimuth = az as Degrees;
    this.state.elevation = el as Degrees;
    this.state.targetAzimuth = az as Degrees;
    this.state.targetElevation = el as Degrees;
    this.state.isSlewing = false;
  }

  private syncTrackingState_(): void {
    const mode = this.scheduler_.mode;

    this.state.trackingMode = mode === 'stow' ? 'stow' : 'manual';
    this.state.targetSatelliteId = this.scheduler_.targetNorad;
    this.state.isLocked = this.scheduler_.targetNorad !== null && !this.isInOutage;
  }

  private currentSimMs_(): number {
    return getSimulatedNowMs();
  }
}
