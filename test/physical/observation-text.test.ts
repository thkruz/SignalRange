/**
 * @file observation-text.test - The observation table: coverage, honesty and variety
 */
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { GENERIC_OBS, hasObs, OBS_TABLE, type ObsKey, type ObsTargetClass, pickObs } from '@app/physical/observation-text';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantFaultKind, PlantVerb } from '@app/physical/physical-plant-types';
import { FAULT_KINDS, validTargets } from '@app/physical/ui/plant-ui-helpers';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function makePlant(): { plant: PhysicalPlantManager; advance: (s: number) => void } {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(frontlinePlantConfig, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`obs-text:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });

  return {
    plant,
    advance: (s) => {
      t += s;
      plant.update(s);
    },
  };
}

const FIND: PlantVerb[] = ['inspect', 'wiggle', 'feel', 'multimeter', 'cable-tester'];
const BANNED = [/\bcorroded\b/u, /\bfixed it\b/u, /\bwas fine\b/u, /\bfaulty\b/u, /\bdamaged\b/u, /\bbroken\b/u];

function allLines(): string[] {
  const out: string[] = [];
  for (const rows of Object.values(OBS_TABLE)) {
    for (const states of Object.values(rows ?? {})) {
      for (const lines of Object.values(states ?? {})) {
        out.push(...(lines as string[]));
      }
    }
  }
  for (const lines of Object.values(GENERIC_OBS)) {
    out.push(...lines);
  }

  return out;
}

function callVerb(plant: PhysicalPlantManager, verb: PlantVerb, target: string): string {
  if (verb === 'multimeter' || verb === 'cable-tester') {
    return plant.measure(verb, target).observation;
  }

  return (plant as unknown as Record<string, (t: string) => { observation: string }>)[verb](target).observation;
}

describe('observation table coverage', () => {
  it('every class and verb in the table has a healthy line', () => {
    for (const [cls, rows] of Object.entries(OBS_TABLE)) {
      if (cls === '*') {
        continue;
      }
      for (const verb of Object.keys(rows ?? {})) {
        const key: ObsKey = { target: cls as ObsTargetClass, verb: verb as ObsKey['verb'], state: 'healthy' };
        // Fix verbs describe a result, so their baseline is no-effect or cleared
        const fixBaseline = hasObs(OBS_TABLE, { ...key, state: 'no-effect' }) || hasObs(OBS_TABLE, { ...key, state: 'cleared' });
        expect(hasObs(OBS_TABLE, key) || fixBaseline, `${cls}.${verb}`).toBe(true);
      }
    }
  });

  it('every applicable finding verb on a healthy plant gives a filled line', () => {
    const { plant } = makePlant();
    const ids = [...plant.getPartIds(), ...plant.getConnectorIds(), ...plant.getCableIds()];
    for (const id of ids) {
      for (const verb of FIND) {
        if (plant.verbApplies(verb, id)) {
          const text = callVerb(plant, verb, id);
          expect(text.length, `${id} ${verb}`).toBeGreaterThan(0);
          expect(text, `${id} ${verb}`).not.toMatch(/\{[a-zA-Z]+\}/u);
        }
      }
    }
  });

  // gnss-denied has no physical finding: it shows only in the terminal app debug data
  for (const def of FAULT_KINDS.filter((k) => k.kind !== 'gnss-denied')) {
    it(`${def.kind}: each valid target has a finding verb with text, filled and free of cause words`, () => {
      const targets = validTargets(makePlant().plant, def.kind as PlantFaultKind);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const { plant } = makePlant();
        const cls = plant.getObsClass(target);
        const finders = FIND.filter((v) => plant.verbApplies(v, target) && cls && hasObs(OBS_TABLE, { target: cls, verb: v as ObsKey['verb'], state: def.kind }));
        expect(finders.length, `${target} ${def.kind}`).toBeGreaterThan(0);
        plant.injectFault({ id: 'f', target, kind: def.kind as PlantFaultKind, atMeters: def.cableMeters ? 3 : undefined });
        for (const verb of finders) {
          const text = callVerb(plant, verb, target);
          expect(text, `${target} ${verb}`).not.toMatch(/\{[a-zA-Z]+\}/u);
        }
      }
    });
  }
});

describe('observation honesty', () => {
  it('no authored line states a cause verdict', () => {
    for (const line of allLines()) {
      for (const word of BANNED) {
        expect(line, line).not.toMatch(word);
      }
      expect(line, line).not.toMatch(/\b(honestly|crucial|worth noting|trade-off)\b/iu);
    }
  });
});

describe('pickObs', () => {
  it('never repeats a line twice in a row for the same target and verb', () => {
    const rng = new RngStream(fnv1a('pick'));
    const last = new Map<string, string>();
    const key: ObsKey = { target: 'router', verb: 'inspect', state: 'healthy' };
    let prev = '';
    for (let i = 0; i < 40; i++) {
      const line = pickObs(OBS_TABLE, key, rng, {}, last);
      expect(line).not.toBe(prev);
      prev = line;
    }
  });

  it('falls back to the healthy row when the state has no text', () => {
    const rng = new RngStream(fnv1a('fallback'));
    const line = pickObs(OBS_TABLE, { target: 'router', verb: 'inspect', state: 'snow' }, rng, {});
    expect(line.length).toBeGreaterThan(0);
  });
});

describe('model gaps', () => {
  it('a hand check of a dead router does not read as fine', () => {
    const { plant, advance } = makePlant();
    plant.injectFault({ id: 'out', target: 'generator', kind: 'out-of-fuel' });
    plant.injectFault({ id: 'flat', target: 'power-station', kind: 'battery-depleted' });
    advance(5);
    advance(5);
    const dead = plant.inspect('skylink-router').observation;
    const healthy = makePlant().plant.inspect('skylink-router').observation;
    expect(dead).not.toBe(healthy);
    expect(dead).not.toMatch(/nothing (stands out|looks wrong)/iu);
  });

  it('a partly seated power plug reads a lower voltage on the meter', () => {
    const base = makePlant().plant.measure('multimeter', 'strip:router').observation;
    const { plant } = makePlant();
    plant.injectFault({ id: 'seat', target: 'strip:router', kind: 'loose-nut' });
    const sagged = plant.measure('multimeter', 'strip:router').observation;
    const volts = (s: string): number => Number(/(\d+(?:\.\d+)?) V/u.exec(s)?.[1] ?? Number.NaN);
    if (Number.isFinite(volts(base)) && Number.isFinite(volts(sagged))) {
      expect(volts(sagged)).toBeLessThan(volts(base));
    } else {
      expect(sagged).not.toBe(base);
    }
  });

  it('exposes live values for UIs', () => {
    const { plant } = makePlant();
    expect(plant.getPartState('power-station')?.socPct).toBeGreaterThan(0);
    expect(plant.getPartState('power-station')?.loadW).toBeGreaterThan(0);
    expect(plant.getPartState('generator')?.fuelL).toBeGreaterThan(0);
    expect(plant.getLoopResistanceOhm('vsat-ifl')).toBeGreaterThan(0);
  });
});

describe('hand-verb honesty', () => {
  const ELECTRICAL = /live|volt|\bV (?:AC|DC)\b|\{v\}|\{nom\}|ohm|powered|signal|\bdB/iu;

  it('inspect, feel and wiggle lines state no electrical fact', () => {
    const bad: string[] = [];
    for (const [cls, text] of Object.entries(OBS_TABLE)) {
      for (const verb of ['inspect', 'feel', 'wiggle'] as const) {
        for (const [state, lines] of Object.entries(text?.[verb] ?? {})) {
          for (const line of lines ?? []) {
            if (ELECTRICAL.test(line)) {
              bad.push(`${cls}.${verb}.${state}: ${line}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
