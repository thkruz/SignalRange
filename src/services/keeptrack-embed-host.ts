/**
 * @file keeptrack-embed-host - persistent self-hosted KeepTrack flat map
 * @description One embed per mission-control page. The Ground Track tab asks it
 * to show the world map over a placeholder element and describes what to draw
 * (focus, coverage, station access, day/night); the host owns everything
 * else: boot, scenario sync (satellites, stations, element changes), clock
 * sync, placement and parking.
 *
 * Lessons from the 2026-11-08 spike that shape this file:
 *  - The iframe must boot while rendering (opacity 0, real size, never
 *    display:none, which stops requestAnimationFrame and stalls the boot).
 *    After ready and the first sync it is parked: embed.hide() suspends the
 *    engine (0 fps) and the host element goes display:none.
 *  - tabbed-canvas rewrites #canvas-content, so the host element lives on
 *    <body> and is positioned over the tab's anchor element.
 *  - Time follows the scenario clock by rate, corrected at every clock jump and
 *    by a 1 s drift check.
 *
 * Any boot problem (no WebGL2, empty license, bundle absent, timeout) puts the
 * host in the 'failed' state, logged once; GroundTrackTab then renders GeoMap.
 */
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Logger } from '@app/logging/logger';
import { getProvidedTleSet, type SatelliteRegistry } from '@app/simulation/satellite-registry';
import { SimClock } from '@app/simulation/sim-clock';
import { trackedOrbitalSatellites } from '@app/simulation/sim-queries';
import { SimulationManager } from '@app/simulation/simulation-manager';
import {
  type CreateKeepTrackEmbedOptions,
  createKeepTrackEmbed,
  type EmbedColor,
  type EmbedLatLon,
  type EmbedObject,
  type EmbedObjectStyleEntry,
  type KeepTrackEmbed,
} from '@app/vendor/keeptrack-embed';

/** Distinct track colors, assigned by catalog order so they stay stable. */
export const TRACK_COLORS = ['#e8ebee', '#7ad0ff', '#ffd07a', '#8fe388', '#ff9ecb', '#c3a6ff'];

/** Elevation mask for coverage footprints and station access circles (deg). */
export const FOOTPRINT_MIN_ELEVATION_DEG = 5;

/** Track window either side of "now" (min) and sample step (s). */
const TRACK_OPTIONS = { pastMin: 45, futureMin: 45, stepSec: 30 } as const;

/** Ground tracks are drawn for at most this many satellites (selected first, then authored and pinned, then hot). */
export const MAX_TRACKED_OBJECTS = 10;

/** Host labels the embed may draw (selected first, then highlighted). */
export const LABEL_BUDGET = 100;

/** Slots allocated beyond the scenario's satellites at boot. */
const CAPACITY_MIN_HEADROOM = 256;
const CAPACITY_MAX = 100_000;

/** Base dot colour of each top-level TLE set (by reference order); groups of one set are shaded from it. */
export const SET_COLORS = ['#4aa8ff', '#ffb84a', '#6fd18b', '#d17fe0'];

const EMBED_SRC = '/keeptrack/index.html';
const READY_TIMEOUT_MS = 30_000;
const DRIFT_CHECK_INTERVAL_MS = 1000;
const DRIFT_TOLERANCE_MS = 1000;
const STATION_COLOR: EmbedColor = [1, 0.3, 0.3, 1];
const ACCESS_COLOR: EmbedColor = [1, 0.5, 0.2, 1];

/** One top-level constellation switch in the map toolbar. */
export interface ConstellationLayer {
  /** TLE set id */
  id: string;
  label: string;
  visible: boolean;
  /** Embed group ids drawn by this switch */
  groupIds: string[];
}

export type EmbedHostState = 'idle' | 'booting' | 'ready' | 'failed' | 'destroyed';

/** What the Ground Track tab wants drawn. */
export interface EmbedMapView {
  /** Focused satellite (per-satellite tab), or null for the all-assets world map. */
  focusNoradId: number | null;
  showCoverage: boolean;
  /** Station access circles for the focused satellite. Ignored without a focus. */
  showAccess: boolean;
  showDayNight: boolean;
}

/** One-shot camera move applied when the map is shown. */
export interface EmbedMapCamera {
  center?: EmbedLatLon;
  zoom?: number;
}

export interface KeepTrackEmbedHostOptions {
  /** Defaults to the build-time license. */
  licenseKey?: string;
  /** Test seam. */
  createEmbed?: (options: CreateKeepTrackEmbedOptions) => Promise<KeepTrackEmbed>;
  readyTimeoutMs?: number;
}

/** Mix '#rrggbb' toward white (t > 0) or black (t < 0). */
export function shadeHex(hex: string, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number): number => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  const out = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0'));

  return `#${out.join('')}`;
}

function setLabel(id: string): string {
  if (id.startsWith('starlink')) {
    return 'Starlink';
  }
  if (id.startsWith('geo')) {
    return 'GEO belt';
  }

  return getProvidedTleSet(id)?.title ?? id;
}

/** '#rrggbb' to the embed's 0..1 RGBA tuple. */
export function hexToEmbedColor(hex: string): EmbedColor {
  const n = Number.parseInt(hex.slice(1), 16);

  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

let failureLogged_ = false;

/** Test seam: forget that the failure was already logged. */
export function resetEmbedFailureLog(): void {
  failureLogged_ = false;
}

export class KeepTrackEmbedHost {
  private static instance_: KeepTrackEmbedHost | null = null;

  private readonly licenseKey_: string;
  private readonly createEmbed_: (options: CreateKeepTrackEmbedOptions) => Promise<KeepTrackEmbed>;
  private readonly readyTimeoutMs_: number;
  private readonly listeners_ = new Set<(state: EmbedHostState) => void>();
  private readonly boundPlace_: () => void;
  private readonly boundElementsChanged_: (data: { noradId: number }) => void;
  private readonly boundUpdate_: () => void;

  private state_: EmbedHostState = 'idle';
  private embed_: KeepTrackEmbed | null = null;
  private hostEl_: HTMLDivElement | null = null;
  private anchor_: HTMLElement | null = null;
  private view_: EmbedMapView | null = null;
  private pendingCamera_: EmbedMapCamera | null = null;
  private wantVisible_ = false;
  private resizeObserver_: ResizeObserver | null = null;
  private unsubscribeClock_: (() => void) | null = null;
  private lastDriftCheckMs_ = 0;
  private failureReason_: string | null = null;
  /** Style key last sent per hostId, so a view change only restyles what changed. */
  private readonly appliedStyles_ = new Map<string, string>();
  private trackKey_ = '';
  private upsertedIds_: string[] = [];
  private readonly hiddenSets_ = new Set<string>();
  private lastRevision_ = -1;

  constructor(options: KeepTrackEmbedHostOptions = {}) {
    this.licenseKey_ = options.licenseKey ?? __KT_EMBED_LICENSE__;
    this.createEmbed_ = options.createEmbed ?? createKeepTrackEmbed;
    this.readyTimeoutMs_ = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
    this.boundPlace_ = this.place_.bind(this);
    this.boundElementsChanged_ = this.onElementsChanged_.bind(this);
    this.boundUpdate_ = this.driftCheck_.bind(this);
  }

  /** The page-wide host (created on first use). */
  static getInstance(): KeepTrackEmbedHost {
    KeepTrackEmbedHost.instance_ ??= new KeepTrackEmbedHost();

    return KeepTrackEmbedHost.instance_;
  }

  /** Drop the page-wide host (mission-control teardown, tests). */
  static destroyInstance(): void {
    KeepTrackEmbedHost.instance_?.destroy();
    KeepTrackEmbedHost.instance_ = null;
  }

  /** Test seam. */
  static setInstance(host: KeepTrackEmbedHost | null): void {
    KeepTrackEmbedHost.instance_ = host;
  }

  /** A getter so control flow does not narrow `state_` across awaits. */
  private get isDestroyed_(): boolean {
    return this.state_ === 'destroyed';
  }

  get state(): EmbedHostState {
    return this.state_;
  }

  get failureReason(): string | null {
    return this.failureReason_;
  }

  /** True when the embed can still be expected to draw the map. */
  get isUsable(): boolean {
    return this.state_ === 'idle' || this.state_ === 'booting' || this.state_ === 'ready';
  }

  /** Subscribe to state changes. Returns the unsubscribe function. */
  onStateChange(listener: (state: EmbedHostState) => void): () => void {
    this.listeners_.add(listener);

    return () => {
      this.listeners_.delete(listener);
    };
  }

  /** Start booting in the background (mission-control start). Safe to call repeatedly. */
  preload(): void {
    if (this.state_ !== 'idle') {
      return;
    }
    void this.boot_();
  }

  /**
   * Put the map on screen over `anchor` and apply `view`. If the embed is still
   * booting the request is remembered and honoured when it becomes ready.
   */
  show(anchor: HTMLElement, view: EmbedMapView, camera?: EmbedMapCamera): void {
    this.anchor_ = anchor;
    this.view_ = view;
    this.wantVisible_ = true;
    if (camera) {
      this.pendingCamera_ = camera;
    }

    if (this.state_ === 'idle') {
      void this.boot_();

      return;
    }
    if (this.state_ === 'ready') {
      this.reveal_();
    }
  }

  /** Update what is drawn without moving the map. */
  setView(view: EmbedMapView): void {
    this.view_ = view;
    if (this.state_ === 'ready' && this.wantVisible_) {
      this.applyView_();
    }
  }

  /** Park the map: engine suspended, element display:none. */
  hide(): void {
    this.wantVisible_ = false;
    this.anchor_ = null;
    if (this.state_ === 'ready') {
      this.park_();
    }
  }

  destroy(): void {
    if (this.isDestroyed_) {
      return;
    }
    this.setState_('destroyed');
    this.teardown_();
    this.listeners_.clear();
  }

  // ------------------------------------------------------------------ boot

  private async boot_(): Promise<void> {
    this.setState_('booting');

    if (this.licenseKey_ === '') {
      this.fail_('no KeepTrack embed license was built into this bundle');

      return;
    }

    const el = document.createElement('div');

    el.id = 'kt-embed-host';
    // Invisible but rendering: display:none would stop requestAnimationFrame and stall the boot.
    Object.assign(el.style, { position: 'fixed', zIndex: '50', background: '#000', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(el);
    this.hostEl_ = el;
    this.place_();
    window.addEventListener('resize', this.boundPlace_);
    window.addEventListener('scroll', this.boundPlace_, true);
    this.resizeObserver_ = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.boundPlace_);
    const canvasContent = document.querySelector('#canvas-content');

    if (canvasContent) {
      this.resizeObserver_?.observe(canvasContent);
    }

    try {
      const embed = await this.createEmbed_({
        // HTMLDivElement is not assignable to HTMLElement here: a global typing in the app augments `draggable`.
        container: el as unknown as HTMLElement,
        src: EMBED_SRC,
        readyTimeoutMs: this.readyTimeoutMs_,
        config: {
          licenseKey: this.licenseKey_,
          catalog: { mode: 'scenario', capacity: this.capacity_() },
          plugins: { allow: ['FlatMapView'] },
          ownership: { time: 'host', catalog: 'host', sensors: 'host', selection: 'host', camera: 'shared' },
          ui: { bottomMenu: false, topMenu: false, search: false, timeControls: false, keyboard: false, contextMenu: false, toasts: false, infoBox: false },
          layers: { dayNight: true, graticule: true, orbits: false, labels: 'host', labelBudget: LABEL_BUDGET },
          time: { start: SimClock.nowMs(), rate: 0 },
          settings: { propagatorBackend: 'sgp4', installDirectory: '/keeptrack/', enableHoverOverlay: false, enableHoverOrbits: false },
        },
      });

      if (this.isDestroyed_) {
        embed.destroy();

        return;
      }
      this.embed_ = embed;
      await embed.whenReady();
      if (this.isDestroyed_) {
        return;
      }
      embed.setCamera({ mode: 'flat-map', zoom: 1 });
      this.syncScenario_();
      this.startClockSync_();
      this.setState_('ready');
      if (this.wantVisible_) {
        this.reveal_();
      } else {
        this.park_();
      }
    } catch (error) {
      if (!this.isDestroyed_) {
        this.fail_(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    }
  }

  private fail_(reason: string): void {
    this.failureReason_ = reason;
    if (!failureLogged_) {
      failureLogged_ = true;
      Logger.warn(`[keeptrack-embed] falling back to the built-in world map: ${reason}`);
    }
    this.teardown_();
    this.setState_('failed');
  }

  private teardown_(): void {
    this.unsubscribeClock_?.();
    this.unsubscribeClock_ = null;
    EventBus.getInstance().off(Events.SATELLITE_ELEMENTS_CHANGED, this.boundElementsChanged_);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    window.removeEventListener('resize', this.boundPlace_);
    window.removeEventListener('scroll', this.boundPlace_, true);
    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = null;
    if (this.embed_ && this.upsertedIds_.length > 0) {
      try {
        // One bulk call frees every slot; destroy() would too, but this keeps the order explicit.
        this.embed_.removeObjects(this.upsertedIds_);
      } catch {
        // Not ready, or already gone.
      }
    }
    this.upsertedIds_ = [];
    this.appliedStyles_.clear();
    this.trackKey_ = '';
    try {
      this.embed_?.destroy();
    } catch {
      // Already gone.
    }
    this.embed_ = null;
    this.hostEl_?.remove();
    this.hostEl_ = null;
    this.anchor_ = null;
  }

  private setState_(state: EmbedHostState): void {
    if (this.state_ === state) {
      return;
    }
    this.state_ = state;
    for (const listener of [...this.listeners_]) {
      listener(state);
    }
  }

  // --------------------------------------------------------------- display

  private reveal_(): void {
    const embed = this.embed_;
    const el = this.hostEl_;

    if (!embed || !el) {
      return;
    }
    Object.assign(el.style, { display: 'block', opacity: '1', pointerEvents: 'auto' });
    this.place_();
    embed.show();
    embed.setTime(SimClock.nowMs());
    this.applyView_();
    if (this.pendingCamera_) {
      const { center, zoom } = this.pendingCamera_;

      embed.setCamera({ mode: 'flat-map', ...(center ? { center } : {}), ...(zoom === undefined ? {} : { zoom }) });
      this.pendingCamera_ = null;
    }
    this.resizeObserver_?.disconnect();
    if (this.anchor_) {
      this.resizeObserver_?.observe(this.anchor_);
    }
  }

  private park_(): void {
    this.embed_?.hide();
    if (this.hostEl_) {
      this.hostEl_.style.display = 'none';
    }
  }

  /** Keep the host element over the anchor (or over the tab area / window while preloading). */
  private place_(): void {
    const el = this.hostEl_;

    if (!el) {
      return;
    }
    const canvasContent = document.querySelector<HTMLElement>('#canvas-content');
    const anchorRect = this.anchor_?.isConnected ? this.anchor_.getBoundingClientRect() : null;
    const rect = anchorRect && anchorRect.width > 0 ? anchorRect : canvasContent?.getBoundingClientRect();

    if (!rect || rect.width === 0) {
      // Preloading before the tab area exists: boot at window size so WebGL gets a real canvas.
      Object.assign(el.style, { left: '0px', top: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, clipPath: 'none' });

      return;
    }
    Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${Math.max(rect.height, 200)}px`, clipPath: 'none' });

    // The tab area scrolls; clip the map to it instead of letting it float over the tab bar.
    if (anchorRect && canvasContent) {
      const bounds = canvasContent.getBoundingClientRect();
      const top = Math.max(0, bounds.top - rect.top);
      const bottom = Math.max(0, rect.bottom - bounds.bottom);

      if (top > 0 || bottom > 0) {
        el.style.clipPath = `inset(${top}px 0 ${bottom}px 0)`;
      }
    }
  }

  // ------------------------------------------------------------------ data

  private registry_(): SatelliteRegistry | undefined {
    // Partial SimulationManager stubs (tests) have no registry.
    return (SimulationManager.getInstance() as { registry?: SatelliteRegistry }).registry;
  }

  /** Authored plus pinned satellites: what per-satellite lists show. */
  private satellites_(): OrbitalSatellite[] {
    return trackedOrbitalSatellites(SimulationManager.getInstance());
  }

  /** Satellites that get their own style, label and track: authored, pinned, then hot (hydrated). */
  private styledSatellites_(): { norad: number; name: string }[] {
    const out = new Map<number, string>();

    for (const sat of this.satellites_()) {
      out.set(sat.noradId, sat.name);
    }
    for (const sat of this.registry_()?.hot() ?? []) {
      if (sat instanceof OrbitalSatellite && !out.has(sat.noradId)) {
        out.set(sat.noradId, sat.name);
      }
    }

    return [...out].map(([norad, name]) => ({ norad, name }));
  }

  private capacity_(): number {
    const registry = this.registry_();
    const count = registry ? registry.size : this.satellites_().length;
    const headroom = Math.max(CAPACITY_MIN_HEADROOM, Math.ceil(count * 0.02));

    return Math.min(CAPACITY_MAX, count + headroom);
  }

  private static hostId_(noradId: number): string {
    return `sat-${noradId}`;
  }

  private groupOf_(noradId: number): string | undefined {
    const groupId = this.registry_()?.ref(noradId)?.groupId;

    return groupId && groupId !== 'authored' ? groupId : undefined;
  }

  private toEmbedObject_(sat: OrbitalSatellite): EmbedObject {
    const { tle1, tle2 } = sat.trueElements;
    const group = this.groupOf_(sat.noradId);

    return { hostId: KeepTrackEmbedHost.hostId_(sat.noradId), name: sat.name, tle1, tle2, ...(group ? { group } : {}) };
  }

  /** Top-level constellation switches (one per TLE set), or [] for a scenario without constellations. */
  constellationLayers(): ConstellationLayer[] {
    const registry = this.registry_();

    if (!registry || registry.memberCount === 0) {
      return [];
    }
    const refs = registry.constellationRefs();
    const groupIds = registry.groupIdsByRef();
    const byId = new Map<string, ConstellationLayer>();

    refs.forEach((ref, i) => {
      const layer = byId.get(ref.tleSet) ?? { id: ref.tleSet, label: setLabel(ref.tleSet), visible: !this.hiddenSets_.has(ref.tleSet), groupIds: [] };

      layer.groupIds.push(...groupIds[i]);
      byId.set(ref.tleSet, layer);
    });

    return [...byId.values()];
  }

  /** Show or hide a constellation's dots (a layer toggle). Remembered across park and boot. */
  setConstellationVisible(setId: string, visible: boolean): void {
    if (visible) {
      this.hiddenSets_.delete(setId);
    } else {
      this.hiddenSets_.add(setId);
    }
    const layer = this.constellationLayers().find((candidate) => candidate.id === setId);

    if (this.embed_ && this.state_ === 'ready' && layer) {
      for (const groupId of layer.groupIds) {
        this.embed_.setGroupStyle(groupId, { visible });
      }
    }
  }

  /** Embed group definitions: one per TLE-set group, shaded from the set's base colour. */
  private groupDefs_(): { id: string; color: EmbedColor; visible: boolean }[] {
    const registry = this.registry_();

    if (!registry || registry.memberCount === 0) {
      return [];
    }
    const refs = registry.constellationRefs();
    const groupIds = registry.groupIdsByRef();
    const defs: { id: string; color: EmbedColor; visible: boolean }[] = [];

    refs.forEach((ref, i) => {
      const base = SET_COLORS[i % SET_COLORS.length];
      const ids = groupIds[i];

      ids.forEach((id, g) => {
        const shade = ids.length > 1 ? -0.25 + (0.5 * g) / (ids.length - 1) : 0;

        defs.push({ id, color: hexToEmbedColor(shadeHex(base, shade)), visible: !this.hiddenSets_.has(ref.tleSet) });
      });
    });

    return defs;
  }

  /** Push groups, then every registry member and authored satellite in one bulk upsert, and turn tracks on. */
  private syncScenario_(): void {
    const embed = this.embed_;

    if (!embed) {
      return;
    }
    const registry = this.registry_();
    const objects: EmbedObject[] = [];

    if (registry && registry.memberCount > 0) {
      embed.defineGroups(this.groupDefs_());
      const norads = registry.memberNoradIds();
      const { tle1, tle2 } = registry.memberTleLines();

      for (let i = 0; i < norads.length; i++) {
        objects.push({
          hostId: KeepTrackEmbedHost.hostId_(norads[i]),
          name: registry.memberName(i),
          tle1: tle1[i],
          tle2: tle2[i],
          group: registry.groupName(registry.memberGroupIndex(i)),
        });
      }
    }
    // Authored and pinned satellites last: a repeated hostId in one call keeps the last entry (its elements carry overrides).
    for (const sat of this.satellites_()) {
      objects.push(this.toEmbedObject_(sat));
    }
    embed.upsertObjects(objects);
    this.upsertedIds_ = [...new Set(objects.map((object) => object.hostId))];
    this.lastRevision_ = registry?.revision ?? -1;

    embed.upsertSensors(
      SimulationManager.getInstance().groundStations.map((station) => ({
        hostId: station.state.id,
        name: station.state.id,
        lat: station.state.location.latitude,
        lon: station.state.location.longitude,
        altKm: (station.state.location.elevation ?? 0) / 1000,
        minAz: 0,
        maxAz: 360,
        minEl: 0,
        maxEl: 90,
        minRngKm: 0,
        maxRngKm: 50_000,
        label: true,
        color: STATION_COLOR,
      }))
    );
    this.applyTracks_(null);
    EventBus.getInstance().on(Events.SATELLITE_ELEMENTS_CHANGED, this.boundElementsChanged_);
  }

  /** Re-upsert the one satellite whose elements changed. Tracks are redrawn only when it has one. */
  private onElementsChanged_(data: { noradId: number }): void {
    const embed = this.embed_;
    const sat = this.satellites_().find((candidate) => candidate.noradId === data.noradId) ?? this.registry_()?.peek(data.noradId);

    if (!embed || !(sat instanceof OrbitalSatellite)) {
      return;
    }
    embed.upsertObjects([this.toEmbedObject_(sat)]);
    const hostId = KeepTrackEmbedHost.hostId_(sat.noradId);

    if (this.trackKey_.split(',').includes(hostId)) {
      this.trackKey_ = '';
      this.applyTracks_(this.view_?.focusNoradId ?? null);
    }
  }

  /** Explicit track refs, at most MAX_TRACKED_OBJECTS: selected, then authored and pinned, then hot. */
  private applyTracks_(focus: number | null): void {
    const embed = this.embed_;

    if (!embed) {
      return;
    }
    const norads = new Set<number>();

    if (focus !== null) {
      norads.add(focus);
    }
    for (const { norad } of this.styledSatellites_()) {
      norads.add(norad);
    }
    const ids = [...norads].slice(0, MAX_TRACKED_OBJECTS).map((norad) => KeepTrackEmbedHost.hostId_(norad));
    const key = ids.join(',');

    if (key === this.trackKey_) {
      return;
    }
    this.trackKey_ = key;
    embed.setGroundTracks(ids.length > 0 ? ids.map((hostId) => ({ hostId })) : null, TRACK_OPTIONS);
  }

  /** Restyle the satellites whose style changed and rebuild the overlays for the current view. */
  private applyView_(): void {
    const embed = this.embed_;
    const view = this.view_;

    if (!embed || !view) {
      return;
    }
    embed.clearOverlays();
    embed.setLayers({ dayNight: view.showDayNight, graticule: true, orbits: false, labels: 'host', labelBudget: LABEL_BUDGET });

    const styled = this.styledSatellites_();

    if (view.focusNoradId !== null && !styled.some((entry) => entry.norad === view.focusNoradId)) {
      const name = this.registry_()?.ref(view.focusNoradId)?.name;

      if (name !== undefined) {
        styled.push({ norad: view.focusNoradId, name });
      }
    }

    const entries: EmbedObjectStyleEntry[] = [];
    const current = new Set<string>();
    let focusColor: EmbedColor | null = null;

    styled.forEach(({ norad, name }, index) => {
      const hostId = KeepTrackEmbedHost.hostId_(norad);
      const hex = TRACK_COLORS[index % TRACK_COLORS.length];
      const highlight = view.focusNoradId === null || norad === view.focusNoradId;
      const key = `${hex}|${highlight}|${name}`;

      current.add(hostId);
      if (norad === view.focusNoradId) {
        focusColor = hexToEmbedColor(hex);
      }
      if (this.appliedStyles_.get(hostId) !== key) {
        this.appliedStyles_.set(hostId, key);
        entries.push({ ref: { hostId }, style: { color: hexToEmbedColor(hex), highlight, label: name } });
      }
    });
    // Satellites that were styled before (unpinned, cooled) go back to their group dot.
    for (const hostId of [...this.appliedStyles_.keys()]) {
      if (!current.has(hostId)) {
        this.appliedStyles_.delete(hostId);
        entries.push({ ref: { hostId }, style: null });
      }
    }
    if (entries.length > 0) {
      embed.setObjectStyles(entries);
    }
    this.applyTracks_(view.focusNoradId);

    if (view.focusNoradId === null) {
      return;
    }
    const ref = { hostId: KeepTrackEmbedHost.hostId_(view.focusNoradId) };

    // Footprint for the selected satellite only: every other satellite is just a dot.
    if (view.showCoverage && focusColor) {
      embed.addOverlay({ type: 'footprint', object: ref, minElDeg: FOOTPRINT_MIN_ELEVATION_DEG, color: focusColor, fill: true });
    }
    if (view.showAccess) {
      for (const station of SimulationManager.getInstance().groundStations) {
        embed.addOverlay({
          type: 'circle',
          center: { sensor: station.state.id },
          radius: { accessOf: ref, minElDeg: FOOTPRINT_MIN_ELEVATION_DEG },
          color: ACCESS_COLOR,
          dashed: true,
          fill: true,
        });
      }
    }
  }

  // ----------------------------------------------------------------- clock

  private anyPaused_(): boolean {
    return (['scenario', 'hidden', 'loading', 'menu'] as const).some((reason) => SimClock.isPaused(reason));
  }

  private startClockSync_(): void {
    const embed = this.embed_;

    if (!embed) {
      return;
    }
    embed.setRate(SimClock.speed);
    embed.setTime(SimClock.nowMs());
    if (this.anyPaused_()) {
      embed.pause();
    } else {
      embed.play();
    }
    this.unsubscribeClock_ = SimClock.onChange((change) => this.onClockChange_(change));
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
  }

  private onClockChange_(change: 'jump' | 'pause' | 'speed'): void {
    const embed = this.embed_;

    if (!embed) {
      return;
    }
    switch (change) {
      case 'jump':
        embed.setTime(SimClock.nowMs());
        break;
      case 'speed':
        embed.setRate(SimClock.speed);
        break;
      case 'pause':
        if (this.anyPaused_()) {
          embed.pause();
          embed.setTime(SimClock.nowMs());
        } else {
          embed.setTime(SimClock.nowMs());
          embed.play();
        }
        break;
      default:
        break;
    }
  }

  /** Backstop for anything the change hooks miss: correct when the clocks differ by more than 1 s. */
  private driftCheck_(): void {
    const embed = this.embed_;
    const now = Date.now();

    if (!embed || !this.wantVisible_ || now - this.lastDriftCheckMs_ < DRIFT_CHECK_INTERVAL_MS) {
      return;
    }
    this.lastDriftCheckMs_ = now;
    const revision = this.registry_()?.revision;

    if (revision !== undefined && revision !== this.lastRevision_) {
      // A member was hydrated or released: restyle the hot set.
      this.lastRevision_ = revision;
      this.applyView_();
    }
    const sr = SimClock.nowMs();

    if (Math.abs(embed.getTime().timeMs - sr) > DRIFT_TOLERANCE_MS) {
      embed.setTime(sr);
    }
  }
}
