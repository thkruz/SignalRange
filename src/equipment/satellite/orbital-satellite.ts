/**
 * @file OrbitalSatellite - SGP4-propagated satellite (Campaign 2+)
 * @description Extends the legacy fixed-telemetry Satellite with real orbital
 * mechanics from ootk. Position (ECI + ground-station-relative az/el/range) is
 * propagated from a TLE against the simulated scenario clock, so LEO passes,
 * slant-range path loss, and Doppler shift are physically realistic.
 *
 * Campaign 1 scenarios never instantiate this class, so all legacy behavior
 * (fixed GEO az/el, figure-8 geosync, constant GEO slant range) is preserved.
 *
 * Observers. The satellite keeps one canonical observer (the station named in
 * its config) behind `az`/`el`/`rangeKm`/`dopplerFactor`/`txSignal`, so every
 * consumer written against those fields keeps working. A multi-station
 * scenario additionally asks for the satellite as seen from ANY station through
 * `geometryFor(observer)` / `txSignalsFor(observer)` (phase 16, E1): two sites
 * see one LEO at different az/el/range/Doppler, and a Shetland antenna must
 * track and hear the bird from Shetland, not from Galway.
 *
 * Prediction vs truth (phase 16, S7). The satellite carries two element sets:
 * the orbit it is really in (`ootkSatellite`, everything the RF chain sees)
 * and the set the ground station has on file (`predictionSatellite`, what
 * program-track points at and the pass planner predicts from). They are the
 * same object until a manoeuvre (`maneuverTo`) moves the spacecraft off the
 * station's set; loading the updated ephemeris (`reloadTle`) puts the station
 * back on the truth. Between the two the pedestal reads LOCKED on a prediction
 * while the beacon is somewhere else, which is what a stale element set feels
 * like at a 4 m Ku beamwidth.
 */

import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { Hertz, RfFrequency, RfSignal } from '@app/types';
import { Degrees, EciVec3, GroundObject, Kilometers, KilometersPerSecond, LlaVec3, Satellite as OotkSatellite, TleLine1, TleLine2, Vec3 } from 'ootk';
import { Satellite, SatelliteState } from './satellite';

/** Geodetic location of the ground station observing this satellite. */
export interface OrbitalObserver {
  name?: string;
  lat: Degrees;
  lon: Degrees;
  /** Altitude above the WGS-84 ellipsoid in km */
  alt: Kilometers;
}

/** Configuration for an SGP4-propagated satellite. */
export interface OrbitalSatelliteConfig {
  /** TLE line 1 */
  tle1: TleLine1;
  /** TLE line 2 */
  tle2: TleLine2;
  /** Ground station the relative az/el/range telemetry is computed against */
  observer: OrbitalObserver;
  /**
   * Apply Doppler shift to downlink signal frequencies based on range rate.
   * Default: true. Uplink Doppler is not modeled.
   */
  isDopplerEnabled?: boolean;
  /** Elevation below which the satellite's signals are not receivable. Default: 0 deg */
  minElevation?: Degrees;
}

/** The satellite as seen from one observer at the last propagation time. */
export interface ObserverGeometry {
  az: Degrees;
  el: Degrees;
  rangeKm: Kilometers;
  /** observed = transmitted * factor; 1 when Doppler is disabled */
  dopplerFactor: number;
  /** Above the satellite's minimum receivable elevation for this observer */
  isAboveHorizon: boolean;
}

/**
 * Build an observer from a ground station's configured location. Station
 * elevation is authored in metres; ootk wants kilometres.
 */
export function observerFromLocation(location: { latitude: number; longitude: number; elevation?: number }, name?: string): OrbitalObserver {
  return {
    name,
    lat: location.latitude as Degrees,
    lon: location.longitude as Degrees,
    alt: ((location.elevation ?? 0) / 1000) as Kilometers,
  };
}

function observerKey_(observer: OrbitalObserver): string {
  return `${(observer.lat as number).toFixed(5)},${(observer.lon as number).toFixed(5)},${(observer.alt as number).toFixed(3)}`;
}

const groundObjects_ = new Map<string, GroundObject>();

/** ootk GroundObject for an observer, shared across satellites (pure geometry). */
export function groundObjectFor(observer: OrbitalObserver): GroundObject {
  const key = observerKey_(observer);
  let ground = groundObjects_.get(key);
  if (!ground) {
    ground = new GroundObject({
      name: observer.name ?? 'Ground Station',
      lat: observer.lat,
      lon: observer.lon,
      alt: observer.alt,
    });
    groundObjects_.set(key, ground);
  }
  return ground;
}

/**
 * A satellite whose position comes from real SGP4 propagation of a TLE.
 *
 * On every throttled position update the satellite:
 * - propagates to the current simulated time (scenario clock),
 * - refreshes `az`/`el` (all existing consumers keep working unchanged),
 * - refreshes `rangeKm` so the antenna computes true slant-range FSPL,
 * - caches ECI/LLA state for dashboards and mission planning,
 * - computes the Doppler factor applied to downlink signals.
 *
 * Below `minElevation` the satellite transmits nothing (LOS behavior).
 */
export class OrbitalSatellite extends Satellite {
  private ootkSat_: OotkSatellite;
  /** The station's element set: program-track and pass prediction read this. */
  private predictionSat_: OotkSatellite;
  private readonly observer_: GroundObject;
  private readonly observerConfig_: OrbitalObserver;
  private readonly isDopplerEnabled_: boolean;
  private readonly minElevation_: Degrees;

  /** Simulated time the canonical telemetry was last propagated to */
  private propagatedAtMs_ = 0;
  /**
   * Downlink signals before the canonical horizon gate and Doppler shift are
   * applied, so per-observer views can apply their own.
   */
  private rawTxSignal_: RfSignal[] = [];
  /** Per-observer geometry, valid for one propagation time */
  private readonly observerCache_ = new Map<string, { atMs: number; geometry: ObserverGeometry }>();
  /** Per-observer predicted pointing from the station's element set, valid for one propagation time */
  private readonly predictionCache_ = new Map<string, { atMs: number; az: Degrees; el: Degrees }>();

  /** Current ECI position (km), null until first successful propagation */
  eciPosition: EciVec3<Kilometers> | null = null;
  /** Current ECI velocity (km/s), null until first successful propagation */
  eciVelocity: Vec3<KilometersPerSecond> | null = null;
  /** Current geodetic position, null until first successful propagation */
  lla: LlaVec3<Degrees, Kilometers> | null = null;
  /** Current Doppler factor (observed = transmitted * factor), 1 when unavailable */
  dopplerFactor: number = 1;

  constructor(name: string, norad: number, rxSignal: RfSignal[], beaconSignal: RfSignal[], orbitalConfig: OrbitalSatelliteConfig, satelliteState: Partial<SatelliteState> = {}) {
    super(name, norad, rxSignal, beaconSignal, {
      az: 0 as Degrees,
      el: 0 as Degrees,
      frequencyOffset: 2.225e9 as Hertz,
      ...satelliteState,
      orbitType: 'leo',
    });

    this.ootkSat_ = new OotkSatellite({
      name,
      tle1: orbitalConfig.tle1,
      tle2: orbitalConfig.tle2,
    });
    this.predictionSat_ = this.ootkSat_;
    this.observerConfig_ = orbitalConfig.observer;
    this.observer_ = new GroundObject({
      name: orbitalConfig.observer.name ?? 'Ground Station',
      lat: orbitalConfig.observer.lat,
      lon: orbitalConfig.observer.lon,
      alt: orbitalConfig.observer.alt,
    });
    this.isDopplerEnabled_ = orbitalConfig.isDopplerEnabled ?? true;
    this.minElevation_ = orbitalConfig.minElevation ?? (0 as Degrees);
    this.rawTxSignal_ = this.txSignal;

    // Seed telemetry at the TLE epoch so az/el/range are sane before the
    // scenario clock starts driving updates.
    this.propagateTo_(this.ootkSat_.toTle().epoch.toDateTime().getTime());
  }

  /** The underlying ootk satellite: the orbit the spacecraft is really in. */
  get ootkSatellite(): OotkSatellite {
    return this.ootkSat_;
  }

  /**
   * The element set the ground station has on file. Pass prediction and
   * program-track pointing come from here; it lags the truth between a
   * manoeuvre and the ephemeris load.
   */
  get predictionSatellite(): OotkSatellite {
    return this.predictionSat_;
  }

  /** True while the station's element set no longer describes the orbit. */
  get isPredictionStale(): boolean {
    return this.predictionSat_ !== this.ootkSat_;
  }

  /**
   * Load an element set onto BOTH the spacecraft and the station's file and
   * immediately re-seed telemetry (Campaign 2 M4 space-domain events): the
   * operator loads the updated ephemeris and the station's model matches the
   * orbit again. Also how a scenario resets a shared instance to its authored
   * set. Backward-compatible: unused unless a scenario drives a space event.
   */
  reloadTle(tle1: TleLine1, tle2: TleLine2): void {
    this.ootkSat_ = new OotkSatellite({ name: this.ootkSat_.name, tle1, tle2 });
    this.predictionSat_ = this.ootkSat_;
    this.observerCache_.clear();
    this.predictionCache_.clear();
    this.propagateTo_(getSimulatedNowMs());
  }

  /**
   * The spacecraft manoeuvres: the orbit changes, the station's element set
   * does not. Program-track keeps pointing where the old set says the bird is
   * until `reloadTle` brings the station back onto the truth.
   */
  maneuverTo(tle1: TleLine1, tle2: TleLine2): void {
    this.ootkSat_ = new OotkSatellite({ name: this.ootkSat_.name, tle1, tle2 });
    this.observerCache_.clear();
    this.propagateTo_(getSimulatedNowMs());
  }

  /** The ground station observer used for relative telemetry. */
  get groundObserver(): GroundObject {
    return this.observer_;
  }

  /** The canonical observer as configured (lat/lon/alt). */
  get canonicalObserver(): OrbitalObserver {
    return this.observerConfig_;
  }

  /** Elevation below which this satellite's signals are not receivable. */
  get minElevation(): Degrees {
    return this.minElevation_;
  }

  /** True when the satellite is above the minimum receivable elevation. */
  get isAboveHorizon(): boolean {
    return this.el > this.minElevation_;
  }

  /** `isAboveHorizon` from any station. */
  isAboveHorizonFor(observer: OrbitalObserver): boolean {
    return this.geometryFor(observer).isAboveHorizon;
  }

  /**
   * The satellite as seen from `observer` at the last propagation time. Cached
   * per observer per propagation, so every antenna at one site shares a
   * computation and all consumers within a tick agree.
   */
  geometryFor(observer: OrbitalObserver): ObserverGeometry {
    const key = observerKey_(observer);
    const cached = this.observerCache_.get(key);
    if (cached?.atMs === this.propagatedAtMs_) {
      return cached.geometry;
    }

    const ground = groundObjectFor(observer);
    const date = new Date(this.propagatedAtMs_);
    const rae = this.ootkSat_.rae(ground, date);
    const geometry: ObserverGeometry = rae
      ? {
          az: (((rae.az % 360) + 360) % 360) as Degrees,
          el: rae.el,
          rangeKm: rae.rng,
          dopplerFactor: this.isDopplerEnabled_ ? (this.ootkSat_.dopplerFactor(ground, date) ?? 1) : 1,
          isAboveHorizon: rae.el > this.minElevation_,
        }
      : // Propagation failed: fall back to canonical telemetry rather than a hole in the sky
        { az: this.az, el: this.el, rangeKm: (this.rangeKm ?? 0) as Kilometers, dopplerFactor: this.dopplerFactor, isAboveHorizon: this.isAboveHorizon };

    this.observerCache_.set(key, { atMs: this.propagatedAtMs_, geometry });
    return geometry;
  }

  /**
   * Program-track pointing from `observer`: where the station's element set
   * puts the bird, plus the authored ephemeris error. Equals true geometry
   * plus the error until a manoeuvre leaves the station's set stale.
   */
  predictedFor(observer: OrbitalObserver): { az: Degrees; el: Degrees } {
    const key = observerKey_(observer);
    const cached = this.predictionCache_.get(key);
    if (cached?.atMs === this.propagatedAtMs_) {
      return { az: cached.az, el: cached.el };
    }

    const base = this.isPredictionStale ? this.predictionGeometry_(observer) : this.geometryFor(observer);
    const az = ((base.az as number) + (this.ephemerisErrorAz as number)) as Degrees;
    const el = ((base.el as number) + (this.ephemerisErrorEl as number)) as Degrees;
    this.predictionCache_.set(key, { atMs: this.propagatedAtMs_, az, el });
    return { az, el };
  }

  /** Canonical predicted pointing, from the station's element set. */
  override get predictedAz(): Degrees {
    return this.predictedFor(this.observerConfig_).az;
  }

  override get predictedEl(): Degrees {
    return this.predictedFor(this.observerConfig_).el;
  }

  /** Az/el of the station's (stale) element set at the last propagation time. */
  private predictionGeometry_(observer: OrbitalObserver): { az: Degrees; el: Degrees } {
    const rae = this.predictionSat_.rae(groundObjectFor(observer), new Date(this.propagatedAtMs_));
    if (!rae) {
      const g = this.geometryFor(observer);
      return { az: g.az, el: g.el };
    }
    return { az: (((rae.az % 360) + 360) % 360) as Degrees, el: rae.el };
  }

  /**
   * Downlink signals as received at `observer`: nothing below that station's
   * horizon, and Doppler for that station's range rate. The canonical
   * `txSignal` array is the same view from the configured observer.
   */
  txSignalsFor(observer: OrbitalObserver): RfSignal[] {
    const g = this.geometryFor(observer);
    if (!g.isAboveHorizon) {
      return [];
    }
    if (!this.isDopplerEnabled_ || g.dopplerFactor === 1) {
      return this.rawTxSignal_;
    }
    return this.rawTxSignal_.map((sig) => ({
      ...sig,
      frequency: (sig.frequency * g.dopplerFactor) as RfFrequency,
    }));
  }

  /**
   * Propagate to the current simulated time on every frame the clock moves.
   * Replaces the legacy fixed/figure-8 position models.
   *
   * Not throttled to the base class interval: at 1 Hz a LEO bird moves up to
   * a degree between updates, more than a Ku beamwidth, so program-track
   * chased a stepping target and the dish read off-beam for a frame or two
   * every second (the one-frame C/N collapse the hold and dwell logic had to
   * ride through). Continuous geometry keeps pointing, FSPL and Doppler
   * consistent from frame to frame.
   */
  protected updatePosition_(): void {
    const nowMs = getSimulatedNowMs();
    if (nowMs === this.lastPositionUpdateTime_) {
      return; // paused clock: nothing moved
    }
    this.lastPositionUpdateTime_ = nowMs;
    this.propagateTo_(nowMs);
  }

  /**
   * Update signals like the base class, then apply orbital effects:
   * suppress all transmissions below the horizon and Doppler-shift downlinks.
   */
  update(): void {
    super.update();
    this.rawTxSignal_ = this.txSignal;

    if (!this.isAboveHorizon) {
      this.txSignal = [];
      return;
    }

    if (this.isDopplerEnabled_ && this.dopplerFactor !== 1) {
      this.txSignal = this.txSignal.map((sig) => ({
        ...sig,
        frequency: (sig.frequency * this.dopplerFactor) as RfFrequency,
      }));
    }
  }

  private propagateTo_(timeMs: number): void {
    const date = new Date(timeMs);
    const rae = this.ootkSat_.rae(this.observer_, date);

    if (!rae) {
      // Propagation failed (e.g., time far outside TLE validity) - keep last state
      return;
    }

    this.propagatedAtMs_ = timeMs;
    this.az = (((rae.az % 360) + 360) % 360) as Degrees;
    this.el = rae.el;
    this.rangeKm = rae.rng;

    const posVel = this.ootkSat_.eci(date);
    this.eciPosition = posVel?.position ?? null;
    this.eciVelocity = posVel?.velocity ?? null;
    this.lla = this.ootkSat_.lla(date);

    if (this.isDopplerEnabled_) {
      this.dopplerFactor = this.ootkSat_.dopplerFactor(this.observer_, date) ?? 1;
    }
  }
}
