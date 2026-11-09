import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SelectionService } from '@app/services/selection-service';
import { getProvidedTleSet, type SatelliteRegistry } from '@app/simulation/satellite-registry';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { ConstellationTreeModel, type TreeFilter, type TreeRow, virtualWindow } from './constellation-tree-model';

/** Fixed row height: the virtual window is plain arithmetic. */
export const ROW_HEIGHT_PX = 32;
export const OVERSCAN_ROWS = 8;
const FALLBACK_VIEWPORT_PX = 400;

export interface ConstellationTreeOptions {
  /** True while the brief still locks stations, satellites and overview. */
  isLocked: () => boolean;
  /** Shown when a locked row is clicked. */
  onLockedClick: () => void;
}

/**
 * Virtualised, grouped, searchable list of constellation members. Only the
 * visible rows plus a small overscan are in the DOM; one delegated click and
 * keyboard handler serves the whole list. Rows are plain divs with a CSS icon
 * (no per-row image). Search or a filter swaps the hierarchy for a flat result
 * list; clearing them brings the hierarchy back with its expansion state.
 */
export class ConstellationTreeView {
  private readonly model_: ConstellationTreeModel;
  private readonly registry_: SatelliteRegistry;
  private readonly root_: HTMLDivElement;
  private readonly viewport_: HTMLElement;
  private readonly spacer_: HTMLElement;
  private readonly rowsEl_: HTMLElement;
  private readonly searchInput_: HTMLInputElement;
  private readonly status_: HTMLElement;
  private readonly expanded_ = new Set<string>();
  private readonly filters_ = new Set<TreeFilter>();
  private readonly options_: ConstellationTreeOptions;
  private rows_: TreeRow[] = [];
  private query_ = '';
  private lastSearchMs_ = 0;
  private rafId_ = 0;
  private windowKey_ = '';
  private readonly boundScroll_ = this.onScroll_.bind(this);
  private readonly boundClick_ = this.onClick_.bind(this);
  private readonly boundKey_ = this.onKeydown_.bind(this);
  private readonly boundInput_ = this.onSearchInput_.bind(this);
  private readonly boundFilter_ = this.onFilterClick_.bind(this);
  private readonly boundSelection_ = this.onSelectionChanged_.bind(this);

  constructor(registry: SatelliteRegistry, options: ConstellationTreeOptions) {
    this.registry_ = registry;
    this.options_ = options;
    this.model_ = new ConstellationTreeModel(registry, setLabel);
    this.root_ = document.createElement('div');
    this.root_.className = 'list-group list-group-flush asset-group-constellations constellation-tree';
    this.root_.innerHTML = `
      <div class="list-group-header sticky-top">
        <span class="list-group-header-text">Constellations</span>
      </div>
      <div class="ct-controls px-2 py-2">
        <input type="search" class="form-control form-control-sm ct-search" placeholder="Search name or NORAD id" aria-label="Search constellation members" autocomplete="off" />
        <div class="ct-filters d-flex flex-wrap gap-1 mt-2">
          <button type="button" class="btn btn-sm btn-outline-secondary ct-filter" data-filter="hot" aria-pressed="false">Hot</button>
          <button type="button" class="btn btn-sm btn-outline-secondary ct-filter" data-filter="inView" aria-pressed="false">In view</button>
          <button type="button" class="btn btn-sm btn-outline-secondary ct-filter" data-filter="pinned" aria-pressed="false">Pinned <span class="ct-pin-count"></span></button>
        </div>
        <div class="ct-status small text-muted mt-1" aria-live="polite"></div>
      </div>
      <div class="ct-viewport" role="tree" aria-label="Constellation members" tabindex="0">
        <div class="ct-spacer"><div class="ct-rows"></div></div>
      </div>`;
    this.viewport_ = this.root_.querySelector<HTMLElement>('.ct-viewport')!;
    this.spacer_ = this.root_.querySelector<HTMLElement>('.ct-spacer')!;
    this.rowsEl_ = this.root_.querySelector<HTMLElement>('.ct-rows')!;
    this.searchInput_ = this.root_.querySelector<HTMLInputElement>('.ct-search')!;
    this.status_ = this.root_.querySelector<HTMLElement>('.ct-status')!;

    this.viewport_.addEventListener('scroll', this.boundScroll_, { passive: true });
    this.viewport_.addEventListener('click', this.boundClick_);
    this.viewport_.addEventListener('keydown', this.boundKey_);
    this.searchInput_.addEventListener('input', this.boundInput_);
    this.root_.querySelector('.ct-filters')!.addEventListener('click', this.boundFilter_);
    EventBus.getInstance().on(Events.SELECTION_CHANGED, this.boundSelection_);
    this.rebuild_();
    // Dev-only handle for the perf harness (the perf scenario defines __srPerf).
    if ((globalThis as { __srPerf?: unknown }).__srPerf !== undefined) {
      (globalThis as { __srTree?: ConstellationTreeView }).__srTree = this;
    }
  }

  get element(): HTMLDivElement {
    return this.root_;
  }

  get model(): ConstellationTreeModel {
    return this.model_;
  }

  /** Rows currently in the DOM (tests, harness). */
  get renderedRowCount(): number {
    return this.rowsEl_.childElementCount;
  }

  get totalRowCount(): number {
    return this.rows_.length;
  }

  get lastSearchMs(): number {
    return this.lastSearchMs_;
  }

  /** Set the search text and apply it now (harness, tests). Returns the elapsed milliseconds. */
  setQuery(query: string): number {
    this.searchInput_.value = query;
    this.applyQuery_(query);

    return this.lastSearchMs_;
  }

  setFilter(filter: TreeFilter, on: boolean): void {
    if (on) {
      this.filters_.add(filter);
    } else {
      this.filters_.delete(filter);
    }
    this.root_.querySelector(`[data-filter="${filter}"]`)?.setAttribute('aria-pressed', String(on));
    this.rebuild_();
  }

  expand(keys: Iterable<string>): void {
    for (const key of keys) {
      this.expanded_.add(key);
    }
    this.rebuild_();
  }

  toggle(key: string): void {
    if (!this.expanded_.delete(key)) {
      this.expanded_.add(key);
    }
    this.rebuild_();
  }

  /** Open the nodes above a member and scroll it into view. */
  reveal(norad: number): void {
    const idx = this.registry_.memberIndexOf(norad);

    if (idx < 0) {
      return;
    }
    this.searchInput_.value = '';
    this.query_ = '';
    this.filters_.clear();
    this.root_.querySelectorAll('.ct-filter').forEach((el) => el.setAttribute('aria-pressed', 'false'));
    for (const key of this.model_.keysToReveal(idx)) {
      this.expanded_.add(key);
    }
    this.rebuild_();
    const row = this.rows_.findIndex((r) => r.index === idx);

    if (row >= 0) {
      this.viewport_.scrollTop = Math.max(0, row * ROW_HEIGHT_PX - this.viewportHeight_() / 2);
      this.renderWindow_(true);
    }
  }

  /** Re-render the visible rows (lock state, selection, pin state changed). */
  refresh(): void {
    this.renderWindow_(true);
    this.updateHeader_();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId_);
    this.viewport_.removeEventListener('scroll', this.boundScroll_);
    this.viewport_.removeEventListener('click', this.boundClick_);
    this.viewport_.removeEventListener('keydown', this.boundKey_);
    this.searchInput_.removeEventListener('input', this.boundInput_);
    EventBus.getInstance().off(Events.SELECTION_CHANGED, this.boundSelection_);
    this.root_.remove();
  }

  // --------------------------------------------------------------- internal

  private searching_(): boolean {
    return this.query_.trim() !== '' || this.filters_.size > 0;
  }

  private rebuild_(): void {
    const started = performance.now();

    if (this.searching_()) {
      const hits = this.model_.search(this.query_);
      const filtered = this.model_.applyFilters(hits, this.filters_, this.inViewSet_());

      this.rows_ = this.model_.groupedRows(filtered);
      this.status_.textContent = `${filtered.length.toLocaleString('en-US')} of ${this.model_.memberCount.toLocaleString('en-US')} members`;
    } else {
      this.rows_ = this.model_.visibleRows(this.expanded_);
      this.status_.textContent = `${this.model_.memberCount.toLocaleString('en-US')} members`;
    }
    this.spacer_.style.height = `${this.rows_.length * ROW_HEIGHT_PX}px`;
    this.viewport_.scrollTop = Math.min(this.viewport_.scrollTop, Math.max(0, this.rows_.length * ROW_HEIGHT_PX - this.viewportHeight_()));
    this.renderWindow_(true);
    this.updateHeader_();
    this.lastSearchMs_ = performance.now() - started;
  }

  private updateHeader_(): void {
    const count = SelectionService.getInstance().pinnedCount;
    const el = this.root_.querySelector('.ct-pin-count');

    if (el) {
      el.textContent = count > 0 ? `${count}/${SelectionService.getInstance().pinnedCap}` : '';
    }
  }

  /** Members in a station's visibility margin (warm tier) plus hot members. */
  private inViewSet_(): Set<number> {
    const out = new Set<number>();

    if (!this.filters_.has('inView')) {
      return out;
    }
    const sim = SimulationManager.getInstance() as { scheduler?: { warmNoradIds(): readonly number[] } };

    sim.scheduler?.warmNoradIds().forEach((n) => out.add(n));
    this.registry_.hot().forEach((sat) => out.add(sat.noradId));

    return out;
  }

  private viewportHeight_(): number {
    return this.viewport_.clientHeight || FALLBACK_VIEWPORT_PX;
  }

  private onScroll_(): void {
    if (this.rafId_) {
      return;
    }
    this.rafId_ = requestAnimationFrame(() => {
      this.rafId_ = 0;
      this.renderWindow_(false);
    });
  }

  private renderWindow_(force: boolean): void {
    const { start, end } = virtualWindow(this.viewport_.scrollTop, this.viewportHeight_(), ROW_HEIGHT_PX, this.rows_.length, OVERSCAN_ROWS);
    const key = `${start}:${end}`;

    if (!force && key === this.windowKey_) {
      return;
    }
    this.windowKey_ = key;
    const service = SelectionService.getInstance();
    const selected = service.selectedNorad;
    const locked = this.options_.isLocked();
    const parts: string[] = [];

    for (let i = start; i < end; i++) {
      parts.push(this.rowHtml_(this.rows_[i], i, selected, locked, service));
    }
    this.rowsEl_.style.transform = `translateY(${start * ROW_HEIGHT_PX}px)`;
    this.rowsEl_.innerHTML = parts.join('');
  }

  private rowHtml_(row: TreeRow, position: number, selected: number | null, locked: boolean, service: SelectionService): string {
    const pad = `padding-left:${0.5 + row.depth * 0.9}rem`;
    const style = `height:${ROW_HEIGHT_PX}px;${pad}`;

    if (row.kind !== 'member') {
      const chevron = row.expanded ? 'ti-chevron-down' : 'ti-chevron-right';

      return `<div class="list-group-item list-group-item-action d-flex align-items-center ct-row ct-node ct-${row.kind}" role="treeitem" aria-expanded="${row.expanded}" tabindex="-1" data-row="${position}" data-key="${escapeHtml(row.key)}" style="${style}"><i class="ti ${chevron} me-1"></i><span class="flex-fill text-truncate">${escapeHtml(row.label)}</span><span class="small text-muted font-monospace">${row.count.toLocaleString('en-US')}</span></div>`;
    }
    const active = row.norad === selected;
    const pinned = service.isPinned(row.norad);
    const name = escapeHtml(row.label);
    const lockedAttrs = locked ? ` aria-disabled="true" title="${escapeHtml(LOCKED_TEXT)}"` : '';
    const hot = this.registry_.isHydrated(row.norad);

    return `<div class="list-group-item list-group-item-action d-flex align-items-center sidebar-lockable ct-row ct-member${active ? ' active' : ''}" role="treeitem" tabindex="-1" data-row="${position}" data-asset-type="satellite" data-asset-id="sat-${row.norad}" data-norad="${row.norad}" data-item-name="${name}" data-tooltip="${name}"${lockedAttrs} style="${style}"><i class="ti ti-satellite me-1"></i><span class="flex-fill text-truncate">${name}</span><span class="small text-muted font-monospace me-1">${row.norad}</span><button type="button" class="btn btn-sm btn-icon ct-pin${pinned ? ' ct-pinned' : ''}" data-action="pin" aria-pressed="${pinned}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${name}" title="${pinned ? 'Unpin' : 'Pin'}"><i class="ti ${pinned ? 'ti-pin-filled' : 'ti-pin'}"></i></button><span class="item-status ${hot ? 'operational' : 'cold'}"></span></div>`;
  }

  private onSearchInput_(): void {
    this.applyQuery_(this.searchInput_.value);
  }

  private applyQuery_(query: string): void {
    this.query_ = query;
    this.viewport_.scrollTop = 0;
    this.rebuild_();
  }

  private onFilterClick_(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]');

    if (!button) {
      return;
    }
    const filter = button.dataset.filter as TreeFilter;

    this.setFilter(filter, !this.filters_.has(filter));
  }

  private onClick_(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const rowEl = target.closest<HTMLElement>('.ct-row');

    if (!rowEl) {
      return;
    }
    event.preventDefault();
    this.activate_(rowEl, target.closest('[data-action="pin"]') !== null);
  }

  private onKeydown_(event: KeyboardEvent): void {
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>('.ct-row');

    if (event.key === 'Enter' || event.key === ' ') {
      if (rowEl) {
        event.preventDefault();
        this.activate_(rowEl, false);
      }

      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const current = rowEl ? Number(rowEl.dataset.row) : -1;
    const next = Math.max(0, Math.min(this.rows_.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    const top = next * ROW_HEIGHT_PX;
    const view = this.viewport_;

    if (top < view.scrollTop) {
      view.scrollTop = top;
    } else if (top + ROW_HEIGHT_PX > view.scrollTop + this.viewportHeight_()) {
      view.scrollTop = top + ROW_HEIGHT_PX - this.viewportHeight_();
    }
    this.renderWindow_(true);
    this.rowsEl_.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus();
  }

  private activate_(rowEl: HTMLElement, pinClick: boolean): void {
    const key = rowEl.dataset.key;

    if (key !== undefined) {
      // Result headers are always open.
      if (!this.searching_()) {
        this.toggle(key);
      }

      return;
    }
    if (this.options_.isLocked()) {
      this.options_.onLockedClick();

      return;
    }
    const norad = Number(rowEl.dataset.norad);
    const service = SelectionService.getInstance();

    if (pinClick) {
      service.togglePin(norad);
    } else {
      service.selectSatellite(norad);
    }
  }

  private onSelectionChanged_(): void {
    this.renderWindow_(true);
    this.updateHeader_();
    if (this.filters_.has('pinned')) {
      this.rebuild_();
    }
  }
}

const LOCKED_TEXT = 'Locked until you acknowledge the Mission Brief';

/** "Starlink, all shells, 2026-11 snapshot" or the set id when the set is not loaded. */
function setLabel(tleSetId: string): string {
  return getProvidedTleSet(tleSetId)?.title ?? tleSetId;
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}
