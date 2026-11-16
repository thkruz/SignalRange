import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { describe, expect, it } from 'vitest';

/** Same stall as c6s2-r5: the Radio opens on CH1 PILOT, the application reading is on CH2 REM OP. */
describe('C6 S1 test-application objective: the Radio channel that gives the application reading', () => {
  it('the Next line names the channel knob, CH2, REM OP and PTT, and warns the Radio opens on the pilot', () => {
    const objective = frontlineScenario1Data.objectives?.find((o) => o.id === 's1-test-application');
    const next = (objective?.conditions ?? []).map((c) => c.next ?? '').find((n) => n.includes('Radio')) ?? '';
    expect(next).toContain('CH1 PILOT');
    expect(next).toContain('CH2 REM OP');
    expect(next).toContain('channel knob');
    expect(next).toContain('PTT');
  });
});
