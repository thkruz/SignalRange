import { Sfx } from "./sfx-enum";

const SFX_FILE_MAP: Record<Sfx, string> = {
  [Sfx.POWER_ON]: '/sfx/startup-sound.mp3',
  [Sfx.SWITCH]: '/sfx/light-switch-flip.mp3',
  [Sfx.TOGGLE_OFF]: '/sfx/toggle-button-off.mp3',
  [Sfx.TOGGLE_ON]: '/sfx/toggle-button-on.mp3',
  [Sfx.SMALL_MOTOR]: '/sfx/small-electronic-motor.mp3',
  [Sfx.SPEC_A_BTN_PRESS]: '/sfx/toggle-button-on.mp3',
  [Sfx.KNOB]: '/sfx/knob.mp3',
  [Sfx.FAULT]: '/sfx/fault.mp3',
};

// Throttle duration in milliseconds for each sound effect
const SFX_THROTTLE_MAP: Record<Sfx, number> = {
  [Sfx.POWER_ON]: 0, // No throttle - uses restart behavior instead
  [Sfx.SWITCH]: 200,
  [Sfx.TOGGLE_OFF]: 150,
  [Sfx.TOGGLE_ON]: 150,
  [Sfx.SMALL_MOTOR]: 200,
  [Sfx.SPEC_A_BTN_PRESS]: 150,
  [Sfx.KNOB]: 100,
  [Sfx.FAULT]: 500,
};

// Sounds that should restart if already playing (typically longer sounds)
const SFX_RESTART_ON_PLAY: Set<Sfx> = new Set([
  Sfx.POWER_ON,
]);

// Sounds that should loop until explicitly stopped
const SFX_LOOP: Set<Sfx> = new Set([
  Sfx.SMALL_MOTOR,
]);

class SoundManager {
  private static instance: SoundManager;
  private readonly audioCache: Map<Sfx, HTMLAudioElement> = new Map();
  private readonly lastPlayTime: Map<Sfx, number> = new Map();
  private readonly currentlyPlaying: Map<Sfx, HTMLAudioElement> = new Map();

  private constructor() { }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public play(sfx: Sfx): void {
    const isLooping = SFX_LOOP.has(sfx);

    // If sound is looping and already playing, don't restart
    if (isLooping && this.currentlyPlaying.has(sfx)) {
      return;
    }

    // Check if this sound should restart if already playing
    if (SFX_RESTART_ON_PLAY.has(sfx)) {
      const playing = this.currentlyPlaying.get(sfx);
      if (playing) {
        playing.pause();
        playing.currentTime = 0;
        this.currentlyPlaying.delete(sfx);
      }
    } else if (!isLooping) {
      // Check throttle for non-restart, non-looping sounds
      const now = Date.now();
      const lastPlay = this.lastPlayTime.get(sfx) || 0;
      const throttle = SFX_THROTTLE_MAP[sfx] || 0;

      if (now - lastPlay < throttle) {
        return; // Throttled
      }
    }

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

    // Set loop property for looping sounds
    if (isLooping) {
      audio.loop = true;
    }

    audio.currentTime = 0;
    audio.play();

    // Track currently playing audio for restart-enabled or looping sounds
    if (SFX_RESTART_ON_PLAY.has(sfx) || isLooping) {
      this.currentlyPlaying.set(sfx, audio);
      if (!isLooping) {
        audio.addEventListener('ended', () => {
          this.currentlyPlaying.delete(sfx);
        });
      }
    }

    // Update last play time
    this.lastPlayTime.set(sfx, Date.now());
  }

  public stop(sfx: Sfx): void {
    const playing = this.currentlyPlaying.get(sfx);
    if (playing) {
      // Fade out over 300ms
      const fadeDuration = 300;
      const steps = 30;
      const stepTime = fadeDuration / steps;
      let currentStep = 0;
      const initialVolume = playing.volume;

      const fadeOut = () => {
        currentStep++;
        playing.volume = initialVolume * (1 - currentStep / steps);
        if (currentStep < steps) {
          setTimeout(fadeOut, stepTime);
        } else {
          playing.pause();
          playing.currentTime = 0;
          playing.volume = initialVolume;
          this.currentlyPlaying.delete(sfx);
        }
      };

      fadeOut();
    }
  }
}

export default SoundManager;