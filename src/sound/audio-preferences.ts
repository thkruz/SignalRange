/**
 * Player audio preferences: sound effects and room ambience, both on by
 * default. Stored per browser; a blocked or empty storage falls back to the
 * defaults without throwing.
 */
export interface AudioPrefs {
  sfx: boolean;
  ambience: boolean;
}

type Listener = (prefs: Readonly<AudioPrefs>) => void;

export class AudioPreferences {
  static readonly STORAGE_KEY = '__SR_AUDIO__';
  private static instance_: AudioPreferences | null = null;

  private prefs_: AudioPrefs;
  private readonly listeners_ = new Set<Listener>();

  private constructor() {
    this.prefs_ = AudioPreferences.read_();
  }

  static getInstance(): AudioPreferences {
    AudioPreferences.instance_ ??= new AudioPreferences();

    return AudioPreferences.instance_;
  }

  static destroy(): void {
    AudioPreferences.instance_ = null;
  }

  get prefs(): Readonly<AudioPrefs> {
    return this.prefs_;
  }

  get sfxEnabled(): boolean {
    return this.prefs_.sfx;
  }

  get ambienceEnabled(): boolean {
    return this.prefs_.ambience;
  }

  set(update: Partial<AudioPrefs>): void {
    this.prefs_ = { ...this.prefs_, ...update };
    try {
      localStorage.setItem(AudioPreferences.STORAGE_KEY, JSON.stringify(this.prefs_));
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    for (const listener of this.listeners_) {
      listener(this.prefs_);
    }
  }

  /** Returns an unsubscribe function. */
  onChange(listener: Listener): () => void {
    this.listeners_.add(listener);

    return () => this.listeners_.delete(listener);
  }

  private static read_(): AudioPrefs {
    const defaults: AudioPrefs = { sfx: true, ambience: true };
    try {
      const raw = localStorage.getItem(AudioPreferences.STORAGE_KEY);
      if (!raw) {
        return defaults;
      }
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;

      return {
        sfx: typeof parsed.sfx === 'boolean' ? parsed.sfx : defaults.sfx,
        ambience: typeof parsed.ambience === 'boolean' ? parsed.ambience : defaults.ambience,
      };
    } catch {
      return defaults;
    }
  }
}
