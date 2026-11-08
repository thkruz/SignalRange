import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), navigate: vi.fn(), remove: vi.fn(), reset: vi.fn(), update: vi.fn(), session: vi.fn(), soundPause: vi.fn() }));
vi.mock('@app/events/event-bus', () => ({ EventBus: { getInstance: () => ({ on: vi.fn() }), onRecreate: vi.fn() } }));
vi.mock('@app/router', () => ({ Router: { getInstance: () => ({ navigate: mocks.navigate }) } }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: { getInstance: () => ({ data: { id: 'one', title: 'First Day', number: 1 } }) } }));
vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    getInstance: () => ({ progressSaveManager: { saveCheckpoint: mocks.save, waitForPendingSave: vi.fn().mockResolvedValue(undefined) } }),
  },
}));
vi.mock('@app/sync/storage', () => ({ clearPersistedStore: vi.fn() }));
vi.mock('@app/user-account/auth', () => ({ Auth: { getSession: mocks.session } }));
vi.mock('@app/user-account/user-data-service', () => ({
  getUserDataService: () => ({ deleteCheckpoint: mocks.remove, resetScenarioForReplay: mocks.reset, updateScenarioProgress: mocks.update }),
}));
vi.mock('@app/user-account/achievement-toast', () => ({ achievementToast: { style: 'compact', setStyle: vi.fn() } }));
vi.mock('@app/sound/sound-manager', () => ({ default: { getInstance: () => ({ setMenuPaused: mocks.soundPause }) } }));

import { GameMenu } from '../../src/game-menu/game-menu';
import { setMenuPause } from '../../src/game-menu/menu-pause';
import { SimClock } from '../../src/simulation/sim-clock';

function click(action: string) {
  document.querySelector<HTMLButtonElement>(`#game-menu [data-action="${action}"]`)!.click();
}
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  SimClock.reset();
  setMenuPause('game-menu', false);
  setMenuPause('profile', false);
  (GameMenu as any).instance_ = undefined;
  history.replaceState({}, '', '/campaigns/nats/scenarios/one');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.session.mockResolvedValue({ user: { id: 'player' } });
  mocks.save.mockResolvedValue(undefined);
});
describe('game menus', () => {
  it('keeps the mission paused through settings and preserves other overlay/brief holds on resume', () => {
    SimClock.pause('scenario');
    const menu = GameMenu.getInstance();
    menu.openPause();
    click('settings');
    click('back');
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Mission paused');
    expect(SimClock.isPaused('menu')).toBe(true);
    setMenuPause('profile', true);
    click('resume');
    expect(SimClock.isPaused('menu')).toBe(true);
    setMenuPause('profile', false);
    expect(SimClock.isPaused('menu')).toBe(false);
    expect(SimClock.isPaused('scenario')).toBe(true);
  });
  it('leaves a mission paused and retryable when saving fails', async () => {
    mocks.save.mockRejectedValue(new Error('offline'));
    GameMenu.getInstance().openPause();
    click('return');
    click('confirm');
    await vi.waitFor(() => expect(document.querySelector('#game-menu-status')?.textContent).toContain('Please try again'));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(SimClock.isPaused('menu')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.disabled).toBe(false);
  });
  it('saves before returning and records the mission for Continue', async () => {
    GameMenu.getInstance().openPause();
    click('return');
    click('confirm');
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/campaigns/nats'));
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith('one', expect.objectContaining({ scenarioNumber: 1, lastPlayed: expect.any(String) }));
  });
  it('requires confirmation before restarting and preserves completion via the replay reset', async () => {
    GameMenu.getInstance().openPause();
    click('restart');
    expect(mocks.remove).not.toHaveBeenCalled();
    click('confirm');
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/campaigns/nats/scenarios/one', { forceReplay: true }));
    expect(mocks.remove).toHaveBeenCalledWith('one');
    expect(mocks.reset).toHaveBeenCalledWith('one');
  });
});
