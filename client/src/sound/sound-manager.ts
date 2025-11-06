import { Sfx } from "./sfx-enum";

const SFX_FILE_MAP: Record<Sfx, string> = {
  [Sfx.POWER_ON]: '/sfx/startup-sound.mp3',
  [Sfx.SWITCH]: '/sfx/light-switch-flip.mp3',
  [Sfx.TOGGLE_OFF]: '/sfx/toggle-button-off.mp3',
  [Sfx.TOGGLE_ON]: '/sfx/toggle-button-on.mp3',
};

class SoundManager {
  private static instance: SoundManager;
  private readonly audioCache: Map<Sfx, HTMLAudioElement> = new Map();

  private constructor() { }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public play(sfx: Sfx): void {
    let audio = this.audioCache.get(sfx);
    if (audio) {
      // Create a clone to allow overlapping sounds
      audio = audio.cloneNode(true) as HTMLAudioElement;
    } else {
      const src = SFX_FILE_MAP[sfx];
      if (!src) return;
      audio = new Audio(src);
      this.audioCache.set(sfx, audio);
    }
    audio.currentTime = 0;
    audio.play();
  }
}

export default SoundManager;