import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, createMeridianSar3, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 13 - "The Numbers Don't Lie" / Pass-Performance Trending
 *
 * Two numbers on the week's log disagree with expectation, and the causes
 * look nothing alike in the data. Act 1 is the explained anomaly: an 89 deg
 * MERIDIAN-SAR-2 pass whose link collapses at culmination and comes back on
 * the descending leg (the azimuth keyhole - physics, not a fault). Act 2 is
 * the real fault: MERIDIAN-SAR-1 at the exact survey geometry decodes four
 * decibels under the survey budget, and the operator rules out ephemeris and
 * pointing before reading the LNB (150 K against a 60 K survey value). Act 3
 * proves Shetland is clean, moves the customer's priority collect there and
 * flies it FROM SH-02 so the comparison is measured, not asserted.
 *
 * Clock starts 2027-03-29 13:00:00 UTC. Passes (0 deg horizon, per station,
 * scripts/author-passes.mjs):
 *
 *   GW-01 MERIDIAN-SAR-2: AOS T+12.00 (13:12:00Z, az 163), max el 89.5 deg at
 *                         T+16.94 (13:16:56Z, 391 km), LOS T+21.93 (13:21:56Z,
 *                         az 345), 9.9 min, northbound. The zenith pass, on the
 *                         360 km orbit so both legs are strong and the crater
 *                         is unmistakable (the 560 km bird only reached 8 dB).
 *   SH-02 MERIDIAN-SAR-2: AOS T+13.66 (13:13:39Z), max el 27.3 deg at T+18.43,
 *                         LOS T+23.22 (Fiona's).
 *   SH-02 MERIDIAN-SAR-1: AOS T+28.07 (13:28:04Z), max el 23.7 deg at T+32.73,
 *                         LOS T+37.39 (Fiona's).
 *   GW-01 MERIDIAN-SAR-1: AOS T+30.03 (13:30:01Z, az 005), max el 28.0 deg at
 *                         T+34.76 (13:34:46Z, 762 km), LOS T+39.50 (13:39:30Z,
 *                         az 219), 9.5 min, southbound. The S2 survey geometry.
 *   GW-01 MERIDIAN-SAR-3: AOS T+51.90, max el 9.6 deg, LOS T+59.69 (a graze).
 *   SH-02 MERIDIAN-SAR-3: AOS T+52.00 (13:52:00Z, az 139), max el 31.9 deg at
 *                         T+56.77 (13:56:46Z, 694 km), LOS T+61.59 (14:01:35Z,
 *                         az 350), 9.6 min, northbound. The collect, from SH-02.
 *
 * The keyhole as the engine renders it: the pedestal's program-track lock and
 * the receiver's carrier are lost for several seconds through the top (the
 * azimuth swing of ~180 deg at 20 deg/s) and come back on the descending leg.
 * The crater objective therefore holds receiver lock for 100 s: activated on
 * the rising leg it cannot finish before the top, the dropout resets it, and
 * it completes on the descending leg. (A `maxCNRatio` reading is not used: the
 * 1 s satellite position throttle puts one low-C/N frame in every second of a
 * LEO pass, so an unheld "below X dB" condition latches anywhere, and the
 * keyhole is a carrier loss, which `cnHoldSeconds` cannot read either.)
 *
 * Staged state (scenario-local clone): GW-01's LNB has a degraded LNA (noise
 * figure 1.8 dB, noise temperature ~150 K settled) - the station is wrong, the
 * survey budget is right. Everything else on both sites is the shared default
 * (RX modems on 1414 MHz). All thresholds flown in
 * test/campaigns/nats-eu-phase-c-validation.test.ts, the SAR-3 collect from
 * Shetland, the degraded shortfall and the keyhole crater asserted there.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0349: Collect and analyze performance data to identify trends
 *   - S0646: Skill in analyzing system performance data
 *   - S0892: Skill in troubleshooting and diagnosing technical issues
 *   - K0064: Knowledge of performance tuning tools and techniques
 *
 * Supporting Codes:
 *   - K0740: Knowledge of system performance indicators
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0739: Knowledge of antenna and pointing systems
 *   - T0531: Troubleshoot system hardware and software
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0689: Knowledge of network systems management
 *   - S0675: Skill in maintaining equipment
 *   - T1606: Report findings and recommendations
 */

/** MERIDIAN-SAR-1 (61701) at the S13 epoch: the S2 survey geometry over Galway. */
const SAR1_S13_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27088.54166667  .00001000  00000-0  10000-3 0  9991' as TleLine1,
  tle2: '2 61701  97.2000 181.7500 0010000  90.0000 258.7500 15.60000000123451' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S13 epoch: the 89 deg zenith pass over Galway. */
const SAR2_S13_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27088.54166667  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61702  98.4000  28.2500 0010000  90.0000 258.0000 15.60000000123458' as TleLine2,
};

/** MERIDIAN-SAR-3 (61703) at the S13 epoch: the 32 deg collect over Shetland. */
const SAR3_S13_TLE: MeridianTle = {
  tle1: '1 61703U 27015A   27088.54166667  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61703  97.2000  58.0000 0010000  90.0000 111.5000 15.60000000123455' as TleLine2,
};

const meridianSar1S13 = createMeridianSar1(SAR1_S13_TLE);
const meridianSar2S13 = createMeridianSar2(SAR2_S13_TLE);
const meridianSar3S13 = createMeridianSar3(SAR3_S13_TLE);

/**
 * GW-01 with a degraded LNB front end. The LNA noise figure has drifted from
 * 0.8 to 1.8 dB, so the Friis noise temperature settles near 150 K instead
 * of 60 K. The LNA is the first stage, so its noise temperature is very
 * nearly the whole system temperature: 10 log(150 / 60) = 4.0 dB of C/N at
 * every elevation (measured 10.9 -> 7.0 dB at the survey geometry in the
 * harness). `noiseTemperature` is staged at the settled value so the display
 * does not start on a warm-up ramp. Deep clone, never spread.
 */
const galwayDegraded: GroundStationConfig = structuredClone(galwayGroundStation);
galwayDegraded.rfFrontEnds[0].lnb = {
  ...galwayDegraded.rfFrontEnds[0].lnb,
  lnaNoiseFigure: 1.8,
  noiseTemperature: 149,
};

export const natsEuScenario13Data: ScenarioData = {
  id: 'nats-eu-scenario13',
  url: 'nats-eu/scenarios/nats-eu-scenario13',
  imageUrl: 'nats/13/card.png',
  number: 13,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario12'],
  title: "The Numbers Don't Lie",
  subtitle: 'Pass-Performance Trending',
  duration: '40 min',
  missionType: 'Trend Analysis',
  description: `13:00 local. The week's pass log has two things wrong with it.<br><br>Every MERIDIAN-SAR-1 pass at Galway since Thursday has decoded two to four decibels under budget, and Shetland's have not moved. And the planners have handed you an 89 degree SAR-2 pass at 13:12, the best geometry all month, that Anneke expects to fall over at the top.<br><br>Fly the steep pass and explain what it does. Measure SAR-1 at the survey geometry against the survey budget, rule out the easy causes, and find the real one. Then prove Shetland is clean, move Erik's 13:52 collect there, and fly it from the Shetland console so the report carries a measurement from both sites.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'Link Analysis Console',
    'Contact Plan Console',
    'Ku-Band RF Front End (GPSDO / LNB / BUC / HPA)',
    'RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayDegraded, shetlandGroundStation],
    satellites: [meridianSar1S13, meridianSar2S13, meridianSar3S13],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-29',
    scenarioStartWallTime: '13:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-13?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // Twelve minutes of empty sky between the SAR-1 survey pass (LOS 13:39) and
    // the Shetland collect (AOS 13:52). The skip stops 2 min before the next
    // pass at either site and is blocked while a timed objective runs.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 2,
    },

    workingDocument: {
      title: 'Weekly Pass-Performance Report',
      description: 'Week 13, 2027. One line per anomaly with its cause, and the recommendation to Rotterdam and to maintenance.',
    },

    // M1 - the survey budget (S2 numbers). expectedCNRDb is what a CORRECT
    // worksheet yields from the published survey values; the point of this
    // scenario is that the live station will NOT deliver requiredMarginDb.
    linkBudget: {
      label: 'GW-01 SAR-1 downlink at max elevation (survey values)',
      expectedCNRDb: 11.0,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 3,
    },

    // M3 - the board. Only the priority-1 collect has to be covered for the
    // plan to validate; the passes already flown are on the board for the
    // record. Windows are 0 deg horizon crossings, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 1,
      contacts: [
        { id: 'T-SAR2-GW', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Galway, 89 deg zenith pass)', priority: 2, windowStartS: 720, windowEndS: 1320, stationId: 'GW-01' },
        { id: 'T-SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, 27 deg, F. MacLeod)', priority: 3, windowStartS: 820, windowEndS: 1390, stationId: 'SH-02' },
        { id: 'T-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 24 deg, F. MacLeod)', priority: 2, windowStartS: 1680, windowEndS: 2240, stationId: 'SH-02' },
        {
          id: 'T-SAR1-GW',
          satelliteNoradId: 61701,
          label: 'MERIDIAN-SAR-1 (Galway, 28 deg survey geometry)',
          priority: 2,
          windowStartS: 1800,
          windowEndS: 2370,
          stationId: 'GW-01',
        },
        { id: 'T-SAR3-GW', satelliteNoradId: 61703, label: 'MERIDIAN-SAR-3 (Galway, 10 deg graze)', priority: 3, windowStartS: 3110, windowEndS: 3580, stationId: 'GW-01' },
        {
          id: 'T-SAR3-SH',
          satelliteNoradId: 61703,
          label: 'MERIDIAN-SAR-3 (Shetland, 32 deg) - NMW priority collect',
          priority: 1,
          windowStartS: 3120,
          windowEndS: 3700,
          stationId: 'SH-02',
        },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'T0349'],
      title: "Read the Week's Log",
      description: 'Open the brief: the pass log for the week, the survey budget, and the two numbers that do not agree with it.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Week Log Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Two Anomalies Read',
          params: {
            character: Character.SYSTEM,
            question:
              'Two anomalies on the log: a link that collapsed at the top of an 89 degree pass, and four days of SAR-1 decodes 2-4 dB under budget at Galway only. Which one is a fault?',
            options: [
              'You do not know yet. A one-off on the steepest pass of the month and a drift across four days on one site are different kinds of number, and each needs its own test before it gets a cause',
              'Both: two anomalies on one site is a station problem',
              'The keyhole pass: the link failed, so something broke',
              'Neither: two to four dB is inside normal pass-to-pass variation',
            ],
            correctIndex: 0,
            explanation:
              'Trend data separates a one-off from a drift. The steep pass is tested by flying one and watching where it fails; the drift is tested by measuring the survey geometry against the survey budget. Twelve minutes to the first pass. Shift clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS FOR THE ZENITH PASS
    // ============================================================
    {
      id: 'galway-pre-pass-sweep',
      nice: ['T0431', 'K0740'],
      title: 'GW-01 Pre-Pass Sweep',
      description:
        'Board, reference and downconversion before the 13:12 pass: nothing on the board but the RX AGC rail, GPSDO locked, LNB on the 13100 MHz LO. Note what the LNB panel says while you are there.',
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
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'GW-01 LNB LO 13100 MHz',
          params: { loFrequency: 13100 as MHz, loFrequencyTolerance: 0, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'tune-for-the-zenith-pass',
      nice: ['S0421', 'K1032', 'K0739'],
      title: 'Tune for the Zenith Pass',
      description:
        'Modem 1 from 1414 MHz to the 1370 MHz SAR-2 imagery carrier; analyzer centred on 1370 MHz with a 2 MHz span. Then read the pass geometry and say what the pedestal will do at 89 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-pre-pass-sweep'],
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
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Keyhole Predicted',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-2 rises at 13:12 from azimuth 163 and sets at 345, passing 89.5 degrees at 13:17. What does the pedestal have to do at the top, and can it?',
            options: [
              'Swing almost 180 degrees of azimuth in the few seconds the bird takes to cross the zenith; at 20 deg/s it cannot, so the 0.45 degree beam will fall off the spacecraft near culmination',
              'Nothing unusual: elevation goes up and comes down, azimuth barely moves',
              'Switch to step-track, which does not need azimuth',
              'Reverse the elevation axis over the top, which the ACU does automatically',
            ],
            correctIndex: 0,
            explanation:
              'An elevation-over-azimuth pedestal has a keyhole at the zenith: the azimuth rate it needs goes to infinity through the top. 73 degrees was a few degrees a second and it held. 89 degrees is not.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-sar2',
      nice: ['S0421', 'K0739'],
      title: 'Pre-position for SAR-2',
      description: 'Park the tracker on the AOS azimuth, 163 degrees at 5 degrees elevation, so the slew is done before the bird rises.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-for-the-zenith-pass'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Az 163 / El 5',
          params: { azimuth: 163, elevation: 5, tolerance: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE ZENITH PASS
    // ============================================================
    {
      id: 'fly-the-zenith-pass',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Fly the Zenith Pass',
      description: 'AOS 13:12. Program-track MERIDIAN-SAR-2, lock the 1370 MHz carrier on the ascending leg and read C/N above 8 dB on RX analysis. Keep watching as it climbs.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-sar2'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB (ascending)',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'ride-through-the-keyhole',
      nice: ['S0892', 'K0739', 'K0740'],
      title: 'Ride Through the Keyhole',
      description:
        'Stay on RX analysis through culmination at 13:17. The pedestal loses the bird for several seconds at the top and the receiver drops lock with it; do not chase it. Hold lock for 100 s once it comes back on the descending leg, and name what did it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['fly-the-zenith-pass'],
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Watched Through the Top',
          params: { tab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Lock Held 100 s (descending leg)',
          params: { modemNumber: 1 },
          mustMaintain: true,
          maintainDuration: 100,
        },
        {
          type: 'status-check',
          description: 'Crater Explained',
          params: {
            character: Character.SYSTEM,
            question: 'Best geometry of the month, 391 km at the top, and the lock dropped exactly there. What killed the link?',
            options: [
              'The azimuth keyhole: the pedestal cannot slew azimuth fast enough through the zenith, the beam falls off the bird, and the link is gone until the pedestal catches up on the descending leg. Physics, not a fault',
              'The LNB: it is the same fault as the SAR-1 shortfall',
              'Doppler: the rate of change through the zenith exceeded the demodulator loop bandwidth',
              'The spacecraft: it turned its antenna away at nadir',
            ],
            correctIndex: 0,
            explanation:
              'Program-track never lost the elements; the pedestal lost the race. Every el-over-az tracker has this hole; the only mitigations are accepting the outage, an X/Y pedestal, or a tilted axis. Wait for it on the way down.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'record-anomaly-1',
      nice: ['S0892', 'K1032', 'T0349'],
      title: 'Record the First Anomaly',
      description: 'Write the zenith pass into the report as what it is: an operations note, not a fault.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['ride-through-the-keyhole'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Anomaly 1 Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the report for the 89 degree pass, and to whom?',
            options: [
              'An operations note to the planners: zenith keyhole, pedestal rate limit, not a fault; passes above about 80 degrees carry a culmination outage and the usable segment is on the two legs, not at the top',
              'A maintenance ticket for the pedestal azimuth drive',
              'A request to Rotterdam to lower the orbit so it stops going overhead',
              'Nothing: the link recovered, so there is nothing to report',
            ],
            correctIndex: 0,
            explanation:
              'A number that disagrees with expectation has a cause, and this cause has no fix on the rack. The planners can plan around it; maintenance cannot repair geometry.',
            pointPenalty: 5,
            documentSection: 'Anomaly 1',
            documentLine:
              '13:12Z MERIDIAN-SAR-2 GW-01, 89.5 deg: lock lost at culmination for several seconds, recovered descending leg. Cause: zenith keyhole (el-over-az pedestal azimuth rate limit). Not a fault. Ops note: passes above ~80 deg carry a culmination outage.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4 -> BEAT 1: RETUNE FOR THE SURVEY PASS
    // ============================================================
    {
      id: 'retune-for-the-survey-pass',
      nice: ['S0421', 'K0773'],
      title: 'Retune for the Survey Pass',
      description:
        'LOS 13:22. Modem 1 back to the 1414 MHz SAR-1 carrier, analyzer centred on the 1389 MHz SAR-1 beacon. The tracker stays where the zenith pass left it; program-track slews to the 13:30 rise at azimuth 5.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['record-anomaly-1'],
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
    {
      id: 'compute-the-survey-budget',
      nice: ['T0349', 'S0646', 'K0740'],
      title: 'Compute the Survey Budget',
      description:
        'The 13:30 pass is the acceptance geometry to the kilometre: 762 km at 28 degrees. Enter the survey worksheet in Link Analysis: EIRP 28 dBm, free-space path loss 171.4 dB at 11686 MHz, receive gain 51.8 dBi, system noise temperature 88 K, occupied bandwidth 36 MHz, miscellaneous losses 1 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-for-the-survey-pass'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'link-budget-computed',
          description: 'Survey Prediction Computed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Prediction vs History',
          params: {
            character: Character.SYSTEM,
            question: 'The survey worksheet says 11.0 dB at this geometry. The log says Galway has decoded near 7 at it for four days. Which number goes on the worksheet?',
            options: [
              'The survey number. The prediction is what a healthy station does at this geometry; the measurement is what this station does today. The gap between them is the finding, so neither may be bent toward the other',
              'The logged 7 dB: predictions should match what the station actually does',
              'The average of the two',
              'Whichever makes Commit Link pass',
            ],
            correctIndex: 0,
            explanation: 'A budget that is tuned to the symptom hides the symptom. 11.0 dB predicted; measure it in four minutes.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEATS 2-3: MEASURE SAR-1 AT THE SURVEY GEOMETRY
    // ============================================================
    {
      id: 'measure-sar1-at-galway',
      nice: ['T0349', 'S0646', 'K0740'],
      title: 'Measure SAR-1 at Galway',
      description:
        'AOS 13:30 from azimuth 5. Program-track MERIDIAN-SAR-1, confirm the beacon, lock the 1414 MHz carrier and read the C/N at maximum elevation (13:34:46, 28 degrees). Predicted 11 dB. Then say what Commit Link will do with it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['compute-the-survey-budget'],
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
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon on Boresight',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 4 dB',
          params: { modemNumber: 1, minCNRatio: 4, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shortfall Read',
          params: {
            character: Character.SYSTEM,
            question: 'Predicted 11.0 dB. Measured about 7 at the top of the pass, on a clean lock. What does the Link Analysis console do if you press Commit Link?',
            options: [
              'Refuses the commit: 7 dB is 1 dB over the 6 dB threshold and the survey asks for 3. Neither number is wrong. The station is not the station the survey measured',
              'Accepts it: the modem is locked and decoding, which is what a link is',
              'Accepts it after the worksheet is corrected to 7',
              'Refuses it because the prediction was entered wrong',
            ],
            correctIndex: 0,
            explanation:
              'A 4 dB shortfall at the exact survey geometry on a clean lock is a station finding, not a pass finding. Three candidate causes: element-set age, pointing, receive chain. Rule out the first two.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'rule-out-the-ephemeris',
      nice: ['S0892', 'T0531', 'K0739'],
      title: 'Rule Out the Ephemeris',
      description:
        'Open the Pass Schedule and read the ephemeris panel: element-set age, pending updates. The beacon sat on boresight and program-track never dropped. Say what is left.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['measure-sar1-at-galway'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Pass Schedule / Ephemeris Panel Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Two Causes Ruled Out',
          params: {
            character: Character.SYSTEM,
            question:
              'No ephemeris events pending, elements current; the beacon peaked on boresight and the pedestal stayed program-track locked through the pass. Which candidate is left?',
            options: [
              'The receive chain. Stale elements show as a pointing miss that program-track cannot hold, and a pointing fault shows as a beacon off boresight; both were clean, so the loss is between the feed and the demodulator',
              'The ephemeris: a 4 dB loss is exactly what 300 m of along-track error costs',
              'Pointing: 0.1 degree of boresight error on a 0.45 degree beam is 4 dB',
              'The spacecraft: its transmitter has aged',
            ],
            correctIndex: 0,
            explanation: 'Shetland decoded the same bird at budget on Thursday and Friday. A spacecraft does not degrade for one site. Read the LNB.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-galway-lnb',
      nice: ['S0892', 'T0531', 'K0064'],
      title: 'Read the Galway LNB',
      description: 'RX analysis, LNB panel: noise temperature against the 60 K survey value. Do the arithmetic and write the second anomaly into the report with its cause.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rule-out-the-ephemeris'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Anomaly 2 Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'GW-01 LNB noise temperature reads about 150 K against a 60 K survey value. What does that do to the link?',
            options: [
              'The LNA is the first stage, so its noise temperature is nearly the whole system temperature: 10 log(150 / 60) is 4.0 dB, which is the whole shortfall. The feed or the LNA has degraded',
              'Nothing measurable: noise temperature is a receiver spec, not a link term',
              'About 0.4 dB: 90 K is small next to the 290 K of the sky',
              'It doubles the C/N because the LNB is running hotter and therefore has more gain',
            ],
            correctIndex: 0,
            explanation:
              'C/N is carrier over k T B, and Friis puts the first stage in charge of T. Power-cycling the LNB starts the noise temperature at twice nominal and settles it back to 150 K: worse, then the same. This is a maintenance ticket.',
            pointPenalty: 5,
            documentSection: 'Anomaly 2',
            documentLine:
              '13:30Z MERIDIAN-SAR-1 GW-01, 28 deg / 762 km: predicted 11.0 dB (survey), measured ~7 dB. Shortfall 4.0 dB = LNB noise temperature 150 K vs 60 K survey (10 log(150/60)). Feed/LNA degradation. Ephemeris and pointing ruled out.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 5: SHETLAND, THE REALLOCATION, THE COLLECT
    // ============================================================
    {
      id: 'prove-shetland-is-clean',
      nice: ['T0431', 'K0689', 'S0675'],
      title: 'Prove Shetland Is Clean',
      description: "Select SH-02. Fiona's LNB noise temperature must be inside the 100 K spec and her reference locked before the priority collect moves there.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['read-the-galway-lnb'],
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
          type: 'lnb-noise-performance',
          description: 'SH-02 LNB Noise Temperature Within Spec',
          params: { maxNoiseTemperature: 100, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-locked',
          description: 'SH-02 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'reallocate-the-collect',
      nice: ['K0689', 'T0129', 'S0646'],
      title: 'Reallocate the Collect',
      description: "Erik's 13:52 SAR-3 collect is on the board for both sites. Put it on SH-02 and validate the plan.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['prove-shetland-is-clean'],
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
          description: 'SAR-3 Collect on SH-02',
          params: { contactId: 'T-SAR3-SH', groundStationId: 'SH-02' },
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
          description: 'Standing Rule Set',
          params: {
            character: Character.SYSTEM,
            question: 'The collect goes to Shetland. What is the standing rule for Galway until the LNB is replaced?',
            options: [
              'Derate GW-01 by 4 dB in every budget and put priority collects on SH-02: a 3 dB margin at Galway is now a miss, and a plan that does not know that will book collects the station cannot deliver',
              'Take Galway off the board entirely until maintenance signs it off',
              'Nothing: 7 dB still decodes, so Galway keeps its collects',
              'Raise the customer delivery standard to 11 dB so the shortfall is visible',
            ],
            correctIndex: 0,
            explanation: 'A derated site is still a site. It flies routine passes at 7 dB; it does not carry a priority collect on a 3 dB margin it no longer has.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'arm-shetland-for-sar3',
      nice: ['S0421', 'K0773', 'K1032'],
      title: 'Arm Shetland for SAR-3',
      description:
        'SAR-3 is on its own plan: video at 1340 MHz IF, beacon at 1315 MHz. Modem 1 to 1340 MHz, analyzer centred on 1315 MHz with a 2 MHz span, tracker parked on the 13:52 AOS azimuth: 139 degrees at 5 degrees elevation.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['reallocate-the-collect'],
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
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1340 MHz',
          params: { modemNumber: 1, frequency: 1340e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'SH-02 Analyzer Centre 1315 MHz',
          params: { centerFrequency: 1315e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'SH-02 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'SH-02 Az 139 / El 5',
          params: { azimuth: 139, elevation: 5, tolerance: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'fly-the-collect-from-shetland',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Fly the Collect from Shetland',
      description:
        'AOS 13:52 from azimuth 139. Program-track MERIDIAN-SAR-3 on the SH-02 pedestal, lock the 1340 MHz carrier and hold C/N above 8 dB through culmination (13:56:46, 32 degrees, 694 km). Read the number against the geometry.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['arm-shetland-for-sar3'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-3',
          params: { noradId: 61703 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-3',
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
          description: 'Shetland Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'Shetland peaks near 11.5 dB at 32 degrees and 694 km with a 60 K LNB. Galway gave 7 at 28 degrees and 762 km. Is Shetland the better station?',
            options: [
              'No: 20 log(762 / 694) is 0.8 dB of geometry, and the rest of the gap is the Galway LNB. Shetland is a healthy station at its geometry; Galway is a degraded one at its own',
              'Yes: 4.5 dB better on the same bird class is a better station',
              'Unknown: SAR-3 and SAR-1 are different spacecraft',
              'No: Shetland is reading high because its LNB is cold',
            ],
            correctIndex: 0,
            explanation:
              'A site is only underperforming when its number is worse than its geometry. Two measurements, two sites, one bird class: that is a trend report, not an opinion.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 4: THE REPORT
    // ============================================================
    {
      id: 'file-the-trend-report',
      nice: ['S0892', 'T1606', 'S0646'],
      title: 'File the Trend Report',
      description: 'Close the report: one recommendation to Rotterdam, one maintenance action, and the standing rule for the planners.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['fly-the-collect-from-shetland'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Recommendation Filed',
          params: {
            character: Character.SYSTEM,
            question: 'What goes to Rotterdam, and what goes to maintenance?',
            options: [
              'Rotterdam: the keyhole is an operations note (plan passes above 80 degrees with a culmination outage) and GW-01 is derated 4 dB with priority collects on SH-02 until repaired. Maintenance: LNB replacement ticket for GW-01, with the 150 K measurement attached',
              'Rotterdam: two faults at Galway, site unavailable. Maintenance: pedestal and LNB',
              'Rotterdam: nothing until maintenance confirms the LNB. Maintenance: the ticket',
              'Rotterdam: the survey budget is wrong and needs re-issuing at 7 dB',
            ],
            correctIndex: 0,
            explanation: 'Two anomalies, two audiences, two kinds of action. The report is what turns a bad pass next week into a comparison instead of an argument.',
            pointPenalty: 5,
            documentSection: 'Recommendation',
            documentLine:
              'Recommendation: (1) Ops note - passes above ~80 deg carry a culmination outage, not a fault. (2) GW-01 derated 4 dB until LNB replaced; priority collects to SH-02 (13:52Z SAR-3 collect flown from SH-02, peak C/N ~11.5 dB at 32 deg). (3) Maintenance ticket: GW-01 LNB, noise temperature 150 K vs 60 K survey.',
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
        <em>[Text message from Anneke Visser at 12:48]</em>
      </p>
      <p>
        "Your week's log makes no sense and I would like it to. Galway SAR-1 is two to four dB under budget since Thursday; Shetland on the same bird is not. And the planners have given you the 89 degree SAR-2 at 13:12, which I expect to fall over at the top, and I want to know why before they book another one. Two numbers, two causes. Report by 14:00 please."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.CONCERNED,
      audioUrl: '',
    },
    objectives: {
      'record-anomaly-1': {
        text: `
        <p>
          So the best pass is the worst pass. Noted for the planners: anything over eighty is a culmination outage, not a ticket. Now the one that worries me - the SAR-1 number.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'read-the-galway-lnb': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 13:41]</em>
        </p>
        <p>
          "Mine's reading 60 K and change, same as the day it was fitted. Yours is cooking. Don't power-cycle it, that just starts the number higher. Send Erik's collect up here - I'll be on the pedestal with a torch from ten to, so the console's yours."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'reallocate-the-collect': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 13:45]</em>
        </p>
        <p>
          "Seen it on the board. SAR-3 is on its own numbers, mind: 1340 for the video, 1315 for the beacon. Thirty-two degrees from the south-east. It's a good one."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'fly-the-collect-from-shetland': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 13:59]</em>
        </p>
        <p>
          "Watched the dish from the pedestal. Never wobbled, and I'd guess eleven and a bit at the top from the way the alarm panel stayed dark. That's your comparison. Same bird class, two sites, one of them cooking."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'file-the-trend-report': {
        text: `
        <p>
          Two anomalies, two causes, nothing alike in the data. The keyhole goes to the planners and the LNB goes to maintenance with your number on it. That is the report I wanted. Thank you, Galway.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
