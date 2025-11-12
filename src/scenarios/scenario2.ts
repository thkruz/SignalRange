import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-configs";
import { ScenarioData } from "../scenario-manager";

export const scenario2Data: ScenarioData = {
  id: 'first-light2',
  url: 'scenarios/2',
  imageUrl: 'scenario2.jpg',
  number: 2,
  title: '"Signal Hunt"',
  subtitle: 'Deep Space Tracking Exercise',
  duration: '35-40 min',
  difficulty: 'intermediate',
  missionType: 'Deep Space Operations',
  description: `Track and analyze signals from a deep space probe passing through the outer solar system. You'll need to compensate for Doppler shift, manage antenna pointing, and maintain signal lock despite challenging signal conditions and atmospheric interference.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    '2× Spectrum Analyzers',
    'Receiver',
  ],
  settings: {
    isSync: false,
    antennas: [ANTENNA_CONFIG_KEYS.C_BAND_3M_ANTESKY],
    rfFrontEnds: 1,
    spectrumAnalyzers: 2,
    transmitters: 0,
    receivers: 1,
  }
};
