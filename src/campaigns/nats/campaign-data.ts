import type { CampaignData } from '@app/campaigns/campaign-types';
import { hamSdrSandboxData } from '@app/campaigns/ham-sdr/sandbox';
import { natsEuScenario1Data } from '@app/campaigns/nats-eu/scenario1';
import { natsEuSandboxData } from '@app/campaigns/nats-eu/sandbox';
import { ccsScenario1Data } from '@app/campaigns/ccs/scenario1';
import { signalHunterSandboxData } from '@app/campaigns/signal-hunter/sandbox';
import { sandboxData } from './sandbox';
import { scenario1Data } from './scenario1';
import { scenario2Data } from './scenario2';
import { scenario3Data } from './scenario3';
import { scenario4Data } from './scenario4';
import { scenario5Data } from './scenario5';
import { scenario6Data } from './scenario6';
import { scenario7Data } from './scenario7';
import { scenario8Data } from './scenario8';
import { scenario9Data } from './scenario9';
import { scenario10Data } from './scenario10';
import { scenario11Data } from './scenario11';
import { scenario12Data } from './scenario12';
import { scenario13Data } from './scenario13';
import { scenario14Data } from './scenario14';
import { scenario15Data } from './scenario15';
import { scenario16Data } from './scenario16';
import { scenario17Data } from './scenario17';
import { scenario18Data } from './scenario18';
import { scenario19Data } from './scenario19';
import { scenario20Data } from './scenario20';
import { scenario21Data } from './scenario21';
import { scenario22Data } from './scenario22';
import { scenario23Data } from './scenario23';
import { scenario24Data } from './scenario24';

/**
 * NATS Campaign: North Atlantic Teleport Services
 *
 * A beginner-friendly campaign introducing students to commercial satellite
 * ground station operations. Follow the story of bringing MARINER-1 and other
 * GEO communications satellites into operational service from a ground facility
 * in rural Vermont.
 */
export const natsCampaignData: CampaignData = {
  id: 'nats',
  title: 'North Atlantic Teleport Services',
  subtitle: 'Commercial Ground Station Operations',
  description: `Welcome to North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. In this campaign, you'll learn the fundamentals of satellite communications by conducting first light tests, tracking satellites, and establishing reliable RF links for GEO communication satellites serving the North Atlantic region.<br><br>Through a series of progressively challenging scenarios, you'll master ground station equipment operation, signal acquisition techniques, and RF link analysis while following the story of bringing multiple communication satellites into operational service.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'beginner',
  totalDuration: '175-240 min',
  campaignType: 'GEO Commercial Communications',
  scenarios: [
    sandboxData,
    scenario1Data,
    scenario2Data,
    scenario3Data,
    scenario4Data,
    scenario5Data,
    scenario6Data,
    scenario7Data,
    scenario8Data,
    scenario9Data,
    scenario10Data,
    scenario11Data,
    scenario12Data,
    scenario13Data,
    scenario14Data,
    scenario15Data,
    scenario16Data,
    scenario17Data,
    scenario18Data,
    scenario19Data,
    scenario20Data,
    scenario21Data,
    scenario22Data,
    scenario23Data,
    scenario24Data,
  ],
  isLocked: false,
  isDisabled: false,
};

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

export const hamSdrCampaignData: CampaignData = {
  id: 'ham-sdr',
  title: 'Backyard Operator',
  subtitle: 'DIY Satellite Tracking with Software-Defined Radio',
  description: `Charlie's niece Riley teaches you how to track satellites from your backyard. No mission control, no nine-meter dish - just software-defined radio, DIY antennas, and physics.<br><br>Catch weather satellites on a hand-wound quadrifilar helix, chase cubesat Doppler with a crossed yagi on a TV rotator, learn why circular polarization handedness matters, and find the GPS constellation hiding under the noise floor. Everything Uncle Charlie does with big iron, done with eighty dollars of parts and a SatNOGS mindset.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'beginner',
  totalDuration: '30-60 min',
  campaignType: 'Amateur Radio Operations',
  scenarios: [
    hamSdrSandboxData,
  ],
  isLocked: false,
  isDisabled: false,
};

export const ccsCampaignData: CampaignData = {
  id: 'ccs',
  title: '9th Electronic Warfare Squadron',
  subtitle: 'Counter Communications Systems',
  description: `This campaign delves into the realm of electronic warfare and counter communications systems. As a specialist in this field, you'll navigate through a series of scenarios that challenge you to identify, analyze, and disrupt hostile communication signals while ensuring the integrity of friendly communications.<br><br>Through these scenarios, you'll develop expertise in signal intelligence, jamming techniques, and electronic countermeasures, all while operating within the constraints of modern electronic warfare environments.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'advanced',
  totalDuration: '200-260 min',
  campaignType: 'Electronic Warfare',
  scenarios: [
    ccsScenario1Data,
  ],
  isLocked: false,
  isDisabled: false,
};

export const geolocationCampaignData: CampaignData = {
  // Campaign 5: "Signal Hunter" (README Q4). Was id 'ccs', a duplicate of
  // ccsCampaignData; renamed to a unique id matching its /campaigns/:id route
  // and body theme class (.campaign-signal-hunter).
  id: 'signal-hunter',
  title: '22nd Electronic Warfare Squadron',
  subtitle: 'Signal Hunter — Geolocation of Interference Sources',
  description: `Someone is jamming allied satellites. As a member of the 22nd Electronic Warfare Squadron, you'll locate the sources of hostile interference using advanced RF geolocation.<br><br>Learn the two-satellite TDOA/FDOA cross-fix technique: an uplink jammer leaks into a neighboring satellite's sidelobes, and correlating the two downlinks lets you draw crossing lines of position over the emitter. Detect, characterize, and geolocate intermittent interference, then hand a fix and error ellipse to the incident response cell.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'advanced',
  totalDuration: '200-260 min',
  campaignType: 'Electronic Warfare',
  scenarios: [
    signalHunterSandboxData,
  ],
  isLocked: false,
  isDisabled: false,
};


