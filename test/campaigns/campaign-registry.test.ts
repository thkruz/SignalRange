import {
  ccsCampaignData,
  geolocationCampaignData,
  hamSdrCampaignData,
  natsCampaignData,
  natsEuCampaignData,
} from '@app/campaigns/nats/campaign-data';
import type { CampaignData } from '@app/campaigns/campaign-types';
import { describe, expect, it } from 'vitest';

/**
 * Guards against the class of bug where two campaigns shared id 'ccs'
 * (the pre-Campaign-5 collision). Campaign ids double as /campaigns/:id
 * routes and body theme classes, so they must be unique.
 */
const ALL_CAMPAIGNS: CampaignData[] = [
  natsCampaignData,
  natsEuCampaignData,
  hamSdrCampaignData,
  ccsCampaignData,
  geolocationCampaignData,
];

describe('campaign registry', () => {
  it('has unique campaign ids', () => {
    const ids = ALL_CAMPAIGNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('activates the Signal Hunter campaign (Campaign 5)', () => {
    expect(geolocationCampaignData.id).toBe('signal-hunter');
    expect(geolocationCampaignData.isDisabled).toBe(false);
    expect(geolocationCampaignData.scenarios.length).toBeGreaterThan(0);
  });

  it('keeps a unique id for the 9th EWS (Campaign 4) placeholder', () => {
    expect(ccsCampaignData.id).toBe('ccs');
  });
});
