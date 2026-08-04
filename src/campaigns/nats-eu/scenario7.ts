import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 7 - "Moving Target" / Ephemeris Management
 *
 * New mechanic: M4 space-domain events. A conjunction-avoidance burn invalidates
 * the element set the station has been tracking on. The operator sees the
 * ephemeris go stale on the Pass Schedule tab, loads the post-maneuver TLE, and
 * reacquires the bird.
 *
 * AUTHORING NOTES - two deliberate deviations from the campaign design plan,
 * both for playability:
 *
 * 1. The design plan assigns the burn to MERIDIAN-SAR-2, whose pass is at
 *    T+18.7 min. Using SAR-1 (AOS T+3.2, LOS T+10.3) instead keeps the whole
 *    scenario inside ~12 minutes rather than ~25, and the lesson - notice the
 *    stale set, load the update, reacquire - is identical.
 * 2. `maneuverAtS` is measured in WALL-CLOCK seconds from SpaceEventManager
 *    construction (the same quirk the Campaign 4 retro flagged for
 *    hardwareFaultEvents), not scenario-clock seconds. 60 s puts the notice on
 *    the console well before AOS while leaving time to act. If the operator is
 *    slow the stale state persists, so the pass is still recoverable.
 *
 * The post-maneuver element set is a small perturbation (RAAN +0.2 deg, mean
 * anomaly +0.5 deg), which shifts the pass by under ten seconds - a real
 * avoidance burn, not a new orbit.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0431: Monitor and maintain system operations
 *   - T1138: Perform system reconfiguration
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K0740: Knowledge of system performance indicators
 */
export const natsEuScenario7Data: ScenarioData = {
  id: 'nats-eu-scenario7',
  url: 'nats-eu/scenarios/nats-eu-scenario7',
  imageUrl: 'nats/7/card.png',
  number: 7,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario6'],
  title: 'Moving Target',
  subtitle: 'Ephemeris Management',
  duration: '15-20 min',
  missionType: 'Anomaly Response',
  description: `Anneke called at 05:40. Space Surveillance flagged a conjunction between MERIDIAN-SAR-1 and a spent upper stage, close enough that the constellation flew an avoidance burn overnight rather than argue about probabilities.<br><br>The burn was small. The problem is that everything at GW-01 - your pass predictions, your program-track pointing, the antenna's idea of where to look at AOS - is computed from an element set that describes an orbit the spacecraft is no longer in.<br><br>New elements are on the way from Rotterdam. Until you load them, the station is confidently pointing at yesterday.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Pass Schedule Console (ephemeris status)',
    'QPSK 3/4 Receiver',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-7?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // The SAR-1 pass is early (AOS T+3.2), but a reacquisition that goes wrong
    // leaves the operator waiting on the next window with nothing to do. The
    // skip stops 2 min short so acquisition is still flown by hand.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 3,
    },

    // M4 - the avoidance burn. maneuverAtS is wall-clock seconds from manager
    // construction (see the authoring note above).
    spaceEvents: [
      {
        id: 'SAR1-CAM',
        satelliteNoradId: 61701,
        maneuverAtS: 60,
        label: 'MERIDIAN-SAR-1 conjunction-avoidance maneuver (overnight)',
        newTle: {
          tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996',
          tle2: '2 61701  97.2000 176.2000 0010000  90.0000   8.5000 15.60000000123454',
        },
      },
    ],
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K1032'],
      title: 'Review the Conjunction Notice',
      description: 'Open the shift brief and read the overnight conjunction report.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Conjunction Notice Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Impact Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The burn changed the orbit slightly. What breaks at the ground station if you keep the old element set?',
            options: [
              'Pass predictions and program-track pointing - the antenna computes where to look from the elements, so it looks where the bird used to be.',
              'Nothing at the station. Elements only matter to the spacecraft operator.',
              'The receiver frequency, because the Doppler profile changes.',
            ],
            correctIndex: 0,
            explanation: 'Correct. The element set is the station\'s entire model of where the satellite is. A stale set is a confidently wrong antenna.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'find-stale-ephemeris',
      nice: ['T0431', 'K0740'],
      title: 'Check Ephemeris Status',
      description: 'Open the Pass Schedule tab. When the maneuver report reaches the station, the ephemeris status panel will show MERIDIAN-SAR-1 as stale.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Pass Schedule Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'load-updated-ephemeris',
      nice: ['T1138', 'K1032', 'T0431'],
      title: 'Load the Post-Maneuver Elements',
      description: 'Press Load Updated Ephemeris on the stale entry. This reloads the spacecraft\'s element set and immediately corrects both the pass predictions and where program-track will send the antenna.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['find-stale-ephemeris'],
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'Post-Maneuver Ephemeris Loaded',
          params: { eventId: 'SAR1-CAM' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'reacquire-the-bird',
      nice: ['S0421', 'K1032'],
      title: 'Reacquire MERIDIAN-SAR-1',
      description: 'With current elements loaded, program-track the bird through the pass and confirm the beacon comes up where the new prediction says it should.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['load-updated-ephemeris'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Reacquired',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'confirm-the-link',
      nice: ['T0153', 'K0740'],
      title: 'Confirm the Downlink',
      description: 'Lock the 1414 MHz imagery downlink and hold C/N above 8 dB to prove the reacquisition is clean, not marginal.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reacquire-the-bird'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ],
};
