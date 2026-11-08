import type { CampaignData } from '@app/campaigns/campaign-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { ScenarioProgress } from './types';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: 'Service' | 'Proficiency' | 'Campaigns';
  target: number;
  /** Each qualifying mission contributes once; evaluation is independent of UI/platform. */
  qualifies: (result: ScenarioProgress) => boolean;
}

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  unlockedAt?: string;
}

export function campaignMissions(campaign: CampaignData): ScenarioData[] {
  return campaign.scenarios.filter((mission) => mission.number > 0 && mission.missionType !== 'Sandbox' && !mission.isDisabled);
}

/** Adapted from WWI Pilot's catalog/eligibility separation. Saved results are the source of truth:
 * no Steam IDs, fabricated server IDs, or device-only unlock flags. Clearing progress resets awards.
 */
export function achievementCatalog(campaigns: CampaignData[]): AchievementDefinition[] {
  const missions = new Set(campaigns.flatMap(campaignMissions).map((mission) => mission.id));
  const catalog: AchievementDefinition[] = [
    ...[
      [1, 'First shift'],
      [8, 'On the roster'],
      [16, 'Experienced operator'],
      [32, 'Veteran operator'],
    ].map(([target, title]) => ({
      id: `service-${target}`,
      title: String(title),
      description: `Complete ${target} distinct ${target === 1 ? 'mission' : 'missions'}.`,
      category: 'Service' as const,
      target: Number(target),
      qualifies: (result: ScenarioProgress) => missions.has(result.scenarioId),
    })),
    {
      id: 'clean-shift',
      title: 'Clean shift',
      category: 'Proficiency',
      target: 1,
      description: 'Complete a mission with no quiz or time penalties.',
      qualifies: (result) => missions.has(result.scenarioId) && result.quizPenalties === 0 && result.timePenalties === 0,
    },
  ];
  for (const campaign of campaigns) {
    const available = campaignMissions(campaign);
    if (!available.length) continue;
    const ids = new Set(available.map((mission) => mission.id));
    catalog.push({
      id: `campaign-${campaign.id}`,
      title: campaign.title,
      category: 'Campaigns',
      target: ids.size,
      description: `Complete all ${ids.size} available missions in ${campaign.title}.`,
      qualifies: (result) => ids.has(result.scenarioId),
    });
    if (campaign.id !== 'nats' && campaign.id !== 'nats-eu') continue;
    for (const first of campaign.id === 'nats' ? [1, 9, 17] : [1, 9]) {
      const phaseIds = new Set(available.filter((mission) => mission.number >= first && mission.number < first + 8).map((mission) => mission.id));
      if (phaseIds.size !== 8) continue;
      const phase = (first - 1) / 8 + 1;
      catalog.push({
        id: `phase-${campaign.id}-${phase}`,
        title: `${campaign.title} | Phase ${phase}`,
        category: 'Campaigns',
        target: 8,
        description: `Complete missions ${first}–${first + 7}.`,
        qualifies: (result) => phaseIds.has(result.scenarioId),
      });
    }
  }
  return catalog;
}

/** Date comes from the qualifying completion, not the day the player opens their profile. */
export function evaluateAchievements(catalog: AchievementDefinition[], results: ScenarioProgress[]): AchievementProgress[] {
  const completed = results
    .filter((result) => result.completedAt && Number.isFinite(Date.parse(result.completedAt)))
    .sort((a, b) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!));
  return catalog.map((definition) => {
    const distinct = new Map<string, ScenarioProgress>();
    for (const result of completed) {
      if (definition.qualifies(result) && !distinct.has(result.scenarioId)) distinct.set(result.scenarioId, result);
    }
    const qualifying = [...distinct.values()];
    return {
      ...definition,
      current: Math.min(definition.target, qualifying.length),
      unlockedAt: qualifying[definition.target - 1]?.completedAt,
    };
  });
}
