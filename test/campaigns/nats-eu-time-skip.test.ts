import { describe, expect, it } from 'vitest';
import { natsEuCampaignData } from '../../src/campaigns/nats-eu/campaign-data';
import { SCENARIOS } from '../../src/scenario-manager';
import type { TimeSkipConfig } from '../../src/simulation/time-skip-controller';

describe('NATS-EU playable mission wait policy', () => {
  for (const mission of natsEuCampaignData.scenarios.filter((scenario) => !scenario.isDisabled && scenario.settings.contactTimeline)) {
    it(`${mission.id} allows short waits to AOS without a mission countdown`, () => {
      const skip = mission.settings?.timeSkip as TimeSkipConfig | undefined;
      expect(SCENARIOS.find((scenario) => scenario.id === mission.id)).toBe(mission);
      expect(skip?.leadTimeS).toBe(0);
      expect(skip?.minSkipS).toBe(1);
      expect(mission.timeLimitSeconds).toBeUndefined();
    });
  }
});
