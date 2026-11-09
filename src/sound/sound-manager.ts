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
const UI_SOUNDS = new Set([
  Sfx.UI_CLICK,
  Sfx.UI_BACK,
  Sfx.ACHIEVEMENT,
  Sfx.UI_CONFIRM,
  Sfx.UI_ERROR,
  Sfx.NOTIFY,
  Sfx.OBJECTIVE_COMPLETE,
  Sfx.SCENARIO_COMPLETE,
  Sfx.SCENARIO_FAILED,
  Sfx.TIMER_WARNING,
  Sfx.PENALTY,
]);

const SFX_DEFS: Record<Sfx, SfxDef> = {
  [Sfx.UI_BACK]: { files: ['/sfx/ui-click.mp3'], volume: 0.35, throttleMs: 100 },
  [Sfx.ACHIEVEMENT]: { files: ['/sfx/ui-confirm.ogg'], volume: 0.25, throttleMs: 800 },
  [Sfx.HPA_WARMUP]: { files: [sfx('hpa-warmup')], volume: 0.5, throttleMs: 1000, restart: true },
  [Sfx.ON_TARGET]: { files: [sfx('on-target')], volume: 0.45, throttleMs: 1200 },
  [Sfx.STATIC_BURST]: { files: [sfx('static-burst')], volume: 0.35, throttleMs: 3000 },
  [Sfx.RAIN_ARRIVAL]: { files: [sfx('rain-arrival')], volume: 0.25, throttleMs: 5000 },
  [Sfx.WAVEGUIDE]: { files: [sfx('waveguide')], volume: 0.5, throttleMs: 700 },
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
  [Sfx.UPS_BEEP]: { files: [sfx('ups-beep')], volume: 0.25, throttleMs: 1000 },
  [Sfx.BREAKER_TRIP]: { files: [sfx('breaker-trip')], volume: 0.7, throttleMs: 500 },
  [Sfx.BREAKER_RESET]: { files: [sfx('breaker-reset')], volume: 0.7, throttleMs: 500 },
  [Sfx.FAN_SPINDOWN]: { files: [sfx('fan-spindown')], volume: 0.6, throttleMs: 2000 },
  [Sfx.UI_CLICK]: { files: [sfx('ui-click')], volume: 0.35, throttleMs: 80 },
  [Sfx.UI_CONFIRM]: { files: ['/sfx/ui-confirm.ogg'], volume: 0.5, throttleMs: 300 },
  [Sfx.UI_ERROR]: { files: ['/sfx/ui-error.ogg'], volume: 0.5, throttleMs: 300 },
  [Sfx.NOTIFY]: { files: ['/sfx/notify.ogg'], volume: 0.5, throttleMs: 1000 },
  [Sfx.OBJECTIVE_COMPLETE]: { files: [sfx('objective-complete')], volume: 0.6, throttleMs: 800 },
  [Sfx.SCENARIO_COMPLETE]: { files: [sfx('scenario-complete')], volume: 0.7, throttleMs: 3000 },
  [Sfx.SCENARIO_FAILED]: { files: [sfx('scenario-failed')], volume: 0.7, throttleMs: 3000 },
  [Sfx.TIMER_WARNING]: { files: [sfx('timer-warning')], volume: 0.7, throttleMs: 2000 },
  [Sfx.PENALTY]: { files: [sfx('penalty')], volume: 0.6, throttleMs: 800 },
  [Sfx.PRINTER]: { files: [sfx('printer')], volume: 0.5, throttleMs: 4000 },
  [Sfx.PHONE_RING]: { files: [sfx('phone-ring')], volume: 0.6, throttleMs: 3000 },
  [Sfx.DOOR_BADGE]: { files: [sfx('door-badge')], volume: 0.5, throttleMs: 1000 },
  [Sfx.DOOR_HEAVY]: { files: [sfx('door-heavy')], volume: 0.6, throttleMs: 2000 },
  [Sfx.KEY_LOCK]: { files: [sfx('key-lock')], volume: 0.6, throttleMs: 500 },
  [Sfx.CABINET_DOOR]: { files: [sfx('cabinet-door')], volume: 0.6, throttleMs: 1000 },
  [Sfx.CONNECTOR_SEAT]: { files: [sfx('connector-seat')], volume: 1.0, throttleMs: 200 },
  [Sfx.CONNECTOR_PULL]: { files: [sfx('connector-pull')], volume: 1.0, throttleMs: 200 },
  [Sfx.FCONNECTOR_TIGHTEN]: { files: [sfx('fconnector-tighten')], volume: 0.6, throttleMs: 300 },
  [Sfx.CABLE_RUSTLE]: { files: [sfx('cable-rustle')], volume: 1.0, throttleMs: 300 },
  [Sfx.PROBE_BEEP]: { files: [sfx('probe-beep')], volume: 0.55, throttleMs: 300 },
  [Sfx.CABLE_TESTER_BEEPS]: { files: [sfx('cable-tester-beeps')], volume: 0.55, throttleMs: 500 },
  [Sfx.CASE_SWAP]: { files: [sfx('case-swap')], volume: 1.0, throttleMs: 300 },
  [Sfx.POWER_CYCLE]: { files: [sfx('power-cycle')], volume: 0.6, throttleMs: 300 },
  [Sfx.TENT_EXIT]: { files: [sfx('tent-exit')], volume: 0.6, throttleMs: 500 },
  [Sfx.TENT_ENTER]: { files: [sfx('tent-enter')], volume: 1.0, throttleMs: 500 },
  [Sfx.REFUEL_POUR]: { files: [sfx('refuel-pour')], volume: 0.6, throttleMs: 500 },
  [Sfx.SPOTTED_WHISTLE]: { files: [sfx('spotted-whistle')], volume: 0.6, throttleMs: 1000 },
  [Sfx.AMB_YARD]: { files: [sfx('amb-yard')], volume: 0.35, throttleMs: 0, loop: true },
  [Sfx.AMB_TENT]: { files: [sfx('amb-tent')], volume: 0.3, throttleMs: 0, loop: true },
  [Sfx.GENERATOR_STEADY_OUT]: { files: [sfx('generator-steady')], volume: 0.5, throttleMs: 0, loop: true },
  [Sfx.GENERATOR_STEADY_IN]: { files: [sfx('generator-steady')], volume: 0.18, throttleMs: 0, loop: true },
  [Sfx.GENERATOR_ROUGH_OUT]: { files: [sfx('generator-rough')], volume: 0.5, throttleMs: 0, loop: true },
  [Sfx.GENERATOR_ROUGH_IN]: { files: [sfx('generator-rough')], volume: 0.18, throttleMs: 0, loop: true },
};

class SoundManager {
  private static instance: SoundManager;
  private readonly audioCache: Map<string, HTMLAudioElement> = new Map();
  private readonly lastPlayTime: Map<Sfx, number> = new Map();
  private readonly currentlyPlaying: Map<Sfx, HTMLAudioElement> = new Map();
  private customAudio: HTMLAudioElement | null = null;
  private readonly customAudioCache: Map<string, HTMLAudioElement> = new Map();
  private readonly pendingAudio_ = new Map<string, Promise<HTMLAudioElement>>();
  private ttsEnabled_: boolean = false;
  private menuPaused_ = false;
  private missionActive_ = true;
  private customGeneration_ = 0;
  private readonly activeSounds_ = new Map<HTMLAudioElement, Sfx>();
  private readonly pausedSounds_ = new Set<HTMLAudioElement>();

  private constructor() {
    AudioPreferences.getInstance().onChange(() => this.applyVolumes_());
  }

  private applyVolumes_(): void {
    const prefs = AudioPreferences.getInstance();
    for (const [audio, sound] of this.activeSounds_) audio.volume = SFX_DEFS[sound].volume * prefs.volume(UI_SOUNDS.has(sound) ? 'ui' : 'equipment');
    if (this.customAudio) this.customAudio.volume = prefs.volume('voice');
  }

  setMenuPaused(paused: boolean): void {
    if (paused === this.menuPaused_) return;
    this.menuPaused_ = paused;
    if (paused) {
      for (const audio of [...this.activeSounds_.keys(), ...(this.customAudio ? [this.customAudio] : [])]) {
        if (!audio.paused && !audio.ended) {
          this.pausedSounds_.add(audio);
          audio.pause();
        }
      }
    } else {
      for (const audio of this.pausedSounds_) void audio.play().catch(() => undefined);
      this.pausedSounds_.clear();
    }
    TtsService.getInstance().setPaused(paused);
  }

  setTtsEnabled(enabled: boolean): void {
    this.ttsEnabled_ = enabled;
  }

  isTtsEnabled(): boolean {
    return this.ttsEnabled_;
  }

  /** End equipment playback, including overlapping sounds and paused loops. UI cues remain available. */
  setMissionActive(active: boolean): void {
    this.missionActive_ = active;
    if (active) return;
    const sounds = new Map(this.activeSounds_);
    for (const [sound, audio] of this.currentlyPlaying) sounds.set(audio, sound);
    for (const [audio, sound] of sounds) {
      if (UI_SOUNDS.has(sound)) continue;
      audio.pause();
      audio.currentTime = 0;
      this.activeSounds_.delete(audio);
      this.pausedSounds_.delete(audio);
      if (this.currentlyPlaying.get(sound) === audio) this.currentlyPlaying.delete(sound);
    }
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  play(sfx: Sfx): void {
    const def = SFX_DEFS[sfx];
    if (!def || !AudioPreferences.getInstance().sfxEnabled || ((!this.missionActive_ || this.menuPaused_) && !UI_SOUNDS.has(sfx))) {
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
        this.activeSounds_.delete(playing);
        this.pausedSounds_.delete(playing);
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

    this.activeSounds_.set(audio, sfx);
    if (!isLooping)
      audio.addEventListener(
        'ended',
        () => {
          this.activeSounds_.delete(audio);
          if (this.currentlyPlaying.get(sfx) === audio) this.currentlyPlaying.delete(sfx);
        },
        { once: true }
      );
    audio.volume = def.volume * AudioPreferences.getInstance().volume(UI_SOUNDS.has(sfx) ? 'ui' : 'equipment');
    audio.currentTime = 0;
    audio.play().catch((err: unknown) => {
      this.activeSounds_.delete(audio);
      if (this.currentlyPlaying.get(sfx) === audio) this.currentlyPlaying.delete(sfx);
      // NotAllowedError: no user gesture yet (autoplay policy); AbortError: paused before it started
      const name = (err as { name?: string } | null)?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        console.warn(`Could not play sound ${src}`);
      }
    });

    // Track currently playing audio for restart-enabled or looping sounds
    if (def.restart || isLooping) {
      this.currentlyPlaying.set(sfx, audio);
    }

    this.lastPlayTime.set(sfx, Date.now());
  }

  stop(sfx: Sfx): void {
    const playing = this.currentlyPlaying.get(sfx);
    if (playing) {
      this.pausedSounds_.delete(playing);
      this.activeSounds_.delete(playing);
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
    const generation = ++this.customGeneration_;
    // Stop any currently playing custom audio or TTS
    if (this.customAudio) {
      this.pausedSounds_.delete(this.customAudio);
      this.customAudio.pause();
      this.customAudio.currentTime = 0;
    }
    TtsService.getInstance().stop();

    // Try to load and play audio
    this.loadAudio_(audioUrl)
      .then((audio) => {
        if (generation !== this.customGeneration_) return;
        audio.currentTime = 0;
        audio.volume = AudioPreferences.getInstance().volume('voice');
        if (this.menuPaused_) this.pausedSounds_.add(audio);
        else
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
        if (generation !== this.customGeneration_) return;
        // Audio failed to load, use TTS fallback
        console.warn(`Audio file not found: ${audioUrl}. Using TTS fallback.`);
        this.tryTtsFallback_(fallbackText, onTtsFallback);
      });
  }

  private loadAudio_(audioUrl: string): Promise<HTMLAudioElement> {
    const pending = this.pendingAudio_.get(audioUrl);
    if (pending) return pending.then((audio) => audio.cloneNode(true) as HTMLAudioElement);
    const loading = new Promise<HTMLAudioElement>((resolve, reject) => {
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
        clearTimeout(timeout);
        audio.removeEventListener('canplaythrough', handleCanPlay);
        audio.removeEventListener('error', handleError);
      };

      audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      const timeout = setTimeout(handleError, 15_000);
      audio.src = audioUrl;
      audio.load();
    });
    this.pendingAudio_.set(audioUrl, loading);
    void loading.finally(() => this.pendingAudio_.delete(audioUrl)).catch(() => {});
    return loading;
  }

  /** Warm the existing voice cache without starting speech or fallback TTS. */
  preloadVoice(audioUrl: string): void {
    if (audioUrl && !this.customAudioCache.has(audioUrl)) void this.loadAudio_(audioUrl).catch(() => {});
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
    ++this.customGeneration_;
    // Stop TTS if active
    TtsService.getInstance().stop();

    if (this.customAudio) {
      this.pausedSounds_.delete(this.customAudio);
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
