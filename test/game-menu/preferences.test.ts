import { beforeEach, describe, expect, it } from 'vitest';
import { DisplayPreferences } from '../../src/game-menu/display-preferences';
import { AudioPreferences } from '../../src/sound/audio-preferences';

beforeEach(() => {
  localStorage.clear();
  AudioPreferences.destroy();
});
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
    new DisplayPreferences().set({ textSize: 'largest', reducedMotion: true });
    const restored = new DisplayPreferences();
    restored.apply();
    expect(restored.prefs).toEqual({ textSize: 'largest', reducedMotion: true });
    expect(document.documentElement.dataset.textSize).toBe('largest');
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    restored.set({ textSize: 'standard', reducedMotion: false });
  });
});
