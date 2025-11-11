import { ScenarioData } from '../scenario-manager';

/**
 * Scenario 1: "First Light" - HELIOS-7 Initial Contact
 *
 * A beginner-level scenario where the student conducts the first ground station
 * link test with a newly launched C-band communications satellite.
 */

export const scenario1Data: ScenarioData = {
  id: 'scenario1',
  number: 1,
  title: '"First Light"',
  subtitle: 'HELIOS-7 Initial Contact',
  duration: '25-30 min',
  difficulty: 'beginner',
  missionType: 'Commercial Communications',
  description: `You are a Ground Station Operator at Pacific Rim Communications facility in Guam. Your company has just launched HELIOS-7, a new C-band communications satellite. The satellite is now station-keeping at 145°E geostationary orbit. You will conduct the first ground station link test - a critical milestone before commercial operations begin.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    '2× Spectrum Analyzers',
  ],
  settings: {
    isSync: false,
    antennas: 1,
    rfFrontEnds: 1,
    spectrumAnalyzers: 2,
    transmitters: 0,
    receivers: 0,
  }
};
