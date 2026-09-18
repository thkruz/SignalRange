import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, createMeridianSar3, MERIDIAN_SAR3_BEACON_RF_HZ, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 12 - "LEOP: Commissioning" / SAR-3 Acceptance Tests (arc 2/2)
 *
 * Second half of the SAR-3 LEOP arc. Two days after first acquisition (S11)
 * the bus is healthy and Rotterdam has released the payload acceptance test
 * plan. Phase 16 rewrite: the acceptance test card IS the objective list.
 * Readiness (board, reference, prediction, crypto both ways, uplink tuned,
 * analyzer framed, tracker parked), the acquisition, the chain brought up in
 * invariant order inside the window, PLD-ON then PLD-TEST-PATTERN, the
 * uplink secured before the decode, the first imagery decoded and committed
 * against the prediction, the chain down, the card signed, the customer told
 * what acceptance transfers. No new mechanics; M1 (link budget), M2/M5
 * (commanding with Doppler comp and a valid key) and the Working Document
 * in the order the card says.
 *
 * Scenario clock starts 2027-03-24 09:48:00 UTC (moved 12 min earlier in
 * phase 16 so the readiness beats fit); the birds are built here with the
 * satellites.ts factories on element sets authored for the 10:00 epoch.
 *
 * Pass timeline (scripts/author-passes.mjs, verify-only, epoch 09:48:00Z):
 *
 *   MERIDIAN-SAR-3 #1: AOS T+18.02 (10:06:00Z, az 140), max el 27.9 deg at T+22.75
 *                      (10:10:45Z, 764 km slant range), LOS T+27.48 (10:15:29Z,
 *                      az 355), 9.5 min, northbound. The worked pass;
 *                      commanding window 10:06:22 .. 10:15:08.
 *   MERIDIAN-SAR-1 #1: AOS 10:50:01Z, max el 25.2 deg, LOS 10:59:30Z (present, not worked)
 *   MERIDIAN-SAR-2 #1: AOS 11:10:01Z, max el 24.7 deg, LOS 11:19:28Z (present, not worked)
 *
 * SAR-3 frequency plan (satellites.ts): beacon 11785 MHz -> IF 1315, video
 * 11760 MHz -> IF 1340 (LNB LO 13100 high-side), TT&C uplink 14065 MHz -> IF
 * 1465 (BUC LO 12600 low-side). GW-01 starts this shift with the ACU beacon
 * field still on SAR-3 from Monday, but the RX modem on SAR-1's 1414 MHz video
 * IF and the TX modem on SAR-1's 1405 MHz command IF from the morning's
 * tasking passes, the analyzer at its 1414 / 60 MHz default, the tracker
 * parked where the morning left it, and the BUC muted. Retuning both modems,
 * framing the analyzer and parking on the AOS azimuth are the readiness work.
 *
 * Link-budget numbers (worksheet per S2, at SAR-3's frequency and this pass's
 * geometry):
 * - slant range at max elevation 764 km -> FSPL 171.5 dB at 11760 MHz
 * - EIRP 28 dBm, GW-01 4m Ku gain 51.8 dBi, Tsys 88 K, BW 36 MHz, misc 1 dB
 * - correct worksheet -> C/N 10.89 dB (expectedCNRDb 10.9, tolerance 1.0)
 * - threshold 6 dB (QPSK 3/4 demod) + 2 dB required margin -> commit near
 *   max elevation, roughly 10:09 .. 10:12:30
 * Decode with the uplink SECURED. With the HPA up, SAR-3's TP-CMD returns
 * the station's own 14065 MHz carrier at 11810 MHz (co-pol, in the receive
 * band, about -38 dBm at the antenna); the AGC drops the total RX gain under
 * the internal-noise floor crossover and the video reads ~3 dB instead of ~11.
 * The decode objective therefore follows an HPA-disabled objective (found by
 * the S12 Playwright spec; S10 survives the same mechanism with ~2 dB
 * headroom). Live peak under real program-track, measured by the Phase 2
 * harness (test/campaigns/nats-eu-phase-c-validation.test.ts): 10.94 dB at
 * culmination, against the 10.9 dB worksheet.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1092: Execute test and evaluation events against an approved test plan
 *   - T1611: Record and document test results
 *   - S0842: Skill in conducting system acceptance testing
 *
 * Supporting Codes:
 *   - T0080: Test and evaluate system performance against requirements
 *   - S0015: Skill in conducting test events
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0153: Monitor system performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0874: Knowledge of cryptographic key management
 *   - T1506: Prepare and deliver technical reports to stakeholders
 *   - S0478: Skill in providing customer support
 *   - S0421: Skill in operating communications equipment
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0645: Knowledge of standard operating procedures
 */

/** MERIDIAN-SAR-3 (61703) element set at the S12 epoch: the worked pass. */
const SAR3_S12_TLE: MeridianTle = {
  tle1: '1 61703U 27031A   27083.41666667  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61703  97.6000 345.5000 0010000  90.0000 284.0000 15.60000000123459' as TleLine2,
};

/** MERIDIAN-SAR-1 (61701) element set at the S12 epoch. Present, not worked. */
const SAR1_S12_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27083.41666667  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61701  97.2000 157.2500 0010000  90.0000 183.7500 15.60000000123456' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) element set at the S12 epoch. Present, not worked. */
const SAR2_S12_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27083.41666667  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61702  98.4000 341.7500 0010000  90.0000  31.5000 15.60000000123455' as TleLine2,
};

const meridianSar1S12 = createMeridianSar1(SAR1_S12_TLE);
const meridianSar2S12 = createMeridianSar2(SAR2_S12_TLE);
const meridianSar3S12 = createMeridianSar3(SAR3_S12_TLE);

/**
 * GW-01 as the commissioning shift finds it. Deep clone, never a spread: the
 * nested antennasState / rfFrontEnds / transmitters / receivers objects are
 * handed to the equipment constructors and mutated at runtime.
 *
 * Carried over from Monday: the ACU beacon field on 11785 MHz. Everything
 * else is where the morning's SAR-1 tasking left it (modems on 1414 / 1405,
 * analyzer on 1414 / 60 MHz, tracker parked az 5), and the BUC is muted.
 */
const galwayCommissioning: GroundStationConfig = structuredClone(galwayGroundStation);
galwayCommissioning.antennasState![0] = {
  ...galwayCommissioning.antennasState![0],
  beaconFrequencyHz: MERIDIAN_SAR3_BEACON_RF_HZ as number as Hertz,
};
galwayCommissioning.rfFrontEnds[0].buc = { ...galwayCommissioning.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario12Data: ScenarioData = {
  id: 'nats-eu-scenario12',
  url: 'nats-eu/scenarios/nats-eu-scenario12',
  imageUrl: 'nats/12/card.png',
  number: 12,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario11'],
  title: 'LEOP: Commissioning',
  subtitle: 'SAR-3 Acceptance Tests (arc 2/2)',
  duration: '35 min',
  missionType: 'Commissioning',
  description: `09:48 local. Two days after first acquisition, MERIDIAN-SAR-3's bus is healthy and Anneke Visser has released the payload acceptance test plan: readiness, power the payload, command the test pattern, decode the first imagery, record the results on the card.<br><br>Erik Halvorsen at Nordic Maritime Watch is copied on the card, because Nordic Maritime Watch takes delivery of SAR-3 capacity the moment it is signed.<br><br>One pass, AOS 10:06, nine and a half minutes. Eighteen minutes to make the station ready for it and predict the number. Then do the card in order: chain up, power, pattern, secure, decode, chain down, sign.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO, 12600 MHz BUC LO) + HPA',
    'TT&C Commanding Console / Link Analysis Console',
    'QPSK 3/4 RX Modem with Video Decoder',
    'SAR-3 Payload Acceptance Test Card (Working Document)',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayCommissioning],
    satellites: [meridianSar1S12, meridianSar2S12, meridianSar3S12],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-24',
    scenarioStartWallTime: '09:48:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-12?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // A fast operator can skip the dead air between "ready" and AOS. The skip
    // is blocked while a timed objective runs and stops 2 min before the pass.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    // M1 - the acceptance prediction. expectedCNRDb is what a CORRECT worksheet
    // yields from the numbers published in the prediction objective;
    // requiredMarginDb is measured against the live receiver at Commit Link.
    // Measured under real program-track (nats-eu-phase-c-validation): peak
    // 10.94 dB at culmination, 240 s at or above 7 dB, 146 s at or above 9 dB.
    linkBudget: {
      label: 'SAR-3 acceptance: video downlink at max elevation',
      expectedCNRDb: 10.9,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 2,
    },

    // M2/M5 - payload command checkout. Window is the SAR-3 pass, AOS T+18.02
    // (1081 s) + 20 s .. LOS T+27.48 (1649 s) - 20 s. Doppler comp and a valid
    // key are both required for an ACK. PLD-ON and PLD-TEST-PATTERN are the
    // card; REC-PLAYBACK and PLD-SAFE are on the console because a real TT&C
    // console does not hide the commands the card does not call for.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61703,
      windowStartS: 1102,
      windowEndS: 1628,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'PLD-ON', label: 'Payload power on' },
        { id: 'PLD-TEST-PATTERN', label: 'Transmit payload test pattern' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },

    // The test card. Each documentLine status-check appends one line.
    workingDocument: {
      title: 'SAR-3 Payload Acceptance Test Card',
      description: 'MERIDIAN-SAR-3 (61703) payload acceptance, GW-01, 2027-03-24. Sections: Readiness, Command, Payload, Verdict.',
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'T0080'],
      title: 'Read the Test Plan',
      description: 'Open the shift brief and read the acceptance test plan: readiness, chain up, power, pattern, secure, decode, record. The order is the test.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Test Plan Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Test Order Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The test plan runs power, pattern, decode, record, in that order. Why does the order matter when the console will accept the commands in any order?',
            options: [
              'Each step is the evidence for the next: the pattern proves the payload took power, the decode proves the pattern is on the air.',
              'It is the order the commands are listed on the TT&C console: the card copies the console so the two records match.',
              'It does not matter as long as every step is finished before LOS: the card records results, not the sequence.',
              'The payload rejects PLD-TEST-PATTERN unless PLD-ON was the previous command: the order is enforced on the bird.',
            ],
            correctIndex: 0,
            explanation:
              'A command ACK proves the spacecraft received the command, not that the command did anything. The decode is what proves PLD-ON worked, the record captures what was measured, and the card is only as good as the order it was filled in. Out of order, an ACK or a line on the card proves nothing. Eighteen minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: READINESS
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Acceptance starts with the board read. Confirm the active alarm state on GW-01.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 90,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Alarm State Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'What is the active alarm state on GW-01 as the test card opens?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the card',
              'HPA over-temperature - hardware alarm left by the morning passes',
              'Command key expired - crypto alarm, nothing goes up until reloaded',
            ],
            correctIndex: 0,
            explanation:
              'The AGC rail is empty sky, not a fault, and it clears when the test carrier arrives. An acceptance number measured on a station with an open alarm is not an acceptance number; the card would carry the alarm as a qualifier.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'reference-check',
      nice: ['T0431', 'K0740'],
      title: 'Reference Check',
      description: 'GPSDO locked and out of holdover, BUC on the external reference. The uplink carrier and the Doppler compensation both key off it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'predict-acceptance',
      nice: ['T0080', 'S0015'],
      title: 'Predict the Acceptance C/N',
      description:
        'Fill the Link Analysis worksheet for MERIDIAN-SAR-3 at maximum elevation and press Compute. Survey numbers: satellite EIRP 28 dBm; slant range at max elevation 764 km (free-space path loss 171.5 dB at 11760 MHz); GW-01 receive gain 51.8 dBi; system noise temperature 88 K; occupied bandwidth 36 MHz; miscellaneous losses 1 dB. The card will quote this number back at you.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'link-budget-computed',
          description: 'Predicted C/N Matches Acceptance Truth',
          params: {},
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'crypto-both-ways',
      nice: ['K0874', 'T0431', 'S0842'],
      title: 'Crypto Both Ways',
      description:
        'The card wants both directions on record before anything is sent: TX encryption active with a Valid command key on the TX chain, RX decryption active with a Valid traffic key on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['predict-acceptance'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-crypto-status',
          description: 'TX Encryption Active',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-key-status',
          description: 'TX Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-crypto-status',
          description: 'RX Decryption Active',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Keys Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Command key Valid, traffic key Valid. Which half of the test needs which key?',
            options: [
              'Command key for PLD-ON and the pattern going up; traffic key for the pattern coming down - both must be Valid',
              'Command key only, for both halves; the test pattern comes down unencrypted - a new payload has no traffic key yet',
              'Traffic key only, for both halves; the TT&C console carries its own key - it is always Valid on the console',
              'Neither key, for either half; acceptance is done in crypto bypass - the numbers have to be clean',
            ],
            correctIndex: 0,
            explanation:
              'Two keys, two directions, and both have to be Valid before either half of the test means anything. A pattern that will not decrypt looks exactly like a payload that did not power on, and the card cannot tell them apart afterwards. Record both Valid before AOS so the decode can only mean one thing.',
            pointPenalty: 5,
            documentSection: 'Readiness',
            documentLine:
              'Readiness: GPSDO locked, BUC on reference. TX encryption ACTIVE / command key Valid; RX decryption ACTIVE / traffic key Valid. Predicted C/N 10.9 dB at 27.9 deg.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'tune-the-uplink',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Tune the Uplink',
      description:
        "TX modem 1 is on SAR-1's 1405 MHz command IF from the morning. Retune it for SAR-3's 14065 MHz TT&C uplink through the 12600 MHz BUC LO, and engage uplink Doppler compensation on the TT&C console before the window opens at 10:06:22.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['crypto-both-ways'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX 1465 MHz',
          params: { modemNumber: 1, frequency: 1465e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Uplink IF Arithmetic',
          params: {
            character: Character.SYSTEM,
            question: 'BUC LO 12600 MHz, low-side. SAR-3 TT&C uplink 14065 MHz. Where does the modem go?',
            options: ['1465 MHz (RF minus LO, low-side)', '1405 MHz (leave it, same modem IF)', '1315 MHz (LO minus RF, high-side)', '26665 MHz (LO plus RF, low-side)'],
            correctIndex: 0,
            explanation:
              'Low-side on the uplink: RF = IF + LO, so IF = 14065 - 12600 = 1465. 1405 is SAR-1 and 1315 is the beacon IF. The receive side is high-side (IF = LO - RF); the two sides of this rack do their arithmetic with opposite signs, and the same 60 MHz mistake is possible on both.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'analyzer-on-sar3',
      nice: ['S0421', 'K0773'],
      title: 'Analyzer on the SAR-3 Plan',
      description:
        'Frame the whole SAR-3 downlink plan on the analyzer: centre 1330 MHz at the 60 MHz span, so the 1315 MHz beacon and the 1322 to 1358 MHz test-pattern band are both on screen.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-the-uplink'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1330 MHz',
          params: { centerFrequency: 1330e6, centerFrequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Screen Read',
          params: {
            character: Character.SYSTEM,
            question: 'Centre 1330 MHz, span 60 MHz: 1300 to 1360 on screen. What is where, and what is just off the edge?',
            options: [
              'Beacon at 1315, test pattern 1322 to 1358; the 1290 transponded return of your own uplink off the left edge',
              'Beacon at 1315, test pattern 1322 to 1358; SAR-1 imagery at 1414 just off the right edge of the span',
              'Test pattern 1322 to 1358 only; the beacon at 1315 sits outside the video band and off the left edge',
              'Beacon at 1315, test pattern 1322 to 1358; the 1465 TT&C uplink mirrored by the high-side LO off the right edge',
            ],
            correctIndex: 0,
            explanation:
              'Know the neighbours. The CW beacon and the 36 MHz pattern are both on screen. That 1290 MHz return is the station hearing itself through the bird, and it is about to matter more than anything else on this screen.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS 10:06:00 from azimuth 140. Park the tracker on the rise azimuth at 5 degrees so the slew is done before she is over the horizon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['analyzer-on-sar3'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 140 / El 5',
          params: { azimuth: 140, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 2: ACQUIRE, CHAIN COLD
    // ============================================================
    {
      id: 'acquire-sar3',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-3',
      description: 'AOS 10:06. Program-track MERIDIAN-SAR-3 and confirm the 11785 MHz beacon (IF 1315 MHz) on RX analysis. Chain cold until the beacon is in.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-aos'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-3',
          params: { noradId: 61703 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-3 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-3-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 3: CHAIN UP IN ORDER, COMMAND, SECURE, DECODE
    // ============================================================
    {
      id: 'carrier-into-muted-buc',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Carrier Into the Muted BUC',
      description: 'Window open at 10:06:22. Chain up in order, first step: TX modem on air into the BUC while the BUC is still muted.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar3'],
      timeLimitSeconds: 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Still Muted',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'unmute-the-buc',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Unmute the BUC',
      description: 'Second step: unmute the BUC. The carrier now reaches the HPA input, which is still disabled.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['carrier-into-muted-buc'],
      timeLimitSeconds: 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Order Read',
          params: {
            character: Character.SYSTEM,
            question: 'Modem into a muted BUC, then unmute, then HPA. Why that order and not the reverse?',
            options: [
              'Every stage sees a signal before it sees gain: an HPA enabled with no drive amplifies the noise floor into the feed',
              'The BUC cannot unmute while the HPA is enabled: the interlock on the rack holds the mute until the HPA drops',
              'It is convention on a Ku rack: either order works, the card just wants the three steps logged as separate lines',
              'The command key is validated before the carrier radiates: the modem has to be on air for the key check to run',
            ],
            correctIndex: 0,
            explanation:
              'HPA_NOISE_AMPLIFICATION is the invariant this order protects; a BUC unmuted with the modem off does the same thing at lower level. On the way down it is the mirror image: HPA off first, then mute, then the carrier.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-the-hpa',
      nice: ['S0675', 'S0421', 'K0740'],
      title: 'Enable the HPA',
      description: 'Third step: HPA output enabled, and confirm it is linear. The uplink is on the air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['unmute-the-buc'],
      timeLimitSeconds: 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Linear',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'payload-power-on',
      nice: ['T1092', 'T1567'],
      title: 'Payload Power On',
      description: 'Send PLD-ON and confirm the acknowledgement inside the window (10:06:22 to 10:15:08).',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['enable-the-hpa'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-ON Acknowledged',
          params: { commandId: 'PLD-ON' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'payload-test-pattern',
      nice: ['T1092', 'T1567', 'S0842'],
      title: 'Payload Test Pattern',
      description:
        'PLD-ON is acknowledged. Send PLD-TEST-PATTERN, confirm its ACK, and record the command checkout on the card. The console does not enforce the order; the card does.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['payload-power-on'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-TEST-PATTERN Acknowledged',
          params: { commandId: 'PLD-TEST-PATTERN' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Command Checkout Recorded',
          params: {
            character: Character.SYSTEM,
            question:
              'Command checkout entry. PLD-ON and PLD-TEST-PATTERN were both acknowledged inside the window. What does the card record as the checkout result, and what does the ACK pair actually prove?',
            options: [
              'PLD-ON then PLD-TEST-PATTERN, both ACKed; the ACKs prove receipt in order, the decode proves they worked.',
              'Two ACKs, so the payload is verified; the decode that follows is a customer courtesy, not part of the checkout.',
              'Pattern ACK alone, so the checkout passed; PLD-ON is implied by the pattern and needs no line of its own.',
              'Two ACKs and the HPA linear, so the uplink is accepted; the payload is accepted when Rotterdam sees telemetry.',
            ],
            correctIndex: 0,
            explanation:
              'An acknowledgement is receipt, not effect. A pattern commanded to an unpowered payload ACKs just the same, which is why the checkout result is only complete once the decode is on the card.',
            pointPenalty: 5,
            documentSection: 'Command',
            documentLine:
              'Command checkout: chain up modem-BUC-HPA in order; PLD-ON then PLD-TEST-PATTERN, both ACKed inside the 10:06:22 .. 10:15:08 window with uplink Doppler comp and a valid key. ACK = receipt, not effect; effect proven by the decode.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'secure-for-decode',
      nice: ['S0675', 'K0773', 'T0153'],
      title: 'Secure the Uplink for the Decode',
      description:
        'Both ACKs are in. Disable the HPA before you touch the receiver: the amplifier has nothing left to do until the next command, and while it is up the decode cannot be trusted.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['payload-test-pattern'],
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled (uplink secured before the decode)',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Transponded Return Read',
          params: {
            character: Character.SYSTEM,
            question: 'With the HPA up, the 1340 MHz test pattern reads about 3 dB of C/N instead of the 11 the worksheet predicts. What is happening?',
            options: [
              "SAR-3's command transponder returns your own 14065 MHz carrier at 11810 MHz in band; the AGC pulls the chain down",
              'The HPA heats the LNB through the feed and raises the noise temperature; Tsys climbs past the 88 K on the worksheet',
              'Uplink Doppler compensation is dragging the receiver off frequency; the modem is locked on the skirt of the pattern',
              'The payload cannot transmit the pattern while it is receiving commands; the ACK traffic on 14065 MHz starves the video',
            ],
            correctIndex: 0,
            explanation:
              'The station is hearing itself through the bird: co-polar, inside the receive band, some 50 dB above the pattern, and the video goes down with the AGC. Nothing on the RX chain is broken; it is doing exactly what an AGC does with a strong in-band signal. Take the strong signal away and the number comes back.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'first-video',
      nice: ['T1092', 'T0153', 'S0842'],
      title: 'First Imagery Decode',
      description:
        'Retune modem 1 from 1414 MHz to 1340 MHz (11760 MHz RF), lock the test pattern, hold C/N above 8 dB, and press Commit Link near maximum elevation (10:10:45) with at least 2 dB of margin over the 6 dB threshold. Then put the number on the card beside the prediction.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['secure-for-decode'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1340 MHz',
          params: { modemNumber: 1, frequency: 1340e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on 1340 MHz Test Pattern',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 2 dB Over Threshold',
          params: { minMarginDb: 2 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Measured C/N Recorded',
          params: {
            character: Character.SYSTEM,
            question:
              'Payload entry. You predicted 10.9 dB at maximum elevation, the modem locked the pattern on 1340 MHz, and the link committed with at least 2 dB of margin. What goes on the card?',
            options: [
              'The measured C/N beside the 10.9 dB prediction and the difference; agreement within a decibel is the acceptance evidence.',
              'PASS beside the 6 dB threshold and the margin; clearing the threshold is the acceptance evidence, the number is not.',
              'The peak C/N only, without the prediction; the worksheet was a planning aid and has no place on a test record.',
              'The committed margin beside the 6 dB threshold; that is what the modem used, so it is the acceptance evidence.',
            ],
            correctIndex: 0,
            explanation:
              'The margin alone says the link worked today, not that the payload performs as designed. A measurement that matches the model is what lets Rotterdam and the customer predict every pass after this one. A measurement with no prediction beside it is a good day, not an acceptance.',
            pointPenalty: 5,
            documentSection: 'Payload',
            documentLine:
              'Payload: test pattern locked on IF 1340 MHz (11760 MHz RF) with the uplink secured. Predicted C/N 10.9 dB at max el (764 km, FSPL 171.5 dB at 11760 MHz); measured within 1 dB of prediction; committed with >= 2 dB margin over the 6 dB QPSK 3/4 threshold.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },

    // ============================================================
    // BEAT 4: CHAIN DOWN, SIGN, DELIVER
    // ============================================================
    {
      id: 'chain-down-after-los',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Chain Down After LOS',
      description: 'LOS 10:15:29. The HPA is already off; finish the mirror order: mute the BUC, then take the carrier off the air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-video'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'sign-the-card',
      nice: ['T1611', 'T1506', 'S0842'],
      title: 'Sign the Card',
      description: 'The verdict, with its residual risk. Whatever is in the Verdict section when Anneke countersigns is the contract.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-down-after-los'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verdict Recorded',
          params: {
            character: Character.SYSTEM,
            question:
              'Verdict entry. Command checkout complete, first imagery decoded at the predicted performance. What is the verdict, and what residual risk does the card carry?',
            options: [
              'ACCEPTED at the tested performance. Residual risk: one pass, 28 deg max elevation, one site; PLD-SAFE not exercised.',
              'ACCEPTED with no residual risk. The payload works: one pass, 28 deg max elevation, and the rest is routine operations.',
              'PROVISIONAL at the tested performance. Residual risk: Shetland has not repeated the test on its own pass.',
              'ACCEPTED at the tested performance. Residual risk: the decode was taken with the uplink secured rather than live.',
            ],
            correctIndex: 0,
            explanation:
              'Acceptance is a statement about what was tested, no more. Low-elevation passes and Shetland are unproven. Writing down what was not tested is what makes the card usable when the first low pass comes in under budget. Decoding with the uplink secured is the procedure, not a risk.',
            pointPenalty: 5,
            documentSection: 'Verdict',
            documentLine:
              'Verdict: SAR-3 payload ACCEPTED at tested performance (one pass, 27.9 deg max el, GW-01 only). Residual risk: low-elevation and SH-02 performance not measured; PLD-SAFE not exercised. Chain secured HPA-BUC-modem after LOS.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'deliver-to-customer',
      nice: ['S0478', 'T1506'],
      title: 'Deliver to the Customer',
      description: 'Erik is copied on the signed card and wants to task the bird. Confirm what acceptance transfers to Nordic Maritime Watch.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['sign-the-card'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Delivery Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'The card is signed and Erik is asking when he can task SAR-3. What does acceptance transfer to the customer?',
            options: [
              'SAR-3 enters the tasking pool at the tested performance; anything below that number is now a service ticket.',
              'Nothing yet; acceptance is an internal record, and the customer gets the bird after a further shakedown period.',
              'Unlimited tasking; acceptance means the payload is proven under every condition it will ever fly in.',
              'Tasking on Galway passes above 28 degrees only, until Shetland has run its own card on its own pass.',
            ],
            correctIndex: 0,
            explanation:
              'The tested performance is now the contract number. Erik can task from the next pass, and the first time a pass comes in under it, the card is what turns a complaint into a ticket with a number on it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Anneke Visser at 09:40]</em>
      </p>
      <p>
        "Test plan attached. Bus has been clean for two days, so today is the payload: readiness on the card, chain up in order, power it, command the test pattern, secure the uplink, decode it, record it. One pass, AOS 10:06, do it in the order on the card. Erik is copied and he will ask the moment it is signed."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'enable-the-hpa': {
        text: `
        <p>
          Carrier on my display at 14065, clean, linear. Window is open. PLD-ON when you are ready; wait for the ACK before the pattern.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'payload-test-pattern': {
        text: `
        <p>
          Both acknowledgements on my screen. Payload on, pattern transmitting. Secure your uplink and take the decode; the amplifier has done its job for today.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'first-video': {
        text: `
        <p>
          First frames from SAR-3. Log it - every number on that card is the one the customer contract quotes back at us.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'sign-the-card': {
        text: `
        <p>
          Copied on the card. Four sections and one of them says accepted. When can I task it?
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'deliver-to-customer': {
        text: `
        <p>
          Card signed, Erik has his answer, SAR-3 is in the pool. LEOP closed after two passes from Galway. Thank you - Rotterdam out.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
