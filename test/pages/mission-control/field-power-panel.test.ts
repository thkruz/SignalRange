import { buildPowerPanelModel, FieldPowerPanel, formatDuration, powerPanelRelevant } from '@app/pages/mission-control/tabs/field-power-panel';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PartModeConfig, PlantConfig } from '@app/physical/physical-plant-types';
import { describe, expect, it } from 'vitest';

const modes = (activeW: number): PartModeConfig[] => [
  { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
  { id: 'active', label: 'Active', loadW: activeW, servesTraffic: true },
];

function config(withModes = true): PlantConfig {
  return {
    parts: [
      { id: 'power-station', kind: 'battery', label: 'Power station', capacityWh: 1000, socWh: 450, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'laptop', kind: 'client', label: 'Laptop', poweredBy: 'power-station', loadW: 45, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink dish', poweredBy: 'power-station', nominalV: 12, loadW: 50, ...(withModes ? { mode: 'standby', modes: modes(50) } : {}) },
      { id: 'vsat-modem', kind: 'modem', label: 'VSAT modem', poweredBy: 'power-station', nominalV: 12, loadW: 50, ...(withModes ? { mode: 'standby', modes: modes(80) } : {}) },
    ],
    connectors: [],
    cables: [],
    ...(withModes ? { power: { reserveWh: 200, planningHorizonS: 5400, basis: 'battery-only' as const } } : {}),
  };
}

function make(cfg: PlantConfig): PhysicalPlantManager {
  let now = 0;

  return new PhysicalPlantManager(structuredClone(cfg), {
    now: () => now,
    skip: (s) => {
      now += s;
    },
    env: () => ({ ambientC: 15, windMps: 0, rainMmH: 0 }),
    rng: () => ({ next: () => 0.5 }),
  });
}

describe('M08 field power panel', () => {
  it('is not relevant without modes or a reserve', () => {
    expect(powerPanelRelevant(null)).toBe(false);
    expect(powerPanelRelevant(make(config(false)))).toBe(false);
    expect(powerPanelRelevant(make(config()))).toBe(true);
  });

  it('model lists mode devices and previews a pick without changing state', () => {
    const plant = make(config());
    const base = buildPowerPanelModel(plant, new Map());
    expect(base.devices.map((d) => d.id)).toEqual(['skylink', 'vsat-modem', 'laptop']);
    expect(base.changes).toEqual({});
    const picked = buildPowerPanelModel(plant, new Map([['skylink', 'active']]));
    expect(picked.changes).toEqual({ skylink: 'active' });
    expect(picked.forecast.projectedSocWh).toBeLessThan(base.forecast.projectedSocWh);
    expect(plant.getPartMode('skylink')).toBe('standby');
    expect(buildPowerPanelModel(plant, new Map([['skylink', 'bogus']])).changes).toEqual({});
  });

  it('panel shows forecast on pick and commits only on Apply', () => {
    const plant = make(config());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new FieldPowerPanel(host, () => plant);
    panel.sync();
    const sel = host.querySelector<HTMLInputElement>('input[data-power-part="skylink"][value="active"]') as HTMLInputElement;
    sel.checked = true;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector('[data-fpp="forecast-note"]')?.textContent).toContain('preview');
    expect(plant.getPartMode('skylink')).toBe('standby');
    const before = plant.getTimeSeconds();
    host.querySelector<HTMLButtonElement>('button[data-power-action="apply"]')?.click();
    expect(plant.getPartMode('skylink')).toBe('active');
    expect(plant.getTimeSeconds()).toBeGreaterThan(before);
    expect(panel.getPending().size).toBe(0);
    expect(host.querySelector('[data-fpp="load-skylink"]')?.textContent).toBe('50 W');
    host.remove();
  });

  it('discard clears picks, sync keeps an open selector value, hides when irrelevant', () => {
    const plant = make(config());
    const host = document.createElement('div');
    const panel = new FieldPowerPanel(host, () => plant);
    panel.setPending('vsat-modem', 'active');
    panel.sync();
    expect((host.querySelector('input[data-power-part="vsat-modem"]:checked') as HTMLInputElement).value).toBe('active');
    host.querySelector<HTMLButtonElement>('button[data-power-action="reset"]')?.click();
    expect((host.querySelector('input[data-power-part="vsat-modem"]:checked') as HTMLInputElement).value).toBe('standby');
    const hidden = document.createElement('div');
    new FieldPowerPanel(hidden, () => make(config(false))).sync();
    expect(hidden.style.display).toBe('none');
  });

  it('formats durations', () => {
    expect(formatDuration(40)).toBe('40 s');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(600)).toBe('10 min');
  });

  it('a field plan retains the preview without remotely switching equipment', () => {
    const plant = make(config());
    const host = document.createElement('div');
    const visits: string[] = [];
    const panel = new FieldPowerPanel(
      host,
      () => plant,
      (id) => visits.push(id)
    );
    const before = plant.getPartMode('vsat-modem');
    panel.setPending('vsat-modem', 'active');
    host.querySelector<HTMLButtonElement>('[data-power-action="apply"]')!.click();
    expect(plant.getPartMode('vsat-modem')).toBe(before);
    expect(panel.getPending().get('vsat-modem')).toBe('active');
    host.querySelector<HTMLButtonElement>('[data-power-visit="vsat-modem"]')!.click();
    expect(visits).toEqual(['vsat-modem']);
  });
});
