/**
 * Pass prediction for the timeline, Pass Schedule tab and time skip at
 * constellation scale (Phase 3, P3-WP9).
 *
 * Authored satellites (and every satellite of a scenario without constellation
 * members) keep using `PassPlannerService` on the main thread, so small
 * scenarios, goldens and replays are untouched. Constellation members (pinned
 * or selected) are searched in the propagation worker: coarse steps, bisection
 * refine, 5 s peak sampling, the same algorithm as the planner.
 */
import { type OrbitalObserver, type OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { type PassPlannerOptions, PassPlannerService, type SatellitePass } from '@app/services/pass-planner-service';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Degrees, Kilometers } from 'ootk';

export interface PassPrediction {
  /** Passes available immediately (main-thread path), sorted by AOS */
  sync: SatellitePass[];
  /** Worker-found passes for constellation members; null when there are none to search */
  pending: Promise<SatellitePass[]> | null;
}

/** Whether `sat` should be searched in the worker rather than on this thread. */
export function usesWorkerSearch(sat: OrbitalSatellite, observer: OrbitalObserver | undefined): boolean {
  if (!observer || !SimulationManager.hasInstance()) {
    return false;
  }
  const sim = SimulationManager.getInstance();
  const service = sim.scheduler?.service ?? null;

  return service !== null && service.hasBackend && sim.registry.memberIndexOf(sat.noradId) >= 0 && sim.scheduler.stationIndexOf(observer.lat, observer.lon) >= 0;
}

/**
 * Passes for `sats` from `startMs`. `options.aosElevation: 'receivable'` uses
 * each satellite's own receivable elevation, as `PassPlannerService` does.
 */
export function predictSatellitePasses(planner: PassPlannerService, sats: readonly OrbitalSatellite[], startMs: number, options: PassPlannerOptions): PassPrediction {
  const observer = options.observer;
  const main: OrbitalSatellite[] = [];
  const worker: OrbitalSatellite[] = [];
  for (const sat of sats) {
    (usesWorkerSearch(sat, observer) ? worker : main).push(sat);
  }
  const sync = planner.getContactSchedule(main, startMs, options);
  if (worker.length === 0 || !observer) {
    return { sync, pending: null };
  }

  const sim = SimulationManager.getInstance();
  const service = sim.scheduler.service!;
  const station = sim.scheduler.stationIndexOf(observer.lat, observer.lon);
  const aos = options.aosElevation;
  const minEl = worker.map((sat) => (aos === 'receivable' ? sat.minElevation : (aos ?? options.minElevation ?? 0)) as number);
  const names = new Map(worker.map((sat) => [sat.noradId, sat.name]));
  const pending = service
    .searchPasses({
      noradIds: worker.map((sat) => sat.noradId),
      minEl,
      minPeak: options.minPeakElevation ?? Math.min(...minEl),
      startMs,
      horizonMs: (options.horizonHours ?? 12) * 3_600_000,
      maxPasses: options.maxPasses ?? 10,
      stations: [station],
    })
    .then((passes) =>
      passes.map(
        (p): SatellitePass => ({
          noradId: p.noradId,
          satelliteName: names.get(p.noradId) ?? `NORAD ${p.noradId}`,
          aosMs: p.aosMs,
          losMs: p.losMs,
          maxElMs: p.maxElMs,
          maxEl: p.maxEl as Degrees,
          aosAz: p.aosAz as Degrees,
          losAz: p.losAz as Degrees,
          maxElRangeKm: p.maxElRangeKm as Kilometers,
          durationS: Math.round((p.losMs - p.aosMs) / 1000),
        })
      )
    )
    .catch((error: unknown) => {
      console.warn('[PassPrediction] worker pass search failed', error);

      return [];
    });

  return { sync, pending };
}
