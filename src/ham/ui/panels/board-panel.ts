/**
 * @file board-panel - Practice circuit board: power, SW1, fuse, LED, parts list, inspect/repair
 * @description Fuse "removal" happens through install: fit a spare fuse of the right rating.
 *
 * Test ids (<b> = board device id):
 *   ham-board-<b>-power, -sw1, -led, -fuse (status), -inspect, -parts, -part-<REFDES>,
 *   -fault-<faultId> (revealed fault row), -repair-<faultId>, -install-<spareId>
 */
import { BOARD_COMPONENTS, type SchematicSymbolId } from '../../dc/circuit-board';
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, button, h } from '../ui-kit';
import './instruments.css';
import { inService, setText, spares, T } from './panel-util';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Simple schematic glyphs, 40x22 viewBox */
const SYMBOL_PATHS: Record<SchematicSymbolId, string> = {
  resistor: 'M0 11H8L10 4L14 18L18 4L22 18L26 4L28 11H40',
  capacitor: 'M0 11H17M17 3V19M23 3V19M23 11H40',
  inductor: 'M0 11H6A4 4 0 0 1 14 11A4 4 0 0 1 22 11A4 4 0 0 1 30 11H40',
  diode: 'M0 11H12M12 3V19L26 11ZM26 3V19M26 11H40',
  led: 'M0 11H12M12 3V19L26 11ZM26 3V19M26 11H40M20 2L26 -2M24 4L30 0',
  transistor: 'M0 11H14M14 3V19M14 8L30 2M14 14L30 20M30 2H40M30 20H40',
  'switch-spst': 'M0 11H10M10 11L28 3M30 11H40',
  battery: 'M0 11H16M16 4V18M22 8V14M22 11H40',
  fuse: 'M0 11H8M8 6H32V16H8ZM8 11H32M32 11H40',
  relay: 'M0 11H8M8 5H24V17H8ZM12 8L20 14M24 11H40',
};

export function symbolSvg(id: SchematicSymbolId): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 -4 40 28');
  svg.setAttribute('class', 'ham-symbol');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', id);
  svg.setAttribute('data-symbol', id);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', SYMBOL_PATHS[id]);
  svg.append(p);

  return svg;
}

interface BoardView {
  id: string;
  root: HTMLElement;
  power: HTMLInputElement;
  sw1: HTMLInputElement;
  led: HTMLElement;
  fuse: HTMLElement;
  faults: HTMLElement;
  installs: HTMLElement;
  sig: string;
}

export class BoardPanel implements StationPanel {
  readonly id = 'board';
  readonly title = 'Training board';
  private ctx_!: PanelContext;
  private readonly views_ = new Map<string, BoardView>();

  private ids_(m: HamStationManager): string[] {
    return inService(m, 'circuit-board')
      .filter((d) => m.board(d.id))
      .map((d) => d.id);
  }

  isRelevant(m: HamStationManager): boolean {
    return this.ids_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    for (const id of this.ids_(ctx.manager)) this.build_(host, id);
    this.update(ctx.manager);
  }

  private toggle_(testId: string, label: string, onChange: (on: boolean) => void): { wrap: HTMLElement; input: HTMLInputElement } {
    const input = h('input', { type: 'checkbox', class: 'form-check-input', id: testId, 'data-testid': testId });
    input.addEventListener('change', () => onChange(input.checked));

    return { wrap: h('label', { class: 'form-check form-switch me-3 mb-0' }, input, h('span', { class: 'form-check-label', text: label })), input };
  }

  private build_(host: HTMLElement, id: string): void {
    const ctx = this.ctx_;
    const power = this.toggle_(T('ham-board', id, 'power'), 'Board power (12 V)', (on) => ctx.act({ type: 'power', deviceId: id, on }));
    const sw1 = this.toggle_(T('ham-board', id, 'sw1'), 'SW1 lever', (on) => ctx.act({ type: 'board.switch', deviceId: id, on }));
    const led = h('span', { class: 'ham-led', 'data-testid': T('ham-board', id, 'led'), role: 'img', 'aria-label': 'LED off' });
    const fuse = h('span', { 'data-testid': T('ham-board', id, 'fuse') });
    const faults = h('div', { class: 'mt-2' });
    const installs = h('div', { class: 'ham-row mt-2' });
    const parts = h('ul', { class: 'list-unstyled mb-0 mt-2', 'data-testid': T('ham-board', id, 'parts') });
    for (const c of BOARD_COMPONENTS) {
      parts.append(
        h(
          'li',
          { class: 'd-flex align-items-center gap-2 small', 'data-testid': T('ham-board', id, 'part', c.refdes) },
          symbolSvg(c.symbolId),
          h('strong', { text: c.refdes }),
          h('span', { text: `${c.label}, ${c.value}` }),
          c.inCircuit ? null : badge('loose part', 'secondary')
        )
      );
    }
    const inspect = button(T('ham-board', id, 'inspect'), 'Inspect board', () => {
      const r = ctx.act({ type: 'inspect', targetId: id });
      ctx.feedback(r.message, r.ok ? 'info' : 'warning');
    });
    const root = h(
      'div',
      { class: 'ham-instr', 'data-testid': T('ham-board', id, 'panel') },
      h('div', { class: 'ham-row' }, power.wrap, sw1.wrap, h('span', {}, 'LED ', led)),
      h('div', { class: 'ham-row' }, h('span', { text: 'F1: ' }), fuse),
      h('div', { class: 'ham-row' }, inspect),
      faults,
      installs,
      parts
    );
    host.append(root);
    this.views_.set(id, { id, root, power: power.input, sw1: sw1.input, led, fuse, faults, installs, sig: '' });
  }

  update(m: HamStationManager): void {
    for (const v of this.views_.values()) {
      const b = m.board(v.id);
      if (!b) continue;
      const s = b.state;
      v.power.checked = s.powered;
      v.sw1.checked = s.sw1On;
      const lit = s.powered && b.ledLit();
      v.led.classList.toggle('lit', lit);
      v.led.setAttribute('aria-label', lit ? 'LED lit' : 'LED off');
      setText(v.fuse, s.fuse === 'installed' ? `${s.fuseRatingA} A fitted` : s.fuse === 'blown' ? 'BLOWN' : 'removed');
      v.fuse.className = s.fuse === 'installed' ? 'text-success' : 'text-danger';
      this.syncActions_(m, v);
    }
  }

  private syncActions_(m: HamStationManager, v: BoardView): void {
    const inspected = m.events(`inspect:${v.id}`).length > 0;
    const faults = inspected ? m.faults().filter((f) => f.target === v.id && !f.cleared) : [];
    const fuseSpares = spares(m).filter((d) => d.fuseRatingA !== undefined);
    const sig = `${faults.map((f) => f.id).join(',')}|${fuseSpares.map((d) => d.id).join(',')}`;
    if (sig === v.sig) return;
    v.sig = sig;
    v.faults.replaceChildren(
      ...faults.map((f) =>
        h(
          'div',
          { class: 'alert alert-warning py-1 px-2 mb-1 d-flex justify-content-between align-items-center', 'data-testid': T('ham-board', v.id, 'fault', f.id) },
          h('span', { class: 'small', text: f.inspectClue }),
          f.clearedBy.action === 'repair'
            ? button(T('ham-board', v.id, 'repair', f.id), 'Repair', () => this.act_({ type: 'repair', faultId: f.id }), 'btn btn-sm btn-warning')
            : null
        )
      )
    );
    v.installs.replaceChildren(
      ...fuseSpares.map((d) =>
        button(
          T('ham-board', v.id, 'install', d.id),
          `Fit ${d.label} (${d.fuseRatingA} A)`,
          () => this.act_({ type: 'install', spareId: d.id, replaces: v.id }),
          'btn btn-sm btn-outline-secondary'
        )
      )
    );
  }

  private act_(a: Parameters<PanelContext['act']>[0]): void {
    const r = this.ctx_.act(a);
    this.ctx_.feedback(r.message, r.ok ? 'success' : 'warning');
  }

  dispose(): void {
    for (const v of this.views_.values()) v.root.remove();
    this.views_.clear();
  }
}
