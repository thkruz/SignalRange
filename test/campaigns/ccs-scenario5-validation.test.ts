/**
 * ccs Scenario 5 "Ranging Pass" (phase 18 E) - wiring, the ranging config,
 * the GEO burn it is built around, and the objective chain. The flown arc is
 * proven by the Playwright spec.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TALON2_TLE } from '@app/campaigns/ccs/satellites';
import { ccsScenario5Data } from '@app/campaigns/ccs/scenario5';
import { ccsCampaignData } from '@app/campaigns/nats/campaign-data';
import { SCENARIOS } from '@app/scenario-manager';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const objectivesManagerSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objectives-manager.ts'), 'utf8');
const niceCatalog = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] };

const settings = ccsScenario5Data.settings as unknown as {
  commanding: { windowStartS: number; windowEndS: number; ranging: { requiredMeasurements: number; toneId?: string } };
  spaceEvents: Array<{ id: string; satelliteNoradId: number; maneuverAtS: number; newTle: { tle2: string }; initialTle: { tle2: string } }>;
};
const objectives = ccsScenario5Data.objectives;

describe('ccs scenario 5: wiring', () => {
  it('follows State of Health and closes the spacecraft half', () => {
    expect(SCENARIOS.filter((s) => s.id === 'ccs-scenario5')).toHaveLength(1);
    expect(ccsCampaignData.scenarios.map((s) => s.id)).toEqual(['ccs-scenario1', 'ccs-scenario2', 'ccs-scenario3', 'ccs-scenario4', 'ccs-scenario5']);
    expect(ccsScenario5Data.number).toBe(4);
    expect(ccsScenario5Data.prerequisiteScenarioIds).toEqual(['ccs-scenario4']);
    expect(ccsScenario5Data.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-4/scenario-5?content-only=true&dark=true');
  });

  it('declares a six-tone ranging arc through the command path', () => {
    expect(settings.commanding.ranging.requiredMeasurements).toBe(6);
    expect(settings.commanding.ranging.toneId).toBe('RANGE');
  });

  it('the burn is a GEO station-keeping step: pre-burn set differs from the authored set only in mean anomaly, and fires inside the window', () => {
    const [burn] = settings.spaceEvents;
    expect(burn.satelliteNoradId).toBe(90071);
    expect(burn.newTle.tle2).toBe(TALON2_TLE.tle2);
    expect(burn.initialTle.tle2).not.toBe(burn.newTle.tle2);
    const field = (line: string, index: number) => line.trim().split(/\s+/)[index];
    for (const i of [1, 2, 3, 4, 5, 7]) expect(field(burn.initialTle.tle2, i)).toBe(field(burn.newTle.tle2, i)); // everything but mean anomaly
    expect(Math.abs(Number(field(burn.initialTle.tle2, 6)) - Number(field(burn.newTle.tle2, 6)))).toBeCloseTo(0.1, 3);
    expect(burn.maneuverAtS).toBeGreaterThan(settings.commanding.windowStartS + 120);
    expect(burn.maneuverAtS).toBeLessThan(settings.commanding.windowEndS - 600);
  });
});

describe('ccs scenario 5: objectives', () => {
  it('takes three tones, sees the burn, loads the set, takes three more, in that order', () => {
    const ids = objectives.map((o) => o.id);
    const order = ['pre-burn-arc', 'watch-the-burn', 'load-the-ephemeris', 'post-burn-arc', 'od-handoff'];
    expect(order.map((id) => ids.indexOf(id))).toEqual([...order.map((id) => ids.indexOf(id))].sort((a, b) => a - b));
    const minCounts = order.slice(0, 4).map((id) => objectives.find((o) => o.id === id)!.conditions.find((c) => c.type === 'ranging-measurements')?.params?.minCount);
    expect(minCounts).toEqual([3, 4, undefined, 6]);
    expect(objectives.find((o) => o.id === 'load-the-ephemeris')!.conditions[0].params!.eventId).toBe('TALON2-SK');
    for (let i = 1; i < order.length; i++) {
      expect(objectives.find((o) => o.id === order[i])!.prerequisiteObjectiveIds).toEqual([order[i - 1]]);
    }
  });

  it('has scored, NICE-annotated objectives on SS-01 totalling 100 points, all with evaluators', () => {
    const catalog = new Set(niceCatalog.codes);
    for (const objective of objectives) {
      expect(objective.points, objective.id).toBeGreaterThan(0);
      expect(objective.groundStation).toBe('SS-01');
      for (const code of objective.nice ?? []) expect(catalog.has(code), `${objective.id}: ${code}`).toBe(true);
      for (const condition of objective.conditions) {
        expect(objectivesManagerSrc.includes(`case '${condition.type}':`), `${objective.id}: ${condition.type}`).toBe(true);
      }
    }
    expect(objectives.reduce((sum, o) => sum + o.points, 0)).toBe(100);
  });
});
