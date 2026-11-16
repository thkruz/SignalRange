import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { PICKER_LIMIT, pickerEntries, pickerOptionsHtml, SatellitePicker } from '@app/pages/mission-control/satellite-picker';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { SimulationManager } from '@app/simulation/simulation-manager';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';
import { generateSyntheticTles } from '../../../scripts/tle-sets/synth';

const observer = { name: 'T', lat: 30 as Degrees, lon: -100 as Degrees, alt: 0 as Kilometers };

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const shells = [...new Set(tles.map((t) => t.shell))];

  return {
    format: 'sr-tle-set/1',
    id: 'test-set',
    epoch: '2026-11-09',
    source: 'synthetic',
    groups: shells.map((id) => ({ id, label: id, count: tles.filter((t) => t.shell === id).length })),
    members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
  };
}

function authored(norad: number, name: string, set: TleSet): OrbitalSatellite {
  const m = set.members[0];

  return new OrbitalSatellite(name, norad, [], [], { tle1: m.tle1 as TleLine1, tle2: m.tle2 as TleLine2, observer });
}

function simOf(registry: SatelliteRegistry): SimulationManager {
  return {
    registry,
    get satellites() {
      return registry.hydrated;
    },
    getSatByNoradId: (n: number) => registry.get(n),
  } as unknown as SimulationManager;
}

describe('satellite picker', () => {
  const set = makeSet(600);

  it('small scenarios: no search box, one option per authored satellite, the same markup as before', () => {
    const reg = new SatelliteRegistry([authored(99001, 'ALPHA', set), authored(99002, 'BRAVO', set)], { observer });
    const sim = simOf(reg);
    const result = pickerEntries(sim, 'zzz', null);

    expect(result.scale).toBe(false);
    expect(pickerOptionsHtml(result)).toBe('<option value="99001">ALPHA</option><option value="99002">BRAVO</option>');
    const select = document.createElement('select');

    document.body.append(select);
    const picker = new SatellitePicker(select, sim, { placeholder: '-- Select Satellite --' });

    expect(picker.hasSearch).toBe(false);
    picker.refresh(null);
    expect([...select.options].map((o) => o.textContent)).toEqual(['-- Select Satellite --', 'ALPHA', 'BRAVO']);
    expect(document.querySelector('.sr-picker-search')).toBeNull();
    picker.dispose();
    select.remove();
  });

  it('at scale lists authored, pinned and selected only, and keeps the DOM small', () => {
    const reg = new SatelliteRegistry([authored(99001, 'ALPHA', set)], { observer });

    reg.addConstellation(set, { tleSet: set.id });
    const pinned = set.members[5].noradId;

    reg.pin(pinned);
    const entries = pickerEntries(simOf(reg), '', null).entries;

    expect(entries.map((e) => e.noradId).sort((a, b) => a - b)).toEqual([99001, pinned].sort((a, b) => a - b));
    expect(entries.length).toBeLessThan(PICKER_LIMIT);
  });

  it('searches every member by name or NORAD prefix, capped, and keeps the current pick listed', () => {
    const reg = new SatelliteRegistry([authored(99001, 'ALPHA', set)], { observer });

    reg.addConstellation(set, { tleSet: set.id });
    const sim = simOf(reg);
    const target = set.members[300];
    const byName = pickerEntries(sim, target.name, null);

    expect(byName.entries.some((e) => e.noradId === target.noradId)).toBe(true);
    const byId = pickerEntries(sim, String(target.noradId).slice(0, 4), null);

    expect(byId.entries.every((e) => String(e.noradId).startsWith(String(target.noradId).slice(0, 4)) || e.name.toLowerCase().includes(String(target.noradId).slice(0, 4)))).toBe(
      true
    );
    const broad = pickerEntries(sim, '1', null);

    expect(broad.entries.length).toBeLessThanOrEqual(PICKER_LIMIT);
    expect(broad.more).toBeGreaterThan(0);
    expect(pickerEntries(sim, 'no-such-satellite', 99001).entries.map((e) => e.noradId)).toEqual([99001]);
  });

  it('mounts a search box that filters the options, and picking a member hydrates it', () => {
    const reg = new SatelliteRegistry([authored(99001, 'ALPHA', set)], { observer });

    reg.addConstellation(set, { tleSet: set.id });
    const sim = simOf(reg);
    const select = document.createElement('select');

    document.body.append(select);
    const picker = new SatellitePicker(select, sim, { placeholder: '-- Select Satellite --' });

    picker.refresh(null);
    expect(picker.hasSearch).toBe(true);
    expect(select.options.length).toBe(2);
    const input = document.querySelector<HTMLInputElement>('.sr-picker-search')!;
    const target = set.members[400];

    input.value = target.name;
    input.dispatchEvent(new Event('input'));
    const option = [...select.options].find((o) => o.value === String(target.noradId))!;

    expect(option).toBeDefined();
    expect(option.textContent).toContain(`(${target.noradId})`);
    expect(reg.isHydrated(target.noradId)).toBe(false);
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
    expect(reg.isHydrated(target.noradId)).toBe(true);
    picker.dispose();
    expect(document.querySelector('.sr-picker-search')).toBeNull();
    select.remove();
  });
});
