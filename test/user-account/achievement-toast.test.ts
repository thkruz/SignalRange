import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sfx } from '../../src/sound/sfx-enum';
import SoundManager from '../../src/sound/sound-manager';
import { AchievementToast } from '../../src/user-account/achievement-toast';

describe('achievement notifications', () => {
  let toast: AchievementToast;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(SoundManager.getInstance(), 'play').mockImplementation(() => {});
    localStorage.removeItem(AchievementToast.STYLE_STORAGE_KEY);
    toast = new AchievementToast();
  });
  afterEach(() => {
    toast.clear();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem(AchievementToast.STYLE_STORAGE_KEY);
  });

  it('queues achievements and runs each entrance, hold, and exit without overlap', () => {
    toast.show({ id: 'one', title: 'First shift', description: 'Complete a mission.', category: 'Service' });
    toast.show({ id: 'two', title: 'Clean shift', description: 'No penalties.', category: 'Proficiency' });
    expect(document.querySelectorAll('.achievement-toast')).toHaveLength(1);
    expect(document.querySelector('.achievement-toast')?.textContent).toContain('First shift');
    expect(SoundManager.getInstance().play).toHaveBeenCalledWith(Sfx.ACHIEVEMENT);
    vi.advanceTimersByTime(6000);
    expect(document.querySelector('.achievement-toast--leaving')).not.toBeNull();
    vi.advanceTimersByTime(320);
    expect(document.querySelectorAll('.achievement-toast')).toHaveLength(1);
    expect(document.querySelector('.achievement-toast')?.textContent).toContain('Clean shift');
    vi.advanceTimersByTime(6320);
    expect(document.querySelectorAll('.achievement-toast')).toHaveLength(0);
  });

  it('defaults to compact, preserves the card option, and remembers the choice', () => {
    expect(toast.style).toBe('compact');
    toast.showTest();
    expect(document.querySelector('.achievement-toast')?.getAttribute('data-style')).toBe('compact');
    toast.setStyle('card');
    toast.showTest();
    expect(document.querySelectorAll('.achievement-toast')).toHaveLength(1);
    expect(document.querySelector('.achievement-toast')?.getAttribute('data-style')).toBe('card');
    expect(new AchievementToast().style).toBe('card');
    localStorage.setItem(AchievementToast.STYLE_STORAGE_KEY, 'invalid');
    expect(new AchievementToast().style).toBe('compact');
  });

  it('clears visible and queued account notifications without leaving timers', () => {
    toast.showTest();
    toast.showTest();
    toast.clear();
    vi.runAllTimers();
    expect(document.querySelector('.achievement-notifications')).toBeNull();
  });

  it('does not steal focus, announces politely, and escapes award text', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    toast.show({ id: 'safe', title: '<img src=x>', description: '<script>bad()</script>', category: 'Service' });
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('.achievement-notifications')?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('.achievement-toast img:not(.achievement-icon)')).toBeNull();
    expect(document.querySelector<HTMLImageElement>('.achievement-toast img.achievement-icon')?.getAttribute('src')).toBe('/assets/achievements/safe.png');
    expect(document.querySelector('.achievement-toast script')).toBeNull();
    document.querySelector<HTMLButtonElement>('.achievement-toast__dismiss')!.click();
    vi.advanceTimersByTime(320);
    expect(document.querySelector('.achievement-toast')).toBeNull();
  });
});
