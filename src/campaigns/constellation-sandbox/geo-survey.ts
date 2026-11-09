import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { BEACON_REPORT_ID, beaconReportFiled, beaconTuned } from './beacon-id';
import { dishOnPinned, pinnedAtLeast } from './evaluators';
import { highDesertGroundStation } from './ground-stations';

/**
 * Constellation Sandbox - GEO Belt Survey
 *
 * A 3 m Ku dish at High Desert, parked on the southern sky. The geo-belt-2026-11
 * set (GEO payloads only, about 1,000 members, not operated) fills the arc. Each
 * payload carries the generic GEO Ku carrier plan plus one beacon set by its
 * NORAD number: the traffic carriers look alike on every slot, the beacon tells
 * satellites apart.
 *
 * Start time 2026-11-09 18:00:00 UTC.
 */
export const geoSurveyData: ScenarioData = {
  id: 'geo-belt-survey',
  url: 'range-watch/scenarios/geo-belt-survey',
  imageUrl: 'range-watch/geo-belt-survey/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'beginner',
  title: 'GEO Belt Survey',
  subtitle: 'Sweep the Arc and Find Occupied Slots',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `Your dish at High Desert can see part of the geostationary belt: a line of satellites over the equator, each parked at its own slot.
  <br/><br/>Turn on the GEO belt layer on the World Map and search the asset tree to see who is up there. Then point the dish at a slot, open RX Analysis and look for carriers. An occupied slot shows a row of carriers on the spectrum analyzer. An empty one shows only noise. The dish slews slowly, so choose your slots with care.
  <br/><br/>The traffic carriers look the same on every slot, because operators reuse frequencies. Beacons are different: each satellite sends one narrow beacon between 11.2 and 11.7 GHz, and its frequency is set by its NORAD number. Tune the modem to a beacon and you know which satellite you are listening to. The Beacon ID form has a lookup that turns a NORAD number into a beacon frequency and back. There is no timer.`,
  equipment: ['3-meter Ku-band Antenna (manual)', 'Ku-band RF Front End (13100 MHz LNB LO)', 'Spectrum Analyzer', 'RX Modem'],
  settings: {
    isSync: true,
    groundStations: [highDesertGroundStation],
    satellites: [],
    constellations: [{ tleSet: 'geo-belt-2026-11', include: { groups: ['geo-payload'] } }],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2026-11-09',
    scenarioStartWallTime: '18:00:00',
  },
  objectives: [
    {
      id: 'open-world-map',
      title: 'Open the World Map',
      description: 'Open the World Map tab and turn on the GEO belt layer. The visible arc is the part of the belt above the dish horizon.',
      groundStation: 'HD-01',
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
      id: 'pin-a-slot',
      title: 'Pin a GEO Satellite',
      description: 'Search the asset tree for a GEO payload that is above the horizon and pin it.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['open-world-map'],
      conditions: [
        {
          type: 'custom',
          description: 'GEO Satellite Pinned',
          params: { evaluator: pinnedAtLeast(1) },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'point-at-slot',
      title: 'Point the Dish at It',
      description: 'Read the satellite az and el from the asset panel and set the antenna to match. The dish moves at 0.2 degrees per second.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['pin-a-slot'],
      conditions: [
        {
          type: 'custom',
          description: 'Dish Within 1 Degree of the Pinned Satellite',
          params: { evaluator: dishOnPinned(1) },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-carriers',
      title: 'Read the Carriers',
      description: 'Open RX Analysis. Modem 1 is tuned to 1300 MHz IF. Peak the dish on the slot until the modem reads a C/N of at least 10 dB.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['point-at-slot'],
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'RX Modem 1 C/N at least 10 dB',
          params: { modemNumber: 1, minCNRatio: 10, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'convert-the-if',
      title: 'Convert IF to RF',
      description: 'The LNB local oscillator is at 13100 MHz and the modem is on 1300 MHz IF.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['read-the-carriers'],
      conditions: [
        {
          type: 'status-check',
          description: 'IF to RF',
          params: {
            question: 'The LNB LO is 13100 MHz (high-side) and the carrier appears at 1300 MHz IF. What is the downlink frequency?',
            options: ['11800 MHz', '14400 MHz', '11780 MHz', '1300 MHz'],
            correctIndex: 0,
            explanation: 'With a high-side LO, IF = LO - RF, so RF = LO - IF = 13100 - 1300 = 11800 MHz.',
            character: Character.CHARLIE_BROOKS,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tune-the-beacon',
      title: 'Tune a Beacon',
      description:
        'With the dish on a slot, look on the analyzer for a narrow spike above the traffic carriers, between 1400 and 1900 MHz IF (11200 to 11700 MHz RF). Set modem 1 to its IF and a bandwidth of 1 MHz until it reads a C/N of at least 10 dB.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['read-the-carriers'],
      conditions: [
        {
          type: 'custom',
          description: 'Modem 1 on a satellite beacon, C/N at least 10 dB',
          params: { evaluator: beaconTuned },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'identify-by-beacon',
      title: 'Confirm Which Satellite It Is',
      description:
        'Open the Beacon ID form. Use the lookup to find which satellites use the beacon frequency you tuned, pick the one the dish is pointed at, and enter its NORAD number. It is accepted only if modem 1 is measuring that satellite beacon.',
      groundStation: 'HD-01',
      prerequisiteObjectiveIds: ['tune-the-beacon'],
      conditions: [
        {
          type: 'custom',
          description: 'Beacon identified',
          params: { evaluator: beaconReportFiled, reportForm: BEACON_REPORT_ID },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
};
