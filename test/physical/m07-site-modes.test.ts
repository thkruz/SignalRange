import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { createFrontlineSettings, forwardInventory } from '@app/campaigns/frontline/scenario-support';
import { closeupFor, FORWARD_ROUTER_EUROSAT, FORWARD_SITE_IMAGE, forwardSceneLayers, SITE_HOTSPOTS, SITE_IMAGES, visibleHotspots } from '@app/campaigns/frontline/site-hotspots';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { applySiteInventory } from '@app/physical/site-inventory';
import { describe, expect, it } from 'vitest';

function make(config: PlantConfig): PhysicalPlantManager {
  let now = 0;

  return new PhysicalPlantManager(structuredClone(config), {
    now: () => now,
    skip: (s) => {
      now += s;
    },
    env: () => ({ ambientC: 15, windMps: 0, rainMmH: 0 }),
    rng: () => ({ next: () => 0.5 }),
  });
}

const ids = (c: PlantConfig): string[] => c.parts.map((p) => p.id);

describe('M07 site modes and inventory', () => {
  it('applySiteInventory without an inventory returns the config unchanged', () => {
    expect(applySiteInventory(frontlinePlantConfig)).toBe(frontlinePlantConfig);
  });

  it('S9 and S10 have Skylink only; S11 to S16 add the EuroSat terminal', () => {
    for (const n of [9, 10]) {
      const cfg = createFrontlineSettings(n).physicalPlant!;
      expect(ids(cfg).some((i) => i.startsWith('vsat'))).toBe(false);
      expect(cfg.cables.map((c) => c.id)).toEqual(['spacey-cable']);
      expect(cfg.connectors.some((c) => c.id.startsWith('vsat'))).toBe(false);
      expect(cfg.site?.mode).toBe('forward');
    }
    for (const n of [11, 12, 13, 14, 15, 16]) {
      const cfg = createFrontlineSettings(n).physicalPlant!;
      expect(ids(cfg)).toContain('vsat-modem');
      expect(cfg.cables.map((c) => c.id)).toContain('vsat-ifl');
    }
    expect(forwardInventory(11)).toContain('vsat-dish');
  });

  it('camp scenarios keep the full kit, camp mode and the trip limit of 3', () => {
    const cfg = createFrontlineSettings(3).physicalPlant!;
    expect(cfg.site).toEqual({ mode: 'camp' });
    expect(cfg.tripLimit).toBe(3);
    expect(ids(cfg)).toEqual(ids(frontlinePlantConfig));
  });

  it('prunes faults, events and service paths that need a dropped part', () => {
    const cfg = applySiteInventory({
      ...structuredClone(frontlinePlantConfig),
      site: { mode: 'forward', inventory: forwardInventory(9) },
      faults: [
        { id: 'f1', target: 'vsat-ifl:lnb', kind: 'moisture' },
        { id: 'f2', target: 'spacey-cable:dish', kind: 'moisture' },
      ],
      events: [
        {
          id: 'e',
          startAfterObjectiveId: 'o',
          actions: [
            { kind: 'inject-fault', fault: { id: 'f3', target: 'vsat-dish', kind: 'snow' } },
            { kind: 'set-flag', key: 'k', value: 1 },
          ],
        },
      ],
    });
    expect(cfg.faults?.map((f) => f.id)).toEqual(['f2']);
    expect(cfg.events?.[0].actions).toHaveLength(1);
  });

  it('forward mode counts no trips and never spots the player', () => {
    const plant = make(createFrontlineSettings(11).physicalPlant!);
    expect(plant.getSiteMode()).toBe('forward');
    for (let i = 0; i < 6; i++) {
      plant.clearSnow('spacey-dish');
      plant.goOutside();
      plant.returnInside();
    }
    const report = plant.getReport();
    expect(report.trips).toBe(0);
    expect(report.spotted).toBe(false);
    expect(plant.isOutside()).toBe(false);
  });

  it('camp mode still spots after the trip limit', () => {
    const cfg = { ...structuredClone(frontlinePlantConfig), tripLimit: 1 };
    const plant = make(cfg);
    expect(plant.getSiteMode()).toBe('camp');
    for (let i = 0; i < 3; i++) {
      plant.goOutside();
      plant.returnInside();
    }
    expect(plant.getReport().spotted).toBe(true);
  });

  it('the forward scene hides tent hotspots and hotspots for missing equipment', () => {
    const s9 = make(createFrontlineSettings(9).physicalPlant!);
    const has9 = (id: string): boolean => s9.getTargetTraits(id) !== null;
    const labels9 = visibleHotspots('forward', has9).map((h) => h.id);
    expect(labels9).toContain('site-fwd-spacey-dish');
    expect(labels9).toContain('site-fwd-generator');
    expect(labels9.some((id) => /vsat/u.test(id))).toBe(false);
    expect(visibleHotspots('forward', has9).some((h) => h.action || h.closeup === 'flap-out')).toBe(false);

    const s11 = make(createFrontlineSettings(11).physicalPlant!);
    const labels11 = visibleHotspots('forward', (id) => s11.getTargetTraits(id) !== null).map((h) => h.id);
    // S11 brings the EuroSat dish, LNB and IFL hotspots, the two scene layers and the modem router close-up
    expect(labels11).toEqual(expect.arrayContaining(['site-fwd-vsat-dish', 'site-fwd-vsat-lnb', 'site-fwd-vsat-ifl']));
    const has11 = (id: string): boolean => s11.getTargetTraits(id) !== null;
    expect(forwardSceneLayers(has11).map((l) => l.id)).toEqual(['eurosat', 'eurosat-modem']);
    expect(forwardSceneLayers(has9)).toEqual([]);
    expect(closeupFor('router', 'forward', has11)).toBe(FORWARD_ROUTER_EUROSAT);
    expect(closeupFor('router', 'forward', has9).image).toContain('cu-fwd-router.webp');
  });

  it('camp views keep every hotspot with a full plant, and the forward scene has its own painting', () => {
    const camp = make(frontlinePlantConfig);
    const has = (id: string): boolean => camp.getTargetTraits(id) !== null;
    expect(visibleHotspots('inside', has).length + visibleHotspots('outside', has).length).toBe(SITE_HOTSPOTS.length);
    expect(FORWARD_SITE_IMAGE).not.toBe(SITE_IMAGES.outside);
    expect(FORWARD_SITE_IMAGE).toContain('site-forward.webp');
  });
});
