import { describe, expect, it } from 'vitest';
import type { CampaignData } from '../../src/campaigns/campaign-types';
import type { ScenarioData } from '../../src/ScenarioData';
import { achievementCatalog, evaluateAchievements } from '../../src/user-account/achievement-catalog';
import { renderAchievements } from '../../src/user-account/profile-record';
import type { ScenarioProgress } from '../../src/user-account/types';

const campaign = {
  id: 'nats',
  title: 'NATS',
  scenarios: Array.from(
    { length: 10 },
    (_, number) =>
      ({
        id: `nats-${number}`,
        number,
        missionType: number ? 'Operations' : 'Sandbox',
        isDisabled: number === 9,
      }) as ScenarioData
  ),
} as CampaignData;
const catalog = achievementCatalog([campaign]);
const result = (number: number, overrides: Partial<ScenarioProgress> = {}): ScenarioProgress =>
  ({
    scenarioId: `nats-${number}`,
    completedAt: `2026-01-${String(number + 1).padStart(2, '0')}T12:00:00Z`,
    quizPenalties: 0,
    timePenalties: 0,
    ...overrides,
  }) as ScenarioProgress;

describe('saved-result achievements', () => {
  it('excludes sandbox, disabled and unknown missions and ignores unfinished attempts', () => {
    const awards = evaluateAchievements(catalog, [result(0), result(9), result(70), result(1, { completedAt: undefined })]);
    expect(awards.every((award) => award.current === 0 && !award.unlockedAt)).toBe(true);
  });

  it('deduplicates completions and uses the threshold completion date regardless of API order', () => {
    const results = Array.from({ length: 8 }, (_, index) => result(index + 1));
    const awards = evaluateAchievements(catalog, [...results].reverse().concat(result(1)));
    expect(awards.find((award) => award.id === 'service-8')).toMatchObject({ current: 8, unlockedAt: results[7].completedAt });
    expect(awards.find((award) => award.id === 'phase-nats-1')).toMatchObject({ current: 8, unlockedAt: results[7].completedAt });
    expect(awards.find((award) => award.id === 'campaign-nats')).toMatchObject({ target: 8, unlockedAt: results[7].completedAt });
    expect(awards.find((award) => award.id === 'service-16')?.unlockedAt).toBeUndefined();
  });

  it('requires explicit zero penalties for a clean shift, not missing fields', () => {
    const awards = evaluateAchievements(catalog, [result(1, { quizPenalties: 2 }), result(2, { timePenalties: 1 }), result(3, { quizPenalties: undefined })]);
    expect(awards.find((award) => award.id === 'clean-shift')?.current).toBe(0);
    const clean = evaluateAchievements(catalog, [result(4)]).find((award) => award.id === 'clean-shift');
    expect(clean?.unlockedAt).toBe(result(4).completedAt);
  });

  it('does not retain unlocks from another account or cleared progress', () => {
    expect(evaluateAchievements(catalog, [result(1)])[0].unlockedAt).toBeTruthy();
    expect(evaluateAchievements(catalog, []).every((award) => !award.unlockedAt)).toBe(true);
  });

  it('renders filters, accessible progress, and escapes authored text', () => {
    const awards = evaluateAchievements(catalog, [result(1)]);
    awards[0].title = '<img src=x onerror=alert(1)>';
    const earned = renderAchievements(awards, 'earned');
    expect(earned).toContain('&lt;img');
    expect(earned).not.toContain('<img src=x');
    expect(earned).toContain('datetime=');
    expect(earned).toContain('aria-label=');
    expect(earned).not.toContain('<span>Locked</span>');
    expect(renderAchievements(awards, 'locked')).not.toContain('<span>Earned</span>');
  });
});
