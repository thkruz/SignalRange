import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { hasPinnedMember } from './evaluators';
import { cedarMesaGroundStation } from './ground-stations';
import { INTERFERENCE_REPORT_ID, interferenceReportFiled } from './interference-report';
import { kuSat1 } from './satellites';

/**
 * Constellation Sandbox - Starlink Interference
 *
 * Cedar Mesa's 2.4 m dish is locked on KU-SAT 1 (GEO, 98 W) and receiving four Ku
 * carriers. The full Starlink set (starlink-2026-11, about 11,200 members, not
 * operated) flies overhead. Every pass inside the dish view raises the noise
 * floor a little; a pass close to the GEO arc can knock the carriers down.
 *
 * Start time 2026-11-09 18:00:00 UTC. From that start, several Starlinks cross
 * within 1 deg of the dish boresight in the first hour (the first one about 9
 * minutes in), found by scripts/author-tle-constellation-demos.mjs.
 */
export const starlinkSandboxData: ScenarioData = {
  id: 'starlink-interference',
  url: 'range-watch/scenarios/starlink-interference',
  imageUrl: 'range-watch/starlink-interference/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'intermediate',
  title: 'Starlink Interference',
  subtitle: 'Watch a Constellation Cross a GEO Link',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `Your dish at Cedar Mesa is locked on KU-SAT 1, a Ku-band GEO satellite. Above it, the whole Starlink constellation is moving.
  <br/><br/>Starlink satellites downlink in the same Ku band. When one passes through the dish beam, or close enough for the sidelobes to catch it, the noise floor rises and the GEO carriers lose margin. Watch the passes on the World Map, pin the ones you care about, and use the spectrum analyzer and the timeline to find the satellite that hurt your link, then file an interference report with its NORAD number, the time window and the C/N drop. The report is accepted only if that satellite really was in line with the link in the window you give. Skip time forward to find the next event. There is no timer and nothing here can fail.`,
  equipment: ['2.4-meter Ku-band Antenna (program-track on KU-SAT 1)', 'Ku-band RF Front End (13100 MHz LNB LO)', 'Spectrum Analyzer', 'RX Modem'],
  settings: {
    isSync: true,
    groundStations: [cedarMesaGroundStation],
    satellites: [kuSat1],
    constellations: [{ tleSet: 'starlink-2026-11' }],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2026-11-09',
    scenarioStartWallTime: '18:00:00',
  },
  objectives: [
    {
      id: 'open-world-map',
      title: 'Open the World Map',
      description: 'Open the World Map tab. Starlink satellites show as dots. The dish sits at Cedar Mesa, New Mexico.',
      groundStation: 'CM-01',
      conditions: [
        {
          type: 'tab-active',
          description: 'World Map Open',
          params: { tab: 'ground-track' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'pin-a-starlink',
      title: 'Pin a Starlink',
      description: 'Pick a Starlink in the asset tree or on the map and pin it. Pinned satellites stay live and get their own timeline lane.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['open-world-map'],
      conditions: [
        {
          type: 'custom',
          description: 'Starlink Pinned',
          params: { evaluator: hasPinnedMember },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'file-the-report',
      title: 'File an Interference Report',
      description:
        'KU-SAT 1 sits at az 168, el 48. Find the Starlink that crossed the link, then open the form and file its NORAD number, a UTC time window of at most 10 minutes around the crossing, and the C/N drop you saw on modem 1. The timeline lanes show when each pinned satellite is nearest. Skip time forward if nothing is close.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['pin-a-starlink'],
      conditions: [
        {
          type: 'custom',
          description: 'Interference report filed and accepted',
          params: { evaluator: interferenceReportFiled, reportForm: INTERFERENCE_REPORT_ID },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'name-the-cause',
      title: 'What Raised the Noise',
      description: 'Decide what the Starlink did to the link.',
      groundStation: 'CM-01',
      prerequisiteObjectiveIds: ['file-the-report'],
      conditions: [
        {
          type: 'status-check',
          description: 'Cause of the Degradation',
          params: {
            question: 'A Starlink crosses just past the edge of your dish beam and C/N on the GEO carrier drops. What is the most likely cause?',
            options: [
              'Starlink downlink energy entering the dish sidelobes or main beam',
              'The GEO satellite lost power',
              'The LNB local oscillator drifted',
              'Rain fade on the GEO path',
            ],
            correctIndex: 0,
            explanation:
              'Starlink downlinks in the Ku band. When one sits near the dish line of sight, its signal adds to the receiver noise through the sidelobes, or through the main beam if it is in line. The GEO carriers did not change. The noise under them did.',
            character: Character.CHARLIE_BROOKS,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
