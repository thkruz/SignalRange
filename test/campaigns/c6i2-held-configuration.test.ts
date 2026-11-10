import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario14Data } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import { describe, expect, it } from 'vitest';

/**
 * Configuration conditions (part mode, reserve forecast, service support) must hold at the same moment.
 * Latched separately, a wrong arrangement could satisfy one at an earlier time and another at a later one.
 */
const CASES: Array<[string, { objectives: Array<{ id: string; conditions: Array<{ id?: string; mustMaintain?: boolean }> }> }, string[]]> = [
  ['S11', frontlineScenario11Data, ['s11-commission-terminal']],
  ['S14', frontlineScenario14Data, ['s14-select-readiness', 's14-handover-dual-service']],
  ['S15', frontlineScenario15Data, ['s15-maintain-supported-work']],
  ['S16', frontlineScenario16Data, ['s16-establish-configuration', 's16-verify-final-service']],
];

describe('C6 configuration conditions are held together', () => {
  for (const [name, data, ids] of CASES) {
    it(`${name} mode, forecast and support conditions are not latched`, () => {
      for (const id of ids) {
        const objective = data.objectives.find((o) => o.id === id);
        expect(objective, id).toBeDefined();
        const config = (objective?.conditions ?? []).filter((c) => /^c6:(modeIs|forecastMeetsReserve|anyServiceSupports)/u.test(c.id ?? ''));
        expect(config.length, id).toBeGreaterThan(0);
        for (const c of config) {
          expect(c.mustMaintain, `${id} ${c.id}`).toBe(true);
        }
      }
    });
  }
});
