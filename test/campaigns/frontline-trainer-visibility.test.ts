import { isTrainerVisible } from '@app/campaigns/frontline/frontline-gate';
import { frontlineSandboxData } from '@app/campaigns/frontline/sandbox';
import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { describe, expect, it } from 'vitest';

describe('isTrainerVisible', () => {
  it('shows the Trainer in the sandbox scenarios only', () => {
    expect(isTrainerVisible(true, frontlineSandboxData.missionType)).toBe(true);
    expect(isTrainerVisible(true, frontlineScenario1Data.missionType)).toBe(false);
  });

  it('stays hidden when the campaign is gated off', () => {
    expect(isTrainerVisible(false, 'Sandbox')).toBe(false);
  });
});
