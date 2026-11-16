import { describe, expect, it } from 'vitest';
import { hamTechScenarios } from '../../../src/campaigns/ham-sdr/tech';

/**
 * Every worksheet must be answerable through the UI: choice answers are one of the options, and
 * match answers map each row to an option (the options are the right-hand side, not the row labels).
 */
describe('C3 worksheets are answerable from their options', () => {
  for (const s of hamTechScenarios) {
    for (const ws of s.settings.hamStation?.worksheets ?? []) {
      it(`${s.id} ${ws.id}`, () => {
        for (const f of ws.fields) {
          if (f.kind === 'choice') {
            expect(f.options, `${f.id} options`).toContain(f.answer as string);
          } else if (f.kind === 'match') {
            const answer = f.answer as Record<string, string>;
            expect(Object.keys(answer).length, `${f.id} rows`).toBeGreaterThan(0);
            for (const [row, right] of Object.entries(answer)) {
              expect(f.options, `${f.id} row ${row}`).toContain(right);
            }
          } else {
            expect(typeof f.answer, `${f.id} number`).toBe('number');
          }
        }
      });
    }
  }
});
