import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Satellite } from '@app/equipment/satellite/satellite';
import type { SimulationManager } from '@app/simulation/simulation-manager';

/**
 * Explicit satellite queries for UI and equipment code (Phase 3, P3-WP4).
 * They go through the scheduler and registry when the manager has them and fall
 * back to the hydrated list, so partial SimulationManager stubs keep working.
 */

/** Hot satellites an antenna should consider (authored plus hydrated members). */
export function candidateSatellites(sim: SimulationManager): readonly Satellite[] {
  return sim.candidateSatellites?.() ?? sim.satellites;
}

/** Authored plus pinned orbital satellites: what per-satellite lists (timeline, embed host, pass tabs) show. */
export function trackedOrbitalSatellites(sim: SimulationManager): OrbitalSatellite[] {
  return sim.trackedOrbitalSatellites?.() ?? sim.satellites.filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
}

export function hasOrbitalSatellites(sim: SimulationManager): boolean {
  return sim.hasOrbitalSatellites?.() ?? sim.satellites.some((sat) => sat instanceof OrbitalSatellite);
}
