import { readFileSync } from 'node:fs';
import { SCENARIOS } from '@app/scenario-manager';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/gu, '\n');

// The Edge Function runs a copy of the rules and a snapshot of the scenario ids because
// supabase/functions cannot import from src/. These tests fail when either copy drifts.
describe('feedback-submit edge function copies', () => {
  it('bundles an identical copy of feedback-rules.ts', () => {
    expect(read('supabase/functions/_shared/feedback-rules.ts')).toBe(read('src/feedback/feedback-rules.ts'));
  });

  it('lists exactly the registered scenario ids', () => {
    const ids = JSON.parse(read('supabase/functions/feedback-submit/scenario-ids.json')) as string[];
    expect([...ids].sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });
});
