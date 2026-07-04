/**
 * @file OrbitalSatellite - SGP4-propagated satellite (Campaign 2+)
 * @description Extends the legacy fixed-telemetry Satellite with real orbital
 * mechanics from ootk. Position (ECI + ground-station-relative az/el/range) is
 * propagated from a TLE against the simulated scenario clock, so LEO passes,
 * slant-range path loss, and Doppler shift are physically realistic.
 *
 * Campaign 1 scenarios never instantiate this class, so all legacy behavior
 * (fixed GEO az/el, figure-8 geosync, constant GEO slant range) is preserved.
 */

import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { Hertz, RfFrequency, RfSignal } from '@app/types';
import {
  Degrees,
  EciVec3,
  GroundObject,
  Kilometers,
  KilometersPerSecond,
  LlaVec3,
  Satellite as OotkSatellite,
  TleLine1,
  TleLine2,
  Vec3,
} from 'ootk';
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
  private readonly observer_: GroundObject;
  private readonly isDopplerEnabled_: boolean;
  private readonly minElevation_: Degrees;

  /** Current ECI position (km), null until first successful propagation */
  eciPosition: EciVec3<Kilometers> | null = null;
  /** Current ECI velocity (km/s), null until first successful propagation */
  eciVelocity: Vec3<KilometersPerSecond> | null = null;
  /** Current geodetic position, null until first successful propagation */
  lla: LlaVec3<Degrees, Kilometers> | null = null;
  /** Current Doppler factor (observed = transmitted * factor), 1 when unavailable */
  dopplerFactor: number = 1;

  constructor(
    name: string,
    norad: number,
    rxSignal: RfSignal[],
    beaconSignal: RfSignal[],
    orbitalConfig: OrbitalSatelliteConfig,
    satelliteState: Partial<SatelliteState> = {},
  ) {
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
    this.observer_ = new GroundObject({
      name: orbitalConfig.observer.name ?? 'Ground Station',
      lat: orbitalConfig.observer.lat,
      lon: orbitalConfig.observer.lon,
      alt: orbitalConfig.observer.alt,
    });
    this.isDopplerEnabled_ = orbitalConfig.isDopplerEnabled ?? true;
    this.minElevation_ = orbitalConfig.minElevation ?? (0 as Degrees);

    // Seed telemetry at the TLE epoch so az/el/range are sane before the
    // scenario clock starts driving updates.
    this.propagateTo_(this.ootkSat_.toTle().epoch.toDateTime().getTime());
  }

  /** The underlying ootk satellite (for pass planning and dashboards). */
  get ootkSatellite(): OotkSatellite {
    return this.ootkSat_;
  }

  /**
   * Replace the propagation TLE at runtime and immediately re-seed telemetry
   * (Campaign 2 M4 space-domain events). After a maneuver the authored TLE is
   * stale; loading the updated ephemeris restores accurate az/el/range so the
   * operator can reacquire. Backward-compatible: unused unless a scenario drives
   * a space event.
   */
  reloadTle(tle1: TleLine1, tle2: TleLine2): void {
    this.ootkSat_ = new OotkSatellite({ name: this.ootkSat_.name, tle1, tle2 });
    this.propagateTo_(getSimulatedNowMs());
  }

  /** The ground station observer used for relative telemetry. */
  get groundObserver(): GroundObject {
    return this.observer_;
  }

  /** True when the satellite is above the minimum receivable elevation. */
  get isAboveHorizon(): boolean {
    return this.el > this.minElevation_;
  }

  /**
   * Propagate to the current simulated time (throttled to the base class
   * update interval). Replaces the legacy fixed/figure-8 position models.
   */
  protected updatePosition_(): void {
    const nowMs = getSimulatedNowMs();
    // abs() so restoring a checkpoint (time jumping backwards) still updates
    if (Math.abs(nowMs - this.lastPositionUpdateTime_) < Satellite.POSITION_UPDATE_INTERVAL_MS) {
      return;
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

    this.az = ((rae.az % 360) + 360) % 360 as Degrees;
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
