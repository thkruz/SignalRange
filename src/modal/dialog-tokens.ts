/**
 * @file dialog-tokens - Author tokens filled in when a dialog is shown
 * @description A notice header that names a clock time ("[Regulator coordination
 * desk - SYSTEM notification, 10:41]") read five minutes in the future whenever
 * the player got there sooner than the author guessed (nats-r4-s21-F1). Authors
 * write `{{stationTime}}` instead, and the dialog shows the station clock at the
 * moment it opens.
 */

import { Logger } from '@app/logging/logger';
import { EventTimeLedger } from '@app/scenarios/event-time-ledger';
import { getSimulatedNowMs } from '@app/simulation/sim-time';

/** Author token for the station clock (UTC, HH:MM) at the moment the dialog opens */
export const STATION_TIME_TOKEN = '{{stationTime}}';

/** `HH:MM` on the station clock (UTC, as the command bar and Ops Log print it) */
export function formatStationTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');

  return `${h}:${m}`;
}

/** `{{at:KEY}}`, `{{dur:A..B}}`, `{{val:KEY:1}}`, each with an optional `|fallback` */
const LEDGER_TOKEN = /\{\{(at|dur|val):([^}|]*)(?:\|([^}]*))?\}\}/gu;
const OFFSET_SUFFIX = /([+-]\d+)(s|m)?$/u;
const warned_ = new Set<string>();

/** `HH:MM:SS` on the station clock */
export function formatStationTimeSeconds(timestampMs: number): string {
  return `${formatStationTime(timestampMs)}:${new Date(timestampMs).getUTCSeconds().toString().padStart(2, '0')}`;
}

/** "45 s", "3 min", "1 h 05 min" */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;

  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest.toString().padStart(2, '0')} min`;
}

function unresolved_(token: string, fallback: string | undefined, placeholder: string): string {
  if (!warned_.has(token)) {
    warned_.add(token);
    Logger.warn(`dialog-tokens: ${token} has no ledger entry; showing ${fallback === undefined ? 'a placeholder' : 'its fallback'}`);
  }

  return fallback ?? placeholder;
}

function resolveAt_(token: string, spec: string, fallback: string | undefined): string {
  let key = spec;
  let withSeconds = false;
  let offsetMs = 0;
  if (key.endsWith(':s')) {
    withSeconds = true;
    key = key.slice(0, -2);
  }
  const offset = OFFSET_SUFFIX.exec(key);
  if (offset) {
    offsetMs = Number(offset[1]) * (offset[2] === 'm' ? 60_000 : 1000);
    key = key.slice(0, offset.index);
  }
  const at = EventTimeLedger.getTime(key);
  if (at === undefined) return unresolved_(token, fallback, '--:--');

  return (withSeconds ? formatStationTimeSeconds : formatStationTime)(at + offsetMs);
}

function resolveDur_(token: string, spec: string, fallback: string | undefined): string {
  const [from, to] = spec.split('..');
  const a = from ? EventTimeLedger.getTime(from) : undefined;
  const b = to ? EventTimeLedger.getTime(to) : undefined;
  if (a === undefined || b === undefined) return unresolved_(token, fallback, '--');

  return formatDuration(b - a);
}

function resolveVal_(token: string, spec: string, fallback: string | undefined): string {
  let key = spec;
  let digits = 1;
  const precision = /:(\d+)$/u.exec(key);
  if (precision) {
    digits = Number(precision[1]);
    key = key.slice(0, precision.index);
  }
  const value = EventTimeLedger.getValue(key);
  if (value === undefined) return unresolved_(token, fallback, '--');

  return value.toFixed(digits);
}

/**
 * Fill the author tokens in a text. Tokens fill when the text is shown.
 * - `{{stationTime}}` the station clock now
 * - `{{at:KEY|fb}}` HH:MM of a ledger event; `{{at:KEY:s|fb}}` HH:MM:SS; `{{at:KEY+120s|fb}}` offset (s or m)
 * - `{{dur:KEY1..KEY2|fb}}` the span between two events ("3 min")
 * - `{{val:OBJ.N:1|fb}}` the value a condition observed (digits after the last colon)
 * An unresolved token prints its fallback (or a placeholder) and warns once.
 * @param text HTML as authored
 * @param nowMs station-clock ms to stamp for {{stationTime}} (defaults to the scenario clock now)
 */
export function fillDialogTokens(text: string, nowMs: number = getSimulatedNowMs()): string {
  let out = text.includes(STATION_TIME_TOKEN) ? text.replaceAll(STATION_TIME_TOKEN, formatStationTime(nowMs)) : text;
  if (!out.includes('{{')) return out;

  out = out.replace(LEDGER_TOKEN, (token, kind: string, spec: string, fallback?: string) => {
    if (kind === 'at') return resolveAt_(token, spec, fallback);
    if (kind === 'dur') return resolveDur_(token, spec, fallback);

    return resolveVal_(token, spec, fallback);
  });

  return out;
}

/** The text as filed when no event happened: every ledger token replaced by its fallback. */
export function stripDialogTokens(text: string): string {
  return text.replace(LEDGER_TOKEN, (_token, kind: string, _spec: string, fallback?: string) => fallback ?? (kind === 'at' ? '--:--' : '--'));
}
