import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_LOCALES_DIR = 'locales';

export interface LocaleReport {
  /** True when `<localesDir>/en.json` exists. */
  readonly hasEn: boolean;
  /** Set when en.json exists but is not valid JSON (or not an object). */
  readonly parseError?: string;
  /** Root keys other than `plugins` (plugins must stay in their own namespace). */
  readonly extraRoots: string[];
  /** Plugin ids with no `plugins.<id>` entry. */
  readonly missingIds: string[];
}

/** Normalize a manifest `localesDir` to a plain relative POSIX path. */
export function normalizeLocalesDir(localesDir: string | undefined): string {
  const raw = (localesDir ?? DEFAULT_LOCALES_DIR).replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '');

  return raw || DEFAULT_LOCALES_DIR;
}

/** Absolute path of a plugin's English bundle. */
export function enLocalePath(dir: string, localesDir: string | undefined): string {
  return join(dir, normalizeLocalesDir(localesDir), 'en.json');
}

/** True when the plugin ships an English bundle. */
export function hasEnLocale(dir: string, localesDir: string | undefined): boolean {
  return existsSync(enLocalePath(dir, localesDir));
}

/**
 * Check the English bundle of an installed plugin: it must exist, its only
 * root key must be `plugins`, and `plugins.<id>` must exist for every id.
 * Findings are advisory (doctor reports WARN, never FAIL).
 */
export function checkLocales(dir: string, ids: readonly string[], localesDir: string | undefined): LocaleReport {
  const file = enLocalePath(dir, localesDir);

  if (!existsSync(file)) {
    return { hasEn: false, extraRoots: [], missingIds: [...ids] };
  }

  let en: unknown;

  try {
    en = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { hasEn: true, parseError: (e as Error).message, extraRoots: [], missingIds: [...ids] };
  }

  if (en === null || typeof en !== 'object' || Array.isArray(en)) {
    return { hasEn: true, parseError: 'root must be a JSON object', extraRoots: [], missingIds: [...ids] };
  }

  const root = en as Record<string, unknown>;
  const plugins = root.plugins;
  const pluginsObj = plugins !== null && typeof plugins === 'object' && !Array.isArray(plugins) ? (plugins as Record<string, unknown>) : {};

  return {
    hasEn: true,
    extraRoots: Object.keys(root).filter((k) => k !== 'plugins'),
    missingIds: ids.filter((id) => !(id in pluginsObj)),
  };
}
