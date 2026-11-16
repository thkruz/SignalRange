import { assetSelectionState } from '@app/pages/mission-control/asset-selection-state';
import { KU_SAT_NORAD } from './satellites';

/**
 * Evaluators for the constellation sandbox objectives (custom condition type).
 *
 * They read live state through the window.signalRange handle and the leaf
 * asset-selection-state module, with no manager imports: the scenario manager
 * imports this campaign, so a manager import here would be a cycle.
 */

interface SatLike {
  noradId: number;
  az: number;
  el: number;
}

interface SimLike {
  registry?: { pinnedCount: number; pinned: () => Array<{ noradId: number }> };
  satellites?: SatLike[];
  groundStations?: Array<{ antennas?: Array<{ state?: { azimuth: number; elevation: number } }> }>;
}

const sim = (): SimLike | undefined => (globalThis as unknown as { signalRange?: { simulationManager?: SimLike } }).signalRange?.simulationManager;

const pinnedNorads = (): number[] =>
  sim()
    ?.registry?.pinned()
    .map((r) => r.noradId) ?? [];

const selectedNorad = (): number | null => {
  const id = assetSelectionState.assetId;

  return id?.startsWith('sat-') ? Number.parseInt(id.slice(4), 10) : null;
};

const angularSeparationDeg = (az1: number, el1: number, az2: number, el2: number): number => {
  const r = Math.PI / 180;
  const c = Math.sin(el1 * r) * Math.sin(el2 * r) + Math.cos(el1 * r) * Math.cos(el2 * r) * Math.cos((az1 - az2) * r);

  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

/** At least one constellation member is pinned. */
export const hasPinnedMember = (): boolean => (sim()?.registry?.pinnedCount ?? 0) >= 1;

/** At least `n` members are pinned. */
export const pinnedAtLeast = (n: number) => (): boolean => (sim()?.registry?.pinnedCount ?? 0) >= n;

/**
 * A selected or pinned Starlink (not the authored GEO satellite) is above the
 * horizon and within `maxSepDeg` of KU-SAT 1 as seen from the station: in line
 * with the GEO satellite, so its main beam or near sidelobe crosses the dish beam.
 */
export const starlinkInLine = (maxSepDeg: number) => (): boolean => {
  const sm = sim();
  const sats = sm?.satellites ?? [];
  const geo = sats.find((s) => s.noradId === KU_SAT_NORAD);

  if (!geo) return false;

  const watched = new Set<number>(pinnedNorads());
  const selected = selectedNorad();

  if (selected !== null) watched.add(selected);
  watched.delete(KU_SAT_NORAD);

  return sats.some((s) => watched.has(s.noradId) && s.el > 0 && angularSeparationDeg(s.az, s.el, geo.az, geo.el) <= maxSepDeg);
};

/** The first antenna of the first station is pointed within `tolDeg` of a pinned member. */
export const dishOnPinned = (tolDeg: number) => (): boolean => {
  const sm = sim();
  const ant = sm?.groundStations?.[0]?.antennas?.[0]?.state;

  if (!ant) return false;

  const pinned = new Set<number>(pinnedNorads());

  return (sm?.satellites ?? []).some((s) => pinned.has(s.noradId) && s.el > 0 && angularSeparationDeg(s.az, s.el, ant.azimuth, ant.elevation) <= tolDeg);
};

// ── Phased array terminal (Starlink Interference) ───────────────────────────

interface TerminalLike {
  scheduler?: { handoverCount: number };
  beamMode?: string;
  scanLossDb?: number;
  geoArcEnabled?: boolean;
  isBeamInGeoArc?: () => boolean;
}

const terminal = (): TerminalLike | null => {
  const ant = sim()?.groundStations?.[0]?.antennas?.[0] as unknown as TerminalLike | undefined;

  return ant && typeof ant.isBeamInGeoArc === 'function' ? ant : null;
};

const handoverCountOf = (t: TerminalLike): number => t.scheduler?.handoverCount ?? 0;

/** Handover count when the Array Control page was first seen, per terminal. */
const handoverBase = new WeakMap<object, number>();

/** At least `n` handovers have happened since the Array Control page was first on screen. */
export const handoversSincePageOpen = (n: number) => (): boolean => {
  const t = terminal();

  if (!t || !document.querySelector('.array-control-tab')) return false;
  const count = handoverCountOf(t);

  if (!handoverBase.has(t)) handoverBase.set(t, count);

  return count - (handoverBase.get(t) ?? count) >= n;
};

/** The beam is in manual mode and the scan loss is above `db`. */
export const manualScanLossAbove = (db: number) => (): boolean => {
  const t = terminal();

  return !!t && t.beamMode === 'manual' && (t.scanLossDb ?? 0) > db;
};

/**
 * GEO protection cycle, in order: zone off, beam inside the GEO arc while it is
 * off, zone back on. One phase per terminal; each condition reads the phase.
 */
const geoPhase = new WeakMap<object, number>();

const advanceGeoPhase = (t: TerminalLike): number => {
  let phase = geoPhase.get(t) ?? 0;

  if (phase === 0 && t.geoArcEnabled === false) phase = 1;
  if (phase === 1 && t.geoArcEnabled === false && t.isBeamInGeoArc?.()) phase = 2;
  if (phase === 2 && t.geoArcEnabled === true) phase = 3;
  geoPhase.set(t, phase);

  return phase;
};

/** The GEO protection cycle has reached `phase` (1 zone off, 2 beam in the arc, 3 zone back on). */
export const geoCycleReached = (phase: number) => (): boolean => {
  const t = terminal();

  return !!t && advanceGeoPhase(t) >= phase;
};
