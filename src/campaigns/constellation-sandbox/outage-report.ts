import { isReportFiled, markReportFiled, type ReportFormResult, type ReportFormSpec, registerReportForm } from '@app/objectives/report-form-registry';
import { SimClock } from '@app/simulation/sim-clock';

/**
 * Link outage report: the player files the NORAD number of the satellite that
 * was serving when the terminal's link dropped, and a UTC time window. The
 * report passes when the terminal's own drop log holds a drop by that satellite
 * inside the window. The answer comes from the log, not from authored data.
 */

export const OUTAGE_REPORT_ID = 'starlink-outage-report';
/** Longest window the report accepts, so the player cannot cover the whole run. */
export const MAX_REPORT_WINDOW_MS = 10 * 60 * 1000;

export interface LinkDropLike {
  atMs: number;
  servingNorad: number;
}

export interface ReportDeps {
  nowMs: number;
  /** Every link drop so far */
  drops: readonly LinkDropLike[];
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
export function evaluateOutageReport(values: Record<string, string>, deps: ReportDeps): ReportFormResult {
  const norad = Number(values.norad);

  if (!Number.isInteger(norad) || norad <= 0) return { ok: false, message: 'Enter the NORAD number as digits only.' };

  const startSec = parseClock(values.start ?? '');
  const endSec = parseClock(values.end ?? '');

  if (startSec === null || endSec === null) return { ok: false, message: 'Enter start and end as UTC times, HH:MM:SS.' };

  // Times are on the sim UTC clock: the latest day that puts the start in the past
  const dayMs = 86_400_000;
  const dayStart = Math.floor(deps.nowMs / dayMs) * dayMs;
  let start = dayStart + startSec * 1000;

  if (start > deps.nowMs) start -= dayMs;
  let end = dayStart + endSec * 1000;

  while (end < start) end += dayMs;
  if (end === start) return { ok: false, message: 'The window must have some length.' };
  if (end > deps.nowMs) return { ok: false, message: 'That window ends after the current sim time. Report what you have already seen.' };
  if (end - start > MAX_REPORT_WINDOW_MS) return { ok: false, message: 'The window is longer than 10 minutes. Narrow it to the drop.' };

  const inWindow = deps.drops.filter((d) => d.atMs >= start && d.atMs <= end);

  if (inWindow.length === 0) return { ok: false, message: 'The terminal logged no link drop in that window.' };
  if (!inWindow.some((d) => d.servingNorad === norad)) return { ok: false, message: `The link dropped in that window, but NORAD ${norad} was not the satellite serving.` };

  return { ok: true, message: `Report accepted: the link dropped while NORAD ${norad} was serving.` };
}

interface DropSource {
  linkDrops?: readonly LinkDropLike[];
}
interface SimLike {
  registry?: unknown;
  groundStations?: Array<{ antennas?: DropSource[] }>;
}

const sim_ = (): SimLike | undefined => (globalThis as unknown as { signalRange?: { simulationManager?: SimLike } }).signalRange?.simulationManager;

/** The terminal's drop log (empty when the station has no phased array). */
export const linkDrops = (): readonly LinkDropLike[] => sim_()?.groundStations?.[0]?.antennas?.[0]?.linkDrops ?? [];

/** Run identity: the registry is new for each scenario load. */
const runToken_ = (): unknown => sim_()?.registry;

export const outageReportForm: ReportFormSpec = {
  id: OUTAGE_REPORT_ID,
  title: 'Link Outage Report',
  intro:
    'Name the satellite that was serving when your link dropped, and the UTC time window around the drop. The window can be at most 10 minutes. The Array Control page shows the last drop.',
  fields: [
    { key: 'norad', label: 'NORAD number of the serving satellite', placeholder: '5 or 6 digits' },
    { key: 'start', label: 'Window start (UTC)', placeholder: 'HH:MM:SS' },
    { key: 'end', label: 'Window end (UTC)', placeholder: 'HH:MM:SS' },
  ],
  submit(values) {
    const res = evaluateOutageReport(values, { nowMs: SimClock.nowMs(), drops: linkDrops() });

    if (res.ok) markReportFiled(OUTAGE_REPORT_ID, runToken_());

    return res;
  },
};

registerReportForm(outageReportForm);

/** Objective condition: the outage report was filed and accepted in this run. */
export const outageReportFiled = (): boolean => isReportFiled(OUTAGE_REPORT_ID, runToken_());

// Test hook for the Range Watch e2e spec; dev builds only.
if (process.env.NODE_ENV === 'development') {
  (globalThis as unknown as { __rangeWatch?: Record<string, unknown> }).__rangeWatch = {
    ...(globalThis as unknown as { __rangeWatch?: Record<string, unknown> }).__rangeWatch,
    linkDrops,
    outageReportFiled,
  };
}
