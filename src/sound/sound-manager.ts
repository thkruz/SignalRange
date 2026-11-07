import { AudioPreferences } from './audio-preferences';
import { Sfx } from './sfx-enum';
import TtsService from './tts-service';

/**
 * One entry per sound. Files are trimmed and loudness-matched offline
 * (art-review/sfx-review/prepare.py), so `volume` only sets the mix.
 * Several files make a pool: each play picks one at random.
 */
interface SfxDef {
  files: readonly string[];
  volume: number;
  /** Minimum ms between plays; ignored for restart and loop sounds */
  throttleMs: number;
  /** Stop and restart the sound if it is already playing */
  restart?: boolean;
  /** Loop until stop() */
  loop?: boolean;
}

const sfx = (name: string): string => `/sfx/${name}.mp3`;

const SFX_DEFS: Record<Sfx, SfxDef> = {
  [Sfx.POWER_ON]: { files: [sfx('power-on')], volume: 0.7, throttleMs: 0, restart: true },
  [Sfx.SWITCH]: { files: [sfx('switch')], volume: 0.6, throttleMs: 200 },
  [Sfx.TOGGLE_OFF]: { files: [sfx('toggle-off')], volume: 0.6, throttleMs: 150 },
  [Sfx.TOGGLE_ON]: { files: [sfx('toggle-on')], volume: 0.6, throttleMs: 150 },
  [Sfx.SMALL_MOTOR]: { files: [sfx('small-motor')], volume: 0.5, throttleMs: 200, loop: true },
  [Sfx.SPEC_A_BTN_PRESS]: { files: [sfx('button-press')], volume: 0.6, throttleMs: 150 },
  [Sfx.KNOB]: { files: [sfx('knob')], volume: 0.3, throttleMs: 100 },
  [Sfx.KEYPRESS]: { files: [sfx('keypress')], volume: 0.5, throttleMs: 60 },
  [Sfx.RELAY_CLUNK]: { files: [sfx('relay-clunk')], volume: 0.6, throttleMs: 200 },
  [Sfx.FAULT]: { files: [sfx('fault')], volume: 0.8, throttleMs: 500 },
  [Sfx.ALARM_MAJOR]: { files: [sfx('alarm-major')], volume: 1, throttleMs: 1500 },
  [Sfx.ALARM_MINOR]: { files: [sfx('alarm-minor')], volume: 0.8, throttleMs: 1500 },
  [Sfx.ALARM_ACK]: { files: [sfx('alarm-ack')], volume: 0.6, throttleMs: 300 },
  [Sfx.TX_ON]: { files: [sfx('tx-on')], volume: 0.6, throttleMs: 300 },
  [Sfx.TX_OFF]: { files: [sfx('tx-off')], volume: 0.6, throttleMs: 300 },
  [Sfx.ZEROIZE]: { files: [sfx('zeroize')], volume: 0.7, throttleMs: 1000 },
  [Sfx.UPS_BEEP]: { files: [sfx('ups-beep')], volume: 0.35, throttleMs: 1000 },
  [Sfx.BREAKER_TRIP]: { files: [sfx('breaker-trip')], volume: 0.7, throttleMs: 500 },
  [Sfx.BREAKER_RESET]: { files: [sfx('breaker-reset')], volume: 0.7, throttleMs: 500 },
  [Sfx.FAN_SPINDOWN]: { files: [sfx('fan-spindown')], volume: 0.6, throttleMs: 2000 },
  [Sfx.UI_CLICK]: { files: [sfx('ui-click')], volume: 0.35, throttleMs: 80 },
  [Sfx.UI_CONFIRM]: { files: [sfx('ui-confirm')], volume: 0.5, throttleMs: 300 },
  [Sfx.UI_ERROR]: { files: [sfx('ui-error')], volume: 0.5, throttleMs: 300 },
  [Sfx.NOTIFY]: { files: [sfx('notify')], volume: 0.5, throttleMs: 1000 },
  [Sfx.OBJECTIVE_COMPLETE]: { files: [sfx('objective-complete')], volume: 0.6, throttleMs: 800 },
  [Sfx.SCENARIO_COMPLETE]: { files: [sfx('scenario-complete')], volume: 0.7, throttleMs: 3000 },
  [Sfx.SCENARIO_FAILED]: { files: [sfx('scenario-failed')], volume: 0.7, throttleMs: 3000 },
  [Sfx.TIMER_WARNING]: { files: [sfx('timer-warning')], volume: 0.7, throttleMs: 2000 },
  [Sfx.PENALTY]: { files: [sfx('penalty')], volume: 0.6, throttleMs: 800 },
  [Sfx.PRINTER]: { files: [sfx('printer')], volume: 0.5, throttleMs: 4000 },
  [Sfx.PHONE_RING]: { files: [sfx('phone-ring')], volume: 0.6, throttleMs: 3000 },
  [Sfx.RADIO_CALL_IN]: { files: [sfx('radio-call-in')], volume: 0.6, throttleMs: 1000 },
  [Sfx.RADIO_CALL_OUT]: { files: [sfx('radio-call-out')], volume: 0.6, throttleMs: 1000 },
  [Sfx.DOOR_BADGE]: { files: [sfx('door-badge')], volume: 0.5, throttleMs: 1000 },
  [Sfx.DOOR_HEAVY]: { files: [sfx('door-heavy')], volume: 0.6, throttleMs: 2000 },
  [Sfx.KEY_LOCK]: { files: [sfx('key-lock')], volume: 0.6, throttleMs: 500 },
  [Sfx.CABINET_DOOR]: { files: [sfx('cabinet-door')], volume: 0.6, throttleMs: 1000 },
};

class SoundManager {
  private static instance: SoundManager;
  private readonly audioCache: Map<string, HTMLAudioElement> = new Map();
  private readonly lastPlayTime: Map<Sfx, number> = new Map();
  private readonly currentlyPlaying: Map<Sfx, HTMLAudioElement> = new Map();
  private customAudio: HTMLAudioElement | null = null;
  private readonly customAudioCache: Map<string, HTMLAudioElement> = new Map();
  private ttsEnabled_: boolean = false;

  private constructor() {}

  setTtsEnabled(enabled: boolean): void {
    this.ttsEnabled_ = enabled;
  }

  isTtsEnabled(): boolean {
    return this.ttsEnabled_;
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  play(sfx: Sfx): void {
    const def = SFX_DEFS[sfx];
    if (!def || !AudioPreferences.getInstance().sfxEnabled) {
      return;
    }
    const isLooping = def.loop === true;

    // If sound is looping and already playing, don't restart
    if (isLooping && this.currentlyPlaying.has(sfx)) {
      return;
    }

    if (def.restart) {
      const playing = this.currentlyPlaying.get(sfx);
      if (playing) {
        playing.pause();
        playing.currentTime = 0;
        this.currentlyPlaying.delete(sfx);
      }
    } else if (!isLooping) {
      const lastPlay = this.lastPlayTime.get(sfx) || 0;
      if (Date.now() - lastPlay < def.throttleMs) {
        return; // Throttled
      }
    }

    const src = def.files.length === 1 ? def.files[0] : def.files[Math.floor(Math.random() * def.files.length)];
    let audio = this.audioCache.get(src);
    if (audio) {
      // Create a clone to allow overlapping sounds
      audio = audio.cloneNode(true) as HTMLAudioElement;
    } else {
      audio = new Audio(src);
      this.audioCache.set(src, audio);
    }

    if (isLooping) {
      audio.loop = true;
    }

    audio.volume = def.volume;
    audio.currentTime = 0;
    audio.play().catch((err: unknown) => {
      // NotAllowedError: no user gesture yet (autoplay policy); AbortError: paused before it started
      const name = (err as { name?: string } | null)?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        console.warn(`Could not play sound ${src}`);
      }
    });

    // Track currently playing audio for restart-enabled or looping sounds
    if (def.restart || isLooping) {
      this.currentlyPlaying.set(sfx, audio);
      if (!isLooping) {
        audio.addEventListener('ended', () => {
          this.currentlyPlaying.delete(sfx);
        });
      }
    }

    this.lastPlayTime.set(sfx, Date.now());
  }

  stop(sfx: Sfx): void {
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

  playCustom(audioUrl: string, fallbackText?: string, onTtsFallback?: (isTts: boolean) => void): void {
    // Stop any currently playing custom audio or TTS
    if (this.customAudio) {
      this.customAudio.pause();
      this.customAudio.currentTime = 0;
    }
    TtsService.getInstance().stop();

    // Try to load and play audio
    this.loadAudio_(audioUrl)
      .then((audio) => {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Playback failed (e.g., user hasn't interacted with page)
          this.tryTtsFallback_(fallbackText, onTtsFallback);
        });

        this.customAudio = audio;
        onTtsFallback?.(false);

        // Clean up reference when audio ends
        audio.addEventListener('ended', () => {
          if (this.customAudio === audio) {
            this.customAudio = null;
          }
        });
      })
      .catch(() => {
        // Audio failed to load, use TTS fallback
        console.warn(`Audio file not found: ${audioUrl}. Using TTS fallback.`);
        this.tryTtsFallback_(fallbackText, onTtsFallback);
      });
  }

  private loadAudio_(audioUrl: string): Promise<HTMLAudioElement> {
    return new Promise((resolve, reject) => {
      // Check cache first
      const cached = this.customAudioCache.get(audioUrl);
      if (cached) {
        // Clone cached audio
        resolve(cached.cloneNode(true) as HTMLAudioElement);
        return;
      }

      // Create new audio element
      const audio = new Audio();

      const handleCanPlay = () => {
        cleanup();
        this.customAudioCache.set(audioUrl, audio.cloneNode(true) as HTMLAudioElement);
        resolve(audio);
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to load audio: ${audioUrl}`));
      };

      const cleanup = () => {
        audio.removeEventListener('canplaythrough', handleCanPlay);
        audio.removeEventListener('error', handleError);
      };

      audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      audio.src = audioUrl;
      audio.load();
    });
  }

  private tryTtsFallback_(text?: string, onTtsFallback?: (isTts: boolean) => void): void {
    if (!this.ttsEnabled_) {
      return;
    }

    if (!text) {
      console.error('No fallback text provided for TTS');
      return;
    }

    const tts = TtsService.getInstance();
    if (!tts.isAvailable()) {
      console.error('TTS not available and audio failed to load');
      return;
    }

    this.customAudio = null;
    onTtsFallback?.(true);

    tts.speak(text);
  }

  stopCustom(): void {
    // Stop TTS if active
    TtsService.getInstance().stop();

    if (this.customAudio) {
      // Fade out over 300ms
      const fadeDuration = 300;
      const steps = 30;
      const stepTime = fadeDuration / steps;
      let currentStep = 0;
      const initialVolume = this.customAudio.volume;
      const audioToStop = this.customAudio;

      const fadeOut = () => {
        currentStep++;
        audioToStop.volume = initialVolume * (1 - currentStep / steps);
        if (currentStep < steps) {
          setTimeout(fadeOut, stepTime);
        } else {
          audioToStop.pause();
          audioToStop.currentTime = 0;
          audioToStop.volume = initialVolume;
          if (this.customAudio === audioToStop) {
            this.customAudio = null;
          }
        }
      };

      fadeOut();
    }
  }

  isCustomAudioPlaying(): boolean {
    // Check TTS first
    if (TtsService.getInstance().isSpeaking()) {
      return true;
    }
    // Check audio playback
    return this.customAudio !== null && !this.customAudio.paused && !this.customAudio.ended;
  }
}

export default SoundManager;
