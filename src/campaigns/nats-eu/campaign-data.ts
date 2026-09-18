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
import { natsEuScenario9Data } from './scenario9';
import { natsEuScenario10Data } from './scenario10';
import { natsEuScenario11Data } from './scenario11';
import { natsEuScenario12Data } from './scenario12';
import { natsEuScenario13Data } from './scenario13';
import { natsEuScenario14Data } from './scenario14';
import { natsEuScenario15Data } from './scenario15';
import { natsEuScenario16Data } from './scenario16';
import { natsEuScenario17Data } from './scenario17';
import { natsEuScenario18Data } from './scenario18';
import { natsEuScenario19Data } from './scenario19';
import { natsEuScenario20Data } from './scenario20';

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
  description: `This campaign follows the North Atlantic Teleport Services EU branch across two sites: GW-01 Galway, the company's Low Earth Orbit (LEO) downlink station on the Irish west coast, and SH-02 Shetland, the second dish that turns one station into a network. As a Campaign 1 graduate you'll run the MERIDIAN synthetic-aperture radar constellation's passes from both consoles: sweep the station before AOS, acquire and track a target that is gone in ten minutes, decode and command inside the window, safe the uplink at LOS and plan the next contact across both sites.<br><br>Through sixteen scenarios you'll develop essential skills in Ku-band link budgets, Doppler compensation, ephemeris management, command-link COMSEC, rain fade and reference holdover, all while supporting the operational needs of a commercial LEO constellation and its maritime customers.`,
  imageUrl: 'nats-eu/north-atlantic-teleport-services-eu.png',
  difficulty: 'intermediate',
  // Sum of the sixteen per-scenario `duration` ranges (30-40 min each).
  totalDuration: '725-760 min',
  campaignType: 'LEO Commercial Communications',
  headerIdentity: {
    name: 'ATLANTIC',
    nameAccent: 'OPS',
    icon: 'fa-solid fa-earth-europe',
  },
  // Same chrome as Campaign 1 on purpose: two facilities of one operator.
  chromeVariant: 'standard',
  // S1-S16 are content complete and saves are expected to hold, but the campaign
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
    natsEuScenario9Data,
    natsEuScenario10Data,
    natsEuScenario11Data,
    natsEuScenario12Data,
    natsEuScenario13Data,
    natsEuScenario14Data,
    natsEuScenario15Data,
    natsEuScenario16Data,
    natsEuScenario17Data,
    natsEuScenario18Data,
    natsEuScenario19Data,
    natsEuScenario20Data,
  ],
  isLocked: false,
  // Gated on the Campaign 1 graduation shift, matching the prerequisite on this
  // campaign's own first scenario (natsEuScenario1Data) - not on clearing all
  // 24 NATS scenarios.
  prerequisiteScenarioIds: ['nats-level-8-night-shift'],
  isDisabled: false,
};
