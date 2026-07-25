import type { CampaignData } from '@app/campaigns/campaign-types';
import { natsEuSandboxData } from './sandbox';
import { natsEuScenario1Data } from './scenario1';

/**
 * NATS-EU Campaign (Campaign 2): North Atlantic Teleport Services EU
 *
 * The player is a NATS Campaign 1 graduate who transfers to GW-01 Galway,
 * NATS Europe's LEO downlink site. Scenario 1 is gated on Campaign 1
 * graduation (S8 night-shift solo evaluation), not full C1 completion.
 */
export const natsEuCampaignData: CampaignData = {
  id: 'nats-eu',
  title: 'North Atlantic Teleport Services EU',
  subtitle: 'Commercial Ground Station Operations',
  description: `This campaign follows the North Atlantic Teleport Services EU branch, focusing on Low Earth Orbit (LEO) satellite communications. As a ground station operator, you'll work through a series of scenarios to establish and maintain RF links with various LEO satellites, gaining hands-on experience with tracking fast-moving targets and optimizing communication parameters for reliable data transmission.<br><br>Through these scenarios, you'll develop essential skills in antenna tracking, Doppler shift compensation, and link budget analysis, all while supporting the operational needs of cutting-edge LEO satellite constellations.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'intermediate',
  totalDuration: '160-220 min',
  campaignType: 'LEO Commercial Communications',
  scenarios: [
    natsEuSandboxData,
    natsEuScenario1Data,
  ],
  isLocked: false,
  isDisabled: false,
};
