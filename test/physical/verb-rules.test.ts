/**
 * The verb applicability table, the Core refusal of a verb that does not apply,
 * the "location is the target's location" trip rule, and that every trainer
 * fault kind can still be found and fixed with verbs that apply.
 */

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { GENERIC_OBS, hasObs, OBS_TABLE } from '@app/physical/observation-text';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantFaultKind, PlantVerb } from '@app/physical/physical-plant-types';
import { OFFERED_VERBS } from '@app/physical/plant-verb-rules';
import { FAULT_KINDS, validTargets } from '@app/physical/ui/plant-ui-helpers';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function makePlant(): PhysicalPlantManager {
  let t = 100;
  const streams = new Map<string, RngStream>();

  return new PhysicalPlantManager(frontlinePlantConfig, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`verb-rules:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
}

const ALL_VERBS: PlantVerb[] = [...OFFERED_VERBS, 'multimeter', 'cable-tester'];

/** Allowed targets per verb as the table ships (frontline plant); group names stand for every connector, cable or non-generator part */
const ALLOWED: Record<string, string[]> = {
  inspect: ['*'],
  feel: ['generator', 'power-station', 'power-strip', 'spacey-router', 'vsat-modem', 'laptop', 'spacey-dish', 'connectors'],
  wiggle: ['connectors', 'cables'],
  multimeter: [
    'power-station',
    'power-strip',
    'generator',
    'generator:out',
    'ps:in',
    'ps:ac-out',
    'ps:dc-out',
    'strip:in',
    'strip:router',
    'strip:modem',
    'router:dc',
    'modem:dc',
    'spacey-router',
    'vsat-modem',
    'spacey-cable:dish',
    'spacey-cable:router',
    'vsat-ifl:lnb',
    'vsat-ifl:modem',
  ],
  'cable-tester': ['signal-connectors', 'cables'],
  reseat: ['connectors'],
  tighten: ['vsat-feed', 'vsat-ifl:lnb', 'vsat-ifl:modem'],
  seal: ['spacey-cable:dish', 'vsat-feed', 'vsat-ifl:lnb'],
  swap: ['parts-not-generator', 'connectors', 'cables'],
  powerCycle: ['generator', 'power-station', 'spacey-router', 'vsat-modem', 'laptop', 'spacey-dish'],
  refuel: ['generator'],
  clearSnow: ['spacey-dish', 'vsat-dish'],
  removeNet: ['spacey-dish', 'vsat-dish'],
  reroute: ['cables'],
};

function expected(plant: PhysicalPlantManager, verb: string, id: string): boolean {
  const list = ALLOWED[verb];
  const type = plant.getTargetTraits(id)?.type;
  if (list.includes('*') || list.includes(id)) {
    return true;
  }
  if (list.includes('signal-connectors') && type === 'connector' && !plant.getTargetTraits(id)?.feed) {
    return true;
  }
  if (list.includes('connectors') && type === 'connector') {
    return true;
  }
  if (list.includes('cables') && type === 'cable') {
    return true;
  }

  return list.includes('parts-not-generator') && type === 'part' && id !== 'generator' && id !== 'power-strip';
}

describe('verb applicability table', () => {
  it('each verb applies to exactly its allowed kinds on every plant target', () => {
    const plant = makePlant();
    const ids = [...plant.getPartIds(), ...plant.getConnectorIds(), ...plant.getCableIds()];
    const bad: string[] = [];
    for (const verb of ALL_VERBS) {
      for (const id of ids) {
        if (plant.verbApplies(verb, id) !== expected(plant, verb, id)) {
          bad.push(`${verb} on ${id}: expected ${expected(plant, verb, id)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the multimeter is never offered on the laptop, reflector, LNB part, feed horn or panel', () => {
    const plant = makePlant();
    for (const id of ['laptop', 'vsat-dish', 'vsat-lnb', 'vsat-feed', 'spacey-dish']) {
      expect(plant.verbApplies('multimeter', id), id).toBe(false);
    }
  });

  it('refuses a non-applicable verb with zero cost, no log entry and no ineffective count', () => {
    const plant = makePlant();
    const before = plant.getTimeSeconds();
    const result = plant.measure('multimeter', 'laptop');
    expect(GENERIC_OBS['not-applicable']).toContain(result.observation);
    expect(result.costSeconds).toBe(0);
    expect(GENERIC_OBS['not-applicable']).toContain(plant.refuel('spacey-router').observation);
    expect(GENERIC_OBS['not-applicable']).toContain(plant.tighten('spacey-cable:router').observation);
    expect(GENERIC_OBS['not-applicable']).toContain(plant.reroute('generator').observation);
    expect(GENERIC_OBS['not-applicable']).toContain(plant.swap('generator').observation);
    expect(plant.getTimeSeconds()).toBe(before);
    expect(plant.getLog()).toHaveLength(0);
    expect(plant.ineffectiveActionCount()).toBe(0);
    expect(plant.getReport().trips).toBe(0);
  });
});

describe('a verb is worked where its target is', () => {
  it('swapping an indoor item never opens a trip or goes outside', () => {
    const plant = makePlant();
    for (const id of ['spacey-router', 'vsat-modem', 'laptop', 'power-station', 'spacey-cable:router', 'vsat-ifl:modem']) {
      plant.swap(id);
      expect(plant.isOutside(), id).toBe(false);
    }
    expect(plant.getReport().trips).toBe(0);
  });

  it('swapping an outdoor item opens one trip, and more outdoor work in it opens no second', () => {
    const plant = makePlant();
    plant.swap('vsat-lnb');
    expect(plant.isOutside()).toBe(true);
    plant.swap('vsat-ifl:lnb');
    plant.inspect('generator');
    expect(plant.getReport().trips).toBe(1);
    plant.inspect('laptop');
    expect(plant.isOutside()).toBe(false);
    plant.inspect('generator');
    expect(plant.getReport().trips).toBe(2);
  });

  it('cable runs are worked wherever the player stands', () => {
    const plant = makePlant();
    plant.inspect('spacey-cable');
    expect(plant.getReport().trips).toBe(0);
    plant.goOutside();
    plant.inspect('spacey-cable');
    expect(plant.isOutside()).toBe(true);
    expect(plant.getReport().trips).toBe(1);
  });
});

describe('every trainer fault kind can still be found and fixed', () => {
  const FIND: PlantVerb[] = ['inspect', 'wiggle', 'feel', 'multimeter', 'cable-tester'];
  const FIX: PlantVerb[] = ['reseat', 'tighten', 'seal', 'swap', 'powerCycle', 'refuel', 'clearSnow', 'removeNet', 'reroute'];
  /** Cleared by the model itself (recharge by a running generator) or not fixable on site */
  const NO_FIX_VERB: PlantFaultKind[] = ['battery-depleted', 'generator-noise'];

  for (const def of FAULT_KINDS) {
    it(`${def.kind}: every valid target has an applicable verb that finds it and one that fixes it`, () => {
      const plant = makePlant();
      const targets = validTargets(plant, def.kind);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const text = (verb: PlantVerb): boolean => hasObs(OBS_TABLE, { target: plant.getObsClass(target), verb: verb as never, state: def.kind });
        const finders = FIND.filter((v) => text(v) && plant.verbApplies(v, target));
        expect(finders.length, `${target} finder`).toBeGreaterThan(0);
        if (!NO_FIX_VERB.includes(def.kind)) {
          expect(FIX.filter((v) => plant.verbApplies(v, target)).length, `${target} fixer`).toBeGreaterThan(0);
        }
      }
    });
  }

  it('the fixing verb really clears the fault on an applicable target', () => {
    type Fix = 'reseat' | 'tighten' | 'seal' | 'swap' | 'powerCycle' | 'clearSnow' | 'removeNet' | 'reroute' | 'refuel';
    const cases: Array<[PlantFaultKind, string, Fix]> = [
      ['partial-seat', 'spacey-cable:router', 'reseat'],
      ['loose-nut', 'vsat-ifl:modem', 'tighten'],
      ['moisture', 'vsat-ifl:lnb', 'seal'],
      ['corrosion', 'spacey-cable:router', 'swap'],
      ['bent-pin', 'vsat-ifl:modem', 'swap'],
      ['cable-pinch', 'vsat-ifl', 'reroute'],
      ['cable-nick', 'spacey-cable', 'swap'],
      ['generator-sag', 'generator', 'powerCycle'],
      ['out-of-fuel', 'generator', 'refuel'],
      ['brick-dead', 'spacey-router', 'swap'],
      ['snow', 'vsat-dish', 'clearSnow'],
      ['net', 'spacey-dish', 'removeNet'],
    ];
    for (const [kind, target, verb] of cases) {
      const plant = makePlant();
      plant.injectFault({ id: 'f', target, kind, atMeters: 5 });
      expect(plant[verb](target).cleared, `${kind} via ${verb}`).toEqual(['f']);
    }
  });
});
