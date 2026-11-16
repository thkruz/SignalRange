import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { radioChannels } from '@app/pages/mission-control/tabs/radio/radio-calls';
import type { ServiceModel } from '@app/physical/service-model';
import { describe, expect, it } from 'vitest';

/**
 * Blind run c6s2-r5: the Radio opens on CH1 PILOT ("Ask 1 of 4"), the player asked all four pilot questions, none of
 * which is an application reading, and the "remote operator's report" row never ticked. The row's Next line has to
 * say which channel carries the reading.
 */
describe('C6 S2 verify objective: the Radio channel that gives the application reading', () => {
  const fakeModel = {
    getServiceIds: () => ['skylink', 'vsat'],
    getPath: (id: string) => ({ label: id === 'skylink' ? 'SkyLink' : 'VSAT', endpointIds: [] }),
  } as unknown as ServiceModel;

  it('pilot channel offers no application question and the remote operator channel does', () => {
    const [pilot, operator] = radioChannels(fakeModel);
    expect(pilot.questions.every((q) => q.layer !== 'application')).toBe(true);
    expect(operator.tag).toBe('REM OP');
    expect(operator.number).toBe(2);
    expect(operator.questions.some((q) => q.serviceId === 'skylink' && q.layer === 'application')).toBe(true);
  });

  it('the Next line names the channel knob, CH2 and REM OP, and warns the Radio opens on the pilot', () => {
    const objective = frontlineScenario2Data.objectives?.find((o) => o.id === 's2-verify-service-reserve');
    const next = (objective?.conditions ?? []).map((c) => c.next ?? '').find((n) => n.includes('Radio')) ?? '';
    expect(next).toContain('CH1 PILOT');
    expect(next).toContain('CH2 REM OP');
    expect(next).toContain('channel knob');
  });
});
