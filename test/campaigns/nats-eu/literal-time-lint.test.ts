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
