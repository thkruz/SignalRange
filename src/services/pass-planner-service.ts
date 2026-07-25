/**
 * @file PassPlannerService - LEO contact window prediction
 * @description Computes upcoming passes (AOS/LOS/max-elevation) for
 * SGP4-propagated satellites over their ground station observer. Used by the
 * mission planning UI for multi-contact scheduling in Campaign 2+.
 */

import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { Degrees, Kilometers } from 'ootk';

/** A single predicted contact window between a ground station and a satellite. */
export interface SatellitePass {
  /** NORAD catalog id of the satellite */
  noradId: number;
  /** Satellite display name */
  satelliteName: string;
  /** Acquisition of signal (satellite rises above min elevation), Unix ms */
  aosMs: number;
  /** Loss of signal (satellite sets below min elevation), Unix ms */
  losMs: number;
  /** Time of maximum elevation, Unix ms */
  maxElMs: number;
  /** Maximum elevation reached during the pass */
  maxEl: Degrees;
  /** Azimuth at AOS */
  aosAz: Degrees;
  /** Azimuth at LOS */
  losAz: Degrees;
  /** Slant range at maximum elevation */
  maxElRangeKm: Kilometers;
  /** Pass duration in seconds */
  durationS: number;
}

export interface PassPlannerOptions {
  /** How far ahead to search, in hours. Default: 12 */
  horizonHours?: number;
  /** Coarse sampling step in seconds. Default: 30 */
  stepS?: number;
  /** Elevation defining AOS/LOS. Default: 0 deg */
  minElevation?: Degrees;
  /** Maximum number of passes to return per satellite. Default: 10 */
  maxPasses?: number;
}

/** Bisection refinement iterations for AOS/LOS edges (~30s / 2^6 < 1s accuracy) */
const REFINE_ITERATIONS = 6;

/**
 * Elevation mask a scenario gets by declaring `contactTimeline` without naming
 * one. A real station cannot work a pass that never clears the local horizon
 * clutter, so 5 deg is the honest default once a campaign cares about contact
 * windows at all.
 */
export const DEFAULT_CONTACT_MIN_ELEVATION = 5 as Degrees;

/**
 * The scenario's elevation mask, shared by every surface that predicts passes
 * (Pass Schedule tab, contact timeline deck).
 *
 * Without this they each passed their own options and visibly disagreed: the
 * deck honoured a 5 deg mask while the Pass Schedule tab used the service
 * default of 0 deg, so the tab listed 2 deg "passes" the station could not
 * actually work and every window it showed was wider than the deck's.
 *
 * Opt-in: scenarios that declare no `contactTimeline` block keep the historical
 * 0 deg behaviour, so campaigns predating the deck are unaffected.
 */
export function scenarioMinElevation(settings: { contactTimeline?: { minElevation?: Degrees } }): Degrees {
  if (!settings.contactTimeline) {
    return 0 as Degrees;
  }

  return settings.contactTimeline.minElevation ?? DEFAULT_CONTACT_MIN_ELEVATION;
}

/**
 * Predicts contact windows for orbital satellites.
 * Stateless: every call samples the orbit fresh from the requested start time,
 * so it works with the simulated scenario clock and after checkpoint restores.
 */
export class PassPlannerService {
  /**
   * Compute upcoming passes for one satellite starting at `startMs`.
   * A pass already in progress at `startMs` is included (aosMs = startMs).
   */
  getPasses(satellite: OrbitalSatellite, startMs: number, options: PassPlannerOptions = {}): SatellitePass[] {
    const horizonHours = options.horizonHours ?? 12;
    const stepS = options.stepS ?? 30;
    const minEl = options.minElevation ?? (0 as Degrees);
    const maxPasses = options.maxPasses ?? 10;

    const ootkSat = satellite.ootkSatellite;
    const observer = satellite.groundObserver;
    const endMs = startMs + horizonHours * 3600 * 1000;

    const elAt = (timeMs: number): number => {
      const rae = ootkSat.rae(observer, new Date(timeMs));
      return rae ? rae.el : -90;
    };

    const passes: SatellitePass[] = [];
    let prevMs = startMs;
    let prevUp = elAt(startMs) > minEl;
    let aosMs: number | null = prevUp ? startMs : null;

    for (let t = startMs + stepS * 1000; t <= endMs && passes.length < maxPasses; t += stepS * 1000) {
      const up = elAt(t) > minEl;

      if (up && !prevUp) {
        aosMs = this.refineCrossing_(elAt, prevMs, t, minEl, true);
      } else if (!up && prevUp && aosMs !== null) {
        const losMs = this.refineCrossing_(elAt, prevMs, t, minEl, false);
        const pass = this.buildPass_(satellite, aosMs, losMs, stepS);
        if (pass) {
          passes.push(pass);
        }
        aosMs = null;
      }

      prevUp = up;
      prevMs = t;
    }

    return passes;
  }

  /**
   * Compute upcoming passes for several satellites, merged and sorted by AOS.
   */
  getContactSchedule(satellites: OrbitalSatellite[], startMs: number, options: PassPlannerOptions = {}): SatellitePass[] {
    return satellites
      .flatMap((sat) => this.getPasses(sat, startMs, options))
      .sort((a, b) => a.aosMs - b.aosMs);
  }

  /**
   * Bisect the horizon crossing between two sample times.
   * @param rising true when refining an AOS (el crosses upward)
   */
  private refineCrossing_(
    elAt: (timeMs: number) => number,
    belowMs: number,
    aboveMs: number,
    minEl: number,
    rising: boolean,
  ): number {
    let lo = belowMs;
    let hi = aboveMs;

    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      const isUp = elAt(mid) > minEl;
      if (isUp === rising) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return Math.round((lo + hi) / 2);
  }

  /** Sample within [aos, los] for max elevation and edge azimuths. */
  private buildPass_(satellite: OrbitalSatellite, aosMs: number, losMs: number, stepS: number): SatellitePass | null {
    const ootkSat = satellite.ootkSatellite;
    const observer = satellite.groundObserver;

    const aosRae = ootkSat.rae(observer, new Date(aosMs));
    const losRae = ootkSat.rae(observer, new Date(losMs));
    if (!aosRae || !losRae) {
      return null;
    }

    let maxEl = -90;
    let maxElMs = aosMs;
    let maxElRangeKm = aosRae.rng;
    const fineStepMs = Math.max(1000, (stepS * 1000) / 6);

    for (let t = aosMs; t <= losMs; t += fineStepMs) {
      const rae = ootkSat.rae(observer, new Date(t));
      if (rae && rae.el > maxEl) {
        maxEl = rae.el;
        maxElMs = t;
        maxElRangeKm = rae.rng;
      }
    }

    return {
      noradId: satellite.noradId,
      satelliteName: satellite.name,
      aosMs,
      losMs,
      maxElMs,
      maxEl: maxEl as Degrees,
      aosAz: aosRae.az,
      losAz: losRae.az,
      maxElRangeKm,
      durationS: Math.round((losMs - aosMs) / 1000),
    };
  }
}
