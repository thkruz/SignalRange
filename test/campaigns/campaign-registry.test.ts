import type { CampaignData } from '@app/campaigns/campaign-types';
import { ccsCampaignData, geolocationCampaignData, hamSdrCampaignData, natsCampaignData } from '@app/campaigns/nats/campaign-data';
import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { describe, expect, it } from 'vitest';

/**
 * Guards against the class of bug where two campaigns shared id 'ccs'
 * (the pre-Campaign-5 collision). Campaign ids double as /campaigns/:id
 * routes and body theme classes, so they must be unique.
 */
const ALL_CAMPAIGNS: CampaignData[] = [natsCampaignData, natsEuCampaignData, hamSdrCampaignData, ccsCampaignData, geolocationCampaignData];

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

  /**
   * totalDuration is shown on the campaign card and was written by hand for
   * every campaign; Campaign 1 drifted to '175-240 min' for 24 scenarios and
   * Campaign 2 to '400-480 min' before anything checked it. It must be the sum
   * of the scenarios' `duration` ranges, sandboxes ('Unlimited') excluded.
   */
  describe('totalDuration matches the sum of scenario durations', () => {
    const DURATION = /^(\d+)(?:-(\d+))? min$/;

    for (const campaign of ALL_CAMPAIGNS) {
      it(`for ${campaign.id}`, () => {
        let low = 0;
        let high = 0;
        for (const scenario of campaign.scenarios) {
          if (scenario.duration === 'Unlimited') continue;
          const match = DURATION.exec(scenario.duration);
          expect(match, `${campaign.id}/${scenario.id} duration '${scenario.duration}' is not 'N min' or 'N-M min'`).not.toBeNull();
          const [, lo, hi] = match as RegExpExecArray;
          low += Number(lo);
          high += Number(hi ?? lo);
        }
        const expected = low === high ? `${low} min` : `${low}-${high} min`;
        expect(campaign.totalDuration).toBe(expected);
      });
    }
  });
});
