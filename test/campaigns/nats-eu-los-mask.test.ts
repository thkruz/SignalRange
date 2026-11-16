/**
 * nats-eu LOS rows at the 5 deg mask (issue 297).
 *
 * A 'Pass Over (LOS)' row with phase 'set' latches at the satellite's
 * receivable elevation (0 deg), about a minute after the 5 deg LOS time. Every nats-eu scenario with a pass objective judges its LOS row at the 5 deg
 * mask and gives the 5 deg time in its copy, so all eight rows must be
 * 'setting-below' at >= 5 deg and must exist.
 */

import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { describe, expect, it } from 'vitest';

const MIN_LOS_ELEVATION_DEG = 5;
const FIVE_DEG_SCENARIOS = [1, 8, 9, 11, 12, 15, 18, 20];

function passPhaseConditions(scenarioNumber: number) {
  const scenario = natsEuCampaignData.scenarios.find((s) => s.number === scenarioNumber);
  expect(scenario, `scenario ${scenarioNumber} exists`).toBeDefined();
  const rows: { id: string; description: string; phase: unknown; elevation: unknown }[] = [];
  for (const objective of scenario?.objectives ?? []) {
    for (const condition of objective.conditions) {
      if (condition.type !== 'satellite-pass-phase') continue;
      rows.push({
        id: objective.id,
        description: condition.description ?? '',
        phase: condition.params?.phase,
        elevation: condition.params?.elevation,
      });
    }
  }
  return rows;
}

describe('nats-eu LOS rows at the 5 deg mask', () => {
  for (const number of FIVE_DEG_SCENARIOS) {
    it(`scenario ${number}: LOS rows exist and are setting-below >= ${MIN_LOS_ELEVATION_DEG} deg`, () => {
      const los = passPhaseConditions(number).filter((r) => r.description.includes('(LOS)'));
      expect(los.length, 'LOS rows present').toBeGreaterThan(0);
      const offenders = los.filter((r) => !(r.phase === 'setting-below' && typeof r.elevation === 'number' && r.elevation >= MIN_LOS_ELEVATION_DEG));
      expect(offenders.map((r) => `${r.id}: ${r.description} (${String(r.phase)}, ${String(r.elevation)})`)).toEqual([]);
    });
  }
});
