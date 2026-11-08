import type { CampaignData } from '@app/campaigns/campaign-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { Checkpoint, ScenarioProgress } from '@app/user-account/types';

export interface ContinueMission {
  campaign: CampaignData;
  mission: ScenarioData;
  checkpoint: Checkpoint | null;
}

const timestamp = (value?: string): number => Date.parse(value ?? '') || 0;

/** Resume the latest unfinished save; otherwise advance the most recently played campaign. */
export async function findContinueMission(
  progress: ScenarioProgress[],
  campaigns: CampaignData[],
  hasCheckpoint: (id: string) => Promise<boolean>,
  loadCheckpoint: (id: string) => Promise<Checkpoint | null>,
  ignorePrerequisites = false
): Promise<ContinueMission | null> {
  const records = new Map(progress.map((item) => [item.scenarioId, item]));
  const completed = new Set(progress.filter((item) => item.completedAt).map((item) => item.scenarioId));
  const available = campaigns
    .filter((campaign) => !campaign.isDisabled && !campaign.isLocked)
    .flatMap((campaign) =>
      campaign.scenarios
        .filter(
          (mission) => !mission.isDisabled && mission.missionType !== 'Sandbox' && (ignorePrerequisites || (mission.prerequisiteScenarioIds ?? []).every((id) => completed.has(id)))
        )
        .map((mission) => ({ campaign, mission }))
    );

  // Autosaves may have no progress row. Replays keep completedAt for unlocks,
  // but reset score to zero, matching mission selection's current-run check.
  const candidates = available.filter(({ mission }) => {
    const record = records.get(mission.id);
    return !record?.completedAt || !record.score;
  });
  const finishedCheckpoints = new Set<string>();
  const saves = await Promise.all(
    candidates.map(async ({ campaign, mission }): Promise<ContinueMission | null> => {
      if (!(await hasCheckpoint(mission.id))) return null;
      const checkpoint = await loadCheckpoint(mission.id);
      if (!checkpoint) return null;
      const required = (mission.objectives ?? []).filter((objective) => !objective.isOptional);
      const states = checkpoint.state.objectiveStates ?? [];
      // A final objective can save its checkpoint before the completion record arrives.
      if (required.length && required.every((objective) => states.some((state) => state.objective.id === objective.id && state.isCompleted))) {
        finishedCheckpoints.add(mission.id);
        return null;
      }
      return { campaign, mission, checkpoint };
    })
  );
  const latest = saves.filter((save): save is ContinueMission => save !== null).sort((a, b) => timestamp(b.checkpoint?.savedAt) - timestamp(a.checkpoint?.savedAt))[0];
  if (latest) return latest;

  const campaignLastPlayed = (campaign: CampaignData): number => Math.max(0, ...campaign.scenarios.map((mission) => timestamp(records.get(mission.id)?.lastPlayed)));
  const ordered = [...campaigns].sort((a, b) => campaignLastPlayed(b) - campaignLastPlayed(a));
  for (const campaign of ordered) {
    const next = available.find((item) => item.campaign === campaign && !completed.has(item.mission.id) && !finishedCheckpoints.has(item.mission.id));
    if (next) return { ...next, checkpoint: null };
  }
  return null;
}
