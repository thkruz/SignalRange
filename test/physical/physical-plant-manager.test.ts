import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantEnvironment, PlantFault } from '@app/physical/physical-plant-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const STATION = 'gs1';

function baseConfig(overrides: Partial<PlantConfig> = {}): PlantConfig {
  return {
    stationId: STATION,
    parts: [
      { id: 'generator', kind: 'generator', ratedW: 1000, fuelL: 5, nominalV: 230 },
      { id: 'power-station', kind: 'battery', poweredBy: 'generator', maxOutputW: 500, socWh: 0, nominalV: 12, loadW: 20 },
      { id: 'spacey-router', kind: 'router', poweredBy: 'power-station', loadW: 15 },
      { id: 'spacey-dish', kind: 'terminal', poweredBy: 'spacey-router', viaCable: 'spacey-cable', loadW: 60 },
      { id: 'vsat-modem', kind: 'modem', poweredBy: 'power-station', loadW: 40 },
      { id: 'vsat-dish', kind: 'dish', poweredBy: 'vsat-modem', viaCable: 'vsat-ifl', loadW: 5 },
    ],
    cables: [
      {
        id: 'spacey-cable',
        lengthM: 25,
        cableType: 'power-data',
        carries: ['power', 'data'],
        from: 'spacey-router',
        to: 'spacey-dish',
      },
      { id: 'vsat-ifl', lengthM: 30, cableType: 'coax', carries: ['rf', 'power'], from: 'vsat-modem', to: 'vsat-dish', role: 'post-lna' },
    ],
    connectors: [
      { id: 'spacey-cable:dish', cableId: 'spacey-cable' },
      { id: 'spacey-cable:router', cableId: 'spacey-cable' },
      { id: 'vsat-feed', partId: 'vsat-dish', role: 'pre-lna' },
    ],
    ...overrides,
  };
}

function makePlant(config: PlantConfig = baseConfig(), seed = 1) {
  let t = 100;
  const env: PlantEnvironment = { windMps: 0, rainMmH: 0, ambientC: 15 };
  const streams = new Map<string, RngStream>();
  let plant: PhysicalPlantManager | null = null;
  const advance = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant?.update(1);
    }
  };
  plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: advance,
    env: () => env,
    rng: (name) => {
      let stream = streams.get(name);
      if (!stream) {
        stream = new RngStream(fnv1a(`${seed}:${name}`));
        streams.set(name, stream);
      }

      return stream;
    },
  });

  return { plant, env, advance, now: () => t };
}

const fault = (f: PlantFault): PlantFault => f;

describe('PhysicalPlantManager neutrality', () => {
  it('a healthy plant is exactly neutral', () => {
    const { plant, advance } = makePlant();
    advance(600);

    expect(plant.preLnaLossDb(STATION)).toBe(0);
    expect(plant.postLnaLossDb(STATION)).toBe(0);
    expect(plant.spaceyStatus()).toBe('online');
    expect(plant.isRfiPresent()).toBe(false);
    for (const id of ['generator', 'power-station', 'spacey-router', 'spacey-dish', 'vsat-modem', 'vsat-dish']) {
      expect(plant.isPartPowered(id)).toBe(true);
      expect(plant.isLinkDropped(id)).toBe(false);
    }
  });

  it('unknown ids are neutral', () => {
    const { plant } = makePlant();

    expect(plant.isPartPowered('nope')).toBe(true);
    expect(plant.isLinkDropped('nope')).toBe(false);
    expect(plant.preLnaLossDb('other-station')).toBe(0);
    expect(plant.inspect('nope').costSeconds).toBe(0);
  });
});

describe('connector faults', () => {
  it('partial seat: wiggle shows the shift and the plant reboots, reseat clears it and costs downtime', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'seat', target: 'spacey-cable:dish', kind: 'partial-seat' }));

    expect(plant.inspect('spacey-cable:dish').revealed).toBeUndefined();
    const wiggle = plant.wiggle('spacey-cable:dish');
    expect(wiggle.observation).toContain('shifts');
    expect(wiggle.revealed).toEqual(['seat']);
    // The dropout cut the power cable, so the dish is now rebooting
    expect(plant.isPartPowered('spacey-dish')).toBe(false);

    const reseat = plant.reseat('spacey-cable:dish');
    expect(reseat.cleared).toEqual(['seat']);
    expect(reseat.costSeconds).toBe(60);
    expect(reseat.downtimeSeconds).toBe(60 + 90);
    expect(plant.getFaults()).toHaveLength(0);

    advance(200);
    expect(plant.spaceyStatus()).toBe('online');
    expect(plant.isLinkDropped('spacey-dish')).toBe(false);
  });

  it('a loose nut is fixed by tightening, not by reseating', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'nut', target: 'vsat-feed', kind: 'loose-nut' }));

    expect(plant.feel('vsat-feed').observation).toContain('spins');
    expect(plant.reseat('vsat-feed').cleared).toBeUndefined();
    expect(plant.tighten('vsat-feed').cleared).toEqual(['nut']);
  });

  it('wind-triggered intermittent faults only fire in wind', () => {
    const { plant, env, advance } = makePlant();
    plant.injectFault(fault({ id: 'seat', target: 'spacey-cable:dish', kind: 'partial-seat', trigger: { windMps: '>5' } }));
    let dropsCalm = 0;
    for (let i = 0; i < 200; i++) {
      advance(1);
      dropsCalm += plant.isLinkDropped('spacey-dish') ? 1 : 0;
    }
    env.windMps = 12;
    let dropsWindy = 0;
    for (let i = 0; i < 200; i++) {
      advance(1);
      dropsWindy += plant.isLinkDropped('spacey-dish') ? 1 : 0;
    }

    expect(dropsCalm).toBe(0);
    expect(dropsWindy).toBeGreaterThan(0);
  });

  it('rain moisture on the feed adds pre-LNA loss until it is sealed', () => {
    const { plant, env } = makePlant();
    plant.injectFault(fault({ id: 'wet', target: 'vsat-feed', kind: 'moisture', trigger: { rainMmH: '>2' } }));

    expect(plant.preLnaLossDb(STATION)).toBe(0);
    env.rainMmH = 5;
    plant.setWeather({ rainMmH: 5 });
    expect(plant.preLnaLossDb(STATION)).toBe(4);
    expect(plant.inspect('vsat-feed').observation).toContain('water');

    expect(plant.seal('vsat-feed').cleared).toEqual(['wet']);
    expect(plant.preLnaLossDb(STATION)).toBe(0);
    // A sealed joint shrugs off a later moisture fault
    plant.injectFault(fault({ id: 'wet2', target: 'vsat-feed', kind: 'moisture' }));
    expect(plant.preLnaLossDb(STATION)).toBe(0);
  });

  it('corrosion and a bent pin need a connector kit', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'corr', target: 'vsat-feed', kind: 'corrosion', severity: 0.5 }));

    expect(plant.preLnaLossDb(STATION)).toBe(3);
    expect(plant.reseat('vsat-feed').cleared).toBeUndefined();
    const swap = plant.swap('vsat-feed');
    expect(swap.cleared).toEqual(['corr']);
    expect(plant.preLnaLossDb(STATION)).toBe(0);
    expect(plant.getSpares()['connector-kit']).toBe(0);
  });
});

describe('cable faults', () => {
  it('IFL water adds post-LNA loss; the cable tester reports the distance; swap fixes it', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'water', target: 'vsat-ifl', kind: 'cable-water', atMeters: 17 }));

    expect(plant.postLnaLossDb(STATION)).toBe(6);
    expect(plant.inspect('vsat-ifl').revealed).toEqual(['water']);
    const tester = plant.measure('cable-tester', 'vsat-ifl');
    expect(tester.observation).toContain('17 m');
    expect(tester.revealed).toEqual(['water']);

    const swap = plant.swap('vsat-ifl');
    expect(swap.cleared).toEqual(['water']);
    expect(plant.postLnaLossDb(STATION)).toBe(0);
  });

  it('a crushed IFL leaves the LNB unpowered', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'crush', target: 'vsat-ifl', kind: 'cable-crush', atMeters: 12 }));

    expect(plant.isPartPowered('vsat-dish')).toBe(false);
    expect(plant.isLinkDropped('vsat-dish')).toBe(true);
    expect(plant.measure('cable-tester', 'vsat-ifl').observation).toContain('12 m');
    plant.swap('vsat-ifl');
    expect(plant.isPartPowered('vsat-dish')).toBe(true);
  });

  it('a pinched cable is cleared by rerouting', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'pinch', target: 'spacey-cable', kind: 'cable-pinch', atMeters: 8 }));

    expect(plant.inspect('spacey-cable').observation).toContain('8 m');
    expect(plant.reroute('spacey-cable').cleared).toEqual(['pinch']);
  });

  it('authored cable damage and connector state become faults at construction', () => {
    const config = baseConfig();
    config.cables[1].damage = { kind: 'nick', atM: 9 };
    config.connectors[2].state = { seated: 'partial' };
    const { plant } = makePlant(config);

    expect(plant.getCableState('vsat-ifl')?.damage).toEqual({ kind: 'nick', atM: 9 });
    expect(plant.getConnectorState('vsat-feed')?.seated).toBe('partial');
    expect(plant.postLnaLossDb(STATION)).toBe(1.5);
    expect(plant.preLnaLossDb(STATION)).toBe(2);
  });
});

describe('power faults', () => {
  it('generator sag under load: multimeter shows low voltage, the dish browns out and reboots', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'sag', target: 'generator', kind: 'generator-sag', trigger: { loadW: '>100' } }));

    expect(plant.isPartPowered('spacey-dish')).toBe(false);
    expect(plant.spaceyStatus()).toBe('no-power');
    const meter = plant.measure('multimeter', 'spacey-router');
    expect(meter.observation).toContain('expected');
    expect(meter.revealed).toContain('sag');

    // Fixing it: power-cycle the generator (an outdoor item, so it opens a trip), then the dish boots
    const cycle = plant.powerCycle('generator');
    expect(cycle.cleared).toEqual(['sag']);
    expect(plant.isOutside()).toBe(true);
    advance(30);
    expect(['no-power', 'booting']).toContain(plant.spaceyStatus());
    advance(200);
    expect(plant.spaceyStatus()).toBe('online');
    expect(plant.isPartPowered('spacey-dish')).toBe(true);
    expect(plant.measure('multimeter', 'spacey-router').observation).not.toContain('expected');
  });

  it('a sag that clears by itself still reboots the dish', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'sag', target: 'generator', kind: 'generator-sag' }));
    plant.clearFault('sag');
    advance(35);

    expect(plant.spaceyStatus()).toBe('booting');
    advance(120);
    expect(plant.spaceyStatus()).toBe('online');
  });

  it('a dead brick cuts the router and swapping it uses the brick spare', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'brick', target: 'spacey-router', kind: 'brick-dead' }));

    expect(plant.isPartPowered('spacey-router')).toBe(false);
    expect(plant.spaceyStatus()).toBe('no-power');
    expect(plant.swap('spacey-router').cleared).toEqual(['brick']);
    expect(plant.getSpares()['power-brick']).toBe(0);
    advance(200);
    expect(plant.spaceyStatus()).toBe('online');
  });

  it('a flat battery with a dead generator takes everything down', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'fuel', target: 'generator', kind: 'out-of-fuel' }));

    expect(plant.isPartPowered('vsat-modem')).toBe(false);
    expect(plant.isPartPowered('vsat-dish')).toBe(false);
  });

  it('inverter noise raises the RFI flag', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'noise', target: 'generator', kind: 'generator-noise' }));

    expect(plant.isRfiPresent()).toBe(true);
  });

  it('a cold battery derates and browns out under load', () => {
    const config = baseConfig();
    config.parts[1] = { ...config.parts[1], socWh: 400, capacityWh: 500, maxOutputW: 120 };
    const { plant, env, advance } = makePlant(config);
    expect(plant.isPartPowered('spacey-dish')).toBe(true);

    env.ambientC = -10;
    advance(1);
    expect(plant.isPartPowered('spacey-dish')).toBe(false);
  });
});

describe('dish status', () => {
  it('snow and netting obstruct the dish until cleared', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'snow', target: 'spacey-dish', kind: 'snow' }));
    expect(plant.spaceyStatus()).toBe('obstructed');
    expect(plant.clearSnow('spacey-dish').cleared).toEqual(['snow']);
    expect(plant.spaceyStatus()).toBe('online');

    plant.injectFault(fault({ id: 'net', target: 'spacey-dish', kind: 'net' }));
    expect(plant.spaceyStatus()).toBe('obstructed');
    plant.removeNet('spacey-dish');
    expect(plant.spaceyStatus()).toBe('online');
  });

  it('heat drives heating and thermal shutdown', () => {
    const { plant, env } = makePlant();
    env.ambientC = 47;
    expect(plant.spaceyStatus()).toBe('heating');
    env.ambientC = 58;
    expect(plant.spaceyStatus()).toBe('thermal-shutdown');
  });

  it('a timed fault is dormant until its time', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'late', target: 'vsat-feed', kind: 'corrosion', trigger: { atSeconds: 150 } }));

    expect(plant.preLnaLossDb(STATION)).toBe(0);
    advance(60);
    expect(plant.preLnaLossDb(STATION)).toBe(6);
  });
});

describe('spares, trips and the action log', () => {
  it('swap consumes a spare and fails when none are left', () => {
    const { plant } = makePlant();
    plant.injectFault(fault({ id: 'a', target: 'vsat-ifl', kind: 'cable-nick' }));
    expect(plant.getSpares()['cable:coax']).toBe(1);
    expect(plant.swap('vsat-ifl').cleared).toEqual(['a']);
    expect(plant.getSpares()['cable:coax']).toBe(0);

    plant.injectFault(fault({ id: 'b', target: 'vsat-ifl', kind: 'cable-nick' }));
    const second = plant.swap('vsat-ifl');
    expect(second.observation).toMatch(/none of those left|Empty for that item|No spare/u);
    expect(second.cleared).toBeUndefined();
    expect(second.costSeconds).toBe(0);
    expect(plant.postLnaLossDb(STATION)).toBe(1.5);
    expect(plant.getReport().sparesUsed).toEqual(['cable:coax']);
  });

  it('the trainer override wins over scenario spares, which win over the defaults', () => {
    const fixed = makePlant(baseConfig({ spares: { 'connector-kit': 3, 'power-brick': 2 } })).plant;
    expect(fixed.getSpares()).toEqual({ 'connector-kit': 3, 'power-brick': 2 });
    fixed.setSpares({ 'connector-kit': 0 });
    expect(fixed.getSpares()).toEqual({ 'connector-kit': 0, 'power-brick': 2 });

    const open = makePlant().plant;
    open.setSpares({ 'connector-kit': 0 });
    expect(open.swap('vsat-feed').observation).toMatch(/none of those left|Empty for that item|No spare/u);
  });

  it('trips open on outdoor verbs, close indoors, and the instructor spots too many', () => {
    const { plant } = makePlant(baseConfig({ tripLimit: 1 }));
    plant.inspect('vsat-feed');
    plant.feel('vsat-feed');
    expect(plant.getReport().trips).toBe(1);
    expect(plant.isOutside()).toBe(true);

    plant.returnInside();
    expect(plant.isOutside()).toBe(false);
    expect(plant.getReport().spotted).toBe(false);

    plant.inspect('vsat-feed');
    expect(plant.getReport().trips).toBe(2);
    expect(plant.getReport().spotted).toBe(true);
    expect(plant.getLog().some((entry) => entry.verb === 'spotted')).toBe(true);

    plant.powerCycle('spacey-router');
    expect(plant.isOutside()).toBe(false);
  });

  it('logs ineffective actions and the time to the first correct one', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'seat', target: 'spacey-cable:dish', kind: 'partial-seat' }));
    advance(100);

    plant.tighten('vsat-feed');
    plant.seal('vsat-feed');
    expect(plant.getReport().ineffectiveActions).toBe(2);
    expect(plant.getReport().firstCorrectActionS).toBeNull();

    plant.reseat('spacey-cable:dish');
    const report = plant.getReport();
    expect(report.ineffectiveActions).toBe(2);
    expect(report.firstCorrectActionS).toBe(100 + 30 + 120 + 60);
    expect(report.downtimeS).toBeGreaterThan(0);
    const log = plant.getLog();
    expect(log.map((e) => e.effective)).toEqual([false, false, true]);
  });
});

describe('checkpointing and determinism', () => {
  it('getState/restoreState round-trips', () => {
    const { plant, advance } = makePlant();
    plant.injectFault(fault({ id: 'seat', target: 'spacey-cable:dish', kind: 'partial-seat' }));
    plant.injectFault(fault({ id: 'water', target: 'vsat-ifl', kind: 'cable-water', atMeters: 4 }));
    plant.wiggle('spacey-cable:dish');
    plant.swap('vsat-ifl');
    advance(37);
    const saved = plant.getState();
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);

    plant.reseat('spacey-cable:dish');
    plant.injectFault(fault({ id: 'x', target: 'vsat-feed', kind: 'corrosion' }));
    advance(50);
    expect(plant.getState()).not.toEqual(saved);

    plant.restoreState(saved);
    expect(plant.getState()).toEqual(saved);
    expect(plant.getFaults().map((f) => f.id)).toEqual(['seat']);
    expect(plant.getSpares()['cable:coax']).toBe(0);
  });

  it('intermittent faults are deterministic for a fixed seed', () => {
    const run = (seed: number): boolean[] => {
      const { plant, advance } = makePlant(baseConfig(), seed);
      plant.injectFault(fault({ id: 'seat', target: 'spacey-cable:dish', kind: 'partial-seat' }));
      const timeline: boolean[] = [];
      for (let i = 0; i < 300; i++) {
        advance(1);
        timeline.push(plant.isLinkDropped('spacey-dish'));
      }

      return timeline;
    };

    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
    expect(run(7).some(Boolean)).toBe(true);
  });
});

describe('PhysicalPlantManager UI queries', () => {
  it('reports the trip limit, environment and part ids', () => {
    const { plant, env } = makePlant(baseConfig({ tripLimit: 5 }));
    env.windMps = 7;

    expect(plant.getTripLimit()).toBe(5);
    expect(plant.getEnvironment()).toEqual({ windMps: 7, rainMmH: 0, ambientC: 15 });
    expect(plant.getPartIds()).toContain('spacey-dish');
    expect(plant.getConnectorIds()).toContain('vsat-feed');
    expect(plant.getCableIds()).toEqual(['spacey-cable', 'vsat-ifl']);
    expect(plant.getLabel('spacey-dish')).toBe('spacey-dish');
  });
});

describe('PhysicalPlantManager load, time and reset queries', () => {
  it('reports the load only while powered, and the scenario time', () => {
    const { plant } = makePlant();

    expect(plant.getLoadW('spacey-dish')).toBe(60);
    plant.injectFault({ id: 'b', target: 'spacey-dish', kind: 'brick-dead' });
    expect(plant.getLoadW('spacey-dish')).toBe(0);
    expect(plant.getTimeSeconds()).toBe(100);
  });

  it('reset returns to the authored plant', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'x', target: 'vsat-feed', kind: 'unseated' });
    plant.clearSnow('spacey-dish');
    plant.reset();

    expect(plant.getFaults()).toEqual([]);
    expect(plant.isOutside()).toBe(false);
    expect(plant.getLog()).toEqual([]);
    expect(plant.getConnectorState('vsat-feed')?.seated).toBe('full');
  });
});
