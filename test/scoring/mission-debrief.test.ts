import { beforeEach, describe, expect, it } from 'vitest';
import type { CampaignData } from '../../src/campaigns/campaign-types';
import { buildMissionDebrief } from '../../src/scoring/mission-debrief';
import { readMissionRecord, rememberMissionResult } from '../../src/scoring/mission-records';
import type { ScenarioProgress } from '../../src/user-account/types';

const campaigns = [
  {
    id: 'test',
    title: 'Test campaign',
    scenarios: [
      { id: 'first', number: 1, title: 'First', imageUrl: '1.png', prerequisiteScenarioIds: [] },
      { id: 'second', number: 2, title: 'Second', imageUrl: '2.png', prerequisiteScenarioIds: ['first'] },
    ],
  },
] as CampaignData[];
const result = (score: number): ScenarioProgress => ({ scenarioId: 'first', score, completedAt: '2026-11-07T10:00:00Z', quizPenalties: 0, timePenalties: 0 }) as ScenarioProgress;
beforeEach(() => localStorage.clear());
describe('mission debrief', () => {
  it('compares against the prior run and best, and offers the unlocked mission', () => {
    const debrief = buildMissionDebrief(campaigns, 'test', [result(100)], result(150), { previous: 100, best: 200, completedAt: '' });
    expect(debrief.previousScore).toBe(100);
    expect(debrief.bestScore).toBe(200);
    expect(debrief.personalBest).toBe(false);
    expect(debrief.nextMission?.id).toBe('second');
    expect(debrief.newlyUnlocked).toBe(false);
  });
  it('shows new awards only once and identifies a newly unlocked next mission', () => {
    const debrief = buildMissionDebrief(campaigns, 'test', [], result(150), null);
    expect(debrief.previousScore).toBeUndefined();
    expect(debrief.newlyUnlocked).toBe(true);
    expect(debrief.achievements.map((award) => award.id)).toContain('service-1');
    const replay = buildMissionDebrief(campaigns, 'test', [result(150)], result(160), null);
    expect(replay.achievements.map((award) => award.id)).not.toContain('service-1');
    expect(replay.personalBest).toBe(true);
  });
  it('keeps records account-scoped and preserves a higher best after a lower replay', () => {
    rememberMissionResult('one', result(200));
    rememberMissionResult('one', { ...result(100), completedAt: '2026-11-07T11:00:00Z' });
    expect(readMissionRecord('one', 'first')).toMatchObject({ previous: 100, best: 200 });
    expect(readMissionRecord('two', 'first')).toBeNull();
    rememberMissionResult(null, result(500));
    expect(readMissionRecord(null, 'first')).toBeNull();
  });
});
