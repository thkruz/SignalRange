/**
 * C6 battery-reserve margins. S2, S8, S9 and S11 use a rolling horizon and must clear the reserve after a 45 minute (2700 s)
 * allowance. S14 to S16 forecast to END OF SHIFT (a fixed scenario time): the correct arrangement keeps passing however slowly
 * the student works, the wrong arrangement fails at t = 0, and a late modem park (10 min on 170 W) still passes.
 */

import { forecastMeetsReserve, held } from '@app/campaigns/frontline/frontline-conditions';
import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { frontlineScenario8Data } from '@app/campaigns/frontline/scenario8';
import { frontlineScenario9Data } from '@app/campaigns/frontline/scenario9';
import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario14Data, S14_SHIFT_END_S } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data, S15_SHIFT_END_S } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data, S16_SHIFT_END_S } from '@app/campaigns/frontline/scenario16';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, conditionMet, tick } from './frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }), hasInstance: () => true, destroy: () => undefined },
}));

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1);
});
afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

interface Case {
  name: string;
  data: FrontlineScenarioData;
  allowanceS: number;
  correct?: Record<string, string>;
}

const ROLLING: Case[] = [
  { name: 'S2', data: frontlineScenario2Data, allowanceS: 2700, correct: { 'vsat-modem': 'standby' } },
  { name: 'S8', data: frontlineScenario8Data, allowanceS: 2700 },
  { name: 'S9', data: frontlineScenario9Data, allowanceS: 2700 },
  { name: 'S11', data: frontlineScenario11Data, allowanceS: 2700 },
];

describe.each(ROLLING)('$name reserve margin (rolling)', ({ data, allowanceS, correct }) => {
  it('still clears the reserve after 45 minutes on the correct arrangement', () => {
    const svc = bootScenario(data);
    for (const [part, mode] of Object.entries(correct ?? {})) {
      svc.plant.setPartMode(part, mode);
    }
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
    tick(allowanceS);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });
});

const SHIFT = [
  { name: 'S14', data: frontlineScenario14Data, shiftEndS: S14_SHIFT_END_S },
  { name: 'S15', data: frontlineScenario15Data, shiftEndS: S15_SHIFT_END_S },
  { name: 'S16', data: frontlineScenario16Data, shiftEndS: S16_SHIFT_END_S },
];
const WRONG = { 'vsat-modem': 'run' };

describe.each(SHIFT)('$name end-of-shift reserve', ({ data, shiftEndS }) => {
  it('is an end-of-shift basis whose horizon shrinks with the clock', () => {
    const svc = bootScenario(data);
    expect(svc.plant.forecast({}).horizonS).toBe(shiftEndS);
    tick(1000);
    expect(svc.plant.forecast({}).horizonS).toBe(shiftEndS - 1000);
  });

  it('keeps passing on the correct arrangement at t=0, 45 min, 90 min and just before shift end', () => {
    const svc = bootScenario(data);
    svc.plant.setPartMode('vsat-modem', 'standby');
    for (const at of [0, 2700, 5400, shiftEndS - 10]) {
      tick(at - Math.round(SimClock.scenarioElapsedMs() / 1000));
      expect(svc.plant.forecast({}).meetsReserve, `at ${at}s`).toBe(true);
    }
    // No cliff: the margin at shift end is the same wherever you look
    tick(10);
    expect(svc.plant.forecast({}).horizonS).toBe(0);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  it('fails the wrong arrangement at t = 0', () => {
    const svc = bootScenario(data);
    expect(svc.plant.forecast(WRONG).meetsReserve).toBe(false);
  });

  it('survives parking the modem 10 minutes late', () => {
    const svc = bootScenario(data);
    tick(600);
    svc.plant.setPartMode('vsat-modem', 'standby');
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
    tick(4800);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  it('held() condition is true on the correct arrangement and false again after switching to the wrong one later', () => {
    const svc = bootScenario(data);
    svc.plant.setPartMode('vsat-modem', 'standby');
    const cond = held(forecastMeetsReserve({}));
    tick(5400);
    expect(conditionMet(cond, svc)).toBe(true);
    expect(cond.mustMaintain).toBe(true);
    svc.plant.setPartMode('vsat-modem', 'run');
    expect(conditionMet(cond, svc)).toBe(false);
  });

  it('forecast survives a checkpoint round trip', () => {
    const svc = bootScenario(data);
    svc.plant.setPartMode('vsat-modem', 'standby');
    tick(3000);
    const before = svc.plant.forecast({});
    svc.plant.restoreState(svc.plant.getState());
    expect(svc.plant.forecast({})).toEqual(before);
  });
});

describe('S14 final arrangement (modem running, dish in standby)', () => {
  it('keeps the reserve to shift end after 10 min of both terminals running', () => {
    const svc = bootScenario(frontlineScenario14Data);
    tick(600);
    svc.plant.setPartMode('vsat-modem', 'run');
    svc.plant.setPartMode('skylink-dish', 'standby');
    tick(3);
    for (const at of [900, 2700, 5400, S14_SHIFT_END_S - 10]) {
      tick(at - Math.round(SimClock.scenarioElapsedMs() / 1000));
      expect(svc.plant.forecast({}).meetsReserve, `at ${at}s`).toBe(true);
    }
  });
});
