import { type OrbitalObserver, OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Satellite, SatelliteState } from '@app/equipment/satellite/satellite';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { defaultTemplateForGroup, getRfTemplate } from './satellite-rf-templates';

/** Per-NORAD change a scenario applies to one constellation member (applied at hydration). */
export interface MemberOverride {
  norad: number;
  name?: string;
  tle1?: string;
  tle2?: string;
  rfTemplate?: string;
  /** Initial health 0-1 (an initial fault) */
  health?: number;
  operated?: boolean;
  /** Extra satellite state merged over the template's */
  state?: Partial<SatelliteState>;
}

/** Scenario reference to a TLE set (plan 3.2). */
export interface ConstellationRef {
  tleSet: string;
  include?: { groups?: string[]; norad?: number[] };
  exclude?: { norad?: number[] };
  rfTemplate?: string;
  overrides?: MemberOverride[];
  /** Members accept commands (default false, P3-D2) */
  operated?: boolean;
}

/** Read-only view for lists and UI. Reading a ref never hydrates. */
export interface SatelliteRef {
  noradId: number;
  name: string;
  groupId: string;
  health: number;
  isHydrated: boolean;
  operated: boolean;
}

export interface SatelliteRegistryOptions {
  /** Observer given to hydrated members (az/el/range are computed against it) */
  observer?: OrbitalObserver;
  /** Clock for cold-member bookkeeping, sim ms */
  now?: () => number;
  /** Called after a member is hydrated (SimulationManager wires event bus and signals) */
  onHydrated?: (sat: Satellite) => void;
  /** Called after a member is released */
  onReleased?: (sat: Satellite) => void;
}

const FLAG_HYDRATED = 1;
const FLAG_PINNED = 2;
const FLAG_REFERENCED = 4;
const FLAG_DIRTY = 8;

/** A clean hydrated member cold this long (sim ms) is released by sweepCold. */
/** Largest pinned set (P3-D8) */
export const PINNED_CAP = 24;

export const COLD_RELEASE_MS = 10 * 60 * 1000;

const DEFAULT_OBSERVER: OrbitalObserver = { name: 'Ground Station', lat: 0 as Degrees, lon: 0 as Degrees, alt: 0 as Kilometers };

/** TLE sets resolved before a scenario starts (async loader), read synchronously by the registry. */
const loadedSets_ = new Map<string, TleSet>();

export function provideTleSet(set: TleSet): void {
  loadedSets_.set(set.id, set);
}

export function getProvidedTleSet(id: string): TleSet | undefined {
  return loadedSets_.get(id);
}

/** Load every set the refs name through `loader` so the (sync) registry can read them. */
export async function ensureTleSets(refs: ConstellationRef[] | undefined, loader: (id: string) => Promise<TleSet>): Promise<void> {
  for (const ref of refs ?? []) {
    if (!loadedSets_.has(ref.tleSet)) {
      provideTleSet(await loader(ref.tleSet));
    }
  }
}

function grow<T extends Int32Array | Uint16Array | Uint8Array | Float64Array>(arr: T, length: number): T {
  const next = new (arr.constructor as new (n: number) => T)(length);
  next.set(arr);
  return next;
}

/**
 * Owns every satellite in a scenario: authored Satellite objects (always
 * hydrated) plus constellation members stored structure-of-arrays and
 * hydrated into full OrbitalSatellites only when something needs them.
 */
export class SatelliteRegistry {
  /** Authored plus currently hydrated satellites. Live array: SimulationManager.satellites reads it. */
  readonly hydrated: Satellite[] = [];
  /** Bumps whenever a member is hydrated or released, so callers can cache orderings of `hydrated`. */
  revision = 0;
  /** Authored satellites, always the first `authoredCount` entries of `hydrated`. */
  readonly authoredCount: number;

  private readonly authored_ = new Map<number, Satellite>();
  private readonly options_: SatelliteRegistryOptions;

  // Member storage (SoA); index = member index
  private norad_ = new Int32Array(0);
  private groupIndex_ = new Uint16Array(0);
  private refIndex_ = new Uint16Array(0);
  private flags_ = new Uint8Array(0);
  private lastTouchMs_ = new Float64Array(0);
  private readonly names_: string[] = [];
  private readonly tle1_: string[] = [];
  private readonly tle2_: string[] = [];
  private memberCount_ = 0;
  private pinnedCount_ = 0;

  private readonly groups_: string[] = [];
  private readonly groupLookup_ = new Map<string, number>();
  private readonly refs_: ConstellationRef[] = [];
  private readonly index_ = new Map<number, number>();
  private readonly overrides_ = new Map<number, MemberOverride>();
  private readonly hydratedMembers_ = new Map<number, Satellite>();

  constructor(authored: Satellite[] = [], options: SatelliteRegistryOptions = {}) {
    this.options_ = options;
    this.authoredCount = authored.length;
    for (const sat of authored) {
      this.authored_.set(sat.noradId, sat);
      this.hydrated.push(sat);
    }
  }

  /** Total satellites known: authored plus members. */
  get size(): number {
    return this.authored_.size + this.memberCount_;
  }

  get memberCount(): number {
    return this.memberCount_;
  }

  get hydratedMemberCount(): number {
    return this.hydratedMembers_.size;
  }

  setObserver(observer: OrbitalObserver): void {
    this.options_.observer = observer;
  }

  /**
   * Add a TLE set's members per the reference. An authored satellite with the
   * same NORAD id replaces the member. A NORAD id already added by an earlier
   * reference is skipped (first reference wins). Returns the members added.
   */
  addConstellation(set: TleSet, ref: ConstellationRef): number {
    const groups = ref.include?.groups ? new Set(ref.include.groups) : null;
    const noradInclude = ref.include?.norad ? new Set(ref.include.norad) : null;
    const exclude = new Set(ref.exclude?.norad ?? []);
    const hasInclude = groups !== null || noradInclude !== null;
    const accepted = set.members.filter((m) => {
      if (exclude.has(m.noradId) || this.authored_.has(m.noradId) || this.index_.has(m.noradId)) {
        return false;
      }
      return !hasInclude || (groups?.has(m.group) ?? false) || (noradInclude?.has(m.noradId) ?? false);
    });

    const refIdx = this.refs_.length;
    this.refs_.push(ref);
    const start = this.memberCount_;
    const total = start + accepted.length;
    this.norad_ = grow(this.norad_, total);
    this.groupIndex_ = grow(this.groupIndex_, total);
    this.refIndex_ = grow(this.refIndex_, total);
    this.flags_ = grow(this.flags_, total);
    this.lastTouchMs_ = grow(this.lastTouchMs_, total);

    accepted.forEach((m, i) => {
      const idx = start + i;
      this.norad_[idx] = m.noradId;
      this.groupIndex_[idx] = this.groupId_(m.group);
      this.refIndex_[idx] = refIdx;
      this.names_[idx] = m.name;
      this.tle1_[idx] = m.tle1;
      this.tle2_[idx] = m.tle2;
      this.index_.set(m.noradId, idx);
    });
    this.memberCount_ = total;

    for (const o of ref.overrides ?? []) {
      const idx = this.index_.get(o.norad);
      // An override of a NORAD that this reference did not add is ignored
      if (idx === undefined || this.refIndex_[idx] !== refIdx) {
        continue;
      }
      this.overrides_.set(o.norad, o);
      this.flags_[idx] |= FLAG_REFERENCED;
    }
    return accepted.length;
  }

  /** Member index for a NORAD id (non-authored members only), or -1. Stable once added. */
  memberIndexOf(norad: number): number {
    return this.index_.get(norad) ?? -1;
  }

  /** NORAD id of member `index`. */
  memberNorad(index: number): number {
    return this.norad_[index];
  }

  /** Copy of the member NORAD ids in member-index order (for the propagation service). */
  memberNoradIds(): Int32Array {
    return this.norad_.slice(0, this.memberCount_);
  }

  /** Name of member `index` as stored (hydration overrides not applied). */
  memberName(index: number): string {
    return this.names_[index];
  }

  /** Constellation reference index of member `index` (see `constellationRefs`). */
  memberRefIndex(index: number): number {
    return this.refIndex_[index];
  }

  /** Constellation references in the order they were added. */
  constellationRefs(): readonly ConstellationRef[] {
    return this.refs_;
  }

  /** Group ids per constellation reference (index = reference index), in first-seen order. */
  groupIdsByRef(): string[][] {
    const out: Set<string>[] = this.refs_.map(() => new Set<string>());

    for (let i = 0; i < this.memberCount_; i++) {
      out[this.refIndex_[i]].add(this.groups_[this.groupIndex_[i]]);
    }

    return out.map((set) => [...set]);
  }

  /** Group index of member `index` (see `groupName`). */
  memberGroupIndex(index: number): number {
    return this.groupIndex_[index];
  }

  groupName(groupIndex: number): string {
    return this.groups_[groupIndex];
  }

  /** TLE lines of every member as stored, in member-index order (hydration overrides not applied). */
  memberTleLines(): { tle1: string[]; tle2: string[] } {
    return { tle1: this.tle1_.slice(0, this.memberCount_), tle2: this.tle2_.slice(0, this.memberCount_) };
  }

  has(norad: number): boolean {
    return this.authored_.has(norad) || this.index_.has(norad);
  }

  /** The full satellite for a NORAD id, hydrating a member on first ask. */
  get(norad: number): Satellite | undefined {
    const authored = this.authored_.get(norad);
    if (authored) {
      return authored;
    }
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return undefined;
    }
    this.lastTouchMs_[idx] = this.now_();
    return this.hydratedMembers_.get(norad) ?? this.hydrateAt_(idx);
  }

  /** RF template id for a member: override, then constellation ref, then the group default. */
  rfTemplateIdOf(norad: number): string | undefined {
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return undefined;
    }

    return this.overrides_.get(norad)?.rfTemplate ?? this.refs_[this.refIndex_[idx]].rfTemplate ?? defaultTemplateForGroup(this.groups_[this.groupIndex_[idx]]);
  }

  /** The satellite only if it is already a full object (never hydrates). */
  peek(norad: number): Satellite | undefined {
    return this.authored_.get(norad) ?? this.hydratedMembers_.get(norad);
  }

  hydrate(norad: number): Satellite | undefined {
    return this.get(norad);
  }

  isHydrated(norad: number): boolean {
    return this.authored_.has(norad) || this.hydratedMembers_.has(norad);
  }

  /** Read-only view; does not hydrate. */
  ref(norad: number): SatelliteRef | undefined {
    const authored = this.authored_.get(norad);
    if (authored) {
      return { noradId: norad, name: authored.name, groupId: 'authored', health: authored.health, isHydrated: true, operated: true };
    }
    const idx = this.index_.get(norad);
    return idx === undefined ? undefined : this.refAt_(idx);
  }

  /** Every satellite as a ref: authored first, then members. Allocates; do not call per tick. */
  refs(): SatelliteRef[] {
    const out: SatelliteRef[] = [];
    for (const n of this.authored_.keys()) {
      out.push(this.ref(n)!);
    }
    for (let i = 0; i < this.memberCount_; i++) {
      out.push(this.refAt_(i));
    }
    return out;
  }

  inGroup(groupId: string): SatelliteRef[] {
    const g = this.groupLookup_.get(groupId);
    if (g === undefined) {
      return [];
    }
    const out: SatelliteRef[] = [];
    for (let i = 0; i < this.memberCount_; i++) {
      if (this.groupIndex_[i] === g) {
        out.push(this.refAt_(i));
      }
    }
    return out;
  }

  /** Members that must stay hydrated: pinned or referenced (overrides, explicit pins). */
  pinned(): SatelliteRef[] {
    const out: SatelliteRef[] = [];
    for (let i = 0; i < this.memberCount_; i++) {
      if (this.flags_[i] & (FLAG_PINNED | FLAG_REFERENCED)) {
        out.push(this.refAt_(i));
      }
    }
    return out;
  }

  /** Currently hydrated members (not authored). WP4 tiers decide which members should be here. */
  hot(): Satellite[] {
    return [...this.hydratedMembers_.values()];
  }

  /** Members currently pinned (selection, open dialog). Capped at PINNED_CAP. */
  get pinnedCount(): number {
    return this.pinnedCount_;
  }

  /**
   * Pin keeps a member hydrated (selection, open dialog). Returns false when
   * the pinned set is full (PINNED_CAP, P3-D8) or the id is not a member.
   */
  pin(norad: number, pinned = true): boolean {
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return false;
    }
    const wasPinned = (this.flags_[idx] & FLAG_PINNED) !== 0;
    if (pinned) {
      if (!wasPinned && this.pinnedCount_ >= PINNED_CAP) {
        return false;
      }
      this.get(norad);
      this.flags_[idx] |= FLAG_PINNED;
      if (!wasPinned) this.pinnedCount_++;
    } else {
      this.flags_[idx] &= ~FLAG_PINNED;
      if (wasPinned) this.pinnedCount_--;
    }
    return true;
  }

  /** Authored satellites plus pinned members that are hydrated: what per-satellite UI lists (timeline, embed host) iterate at scale. */
  tracked(): Satellite[] {
    const out = this.hydrated.slice(0, this.authoredCount);
    for (const [norad, sat] of this.hydratedMembers_) {
      const idx = this.index_.get(norad)!;
      if (this.flags_[idx] & FLAG_PINNED) out.push(sat);
    }
    return out;
  }

  /** Mark a member as carrying state (commanded, faulted); keeps it hydrated until cleared. */
  markDirty(norad: number, dirty = true): void {
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return;
    }
    this.flags_[idx] = dirty ? this.flags_[idx] | FLAG_DIRTY : this.flags_[idx] & ~FLAG_DIRTY;
  }

  /** Record that a member is hot at `nowMs` (resets its cold timer). */
  touch(norad: number, nowMs: number = this.now_()): void {
    const idx = this.index_.get(norad);
    if (idx !== undefined) {
      this.lastTouchMs_[idx] = nowMs;
    }
  }

  /** Dirty: flagged, pinned, referenced, degraded health, or carrying uplinks. */
  isDirty(norad: number): boolean {
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return false;
    }
    if (this.flags_[idx] & (FLAG_DIRTY | FLAG_PINNED | FLAG_REFERENCED)) {
      return true;
    }
    const sat = this.hydratedMembers_.get(norad);
    return sat !== undefined && (sat.health < 1 || sat.rxSignal.length > 0);
  }

  /** Release a hydrated clean member. Returns false if authored, not hydrated, or dirty. */
  release(norad: number): boolean {
    const sat = this.hydratedMembers_.get(norad);
    if (!sat || this.isDirty(norad)) {
      return false;
    }
    const idx = this.index_.get(norad)!;
    this.hydratedMembers_.delete(norad);
    this.flags_[idx] &= ~FLAG_HYDRATED;
    const at = this.hydrated.indexOf(sat);
    if (at >= 0) {
      this.hydrated.splice(at, 1);
    }
    this.revision++;
    this.options_.onReleased?.(sat);
    return true;
  }

  /** Release clean members idle for `ttlMs` of sim time. Returns the number released. */
  sweepCold(nowMs: number = this.now_(), ttlMs: number = COLD_RELEASE_MS): number {
    let released = 0;
    for (const norad of [...this.hydratedMembers_.keys()]) {
      const idx = this.index_.get(norad)!;
      if (nowMs - this.lastTouchMs_[idx] >= ttlMs && this.release(norad)) {
        released++;
      }
    }
    return released;
  }

  /** Authored satellites accept commands; members only when their set or override says `operated` (P3-D2). */
  isOperated(norad: number): boolean {
    if (this.authored_.has(norad)) {
      return true;
    }
    const idx = this.index_.get(norad);
    if (idx === undefined) {
      return false;
    }
    return this.overrides_.get(norad)?.operated ?? this.refs_[this.refIndex_[idx]].operated ?? false;
  }

  private refAt_(idx: number): SatelliteRef {
    const norad = this.norad_[idx];
    const sat = this.hydratedMembers_.get(norad);
    const o = this.overrides_.get(norad);
    return {
      noradId: norad,
      name: sat?.name ?? o?.name ?? this.names_[idx],
      groupId: this.groups_[this.groupIndex_[idx]],
      health: sat?.health ?? o?.health ?? 1,
      isHydrated: sat !== undefined,
      operated: this.isOperated(norad),
    };
  }

  private hydrateAt_(idx: number): Satellite {
    const norad = this.norad_[idx];
    const ref = this.refs_[this.refIndex_[idx]];
    const o = this.overrides_.get(norad);
    const groupId = this.groups_[this.groupIndex_[idx]];
    const template = getRfTemplate(o?.rfTemplate ?? ref.rfTemplate ?? defaultTemplateForGroup(groupId));
    const built = template?.build({ noradId: norad }) ?? { rxSignal: [], beaconSignal: [], state: {} };
    const sat = new OrbitalSatellite(
      o?.name ?? this.names_[idx],
      norad,
      built.rxSignal,
      built.beaconSignal,
      {
        tle1: (o?.tle1 ?? this.tle1_[idx]) as TleLine1,
        tle2: (o?.tle2 ?? this.tle2_[idx]) as TleLine2,
        observer: this.options_.observer ?? DEFAULT_OBSERVER,
      },
      { ...built.state, ...o?.state }
    );
    if (o?.health !== undefined) {
      sat.health = o.health;
    }
    this.hydratedMembers_.set(norad, sat);
    this.flags_[idx] |= FLAG_HYDRATED;
    this.hydrated.push(sat);
    this.revision++;
    this.options_.onHydrated?.(sat);
    return sat;
  }

  private groupId_(id: string): number {
    let g = this.groupLookup_.get(id);
    if (g === undefined) {
      g = this.groups_.length;
      this.groups_.push(id);
      this.groupLookup_.set(id, g);
    }
    return g;
  }

  private now_(): number {
    return this.options_.now?.() ?? 0;
  }
}
