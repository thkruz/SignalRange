import type { PluginConfiguration } from '@app/plugins/plugin-configuration';

/**
 * User-level settings that survive a reload. Kept deliberately small: the
 * plugin system is the first consumer, and the override mechanism exists so
 * the plugin CLI's `dev` command can boot the app with exactly one plugin.
 */
export interface SignalRangeSettings {
  /** Per-plugin configuration keyed by plugin id. */
  plugins: Record<string, PluginConfiguration>;
  /**
   * When true, only plugins explicitly enabled in `plugins` load (plus any the
   * manifest marks alwaysEnabled). Used by the dev harness to isolate a plugin.
   */
  isStrictPluginList: boolean;
  /** Active UI language; only 'en' is bundled today. */
  language: string;
}

/** Shape accepted from window.settingsOverride and ?settingsOverride=. */
export interface SettingsOverride {
  plugins?: Record<string, Partial<PluginConfiguration>>;
  isStrictPluginList?: boolean;
  language?: string;
}

interface PersistedSettings {
  plugins: Record<string, PluginConfiguration>;
  language?: string;
}

declare global {
  interface Window {
    /** Injected before boot (the plugin dev harness does this via an init script). */
    settingsOverride?: SettingsOverride;
  }
}

export type SettingsOverrideSource = 'url' | 'window' | null;

/**
 * Resolution order, lowest to highest precedence:
 *   manifest defaults  →  localStorage (user toggles)  →  window.settingsOverride  →  ?settingsOverride=
 *
 * Overrides are session-only and never written back to storage.
 */
export class SettingsManager {
  static readonly STORAGE_KEY = '__SR_SETTINGS__';
  static readonly URL_PARAM = 'settingsOverride';
  private static instance_: SettingsManager | null = null;

  readonly settings: SignalRangeSettings = { plugins: {}, isStrictPluginList: false, language: 'en' };

  private readonly defaults_ = new Map<string, PluginConfiguration>();
  private persisted_: PersistedSettings = { plugins: {} };
  private override_: SettingsOverride | null = null;
  private overrideSource_: SettingsOverrideSource = null;

  private constructor() {
    this.persisted_ = SettingsManager.readPersisted_();
    this.readOverride_();
    this.recompute_();
  }

  static getInstance(): SettingsManager {
    SettingsManager.instance_ ??= new SettingsManager();

    return SettingsManager.instance_;
  }

  /** Test seam. */
  static destroy(): void {
    SettingsManager.instance_ = null;
  }

  /** Where the active override came from, if any. */
  get overrideSource(): SettingsOverrideSource {
    return this.overrideSource_;
  }

  /**
   * Seed plugin defaults from the manifest. Idempotent; called by the
   * PluginManager before it decides what to load.
   */
  applyPluginDefaults(defaults: Iterable<[string, PluginConfiguration]>): void {
    for (const [id, config] of defaults) {
      this.defaults_.set(id, { ...config });
    }
    this.recompute_();
  }

  isPluginEnabled(id: string): boolean {
    const config = this.settings.plugins[id];

    if (this.settings.isStrictPluginList) {
      // Strict mode is the dev harness isolating one plugin: only ids the
      // override itself names count, never a default or a persisted toggle.
      return this.override_?.plugins?.[id]?.enabled === true;
    }

    return config?.enabled ?? false;
  }

  /** Persist a user toggle. Takes effect on the next load of the plugin set. */
  setPluginEnabled(id: string, enabled: boolean): void {
    const current = this.settings.plugins[id] ?? this.defaults_.get(id) ?? { enabled };

    this.persisted_.plugins[id] = { ...current, enabled };
    this.savePersisted_();
    this.recompute_();
  }

  /** Forget every user toggle (overrides are untouched). */
  clearPersisted(): void {
    this.persisted_ = { plugins: {} };
    this.savePersisted_();
    this.recompute_();
  }

  /** Encode an override for a `?settingsOverride=` link (base64url of JSON). */
  static encodeOverride(override: SettingsOverride): string {
    const json = JSON.stringify(override);
    const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/gu, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

    return btoa(utf8).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/[=]+$/u, '');
  }

  /** Inverse of encodeOverride. Returns null on any decoding or shape error. */
  static decodeOverride(encoded: string): SettingsOverride | null {
    try {
      const b64 = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const utf8 = atob(padded);
      const json = decodeURIComponent(
        utf8
          .split('')
          .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('')
      );
      const parsed: unknown = JSON.parse(json);

      return SettingsManager.isOverrideShape_(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private static isOverrideShape_(value: unknown): value is SettingsOverride {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    if ('plugins' in candidate && (candidate.plugins === null || typeof candidate.plugins !== 'object')) {
      return false;
    }
    if ('isStrictPluginList' in candidate && typeof candidate.isStrictPluginList !== 'boolean') {
      return false;
    }
    if ('language' in candidate && typeof candidate.language !== 'string') {
      return false;
    }

    return true;
  }

  private static readPersisted_(): PersistedSettings {
    try {
      const raw = globalThis.localStorage?.getItem(SettingsManager.STORAGE_KEY);

      if (!raw) {
        return { plugins: {} };
      }

      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;

      return { plugins: parsed.plugins ?? {}, language: parsed.language };
    } catch {
      return { plugins: {} };
    }
  }

  private savePersisted_(): void {
    try {
      globalThis.localStorage?.setItem(SettingsManager.STORAGE_KEY, JSON.stringify(this.persisted_));
    } catch {
      // Storage unavailable (private mode, quota); the in-memory settings still apply this session.
    }
  }

  private readOverride_(): void {
    const fromUrl = SettingsManager.readUrlOverride_();

    if (fromUrl) {
      this.override_ = fromUrl;
      this.overrideSource_ = 'url';

      return;
    }

    const fromWindow = typeof window !== 'undefined' ? window.settingsOverride : undefined;

    if (fromWindow && SettingsManager.isOverrideShape_(fromWindow)) {
      this.override_ = fromWindow;
      this.overrideSource_ = 'window';
    }
  }

  private static readUrlOverride_(): SettingsOverride | null {
    try {
      const search = globalThis.location?.search;

      if (!search) {
        return null;
      }

      const encoded = new URLSearchParams(search).get(SettingsManager.URL_PARAM);

      if (!encoded) {
        return null;
      }

      const decoded = SettingsManager.decodeOverride(encoded);

      if (!decoded) {
        console.warn(`[settings] ignoring malformed ?${SettingsManager.URL_PARAM}= value`);
      }

      return decoded;
    } catch {
      return null;
    }
  }

  private recompute_(): void {
    const plugins: Record<string, PluginConfiguration> = {};

    for (const [id, config] of this.defaults_) {
      plugins[id] = { ...config };
    }
    for (const [id, config] of Object.entries(this.persisted_.plugins)) {
      plugins[id] = { ...(plugins[id] ?? { enabled: false }), ...config };
    }
    for (const [id, config] of Object.entries(this.override_?.plugins ?? {})) {
      plugins[id] = { ...(plugins[id] ?? { enabled: false }), ...config };
    }

    this.settings.plugins = plugins;
    this.settings.isStrictPluginList = this.override_?.isStrictPluginList ?? false;
    this.settings.language = this.override_?.language ?? this.persisted_.language ?? 'en';
  }
}
