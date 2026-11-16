import { readFileSync } from 'node:fs';
import { SCENARIOS } from '@app/scenario-manager';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/gu, '\n');

// The Edge Function runs a copy of the rules and a snapshot of the scenario ids because
// supabase/functions cannot import from src/. These tests fail when either copy drifts.
describe('feedback-submit edge function copies', () => {
  it('bundles an identical copy of feedback-rules.ts', () => {
    expect(read('supabase/functions/_shared/feedback-rules.ts')).toBe(read('src/feedback/feedback-rules.ts'));
  });

  it('keeps gateway JWT verification on for feedback-prune and documents the caller headers', () => {
    const config = read('supabase/config.toml');
    expect(config).not.toMatch(/^\s*\[functions\.feedback-prune\]/mu);
    expect(config).not.toMatch(/^\s*verify_jwt\s*=\s*false/mu);
    const readme = read('supabase/functions/feedback-prune/README.md');
    expect(readme).toContain('Authorization: Bearer <service role key>');
    expect(readme).toContain('x-prune-secret: <FEEDBACK_PRUNE_SECRET>');
  });

  it('lists exactly the registered scenario ids', () => {
    const ids = JSON.parse(read('supabase/functions/feedback-submit/scenario-ids.json')) as string[];
    expect([...ids].sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });
});
