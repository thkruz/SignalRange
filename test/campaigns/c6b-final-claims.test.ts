/**
 * Campaign 6 gap B: the authored final claims. Every current-certification row names a form that opts
 * in, and every opted-in form is used by exactly the final claim (historical rows stay handoverValid).
 */

import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario7Data } from '@app/campaigns/frontline/scenario7';
import { frontlineScenario12Data } from '@app/campaigns/frontline/scenario12';
import { frontlineScenario14Data } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import { describe, expect, it } from 'vitest';

const SCENARIOS: Array<[string, FrontlineScenarioData, string[]]> = [
  ['S7', frontlineScenario7Data as FrontlineScenarioData, ['acceptance']],
  ['S12', frontlineScenario12Data as FrontlineScenarioData, ['incident-update']],
  ['S14', frontlineScenario14Data as FrontlineScenarioData, ['dual-handover']],
  ['S16', frontlineScenario16Data as FrontlineScenarioData, ['outcome', 'final']],
];

describe('C6 gap B: authored final claims', () => {
  for (const [name, data, forms] of SCENARIOS) {
    it(`${name}: final forms opt in and their rows hold until the objective completes`, () => {
      const authored = data.settings?.physicalPlant?.handovers ?? [];
      const rows = (data.objectives ?? []).flatMap((o) => o.conditions);
      for (const id of forms) {
        const form = authored.find((f) => f.id === id);
        expect(form?.certification, `${name} ${id}`).toBeDefined();
        const current = rows.filter((c) => c.id === `c6:handoverCurrent:${id}`);
        expect(current, `${name} ${id}`).toHaveLength(1);
        expect(current[0].maintainUntilObjectiveComplete).toBe(true);
        expect(rows.some((c) => c.id === `c6:handoverValid:${id}`)).toBe(false);
      }
      // No other form of the scenario is certified by accident
      expect(authored.filter((f) => f.certification).map((f) => f.id)).toEqual(forms);
    });
  }
});
