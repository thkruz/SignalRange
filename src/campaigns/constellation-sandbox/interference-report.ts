import { isReportFiled, markReportFiled, type ReportFormResult, type ReportFormSpec, registerReportForm } from '@app/objectives/report-form-registry';
import { SimClock } from '@app/simulation/sim-clock';
import { type Degrees, GroundStation, type Kilometers, Satellite as OotkSatellite, type TleLine1, type TleLine2 } from 'ootk';
import { cedarMesaGroundStation } from './ground-stations';
import { KU_SAT_NORAD } from './satellites';

/**
 * Starlink Interference report: the player files the NORAD number, a UTC time
 * window and the C/N drop they saw. The report passes when that satellite really
 * was in line with the GEO link inside the window. "In line" is computed from
 * the satellite's own TLE in the loaded set, not from an authored answer, so a
 * TLE set refresh needs no change here.
 */

export const INTERFERENCE_REPORT_ID = 'starlink-interference-report';
/** Longest window the report accepts, so the player cannot cover the whole run. */
export const MAX_REPORT_WINDOW_MS = 10 * 60 * 1000;
/** Largest separation from the GEO satellite that counts as in line, degrees. */
export const IN_LINE_DEG = 2;
/** Step used to look for an in-line moment inside the window, ms. A crossing lasts several seconds. */
export const IN_LINE_STEP_MS = 2000;
const MAX_CN_DROP_DB = 40;

export interface ReportDeps {
  nowMs: number;
  /** Whether the satellite is a known member of the loaded constellation. */
  isMember(norad: number): boolean;
  /** Whether the satellite is above the horizon and within IN_LINE_DEG of the GEO satellite at any sample in [t0, t1]. */
  inLine(norad: number, t0: number, t1: number): boolean;
}

/** HH:MM or HH:MM:SS to seconds of day, or null. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(text.trim());

  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;

  return h < 24 && min < 60 && s < 60 ? h * 3600 + min * 60 + s : null;
}

/** The report check, free of browser state so it can be tested. */
export function evaluateInterferenceReport(values: Record<string, string>, deps: ReportDeps): ReportFormResult {
  const norad = Number(values.norad);

  if (!Number.isInteger(norad) || norad <= 0) return { ok: false, message: 'Enter the NORAD number as digits only.' };

  const startSec = parseClock(values.start ?? '');
  const endSec = parseClock(values.end ?? '');

  if (startSec === null || endSec === null) return { ok: false, message: 'Enter start and end as UTC times, HH:MM:SS.' };

  const drop = Number(values.drop);

  if (!Number.isFinite(drop) || drop <= 0 || drop > MAX_CN_DROP_DB) return { ok: false, message: `Enter the C/N drop in dB, above 0 and up to ${MAX_CN_DROP_DB}.` };

  // Times are on the sim UTC clock: the latest day that puts the start in the past
  const dayMs = 86_400_000;
  const dayStart = Math.floor(deps.nowMs / dayMs) * dayMs;
  let start = dayStart + startSec * 1000;

  if (start > deps.nowMs) start -= dayMs;
  let end = dayStart + endSec * 1000;

  while (end < start) end += dayMs;
  if (end === start) return { ok: false, message: 'The window must have some length.' };
  if (end > deps.nowMs) return { ok: false, message: 'That window ends after the current sim time. Report what you have already seen.' };
  if (end - start > MAX_REPORT_WINDOW_MS) return { ok: false, message: 'The window is longer than 10 minutes. Narrow it to the event.' };
  if (!deps.isMember(norad)) return { ok: false, message: `NORAD ${norad} is not in this constellation.` };
  if (!deps.inLine(norad, start, end)) return { ok: false, message: `NORAD ${norad} was not in line with the GEO link in that window.` };

  return { ok: true, message: `Report accepted: NORAD ${norad} crossed the GEO link in that window.` };
}

interface RegistryLike {
  memberNoradIds(): Int32Array;
  memberIndexOf(norad: number): number;
  memberTleLines(): { tle1: string[]; tle2: string[] };
}
interface SimLike {
  registry?: RegistryLike;
  satellites?: Array<{ noradId: number; az: number; el: number }>;
}

const sim_ = (): SimLike | undefined => (globalThis as unknown as { signalRange?: { simulationManager?: SimLike } }).signalRange?.simulationManager;

const angularSeparationDeg_ = (az1: number, el1: number, az2: number, el2: number): number => {
  const r = Math.PI / 180;
  const c = Math.sin(el1 * r) * Math.sin(el2 * r) + Math.cos(el1 * r) * Math.cos(el2 * r) * Math.cos((az1 - az2) * r);

  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

let ground_: GroundStation | null = null;

const ground = (): GroundStation => {
  const loc = cedarMesaGroundStation.location;

  ground_ ??= new GroundStation({ name: 'report', lat: loc.latitude as Degrees, lon: loc.longitude as Degrees, alt: ((loc.elevation ?? 0) / 1000) as Kilometers });

  return ground_;
};

/** Time of the first in-line moment of `sat` in [t0, t1], or null. */
function firstInLine_(sat: OotkSatellite, geo: { az: number; el: number }, t0: number, t1: number, stepMs = IN_LINE_STEP_MS): number | null {
  for (let t = t0; t <= t1; t += stepMs) {
    const rae = sat.rae(ground(), new Date(t));

    if (rae && rae.el > 0 && angularSeparationDeg_(rae.az, rae.el, geo.az, geo.el) <= IN_LINE_DEG) return t;
  }

  return null;
}

const satFor_ = (registry: RegistryLike, tles: { tle1: string[]; tle2: string[] }, norad: number): OotkSatellite | null => {
  const i = registry.memberIndexOf(norad);

  return i < 0 ? null : new OotkSatellite({ name: String(norad), tle1: tles.tle1[i] as TleLine1, tle2: tles.tle2[i] as TleLine2 });
};

const geoNow_ = (): { az: number; el: number } | null => sim_()?.satellites?.find((s) => s.noradId === KU_SAT_NORAD) ?? null;

const liveDeps_ = (): ReportDeps => ({
  nowMs: SimClock.nowMs(),
  isMember: (norad) => (sim_()?.registry?.memberIndexOf(norad) ?? -1) >= 0,
  inLine: (norad, t0, t1) => {
    const registry = sim_()?.registry;
    const geo = geoNow_();

    if (!registry || !geo) return false;
    const sat = satFor_(registry, registry.memberTleLines(), norad);

    return sat !== null && firstInLine_(sat, geo, t0, t1) !== null;
  },
});

/** Run identity: the registry is new for each scenario load. */
const runToken_ = (): unknown => sim_()?.registry;

export const interferenceReportForm: ReportFormSpec = {
  id: INTERFERENCE_REPORT_ID,
  title: 'Interference Report',
  intro: 'Name the Starlink that crossed the KU-SAT 1 link, when it did, and how far the C/N fell. The window can be at most 10 minutes.',
  fields: [
    { key: 'norad', label: 'NORAD number', placeholder: '5 or 6 digits' },
    { key: 'start', label: 'Window start (UTC)', placeholder: 'HH:MM:SS' },
    { key: 'end', label: 'Window end (UTC)', placeholder: 'HH:MM:SS' },
    { key: 'drop', label: 'Observed C/N drop (dB)', placeholder: 'for example 1.5' },
  ],
  submit(values) {
    const res = evaluateInterferenceReport(values, liveDeps_());

    if (res.ok) markReportFiled(INTERFERENCE_REPORT_ID, runToken_());

    return res;
  },
};

registerReportForm(interferenceReportForm);

/** Objective condition: the interference report was filed and accepted in this run. */
export const interferenceReportFiled = (): boolean => isReportFiled(INTERFERENCE_REPORT_ID, runToken_());

/**
 * Test hook: first in-line moments of the given satellites in [fromMs, toMs].
 * The e2e spec uses it to find a real event to report. `norads` null scans every member.
 */
export function findInLineEvents(norads: readonly number[] | null, fromMs: number, toMs: number, stepMs = IN_LINE_STEP_MS, maxHits = 5): Array<{ norad: number; atMs: number }> {
  const registry = sim_()?.registry;
  const geo = geoNow_();

  if (!registry || !geo) return [];
  const tles = registry.memberTleLines();
  const out: Array<{ norad: number; atMs: number }> = [];

  for (const norad of norads ?? registry.memberNoradIds()) {
    const sat = satFor_(registry, tles, norad);
    const at = sat ? firstInLine_(sat, geo, fromMs, toMs, stepMs) : null;

    if (at !== null) out.push({ norad, atMs: at });
    if (out.length >= maxHits) break;
  }

  return out;
}

// Test hook for the Range Watch e2e spec; dev builds only.
if (process.env.NODE_ENV === 'development') {
  (globalThis as unknown as { __rangeWatch?: unknown }).__rangeWatch = { findInLineEvents };
}
