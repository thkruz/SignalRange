import type { CampaignData } from '@app/campaigns/campaign-types';
import { hamSdrSandboxData } from '@app/campaigns/ham-sdr/sandbox';
import { hamSdrScenario1Data } from '@app/campaigns/ham-sdr/scenario1';
import { hamSdrScenario2Data } from '@app/campaigns/ham-sdr/scenario2';
import { hamSdrScenario3Data } from '@app/campaigns/ham-sdr/scenario3';
import { hamSdrScenario4Data } from '@app/campaigns/ham-sdr/scenario4';
import { hamSdrScenario5Data } from '@app/campaigns/ham-sdr/scenario5';
import { hamSdrScenario6Data } from '@app/campaigns/ham-sdr/scenario6';
import { hamSdrScenario7Data } from '@app/campaigns/ham-sdr/scenario7';
import { hamSdrScenario8Data } from '@app/campaigns/ham-sdr/scenario8';
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
  headerIdentity: {
    name: 'ORBITAL',
    nameAccent: 'OPS',
    icon: 'fa-solid fa-earth-americas',
  },
  chromeVariant: 'standard',
  releaseStage: 'stable',
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

export const hamSdrCampaignData: CampaignData = {
  id: 'ham-sdr',
  title: 'Backyard Operator',
  subtitle: 'DIY Satellite Tracking with Software-Defined Radio',
  description: `Charlie's niece Riley teaches you how to track satellites from your backyard. No mission control, no nine-meter dish - just software-defined radio, DIY antennas, and physics.<br><br>Start by catching weather images on a hand-wound quadrifilar helix. Add a crossed yagi on a TV rotator and chase cubesat Doppler by hand. Learn why handedness costs you eighteen decibels, find the GPS constellation hiding under the noise floor, and audit a link budget until a hopeless low pass decodes anyway.<br><br>Then the band turns hostile. Someone spoofs your clock. Someone hands you poisoned orbital elements. A neighbor's failing gear buries the birds in hash. And when you finally key a transmitter of your own, you meet an unlicensed operator the satellite relays as faithfully as it relays you - and a beacon claiming to be a satellite that never left the ground.<br><br>Eight scenarios, one lesson: RF is unauthenticated, and physics is your only authentication.`,
  // Art lives under assets/campaigns/home-sdr/, which does not match the
  // 'ham-sdr' campaign id.
  imageUrl: 'home-sdr/home-sdr.png',
  difficulty: 'beginner',
  totalDuration: '170-210 min',
  campaignType: 'Amateur Radio Operations',
  headerIdentity: {
    name: 'BACKYARD',
    nameAccent: 'SDR',
    icon: 'fa-solid fa-satellite-dish',
  },
  chromeVariant: 'sdr',
  // S1-S8 are shipped but the engine seams behind them (terrestrial emitters,
  // backyard TX path, REF/holdover) are still moving, so saves can break.
  releaseStage: 'alpha',
  scenarios: [
    hamSdrSandboxData,
    hamSdrScenario1Data,
    hamSdrScenario2Data,
    hamSdrScenario3Data,
    hamSdrScenario4Data,
    hamSdrScenario5Data,
    hamSdrScenario6Data,
    hamSdrScenario7Data,
    hamSdrScenario8Data,
  ],
  isLocked: false,
  isDisabled: false,
};

export const ccsCampaignData: CampaignData = {
  id: 'ccs',
  title: '9th Electronic Warfare Squadron',
  subtitle: 'Counter Communications Systems',
  description: `This campaign delves into the realm of electronic warfare and counter communications systems. As a specialist in this field, you'll navigate through a series of scenarios that challenge you to identify, analyze, and disrupt hostile communication signals while ensuring the integrity of friendly communications.<br><br>Through these scenarios, you'll develop expertise in signal intelligence, jamming techniques, and electronic countermeasures, all while operating within the constraints of modern electronic warfare environments.`,
  imageUrl: 'ccs/ccs.png',
  difficulty: 'advanced',
  totalDuration: '200-260 min',
  campaignType: 'Electronic Warfare',
  headerIdentity: {
    name: 'COUNTER',
    nameAccent: 'COMMS',
    icon: 'fa-solid fa-tower-broadcast',
  },
  chromeVariant: 'astro',
  // Sandbox only so far - the EA engine and console exist, the scenario arc does not.
  releaseStage: 'alpha',
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
  headerIdentity: {
    name: 'SIGNAL',
    nameAccent: 'HUNTER',
    icon: 'fa-solid fa-crosshairs',
  },
  chromeVariant: 'astro',
  // Sandbox only so far - the TDOA/FDOA service and console exist, the scenario arc does not.
  releaseStage: 'alpha',
  scenarios: [
    signalHunterSandboxData,
  ],
  isLocked: false,
  isDisabled: false,
};


