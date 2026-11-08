/**
 * Player audio preferences: sound effects and room ambience, both on by
 * default. Stored per browser; a blocked or empty storage falls back to the
 * defaults without throwing.
 */
export interface AudioPrefs {
  sfx: boolean;
  ambience: boolean;
  masterVolume: number;
  voiceVolume: number;
  equipmentVolume: number;
  ambienceVolume: number;
  uiVolume: number;
}

export type VolumeChannel = 'master' | 'voice' | 'equipment' | 'ambience' | 'ui';
const DEFAULTS: AudioPrefs = { sfx: true, ambience: true, masterVolume: 1, voiceVolume: 1, equipmentVolume: 1, ambienceVolume: 1, uiVolume: 1 };
const clampVolume = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

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
    for (const key of ['masterVolume', 'voiceVolume', 'equipmentVolume', 'ambienceVolume', 'uiVolume'] as const) {
      this.prefs_[key] = clampVolume(this.prefs_[key], DEFAULTS[key]);
    }
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

  volume(channel: Exclude<VolumeChannel, 'master'>): number {
    if (channel === 'ambience' && !this.prefs_.ambience) return 0;
    if ((channel === 'equipment' || channel === 'ui') && !this.prefs_.sfx) return 0;
    return this.prefs_.masterVolume * this.prefs_[`${channel}Volume`];
  }

  private static read_(): AudioPrefs {
    const defaults: AudioPrefs = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(AudioPreferences.STORAGE_KEY);
      if (!raw) {
        return defaults;
      }
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;

      return {
        masterVolume: clampVolume(parsed.masterVolume, 1),
        voiceVolume: clampVolume(parsed.voiceVolume, 1),
        equipmentVolume: clampVolume(parsed.equipmentVolume, 1),
        ambienceVolume: clampVolume(parsed.ambienceVolume, 1),
        uiVolume: clampVolume(parsed.uiVolume, 1),
        sfx: typeof parsed.sfx === 'boolean' ? parsed.sfx : defaults.sfx,
        ambience: typeof parsed.ambience === 'boolean' ? parsed.ambience : defaults.ambience,
      };
    } catch {
      return defaults;
    }
  }
}
