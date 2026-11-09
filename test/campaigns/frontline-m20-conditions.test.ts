/**
 * M20 condition factories: siteChecked, faultEvidenceRecorded, chargingRestored, anyServiceSupports.
 * Each is false without a plant and flips with the player's actions.
 */

import { CAMP_SERVICES, OLA_VOICE_CARD } from '@app/campaigns/frontline/camp-field-config';
import { anyServiceSupports, chargingRestored, faultEvidenceRecorded, siteChecked } from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, tick } from './frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const met = (c: { params?: { evaluator?: unknown } }): boolean => (c.params as { evaluator: () => boolean }).evaluator();

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(5);
  objectives.states.clear();
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

describe('M20 condition factories', () => {
  it('are all false without a plant', () => {
    PhysicalPlantService.destroy();
    expect(met(siteChecked(['generator']))).toBe(false);
    expect(met(faultEvidenceRecorded('f'))).toBe(false);
    expect(met(chargingRestored())).toBe(false);
    expect(met(anyServiceSupports('ola-voice', CAMP_SERVICES))).toBe(false);
  });

  it('siteChecked needs a test observation for every target, not just any entry', () => {
    const svc = bootScenario(frontlineScenario2Data);
    const cond = siteChecked(['power-station', 'power-strip']);
    expect(met(cond)).toBe(false);
    svc.plant.inspect('power-station');
    expect(met(cond)).toBe(false);
    svc.plant.inspect('power-strip');
    expect(met(cond)).toBe(true);
  });

  it('faultEvidenceRecorded waits for the fault and an observation that revealed it', () => {
    const svc = bootScenario(frontlineScenario2Data);
    const cond = faultEvidenceRecorded('s2-generator-seat');
    expect(met(cond)).toBe(false);
    objectives.states.set('s2-respond-to-outage', { isActive: true, isCompleted: false });
    tick();
    expect(met(cond)).toBe(false);
    svc.plant.goOutside();
    svc.plant.inspect('generator:out');
    svc.plant.wiggle('generator:out');
    expect(met(cond)).toBe(true);
  });

  it('chargingRestored follows the charge power of a real supply loss', () => {
    const svc = bootScenario(frontlineScenario2Data);
    const cond = chargingRestored();
    expect(met(cond)).toBe(true);
    svc.plant.injectFault({ id: 'unplugged', target: 'generator:out', kind: 'unseated' });
    tick();
    expect(met(cond)).toBe(false);
    svc.plant.goOutside();
    svc.plant.reseat('generator:out');
    tick();
    expect(met(cond)).toBe(true);
  });

  it('anyServiceSupports reads the card against each service right now', () => {
    const svc = bootScenario(frontlineScenario2Data);
    const cond = anyServiceSupports(OLA_VOICE_CARD.id, CAMP_SERVICES);
    expect(met(cond)).toBe(true);
    svc.plant.setPartMode('spacey-dish', 'standby');
    expect(met(cond)).toBe(false);
    svc.plant.setPartMode('spacey-dish', 'run');
    expect(met(cond)).toBe(true);
    expect(met(anyServiceSupports(OLA_VOICE_CARD.id, ['camp-vsat']))).toBe(false);
  });
});
