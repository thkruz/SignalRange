import type { CampaignData } from '@app/campaigns/campaign-types';
import type { ScenarioData } from '@app/ScenarioData';
import { type AchievementProgress, achievementCatalog, evaluateAchievements } from '@app/user-account/achievement-catalog';
import type { ScenarioProgress } from '@app/user-account/types';
import type { MissionRecord } from './mission-records';

export interface MissionDebrief {
  previousScore?: number;
  bestScore: number;
  personalBest: boolean;
  achievements: AchievementProgress[];
  nextMission?: Pick<ScenarioData, 'id' | 'title' | 'imageUrl'>;
  newlyUnlocked: boolean;
}

export function buildMissionDebrief(
  campaigns: CampaignData[],
  campaignId: string,
  before: ScenarioProgress[],
  result: ScenarioProgress,
  record: MissionRecord | null
): MissionDebrief {
  const prior = before.find((entry) => entry.scenarioId === result.scenarioId && entry.completedAt);
  const previousScore = record?.previous ?? prior?.score;
  const priorBest = Math.max(record?.best ?? -Infinity, prior?.score ?? -Infinity);
  const after = [...before.filter((entry) => entry.scenarioId !== result.scenarioId), result];
  const catalog = achievementCatalog(campaigns);
  const earnedBefore = new Set(
    evaluateAchievements(catalog, before)
      .filter((entry) => entry.unlockedAt)
      .map((entry) => entry.id)
  );
  const completedBefore = new Set(before.filter((entry) => entry.completedAt).map((entry) => entry.scenarioId));
  const completed = new Set([...completedBefore, result.scenarioId]);
  const next = campaigns
    .find((campaign) => campaign.id === campaignId)
    ?.scenarios.find(
      (mission) =>
        !mission.isDisabled && mission.missionType !== 'Sandbox' && !completed.has(mission.id) && (mission.prerequisiteScenarioIds ?? []).every((id) => completed.has(id))
    );
  return {
    previousScore,
    bestScore: Math.max(priorBest, result.score),
    personalBest: result.score > priorBest,
    achievements: evaluateAchievements(catalog, after).filter((entry) => entry.unlockedAt && !earnedBefore.has(entry.id)),
    nextMission: next && { id: next.id, title: next.title, imageUrl: next.imageUrl },
    newlyUnlocked: Boolean(next?.prerequisiteScenarioIds?.some((id) => !completedBefore.has(id))),
  };
}
