import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPreferences } from '../../src/sound/audio-preferences';
import { Sfx } from '../../src/sound/sfx-enum';
import SoundManager from '../../src/sound/sound-manager';

vi.mock('../../src/sound/tts-service', () => ({ default: { getInstance: () => ({ setPaused: vi.fn(), stop: vi.fn(), isSpeaking: () => false }) } }));
class AudioStub extends EventTarget {
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  loop = false;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  cloneNode() {
    return new AudioStub();
  }
}
beforeEach(() => {
  AudioPreferences.destroy();
  localStorage.clear();
  (SoundManager as any).instance = undefined;
});
afterEach(() => vi.unstubAllGlobals());
describe('audio mixing and pause', () => {
  it('updates playing equipment and UI levels independently and resumes equipment at its position', () => {
    const sounds: AudioStub[] = [];
    vi.stubGlobal(
      'Audio',
      class extends AudioStub {
        constructor() {
          super();
          sounds.push(this);
        }
      }
    );
    const audio = AudioPreferences.getInstance();
    audio.set({ masterVolume: 0.5, equipmentVolume: 0.4, uiVolume: 0.8 });
    const manager = SoundManager.getInstance();
    manager.play(Sfx.SMALL_MOTOR);
    manager.play(Sfx.UI_CLICK);
    expect(sounds[0].volume).toBeCloseTo(0.1);
    expect(sounds[1].volume).toBeCloseTo(0.14);
    audio.set({ equipmentVolume: 0 });
    expect(sounds[0].volume).toBe(0);
    expect(sounds[1].volume).toBeCloseTo(0.14);
    sounds[0].currentTime = 2;
    manager.setMenuPaused(true);
    expect(sounds[0].paused).toBe(true);
    manager.setMenuPaused(false);
    expect(sounds[0].currentTime).toBe(2);
    expect(sounds[0].paused).toBe(false);
  });
  it('holds voice audio that finishes downloading while paused and ignores superseded clips', async () => {
    const manager = SoundManager.getInstance();
    let finish!: (audio: AudioStub) => void;
    vi.spyOn(manager as any, 'loadAudio_').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    manager.playCustom('/voice.mp3');
    manager.setMenuPaused(true);
    const voice = new AudioStub();
    finish(voice);
    await Promise.resolve();
    expect(voice.play).not.toHaveBeenCalled();
    AudioPreferences.getInstance().set({ masterVolume: 0.5, voiceVolume: 0.6 });
    expect(voice.volume).toBeCloseTo(0.3);
    manager.setMenuPaused(false);
    expect(voice.play).toHaveBeenCalledOnce();
    manager.playCustom('/cancelled.mp3');
    manager.stopCustom();
    const cancelled = new AudioStub();
    finish(cancelled);
    await Promise.resolve();
    expect(cancelled.play).not.toHaveBeenCalled();
  });
});
