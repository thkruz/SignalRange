import { CampaignManager } from '@app/campaigns/campaign-manager';
import { type AchievementProgress, achievementCatalog, evaluateAchievements } from './achievement-catalog';
import { achievementToast } from './achievement-toast';
import { selectionProgressCache } from './selection-progress-cache';

/** Only transitions from an established account baseline produce notifications. */
export class AchievementUnlockTracker {
  private earned_: Set<string> | null = null;

  reset(): void {
    this.earned_ = null;
  }

  observe(achievements: AchievementProgress[]): AchievementProgress[] {
    const earned = achievements.filter((achievement) => achievement.unlockedAt);
    const fresh = this.earned_ ? earned.filter((achievement) => !this.earned_!.has(achievement.id)) : [];
    this.earned_ = new Set(earned.map((achievement) => achievement.id));
    return fresh;
  }
}

const tracker = new AchievementUnlockTracker();
let generation = 0;
let initialized = false;
let baseline: Promise<void> = Promise.resolve();

async function readAchievements(): Promise<AchievementProgress[] | null> {
  const progress = await selectionProgressCache.getProgress();
  return progress ? evaluateAchievements(achievementCatalog(CampaignManager.getInstance().getAllCampaigns()), progress.scenarios) : null;
}

export function initializeAchievementNotifications(): void {
  if (initialized) return;
  initialized = true;
  const reset = (): void => {
    const current = ++generation;
    tracker.reset();
    achievementToast.clear();
    if (selectionProgressCache.isSignedOut) return;
    baseline = readAchievements()
      .then((achievements) => {
        if (current === generation && achievements) tracker.observe(achievements);
      })
      .catch(() => {});
  };
  selectionProgressCache.onAccountChanged(reset);
  // App installs this before auth resolves. That account event primes the shared cache.
}

/** Called only after the final score has been saved, so partial objective writes cannot award a clean shift. */
export async function notifySavedAchievements(): Promise<void> {
  if (!initialized) return;
  const current = generation;
  try {
    await baseline;
    const achievements = await readAchievements();
    if (current !== generation || !achievements) return;
    for (const achievement of tracker.observe(achievements)) achievementToast.show(achievement);
  } catch {
    // A notification failure must not interrupt saving scores or leaving the mission.
  }
}
