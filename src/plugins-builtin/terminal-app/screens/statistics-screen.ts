/**
 * @file statistics-screen - SkyLink Statistics: throughput, latency, ping drop and outage list (phase 40, WP4)
 * @description Reads `view.data.stats` (the dish-side record, kept across reboots, D15). Charts are
 * small inline SVG with no dependencies. Colours are fixed for the app's dark theme.
 */
import { formatAge, tr } from '../strings';
import { STATS_WINDOWS, type StatsPoint, type StatsSeries, type StatsWindowId, type TerminalView } from '../terminal-app-model';

import { escapeHtml, type TerminalScreen, type TerminalScreenFactory } from './terminal-screen';

const WINDOW_IDS = Object.keys(STATS_WINDOWS) as StatsWindowId[];
const W = 300;
const H = 90;
const PAD_X = 4;
const PAD_T = 6;
const PAD_B = 6;

export interface ChartLine {
  color: string;
  values: Array<number | null>;
}

/** Break a series into runs of consecutive non-null values, so gaps stay gaps */
function segments(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string[] {
  const out: string[] = [];
  let cur: Array<[number, number]> = [];
  const flush = (): void => {
    if (cur.length > 1) {
      out.push(cur.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '));
    } else if (cur.length === 1) {
      // A single point: draw a short flat tick so it stays visible
      const [px, py] = cur[0];
      out.push(`${(px - 1.5).toFixed(1)},${py.toFixed(1)} ${(px + 1.5).toFixed(1)},${py.toFixed(1)}`);
    }
    cur = [];
  };
  values.forEach((v, i) => {
    if (v === null) {
      flush();
    } else {
      cur.push([x(i), y(v)]);
    }
  });
  flush();

  return out;
}

/** One chart as an SVG string; `label` formats the top of the scale */
export function chartSvg(lines: ChartLine[], floorMax: number, label: (v: number) => string): string {
  const all = lines.flatMap((l) => l.values).filter((v): v is number => v !== null);
  const max = Math.max(floorMax, ...all);
  const n = Math.max(1, ...lines.map((l) => l.values.length));
  const x = (i: number): number => PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD_X));
  const y = (v: number): number => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const paths = lines
    .flatMap((l) =>
      segments(l.values, x, y).map(
        (pts) => `<polyline points="${pts}" fill="none" stroke="${l.color}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
      )
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-hidden="true"><line x1="${PAD_X}" y1="${H - PAD_B}" x2="${W - PAD_X}" y2="${H - PAD_B}" stroke="#495057" stroke-width="1" vector-effect="non-scaling-stroke"/><line x1="${PAD_X}" y1="${PAD_T}" x2="${W - PAD_X}" y2="${PAD_T}" stroke="#343a40" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>${paths}</svg><div class="d-flex justify-content-between small text-secondary font-monospace"><span>0</span><span>${escapeHtml(label(max))}</span></div>`;
}

const hasData = (points: StatsPoint[]): boolean => points.some((p) => p.downMbps !== null);

function outageRows(series: StatsSeries, nowS: number): string {
  if (series.outages.length === 0) {
    return `<tr><td colspan="3" class="text-secondary">${tr('stats.outages.none')}</td></tr>`;
  }

  return [...series.outages]
    .sort((a, b) => b.startS - a.startS)
    .map((o) => {
      const dur = o.ongoing ? `${formatAge(o.durationS)} (${tr('stats.outages.ongoing')})` : formatAge(o.durationS);

      return `<tr data-outage><td>${tr('stats.outages.ago', { age: formatAge(Math.max(0, nowS - o.startS)) })}</td><td>${dur}</td><td>${escapeHtml(o.causeLabel)}</td></tr>`;
    })
    .join('');
}

const card = (title: string, id: string, extra = ''): string =>
  `<div class="col-12 col-lg-6"><div class="card h-100"><div class="card-header"><h3 class="card-title">${title}</h3>${extra}</div><div class="card-body"><div id="${id}"></div></div></div></div>`;

export const createStatisticsScreen: TerminalScreenFactory = (): TerminalScreen => {
  let root: HTMLElement | null = null;
  let windowId: StatsWindowId = '15m';
  let lastView: TerminalView | null = null;

  const setHtml = (sel: string, html: string): void => {
    const el = root?.querySelector(sel);
    if (el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
  };

  function render(view: TerminalView): void {
    const d = view.data;
    if (!d || !root) {
      return;
    }
    for (const b of root.querySelectorAll<HTMLElement>('[data-window]')) {
      const on = b.dataset.window === windowId;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    setHtml('#stats-stale', view.stale ? tr('stats.stale') : '');
    const series = d.stats[windowId];
    const pts = series.points;
    const empty = !hasData(pts);
    setHtml('#stats-empty', empty ? tr('stats.noData') : '');
    const mbps = (v: number): string => tr('stats.unitMbps', { value: Math.round(v) });
    setHtml(
      '#stats-throughput',
      empty
        ? ''
        : chartSvg(
            [
              { color: '#4dabf7', values: pts.map((p) => p.downMbps) },
              { color: '#69db7c', values: pts.map((p) => p.upMbps) },
            ],
            10,
            mbps
          )
    );
    setHtml('#stats-latency', empty ? '' : chartSvg([{ color: '#ffd43b', values: pts.map((p) => p.latencyMs) }], 100, (v) => tr('stats.unitMs', { value: Math.round(v) })));
    setHtml('#stats-drop', empty ? '' : chartSvg([{ color: '#ff8787', values: pts.map((p) => p.pingDropPct) }], 5, (v) => tr('stats.unitPct', { value: Math.round(v) })));
    setHtml('#stats-axis', `<span>${tr('stats.axisStart', { age: formatAge(series.windowS) })}</span><span>${tr('stats.axisEnd')}</span>`);
    setHtml('#stats-outage-rows', outageRows(series, d.sampleTimeS));
  }

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-window]');
    const id = btn?.dataset.window as StatsWindowId | undefined;
    if (id && id in STATS_WINDOWS) {
      windowId = id;
      if (lastView) {
        render(lastView);
      }
    }
  };

  return {
    id: 'statistics',
    mount(container) {
      root = container;
      const buttons = WINDOW_IDS.map(
        (id) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-window="${id}" aria-pressed="false">${tr(`stats.window.${id}`)}</button>`
      ).join('');
      container.innerHTML = `
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <div class="btn-group" role="group" aria-label="${tr('stats.window.label')}">${buttons}</div>
          <span class="text-secondary small" id="stats-stale"></span>
        </div>
        <div class="text-secondary mb-2" id="stats-empty"></div>
        <div class="row g-3 mb-2">
          ${card(tr('stats.throughput'), 'stats-throughput', `<span class="ms-auto small"><span style="color:#4dabf7">${tr('stats.download')}</span> <span style="color:#69db7c">${tr('stats.upload')}</span></span>`)}
          ${card(tr('stats.latency'), 'stats-latency')}
          ${card(tr('stats.pingDrop'), 'stats-drop')}
        </div>
        <div class="d-flex justify-content-between small text-secondary mb-3" id="stats-axis"></div>
        <div class="card"><div class="card-header"><h3 class="card-title">${tr('stats.outages.title')}</h3></div>
          <div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr>
            <th>${tr('stats.outages.start')}</th><th>${tr('stats.outages.duration')}</th><th>${tr('stats.outages.cause')}</th>
          </tr></thead><tbody id="stats-outage-rows"></tbody></table></div></div>`;
      container.addEventListener('click', onClick);
    },
    sync(view: TerminalView) {
      lastView = view;
      render(view);
    },
    dispose() {
      root?.removeEventListener('click', onClick);
      root = null;
      lastView = null;
    },
  };
};
