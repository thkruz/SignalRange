/**
 * `sr-tle-set/1`: an immutable, gzip-compressed JSON document holding a TLE snapshot of a
 * constellation or orbital belt (see phase-3-constellation-scale-plan.md section 3.1).
 */
export interface TleSetMember {
  noradId: number;
  name: string;
  tle1: string;
  tle2: string;
  group: string;
  plane?: number;
}

export interface TleSet {
  format: 'sr-tle-set/1';
  id: string;
  epoch: string;
  source: string;
  groups: { id: string; label: string; count: number; rfTemplate?: string }[];
  members: TleSetMember[];
  /** Human title, e.g. "Starlink, all shells, 2026-11 snapshot" */
  title?: string;
  /** When the source catalog was read (ISO 8601 UTC) */
  snapshotUtc?: string;
  /** Oldest and newest member element epoch (ISO 8601 UTC) */
  epochRangeUtc?: [string, string];
  /** Redundant member count, checked by the loader when present */
  count?: number;
}

export const TLE_SET_FORMAT = 'sr-tle-set/1' as const;
