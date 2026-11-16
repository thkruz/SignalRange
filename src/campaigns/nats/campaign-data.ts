import type { CampaignData } from '@app/campaigns/campaign-types';
import { ccsScenario1Data } from '@app/campaigns/ccs/scenario1';
import { ccsScenario2Data } from '@app/campaigns/ccs/scenario2';
import { ccsScenario3Data } from '@app/campaigns/ccs/scenario3';
import { ccsScenario4Data } from '@app/campaigns/ccs/scenario4';
import { ccsScenario5Data } from '@app/campaigns/ccs/scenario5';
import { hamSdrSandboxData } from '@app/campaigns/ham-sdr/sandbox';
import { hamTechScenarios } from '@app/campaigns/ham-sdr/tech';
import { signalHunterSandboxData } from '@app/campaigns/signal-hunter/sandbox';
import { signalHunterScenario1Data } from '@app/campaigns/signal-hunter/scenario1';
import { signalHunterScenario2Data } from '@app/campaigns/signal-hunter/scenario2';
import { signalHunterScenario3Data } from '@app/campaigns/signal-hunter/scenario3';
import { signalHunterScenario4Data } from '@app/campaigns/signal-hunter/scenario4';
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
  totalDuration: '600-765 min',
  campaignType: 'GEO Commercial Communications',
  headerIdentity: {
    name: 'ORBITAL',
    nameAccent: 'OPS',
    icon: 'globe',
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
  subtitle: 'Amateur Radio Technician Practicals',
  description: `Riley Brooks holds an amateur radio license and has offered to show you how a working station fits together, from the first receiver on a desk to a portable station you run on your own.<br><br>Receive a training transmission on a small SDR, then measure a powered circuit with a real meter. Make your first simplex contact, get into a repeater with the right offset and tone, and find out why a digital radio needs its codeplug. Cut a dipole to length and check it with an analyzer. Chase lost watts down a crushed feed line, a radio reset down a tired power lead, and noise down to a plug-in supply.<br><br>Then reach further: packet messages that wait for an acknowledgement, a ten-metre contact when the band opens, a grid exchange through a passing satellite, and a club net that loses its repeater halfway through.<br><br>Twelve scenarios inside US Technician privileges, with practice questions from the public 2026-2030 Technician question pool. The simulator decides every result: a setting only counts when the station works.`,
  // Art lives under assets/campaigns/home-sdr/, which does not match the
  // 'ham-sdr' campaign id.
  imageUrl: 'home-sdr/home-sdr.png',
  difficulty: 'beginner',
  totalDuration: '370-460 min',
  campaignType: 'Amateur Radio Operations',
  headerIdentity: {
    name: 'BACKYARD',
    nameAccent: 'SDR',
    icon: 'dish',
  },
  chromeVariant: 'sdr',
  // The Technician curriculum (phase 42) replaced the eight earlier alpha
  // scenarios outright; old C3 completions are not migrated. Alpha until a human playtest.
  releaseStage: 'alpha',
  scenarios: [hamSdrSandboxData, ...hamTechScenarios],
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
  totalDuration: '100-140 min',
  campaignType: 'Electronic Warfare',
  headerIdentity: {
    name: 'COUNTER',
    nameAccent: 'COMMS',
    icon: 'tower',
  },
  chromeVariant: 'astro',
  // Sandbox, Failover, and the spacecraft half (First Shift, State of Health, Ranging Pass).
  releaseStage: 'alpha',
  scenarios: [ccsScenario1Data, ccsScenario2Data, ccsScenario3Data, ccsScenario4Data, ccsScenario5Data],
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
  imageUrl: 'signal-hunter/signal-hunter.png',
  difficulty: 'advanced',
  totalDuration: '130-170 min',
  campaignType: 'Electronic Warfare',
  headerIdentity: {
    name: 'SIGNAL',
    nameAccent: 'HUNTER',
    icon: 'crosshairs',
  },
  chromeVariant: 'astro',
  // Sandbox plus the four-scenario arc: First Fix, Two Carriers, Cold Trail, Prove It.
  releaseStage: 'alpha',
  scenarios: [signalHunterSandboxData, signalHunterScenario1Data, signalHunterScenario2Data, signalHunterScenario3Data, signalHunterScenario4Data],
  isLocked: false,
  isDisabled: false,
};
