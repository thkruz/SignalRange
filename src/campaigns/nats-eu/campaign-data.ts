import type { CampaignData } from '@app/campaigns/campaign-types';
import { natsEuSandboxData } from './sandbox';
import { natsEuScenario1Data } from './scenario1';
import { natsEuScenario2Data } from './scenario2';
import { natsEuScenario3Data } from './scenario3';
import { natsEuScenario4Data } from './scenario4';
import { natsEuScenario5Data } from './scenario5';
import { natsEuScenario6Data } from './scenario6';
import { natsEuScenario7Data } from './scenario7';
import { natsEuScenario8Data } from './scenario8';

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
  imageUrl: 'nats-eu/north-atlantic-teleport-services-eu.png',
  difficulty: 'intermediate',
  totalDuration: '160-220 min',
  campaignType: 'LEO Commercial Communications',
  headerIdentity: {
    name: 'ATLANTIC',
    nameAccent: 'OPS',
    icon: 'fa-solid fa-earth-europe',
  },
  // Same chrome as Campaign 1 on purpose: two facilities of one operator.
  chromeVariant: 'standard',
  // S1-S8 are content complete and saves are expected to hold, but the campaign
  // is still under public test.
  releaseStage: 'beta',
  scenarios: [
    natsEuSandboxData,
    natsEuScenario1Data,
    natsEuScenario2Data,
    natsEuScenario3Data,
    natsEuScenario4Data,
    natsEuScenario5Data,
    natsEuScenario6Data,
    natsEuScenario7Data,
    natsEuScenario8Data,
  ],
  isLocked: false,
  // Gated on the Campaign 1 graduation shift, matching the prerequisite on this
  // campaign's own first scenario (natsEuScenario1Data) - not on clearing all
  // 24 NATS scenarios.
  prerequisiteScenarioIds: ['nats-level-8-night-shift'],
  isDisabled: false,
};
