import type { CampaignData } from '@app/campaigns/campaign-types';
import { achievementCatalog, campaignMissions, evaluateAchievements } from '@app/user-account/achievement-catalog';
import type { ScenarioProgress } from '@app/user-account/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { SceneData } from './scene-modal';

const ENDINGS: Record<string, { finale: number; title: string; message: string; sender: string }> = {
  nats: {
    finale: 24,
    title: 'The Next Watch',
    message:
      'The next operator has your log. They can see what changed, what you checked, and what still needs watching. That is how a station keeps going after any one of us goes home. You have earned your place here. Get some rest; we will see you on the roster.',
    sender: 'Dana Torres · NATS',
  },
  'nats-eu': {
    finale: 24,
    title: 'Across Two Horizons',
    message:
      'When you arrived, Galway was a room full of equipment waiting for its first pass. Now there is a watch on both coasts that can trust your calls and work from your records. The next contact is already on the schedule. Leave it with us tonight.',
    sender: 'Charlie Brooks · NATS Europe',
  },
  'ham-sdr': {
    finale: 8,
    title: 'The Yard Is Yours',
    message:
      'You can put an antenna in the yard, catch something from orbit, and explain what you received. You also know when a signal deserves a second look. Keep the notebook. Try another antenna. There will be another pass tomorrow. Seventy-three, operator.',
    sender: 'Riley Brooks',
  },
  ccs: {
    finale: 5,
    title: 'Handed Back',
    message:
      'The contact records are filed and the chain is safe. The next team has the measurements, the limits, and the handover it needs. You kept responsibility for the result all the way through to the last entry. Watch complete.',
    sender: 'SANDSTORM operations crew',
  },
  'signal-hunter': {
    finale: 4,
    title: 'A Record That Holds',
    message:
      'Your report gives the next team a place to look and a reason to trust it. The reference checks, the captures, and the confidence statement are all there for someone else to examine. That is a finished watch. We have the next one.',
    sender: 'Peterson Annex analysis crew',
  },
};

/** Uses completed campaign missions only; repeated mappings count as one practiced task. */
export function campaignServiceRecord(campaign: CampaignData, results: ScenarioProgress[]) {
  const missions = campaignMissions(campaign);
  const completed = new Map(results.filter((result) => result.completedAt && Number.isFinite(Date.parse(result.completedAt))).map((result) => [result.scenarioId, result]));
  const finished = missions.filter((mission) => completed.has(mission.id));
  const taskCodes = (entries: typeof missions): string[] =>
    [
      ...new Set(
        entries
          .flatMap((mission) => (mission.objectives ?? []).filter((objective) => !objective.isOptional).flatMap((objective) => objective.nice ?? []))
          .filter((code) => /^T\d{4}$/u.test(code))
      ),
    ].sort();
  const awards = evaluateAchievements(achievementCatalog([campaign]), results).filter((award) => award.unlockedAt && award.category === 'Campaigns');
  return {
    complete: missions.length > 0 && finished.length === missions.length,
    missions: finished.length,
    objectives: finished.reduce((total, mission) => total + (mission.objectives?.filter((objective) => !objective.isOptional).length ?? 0), 0),
    cleanShifts: finished.filter((mission) => {
      const result = completed.get(mission.id)!;
      return result.quizPenalties === 0 && result.timePenalties === 0;
    }).length,
    tasks: taskCodes(finished),
    totalTasks: taskCodes(missions).length,
    awards,
  };
}

export function campaignFinale(campaign: CampaignData) {
  const missions = campaignMissions(campaign);
  const finaleNumber = ENDINGS[campaign.id]?.finale ?? Math.max(...missions.map((mission) => mission.number));
  return missions.find((mission) => mission.number === finaleNumber);
}

/** The story ends with its finale; full-completion awards still require every mission. */
export function campaignEpilogue(campaign: CampaignData, results: ScenarioProgress[]): SceneData | undefined {
  const record = campaignServiceRecord(campaign, results);
  const ending = ENDINGS[campaign.id];
  const missions = campaignMissions(campaign);
  const finale = campaignFinale(campaign);
  const finaleCompleted = finale && results.some((result) => result.scenarioId === finale.id && result.completedAt && Number.isFinite(Date.parse(result.completedAt)));
  if (!record.complete && !finaleCompleted) return undefined;
  return {
    label: record.complete ? 'Campaign complete · Epilogue' : 'Final watch · Epilogue',
    title: ending?.title ?? 'Watch Complete',
    subtitle: campaign.title,
    image: ending ? `/images/scenes/${campaign.id}-v2.webp` : getAssetUrl(`/assets/campaigns/${campaign.imageUrl}`),
    imageAlt: ending ? 'The station at the end of your watch.' : '',
    body: ending?.message ?? 'The final watch is complete. Your service record carries the work forward to the next watch.',
    attribution: ending?.sender,
    facts: [
      { label: 'Missions completed', value: `${record.missions} / ${missions.length}` },
      { label: 'Required objectives', value: String(record.objectives) },
      { label: 'Clean shifts', value: `${record.cleanShifts} / ${record.missions}` },
    ],
    record: {
      title: 'Service record',
      note: 'Clean shifts have no recorded quiz, decision, or time penalties. Figures reflect your available results; replaying a mission can update its record.',
      awards: record.awards.map((award) => ({ title: award.title, description: award.description })),
      taskCodes: record.tasks,
      totalTasks: record.totalTasks,
    },
    actionLabel: 'Return to campaigns',
  };
}
