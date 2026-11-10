/**
 * @file strings - Lookup for every user-facing string of the SkyLink app (phase 40, WP8)
 * @description The strings live in `src/locales/en.json` under `skylink.*`, the game's own
 * localisation bundle (see `src/locales/i18n.ts`). A Ukrainian bundle adds the same `skylink.*`
 * keys under its language code; `t7e()` follows the active language and falls back to English.
 * Wording rules: short sentences, no idioms, and never the true cause of a fault (D5).
 * `{{name}}` marks a value filled in by `tr()`. Keys here are written without the `skylink.` prefix.
 */
import type en from '@app/locales/en.json';
import { t7e } from '@app/locales/i18n';

type SkylinkBundle = typeof en.skylink;
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Leaves<T> = T extends object ? { [K in keyof T]: T[K] extends object ? Join<K, Leaves<T[K]>> : K }[keyof T] : never;

/** A dotted key into `skylink.*` of the locale bundle */
export type TerminalStringKey = Leaves<SkylinkBundle>;

/** Looks a string up in the active language and fills `{{name}}` values */
export function tr(key: TerminalStringKey, vars: Record<string, string | number> = {}): string {
  return t7e(`skylink.${key}`, vars);
}

/** "20 s", "5 min" or "1 h 5 min" for an age or duration in seconds */
export function formatAge(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total} s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** A dotted key into `eurosat.*` of the locale bundle (the EuroSat modem app, Campaign 6) */
export type ModemStringKey = Leaves<typeof en.eurosat>;

/** Looks an EuroSat modem app string up in the active language and fills `{{name}}` values */
export function trModem(key: ModemStringKey, vars: Record<string, string | number> = {}): string {
  return t7e(`eurosat.${key}`, vars);
}
