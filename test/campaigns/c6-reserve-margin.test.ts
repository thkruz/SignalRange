/**
 * C6 battery-reserve margins: a student may spend 45 minutes (2700 s) of scenario time on the correct arrangement and the
 * planning forecast must still clear the reserve; the wrong arrangement must still fail it at t = 0. S14 to S16 derive their
 * start charge from the allowance; S2, S8, S9 and S11 already clear it and are pinned here so a later edit cannot thin them.
 */

import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { frontlineScenario8Data } from '@app/campaigns/frontline/scenario8';
import { frontlineScenario9Data } from '@app/campaigns/frontline/scenario9';
import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario14Data, S14_PLANNING_ALLOWANCE_S } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data, S15_PLANNING_ALLOWANCE_S } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data, S16_PLANNING_ALLOWANCE_S } from '@app/campaigns/frontline/scenario16';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, tick } from './frontline-completion-support';

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
  /** Correct arrangement; undefined leaves the scenario's own starting arrangement */
  correct?: Record<string, string>;
  /** Wrong arrangement that must fail the reserve at t = 0; undefined when the scenario starts correct */
  wrong?: Record<string, string>;
}

const CASES: Case[] = [
  { name: 'S2', data: frontlineScenario2Data, allowanceS: 2700, correct: { 'vsat-modem': 'standby' } },
  { name: 'S8', data: frontlineScenario8Data, allowanceS: 2700 },
  { name: 'S9', data: frontlineScenario9Data, allowanceS: 2700 },
  { name: 'S11', data: frontlineScenario11Data, allowanceS: 2700 },
  { name: 'S14', data: frontlineScenario14Data, allowanceS: S14_PLANNING_ALLOWANCE_S, correct: { 'vsat-modem': 'standby' }, wrong: { 'vsat-modem': 'run' } },
  { name: 'S15', data: frontlineScenario15Data, allowanceS: S15_PLANNING_ALLOWANCE_S, correct: { 'vsat-modem': 'standby' }, wrong: { 'vsat-modem': 'run' } },
  { name: 'S16', data: frontlineScenario16Data, allowanceS: S16_PLANNING_ALLOWANCE_S, correct: { 'vsat-modem': 'standby' }, wrong: { 'vsat-modem': 'run' } },
];

describe.each(CASES)('$name reserve margin', ({ data, allowanceS, correct, wrong }) => {
  it('is a 45-minute allowance', () => {
    expect(allowanceS).toBe(2700);
  });

  it('still clears the reserve after the allowance on the correct arrangement', () => {
    const svc = bootScenario(data);
    for (const [part, mode] of Object.entries(correct ?? {})) {
      svc.plant.setPartMode(part, mode);
    }
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
    tick(allowanceS);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  if (wrong) {
    it('fails the reserve at t = 0 on the wrong arrangement', () => {
      const svc = bootScenario(data);
      expect(svc.plant.forecast(wrong).meetsReserve).toBe(false);
    });
  }
});
