import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * pointing before reading the LNB (250 K against a 60 K survey value). Act 3
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
 * the receiver's carrier are lost for about twenty seconds through the top (the
 * azimuth swing of ~180 deg at 10 deg/s) and come back on the descending leg.
 * The crater objective therefore holds receiver lock for 100 s: activated on
 * the rising leg it cannot finish before the top, the dropout resets it, and
 * it completes on the descending leg. (A `maxCNRatio` reading is not used: the
 * 1 s satellite position throttle puts one low-C/N frame in every second of a
 * LEO pass, so an unheld "below X dB" condition latches anywhere, and the
 * keyhole is a carrier loss, which `cnHoldSeconds` cannot read either.)
 *
 * Staged state (scenario-local clone): GW-01's LNB has a degraded LNA (noise
 * figure 2.7 dB, noise temperature ~250 K settled) - the station is wrong, the
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
 * 0.8 to 2.7 dB, so the Friis noise temperature settles near 250 K instead
 * of 60 K. The LNA's noise adds to the antenna's (sky, spillover and feed,
 * about 65 K at 28 deg), so the system temperature goes from 125 K to 315 K:
 * 10 log(315 / 125) = 4.0 dB of C/N at the survey geometry (phase 19.2; it
 * was 150 K and 10 log(150 / 60) while the engine's Tsys was the LNB alone).
 * `noiseTemperature` is staged at the settled value so the display does not
 * start on a warm-up ramp. Deep clone, never spread.
 */
const galwayDegraded: GroundStationConfig = structuredClone(galwayGroundStation);
galwayDegraded.rfFrontEnds[0].lnb = {
  ...galwayDegraded.rfFrontEnds[0].lnb,
  lnaNoiseFigure: 2.7,
  noiseTemperature: 250,
};

export const natsEuScenario13Data: ScenarioData = {
  id: 'nats-eu-scenario13',
  url: 'nats-eu/scenarios/nats-eu-scenario13',
  imageUrl: 'nats-eu/13/card.png',
  number: 13,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario12'],
  title: "The Numbers Don't Lie",
  subtitle: 'Pass-Performance Trending',
  duration: '40 min',
  missionType: 'Trend Analysis',
  description: `The shift opens at 13:00, and the week's pass log has two things wrong with it.<br><br>Every MERIDIAN-SAR-1 pass at Galway since Thursday has decoded two to four decibels under budget, while Shetland's passes haven't changed. The planners have also given you an 89 degree SAR-2 pass at 13:12, the best geometry all month, and Anneke expects it to fall over at the top.<br><br>Fly the steep pass and explain what it does. Then measure SAR-1 at the survey geometry, the same range and elevation the station was accepted at, and compare it with the survey budget. Rule out the easy causes and find the real one. After that, prove Shetland is clean, move Erik's 13:52 collect there, and fly it from the Shetland console so the report carries a measurement from both sites.`,
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

    // M4 - no burn is pending. The event sits far past the end of the shift so
    // the Pass Schedule ephemeris panel exists and reads NOMINAL with the element
    // set epoch (the Rule Out the Ephemeris step reads it); it never fires.
    spaceEvents: [
      {
        id: 'SAR2-ROUTINE',
        satelliteNoradId: 61702,
        maneuverAtS: 24 * 3600,
        label: 'MERIDIAN-SAR-2 element set: no update pending',
        newTle: { tle1: SAR2_S13_TLE.tle1 as string, tle2: SAR2_S13_TLE.tle2 as string },
      },
    ],

    workingDocument: {
      title: 'Weekly Pass-Performance Report',
      description: 'Week 13, 2027. One line per anomaly with its cause, and the recommendation to Rotterdam and to maintenance.',
    },

    // M1 - the survey budget (S2 numbers). expectedCNRDb is what a CORRECT
    // worksheet yields from the published survey values; the point of this
    // scenario is that the live station will NOT deliver requiredMarginDb.
    linkBudget: {
      label: 'GW-01 SAR-1 downlink at max elevation (survey values)',
      expectedCNRDb: 11.4,
      toleranceDb: 1.0,
      thresholdCNRDb: 4.2,
      requiredMarginDb: 5,
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
      description: "Open the brief and read the week's pass log, the survey budget and the two numbers that don't agree with it.",
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
              'The log has two anomalies: a link that collapsed at the top of an 89 degree pass, and four days of SAR-1 decodes 2-4 dB under budget at Galway only. Going by the log alone, which one is a fault?',
            options: [
              'You do not know yet: a one-off on the steepest pass of the month and a four-day drift at one site each need their own test',
              'Both are faults: two anomalies at one site in one week is a station problem, so one ticket covers the pedestal and the LNB',
              'Only the keyhole pass: the link failed at the top, so something broke, while a 2-4 dB drift is just a soft number',
              'Neither is a fault: 2-4 dB is normal pass-to-pass variation, and one lock drop on a steep pass is just noise',
            ],
            correctIndex: 0,
            explanation:
              'Trend data separates a one-off from a drift, and each one needs its own test before it gets a cause. You test the steep pass by flying one and watching where the link fails. You test the drift by measuring the survey geometry against the survey budget. The first pass, SAR-2, rises twelve minutes after the shift starts, so the shift clock starts now.',
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
        "Sweep the board before the 13:12 pass. Expect the RX AGC no-carrier warning (the sky is empty) and two LNB alarms: noise temperature high (250 K) and noise figure degraded (2.70 dB). Confirm the GPSDO is locked and the LNB is on the 13100 MHz LO, and note what the LNB panel says while you're there.",
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
        "Retune modem 1 from 1414 MHz to the 1370 MHz SAR-2 imagery carrier, and centre the analyzer on 1370 MHz with a 2 MHz span. Then read the pass geometry and say what the pedestal, the antenna's mount, will do at 89 degrees.",
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
            question: 'SAR-2 rises at 13:12 from azimuth 163, passes 89.5 degrees at 13:17 and sets at azimuth 345. What does the pedestal have to do at the top, and can it?',
            options: [
              'Swing almost 180 degrees of azimuth in the seconds the satellite takes to cross the zenith; at 10 deg/s it cannot',
              'Nothing unusual: elevation rises to 89.5 and falls again, and azimuth barely moves, so the pedestal holds the beam',
              'Switch to step-track through the top: step-track does not need azimuth, so the pedestal holds the beam',
              'Reverse the elevation axis over the top: the antenna controller does it automatically, so the pedestal holds the beam',
            ],
            correctIndex: 0,
            explanation:
              'An elevation-over-azimuth pedestal has a keyhole at the zenith, because the azimuth rate it needs climbs without limit as the satellite crosses the top. The 0.45 degree beam then falls off the spacecraft near culmination. The earlier 73 degree pass needed only a few degrees a second and the pedestal held it, but an 89 degree pass is a different case.',
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
      description: 'Point the tracker at the AOS azimuth, 163 degrees at 5 degrees elevation, so the slew is finished before the satellite rises.',
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
      description:
        'SAR-2 rises at 13:12. Turn on program-track for MERIDIAN-SAR-2, lock the 1370 MHz carrier on the rising leg and read a C/N above 8 dB on RX Analysis. Keep watching as it climbs.',
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
        "Stay on RX Analysis through culmination, the top of the pass, at 13:17. The pedestal loses the satellite for about twenty seconds there and the receiver drops lock with it. The Carrier lock lost alarm stays up until the next lock, so don't chase it. Once the lock comes back on the descending leg, hold it for 100 s, and name what caused the dropout.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['fly-the-zenith-pass'],
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-2 Past Culmination',
          params: { noradId: 61702, phase: 'past-culmination' },
          mustMaintain: false,
        },
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
            question: 'This was the best geometry of the month, 391 km at the top, and the lock dropped exactly there. What caused the link to fail?',
            options: [
              "The azimuth keyhole: the pedestal can't slew fast enough through the zenith, so the beam falls off the satellite",
              'The LNB: it is the same fault as the SAR-1 shortfall, and at 391 km the hot front end finally ran out of margin',
              'Doppler: the rate of change through the zenith exceeded the demodulator loop bandwidth, so the modem lost carrier',
              'The spacecraft: it turned its antenna away at nadir, so the beam came back only after it had rolled off the top',
            ],
            correctIndex: 0,
            explanation:
              'Program-track never lost the orbit data. The pedestal lost the race with the satellite, so the link stays down until the pedestal catches up on the descending leg. That makes it physics and not a fault, because every elevation-over-azimuth tracker has this hole. The only ways around it are to accept the outage, use an X/Y pedestal or use a tilted axis, so wait for the link on the way down.',
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
      description: 'Write the zenith pass into the report as what it is, an operations note and not a fault.',
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
            question: 'What goes in the report for the 89 degree pass, and who gets it?',
            options: [
              'An operations note to the planners: a zenith keyhole, so passes above about 80 degrees carry an outage',
              'A maintenance ticket for the pedestal: azimuth drive rate limit and lock lost at culmination, so the drive needs a look',
              'A request to Rotterdam: orbit too steep over Galway and lock lost at the top, so lower it to stop it going overhead',
              'Nothing to anyone: the link recovered on the descending leg and no data was lost, so there is nothing to report',
            ],
            correctIndex: 0,
            explanation:
              'This goes to the planners as an operations note because the cause is geometry, and nothing on the rack can fix geometry. The usable parts of the pass are the two legs, so the planners can plan around the outage at the top. A maintenance ticket would send someone to repair a drive that works, and a silent pass would leave the next planner to book the same geometry again.',
            pointPenalty: 5,
            documentSection: 'Anomaly 1',
            documentLine:
              '13:12Z MERIDIAN-SAR-2 GW-01, 89.5 deg: lock lost at culmination for about twenty seconds, recovered descending leg. Cause: zenith keyhole (el-over-az pedestal azimuth rate limit). Not a fault. Ops note: passes above ~80 deg carry a culmination outage.',
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
        'SAR-2 sets at 13:22. Retune modem 1 back to the 1414 MHz SAR-1 carrier and centre the analyzer on the 1389 MHz SAR-1 beacon. Leave the tracker where the zenith pass left it, because program-track will slew to the 13:30 rise at azimuth 5.',
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
        "The 13:30 pass matches the survey's acceptance geometry exactly: 762 km at 28 degrees. In Link Analysis, enter the survey worksheet values: EIRP 31.3 dBm, free-space path loss 171.4 dB at 11686 MHz, receive gain 50.4 dBi, system noise temperature 125 K, occupied bandwidth 36 MHz and miscellaneous losses 1 dB.",
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
            question:
              'The survey worksheet predicts 11.4 dB at this geometry, but the log says Galway has decoded near 7 dB at it for four days. Which number goes on the worksheet?',
            options: [
              'The survey number: the prediction is what a healthy station does here, and the gap is the finding',
              'The logged 7 dB: a prediction should match what the station actually does, so the worksheet should record it',
              'The average of the two: 9 dB splits the difference between the survey and the log, so the gap is halved',
              'Whichever makes Commit Link pass: the console needs 5 dB of margin, so the worksheet should give it one',
            ],
            correctIndex: 0,
            explanation:
              "The worksheet predicts what a healthy station should do, and the measurement shows what this station does today, so neither number may be bent toward the other. A budget tuned to match the symptom would hide the symptom. You'll measure the real value when the pass reaches its top.",
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
        'SAR-1 rises at 13:30 from azimuth 5. Turn on program-track for MERIDIAN-SAR-1, confirm the beacon, lock the 1414 MHz carrier and read the C/N at maximum elevation (13:34:46, 28 degrees). The survey predicts 11.4 dB. Then say what the Link Analysis Commit Link button will do with your reading.',
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
          type: 'satellite-pass-phase',
          description: 'SAR-1 Near the Top (Past Culmination)',
          params: { noradId: 61701, phase: 'past-culmination' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shortfall Read',
          params: {
            character: Character.SYSTEM,
            question:
              'The survey predicted 11.4 dB, and you measured about 7 dB at the top of the pass on a clean lock. What does the Link Analysis console do if you press Commit Link?',
            options: [
              'Refuses the commit: 7 dB is only 2.8 dB over the 4.2 dB threshold, short of the 5 dB margin',
              'Accepts the commit: the modem is locked and decoding at 7 dB, and a locked modem is a working link',
              'Accepts the commit once the worksheet is corrected to 7 dB, so the prediction and the measurement agree',
              'Refuses the commit: the prediction was entered wrong, since this station could never reach 11 dB',
            ],
            correctIndex: 0,
            explanation:
              'Neither number is wrong. The station is no longer the station the survey measured. A 4 dB shortfall at the exact survey geometry, on a clean lock, is a finding about the station and not about the pass. There are three candidate causes: the age of the orbit data (the element set), the pointing and the receive chain, so rule out the first two next.',
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
        'Open the Pass Schedule and read the ephemeris panel for the age of the element set and any pending updates. The beacon sat on boresight and program-track never dropped, so say which cause is left.',
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
              'The ephemeris panel shows no events pending and current elements. The beacon peaked on boresight and the pedestal stayed program-track locked through the pass. Which candidate is left?',
            options: [
              'The receive chain: stale elements or a pointing fault would show on the beacon and tracker, and both were clean',
              'The ephemeris: a 4 dB loss is exactly what 300 m of along-track error costs, and current elements can still be off',
              'Pointing: 0.1 degree of boresight error on a 0.45 degree beam is 4 dB, and program-track can hold a wrong offset',
              'The spacecraft: its transmitter has aged since the survey, and a 4 dB loss on the same satellite would look the same',
            ],
            correctIndex: 0,
            explanation:
              "Stale elements would show as a pointing miss that program-track can't hold, and a pointing fault would show as a beacon off boresight. Both were clean, so the loss is between the feed and the demodulator. Shetland decoded the same satellite at budget on Thursday and Friday, and a spacecraft doesn't degrade for one site. That leaves the LNB, so read its panel next.",
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
      description:
        'On RX Analysis, open the LNB panel and read the noise temperature against the 60 K survey value. Do the arithmetic, then write the second anomaly into the report with its cause.',
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
            question:
              'The GW-01 LNB noise temperature reads about 250 K against a 60 K survey value, and the antenna (sky, spillover and feed) adds about 65 K at 28 degrees. What does that do to the link?',
            options: [
              'The LNA is the first stage, so its noise adds onto the antenna temperature: 10 log((65 + 250) / (65 + 60)) is 4.0 dB',
              'Nothing measurable: noise temperature is a receiver spec and not a link term, so the 125 K on the worksheet covers it',
              'About 6 dB: the LNB alone sets the system temperature, so the loss is 10 log(250 / 60) and no antenna noise counts',
              'It raises the C/N: the LNB is running hotter and therefore has more gain, so the link gains about 4 dB',
            ],
            correctIndex: 0,
            explanation:
              'C/N is the carrier over k T B, where T is the antenna noise plus the receiver noise, and the first stage (here the LNA) sets the receiver part. That takes the system temperature from 125 K to 315 K, which is the whole 4 dB shortfall, so the feed or the LNA has degraded. Power-cycling the LNB would start the noise temperature at twice nominal and settle back to 250 K, which is worse and then the same. This needs a maintenance ticket.',
            pointPenalty: 5,
            documentSection: 'Anomaly 2',
            documentLine:
              '13:30Z MERIDIAN-SAR-1 GW-01, 28 deg / 762 km: predicted 11.4 dB (survey), measured ~7 dB. Shortfall 4.0 dB = LNB noise temperature 250 K vs 60 K survey on a 65 K antenna (10 log(315/125)). Feed/LNA degradation. Ephemeris and pointing ruled out.',
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
      description:
        "Select SH-02. Before the priority collect moves there, check that Fiona's LNB noise temperature is inside the 100 K spec and that her GPSDO reference is locked.",
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
      description: "Erik's 13:52 SAR-3 collect is on the board for both sites. Assign it to SH-02 and validate the plan.",
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
            question: "The collect is going to Shetland. What's the standing rule for Galway until its LNB is replaced?",
            options: [
              'Derate GW-01 by 4 dB in every budget and put priority collects on SH-02, because a 5 dB margin at Galway is now a miss',
              'Take GW-01 off the board until maintenance signs it off, because a station with a 4 dB shortfall flies nothing',
              'Change nothing at GW-01 and leave the collects where they are, because 7 dB still decodes and the plan is still good',
              'Raise the delivery standard to 11 dB in every budget and keep the collects, because the shortfall then shows on the plan',
            ],
            correctIndex: 0,
            explanation:
              "A plan that doesn't know about the derate will book collects the station can't deliver. A derated site is still a site, so Galway keeps flying routine passes at about 7 dB. It just doesn't carry a priority collect, because it no longer has the 5 dB margin those need.",
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
        'SAR-3 has its own frequency plan: video at 1340 MHz IF and the beacon at 1315 MHz. Set modem 1 to 1340 MHz, centre the analyzer on 1315 MHz with a 2 MHz span, and point the tracker at the 13:52 AOS azimuth, 139 degrees at 5 degrees elevation.',
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
        'SAR-3 rises at 13:52 from azimuth 139. Turn on program-track for MERIDIAN-SAR-3 on the SH-02 pedestal, lock the 1340 MHz carrier and hold a C/N above 8 dB through culmination (13:56:46, 32 degrees, 694 km). Then read the number against the geometry.',
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
          type: 'satellite-pass-phase',
          description: 'SAR-3 Past Culmination',
          params: { noradId: 61703, phase: 'past-culmination' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shetland Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'Shetland peaks near 12 dB at 32 degrees and 694 km with a 60 K LNB, while Galway gave 7 dB at 28 degrees and 762 km. Is Shetland the better station?',
            options: [
              'No: 20 log(762 / 694) is 0.8 dB of geometry, so the rest of the gap is the Galway LNB',
              'Yes: 5 dB better on the same class of satellite is a better station, whatever the geometry says',
              'Unknown: SAR-3 and SAR-1 are different spacecraft, so 762 km against 694 km is not the same pass',
              'No: Shetland is reading high because its 60 K LNB is cold, so the number will settle once it warms',
            ],
            correctIndex: 0,
            explanation:
              'Shetland is a healthy station at its geometry, and Galway is a degraded one at its own. The difference in range explains only 0.8 dB of the 5 dB gap, so the rest is the Galway LNB. A site is underperforming only when its number is worse than its geometry predicts. Two measurements from two sites on one class of satellite make a trend report and not an opinion.',
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
      description: 'Close the report with one recommendation to Rotterdam, one maintenance action and the standing rule for the planners.',
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
              'Rotterdam: the keyhole is an operations note, and GW-01 is derated 4 dB until repaired. Maintenance: an LNB ticket for GW-01',
              'Rotterdam: two faults at Galway, so the site is unavailable until both clear. Maintenance: pedestal drive and LNB tickets',
              'Rotterdam: nothing until maintenance confirms the LNB reading. Maintenance: the LNB ticket, with the 250 K measurement',
              'Rotterdam: the survey budget is wrong and needs re-issuing at 7 dB. Maintenance: nothing, because the station is within its number',
            ],
            correctIndex: 0,
            explanation:
              'There are two anomalies, two audiences and two kinds of action. Rotterdam gets the operations note, so the planners can allow for a culmination outage on passes above 80 degrees, and the derate, so priority collects go to SH-02 until the LNB is replaced. Maintenance gets the LNB ticket with the 250 K measurement attached. That report turns a bad pass next week into a comparison instead of an argument.',
            pointPenalty: 5,
            documentSection: 'Recommendation',
            documentLine:
              'Recommendation: (1) Ops note - passes above ~80 deg carry a culmination outage, not a fault. (2) GW-01 derated 4 dB until LNB replaced; priority collects to SH-02 (13:52Z SAR-3 collect flown from SH-02, peak C/N ~12 dB at 32 deg). (3) Maintenance ticket: GW-01 LNB, noise temperature 250 K vs 60 K survey.',
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
        "Your week's log doesn't make sense, and I'd like it to. Galway's SAR-1 passes have been two to four dB under budget since Thursday, but Shetland's on the same satellite haven't changed. The planners have also given you the 89 degree SAR-2 pass at 13:12, which I expect to fall over at the top, and I want to know why before they book another one. I think these are two numbers with two different causes. Please have the report to me by 14:00."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/intro.mp3'),
    },
    objectives: {
      'record-anomaly-1': {
        text: `
        <p>
          So the best pass of the month turned out to be the worst one. Good, that's recorded as an operations note for the planners and not a maintenance ticket, because any pass over eighty degrees will have an outage at the top. Retune for the SAR-1 survey pass next, because the SAR-1 number is the one that worries me.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/obj-record-anomaly-1.mp3'),
      },
      'read-the-galway-lnb': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "You've got your number, then. Mine's reading 60 K and change, the same as the day it was fitted, so the problem's on your side. Please don't power-cycle your LNB, because that only starts the number higher. Send Erik's collect up here. I'll be out at the pedestal with a torch before it starts, so the console's yours."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/obj-read-the-galway-lnb.mp3'),
      },
      'reallocate-the-collect': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "I've seen the collect on the board. SAR-3 runs on its own frequencies, mind: 1340 MHz for the video and 1315 MHz for the beacon. It rises in the south-east and peaks at thirty-two degrees, so it's a good one."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/obj-reallocate-the-collect.mp3'),
      },
      'fly-the-collect-from-shetland': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "I watched the dish from the pedestal and it tracked clean the whole way. From the way the alarm panel stayed dark, I'd guess about twelve at the top. That's your comparison: the same class of satellite from two sites, and only one of them has a hot LNB. Anneke's waiting on the report."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/obj-fly-the-collect-from-shetland.mp3'),
      },
      'file-the-trend-report': {
        text: `
        <p>
          Shetland has the collect, thank you. You found two anomalies with two causes, and nothing alike in the data. The keyhole goes to the planners and the LNB goes to maintenance with your number on it. That's the report I wanted. Thank you, Galway.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/13/obj-file-the-trend-report.mp3'),
      },
    },
  },
};
