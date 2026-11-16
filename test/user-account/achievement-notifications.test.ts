import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ progress: vi.fn(), account: vi.fn(), show: vi.fn(), clear: vi.fn() }));
vi.mock('@app/user-account/selection-progress-cache', () => ({ selectionProgressCache: { getProgress: mocks.progress, onAccountChanged: mocks.account, isSignedOut: false } }));
vi.mock('@app/user-account/achievement-toast', () => ({ achievementToast: { show: mocks.show, clear: mocks.clear } }));
vi.mock('@app/campaigns/campaign-manager', () => ({
  CampaignManager: { getInstance: () => ({ getAllCampaigns: () => [{ id: 'sample', title: 'Sample', scenarios: [{ id: 'one', number: 1, missionType: 'Operations' }] }] }) },
}));
const completed = { scenarioId: 'one', completedAt: '2026-11-01T12:00:00Z', quizPenalties: 0, timePenalties: 0 };

describe('achievement unlock detection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps existing awards quiet at login and only announces new awards once after a saved result', async () => {
    const { initializeAchievementNotifications, notifySavedAchievements } = await import('../../src/user-account/achievement-notifications');
    mocks.progress.mockResolvedValue({ scenarios: [] });
    initializeAchievementNotifications();
    mocks.account.mock.calls[0][0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.show).not.toHaveBeenCalled();
    mocks.progress.mockResolvedValue({ scenarios: [completed] });
    await notifySavedAchievements();
    expect(mocks.show).toHaveBeenCalledTimes(3);
    await notifySavedAchievements();
    expect(mocks.show).toHaveBeenCalledTimes(3);
    mocks.show.mockClear();
    mocks.account.mock.calls[0][0]();
    await notifySavedAchievements();
    expect(mocks.show).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledTimes(2);
  });

  it('ignores late results from the previous account', async () => {
    const { initializeAchievementNotifications, notifySavedAchievements } = await import('../../src/user-account/achievement-notifications');
    mocks.progress.mockResolvedValue({ scenarios: [] });
    initializeAchievementNotifications();
    mocks.account.mock.calls[0][0]();
    await Promise.resolve();
    await Promise.resolve();
    let resolve!: (value: unknown) => void;
    mocks.progress.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const checking = notifySavedAchievements();
    await Promise.resolve();
    await Promise.resolve();
    mocks.account.mock.calls[0][0]();
    resolve({ scenarios: [completed] });
    await checking;
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('does not turn a failed baseline download into a burst of old achievements', async () => {
    const { initializeAchievementNotifications, notifySavedAchievements } = await import('../../src/user-account/achievement-notifications');
    mocks.progress.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ scenarios: [completed] });
    initializeAchievementNotifications();
    mocks.account.mock.calls[0][0]();
    await notifySavedAchievements();
    expect(mocks.show).not.toHaveBeenCalled();
  });
});
