import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { assetSelectionState } from '@app/pages/mission-control/asset-selection-state';
import { PINNED_CAP, type SatelliteRegistry } from '@app/simulation/satellite-registry';
import { SimulationManager } from '@app/simulation/simulation-manager';

/** Asset id of a satellite as the tree and tabs spell it ("sat-25544"). */
export function satelliteAssetId(norad: number): string {
  return `sat-${norad}`;
}

/** NORAD id behind an asset id, or null when it is not a satellite id. */
export function noradFromAssetId(id: string | null): number | null {
  if (id === null || !id.startsWith('sat-')) {
    return null;
  }
  const norad = Number.parseInt(id.slice(4), 10);

  return Number.isFinite(norad) ? norad : null;
}

export interface SelectionChange {
  selectedAssetId: string | null;
  selectedNorad: number | null;
  pinned: number[];
}

/**
 * One source of truth for what the operator picked: the selected asset (a
 * station, a satellite, or nothing for the Mission Overview), the pinned
 * member set (cap `PINNED_CAP`, enforced through `registry.pin`) and the
 * hovered satellite.
 *
 * Selecting or pinning a constellation member hydrates it and keeps it hot
 * (`registry.setSelected` / `registry.pin`); unpinning or moving the selection
 * hands it back to the normal tiers. Map clicks never select (Phase 2 D4):
 * selection comes from the asset tree.
 *
 * Any emitter of `Events.ASSET_SELECTED` or `Events.MISSION_OVERVIEW_SELECTED`
 * (Mission Overview cards, tests) is folded in, so the service never disagrees
 * with the tabs. `select*` update the state first and then emit, so consumers
 * that read the service from inside the event see the new state.
 */
export class SelectionService {
  private static instance_: SelectionService | null = null;

  static getInstance(): SelectionService {
    SelectionService.instance_ ??= new SelectionService();

    return SelectionService.instance_;
  }

  /** Drop the singleton and its listeners (tests, scenario teardown). */
  static destroyInstance(): void {
    SelectionService.instance_?.dispose();
    SelectionService.instance_ = null;
  }

  static readonly PINNED_CAP = PINNED_CAP;

  private selectedAssetId_: string | null = null;
  private hovered_: number | null = null;
  /** Pin order (oldest first); membership is checked against the registry. */
  private pinned_: number[] = [];
  private registry_: SatelliteRegistry | undefined;
  private readonly boundAssetSelected_ = this.onAssetSelected_.bind(this);
  private readonly boundOverview_ = this.onOverviewSelected_.bind(this);

  private constructor() {
    const bus = EventBus.getInstance();

    bus.on(Events.ASSET_SELECTED, this.boundAssetSelected_);
    bus.on(Events.MISSION_OVERVIEW_SELECTED, this.boundOverview_);
  }

  // ------------------------------------------------------------------ reads

  get selectedAssetId(): string | null {
    return this.selectedAssetId_;
  }

  /** NORAD id of the selected satellite (authored or member), else null. */
  get selectedNorad(): number | null {
    return noradFromAssetId(this.selectedAssetId_);
  }

  get hoveredNorad(): number | null {
    return this.hovered_;
  }

  /** Pinned member NORAD ids, oldest pin first. */
  get pinnedNorads(): readonly number[] {
    this.syncRegistry_();

    return this.pinned_;
  }

  get pinnedCount(): number {
    return this.pinnedNorads.length;
  }

  get pinnedCap(): number {
    return PINNED_CAP;
  }

  isPinned(norad: number): boolean {
    return this.registry()?.isPinned(norad) ?? false;
  }

  /** True when `norad` is a pinnable member and the set has room (or it is already pinned). */
  canPin(norad: number): boolean {
    const registry = this.registry();

    return registry !== undefined && registry.memberIndexOf(norad) >= 0 && (registry.isPinned(norad) || registry.pinnedCount < PINNED_CAP);
  }

  // ----------------------------------------------------------------- writes

  selectSatellite(norad: number): void {
    this.selectAsset('satellite', satelliteAssetId(norad));
  }

  selectGroundStation(id: string): void {
    this.selectAsset('ground-station', id);
  }

  selectAsset(type: 'ground-station' | 'satellite', id: string): void {
    this.apply_(type, id);
    EventBus.getInstance().emit(Events.ASSET_SELECTED, { type, id });
  }

  /** Back to the Mission Overview (no asset selected). */
  selectOverview(): void {
    this.apply_(null, null);
    EventBus.getInstance().emit(Events.MISSION_OVERVIEW_SELECTED);
  }

  /**
   * Pin a member: hydrated, hot and tracked in the embed until unpinned.
   * Returns false when the set is full (cap 24) or `norad` is not a member.
   */
  pin(norad: number): boolean {
    const registry = this.registry();

    this.syncRegistry_();
    if (!registry?.pin(norad, true)) {
      return false;
    }
    registry.touch(norad);
    if (!this.pinned_.includes(norad)) {
      this.pinned_.push(norad);
    }
    this.emitChange_();

    return true;
  }

  /** Unpin a member; it returns to the normal tiers (released after its cold TTL). */
  unpin(norad: number): void {
    const registry = this.registry();

    if (!registry?.isPinned(norad)) {
      return;
    }
    registry.pin(norad, false);
    this.pinned_ = this.pinned_.filter((n) => n !== norad);
    this.emitChange_();
  }

  /** Pin if unpinned, else unpin. Returns the pinned state afterwards. */
  togglePin(norad: number): boolean {
    if (this.isPinned(norad)) {
      this.unpin(norad);

      return false;
    }

    return this.pin(norad);
  }

  hover(norad: number | null): void {
    this.hovered_ = norad;
  }

  /** Forget everything (new scenario). */
  reset(): void {
    const registry = this.registry();

    registry?.setSelected(null);
    for (const norad of this.pinned_) {
      registry?.pin(norad, false);
    }
    this.pinned_ = [];
    this.selectedAssetId_ = null;
    this.hovered_ = null;
    assetSelectionState.assetId = null;
    assetSelectionState.groundStationId = null;
  }

  dispose(): void {
    const bus = EventBus.getInstance();

    bus.off(Events.ASSET_SELECTED, this.boundAssetSelected_);
    bus.off(Events.MISSION_OVERVIEW_SELECTED, this.boundOverview_);
  }

  // --------------------------------------------------------------- internal

  /** The live registry; undefined for partial SimulationManager stubs (tests). */
  registry(): SatelliteRegistry | undefined {
    return (SimulationManager.getInstance() as { registry?: SatelliteRegistry }).registry;
  }

  private syncRegistry_(): void {
    const registry = this.registry();

    if (registry !== this.registry_) {
      // A new scenario brought a new registry: its pin flags start clear.
      this.registry_ = registry;
      this.pinned_ = [];
    }
  }

  private onAssetSelected_(data: { type: 'ground-station' | 'satellite'; id: string }): void {
    if (this.selectedAssetId_ !== data.id) {
      this.apply_(data.type, data.id);
    }
  }

  private onOverviewSelected_(): void {
    if (this.selectedAssetId_ !== null) {
      this.apply_(null, null);
    }
  }

  private apply_(type: 'ground-station' | 'satellite' | null, id: string | null): void {
    this.syncRegistry_();
    this.selectedAssetId_ = id;
    assetSelectionState.assetId = id;
    if (type === 'ground-station') {
      assetSelectionState.groundStationId = id;
    }
    // Hydrates and holds a selected member; any other selection drops the hold.
    this.registry_?.setSelected(type === 'satellite' ? noradFromAssetId(id) : null);
    this.emitChange_();
  }

  private emitChange_(): void {
    EventBus.getInstance().emit(Events.SELECTION_CHANGED, {
      selectedAssetId: this.selectedAssetId_,
      selectedNorad: this.selectedNorad,
      pinned: [...this.pinned_],
    });
  }
}
