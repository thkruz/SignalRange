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

import { setFeedbackEntry } from '../../src/feedback/feedback-entry';
import { GameMenu } from '../../src/game-menu/game-menu';
import { setMenuPause } from '../../src/game-menu/menu-pause';
import { SimClock } from '../../src/simulation/sim-clock';

function click(action: string) {
  document.querySelector<HTMLButtonElement>(`#game-menu [data-action="${action}"]`)!.click();
}
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).__APP_VERSION__ = '1.2.3';
  (globalThis as any).__GIT_COMMIT_SHA__ = 'abc1234';
  setFeedbackEntry(null);
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
  it('links the pause menu to the contact page with the mission filled in when the form is unavailable', () => {
    GameMenu.getInstance().openPause();
    const link = document.querySelector<HTMLAnchorElement>('#game-menu [data-report-link]')!;
    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe('https://signalrange.space/contact-us');
    expect(url.searchParams.get('campaign')).toBe('nats');
    expect(url.searchParams.get('scenario')).toBe('Scenario 1 - First Day');
    expect(url.searchParams.get('build')).toBe('v1.2.3 | abc1234');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(document.querySelector('#game-menu [data-action="report"]')).toBeNull();
    expect(SimClock.isPaused('menu')).toBe(true);
  });
  it('opens the field report from the pause menu, keeps the mission paused and returns to the menu', () => {
    let closed: (() => void) | undefined;
    const open = vi.fn((onClose?: () => void) => {
      closed = onClose;
    });
    setFeedbackEntry({ available: () => true, open });
    const menu = GameMenu.getInstance();
    menu.openPause();
    expect(document.querySelector('#game-menu [data-report-link]')).toBeNull();
    click('report');
    // The menu is out of the screenshot, and the pause holds while the form is up.
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(SimClock.isPaused('menu')).toBe(true);
    menu.openPause();
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(false);
    closed!();
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Mission paused');
    expect(SimClock.isPaused('menu')).toBe(true);
    click('resume');
    expect(SimClock.isPaused('menu')).toBe(false);
  });
  it('keeps the report entry off the selection menu', () => {
    history.replaceState({}, '', '/campaigns/nats');
    GameMenu.getInstance().openMenu();
    expect(document.querySelector('#game-menu [data-report-link], #game-menu [data-action="report"]')).toBeNull();
  });
  it.each(['/', '/campaigns/nats'])('opens selection settings and returns to browsing on %s', (route) => {
    history.replaceState({}, '', route);
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    GameMenu.getInstance().openMenu();
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Game menu');
    expect(document.querySelector('[data-action="restart"]')).toBeNull();
    expect(document.querySelector<HTMLAnchorElement>('.game-menu-quit')?.href).toBe('https://signalrange.space/');
    click('settings');
    expect(document.querySelector('#setting-master')).not.toBeNull();
    click('back');
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Game menu');
    click('resume');
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('opens on lost browser focus or a hidden tab and requires explicit resume', () => {
    const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const menu = GameMenu.getInstance();
    menu.initialize();
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector('#game-menu')).toBeNull();
    focused.mockReturnValue(false);
    history.replaceState({}, '', '/campaigns/nats');
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector('#game-menu')).toBeNull();
    history.replaceState({}, '', '/campaigns/nats/scenarios/one');
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
    expect(SimClock.isPaused('menu')).toBe(true);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(SimClock.isPaused('menu')).toBe(true);
    click('settings');
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Settings');
    click('back');
    click('resume');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.querySelector('#game-menu-title')?.textContent).toBe('Mission paused');
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(SimClock.isPaused('menu')).toBe(true);
    click('resume');
    expect(SimClock.isPaused('menu')).toBe(false);
    focused.mockRestore();
    hidden.mockRestore();
  });
  it('Resume sticks while the window stays unfocused and blur only re-pauses after focus returns', () => {
    const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    GameMenu.getInstance().initialize();
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
    click('resume');
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(false);
    expect(SimClock.isPaused('menu')).toBe(false);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
    vi.restoreAllMocks();
  });
  it('Escape close while the window is unfocused does not reopen the pause on the next blur', () => {
    const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    GameMenu.getInstance().initialize();
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
    document.querySelector<HTMLDialogElement>('#game-menu')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(false);
    focused.mockRestore();
    vi.restoreAllMocks();
  });
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
