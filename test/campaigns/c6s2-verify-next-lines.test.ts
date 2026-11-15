import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { describe, expect, it } from 'vitest';

describe('C6 S2 Verify Service and Reserve copy', () => {
  const objective = frontlineScenario2Data.objectives?.find((o) => o.id === 's2-verify-service-reserve');
  const nexts = (objective?.conditions ?? []).map((c) => (c as { next?: string }).next ?? '');

  it('names MissionRunner for the run and the Radio for the endpoint report', () => {
    expect(nexts.some((n) => n.includes('MissionRunner'))).toBe(true);
    expect(nexts.some((n) => n.includes('Radio'))).toBe(true);
  });

  it('does not send the player to the browser-only reading', () => {
    expect(objective?.description).toContain('Radio');
  });
});
