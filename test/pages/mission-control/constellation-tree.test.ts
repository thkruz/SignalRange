import { ConstellationTreeModel, virtualWindow } from '@app/pages/mission-control/constellation-tree-model';
import { ConstellationTreeView, OVERSCAN_ROWS, ROW_HEIGHT_PX } from '@app/pages/mission-control/constellation-tree-view';
import { SelectionService } from '@app/services/selection-service';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers } from 'ootk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateSyntheticTles } from '../../../scripts/tle-sets/synth';

const holder: { registry?: SatelliteRegistry } = {};

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => holder },
}));

const observer = { name: 'T', lat: 30 as Degrees, lon: -100 as Degrees, alt: 0 as Kilometers };
const N = 12_376;

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 7, epoch: '2026-11-09' });
  const shells = [...new Set(tles.map((t) => t.shell))];

  return {
    format: 'sr-tle-set/1',
    id: 'big-set',
    epoch: '2026-11-09',
    source: 'synthetic',
    title: 'Big test set',
    groups: shells.map((id) => ({ id, label: `Shell ${id}`, count: tles.filter((t) => t.shell === id).length })),
    members: tles.map((t, i) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell, plane: i % 5 === 0 ? undefined : i % 40 })),
  };
}

describe('virtualWindow', () => {
  it('covers the viewport plus overscan and clamps to the list', () => {
    expect(virtualWindow(0, 320, 32, 1000, 8)).toEqual({ start: 0, end: 18 });
    expect(virtualWindow(3200, 320, 32, 1000, 8)).toEqual({ start: 92, end: 118 });
    expect(virtualWindow(31_900, 320, 32, 1000, 8)).toEqual({ start: 988, end: 1000 });
    expect(virtualWindow(0, 320, 32, 0, 8)).toEqual({ start: 0, end: 0 });
  });
});

describe('ConstellationTreeModel and view at 12k', () => {
  let registry: SatelliteRegistry;
  let set: TleSet;

  beforeAll(() => {
    set = makeSet(N);
    registry = new SatelliteRegistry([], { observer });
    registry.addConstellation(set, { tleSet: set.id });
    holder.registry = registry;
  });

  afterEach(() => {
    SelectionService.destroyInstance();
  });

  it('groups by set then group, collapsed by default, with planes under an expanded group', () => {
    const model = new ConstellationTreeModel(registry, () => 'Big set');
    const collapsed = model.visibleRows(new Set());

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ kind: 'set', label: 'Big set', count: N, expanded: false });

    const setOpen = model.visibleRows(new Set(['s:0']));

    expect(setOpen.filter((r) => r.kind === 'group')).toHaveLength(set.groups.length);
    expect(setOpen.some((r) => r.kind === 'member')).toBe(false);

    const group = setOpen.find((r) => r.kind === 'group')!;
    const groupOpen = model.visibleRows(new Set(['s:0', group.key]));

    expect(groupOpen.some((r) => r.kind === 'plane')).toBe(true);
    expect(groupOpen.some((r) => r.kind === 'member')).toBe(false);
    const all = model.visibleRows(new Set(model.allNodeKeys()));

    expect(all.filter((r) => r.kind === 'member')).toHaveLength(N);
  });

  it('searches by name substring and NORAD prefix in 50 ms or less', () => {
    const model = new ConstellationTreeModel(registry);
    const sample = registry.memberName(777);

    model.search('warm-up');
    const t0 = performance.now();
    const byName = model.search(sample.slice(2, 9).toUpperCase());
    const byId = model.search(String(registry.memberNorad(4000)).slice(0, 4));
    const empty = model.search('zzzzqq');
    const elapsed = performance.now() - t0;

    expect(Array.from(byName)).toContain(777);
    expect(Array.from(byId)).toContain(4000);
    expect(empty).toHaveLength(0);
    expect(model.search('')).toHaveLength(N);
    expect(elapsed).toBeLessThanOrEqual(50);
  });

  it('applies hot, pinned and in-view filters', () => {
    const model = new ConstellationTreeModel(registry);
    const service = SelectionService.getInstance();
    const everyone = model.search('');
    const a = registry.memberNorad(10);
    const b = registry.memberNorad(11);

    service.pin(a);
    registry.get(b);
    expect(Array.from(model.applyFilters(everyone, new Set(['pinned']), new Set()))).toEqual([10]);
    expect(Array.from(model.applyFilters(everyone, new Set(['hot']), new Set())).sort((x, y) => x - y)).toEqual([10, 11]);
    expect(Array.from(model.applyFilters(everyone, new Set(['inView']), new Set([b])))).toEqual([11]);
    registry.pin(a, false);
    registry.release(a);
    registry.release(b);
  });

  it('renders only the visible window with a spacer for the rest', () => {
    const view = new ConstellationTreeView(registry, { isLocked: () => false, onLockedClick: vi.fn() });

    document.body.appendChild(view.element);
    view.expand(view.model.allNodeKeys());
    expect(view.totalRowCount).toBeGreaterThan(N);
    expect(view.renderedRowCount).toBeLessThan(40);
    expect(view.renderedRowCount).toBeGreaterThan(0);
    expect(view.element.querySelector<HTMLElement>('.ct-spacer')!.style.height).toBe(`${view.totalRowCount * ROW_HEIGHT_PX}px`);
    expect(OVERSCAN_ROWS).toBeGreaterThan(0);
    view.dispose();
  });

  it('search swaps in flat results, and a row click selects while the pin button pins', () => {
    const view = new ConstellationTreeView(registry, { isLocked: () => false, onLockedClick: vi.fn() });
    const service = SelectionService.getInstance();
    const norad = registry.memberNorad(123);

    document.body.appendChild(view.element);
    view.setQuery(String(norad));
    expect(view.totalRowCount).toBeGreaterThanOrEqual(1);
    const row = view.element.querySelector<HTMLElement>(`[data-asset-id="sat-${norad}"]`)!;

    expect(row).not.toBeNull();
    row.querySelector<HTMLElement>('[data-action="pin"]')!.click();
    expect(service.isPinned(norad)).toBe(true);
    view.element.querySelector<HTMLElement>(`[data-asset-id="sat-${norad}"]`)!.click();
    expect(service.selectedNorad).toBe(norad);
    expect(view.element.querySelector(`[data-asset-id="sat-${norad}"]`)!.classList.contains('active')).toBe(true);
    view.setQuery('');
    expect(view.totalRowCount).toBe(1);
    view.dispose();
    service.reset();
  });

  it('a locked row shows the lock toast instead of selecting', () => {
    const onLockedClick = vi.fn();
    const view = new ConstellationTreeView(registry, { isLocked: () => true, onLockedClick });
    const norad = registry.memberNorad(5);

    document.body.appendChild(view.element);
    view.setQuery(String(norad));
    view.element.querySelector<HTMLElement>(`[data-asset-id="sat-${norad}"]`)!.click();
    expect(onLockedClick).toHaveBeenCalledOnce();
    expect(SelectionService.getInstance().selectedNorad).toBeNull();
    view.dispose();
  });
});
