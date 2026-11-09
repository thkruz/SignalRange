/**
 * @file obstructions-screen - SkyLink Obstructions: the sky map (phase 40, WP5)
 * @description A polar SVG sky map, north up, centre = straight up, edge = the elevation mask. Cells
 * are clear (served), blocked or not seen yet. The map fills over sim time; "Check for obstructions"
 * tells the player so and follows the sim time that passes (D9). The screen never names a cause (D5):
 * snow reads as every cell blocked, a tree line as a wedge, and the player has to tell them apart.
 */
import { CHECK_DURATION_S, type ObstructionAccumulator, type ObstructionCellState, type ObstructionGrid } from '../obstruction-map';
import type { TerminalView } from '../terminal-app-model';
import { APP_ACTION_VERBS } from '../terminal-evidence';
import { trObstructions } from './obstructions-strings';
import { escapeHtml, type TerminalScreen, type TerminalScreenContext, type TerminalScreenFactory } from './terminal-screen';

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = CENTER - 22;
const D2R = Math.PI / 180;

const FILL: Record<ObstructionCellState, string> = {
  served: 'var(--tblr-green, #2fb344)',
  blocked: 'var(--tblr-red, #d63939)',
  unseen: 'var(--tblr-gray-300, #ced4da)',
};

const STATE_KEY = { served: 'obstructions.legend.served', blocked: 'obstructions.legend.blocked', unseen: 'obstructions.legend.unseen' } as const;

function point(azDeg: number, r: number): string {
  return `${(CENTER + r * Math.sin(azDeg * D2R)).toFixed(2)} ${(CENTER - r * Math.cos(azDeg * D2R)).toFixed(2)}`;
}

/** SVG path of one annular sector cell */
export function cellPath(grid: ObstructionGrid, azLo: number, azHi: number, elLo: number, elHi: number): string {
  const span = 90 - grid.maskElDeg;
  const rOuter = (RADIUS * (90 - elLo)) / span;
  const rInner = (RADIUS * (90 - elHi)) / span;
  const large = azHi - azLo > 180 ? 1 : 0;
  const inner = rInner < 0.01 ? `L ${point(0, 0)}` : `L ${point(azHi, rInner)} A ${rInner.toFixed(2)} ${rInner.toFixed(2)} 0 ${large} 0 ${point(azLo, rInner)}`;

  return `M ${point(azLo, rOuter)} A ${rOuter.toFixed(2)} ${rOuter.toFixed(2)} 0 ${large} 1 ${point(azHi, rOuter)} ${inner} Z`;
}

function buildSvg(grid: ObstructionGrid): string {
  const paths = grid.cells
    .map((c) => {
      const label = trObstructions('obstructions.cell', { az: c.azLoDeg, az2: c.azHiDeg, el: c.elLoDeg, el2: c.elHiDeg, state: trObstructions(STATE_KEY[c.state]) });

      return `<path d="${cellPath(grid, c.azLoDeg, c.azHiDeg, c.elLoDeg, c.elHiDeg)}" fill="${FILL[c.state]}" stroke="var(--tblr-bg-surface, #fff)" stroke-width="0.5"><title>${escapeHtml(label)}</title></path>`;
    })
    .join('');
  const labels: Array<[string, number]> = [
    [trObstructions('obstructions.north'), 0],
    [trObstructions('obstructions.east'), 90],
    [trObstructions('obstructions.south'), 180],
    [trObstructions('obstructions.west'), 270],
  ];
  const text = labels
    .map(([t, az]) => {
      const [x, y] = point(az, RADIUS + 12).split(' ');

      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="currentColor">${escapeHtml(t)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="w-100" style="max-width:360px" role="img" aria-label="${escapeHtml(trObstructions('obstructions.mapLabel'))}">${paths}${text}</svg>`;
}

function legendItem(state: ObstructionCellState): string {
  return `<span class="me-3"><span class="badge me-1" style="background:${FILL[state]}">&nbsp;</span>${trObstructions(STATE_KEY[state])}</span>`;
}

function pct(fraction: number): string {
  return String(Math.round(fraction * 100));
}

export const createObstructionsScreen: TerminalScreenFactory = (ctx: TerminalScreenContext): TerminalScreen => {
  let root: HTMLElement | null = null;
  let signature = '';

  const acc = (): ObstructionAccumulator | null => ctx.model.obstructions();
  const q = (id: string): HTMLElement | null => root?.querySelector(`#obs-${id}`) ?? null;
  const setText = (id: string, text: string): void => {
    const el = q(id);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  };

  const onCheck = (): void => {
    acc()?.startCheck();
    ctx.evidence?.action('obstructions', APP_ACTION_VERBS.obstructionCheck, 'Started a check for obstructions in the SkyLink app.');
    ctx.refresh();
  };
  const onStop = (): void => {
    acc()?.endCheck();
    ctx.evidence?.action('obstructions', APP_ACTION_VERBS.obstructionStop, 'Stopped the check for obstructions in the SkyLink app.');
    ctx.refresh();
  };
  const onReset = (): void => {
    void ctx.confirm(trObstructions('obstructions.reset.confirm'), trObstructions('obstructions.reset.label')).then((ok) => {
      if (ok) {
        acc()?.reset();
        ctx.evidence?.action('obstructions', APP_ACTION_VERBS.obstructionReset, 'Reset the obstruction map in the SkyLink app.');
        ctx.refresh();
      }
    });
  };

  const syncCheck = (a: ObstructionAccumulator): void => {
    const elapsed = a.checkElapsedS();
    const sum = a.summary();
    const running = elapsed !== null && elapsed < CHECK_DURATION_S;
    let text = '';
    if (running) {
      text = trObstructions('obstructions.check.running', { minutes: Math.round(CHECK_DURATION_S / 60), left: Math.max(1, Math.ceil((CHECK_DURATION_S - elapsed) / 60)) });
    } else if (elapsed !== null) {
      text =
        sum.coverage > 0
          ? trObstructions('obstructions.check.done', { blocked: pct(sum.obstructionFraction), seen: pct(sum.coverage) })
          : trObstructions('obstructions.check.doneNone');
    }
    setText('check-text', text);
    q('stop')?.classList.toggle('d-none', !running);
    const bar = q('progress');
    if (bar) {
      bar.classList.toggle('d-none', !running);
      bar.style.width = `${Math.min(100, ((elapsed ?? 0) / CHECK_DURATION_S) * 100).toFixed(0)}%`;
    }
  };

  return {
    id: 'obstructions',
    mount(container) {
      root = container;
      container.innerHTML = `
        <div class="card"><div class="card-header"><h3 class="card-title">${trObstructions('obstructions.title')}</h3></div>
          <div class="card-body">
            <p class="text-secondary">${trObstructions('obstructions.intro')}</p>
            <div id="obs-unavailable" class="alert alert-secondary d-none">${trObstructions('obstructions.unavailable')}</div>
            <div id="obs-stale" class="text-secondary small mb-2 d-none">${trObstructions('obstructions.offline')}</div>
            <div id="obs-body">
              <div class="row g-3">
                <div class="col-12 col-md-6 text-center"><div id="obs-map"></div>
                  <div class="small mt-2">${legendItem('served')}${legendItem('blocked')}${legendItem('unseen')}</div></div>
                <div class="col-12 col-md-6">
                  <div class="d-flex gap-4 mb-3">
                    <div><div class="text-secondary small">${trObstructions('obstructions.stat.blocked')}</div><div class="h2 mb-0 font-monospace" id="obs-blocked"></div></div>
                    <div><div class="text-secondary small">${trObstructions('obstructions.stat.seen')}</div><div class="h2 mb-0 font-monospace" id="obs-seen"></div></div>
                  </div>
                  <div class="text-secondary mb-2" id="obs-empty"></div>
                  <div class="progress mb-2"><div class="progress-bar d-none" id="obs-progress" style="width:0"></div></div>
                  <div class="mb-3" id="obs-check-text" aria-live="polite"></div>
                  <div class="d-flex gap-2 flex-wrap">
                    <button type="button" class="btn btn-primary" id="obs-check">${trObstructions('obstructions.check')}</button>
                    <button type="button" class="btn btn-outline-secondary d-none" id="obs-stop">${trObstructions('obstructions.check.stop')}</button>
                    <button type="button" class="btn btn-outline-danger" id="obs-reset">${trObstructions('obstructions.reset')}</button>
                  </div>
                </div>
              </div>
            </div>
          </div></div>`;
      q('check')?.addEventListener('click', onCheck);
      q('stop')?.addEventListener('click', onStop);
      q('reset')?.addEventListener('click', onReset);
    },
    sync(view: TerminalView) {
      const a = acc();
      q('unavailable')?.classList.toggle('d-none', a !== null);
      q('body')?.classList.toggle('d-none', a === null);
      q('stale')?.classList.toggle('d-none', !view.stale);
      if (!a) {
        return;
      }
      const grid = a.grid();
      const sig = grid.cells.map((c) => c.state[0]).join('');
      const map = q('map');
      if (map && sig !== signature) {
        signature = sig;
        map.innerHTML = buildSvg(grid);
      }
      const sum = a.summary();
      setText('blocked', sum.coverage > 0 ? trObstructions('obstructions.stat.value', { value: pct(sum.obstructionFraction) }) : '-');
      setText('seen', trObstructions('obstructions.stat.value', { value: pct(sum.coverage) }));
      setText('empty', sum.coverage > 0 ? '' : trObstructions('obstructions.empty'));
      syncCheck(a);
    },
    dispose() {
      q('check')?.removeEventListener('click', onCheck);
      q('stop')?.removeEventListener('click', onStop);
      q('reset')?.removeEventListener('click', onReset);
      root = null;
    },
  };
};
