import type { CampaignData } from '@app/campaigns/campaign-types';
import { selectionText as escapeText } from '@app/pages/selection-browser';
import { getAssetUrl } from '@app/utils/asset-url';
import { type AchievementProgress, campaignMissions } from './achievement-catalog';
import type { ScenariosProgressResponse } from './types';

export type AchievementFilter = 'all' | 'earned' | 'locked';

/** Painted icon per achievement (R2: assets/achievements/<id>.png); the category SVG shows through if it is missing */
export function achievementBadge(achievement: Pick<AchievementProgress, 'id' | 'category'>): string {
  const shape =
    achievement.category === 'Campaigns'
      ? '<path d="M8 4h16v12a8 8 0 0 1-16 0V4Zm8 20v5m-6 0h12M8 8H4v5a6 6 0 0 0 6 6m14-11h4v5a6 6 0 0 1-6 6"/>'
      : achievement.category === 'Proficiency'
        ? '<path d="m16 3 11 4v9c0 6-11 13-11 13S5 22 5 16V7L16 3Z"/><path d="m10 15 4 4 8-9"/>'
        : '<circle cx="16" cy="13" r="9"/><path d="m10 20-2 9 8-4 8 4-2-9m-10-8 3 3 5-6"/>';
  const icon = getAssetUrl(`/assets/achievements/${encodeURIComponent(achievement.id)}.png`);
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg><img class="achievement-icon" src="${icon}" alt="" loading="lazy" decoding="async">`;
}

export function renderAchievements(achievements: AchievementProgress[], filter: AchievementFilter): string {
  const visible = achievements.filter((achievement) => filter === 'all' || Boolean(achievement.unlockedAt) === (filter === 'earned'));
  if (!visible.length)
    return `<p class="profile-empty">${filter === 'earned' ? 'Your first award starts with your first completed mission.' : 'All achievements earned. Your service record is complete.'}</p>`;
  return `<ul class="profile-awards">${visible
    .map((achievement) => {
      const earned = Boolean(achievement.unlockedAt);
      const date = earned ? new Date(achievement.unlockedAt!).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      return `<li class="profile-award ${earned ? 'profile-award--earned' : ''}">
      <div class="profile-award-badge">${achievementBadge(achievement)}</div>
      <div class="profile-award-copy"><span class="profile-eyebrow">${achievement.category}</span>
        <h3>${escapeText(achievement.title)}</h3><p>${escapeText(achievement.description)}</p>
        <div class="profile-award-progress"><progress max="${achievement.target}" value="${achievement.current}" aria-label="${escapeText(achievement.title)}"></progress>
          <span>${achievement.current} / ${achievement.target}</span></div>
      </div>
      <div class="profile-award-state">${earned ? `<span>Earned</span><time datetime="${escapeText(achievement.unlockedAt!)}">${escapeText(date)}</time>` : '<span>Locked</span>'}</div>
    </li>`;
    })
    .join('')}</ul>`;
}

export function renderServiceRecord(campaigns: CampaignData[], progress: ScenariosProgressResponse): string {
  const completed = new Set(progress.scenarios.filter((result) => result.completedAt).map((result) => result.scenarioId));
  const rows = campaigns.map((campaign) => {
    const missions = campaignMissions(campaign);
    const count = missions.filter((mission) => completed.has(mission.id)).length;
    return `<li class="profile-campaign"><div><h3>${escapeText(campaign.title)}</h3><p>${count} of ${missions.length} missions completed</p></div>
      <progress max="${Math.max(missions.length, 1)}" value="${count}" aria-label="${escapeText(campaign.title)} completion"></progress></li>`;
  });
  const missions = campaigns.flatMap(campaignMissions);
  const recent = [...progress.scenarios]
    .filter((result) => missions.some((mission) => mission.id === result.scenarioId) && Number.isFinite(Date.parse(result.lastPlayed)))
    .sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed))
    .slice(0, 3);
  return `<h2>Campaign progress</h2><ul class="profile-campaigns">${rows.join('')}</ul>
    <h2>Recent missions</h2>${
      recent.length
        ? `<ul class="profile-recent">${recent
            .map((result) => {
              const mission = missions.find((entry) => entry.id === result.scenarioId)!;
              return `<li><span>${escapeText(mission.title)}</span><span>${result.completedAt ? 'Completed' : 'In progress'} · ${result.score.toLocaleString()} pts</span></li>`;
            })
            .join('')}</ul>`
        : '<p class="profile-empty">Your mission history will appear here after you begin a mission.</p>'
    }`;
}
