/**
 * @file time-skip-format - Shared clock/duration formatting for the time-skip UI
 * @description The confirmation modal and the fast-forward overlay have to agree
 * exactly on how a time and a wait are written, or the operator sees one target
 * time in the dialog and a differently-rounded one on the overlay a second later.
 */

/** `14:32:10Z` - scenario clock time of day, UTC. */
export function formatUtcClock(timestampMs: number): string {
  return `${new Date(timestampMs).toISOString().slice(11, 19)}Z`;
}

/** `16 MAR 2027` - scenario clock date, UTC. */
export function formatUtcDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  return `${String(date.getUTCDate()).padStart(2, '0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * `152205Z MAR 27` - date-time group, the way a military watch floor writes a
 * timestamp: day, hour, minute, zone, month, two-digit year.
 *
 * Used by the tactical chrome variant in place of the readable
 * `15 MAR 2027 22:05:15` the other campaigns show. A DTG carries no seconds by
 * convention, so the command-bar clock stops ticking every second there and
 * updates once a minute instead - which is itself part of reading as a
 * different system.
 */
export function formatDtg(timestampMs: number): string {
  const date = new Date(timestampMs);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);

  return `${dd}${hh}${mm}Z ${months[date.getUTCMonth()]} ${yy}`;
}

/**
 * `2027 074 22:05:15` - year, day-of-year, UTC time of day: the clock format of
 * the Astro UXDS Global Status Bar, which space ops consoles (and the astro
 * chrome variant) use. Day-of-year is how space schedules are written - a pass
 * plan says "DOY 074", not "March 15th" - so unlike the DTG above this clock
 * keeps its seconds and ticks every second.
 */
export function formatAstroClock(timestampMs: number): string {
  const date = new Date(timestampMs);
  const startOfYearMs = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((timestampMs - startOfYearMs) / 86_400_000) + 1;

  return `${date.getUTCFullYear()} ${String(doy).padStart(3, '0')} ${date.toISOString().slice(11, 19)}`;
}

/**
 * `1h 18m` / `41m` / `18s` - a wait at one unit of precision.
 *
 * For the command-bar button, where the full form wrapped onto a second line
 * and the seconds digit is noise anyway: the operator is deciding whether the
 * wait is worth skipping, not timing it.
 */
export function formatDurationCompact(deltaMs: number): string {
  const totalS = Math.max(0, Math.round(deltaMs / 1000));
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);

  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  if (m > 0) {
    return `${m}m`;
  }

  return `${totalS}s`;
}

/** `1h 04m 18s` / `41m 18s` / `18s` - a wait, at the coarsest sensible unit. */
export function formatDuration(deltaMs: number): string {
  const totalS = Math.max(0, Math.round(deltaMs / 1000));
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;

  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  if (m > 0) {
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  return `${s}s`;
}
