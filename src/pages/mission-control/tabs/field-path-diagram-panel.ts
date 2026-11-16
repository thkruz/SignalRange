import type { EvidenceLog } from '@app/physical/evidence-log';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import {
  buildServicePathDiagram,
  COL_STEP,
  DIAGRAM_SEGMENTS,
  laneHeight,
  layoutDiagram,
  NODE_H,
  NODE_W,
  ROW_GAP,
  SEGMENT_LABEL,
  type ServicePathDiagram,
} from '@app/physical/service-path-diagram';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-path-diagram-panel.css';

/**
 * FieldPathDiagramPanel - Service-path diagram (Phase 38.2, M17)
 *
 * A laminated print (field documents, held fullscreen): power chain, local, terminal link, provider and
 * remote segments. The player picks nodes with the grease pencil (a click or Enter rings them) and presses
 * "Mark selection" to write the selection into the evidence log; the marks stay on the laminate until the
 * next marking or until wiped. The SVG node layer stays the hit and keyboard layer. Shared dependencies (a node on more than one service path) are highlighted unless
 * the scenario turns the highlight off (a dependency-mapping task wants the player to find them).
 * The diagram is built from the plant layout only; it never shows fault truth.
 */

export interface PathDiagramDeps {
  plant: () => PhysicalPlantManager | null;
  evidence: () => EvidenceLog | null;
  /** Default true; a scenario that asks the player to find the shared dependencies sets false */
  highlightShared?: () => boolean;
}

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `elapsed ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Break a label on spaces into at most two lines of about 20 characters; never cut or ellipsise */
function wrapLabel(label: string, max = 20): string[] {
  if (label.length <= max) return [label];
  const words = label.split(' ');
  let best = 0;
  let line1 = '';
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    if (a.length <= max || i === 1) {
      line1 = a;
      best = i;
    }
  }
  if (!line1) return [label];

  return [line1, words.slice(best).join(' ')];
}

export class FieldPathDiagramPanel {
  private built_ = false;
  private diagram_: ServicePathDiagram | null = null;
  private plantRef_: PhysicalPlantManager | null = null;
  private selected_ = new Set<string>();
  /** The last recorded marks, kept on the laminate (display only; the evidence log holds the record) */
  private marked_ = new Set<string>();
  private svgKey_ = '';
  private lastMsg_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly deps_: PathDiagramDeps
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('keydown', this.onKey_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('keydown', this.onKey_);
  }

  /** The diagram (null without authored services) */
  getDiagram(): ServicePathDiagram | null {
    const plant = this.deps_.plant();
    if (!plant) return null;
    if (plant !== this.plantRef_) {
      this.plantRef_ = plant;
      this.diagram_ = buildServicePathDiagram(plant.getConfig(), (id) => plant.getLabel(id));
      this.svgKey_ = '';
      this.selected_.clear();
      this.marked_.clear();
    }

    return this.diagram_ && this.diagram_.lanes.length > 0 ? this.diagram_ : null;
  }

  getSelection(): string[] {
    return [...this.selected_];
  }

  /** Mark or unmark a node as if the player clicked it; false for an unknown node */
  toggle(nodeId: string): boolean {
    const diagram = this.getDiagram();
    if (!diagram?.lanes.some((l) => l.nodes.some((n) => n.id === nodeId))) return false;
    if (this.selected_.has(nodeId)) this.selected_.delete(nodeId);
    else this.selected_.add(nodeId);
    this.sync();

    return true;
  }

  clearSelection(): void {
    this.selected_.clear();
    this.marked_.clear();
    this.sync();
  }

  /** Write the current selection to the evidence log; returns the entry id or a reason */
  record(): string {
    const diagram = this.getDiagram();
    const log = this.deps_.evidence();
    if (!diagram || !log) return 'no-log';
    if (this.selected_.size === 0) {
      this.lastMsg_ = 'Ring at least one box first.';
      this.sync();

      return 'empty';
    }
    const labels = new Map(diagram.lanes.flatMap((l) => l.nodes.map((n) => [n.id, n.label] as const)));
    const ids = [...this.selected_];
    const names = ids.map((id) => labels.get(id) ?? id).join(', ');
    const entry = log.recordSelection(ids, `Marked on the path diagram: ${names}.`);
    this.lastMsg_ = `Selection recorded at ${clock(entry.tS)}.${this.coverageNote_(ids)}`;
    this.marked_ = new Set(ids);
    this.selected_.clear();
    this.sync();

    return entry.id;
  }

  /** Says why a recorded set does not meet the step (counts only, never the tile names) */
  private coverageNote_(picked: string[]): string {
    const expect = this.deps_.plant()?.getConfig().diagram?.expect;
    if (!expect) return '';
    const missing = expect.include.filter((id) => !picked.includes(id)).length;
    const foreign = (expect.exclude ?? []).some((id) => picked.includes(id));
    if (missing === 0 && !foreign) return ' It covers every local component.';
    const parts: string[] = [];
    if (missing > 0) parts.push(`${missing} local component${missing === 1 ? ' is' : 's are'} still missing`);
    parts.push(foreign ? 'the set includes a tile that is not a local component' : 'every tile you marked is local');

    return ` This does not complete the step: ${parts.join('; ')}.`;
  }

  private readonly onClick_ = (e: Event): void => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-pd-act]')?.dataset.pdAct;
    if (act === 'record') {
      this.record();

      return;
    }
    if (act === 'clear') {
      this.clearSelection();

      return;
    }
    const node = target.closest<SVGElement>('[data-pd-node]');
    if (node?.dataset.pdNode) this.toggle(node.dataset.pdNode);
  };

  private readonly onKey_ = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = (e.target as Element).closest<SVGElement>('[data-pd-node]');
    if (!node?.dataset.pdNode) return;
    e.preventDefault();
    const id = node.dataset.pdNode;
    const lane = node.dataset.pdLane;
    this.toggle(id);
    // The sheet repaints on a toggle, so the pencil stays on the box it was on
    this.host_.querySelector<SVGElement>(`[data-pd-node="${CSS.escape(id)}"][data-pd-lane="${lane}"]`)?.focus({ preventScroll: true });
  };

  sync(): void {
    const diagram = this.getDiagram();
    if (!diagram) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    if (!this.built_) {
      this.host_.innerHTML = `
        <section class="fpd" aria-label="Service paths">
          <header class="fpd-head">
            <p class="fpd-kicker">Laminated field copy</p>
            <h2 class="fpd-title">Service paths</h2>
            <p class="fpd-legend">Dashed amber outline: carries more than one service. Grease pencil: your marks.</p>
          </header>
          <div class="fpd-body">
            <div data-fpd="svg"></div>
            <div class="fpd-actions">
              <span data-fpd="count" class="fpd-count"></span>
              <button type="button" class="fpd-btn fpd-btn-mark" data-pd-act="record">Mark selection</button>
              <button type="button" class="fpd-btn" data-pd-act="clear">Wipe marks</button>
            </div>
            <p class="fpd-last" data-fpd="last" aria-live="polite"></p>
          </div>
        </section>`;
      this.built_ = true;
    }
    const shared = this.deps_.highlightShared?.() ?? true;
    const key = `${shared}|${[...this.selected_].sort().join(',')}|${[...this.marked_].sort().join(',')}`;
    if (key !== this.svgKey_) {
      this.svgKey_ = key;
      const holder = this.host_.querySelector<HTMLElement>('[data-fpd="svg"]');
      if (holder) holder.innerHTML = this.svg_(diagram, shared);
    }
    const count = this.host_.querySelector<HTMLElement>('[data-fpd="count"]');
    const text = `${this.marked_.size} marked, ${this.selected_.size} ringed`;
    if (count && count.textContent !== text) count.textContent = text;
    const last = this.host_.querySelector<HTMLElement>('[data-fpd="last"]');
    if (last && last.textContent !== this.lastMsg_) last.textContent = this.lastMsg_;
  }

  private svg_(diagram: ServicePathDiagram, shared: boolean): string {
    const layout = layoutDiagram(diagram);
    const sharedIds = new Set(diagram.sharedIds);
    const colX = (i: number): number => 8 + i * (NODE_W + 22);
    const usedSegs = new Set(diagram.lanes.flatMap((lane) => lane.nodes.map((n) => n.segment)));
    const heads = DIAGRAM_SEGMENTS.map((seg, i) => (usedSegs.has(seg) ? `<text class="fpd-seg" x="${colX(i)}" y="14">${escapeHtml(SEGMENT_LABEL[seg])}</text>` : '')).join('');
    const lanes = diagram.lanes
      .map(
        (lane, i) =>
          `<text class="fpd-lane" x="8" y="${layout.laneTops[i] + 12}">${escapeHtml(lane.label)}</text><line class="fpd-sep" x1="0" x2="${layout.width}" y1="${layout.laneTops[i] + laneHeight(lane)}" y2="${layout.laneTops[i] + laneHeight(lane)}"/>`
      )
      .join('');
    const wires = diagram.lanes
      .map((lane, laneIndex) => {
        const at = new Map(layout.placements.filter((p) => p.laneIndex === laneIndex).map((p) => [p.id, p] as const));

        // One wire per real connection the plant (or the authored path) holds; nothing is paired by position
        return lane.edges
          .map(([idA, idB]) => {
            const pa = at.get(idA);
            const pb = at.get(idB);
            if (!pa || !pb) return '';
            if (pa.x === pb.x) {
              const [top, bottom] = pa.y <= pb.y ? [pa, pb] : [pb, pa];
              const cx = top.x + NODE_W / 2;
              if (bottom.y - top.y <= NODE_H + ROW_GAP) return `<line class="fpd-wire" x1="${cx}" y1="${top.y + NODE_H}" x2="${cx}" y2="${bottom.y}"/>`;
              const bx = top.x + NODE_W;

              return `<path class="fpd-wire" fill="none" d="M${bx} ${top.y + NODE_H / 2} h6 V${bottom.y + NODE_H / 2} h-6"/>`;
            }
            const [l, r] = pa.x < pb.x ? [pa, pb] : [pb, pa];
            const y1 = l.y + NODE_H / 2;
            const y2 = r.y + NODE_H / 2;
            if (r.x - l.x <= COL_STEP) return `<line class="fpd-wire" x1="${l.x + NODE_W}" y1="${y1}" x2="${r.x}" y2="${y2}"/>`;
            // A wire that skips a column runs through the channel under the lane heading, so it never passes behind a box it does not join
            const chan = layout.laneTops[laneIndex] + 17;

            return `<path class="fpd-wire" fill="none" d="M${l.x + NODE_W} ${y1} H${l.x + NODE_W + 11} V${chan} H${r.x - 11} V${y2} H${r.x}"/>`;
          })
          .join('');
      })
      .join('');
    // A box shared by two lanes is ringed once, so the footer count matches what is drawn
    const ringed = new Set<string>();
    const nodes = layout.placements
      .map((p) => {
        const node = diagram.lanes[p.laneIndex].nodes.find((n) => n.id === p.id);
        if (!node) return '';
        const cls = ['fpd-node', this.selected_.has(p.id) ? 'fpd-selected' : '', this.marked_.has(p.id) ? 'fpd-marked' : '', shared && sharedIds.has(p.id) ? 'fpd-shared' : '']
          .filter(Boolean)
          .join(' ');
        const lines = wrapLabel(node.label);
        const state = [this.marked_.has(p.id) ? 'marked' : '', this.selected_.has(p.id) ? 'ringed' : ''].filter(Boolean).join(', ');
        const aria = `${node.label}${shared && sharedIds.has(p.id) ? `, shared by ${node.serviceIds.length} services` : ''}${state ? `, ${state}` : ''}`;
        const textY = p.y + NODE_H / 2 + (lines.length > 1 ? -1 : 4);
        const tspans = lines.map((ln, k) => `<tspan x="${p.x + NODE_W / 2}" dy="${k === 0 ? 0 : 11}">${escapeHtml(ln)}</tspan>`).join('');
        const tip = shared && sharedIds.has(p.id) ? `${node.label} (shared by ${node.serviceIds.length} services)` : node.label;

        const firstDrawn = !ringed.has(p.id);
        ringed.add(p.id);
        const domId = `fpd-${p.laneIndex}-${p.id.replace(/[^A-Za-z0-9_-]+/gu, '-')}`;

        return `<g class="${cls}" id="${escapeHtml(domId)}" data-pd-lane="${p.laneIndex}" data-pd-node="${escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${this.selected_.has(p.id)}" aria-label="${escapeHtml(aria)}"><title>${escapeHtml(tip)}</title><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="2"/><text x="${p.x + NODE_W / 2}" y="${textY}" text-anchor="middle">${tspans}</text>${firstDrawn ? this.pencil_(p.x, p.y, p.laneIndex, this.marked_.has(p.id), this.selected_.has(p.id)) : ''}</g>`;
      })
      .join('');

    return `<svg class="fpd-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="Service path diagram">${heads}${lanes}${wires}${nodes}</svg>`;
  }

  /** A hand-drawn ring round a box: solid grease pencil for a recorded mark, dashed pencil while it is only ringed. Deterministic per box. */
  private pencil_(x: number, y: number, seed: number, marked: boolean, ringed: boolean): string {
    if (!marked && !ringed) return '';
    // The ring hugs the box (3 px clear on every side) so it never reaches the label text or leaves the box's lane
    const j = (n: number): number => (((Math.sin((x + 3) * 12.9898 + (y + seed) * 78.233 + n * 4.1) * 43758.5453) % 1) + 1) % 1;
    const l = x - 3 + j(1) * 1;
    const r = x + NODE_W + 3 - j(2) * 1;
    const t = y - 3 + j(3) * 1;
    const b = y + NODE_H + 3 - j(4) * 1;
    const d = `M${l + 6} ${t} L${r - 6} ${t} Q${r} ${t} ${r} ${t + 6} L${r} ${b - 6} Q${r} ${b} ${r - 6} ${b} L${l + 6} ${b} Q${l} ${b} ${l} ${b - 6} L${l} ${t + 6} Q${l} ${t} ${l + 6} ${t} Z`;
    // The recorded-mark tick sits in the gap beside the box, clear of every label
    const ty = t - 1;
    const tick = marked ? `<path class="fpd-pencil-tick" d="M${r - 14} ${ty} l3 4 l7 -9"/>` : '';

    // A box can be both marked (recorded) and ringed again: show the grease mark and the dashed ring together
    const ring = ringed ? `<path class="fpd-ring" d="${d}" transform="translate(1.5 1.5)"/>` : '';
    const grease = marked ? `<path class="fpd-grease" d="${d}"/>` : '';

    return `${ring}${grease}${tick}`;
  }
}
