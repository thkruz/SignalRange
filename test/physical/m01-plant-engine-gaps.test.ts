/**
 * M01 plant engine gaps: generator off/run with startup (A), multimeter jitter and
 * normal band (B), no-supply hint (C). All opt-in; a config without the fields behaves as before.
 */

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantFault } from '@app/physical/physical-plant-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

interface Rig {
  plant: PhysicalPlantManager;
  now: () => number;
  streamsAsked: Set<string>;
  tick: (seconds: number) => void;
}

function baseConfig(extra: Partial<PlantConfig> = {}, fuelL = 5, faults: PlantFault[] = []): PlantConfig {
  return {
    parts: [
      {
        id: 'generator',
        kind: 'generator',
        label: 'Generator',
        ratedW: 2000,
        running: true,
        fuelL,
        tankL: 7,
        nominalV: 230,
        modes: [
          { id: 'off', label: 'Off', loadW: 0 },
          { id: 'run', label: 'Run', loadW: 0, startupS: 40 },
        ],
      },
      { id: 'power-station', kind: 'battery', label: 'Power station', poweredBy: 'generator', capacityWh: 1000, socWh: 0, maxOutputW: 600, nominalV: 12, loadW: 10 },
      { id: 'power-strip', kind: 'strip', label: 'Power strip', poweredBy: 'power-station', loadW: 0, nominalV: 12 },
      { id: 'spacey-router', kind: 'router', label: 'SpaceY router', poweredBy: 'power-strip', loadW: 20, nominalV: 12 },
    ],
    connectors: [{ id: 'strip:router', partId: 'power-strip', feeds: 'spacey-router' }],
    cables: [],
    faults,
    ...extra,
  };
}

function makeRig(config: PlantConfig): Rig {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const streamsAsked = new Set<string>();
  let plant: PhysicalPlantManager;
  const tick = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant.update(1);
    }
  };
  plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      streamsAsked.add(name);
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`m01:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });

  return { plant, now: () => t, streamsAsked, tick };
}

const firstVolts = (text: string): number => Number(/(\d+\.\d) V/u.exec(text)?.[1] ?? Number.NaN);

describe('M01 gap A: generator off and run', () => {
  it('off cuts the supply downstream and run restores it after startupS', () => {
    const { plant, tick } = makeRig(baseConfig());
    expect(plant.isPartPowered('spacey-router')).toBe(true);
    expect(plant.getPartMode('generator')).toBe('run');

    const off = plant.setPartMode('generator', 'off');
    expect(off.costSeconds).toBe(20);
    expect(plant.getPartMode('generator')).toBe('off');
    expect(plant.getPartState('generator')?.mode).toBe('off');
    expect(plant.isPartPowered('power-station')).toBe(false);
    expect(plant.isPartPowered('spacey-router')).toBe(false);

    const run = plant.setPartMode('generator', 'run');
    expect(run.costSeconds).toBe(20);
    expect(plant.getPartMode('generator')).toBe('run');
    expect(plant.isStarting('generator')).toBe(true);
    expect(plant.getPartState('generator')?.starting).toBe(true);
    expect(plant.isGeneratorRunning()).toBe(false);
    expect(plant.isPartPowered('power-station')).toBe(false);

    tick(30);
    expect(plant.isStarting('generator')).toBe(true);
    tick(15);
    expect(plant.isStarting('generator')).toBe(false);
    expect(plant.isGeneratorRunning()).toBe(true);
    expect(plant.isPartPowered('power-station')).toBe(true);
    // The router still boots after regaining supply
    tick(40);
    expect(plant.isPartPowered('spacey-router')).toBe(true);
  });

  it('no fuel: the start fails with a line, costs time and the generator stays dead', () => {
    const { plant, tick, now } = makeRig(baseConfig({}, 0));
    const before = now();
    plant.setPartMode('generator', 'off');
    const res = plant.setPartMode('generator', 'run');
    expect(res.observation).toContain('does not catch');
    expect(res.costSeconds).toBe(20);
    expect(now() - before).toBe(40);
    tick(120);
    expect(plant.isGeneratorRunning()).toBe(false);
    expect(plant.isPartPowered('power-station')).toBe(false);
  });

  it('a dry generator that is still switched on can be stopped, and repeats are free refusals', () => {
    const { plant } = makeRig(baseConfig({}, 0));
    expect(plant.setPartMode('generator', 'run').observation).toContain('does not catch');
    const stop = plant.setPartMode('generator', 'off');
    expect(stop.costSeconds).toBe(20);
    const again = plant.setPartMode('generator', 'off');
    expect(again.costSeconds).toBe(0);
    expect(plant.getLog().filter((e) => e.verb === 'setMode')).toHaveLength(2);
  });

  it('refuses unknown modes and parts without modes at no cost', () => {
    const { plant } = makeRig(baseConfig());
    expect(plant.setPartMode('generator', 'turbo').costSeconds).toBe(0);
    expect(plant.setPartMode('spacey-router', 'run').costSeconds).toBe(0);
    expect(plant.verbApplies('setMode', 'generator')).toBe(true);
    expect(plant.verbApplies('setMode', 'spacey-router')).toBe(false);
    // Sandbox generator has no modes: the verb does not apply there
    const sandbox = makeRig(frontlinePlantConfig);
    expect(sandbox.plant.verbApplies('setMode', 'generator')).toBe(false);
    expect(sandbox.plant.getPartState('generator')?.mode).toBeUndefined();
    expect(sandbox.plant.setPartMode('generator', 'off').costSeconds).toBe(0);
  });

  it('inspect reads cranking during startup and the switch-off line when off', () => {
    const { plant } = makeRig(baseConfig());
    plant.setPartMode('generator', 'off');
    expect(plant.inspect('generator').observation).toContain('switch is off');
    plant.setPartMode('generator', 'run');
    expect(plant.inspect('generator').observation).toContain('cranking');
  });

  it('startup and run state survive a checkpoint', () => {
    const rig = makeRig(baseConfig());
    rig.plant.setPartMode('generator', 'off');
    rig.plant.setPartMode('generator', 'run');
    const state = rig.plant.getState();
    expect(state.startingUntilS?.generator).toBeGreaterThan(rig.now());

    const other = makeRig(baseConfig());
    other.plant.restoreState(state);
    expect(other.plant.getPartMode('generator')).toBe('run');
    expect(other.plant.isStarting('generator')).toBe(true);
  });
});

describe('M01 gap B: meter jitter and normal band', () => {
  const meter = { jitterPct: 1.5, normalBandPct: 5 };

  it('500 healthy reads stay inside the band and actually vary', () => {
    const { plant } = makeRig(baseConfig({ meter }));
    const band = plant.getMeterBand('power-station');
    expect(band).toEqual({ minV: 11.4, maxV: 12.6 });
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = firstVolts(plant.measure('multimeter', 'power-station').observation);
      expect(v).toBeGreaterThanOrEqual(band?.minV ?? 0);
      expect(v).toBeLessThanOrEqual(band?.maxV ?? 0);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('every partial-seat read sits below the band', () => {
    const faults: PlantFault[] = [{ id: 'f1', target: 'strip:router', kind: 'partial-seat' }];
    const { plant } = makeRig(baseConfig({ meter }, 5, faults));
    // Fill the battery so the strip feeds from it and the read shows 12 V
    const band = plant.getMeterBand('power-strip');
    let counted = 0;
    for (let i = 0; i < 200; i++) {
      const text = plant.measure('multimeter', 'strip:router').observation;
      expect(firstVolts(text)).toBeLessThan(band?.minV ?? 0);
      counted++;
    }
    expect(counted).toBe(200);
  });

  it('0 V stays exactly 0.0', () => {
    const { plant } = makeRig(baseConfig({ meter }));
    plant.setPartMode('generator', 'off');
    for (let i = 0; i < 50; i++) {
      expect(plant.measure('multimeter', 'power-station').observation).toContain('0.0 V');
    }
    expect(firstVolts(plant.measure('multimeter', 'generator').observation)).toBe(0);
  });

  it('without a meter config no jitter is drawn and readings are the model value', () => {
    const { plant, streamsAsked } = makeRig(baseConfig());
    expect(plant.getMeterBand('power-station')).toBeNull();
    const first = plant.measure('multimeter', 'power-station').observation;
    const second = plant.measure('multimeter', 'power-station').observation;
    expect(first).toContain('12.0 V');
    expect(second).toContain('12.0 V');
    expect(streamsAsked.has('plant:meter')).toBe(false);
  });
});

describe('M01 gap C: supply hint', () => {
  function readRouter(hint?: 'feeder' | 'generic' | 'off'): string {
    const { plant } = makeRig(baseConfig(hint ? { supplyHint: hint } : {}));
    plant.setPartMode('generator', 'off');

    return plant.measure('multimeter', 'spacey-router').observation;
  }

  it('off (and absent) adds nothing to a 0 V reading', () => {
    const plain = readRouter();
    expect(plain).toContain('0.0 V');
    expect(readRouter('off')).not.toContain('upstream');
    expect(plain).not.toContain('fed from');
    expect(plain).not.toContain('upstream');
  });

  it('feeder names the feeding part', () => {
    expect(readRouter('feeder')).toContain('fed from the power strip');
  });

  it('generic says upstream and never names the feeder', () => {
    const text = readRouter('generic');
    expect(text).toContain('upstream');
    expect(text.toLowerCase()).not.toContain('power strip');
  });

  it('a dead source gets a source line in either mode, and a healthy reading gets none', () => {
    const { plant } = makeRig(baseConfig({ supplyHint: 'feeder' }));
    expect(plant.measure('multimeter', 'power-station').observation).not.toContain('fed from');
    plant.setPartMode('generator', 'off');
    expect(plant.measure('multimeter', 'generator').observation).toContain('source');
  });
});
