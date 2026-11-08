import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 14 - "Atlantic Low" / Weather Reallocation Judgment
 *
 * A deep low crosses Ireland. Real Ku rain fade (phase 16, E5) sits on Galway
 * for the customer's priority-1 MERIDIAN-SAR-2 collect at 11:12: 30 mm/h on
 * a 19 degree pass is about 10 dB of path attenuation at 11.7 GHz, so the
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
  imageUrl: 'nats-eu/14/card.png',
  number: 14,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario13'],
  title: 'Atlantic Low',
  subtitle: 'Weather Reallocation Judgment',
  duration: '40 min',
  missionType: 'Weather Operations',
  description: `11:00 UTC. A deep low is crossing Ireland: heavy rain on Galway now, turning to sleet by about half past, and clearing by early afternoon. Shetland has clear sky until two.<br><br>Erik's priority-1 MERIDIAN-SAR-2 collect rises at 11:12, straight into the worst of it, on a 19 degree pass with no margin to spare. A priority-2 SAR-1 window at 11:45 sits behind the front, in the sleet.<br><br>Read the fade, move the collect to Shetland and fly it from there while Galway watches its own pass drown. Then protect the feed before the sleet arrives, decide whether the 11:45 pass is a ride-out at Galway or a hand-over, and write down the rule you used.`,
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
      description: 'Open the brief and read how the front moves over both sites, what the two windows are, and what each one is worth.',
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
            question: 'A 30 mm/h rain cell sits on a 19 degree pass at 11.7 GHz. About how big is the fade?',
            options: [
              "Several dB, about 10 here: the link peaks near 8.5 dB clear, so the collect won't close from Galway",
              'A fraction of a dB, as at C-band in Vermont: the link peaks near 8.5 dB clear, so the collect closes',
              'About 1 dB, since rain only matters above 20 GHz: the link peaks near 8.5 dB clear, so the collect closes',
              "Total, since rain blocks Ku entirely at 30 mm/h: the collect won't close from anywhere, whatever the link peaks at",
            ],
            correctIndex: 0,
            explanation:
              "Rain attenuation rises steeply with frequency: a tenth of a dB at 4 GHz becomes whole decibels at 12 GHz, and a low pass drags the beam through more of the rain. That's about 10 dB here, against a link that only peaks at 8.5 dB, so the collect can't close from Galway. The rain also warms the sky, which adds noise on top. The collect is twelve minutes away and the shift clock starts now.",
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
      description: 'Open the Dashboard and read the RAIN FADE alarm on GW-01, which climbs with the rain rate. Then say what the feed heater can do about it.',
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
            question: 'The RAIN FADE alarm on GW-01 is rising. Will the feed heater help?',
            options: [
              'No. Rain attenuation is in the air along the whole slant path; the heater melts ice on the feed horn',
              'Yes. A warm feed sheds water as fast as it arrives; the heater recovers most of the fade on the horn',
              'Yes. The heater raises the LNB temperature and its gain with it; the extra gain buys back the fade',
              'Partly. The heater dries the feed side of the path; it recovers the uplink but not the downlink',
            ],
            correctIndex: 0,
            explanation:
              "The heater is the answer to the sleet behind the front, not to the rain in it. Rain is a loss along the whole slant path, so the only fixes are to reallocate the pass or ride it out on margin. Ice sits on the feed, so the heater fixes that, but only if you turn it on early. Telling which of the two you're looking at is most of this shift.",
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
      description: 'Run Galway receive-only today. Confirm the GPSDO is locked, mute the BUC and make sure the HPA output is disabled, so nothing transmits through the rain cell.',
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
      description:
        "The priority-1 SAR-2 collect can't be worked from Galway in this rain. Assign the Shetland window to SH-02, assign the remaining windows, and keep the contact plan DECONFLICTED.",
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
            question: 'The P1 collect has to move to Shetland, but the P2 window at 11:45 might stay at Galway. Why the difference?',
            options: [
              'A P1 collect gets the site that can close it: 34 degrees of dry sky at Shetland against 19 degrees under 10 dB of rain',
              'Shetland is the primary site for SAR-2: 34 degrees there against 19 at Galway, and the plan defaults the P1 to the higher pass',
              'The plan will not validate with both SAR-2 windows on Galway: the P1 moves because DECONFLICTED needs one per site',
              'It should not move: Galway is the customer site, and 10 dB of rain at 19 degrees may ease before the 11:12 rise',
            ],
            correctIndex: 0,
            explanation:
              "This one isn't a judgment call, because the rain has already decided the P1 collect. The 11:45 window is behind the front, on better geometry, so you can decide it later on measured margin. Reallocate what the weather has decided, and keep the decisions it has left you.",
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
        'Galway will still fly its own SAR-2 pass, unattended, so you can measure what the rain does to it. Set modem 1 to 1370 MHz and turn on program-track with MERIDIAN-SAR-2 as the target before you leave for Shetland.',
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
        'Select SH-02 and check that the reference is locked and the LNB is stable. Then retune modem 1 from 1414 MHz to the 1370 MHz SAR-2 carrier, and centre the analyzer on 1370 MHz with a 2 MHz span. SAR-2 rises over Shetland at 11:10, from azimuth 23 degrees.',
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
      description: "Point the SH-02 tracker at the rise position, azimuth 23 degrees and elevation 5 degrees, so it's waiting where SAR-2 comes up.",
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
      description: 'SAR-2 rises at 11:10:42. Turn on program-track for MERIDIAN-SAR-2 on the SH-02 pedestal, then confirm the imagery carrier on the Shetland RX Analysis tab.',
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
        'Lock modem 1 on the 1370 MHz carrier at SH-02 and log a C/N above 8 dB on the RX Analysis tab. It peaks near 12.5 dB at culmination (11:15:35, 34 degrees, 659 km). Once both rows are logged the decode is yours, so you can go to Galway to watch its fade. This is the collect Erik is waiting on.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Customer Loop Closed',
          params: {
            character: Character.SYSTEM,
            question: 'The collect is decoding at Shetland with margin. What closes the loop with Erik?',
            options: [
              'That the collect is captured, which site it came from, and that the decision cost him nothing he cares about',
              'The C/N at culmination, the rain rate at Galway, and the fade arithmetic, so he can see for himself why it moved',
              'Nothing yet, not the site and not the number, until Rotterdam has confirmed the frames and released them to him',
              'An apology for the site change, the reason it moved, and a promise that tomorrow comes from the dish he was told',
            ],
            correctIndex: 0,
            explanation:
              "Erik bought a collect, not a dish, so he needs to hear that it's captured and where it came from, not the rain rate or the decibels. Those numbers go in the weather log for the people who read numbers.",
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
        'Select GW-01 while its own SAR-2 pass is still up, which is until 11:22. The pedestal is tracking the satellite, so read the C/N the rain has left and work out how much fade that means.',
      groundStation: 'GW-01',
      // Phase 19.0a: opens beside the Shetland decode, not after it. Chained,
      // a player who finished the decode after Galway's LOS (1323 s) had no
      // pass left to measure the fade on.
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
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
          type: 'satellite-pass-phase',
          description: 'SAR-2 Past Culmination at GW-01',
          params: { noradId: 61702, phase: 'past-culmination' },
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
            question:
              'At Galway, 19 degrees, 30 mm/h, the satellite Shetland is decoding at about 12.5 dB reads about -1 dB at the peak of the fade, with no lock, even though the pedestal is tracking cleanly. Where did the rest of the signal go?',
            options: [
              'Rain: about 10 dB of attenuation along the slant path through the cell, plus a warmer sky raising the noise temperature',
              'Pointing: rain on the reflector defocuses the beam, and at 19 degrees the pedestal is chasing a low, fast target',
              'The LNB: water in the feed has raised its noise figure, and with the heater off the horn has been filling since 11:01',
              'Doppler: the demodulator lost the carrier in the rain, and at 19 degrees the range rate is near its highest of the pass',
            ],
            correctIndex: 0,
            explanation:
              'The pointing is fine, because the pedestal is tracking cleanly, so the loss is rain. The clear-sky C/N for this geometry was only about 8.5 dB to begin with, and the slant path through the cell is 7.7 km. In ITU-R P.838, specific attenuation goes as k times the rain rate to the power alpha, and at 12 GHz k is a hundred times what it was at 4 GHz. A low pass makes it worse twice, with a longer path through the rain and less clear-sky margin to spend.',
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
      description: 'Write the collect into the weather log with the decision behind it: which site flew it, why, and what Galway measured in the rain.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-the-collect-from-shetland', 'observe-the-galway-fade'],
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
              'Worked from SH-02 at 34 degrees with margin; Galway flown for the record, faded to about -1 dB; P1 moved before AOS',
              'Worked from SH-02 at 34 degrees with margin; Galway faded out in 30 mm/h rain; P1 moved after the Galway attempt failed',
              'Worked from SH-02 at 34 degrees with margin; the Shetland C/N only, nothing about Galway since it was not the site',
              'Worked from SH-02 at 34 degrees with margin; rain at Galway, collect moved; nothing further needed on the line',
            ],
            correctIndex: 0,
            explanation:
              'The log has to show that the collect moved before AOS rather than after a failed attempt, and that Galway faded in 30 mm/h at 19 degrees. That Galway measurement is the evidence the reallocation rule stands on next time, because a decision without its number is only an opinion.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '11:10Z MERIDIAN-SAR-2 (NMW P1 collect): reallocated to SH-02 before AOS, decoded at 34 deg with margin. GW-01 window flown unattended for the record: 30 mm/h rain, 19 deg, C/N faded to about -1 dB, no lock at the peak (about 10 dB of rain attenuation). Customer informed: collect captured.',
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
      description:
        'The rain turns to sleet at 11:26. Turn the GW-01 feed heater on now, before the first flake, instead of waiting for the first fade. Every minute it stays off costs about a decibel later.',
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
              'The heater went on at {{at:cond:protect-the-feed.0|11:24}}, the sleet starts at 11:26 and the pass is at 11:45. What does the feed carry at culmination? And what would it carry if the heater had waited for the first fade?',
            options: [
              'On before the sleet: nothing accumulates, the pass sees ~11 dB. Off until the fade: about 8.6 dB of ice, melting at 1 dB a minute',
              'The same either way: the heater clears ice in seconds, so the pass sees ~11 dB. Off until the fade: a minute of warm-up, then lock',
              'On early: the feed runs hot and adds noise, so the pass sees under 11 dB. Off until the fade: ice shows, heater on, no loss',
              'It does not matter: sleet does not stick to a Ku feed, so the pass sees ~11 dB. Off until the fade: the same ~11 dB, nothing to melt',
            ],
            correctIndex: 0,
            explanation:
              'Ice builds with a 12 minute time constant and melts at 1 dB per minute. With the heater off until 11:45, the pass would carry about 8.6 dB of ice at culmination and have no lock until it melted. You need to decide on the heater before the loss, because by the time the fade shows, the pass is already gone.',
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
      description:
        "The priority-2 SAR-1 window at 11:45 can stay at Galway or go to Shetland too. Decide on the margin you've measured, then confirm the contact plan carries your decision.",
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
            question:
              'The rain gives way to sleet at 11:26, and your heater is on. The 30 degree SAR-1 pass has about 11 dB of clear-sky C/N against a delivery standard of 8. What is your call on the 11:45 pass?',
            options: [
              'Keep it at Galway: with the heater on the feed carries no ice, and 3 dB of margin covers what is left of the front',
              'Hand it to Shetland: 75 degrees there beats 30 degrees anywhere, and the extra elevation is margin you never have to measure',
              'Hand it to Shetland: a site that faded out earlier cannot be trusted, and 3 dB of margin is not enough to bet a window on',
              'Drop it: a P2 window is not worth the risk in sleet, and Shetland has the 75 degree pass if the customer asks for it',
            ],
            correctIndex: 0,
            explanation:
              'With the heater on, the feed carries no ice, so the pass keeps its clear-sky 11 dB, which is 3 dB over the delivery standard. Handing every window to Shetland would throw away capacity you still have, although if the heater had stayed off the answer would flip. The rain decided the P1 collect, but the P2 window is yours to decide, and the deciding number is the feed loss on the ACU, not the weather outside the window.',
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
        'Set modem 1 back to the 1414 MHz SAR-1 carrier and centre the analyzer on the 1389 MHz SAR-1 beacon. The tracker is wherever the SAR-2 pass left it, and program-track will slew it to the 11:45 rise at azimuth 142 degrees. Then use the time skip to jump to just before the rise.',
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
        'SAR-1 rises at 11:44:59 from azimuth 142 degrees, in the sleet, on a clean feed. Turn on program-track for MERIDIAN-SAR-1, lock modem 1 on the 1414 MHz carrier and hold C/N above 8 dB through culmination (11:49:43, 30 degrees, 732 km).',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-galway-for-sar1'],
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Past Culmination at GW-01',
          params: { noradId: 61701, phase: 'past-culmination' },
          mustMaintain: false,
        },
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
      description: 'Write the 11:45 pass into the weather log, with the feed loss it was flown on and the loss it would have carried with the heater off.',
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
            question:
              'The ACU feed-loss reading stayed at zero through the pass, with the heater on since {{at:cond:protect-the-feed.0|11:24}}. What goes in the log beside the decode?',
            options: [
              'Decoded at ~11 dB on zero feed loss, heater on before the sleet; off, the feed would have carried about 8.6 dB at culmination',
              'Decoded at ~11 dB, heater on from {{at:cond:protect-the-feed.0|11:24}}; the sleet never reached the horn, so the heater made no difference to the pass',
              'Decoded at ~11 dB, the weather not as bad as forecast; the sleet cleared before culmination and the feed stayed dry',
              'Decoded at ~11 dB, which proves the heater was unnecessary; a clean feed at zero loss means there was no ice to melt',
            ],
            correctIndex: 0,
            explanation:
              "With the heater off, this pass would have been lost to the ice, so the ride-out was the right call on the margin you measured, not on the forecast. Zero feed loss is the heater's result, not proof that it wasn't needed. A pass that went well is only evidence if the log records the decision and what it avoided.",
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '11:45Z MERIDIAN-SAR-1 GW-01 (P2): ride-out in sleet, feed heater on from {{at:cond:protect-the-feed.0|11:24}} (before onset 11:26), feed loss 0 dB, decoded at 30 deg, peak C/N ~11 dB. Heater off would have carried ~8.6 dB of ice at culmination: no lock.',
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
      description: "Write the standing rule down so the next operator doesn't have to work it out again in the next front.",
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
            question: 'Which standing weather rule do you write in the log?',
            options: [
              'Heater on at the first precipitation warning; P1 windows in a rain cell reallocated before AOS; P2 ridden out on measured margin',
              'Heater on whenever the forecast says rain; every window handed to the site with the better weather; nothing ridden out at all',
              'Heater on at the first fade the ACU shows; P1 windows reallocated after a failed attempt; P2 ridden out on the forecast',
              'Heater on whenever the forecast says sleet; never reallocate, since the customer was promised a site; P2 ridden out on the forecast',
            ],
            correctIndex: 0,
            explanation:
              'The rule has three parts for three different losses: ice, which you prevent by heating before the first fade; rain, which you route around by reallocating before AOS; and margin, which you measure instead of guessing from the forecast. Heating at the first fade is too late, and the forecast alone is only a guess.',
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
        "You've got the ugly end of this one. Radar has the cell sitting on Galway until about half past eleven, and then it turns to sleet behind. I've got clear sky here until two, though the wind took the heat out of my tea before I got it up the hill. Erik's collect rises at ten past for me and twelve past for you, so say the word and it's mine."
      </p>
      `,
      character: Character.FIONA_MACLEOD,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/intro.mp3'),
    },
    objectives: {
      'reallocate-the-collect': {
        text: `
        <p>
          I saw the Shetland assignment come through. I don't care which dish it comes from. I care about the 11:12 collect, and I'm glad you told me before it rose, not after.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/obj-reallocate-the-collect.mp3'),
      },
      'decode-the-collect-from-shetland': {
        text: `
        <p>
          I've got the frames, and the vessel is where I expected it, inside my box.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/obj-decode-the-collect-from-shetland.mp3'),
      },
      'protect-the-feed': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "Heater's on, good. Sleet's coming in behind the rain, and it's the one that gets you. It doesn't fade the signal, it just sits on the feed horn at the front of the dish and gets heavier. Whichever way you call the pass at quarter to twelve, I've got the seventy-five degree one here if you want it."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/obj-protect-the-feed.mp3'),
      },
      'ride-it-out': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "I watched your number from here: eleven and a bit on a clean horn, in the sleet. That's the heater, not the weather, so keeping it on was the right call."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/obj-ride-it-out.mp3'),
      },
      'close-the-weather-log': {
        text: `
        <p>
          Two passes, two dishes, one front, and I never had to ask which dish. That's what I'm paying for. Talk tomorrow.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/14/obj-close-the-weather-log.mp3'),
      },
    },
  },
};
