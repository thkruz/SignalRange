import type { ScenarioData } from '@app/ScenarioData';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { aurora7Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Sandbox Mode
 *
 * Unlimited time free-practice environment with full equipment access.
 * No objectives, no timer, no checklist, no mission guide.
 * All equipment starts in a healthy, working state.
 */

export const sandboxData: ScenarioData = {
  id: 'nats-sandbox',
  url: 'nats/sandbox',
  imageUrl: 'nats/8/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-scenario4'],
  title: 'Sandbox',
  subtitle: 'Free Practice Mode',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `Explore the Vermont and Maine ground stations freely without objectives or time limits. All equipment is available and operational. Practice configuring the antenna, RF chain, spectrum analyzer, and modems at your own pace.
  <br/><br/>Use the sandbox to familiarize yourself with the Signal Range interface, test different setups, and hone your satellite communication skills without the pressure of a mission scenario.`,
  equipment: [
    '9-meter C-band Antenna',
    'Complete RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'All Control Systems',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
      { ...maineGroundStation, isOperational: true },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite, aurora7Satellite],
    isExtraSatellitesVisible: true,
  },
  objectives: [],
};
