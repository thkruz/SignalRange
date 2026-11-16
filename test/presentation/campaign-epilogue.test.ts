import { describe, expect, it } from 'vitest';
import type { CampaignData } from '../../src/campaigns/campaign-types';
import { campaignEpilogue, campaignServiceRecord } from '../../src/presentation/campaign-epilogue';
import { buildMissionDebrief } from '../../src/scoring/mission-debrief';
import type { ScenarioProgress } from '../../src/user-account/types';

const campaign = {
  id: 'nats',
  title: 'NATS',
  imageUrl: 'nats/card.png',
  scenarios: [
    { id: 'sandbox', number: 0, missionType: 'Sandbox', objectives: [{ nice: ['T9999'] }] },
    { id: 'one', number: 1, objectives: [{ nice: ['T0001', 'K0001', 'S0001'] }, { nice: ['T0002'], isOptional: true }] },
    { id: 'two', number: 2, objectives: [{ nice: ['T0001', 'T0003'] }] },
    { id: 'future', number: 3, isDisabled: true, objectives: [{ nice: ['T9998'] }] },
  ],
} as CampaignData;
const result = (scenarioId: string, overrides: Partial<ScenarioProgress> = {}) =>
  ({
    scenarioId,
    completedAt: '2026-11-07T12:00:00Z',
    score: 100,
    quizPenalties: 0,
    timePenalties: 0,
    ...overrides,
  }) as ScenarioProgress;

describe('campaign epilogue eligibility and service record', () => {
  it('does not show the ending before the authored finale or full completion', () => {
    expect(campaignEpilogue(campaign, [result('two')])).toBeUndefined();
    expect(campaignEpilogue(campaign, [result('one'), result('two')])?.label).toContain('Campaign complete');
    expect(campaignEpilogue({ ...campaign, scenarios: [] }, [])).toBeUndefined();
    expect(campaignEpilogue(campaign, [result('one'), result('two', { completedAt: 'invalid' })])).toBeUndefined();
  });

  it('offers the NATS finale with partial progress without granting campaign awards', () => {
    const nats = { ...campaign, scenarios: [campaign.scenarios[1], { ...campaign.scenarios[2], id: 'finale', number: 24 }] };
    const debrief = buildMissionDebrief([nats], 'nats', [], result('finale'), null);
    expect(debrief.epilogue?.label).toBe('Final watch · Epilogue');
    expect(debrief.epilogue?.facts[0].value).toBe('1 / 2');
    expect(debrief.epilogue?.record?.awards).toEqual([]);
    expect(debrief.achievements.some((award) => award.id === 'campaign-nats')).toBe(false);
    expect(campaignEpilogue(nats, [result('finale', { completedAt: undefined })])).toBeUndefined();
    expect(campaignEpilogue(nats, [result('finale', { completedAt: 'invalid' })])).toBeUndefined();
  });

  it('ends the EU story at mission 24 without requiring the additional drills', () => {
    const eu = {
      ...campaign,
      id: 'nats-eu',
      scenarios: [
        { ...campaign.scenarios[1], number: 1 },
        { ...campaign.scenarios[2], id: 'finale', number: 24 },
        { ...campaign.scenarios[2], id: 'drill', number: 28 },
      ],
    };
    expect(campaignEpilogue(eu, [result('finale')])?.title).toBe('Across Two Horizons');
    expect(campaignEpilogue(eu, [result('drill')])).toBeUndefined();
  });

  it('deduplicates tasks and missions, excludes optional objectives, knowledge/skill codes and foreign results', () => {
    const record = campaignServiceRecord(campaign, [result('one'), result('one'), result('two', { quizPenalties: 2 }), result('foreign'), result('sandbox')]);
    expect(record).toMatchObject({ complete: true, missions: 2, objectives: 2, cleanShifts: 1, tasks: ['T0001', 'T0003'], totalTasks: 2 });
  });

  it('does not count missing penalty data as clean or use scores as completion status', () => {
    expect(campaignServiceRecord(campaign, [result('one', { quizPenalties: undefined }), result('two', { completedAt: undefined })])).toMatchObject({
      complete: false,
      cleanShifts: 0,
      missions: 1,
    });
    expect(campaignEpilogue(campaign, [result('one', { score: 0 }), result('two')])).toBeDefined();
  });

  it('supplies the ending when an earlier gap is completed and allows reviewing it after replay', () => {
    const before = [result('two')];
    const debrief = buildMissionDebrief([campaign], 'nats', before, result('one'), null);
    expect(debrief.epilogue?.attribution).toContain('Dana Torres');
    expect(debrief.epilogue?.record?.taskCodes).toEqual(['T0001', 'T0003']);
    expect(buildMissionDebrief([campaign], 'nats', [...before, result('one')], result('one'), null).epilogue).toBeDefined();
  });

  it('uses plugin artwork and a generic ending for another campaign', () => {
    const scene = campaignEpilogue({ ...campaign, id: 'custom' }, [result('one'), result('two')])!;
    expect(scene.image).toContain('/assets/campaigns/nats/card.png');
    expect(scene.attribution).toBeUndefined();
  });
});
