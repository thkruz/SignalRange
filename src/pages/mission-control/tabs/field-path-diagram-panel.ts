import type { EvidenceLog } from '@app/physical/evidence-log';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { buildServicePathDiagram, DIAGRAM_SEGMENTS, laneHeight, layoutDiagram, NODE_H, NODE_W, SEGMENT_LABEL, type ServicePathDiagram } from '@app/physical/service-path-diagram';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-path-diagram-panel.css';

/**
 * FieldPathDiagramPanel - Service-path diagram (Phase 38.2, M17)
 *
 * An SVG per authored service: power chain, local, terminal link, provider and remote segments.
 * The player clicks nodes to select them and presses Record to write the selection into the
 * evidence log. Shared dependencies (a node on more than one service path) are highlighted unless
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

  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class FieldPathDiagramPanel {
  private built_ = false;
  private diagram_: ServicePathDiagram | null = null;
  private plantRef_: PhysicalPlantManager | null = null;
  private selected_ = new Set<string>();
  private svgKey_ = '';
  private lastMsg_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly deps_: PathDiagramDeps
  ) {
    this.host_.addEventListener('click', this.onClick_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
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
    this.sync();
  }

  /** Write the current selection to the evidence log; returns the entry id or a reason */
  record(): string {
    const diagram = this.getDiagram();
    const log = this.deps_.evidence();
    if (!diagram || !log) return 'no-log';
    if (this.selected_.size === 0) {
      this.lastMsg_ = 'Select at least one box first.';
      this.sync();

      return 'empty';
    }
    const labels = new Map(diagram.lanes.flatMap((l) => l.nodes.map((n) => [n.id, n.label] as const)));
    const ids = [...this.selected_];
    const names = ids.map((id) => labels.get(id) ?? id).join(', ');
    const entry = log.recordSelection(ids, `Marked on the path diagram: ${names}.`);
    this.lastMsg_ = `Selection recorded at ${clock(entry.tS)}.`;
    this.selected_.clear();
    this.sync();

    return entry.id;
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

  sync(): void {
    const diagram = this.getDiagram();
    if (!diagram) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    if (!this.built_) {
      this.host_.innerHTML = `
        <details class="fpd" open>
          <summary class="fpd-summary"><b>Service paths</b> <span class="fpd-last" data-fpd="last" aria-live="polite"></span></summary>
          <div class="fpd-body">
            <div data-fpd="svg"></div>
            <div class="fpd-actions">
              <span data-fpd="count" class="fpd-count"></span>
              <button type="button" class="btn btn-sm btn-outline-primary" data-pd-act="record">Record selection</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-pd-act="clear">Clear</button>
            </div>
          </div>
        </details>`;
      this.built_ = true;
    }
    const shared = this.deps_.highlightShared?.() ?? true;
    const key = `${shared}|${[...this.selected_].sort().join(',')}`;
    if (key !== this.svgKey_) {
      this.svgKey_ = key;
      const holder = this.host_.querySelector<HTMLElement>('[data-fpd="svg"]');
      if (holder) holder.innerHTML = this.svg_(diagram, shared);
    }
    const count = this.host_.querySelector<HTMLElement>('[data-fpd="count"]');
    const text = `${this.selected_.size} selected`;
    if (count && count.textContent !== text) count.textContent = text;
    const last = this.host_.querySelector<HTMLElement>('[data-fpd="last"]');
    if (last && last.textContent !== this.lastMsg_) last.textContent = this.lastMsg_;
  }

  private svg_(diagram: ServicePathDiagram, shared: boolean): string {
    const layout = layoutDiagram(diagram);
    const sharedIds = new Set(diagram.sharedIds);
    const colX = (i: number): number => 8 + i * (NODE_W + 22);
    const heads = DIAGRAM_SEGMENTS.map((seg, i) => `<text class="fpd-seg" x="${colX(i)}" y="14">${escapeHtml(SEGMENT_LABEL[seg])}</text>`).join('');
    const lanes = diagram.lanes
      .map(
        (lane, i) =>
          `<text class="fpd-lane" x="8" y="${layout.laneTops[i] + 12}">${escapeHtml(lane.label)}</text><line class="fpd-sep" x1="0" x2="${layout.width}" y1="${layout.laneTops[i] + laneHeight(lane)}" y2="${layout.laneTops[i] + laneHeight(lane)}"/>`
      )
      .join('');
    const nodes = layout.placements
      .map((p) => {
        const node = diagram.lanes[p.laneIndex].nodes.find((n) => n.id === p.id);
        if (!node) return '';
        const cls = ['fpd-node', this.selected_.has(p.id) ? 'fpd-selected' : '', shared && sharedIds.has(p.id) ? 'fpd-shared' : ''].filter(Boolean).join(' ');
        const label = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
        const tip = shared && sharedIds.has(p.id) ? `${node.label} (shared by ${node.serviceIds.length} services)` : node.label;

        return `<g class="${cls}" data-pd-node="${escapeHtml(p.id)}" role="button" tabindex="0" aria-pressed="${this.selected_.has(p.id)}"><title>${escapeHtml(tip)}</title><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="4"/><text x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2 + 4}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
      })
      .join('');

    return `<svg class="fpd-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="Service path diagram">${heads}${lanes}${nodes}</svg>`;
  }
}
