import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 14 - "Atlantic Low" / Weather Reallocation Judgment
 *
 * A deep low crosses Ireland. Real Ku rain fade (phase 16, E5) sits on Galway
 * for the customer's priority-1 MERIDIAN-SAR-2 collect at 11:12: 30 mm/h on
 * a 19 degree pass is about 7 dB of path attenuation at 11.7 GHz, so the
 * collect cannot close from GW-01 and is reallocated to SH-02, which has sky,
 * and flown FROM the Shetland console. Galway is armed anyway so the operator
 * can watch the fade eat the same pass live. Behind the rain the front turns
 * to sleet (ice on the feed, the heater's problem) for the priority-2 SAR-1
 * window at 11:45; that one is a judgment call - ride it out at Galway on
 * measured margin with the heater on, or hand it over too.
 *
 * Clock starts 2027-04-02 11:00:00 UTC. Passes (0 deg horizon, per station,
 * scripts/author-passes.mjs):
 *
 *   SH-02 MERIDIAN-SAR-2: AOS T+10.71 (11:10:42Z, az 023), max el 34.1 deg at
 *                         T+15.58 (11:15:35Z, 659 km), LOS T+20.42 (11:20:25Z,
 *                         az 178), 9.7 min, southbound. The collect, from SH-02.
 *   GW-01 MERIDIAN-SAR-2: AOS T+12.90 (11:12:53Z, az 028), max el 19.1 deg at
 *                         T+17.50 (11:17:30Z, 993 km), LOS T+22.05 (11:22:03Z,
 *                         az 163), 9.2 min, southbound. In the rain: a fade, not
 *                         a decode.
 *   GW-01 MERIDIAN-SAR-1: AOS T+44.98 (11:44:59Z, az 142), max el 29.6 deg at
 *                         T+49.72 (11:49:43Z, 732 km), LOS T+54.51 (11:54:31Z,
 *                         az 355), 9.5 min, northbound. The ride-out.
 *   SH-02 MERIDIAN-SAR-1: AOS T+46.08, max el 75.1 deg, LOS T+56.03 (Fiona's
 *                         fallback, never needed).
 *
 * Weather at GW-01: rain, severe (30 mm/h), 11:01 to 11:26 with 3.75 min
 * ramps; then hail (sleet), severe, 11:26 to 12:11. Ice on the feed builds to
 * 10 dB with a 12 min time constant while the heater is off and melts at
 * 1 dB/min once it is on: heater on before the sleet keeps the 11:45 pass at
 * its clear-sky ~11 dB; heater never on puts ~8.6 dB of ice on it at
 * culmination and there is no lock. Both curves asserted in
 * test/campaigns/nats-eu-phase-c-validation.test.ts, along with the rain fade
 * on the Galway SAR-2 pass and the dry Shetland decode.
 *
 * Staged state: both sites the shared default (RX modems on 1414 MHz, BUCs
 * unmuted, heaters off).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0721: Knowledge of environmental factors affecting communications
 *   - S0807: Skill in making operational decisions under uncertainty
 *   - S0575: Skill in documenting operational procedures
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - T0129: Coordinate and manage system operations schedules
 *   - T0153: Monitor network capacity and performance
 *   - K0740: Knowledge of system performance indicators
 *   - S0478: Skill in communicating with customers
 *   - K0689: Knowledge of network systems management
 *   - K0645: Knowledge of standard operating procedures
 */

/** MERIDIAN-SAR-1 (61701) at the S14 epoch: the 30 deg ride-out over Galway. */
const SAR1_S14_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27092.45833333  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61701  97.2000  18.0000 0010000  90.0000 131.7500 15.60000000123458' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S14 epoch: 34 deg over Shetland, 19 deg over Galway. */
const SAR2_S14_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27092.45833333  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61702  98.4000 173.0000 0010000  90.0000 329.2500 15.60000000123458' as TleLine2,
};

const meridianSar1S14 = createMeridianSar1(SAR1_S14_TLE);
const meridianSar2S14 = createMeridianSar2(SAR2_S14_TLE);

/** Both sites as the night shift left them. Deep clones, never spread. */
const galwayInTheRain: GroundStationConfig = structuredClone(galwayGroundStation);
const shetlandWithSky: GroundStationConfig = structuredClone(shetlandGroundStation);

export const natsEuScenario14Data: ScenarioData = {
  id: 'nats-eu-scenario14',
  url: 'nats-eu/scenarios/nats-eu-scenario14',
  imageUrl: 'nats/14/card.png',
  number: 14,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario13'],
  title: 'Atlantic Low',
  subtitle: 'Weather Reallocation Judgment',
  duration: '40 min',
  missionType: 'Weather Operations',
  description: `11:00 local. A deep low is crossing Ireland: heavy rain on Galway now, turning to sleet by half past, clearing by early afternoon. Shetland has sky until two.<br><br>Erik's priority-1 MERIDIAN-SAR-2 collect rises at 11:12 into the worst of it, on a 19 degree pass with no margin to lose. A priority-2 SAR-1 window at 11:45 sits behind the front, in the sleet.<br><br>Read the fade, move the collect to Shetland and fly it from there while Galway watches its own pass drown. Then decide whether the 11:45 pass is a ride-out or a hand-over, protect the feed before the sleet arrives, and write down the rule you used.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker (feed heater)',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'Contact Plan Console',
    'Ku-Band RF Front End (GPSDO / LNB / BUC / HPA)',
    'RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayInTheRain, shetlandWithSky],
    satellites: [meridianSar1S14, meridianSar2S14],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-02',
    scenarioStartWallTime: '11:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-14?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // Twenty minutes between the collect (LOS 11:22) and the ride-out (AOS
    // 11:45). The skip stops 2 min before the next pass at either site and is
    // blocked while a timed objective runs; mission-elapsed advances with it,
    // so the sleet and the ice curve stay aligned with the sky.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 2,
    },

    workingDocument: {
      title: 'GW-01 Weather Log',
      description: '2027-04-02, Atlantic low. One line per contact with the weather decision that was made, and the standing rule.',
    },

    // E5 - real Ku rain fade at Galway for the collect, then sleet (ice on the
    // feed) for the ride-out. Rain ramps in and out over 15 % of the event;
    // ice builds while the heater is off and melts at 1 dB/min once it is on.
    weatherEvents: [
      { id: 'gw-atlantic-rain', groundStationId: 'GW-01', type: 'rain', severity: 'severe', startTime: 60, duration: 1500, linkMarginDegradation: 7, rainRateMmPerHour: 30 },
      { id: 'gw-atlantic-sleet', groundStationId: 'GW-01', type: 'hail', severity: 'severe', startTime: 1560, duration: 2700, linkMarginDegradation: 10 },
    ],

    // M3 - both windows on both sites. Every P1/P2 contact has to be assigned
    // for the plan to validate; the objectives force the collect onto SH-02
    // and the ride-out onto GW-01. Windows are 0 deg horizon crossings.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        {
          id: 'W-SAR2-SH',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Shetland, 34 deg) - NMW priority collect',
          priority: 1,
          windowStartS: 640,
          windowEndS: 1230,
          stationId: 'SH-02',
        },
        {
          id: 'W-SAR2-GW',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Galway, 19 deg) - NMW priority collect',
          priority: 1,
          windowStartS: 770,
          windowEndS: 1320,
          stationId: 'GW-01',
        },
        { id: 'W-SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 30 deg)', priority: 2, windowStartS: 2700, windowEndS: 3270, stationId: 'GW-01' },
        { id: 'W-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 75 deg)', priority: 2, windowStartS: 2760, windowEndS: 3360, stationId: 'SH-02' },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0721'],
      title: 'Read the Weather Brief',
      description: 'Open the brief: the front, its timing over both sites, the two windows and what each is worth.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Weather Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Fade Magnitude Read',
          params: {
            character: Character.SYSTEM,
            question: 'A 30 mm/h cell at 11.7 GHz on a 19 degree pass. Order of magnitude of the fade?',
            options: [
              'Several dB - about 7 on this geometry, before the rain also warms the sky - against a link that peaks near 8.5 dB clear. The collect will not close from Galway',
              'A fraction of a dB, as it was at C-band in Vermont',
              'About 1 dB: rain only matters above 20 GHz',
              'Total: rain blocks Ku entirely',
            ],
            correctIndex: 0,
            explanation:
              'Rain attenuation rises steeply with frequency: a tenth of a dB at 4 GHz becomes whole decibels at 12 GHz, and a low pass drags the beam through more of the rain. This is the single most Ku-specific number this campaign teaches. Twelve minutes to the collect. Shift clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: READ THE FADE, COLD CHAIN, THE DECISION
    // ============================================================
    {
      id: 'read-the-fade-on-the-board',
      nice: ['K0721', 'T0153', 'K0740'],
      title: 'Read the Fade on the Board',
      description: 'Dashboard: the RAIN FADE alarm on GW-01 is climbing with the rain rate. Read it, and say what the feed heater can do about it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Heater vs Rain',
          params: {
            character: Character.SYSTEM,
            question: 'RAIN FADE on GW-01, rising. Does the feed heater help?',
            options: [
              'No. Rain attenuation is in the air along the whole slant path; the heater melts ice on the feed horn. It is the answer to the sleet behind the front, not to the rain in it',
              'Yes: a warm feed sheds water and recovers most of the fade',
              'Yes: the heater raises the LNB temperature and its gain with it',
              'Partly: it recovers the uplink but not the downlink',
            ],
            correctIndex: 0,
            explanation:
              'Two different losses with two different fixes. Rain: reallocate or ride through on margin. Ice: heater, early. Knowing which one you are looking at is the shift.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'galway-cold-chain',
      nice: ['T0431', 'K0740', 'S0421'],
      title: 'GW-01 Cold Chain',
      description: 'Receive-only day at Galway: GPSDO locked, BUC muted, HPA output disabled. Nothing goes up through a rain cell.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-fade-on-the-board'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'GW-01 BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'GW-01 HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'reallocate-the-collect',
      nice: ['K0721', 'K0689', 'T0129'],
      title: 'Reallocate the Collect',
      description: 'The P1 SAR-2 collect cannot be worked from Galway in this cell. Give the Shetland window to SH-02, assign the rest, and keep the plan DECONFLICTED.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-cold-chain'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Contact Plan Open',
          params: { tab: 'contact-schedule' },
          mustMaintain: false,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Collect on SH-02',
          params: { contactId: 'W-SAR2-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Reallocation Justified',
          params: {
            character: Character.SYSTEM,
            question: 'Why does the P1 collect move, when the P2 window at 11:45 might not?',
            options: [
              'A P1 collect gets the site that can close it: 34 degrees of dry sky at Shetland against 19 degrees under 7 dB of rain at Galway is not a judgment call. The 11:45 window is behind the front, on better geometry, and can be decided on measured margin',
              'Because Shetland is the primary site for SAR-2',
              'Because the plan will not validate with both SAR-2 windows on Galway',
              'It should not move: Galway is the customer site and the fade may ease',
            ],
            correctIndex: 0,
            explanation: 'Reallocate what the weather has already decided. Keep the decisions the weather has left you.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'arm-galway-to-watch-the-fade',
      nice: ['S0421', 'K0721', 'K0740'],
      title: 'Arm Galway to Watch the Fade',
      description:
        'Galway flies its own SAR-2 pass anyway, unattended, so you can measure what the rain does. Modem 1 to 1370 MHz and program-track with MERIDIAN-SAR-2 as the target before you leave for Shetland.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reallocate-the-collect'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Armed',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 5 -> BEAT 1: SHETLAND, THE DRY SITE
    // ============================================================
    {
      id: 'shetland-weather-sweep',
      nice: ['T0431', 'S0421', 'K0773'],
      title: 'SH-02 Weather Sweep',
      description:
        'Select SH-02. Reference locked, LNB stable, and retune modem 1 from 1414 MHz to the 1370 MHz SAR-2 carrier with the analyzer centred on 1370 MHz, 2 MHz span. AOS 11:10 from azimuth 023.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['arm-galway-to-watch-the-fade'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-locked',
          description: 'SH-02 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'SH-02 LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'SH-02 Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'SH-02 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-shetland-for-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position Shetland for SAR-2',
      description: 'Park the SH-02 tracker on the AOS azimuth, 23 degrees at 5 degrees elevation.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-weather-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'SH-02 Az 23 / El 5',
          params: { azimuth: 23, elevation: 5, tolerance: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE COLLECT FROM SHETLAND, THE FADE AT GALWAY
    // ============================================================
    {
      id: 'acquire-sar2-from-shetland',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-2 from Shetland',
      description: 'AOS 11:10:42. Program-track MERIDIAN-SAR-2 on the SH-02 pedestal and confirm the imagery carrier on the Shetland RX analysis.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['preposition-shetland-for-sar2'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Downlink on the Shetland Analyzer',
          params: {
            signalId: 'MERIDIAN-SAR-2-VIDEO',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'decode-the-collect-from-shetland',
      nice: ['T0153', 'K0740', 'S0478'],
      title: 'Decode the Collect from Shetland',
      description:
        'Lock the 1370 MHz carrier on the SH-02 modem and hold C/N above 8 dB through culmination (11:15:35, 34 degrees, 659 km). This is the collect Erik is waiting on.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Customer Loop Closed',
          params: {
            character: Character.SYSTEM,
            question: 'The collect is decoding at Shetland with margin. What closes the loop with Erik?',
            options: [
              'That the collect is captured, which site it came from, and that the weather decision cost him nothing he cares about. Not the rain rate, not the decibels',
              'The C/N at culmination and the rain rate at Galway, so he can see why it moved',
              'Nothing until Rotterdam confirms the frames',
              'An apology for moving it off the site he was told it would come from',
            ],
            correctIndex: 0,
            explanation: 'The customer bought a collect, not a dish. The numbers go in the weather log for the people who read numbers.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'observe-the-galway-fade',
      nice: ['K0721', 'T0153', 'K0740'],
      title: 'Observe the Galway Fade',
      description:
        'Select GW-01 while its own SAR-2 pass is still up (until 11:22). The pedestal is program-track locked on the bird; read the C/N the rain has left it and do the arithmetic.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-the-collect-from-shetland'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-2 Through the Rain',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N At or Below 5 dB (rain fade)',
          params: { modemNumber: 1, maxCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Fade Measured',
          params: {
            character: Character.SYSTEM,
            question: 'Galway, 19 degrees, 30 mm/h: the same bird Shetland is decoding at 11 dB reads a couple of dB here, on a clean lock of the pedestal. Where did the rest go?',
            options: [
              'About 7 dB of rain attenuation along a 7.7 km slant path through the cell, plus a warmer sky raising the system noise temperature. The clear-sky number for this geometry was only about 8.5 dB to begin with',
              'Pointing: rain on the reflector defocuses the beam',
              'The LNB: water in the feed has raised its noise figure',
              'Doppler: the demodulator lost the carrier in the rain',
            ],
            correctIndex: 0,
            explanation:
              'ITU-R P.838: specific attenuation goes as k times rain rate to the power alpha, and at 12 GHz k is a hundred times what it was at 4 GHz. A low pass makes it worse twice: longer path through the rain, and less clear-sky margin to spend.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4/5: LOG, THE FRONT TURNS, THE JUDGMENT
    // ============================================================
    {
      id: 'log-the-collect',
      nice: ['S0575', 'K0645', 'T1580'],
      title: 'Log the Collect',
      description: 'Write the collect into the weather log with the decision that made it: which site, why, and what Galway measured in the rain.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['observe-the-galway-fade'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Collect Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What does the weather log need for the 11:12 collect?',
            options: [
              'Collect worked from SH-02 at 34 degrees with margin; the Galway window was flown for the record and faded to about 2 dB in 30 mm/h at 19 degrees; the P1 was reallocated before AOS, not after a failed attempt',
              'Collect worked',
              'Rain at Galway, collect moved',
              'The C/N at Shetland and nothing about Galway, since Galway was not the site',
            ],
            correctIndex: 0,
            explanation: 'The measurement Galway made in the rain is the evidence the reallocation rule stands on next time. A decision without its number is an opinion.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '11:10Z MERIDIAN-SAR-2 (NMW P1 collect): reallocated to SH-02 before AOS, decoded at 34 deg with margin. GW-01 window flown unattended for the record: 30 mm/h rain, 19 deg, C/N faded to ~2 dB (about 7 dB of rain attenuation). Customer informed: collect captured.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'protect-the-feed',
      nice: ['S0421', 'T0431', 'K0721'],
      title: 'Protect the Feed',
      description: 'The rain turns to sleet at 11:26. Feed heater on at GW-01 now, before the first flake, not at the first fade. Every minute it is off costs a decibel later.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-collect'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'feed-heater-enabled',
          description: 'GW-01 Feed Heater Enabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Heater Timing',
          params: {
            character: Character.SYSTEM,
            question:
              'Heater on at 11:24, sleet from 11:26, pass at 11:45. What does the feed carry at culmination, and what would it carry if the heater had waited for the first fade?',
            options: [
              'On before the sleet: nothing accumulates, the pass sees its clear-sky ~11 dB. Off until the fade shows at 11:45: about 8.6 dB of ice already on the horn, melting at 1 dB a minute, and no lock until it is gone',
              'The same either way: the heater clears ice in seconds',
              'On early: the feed runs hot and adds noise. Better to wait for ice to show',
              'It does not matter: sleet does not stick to a Ku feed',
            ],
            correctIndex: 0,
            explanation:
              'Ice builds with a 12 minute time constant and melts at 1 dB per minute. The heater is a decision made before the loss, because after it the pass is already gone.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'decide-the-ride-out',
      nice: ['S0807', 'K0721', 'T0129'],
      title: 'Decide the Ride-Out',
      description: 'The P2 SAR-1 window at 11:45: keep it at Galway or hand it to Shetland too? Decide on measured margin, then confirm the plan carries your decision.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['protect-the-feed'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'contact-assigned',
          description: 'SAR-1 11:45 Window on GW-01',
          params: { contactId: 'W-SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Ride-Out Decided',
          params: {
            character: Character.SYSTEM,
            question: 'Rain clearing by 11:26, heater on, sleet only. 30 degree pass, clear-sky ~11 dB, delivery standard 8. What is the 11:45 call?',
            options: [
              'Keep it at Galway: with the heater on the feed carries no ice, 3 dB of margin covers what is left of the front, and handing every window to Shetland loses capacity you have. If the heater had stayed off, the answer flips',
              'Hand it to Shetland: 75 degrees there beats 30 degrees anywhere',
              'Hand it to Shetland: a site that just faded out cannot be trusted for an hour',
              'Drop it: P2 windows are not worth a risk',
            ],
            correctIndex: 0,
            explanation:
              'The rain decided the P1. The P2 is yours to decide, and the number that decides it is the feed loss you can read on the ACU, not the weather you can see out of the window.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'retune-galway-for-sar1',
      nice: ['S0421', 'K0773'],
      title: 'Retune Galway for SAR-1',
      description:
        'Modem 1 back to the 1414 MHz SAR-1 carrier, analyzer centred on the 1389 MHz SAR-1 beacon. The tracker is wherever the SAR-2 pass left it; program-track slews to the 11:45 rise at azimuth 142. Then skip ahead.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decide-the-ride-out'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: THE RIDE-OUT
    // ============================================================
    {
      id: 'ride-it-out',
      nice: ['T0153', 'S0421', 'K0740'],
      title: 'Ride It Out',
      description:
        'AOS 11:44:59 from azimuth 142, in the sleet, on a clean feed. Program-track MERIDIAN-SAR-1, lock the 1414 MHz carrier and hold C/N above 8 dB through culmination (11:49:43, 30 degrees, 732 km).',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-galway-for-sar1'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },

    // ============================================================
    // BEAT 4: LOG AND CLOSE
    // ============================================================
    {
      id: 'log-the-ride-out',
      nice: ['S0575', 'K0721', 'K0740'],
      title: 'Log the Ride-Out',
      description: 'Write the 11:45 pass into the weather log with the feed loss it was flown on and the number it would have been flown on.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['ride-it-out'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Ride-Out Logged',
          params: {
            character: Character.SYSTEM,
            question: 'The ACU feed-loss reading stayed at zero through the pass with the heater on since 11:24. What goes in the log beside the decode?',
            options: [
              'Decoded at ~11 dB on zero feed loss, heater on before the sleet; had it been off, the feed would have carried about 8.6 dB at culmination and the pass would have been lost. Ride-out was the right call on the margin measured, not on the forecast',
              'Decoded, heater on',
              'Decoded; the weather was not as bad as forecast',
              'Decoded at 11 dB, which proves the heater was unnecessary',
            ],
            correctIndex: 0,
            explanation: 'A pass that went well on a decision is only evidence if the log says what the decision was and what it avoided.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '11:45Z MERIDIAN-SAR-1 GW-01 (P2): ride-out in sleet, feed heater on from 11:24 (before onset 11:26), feed loss 0 dB, decoded at 30 deg, peak C/N ~11 dB. Heater off would have carried ~8.6 dB of ice at culmination: no lock.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'close-the-weather-log',
      nice: ['K0721', 'S0575', 'K0645'],
      title: 'Close the Weather Log',
      description: 'Write the standing rule down so the next operator does not have to rediscover it in the next front.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-ride-out'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Standing Rule Written',
          params: {
            character: Character.SYSTEM,
            question: 'What is the standing weather rule you write down?',
            options: [
              'Heater on at the first precipitation warning, not at the first fade. Reallocate P1 windows that fall inside a rain cell before AOS. Ride out P2 windows on measured feed loss and margin, not on the forecast',
              'Hand every window to whichever site has the better weather',
              'Heater on whenever the forecast says rain',
              'Never reallocate: the customer was promised a site',
            ],
            correctIndex: 0,
            explanation: 'Three sentences, three different losses: ice (prevent it), rain (route around it), margin (measure it). That is the whole of Ku weather operations.',
            pointPenalty: 5,
            documentSection: 'Standing Rule',
            documentLine:
              'Standing rule: feed heater ON at the first precipitation warning, not the first fade. P1 windows inside a rain cell are reallocated before AOS. P2 windows are ridden out on measured feed loss and link margin, never on the forecast alone.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Fiona MacLeod at 10:52]</em>
      </p>
      <p>
        "You've got the ugly end of it. Radar has the cell on Galway till half eleven and then it goes to sleet behind. I've got sky till two and my heater's been on since dawn out of habit. Erik's collect rises at ten past for me, twelve past for you. Say the word and it's mine."
      </p>
      `,
      character: Character.FIONA_MACLEOD,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'reallocate-the-collect': {
        text: `
        <p>
          I do not care which dish. I care about the 11:12 collect. If Shetland gets it, Shetland gets it - just tell me before it rises, not after.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'decode-the-collect-from-shetland': {
        text: `
        <p>
          Got the frames. Vessel is where I thought it was. Same time tomorrow, whichever dish is dry.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'protect-the-feed': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 11:25]</em>
        </p>
        <p>
          "Heater? Good. Mine's been on since dawn. Sleet's the one that gets you - it doesn't fade, it just sits on the horn and gets heavier. If you want the quarter-to pass I'd rather you had it; I've got the seventy-five if it goes wrong."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'ride-it-out': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 11:52]</em>
        </p>
        <p>
          "Told you it'd clear. Watched your number from here - eleven on a clean horn in sleet. That's the heater, not the weather. Right call keeping it."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'close-the-weather-log': {
        text: `
        <p>
          Two collects, two dishes, one front, and I never had to ask which. That is what I am paying for. Talk tomorrow.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
