/**
 * Phase 35 E2 lint: nats-eu text must not name an anchored or player-driven
 * clock time as a literal. Times come from `{{at:KEY|fallback}}` tokens
 * (scenarios/event-time-ledger.ts, modal/dialog-tokens.ts).
 *
 * Every `H:MM`, `HH:MM` or `HH:MM:SS` in a scenario string (tokens removed
 * first, so a fallback never counts) must be in ALLOWED_LITERAL_TIMES for that
 * scenario file. The list started complete, so the lint passes before content
 * runs. Content packages convert a literal to a token and delete its entry;
 * an entry with no matching literal fails the test, so the list only shrinks.
 * Entries that stay are orbit-fixed AOS/LOS, scripted wall times and durations
 * ("2:00 timer"); a time that depends on the player must not stay.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }), destroy: () => undefined },
}));

import { natsEuScenario4Data } from '@app/campaigns/nats-eu/scenario4';
import { ALLOWED_LITERAL_TIMES } from './literal-time-allowlist';
import { literalTimesByScenario } from './literal-times';

describe('nats-eu literal clock times', () => {
  const found = literalTimesByScenario();

  it('finds the scenarios', () => {
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(28);
  });

  for (const [scenario, times] of Object.entries(found)) {
    it(`${scenario}: every literal time is allowlisted, and no allowlist entry is stale`, () => {
      const allowed = [...(ALLOWED_LITERAL_TIMES[scenario] ?? [])].sort();

      expect(times).toEqual(allowed);
    });
  }
});

describe('nats-eu S4 Anneke message (#212)', () => {
  const strings: string[] = [];
  const walk = (value: unknown, seen: Set<object>): void => {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const item of Object.values(value)) walk(item, seen);
    }
  };
  walk(natsEuScenario4Data, new Set());

  it('the key-rotation-complete message states no player-driven clock time (station-time token, no 13:50)', () => {
    const message = strings.find((s) => s.includes('thank you, we can see the rotation is complete'));

    expect(message).toBeDefined();
    expect(message).toContain('{{stationTime}}');
    expect(message!.replace(/\{\{[^}]*\}\}/gu, '')).not.toMatch(/\d{1,2}:\d{2}/u);
    expect(strings.some((s) => s.includes('13:50'))).toBe(false);
  });
});
