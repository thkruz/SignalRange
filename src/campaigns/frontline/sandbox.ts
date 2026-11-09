import type { ScenarioData } from '@app/ScenarioData';
import { frontlineGroundStation } from './ground-stations';
import { frontlinePlantConfig } from './plant-config';
import { eurosat9eSatellite } from './satellites';
import { createFrontlineSettings } from './scenario-support';

/**
 * Frontline Signals Sandbox (Phase 38.1)
 *
 * Dev-only physical-layer sandbox: a fictional rural training post with a 1.2 m
 * Ku VSAT toward EuroSat 9E and the full physical-plant kit (generator, power
 * station, SpaceY dish, router and cable, VSAT dish, LNB, IFL, modem, laptop).
 * No faults are authored: the trainer injects them. No dialog, no VO, no
 * objectives.
 */
export const frontlineSandboxData: ScenarioData = {
  id: 'frontline-sandbox',
  url: 'frontline/sandbox',
  imageUrl: 'frontline/sandbox/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'intermediate',
  title: 'Physical Layer Sandbox',
  subtitle: 'Training Post Plant Trainer',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `A one-dish training post in open country: a petrol generator, a power station, a SpaceY terminal and a 1.2 m Ku VSAT aimed at EuroSat 9E.
  <br/><br/>Nothing is broken until the trainer says so. Inject a fault, then find it and fix it with the plant verbs: inspect, wiggle, measure, reseat, swap.`,
  equipment: ['1.2 m Ku VSAT dish', 'Separate LNB on a 30 m coax IFL', 'VSAT modem', 'SpaceY terminal, router and 25 m cable', 'Generator and power station', 'Laptop'],
  settings: {
    isSync: true,
    groundStations: [frontlineGroundStation],
    satellites: [eurosat9eSatellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-06-15',
    scenarioStartWallTime: '10:00:00',
    physicalPlant: frontlinePlantConfig,
  },
  objectives: [],
};

/** Dev sandboxes for the forward post: same kit and site mode as S10 (Skylink only) and S11 (EuroSat added). */
const forwardSandbox = (scenarioNumber: 10 | 11, eurosat: boolean): ScenarioData => ({
  ...frontlineSandboxData,
  id: eurosat ? 'frontline-sandbox-forward-eurosat' : 'frontline-sandbox-forward',
  url: eurosat ? 'frontline/sandbox-forward-eurosat' : 'frontline/sandbox-forward',
  title: eurosat ? 'Forward Post Sandbox (EuroSat)' : 'Forward Post Sandbox',
  subtitle: eurosat ? 'Rautala kit as in Exercise 11' : 'Rautala kit as in Exercise 10',
  description: `The Rautala forward post with the ${eurosat ? 'Skylink kit plus the EuroSat terminal' : 'Skylink kit only'}, as in Exercise ${scenarioNumber}. No faults, no objectives.`,
  equipment: eurosat
    ? ['SpaceY terminal, router and cable', 'EuroSat VSAT dish, LNB, IFL and modem', 'Generator and battery', 'Laptop']
    : ['SpaceY terminal, router and cable', 'Generator and battery', 'Laptop'],
  settings: { ...createFrontlineSettings(scenarioNumber), isExtraSatellitesVisible: true },
  objectives: [],
});

export const frontlineForwardSandboxData = forwardSandbox(10, false);
export const frontlineForwardEurosatSandboxData = forwardSandbox(11, true);
