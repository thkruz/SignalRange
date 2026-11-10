/**
 * Every site hotspot with a close-up opens exactly one close-up, one close-up per
 * item, and every close-up target exists in the frontline sandbox plant config.
 */

import fs from 'node:fs';
import path from 'node:path';
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { forwardInventory } from '@app/campaigns/frontline/scenario-support';
import {
  CLOSEUPS,
  closeupFor,
  FORWARD_CABLE_EUROSAT,
  FORWARD_CLOSEUPS,
  FORWARD_HOTSPOTS,
  FORWARD_ROUTER_EUROSAT,
  FORWARD_SCENE_LAYERS,
  FORWARD_SITE_ASPECT,
  FORWARD_SITE_IMAGE,
  forwardSceneLayers,
  SITE_ASPECT,
  SITE_HOTSPOTS,
  SITE_IMAGES,
  visibleHotspots,
} from '@app/campaigns/frontline/site-hotspots';
import { closeupImageFor, FORWARD_CLOSEUP_LAYERS, forwardArtFiles, layersFor, sceneLayerImageFor, siteImageFor } from '@app/campaigns/frontline/site-layers';
import type { CloseupDef } from '@app/physical/ui/site-types';
import { describe, expect, it } from 'vitest';

const publicDir = path.resolve(__dirname, '../../public');
const partIds = new Set(frontlinePlantConfig.parts.map((p) => p.id));
const cableIds = new Set(frontlinePlantConfig.cables.map((c) => c.id));
const connectorIds = new Set(frontlinePlantConfig.connectors.map((c) => c.id));

describe('site close-ups', () => {
  it('has 13 close-ups, one per item', () => {
    expect(Object.keys(CLOSEUPS)).toHaveLength(13);
    for (const [key, def] of Object.entries(CLOSEUPS)) {
      expect(def.id).toBe(key);
      expect(def.image).toContain(`cu-${key}.webp`);
    }
  });

  it('every close-up hotspot maps to exactly one existing close-up, and each close-up has one hotspot', () => {
    const used = new Map<string, number>();
    for (const spot of SITE_HOTSPOTS) {
      if (!spot.closeup) {
        continue;
      }
      expect(CLOSEUPS[spot.closeup], spot.id).toBeDefined();
      used.set(spot.closeup, (used.get(spot.closeup) ?? 0) + 1);
    }
    for (const id of Object.keys(CLOSEUPS)) {
      expect(used.get(id), id).toBe(1);
    }
  });

  it('every close-up target id exists in the plant config', () => {
    for (const def of Object.values(CLOSEUPS)) {
      for (const r of def.regions) {
        expect(partIds.has(r.target) || connectorIds.has(r.target), `${def.id}/${r.id}`).toBe(true);
      }
      for (const p of def.probes) {
        expect(connectorIds.has(p.target), `${def.id}/${p.id}`).toBe(true);
      }
      for (const c of def.cables) {
        expect(cableIds.has(c.target), `${def.id}/${c.target}`).toBe(true);
      }
    }
  });

  it('keeps every verb reachable: regions, probes and cables cover every plant target', () => {
    const covered = new Set<string>();
    for (const def of Object.values(CLOSEUPS)) {
      def.regions.forEach((r) => {
        covered.add(r.target);
      });
      def.probes.forEach((p) => {
        covered.add(p.target);
      });
      def.cables.forEach((c) => {
        covered.add(c.target);
      });
    }
    for (const id of [...partIds, ...cableIds, ...connectorIds]) {
      expect(covered.has(id), id).toBe(true);
    }
  });
});

describe('forward site art (FS1)', () => {
  const targets = new Set([...partIds, ...cableIds, ...connectorIds]);
  const inUnit = (v: number): boolean => v >= 0 && v <= 1;

  it('keeps the camp hotspots, close-ups and images exactly as they were', () => {
    expect({ SITE_HOTSPOTS, CLOSEUPS, SITE_IMAGES, SITE_ASPECT }).toMatchSnapshot();
  });

  it('every forward hotspot lies inside the image and targets existing plant ids', () => {
    for (const spot of FORWARD_HOTSPOTS) {
      for (const id of [...spot.partIds, ...(spot.requires ?? [])]) {
        expect(targets.has(id), `${spot.id}/${id}`).toBe(true);
      }
      expect(spot.closeup, spot.id).toBeDefined();
      expect(closeupFor(spot.closeup!, 'forward'), spot.id).toBeDefined();
      expect(inUnit(spot.anchor[0]) && inUnit(spot.anchor[1]), `${spot.id} anchor`).toBe(true);
      for (const shape of spot.shapes) {
        if (shape.kind === 'rect') {
          expect([shape.x, shape.y, shape.x + shape.w, shape.y + shape.h].every(inUnit), spot.id).toBe(true);
        } else {
          expect(
            shape.points.every(([x, y]) => inUnit(x) && inUnit(y)),
            spot.id
          ).toBe(true);
        }
      }
    }
  });

  it('has no hotspot for items without plant parts, none open an action, and EuroSat hotspots need their parts', () => {
    const ids = FORWARD_HOTSPOTS.map((h) => h.id).join(' ');
    expect(ids).not.toMatch(/drone|spares|jerry|door|flap|table|modem/u);
    expect(FORWARD_HOTSPOTS.some((h) => h.action)).toBe(false);
    const all = (_id: string): boolean => true;
    expect(visibleHotspots('forward', all)).toHaveLength(FORWARD_HOTSPOTS.length);
    const s10 = new Set([...forwardInventory(10), 'skylink-cable']);
    expect(visibleHotspots('forward', (id) => s10.has(id)).some((h) => /vsat/u.test(h.id))).toBe(false);
    const s11 = new Set([...forwardInventory(11), 'skylink-cable', 'vsat-ifl']);
    expect(
      visibleHotspots('forward', (id) => s11.has(id))
        .map((h) => h.id)
        .filter((id) => /vsat/u.test(id))
        .sort()
    ).toEqual(['site-fwd-vsat-dish', 'site-fwd-vsat-ifl', 'site-fwd-vsat-lnb']);
    // Without the cable id the IFL hotspot hides
    const noIfl = new Set(forwardInventory(11));
    expect(visibleHotspots('forward', (id) => noIfl.has(id)).some((h) => h.id === 'site-fwd-vsat-ifl')).toBe(false);
  });

  it('the EuroSat hotspots open forward close-ups (FW8): no pending art, forward art for dish, LNB and IFL', () => {
    expect(FORWARD_HOTSPOTS.filter((h) => h.pendingArt)).toEqual([]);
    for (const [id, image] of [
      ['vsat-dish', 'cu-fwd-vsat-dish.webp'],
      ['lnb', 'cu-fwd-lnb.webp'],
      ['vsat-ifl', 'cu-fwd-vsat-ifl.webp'],
    ] as const) {
      const def = FORWARD_CLOSEUPS[id]!;
      expect(def.forward).toBe(true);
      expect(def.image).toContain(image);
      expect(closeupFor(id, 'forward')).toBe(def);
      expect(fs.existsSync(path.join(publicDir, def.image)), def.image).toBe(true);
    }
    expect(FORWARD_CLOSEUPS['vsat-dish']!.regions.map((r) => r.id)).toEqual(['cu-vsat-dish', 'cu-vsat-mount']);
    expect(FORWARD_CLOSEUPS.lnb!.probes.map((q) => q.target).sort()).toEqual(['vsat-feed', 'vsat-ifl:lnb']);
    expect(FORWARD_CLOSEUPS['vsat-ifl']!.cables.map((c) => c.target)).toEqual(['vsat-ifl']);
  });

  it('the EuroSat scene layers show only with their parts and stay inside the crop', () => {
    expect(FORWARD_SCENE_LAYERS).toHaveLength(2);
    expect(forwardSceneLayers((id) => id !== 'vsat-dish' && id !== 'vsat-modem')).toEqual([]);
    expect(forwardSceneLayers((id) => id === 'vsat-dish').map((l) => l.id)).toEqual(['eurosat']);
    expect(forwardSceneLayers((id) => id === 'vsat-modem').map((l) => l.id)).toEqual(['eurosat-modem']);
    for (const l of FORWARD_SCENE_LAYERS) {
      const [x, y, w, h] = l.bbox;
      expect([x, y, x + w, y + h].every(inUnit), l.id).toBe(true);
      expect(l.file).toContain('site-forward-eurosat');
    }
    // Master px 1186,654 - 1428,960 (the crop's bottom row) in a 1536x752 crop starting at row 208
    const [ex, ey, ew, eh] = FORWARD_SCENE_LAYERS[0].bbox;
    expect(ex).toBeCloseTo(1186 / 1536, 3);
    expect(ey).toBeCloseTo((654 - 208) / 752, 3);
    expect(ex + ew).toBeCloseTo(1428 / 1536, 3);
    expect(ey + eh).toBeCloseTo(1, 3);
  });

  it('the forward crop starts at master row 208', () => {
    const spot = FORWARD_HOTSPOTS.find((h) => h.id === 'site-fwd-generator')!;
    const shape = spot.shapes[0];
    expect(shape.kind === 'rect' && shape.y).toBeCloseTo((485 - 208) / 752, 3);
  });

  it('forward close-ups reuse camp ids, hit existing targets and keep every region and probe inside 0..1', () => {
    for (const [id, def] of Object.entries(FORWARD_CLOSEUPS)) {
      expect(def.id).toBe(id);
      expect(def.forward).toBe(true);
      expect(def.image).toContain(`cu-fwd-`);
      if (id !== 'skylink-cable') {
        expect(def.regions.map((r) => r.target).sort(), id).toEqual(CLOSEUPS[def.id].regions.map((r) => r.target).sort());
        expect(def.probes.map((p) => p.target).sort(), id).toEqual(CLOSEUPS[def.id].probes.map((p) => p.target).sort());
      }
      for (const r of def.regions) {
        expect(partIds.has(r.target) || connectorIds.has(r.target) || cableIds.has(r.target), `${id}/${r.id}`).toBe(true);
        if (r.shape.kind === 'rect') {
          const { x, y, w, h } = r.shape;
          expect([x, y, x + w, y + h].every(inUnit), `${id}/${r.id}`).toBe(true);
        }
      }
      for (const p of def.probes) {
        expect(connectorIds.has(p.target), `${id}/${p.id}`).toBe(true);
        expect(inUnit(p.x) && inUnit(p.y), `${id}/${p.id}`).toBe(true);
      }
    }
  });

  it('the resolver gives forward art only on a forward site and camp art otherwise', () => {
    expect(closeupFor('router', 'camp')).toBe(CLOSEUPS.router);
    expect(closeupFor('router', 'forward')).toBe(FORWARD_CLOSEUPS.router);
    expect(closeupFor('power-strip', 'forward').title).toBe('Power box');
    expect(closeupFor('skylink-cable', 'forward')).toBe(FORWARD_CLOSEUPS['skylink-cable']);
    expect(FORWARD_CLOSEUPS['skylink-cable']?.image).toContain('cu-fwd-skylink-cable.webp');
  });

  it('the cable close-up has a modem variant (S11+) with identical regions and probes', () => {
    const base = closeupFor('skylink-cable', 'forward', () => false);
    const eu = closeupFor('skylink-cable', 'forward', (id) => id === 'vsat-modem');
    expect(eu).toBe(FORWARD_CABLE_EUROSAT);
    expect(base.image).toContain('cu-fwd-skylink-cable.webp');
    expect(eu.image).toContain('cu-fwd-skylink-cable-eurosat.webp');
    expect(eu.regions).toEqual(base.regions);
    expect(eu.probes).toEqual(base.probes);
  });

  it('the router close-up has two variants picked by the modem, and all regions and probes are inside 0..1', () => {
    const base = closeupFor('router', 'forward', (id) => id !== 'vsat-modem');
    const eu = closeupFor('router', 'forward', () => true);
    expect(eu).toBe(FORWARD_ROUTER_EUROSAT);
    expect(base.image).toContain('cu-fwd-router.webp');
    expect(eu.image).toContain('cu-fwd-router-eurosat.webp');
    expect(base.regions.map((r) => r.target).sort()).toEqual(['router:dc', 'skylink-router']);
    expect(base.probes.map((p) => p.target)).toEqual(['skylink-cable:router']);
    expect(eu.regions.map((r) => r.target).sort()).toEqual(['modem:dc', 'router:dc', 'skylink-router', 'vsat-modem']);
    expect(eu.probes.map((p) => p.target).sort()).toEqual(['skylink-cable:router', 'vsat-ifl:modem']);
    // Camp is untouched
    expect(closeupFor('router', 'camp', () => true)).toBe(CLOSEUPS.router);
    for (const def of [base, eu, FORWARD_CLOSEUPS['skylink-cable']!]) {
      for (const r of def.regions) {
        expect(partIds.has(r.target) || connectorIds.has(r.target) || cableIds.has(r.target), `${def.id}/${r.id}`).toBe(true);
        if (r.shape.kind === 'rect') {
          const { x, y, w, h } = r.shape;
          expect([x, y, x + w, y + h].every(inUnit), `${def.id}/${r.id}`).toBe(true);
        }
      }
      for (const p of def.probes) {
        expect(connectorIds.has(p.target), `${def.id}/${p.id}`).toBe(true);
        expect(inUnit(p.x) && inUnit(p.y), `${def.id}/${p.id}`).toBe(true);
      }
    }
  });

  it('forward scene and close-ups get forward weather paintings, never the camp ones', () => {
    expect(FORWARD_SITE_IMAGE).toContain('site-forward.webp');
    expect(FORWARD_SITE_ASPECT).toBeCloseTo(1536 / 752, 6);
    expect(siteImageFor('outside', FORWARD_SITE_IMAGE, 'clear')).toBe(FORWARD_SITE_IMAGE);
    expect(siteImageFor('outside', FORWARD_SITE_IMAGE, 'snow')).toMatch(/site-forward-snow\.webp$/u);
    expect(siteImageFor('outside', FORWARD_SITE_IMAGE, 'wet')).toMatch(/site-forward-wet\.webp$/u);
    expect(siteImageFor('outside', SITE_IMAGES.outside, 'snow')).toMatch(/site-outside-snow/u);
    for (const layer of FORWARD_SCENE_LAYERS) {
      expect(sceneLayerImageFor(layer, 'clear')).toBe(layer.file);
      expect(sceneLayerImageFor(layer, 'snow')).toBe(layer.file.replace('.webp', '-snow.webp'));
      expect(sceneLayerImageFor(layer, 'wet')).toBe(layer.file.replace('.webp', '-wet.webp'));
    }
    for (const def of [...Object.values(FORWARD_CLOSEUPS), FORWARD_ROUTER_EUROSAT, FORWARD_CABLE_EUROSAT]) {
      expect(closeupImageFor(def, 'clear')).toBe(def.image);
      expect(closeupImageFor(def, 'snow'), def.title).toBe(def.image.replace('.webp', '-snow.webp'));
      // The EuroSat dish has no wet painting (as camp): the original stays
      const wet = def.id === 'vsat-dish' ? def.image : def.image.replace('.webp', '-wet.webp');
      expect(closeupImageFor(def, 'wet'), def.title).toBe(wet);
    }
    expect(layersFor('skylink-dish').length).toBeGreaterThan(0);
  });

  it('forward layers: own table, modem layers only on the EuroSat router, one layer serves both router and cable paintings', () => {
    const ids = (def: CloseupDef): string[] => layersFor(def.id, def.forward, def.image).map((l) => l.id);
    expect(ids(FORWARD_CLOSEUPS.router!).sort()).toEqual(['fwd-router-corrosion', 'fwd-router-moisture']);
    expect(ids(FORWARD_ROUTER_EUROSAT).sort()).toEqual(['fwd-modem-corrosion', 'fwd-modem-leds-off', 'fwd-modem-moisture', 'fwd-router-corrosion', 'fwd-router-moisture']);
    expect(ids(FORWARD_CLOSEUPS['skylink-cable']!)).toEqual(['fwd-skylink-cable-damage']);
    expect(ids(FORWARD_CABLE_EUROSAT)).toEqual(['fwd-skylink-cable-damage']);
    expect(ids(FORWARD_CLOSEUPS['skylink-dish']!).sort()).toEqual(['fwd-dish-collar-corrosion', 'fwd-dish-collar-moisture', 'fwd-skylink-dish-net', 'fwd-skylink-dish-snow']);
    expect(ids(FORWARD_CLOSEUPS.lnb!).sort()).toEqual(['fwd-lnb-corrosion', 'fwd-lnb-moisture']);
    expect(ids(FORWARD_CLOSEUPS['vsat-dish']!)).toEqual(['fwd-vsat-dish-snow']);
    expect(ids(FORWARD_CLOSEUPS['vsat-ifl']!)).toEqual(['fwd-vsat-ifl-damage']);
    // No power-station leds-off and no flap-in layer at the forward site; generator, laptop, power box have none
    for (const id of ['power-station', 'generator', 'laptop', 'power-strip'] as const) {
      expect(layersFor(id, true, FORWARD_CLOSEUPS[id]!.image), id).toEqual([]);
    }
    // Camp layers are untouched
    expect(layersFor('router').map((l) => l.id)).toEqual(['router-corrosion', 'router-moisture']);
  });

  it('every forward layer targets an existing connector, part or cable, and its callout stays inside the image', () => {
    for (const l of FORWARD_CLOSEUP_LAYERS) {
      const p = l.present;
      const targets = p.type === 'cable' ? p.targets : [p.target];
      for (const t of targets) {
        expect(partIds.has(t) || connectorIds.has(t) || cableIds.has(t), `${l.id} -> ${t}`).toBe(true);
      }
      if (l.callout) {
        expect(inUnit(l.callout.at[0]) && inUnit(l.callout.at[1]), l.id).toBe(true);
      }
      expect(l.file, l.id).toContain('layer-fwd-');
    }
  });

  it('every webp the forward weather and layer tables reference exists on disk', () => {
    const files = forwardArtFiles();
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) {
      expect(fs.existsSync(path.join(publicDir, f)), f).toBe(true);
    }
    for (const layer of FORWARD_SCENE_LAYERS) {
      expect(fs.existsSync(path.join(publicDir, layer.file)), layer.file).toBe(true);
    }
  });
});
