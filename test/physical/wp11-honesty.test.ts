/**
 * C6 WP11: the close-up is honest. Regions act on what they depict, facts are
 * revealed per target, strings report observations, and the cheap refusals
 * cost nothing.
 */

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { CLOSEUPS } from '@app/campaigns/frontline/site-hotspots';
import { GENERIC_OBS } from '@app/physical/observation-text';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function makePlant() {
  let t = 100;
  const streams = new Map<string, RngStream>();
  let plant: PhysicalPlantManager | null = null;
  const advance = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant?.update(1);
    }
  };
  plant = new PhysicalPlantManager(frontlinePlantConfig, {
    now: () => t,
    skip: advance,
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`wp11:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });

  return { plant, advance };
}

describe('connectors for the power path', () => {
  it('every new connector exists, with its own verbs', () => {
    const { plant } = makePlant();
    for (const id of ['generator:out', 'ps:in', 'ps:ac-out', 'ps:dc-out', 'strip:in', 'strip:router', 'strip:modem', 'router:dc', 'modem:dc']) {
      expect(plant.getConnectorIds(), id).toContain(id);
      expect(plant.verbApplies('reseat', id), id).toBe(true);
      expect(plant.verbApplies('multimeter', id), id).toBe(true);
      expect(plant.verbApplies('cable-tester', id), id).toBe(false);
      expect(plant.verbApplies('tighten', id), id).toBe(false);
    }
  });

  it('an unseated strip socket drops only the device on it', () => {
    const { plant, advance } = makePlant();
    advance(300);
    expect(plant.isPartPowered('spacey-router')).toBe(true);
    expect(plant.isPartPowered('vsat-modem')).toBe(true);
    plant.injectFault({ id: 'u', target: 'strip:router', kind: 'unseated' });
    advance(3);
    expect(plant.isPartPowered('spacey-router')).toBe(false);
    expect(plant.isPartPowered('vsat-modem')).toBe(true);
    expect(plant.reseat('strip:router').cleared).toEqual(['u']);
  });

  it('an unseated strip input plug drops both devices', () => {
    const { plant, advance } = makePlant();
    advance(300);
    plant.injectFault({ id: 'u', target: 'strip:in', kind: 'unseated' });
    advance(3);
    expect(plant.isPartPowered('spacey-router')).toBe(false);
    expect(plant.isPartPowered('vsat-modem')).toBe(false);
  });

  it('exposes a lit state that follows power', () => {
    const { plant, advance } = makePlant();
    advance(300);
    expect(plant.getPartState('spacey-router')?.lit).toBe(true);
    plant.injectFault({ id: 'u', target: 'router:dc', kind: 'unseated' });
    advance(3);
    expect(plant.getPartState('spacey-router')?.lit).toBe(false);
  });
});

describe('facts are revealed per target', () => {
  it('inspecting a connector with corrosion reveals only that fact, and only there', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'c', target: 'spacey-cable:router', kind: 'corrosion' });
    expect(plant.isFactRevealed('spacey-cable:router', 'corrosion')).toBe(false);
    plant.inspect('spacey-cable:router');
    expect(plant.isFactRevealed('spacey-cable:router', 'corrosion')).toBe(true);
    expect(plant.isFactRevealed('spacey-cable:dish', 'corrosion')).toBe(false);
    expect(plant.isFactRevealed('spacey-cable:router', 'moisture')).toBe(false);
  });

  it('a hand look at a water-filled cable shows no damage; the cable tester does', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'w', target: 'spacey-cable', kind: 'cable-water', atMeters: 10 });
    plant.inspect('spacey-cable');
    expect(plant.isFactRevealed('spacey-cable', 'damage')).toBe(false);
    plant.measure('cable-tester', 'spacey-cable');
    expect(plant.isFactRevealed('spacey-cable', 'damage')).toBe(true);
  });

  it('the multimeter reading does not name a cause', () => {
    const { plant } = makePlant();
    plant.injectFault({ id: 'c', target: 'spacey-cable:router', kind: 'corrosion' });
    const text = plant.measure('cable-tester', 'spacey-cable:router').observation;
    expect(text).not.toMatch(/corroded|water|fixed/iu);
  });
});

describe('cheap refusals cost nothing', () => {
  it('refuel on a full tank explains at 0 s and logs nothing', () => {
    const { plant } = makePlant();
    const before = plant.getReport().ineffectiveActions;
    const result = plant.refuel('generator');
    expect(result.costSeconds).toBe(0);
    expect(result.observation).toMatch(/nearly full/iu);
    expect(plant.getReport().ineffectiveActions).toBe(before);
    expect(plant.getReport().downtimeS).toBe(0);
  });

  it('swap with no spare says so at 0 s', () => {
    const { plant } = makePlant();
    plant.setSpares({ 'connector-kit': 0 });
    const result = plant.swap('vsat-feed');
    expect(GENERIC_OBS['no-spare']).toContain(result.observation);
    expect(result.costSeconds).toBe(0);
  });
});

describe('close-up regions are honest', () => {
  it('no two regions in a close-up share a target unless their affordances differ', () => {
    for (const def of Object.values(CLOSEUPS)) {
      const seen = new Map<string, boolean>();
      for (const r of def.regions) {
        if (seen.has(r.target)) {
          expect(r.affordances !== undefined, `${def.id}/${r.id}`).toBe(true);
        }
        seen.set(r.target, r.affordances !== undefined);
      }
    }
  });

  it('the generator cap offers refuel and not the body verbs', () => {
    const cap = CLOSEUPS.generator.regions.find((r) => r.id === 'cu-gen-fuel');
    expect(cap?.affordances).toContain('refuel');
    expect(cap?.affordances).not.toContain('powerCycle');
    const body = CLOSEUPS.generator.regions.find((r) => r.id === 'cu-generator');
    expect(body?.affordances).not.toContain('refuel');
  });
});
