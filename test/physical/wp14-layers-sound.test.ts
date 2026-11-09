/**
 * C6 WP14: painted fault layers, evidence callouts, weather variants and sandbox sound.
 */

import fs from 'node:fs';
import path from 'node:path';
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { CLOSEUPS, SITE_IMAGES } from '@app/campaigns/frontline/site-hotspots';
import { CLOSEUP_LAYERS, closeupImageFor, siteImageFor } from '@app/campaigns/frontline/site-layers';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantEnvironment, PlantFaultKind } from '@app/physical/physical-plant-types';
import { PlantSoundController } from '@app/physical/plant-sound-controller';
import { activeLayers, evidenceCallouts } from '@app/physical/ui/closeup-evidence';
import type { CloseupDef, CloseupId } from '@app/physical/ui/site-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { Sfx } from '@app/sound/sfx-enum';
import { describe, expect, it } from 'vitest';

function makePlant() {
  let t = 100;
  const env: PlantEnvironment = { windMps: 0, rainMmH: 0, ambientC: 15 };
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(frontlinePlantConfig, {
    now: () => t,
    skip: () => {
      t += 1;
    },
    env: () => ({ ...env }),
    setWeather: (w) => Object.assign(env, w),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`wp14:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });

  return { plant, env };
}

const def = (id: CloseupId): CloseupDef => CLOSEUPS[id];
const fault = (plant: PhysicalPlantManager, target: string, kind: PlantFaultKind): string => {
  const id = `f-${target}-${kind}`;
  plant.injectFault({ id, target, kind });

  return id;
};
const publicDir = path.resolve(__dirname, '../../public');

describe('layer table', () => {
  it('points at existing files with valid bboxes', () => {
    for (const layer of CLOSEUP_LAYERS) {
      for (const file of [layer.file, layer.snowFile].filter(Boolean) as string[]) {
        expect(fs.existsSync(path.join(publicDir, file)), file).toBe(true);
      }
      const [x, y, w, h] = layer.bbox;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x + w, layer.id).toBeLessThanOrEqual(1.0001);
      expect(y + h, layer.id).toBeLessThanOrEqual(1.0001);
    }
  });

  it('weather files exist', () => {
    for (const f of ['site-outside-snow', 'site-outside-wet', 'cu-spacey-dish-snow', 'cu-spacey-dish-wet', 'cu-vsat-dish-snow', 'cu-lnb-wet']) {
      expect(fs.existsSync(path.join(publicDir, `assets/campaigns/frontline/physical/${f}.webp`)), f).toBe(true);
    }
  });
});

describe('layer visibility follows fault state', () => {
  it('shows corrosion on the LNB connector only while the fault is present, found or not', () => {
    const { plant } = makePlant();
    expect(activeLayers(plant, def('lnb'), 'clear')).toHaveLength(0);
    const id = fault(plant, 'vsat-ifl:lnb', 'corrosion');
    expect(activeLayers(plant, def('lnb'), 'clear').map((a) => a.layer.id)).toContain('lnb-corrosion');
    expect(plant.isFactRevealed('vsat-ifl:lnb', 'corrosion')).toBe(false);
    plant.clearFault(id);
    expect(activeLayers(plant, def('lnb'), 'clear')).toHaveLength(0);
  });

  it('shows moisture at the router end of the SpaceY cable', () => {
    const { plant } = makePlant();
    fault(plant, 'spacey-cable:router', 'moisture');
    expect(activeLayers(plant, def('router'), 'clear').map((a) => a.layer.id)).toContain('router-moisture');
  });

  it('uses the on-snow variant of the snow layer in snow weather', () => {
    const { plant } = makePlant();
    fault(plant, 'spacey-dish', 'snow');
    expect(activeLayers(plant, def('spacey-dish'), 'clear')[0]?.src).toMatch(/layer-spacey-dish-snow\.webp$/u);
    expect(activeLayers(plant, def('spacey-dish'), 'snow')[0]?.src).toMatch(/snow-on-snow\.webp$/u);
  });
});

describe('callouts', () => {
  it('appear only after the matching reveal', () => {
    const { plant } = makePlant();
    fault(plant, 'vsat-ifl:lnb', 'corrosion');
    expect(evidenceCallouts(plant, def('lnb'), 'clear', false)).toHaveLength(0);
    plant.inspect('vsat-ifl:lnb');
    if (plant.isFactRevealed('vsat-ifl:lnb', 'corrosion')) {
      expect(evidenceCallouts(plant, def('lnb'), 'clear', false).length).toBeGreaterThan(0);
    }
  });

  it('xray shows every present fact; clean connectors give none', () => {
    const { plant } = makePlant();
    expect(evidenceCallouts(plant, def('lnb'), 'clear', true)).toHaveLength(0);
    fault(plant, 'vsat-ifl:lnb', 'corrosion');
    expect(evidenceCallouts(plant, def('lnb'), 'clear', true).length).toBeGreaterThan(0);
  });

  it('a partial seat on the power strip has a callout after the reveal and no layer', () => {
    const { plant } = makePlant();
    fault(plant, 'strip:router', 'partial-seat');
    expect(activeLayers(plant, def('power-strip'), 'clear')).toHaveLength(0);
    expect(evidenceCallouts(plant, def('power-strip'), 'clear', false)).toHaveLength(0);
    expect(evidenceCallouts(plant, def('power-strip'), 'clear', true).length).toBeGreaterThan(0);
  });
});

describe('weather', () => {
  it('derives clear, wet and snow', () => {
    const { plant, env } = makePlant();
    expect(plant.getWeather()).toBe('clear');
    env.rainMmH = 2;
    expect(plant.getWeather()).toBe('wet');
    env.snow = true;
    expect(plant.getWeather()).toBe('snow');
  });

  it('selects the outside view variant; inside is never weathered', () => {
    expect(siteImageFor('outside', SITE_IMAGES.outside, 'clear')).toBe(SITE_IMAGES.outside);
    expect(siteImageFor('outside', SITE_IMAGES.outside, 'snow')).toMatch(/site-outside-snow/u);
    expect(siteImageFor('outside', SITE_IMAGES.outside, 'wet')).toMatch(/site-outside-wet/u);
    expect(siteImageFor('inside', SITE_IMAGES.inside, 'snow')).toBe(SITE_IMAGES.inside);
  });

  it('swaps outdoor close-ups; vsat-dish wet keeps the original', () => {
    expect(closeupImageFor(def('spacey-dish'), 'wet')).toMatch(/cu-spacey-dish-wet/u);
    expect(closeupImageFor(def('vsat-dish'), 'snow')).toMatch(/cu-vsat-dish-snow/u);
    expect(closeupImageFor(def('vsat-dish'), 'wet')).toBe(def('vsat-dish').image);
    expect(closeupImageFor(def('router'), 'snow')).toBe(def('router').image);
  });
});

describe('sound triggers', () => {
  function rig() {
    const { plant } = makePlant();
    const played: Sfx[] = [];
    const stopped: Sfx[] = [];
    const ctl = new PlantSoundController(plant, {
      play: (s: Sfx) => {
        played.push(s);
      },
      stop: (s: Sfx) => {
        stopped.push(s);
      },
    });

    return { plant, ctl, played, stopped };
  }

  it('plays per-verb one-shots', () => {
    const { plant, played } = rig();
    plant.goOutside();
    played.length = 0;
    plant.reseat('vsat-ifl:lnb');
    expect(played).toContain(Sfx.CONNECTOR_SEAT);
    plant.tighten('vsat-ifl:lnb');
    expect(played).toContain(Sfx.FCONNECTOR_TIGHTEN);
    plant.wiggle('vsat-ifl');
    expect(played).toContain(Sfx.CABLE_RUSTLE);
    plant.measure('multimeter', 'vsat-ifl:lnb');
    expect(played).toContain(Sfx.PROBE_BEEP);
    plant.measure('cable-tester', 'vsat-ifl');
    expect(played).toContain(Sfx.CABLE_TESTER_BEEPS);
  });

  it('plays the tent flap going out and coming back', () => {
    const { plant, played } = rig();
    plant.goOutside();
    expect(played).toContain(Sfx.TENT_EXIT);
    plant.returnInside();
    expect(played).toContain(Sfx.TENT_ENTER);
  });

  it('runs the yard bed outside, the tent bed on the Site tab inside, and stops loops on dispose', () => {
    const { plant, ctl, played, stopped } = rig();
    ctl.setSiteTabShown(true);
    expect(played).toContain(Sfx.AMB_TENT);
    plant.goOutside();
    expect(played).toContain(Sfx.AMB_YARD);
    expect(stopped).toContain(Sfx.AMB_TENT);
    ctl.dispose();
    expect(stopped).toContain(Sfx.AMB_YARD);
  });
});
