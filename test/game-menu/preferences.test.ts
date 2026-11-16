import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayPreferences } from '../../src/game-menu/display-preferences';
import { displayViewport, resolutionScale } from '../../src/game-menu/display-viewport';
import { AudioPreferences } from '../../src/sound/audio-preferences';

beforeEach(() => {
  localStorage.clear();
  AudioPreferences.destroy();
});
afterEach(() => vi.restoreAllMocks());
describe('player preferences', () => {
  it('migrates old audio switches, mixes master/category levels, and persists zero', () => {
    localStorage.setItem(AudioPreferences.STORAGE_KEY, JSON.stringify({ sfx: false, ambience: true }));
    const audio = AudioPreferences.getInstance();
    audio.set({ masterVolume: 0.5, voiceVolume: 0.4, ambienceVolume: 0 });
    expect(audio.volume('voice')).toBe(0.2);
    expect(audio.volume('equipment')).toBe(0);
    expect(audio.volume('ambience')).toBe(0);
    AudioPreferences.destroy();
    expect(AudioPreferences.getInstance().prefs.ambienceVolume).toBe(0);
  });
  it('bounds invalid levels and tolerates malformed storage', () => {
    localStorage.setItem(AudioPreferences.STORAGE_KEY, '{broken');
    const audio = AudioPreferences.getInstance();
    audio.set({ masterVolume: 4, voiceVolume: -1, uiVolume: Number.NaN });
    expect(audio.prefs.masterVolume).toBe(1);
    expect(audio.prefs.voiceVolume).toBe(0);
    expect(audio.prefs.uiVolume).toBe(1);
  });
  it('restores reading size and reduced motion on the document', () => {
    const original = new DisplayPreferences();
    original.set({ textSize: 'largest', reducedMotion: true });
    original.dispose();
    const restored = new DisplayPreferences();
    restored.apply();
    expect(restored.prefs).toEqual({ textSize: 'largest', reducedMotion: true, resolution: 'native' });
    expect(document.documentElement.dataset.textSize).toBe('largest');
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    restored.set({ textSize: 'standard', reducedMotion: false });
    restored.dispose();
  });
  it.each([
    ['1080p', 3840, 2160, 2],
    ['1440p', 3840, 2160, 1.5],
    ['native', 3840, 2160, 1],
    ['1080p', 2560, 1440, 4 / 3],
    ['1080p', 3440, 1440, 4 / 3],
    ['1080p', 1920, 1000, 1],
    ['1080p', 390, 844, 1],
  ] as const)('fits %s into %i × %i without shrinking smaller windows', (resolution, width, height, expected) => {
    expect(resolutionScale(resolution, width, height)).toBeCloseTo(expected);
  });
  it('persists the resolution and adapts to window/fullscreen changes without double-scaling', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(3840);
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(2160);
    const prefs = new DisplayPreferences();
    prefs.set({ resolution: '1080p' });
    expect(displayViewport()).toEqual({ width: 1920, height: 1080 });
    prefs.apply();
    expect(displayViewport()).toEqual({ width: 1920, height: 1080 });
    const restored = new DisplayPreferences();
    expect(restored.prefs.resolution).toBe('1080p');
    height.mockReturnValue(1440);
    window.dispatchEvent(new Event('resize'));
    expect(displayViewport().height).toBe(1080);
    height.mockReturnValue(2160);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(displayViewport()).toEqual({ width: 1920, height: 1080 });
    prefs.set({ resolution: 'native' });
    expect(document.documentElement.style.zoom).toBe('');
    prefs.dispose();
  });
  it.each(['{}', 'null', '{"resolution":"bogus"}', '{broken'])('uses native resolution for old or invalid preferences: %s', (saved) => {
    localStorage.setItem('__SR_DISPLAY__', saved);
    expect(new DisplayPreferences().prefs.resolution).toBe('native');
  });
});
