/**
 * Minimal localisation layer.
 *
 * Only English ships today, but every user-facing string introduced from
 * phase 17 onward goes through `t7e()` so that adding a second language is a
 * matter of adding a bundle, not touching components. Plugins contribute their
 * own strings under `plugins.<PluginId>.*` via `addLocaleBundle()`, which the
 * PluginManager calls before a plugin's `register()` runs.
 *
 * The API shape (t7e, SUPPORTED_LOCALES) mirrors keeptrack-space so the plugin
 * template reads the same in both projects.
 */
import en from './en.json';

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Leaves<T> = T extends object ? { [K in keyof T]: T[K] extends object ? Join<K, Leaves<T[K]>> : K }[keyof T] : never;

/**
 * A dotted key into en.json, with autocomplete, or any other string. The open
 * half exists because plugins add keys at runtime that the host cannot know.
 */
export type LocaleKey = Leaves<typeof en> | (string & {});

export interface LocaleInfo {
  /** BCP-47 base code */
  code: string;
  /** Endonym for language pickers */
  nativeName: string;
}

/** Bundled UI languages. Single source of truth for any language picker. */
export const SUPPORTED_LOCALES: LocaleInfo[] = [{ code: 'en', nativeName: 'English' }];

export const DEFAULT_LOCALE = 'en';

type Bundle = Record<string, unknown>;

const cloneBundle = (bundle: Bundle): Bundle => JSON.parse(JSON.stringify(bundle)) as Bundle;

let bundles_: Record<string, Bundle> = { [DEFAULT_LOCALE]: cloneBundle(en as Bundle) };
let language_ = DEFAULT_LOCALE;
const reportedMissing_ = new Set<string>();

export function currentLanguage(): string {
  return language_;
}

/** Switch the active language. Returns false (and keeps the current one) when the code is not bundled. */
export function setLanguage(code: string): boolean {
  if (!SUPPORTED_LOCALES.some((l) => l.code === code)) {
    return false;
  }
  language_ = code;

  return true;
}

function lookup_(bundle: Bundle | undefined, key: string): unknown {
  if (!bundle) {
    return undefined;
  }

  let node: unknown = bundle;

  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in (node as Bundle))) {
      return undefined;
    }
    node = (node as Bundle)[part];
  }

  return node;
}

function interpolate_(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/gu, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** True when `key` resolves to a string in the given (default: active) language. */
export function hasLocaleKey(key: string, lang: string = language_): boolean {
  return typeof lookup_(bundles_[lang], key) === 'string';
}

/**
 * Translate a key. Falls back to English, then to the key itself (reported once
 * to the console so a missing string is visible without crashing the UI).
 */
export function t7e(key: LocaleKey, params?: Record<string, string | number>): string {
  let raw = lookup_(bundles_[language_], key);

  if (typeof raw !== 'string' && language_ !== DEFAULT_LOCALE) {
    raw = lookup_(bundles_[DEFAULT_LOCALE], key);
  }

  if (typeof raw !== 'string') {
    if (!reportedMissing_.has(key)) {
      reportedMissing_.add(key);
      console.warn(`[i18n] missing locale key "${key}"`);
    }

    return key;
  }

  return params ? interpolate_(raw, params) : raw;
}

function deepMerge_(target: Bundle, source: Bundle): void {
  for (const [k, v] of Object.entries(source)) {
    // Plugin bundles are third-party JSON; JSON.parse makes __proto__ an own key
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      continue;
    }
    const existing = target[k];

    if (v !== null && typeof v === 'object' && !Array.isArray(v) && existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      deepMerge_(existing as Bundle, v as Bundle);
    } else {
      target[k] = v;
    }
  }
}

/**
 * Merge a bundle into a language. Later bundles win on conflict; plugins are
 * expected to keep to their own `plugins.<id>` namespace so nothing collides.
 */
export function addLocaleBundle(lang: string, bundle: Bundle): void {
  bundles_[lang] ??= {};
  deepMerge_(bundles_[lang], cloneBundle(bundle));
  reportedMissing_.clear();
}

/** Test seam: back to the bundled English only. */
export function resetLocales(): void {
  bundles_ = { [DEFAULT_LOCALE]: cloneBundle(en as Bundle) };
  language_ = DEFAULT_LOCALE;
  reportedMissing_.clear();
}
