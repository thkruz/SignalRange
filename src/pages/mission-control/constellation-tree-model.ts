import type { SatelliteRegistry } from '@app/simulation/satellite-registry';

/**
 * Pure model behind the constellation part of the asset tree: the set / group /
 * plane hierarchy over the registry's members, the visible-row list for an
 * expansion state, the name and NORAD search, the hot / in-view / pinned
 * filters and the virtual window arithmetic. No DOM here.
 */

export type TreeRowKind = 'set' | 'group' | 'plane' | 'member';

export interface TreeRow {
  kind: TreeRowKind;
  /** Stable key: expansion state is keyed on it. */
  key: string;
  depth: number;
  label: string;
  /** Members below a set, group or plane. */
  count: number;
  expanded: boolean;
  /** Member index (members only). */
  index: number;
  /** NORAD id (members only). */
  norad: number;
}

export type TreeFilter = 'hot' | 'inView' | 'pinned';

export interface VirtualWindow {
  start: number;
  end: number;
}

/** First and one-past-last row to render for a scroll position, with `overscan` rows either side. */
export function virtualWindow(scrollTop: number, viewportHeight: number, rowHeight: number, total: number, overscan: number): VirtualWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0 };
  }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / rowHeight);

  return { start: Math.max(0, first - overscan), end: Math.min(total, last + overscan) };
}

interface PlaneNode {
  plane: number;
  members: number[];
}

interface GroupNode {
  key: string;
  label: string;
  count: number;
  /** Planes in ascending order (-1, "no plane", last); a single -1 plane means no plane level. */
  planes: PlaneNode[];
  hasPlanes: boolean;
}

interface SetNode {
  key: string;
  label: string;
  count: number;
  groups: GroupNode[];
}

export class ConstellationTreeModel {
  private readonly sets_: SetNode[] = [];
  private readonly registry_: SatelliteRegistry;
  private lowerNames_: string[] | null = null;
  private noradStrings_: string[] | null = null;

  constructor(registry: SatelliteRegistry, setLabel: (tleSetId: string) => string = (id) => id) {
    this.registry_ = registry;
    const refs = registry.constellationRefs();
    const byRef: Map<number, Map<number, PlaneNode>>[] = refs.map(() => new Map());

    for (let i = 0; i < registry.memberCount; i++) {
      const groups = byRef[registry.memberRefIndex(i)];
      const g = registry.memberGroupIndex(i);
      let planes = groups.get(g);

      if (!planes) {
        planes = new Map();
        groups.set(g, planes);
      }
      const plane = registry.memberPlane(i);
      let node = planes.get(plane);

      if (!node) {
        node = { plane, members: [] };
        planes.set(plane, node);
      }
      node.members.push(i);
    }

    refs.forEach((ref, r) => {
      const groups: GroupNode[] = [];
      let setCount = 0;

      for (const [g, planeMap] of byRef[r]) {
        const planes = [...planeMap.values()].sort((a, b) => (a.plane < 0 ? 1 : 0) - (b.plane < 0 ? 1 : 0) || a.plane - b.plane);
        const count = planes.reduce((n, p) => n + p.members.length, 0);

        setCount += count;
        groups.push({
          key: `g:${r}:${registry.groupName(g)}`,
          label: registry.groupLabel(g),
          count,
          planes,
          hasPlanes: planes.some((p) => p.plane >= 0),
        });
      }
      this.sets_.push({ key: `s:${r}`, label: setLabel(ref.tleSet), count: setCount, groups });
    });
  }

  get memberCount(): number {
    return this.registry_.memberCount;
  }

  get setCount(): number {
    return this.sets_.length;
  }

  /** Keys of every set, group and plane node (for "expand all" and tests). */
  allNodeKeys(setKey?: string): string[] {
    const out: string[] = [];

    for (const set of this.sets_) {
      if (setKey !== undefined && set.key !== setKey) {
        continue;
      }
      out.push(set.key);
      for (const group of set.groups) {
        out.push(group.key);
        if (group.hasPlanes) {
          group.planes.forEach((p) => out.push(`${group.key}:p${p.plane}`));
        }
      }
    }

    return out;
  }

  /** Keys of one set and everything under the first group whose label contains `text`; empty `text` picks the largest group (harness). */
  keysUnderGroup(text: string): string[] {
    const out: string[] = [];
    const lower = text.toLowerCase();

    for (const set of this.sets_) {
      const group =
        lower === ''
          ? set.groups.reduce<GroupNode | undefined>((a, g) => (a && a.count >= g.count ? a : g), undefined)
          : set.groups.find((g) => g.label.toLowerCase().includes(lower));

      if (group) {
        out.push(set.key, group.key);
        group.planes.forEach((p) => out.push(`${group.key}:p${p.plane}`));
        break;
      }
    }

    return out;
  }

  /** Hierarchical rows for an expansion state. Collapsed nodes hide everything beneath. */
  visibleRows(expanded: ReadonlySet<string>): TreeRow[] {
    const rows: TreeRow[] = [];
    const registry = this.registry_;

    for (const set of this.sets_) {
      const setOpen = expanded.has(set.key);

      rows.push(this.node_('set', set.key, 0, set.label, set.count, setOpen));
      if (!setOpen) {
        continue;
      }
      for (const group of set.groups) {
        const groupOpen = expanded.has(group.key);

        rows.push(this.node_('group', group.key, 1, group.label, group.count, groupOpen));
        if (!groupOpen) {
          continue;
        }
        if (!group.hasPlanes) {
          for (const plane of group.planes) {
            for (const idx of plane.members) {
              rows.push(this.member_(idx, 2, registry));
            }
          }
          continue;
        }
        for (const plane of group.planes) {
          const key = `${group.key}:p${plane.plane}`;
          const planeOpen = expanded.has(key);

          rows.push(this.node_('plane', key, 2, plane.plane >= 0 ? `Plane ${plane.plane}` : 'No plane', plane.members.length, planeOpen));
          if (planeOpen) {
            for (const idx of plane.members) {
              rows.push(this.member_(idx, 3, registry));
            }
          }
        }
      }
    }

    return rows;
  }

  /**
   * Search or filter results as set, group and member rows, always open (planes
   * are skipped: a result list is already narrow). Member order inside a group
   * follows the input order.
   */
  groupedRows(indices: ArrayLike<number>): TreeRow[] {
    const registry = this.registry_;
    const buckets = new Map<string, { ref: number; group: number; members: number[] }>();

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const ref = registry.memberRefIndex(idx);
      const group = registry.memberGroupIndex(idx);
      const key = `${ref}:${group}`;
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { ref, group, members: [] };
        buckets.set(key, bucket);
      }
      bucket.members.push(idx);
    }
    const ordered = [...buckets.values()].sort((a, b) => a.ref - b.ref || a.group - b.group);
    const rows: TreeRow[] = [];
    const setTotals = new Map<number, number>();

    for (const b of ordered) {
      setTotals.set(b.ref, (setTotals.get(b.ref) ?? 0) + b.members.length);
    }
    let lastRef = -1;

    for (const b of ordered) {
      if (b.ref !== lastRef) {
        lastRef = b.ref;
        rows.push(this.node_('set', `rs:${b.ref}`, 0, this.sets_[b.ref]?.label ?? '', setTotals.get(b.ref) ?? 0, true));
      }
      rows.push(this.node_('group', `rg:${b.ref}:${b.group}`, 1, registry.groupLabel(b.group), b.members.length, true));
      for (const idx of b.members) {
        rows.push(this.member_(idx, 2, registry));
      }
    }

    return rows;
  }

  /** Flat member rows for search results or a filter. */
  flatRows(indices: ArrayLike<number>): TreeRow[] {
    const rows: TreeRow[] = new Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      rows[i] = this.member_(indices[i], 0, this.registry_);
    }

    return rows;
  }

  /**
   * Member indices matching `query`: a digits-only query matches NORAD id
   * prefixes and names; anything else matches names (case-insensitive substring).
   * An empty query matches every member.
   */
  search(query: string): Int32Array {
    const n = this.registry_.memberCount;
    const q = query.trim().toLowerCase();
    const out = new Int32Array(n);
    let count = 0;

    if (q === '') {
      for (let i = 0; i < n; i++) {
        out[i] = i;
      }

      return out;
    }
    this.buildIndex_();
    const names = this.lowerNames_!;
    const ids = this.noradStrings_!;
    const numeric = isDigits(q);

    for (let i = 0; i < n; i++) {
      if (names[i].includes(q) || (numeric && ids[i].startsWith(q))) {
        out[count++] = i;
      }
    }

    return out.subarray(0, count);
  }

  /** Apply the toggled filters to member indices. `inView` is the set of NORAD ids currently above a station's horizon margin. */
  applyFilters(indices: ArrayLike<number>, filters: ReadonlySet<TreeFilter>, inView: ReadonlySet<number>): Int32Array {
    if (filters.size === 0) {
      return Int32Array.from(indices as ArrayLike<number>);
    }
    const registry = this.registry_;
    const out = new Int32Array(indices.length);
    let count = 0;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const norad = registry.memberNorad(idx);

      if (filters.has('hot') && !registry.isHydrated(norad)) {
        continue;
      }
      if (filters.has('pinned') && !registry.isPinned(norad)) {
        continue;
      }
      if (filters.has('inView') && !inView.has(norad)) {
        continue;
      }
      out[count++] = idx;
    }

    return out.subarray(0, count);
  }

  /** Rows (set, group, plane and member) that lead to member `index`, as expansion keys, so the tree can reveal it. */
  keysToReveal(index: number): string[] {
    const registry = this.registry_;
    const r = registry.memberRefIndex(index);
    const groupKey = `g:${r}:${registry.groupName(registry.memberGroupIndex(index))}`;
    const plane = registry.memberPlane(index);

    return [`s:${r}`, groupKey, `${groupKey}:p${plane}`];
  }

  private node_(kind: TreeRowKind, key: string, depth: number, label: string, count: number, expanded: boolean): TreeRow {
    return { kind, key, depth, label, count, expanded, index: -1, norad: 0 };
  }

  private member_(index: number, depth: number, registry: SatelliteRegistry): TreeRow {
    const norad = registry.memberNorad(index);

    return { kind: 'member', key: `m:${norad}`, depth, label: registry.memberName(index), count: 0, expanded: false, index, norad };
  }

  private buildIndex_(): void {
    if (this.lowerNames_) {
      return;
    }
    const n = this.registry_.memberCount;

    this.lowerNames_ = new Array<string>(n);
    this.noradStrings_ = new Array<string>(n);
    for (let i = 0; i < n; i++) {
      this.lowerNames_[i] = this.registry_.memberName(i).toLowerCase();
      this.noradStrings_[i] = String(this.registry_.memberNorad(i));
    }
  }
}

function isDigits(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);

    if (c < 48 || c > 57) {
      return false;
    }
  }

  return text.length > 0;
}
