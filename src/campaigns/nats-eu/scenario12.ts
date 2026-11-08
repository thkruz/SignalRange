import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * - EIRP 31.3 dBm, GW-01 4m Ku gain 50.4 dBi (at the LNA flange), Tsys 125 K, BW 36 MHz, misc 1 dB
 * - correct worksheet -> C/N 11.27 dB (expectedCNRDb 11.3, tolerance 1.0)
 * - threshold 4.2 dB C/N (QPSK 3/4 demod: Es/N0 5.0 dB) + 4 dB required
 *   margin -> commit at 8.2 dB near
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
  imageUrl: 'nats-eu/12/card.png',
  number: 12,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario11'],
  title: 'LEOP | Commissioning',
  subtitle: 'SAR-3 Acceptance Tests (arc 2/2)',
  duration: '35 min',
  missionType: 'Commissioning',
  description: `09:48 local. It's two days since SAR-3's first acquisition, MERIDIAN-SAR-3's bus is healthy, and Anneke Visser has released the payload acceptance test plan. You'll get the station ready, power up the payload, command the test pattern, decode the first imagery and record the results on the card.<br><br>Erik Halvorsen at Nordic Maritime Watch is copied on the card, because his company takes delivery of SAR-3 capacity the moment it's signed.<br><br>There's one pass, with AOS at 10:06 and nine and a half minutes of signal. You have eighteen minutes to get the station ready and predict the number. Then work through the card in order: chain up, power, pattern, secure, decode, chain down, sign.`,
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
      expectedCNRDb: 11.3,
      toleranceDb: 1.0,
      thresholdCNRDb: 4.2,
      requiredMarginDb: 4,
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
      description:
        'Open the shift brief and read the acceptance test plan, which runs readiness, chain up, power, pattern, secure, decode and record. The order of those steps is part of the test.',
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
            question: 'The test plan runs power, pattern, decode and record in that order. Why does the order matter when the console will accept the commands in any order?',
            options: [
              'Each step is evidence for the next: the pattern shows power, and the decode shows the pattern is on the air.',
              "It's the order the commands are listed on the TT&C console: the card copies the console so the two records match.",
              "It doesn't matter if every step is finished before LOS: the card records results, not the sequence.",
              'The payload rejects PLD-TEST-PATTERN unless PLD-ON came first: the spacecraft enforces the order itself.',
            ],
            correctIndex: 0,
            explanation:
              'An acknowledgement (ACK) proves the spacecraft received a command, not that the command did anything. The decode is what proves PLD-ON worked, and the card is only as good as the order it was filled in. Out of order, an ACK or a line on the card proves nothing. AOS is about eighteen minutes away.',
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
      description: 'Acceptance starts with a read of the board. Check the Dashboard and confirm the active alarm state on GW-01.',
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
              'RX AGC no-carrier warning only: empty sky, and no hardware alarm is active',
              'No active alarms: all systems are nominal and the board is clear for the card',
              'HPA over-temperature: a hardware alarm left over from the morning passes',
              'Command key expired: a crypto alarm, and nothing goes up until it is reloaded',
            ],
            correctIndex: 0,
            explanation:
              "The AGC (automatic gain control) no-carrier warning just means the sky is empty. It isn't a fault, and it clears when the test carrier arrives, so the no-alarms option is wrong even though the warning is harmless. An acceptance number measured with an open alarm isn't an acceptance number, because the card would have to carry the alarm as a qualifier.",
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
      description:
        'Check the GPS Timing and TX Chain tabs. The GPSDO must be locked and out of holdover, and the BUC must be on the external reference, because the uplink carrier and the Doppler compensation both depend on it.',
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
        'Fill in the Link Analysis worksheet for MERIDIAN-SAR-3 at maximum elevation and press Compute. Use these survey numbers: satellite EIRP 31.3 dBm, slant range at maximum elevation 764 km (free-space path loss 171.5 dB at 11760 MHz), GW-01 receive gain 50.4 dBi, system noise temperature 125 K, occupied bandwidth 36 MHz and miscellaneous losses 1 dB. The card will quote this number back to you.',
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
        'The card wants both directions on record before anything is sent. Check that TX encryption is active with a Valid command key on the TX Chain tab, and that RX decryption is active with a Valid traffic key on the RX Analysis tab.',
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
            question: 'Both keys read Valid. Which half of the test needs which key?',
            options: [
              'The command key for PLD-ON and the pattern going up, the traffic key for the pattern coming down: both Valid',
              'The command key for both halves: the test pattern comes down unencrypted, as a new payload has no traffic key yet',
              'The traffic key for both halves: the TT&C console carries its own key, and that one is always Valid',
              'Neither key for either half: acceptance is done in crypto bypass, so the numbers have to be clean',
            ],
            correctIndex: 0,
            explanation:
              "There are two keys for two directions, and both have to be Valid before either half of the test means anything. A pattern that won't decrypt looks exactly like a payload that didn't power on, and the card can't tell the two apart afterwards. So record both as Valid before AOS, and the decode can only mean one thing.",
            pointPenalty: 5,
            documentSection: 'Readiness',
            documentLine:
              'Readiness: GPSDO locked, BUC on reference. TX encryption ACTIVE / command key Valid; RX decryption ACTIVE / traffic key Valid. Predicted C/N 11.3 dB at 27.9 deg.',
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
        "TX modem 1 is still on SAR-1's 1405 MHz command IF from the morning. Retune it for SAR-3's 14065 MHz TT&C (tracking, telemetry and command) uplink through the 12600 MHz BUC LO, and turn on uplink Doppler compensation on the TT&C console before the window opens at 10:06:22.",
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
            question: "The BUC LO is 12600 MHz, low-side, and SAR-3's TT&C uplink is 14065 MHz. Where does the modem need to be tuned?",
            options: ['1465 MHz: RF minus LO, low-side', '1405 MHz: leave it, same modem IF', '1315 MHz: LO minus RF, high-side', '26665 MHz: LO plus RF, low-side'],
            correctIndex: 0,
            explanation:
              "The uplink is low-side, so RF = IF + LO and the modem goes to 14065 - 12600 = 1465 MHz. The 1405 MHz setting is SAR-1's command IF, and 1315 MHz is the beacon IF. The receive side is high-side (IF = LO - RF), so the two sides of this rack do their arithmetic with opposite signs, and the same 60 MHz mistake is possible on both.",
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
        'Frame the whole SAR-3 downlink plan on the analyzer. Center it on 1330 MHz with the 60 MHz span, so both the 1315 MHz beacon and the 1322 to 1358 MHz test-pattern band are on screen.',
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
            question: 'With the center at 1330 MHz and a span of 60 MHz, the screen shows 1300 to 1360 MHz. What is where, and what sits just off the edge?',
            options: [
              'Beacon at 1315 and test pattern at 1322 to 1358, with your own uplink relayed back at 1290 off the left edge',
              'Beacon at 1315 and test pattern at 1322 to 1358, with SAR-1 imagery at 1414 just off the right edge',
              'Test pattern at 1322 to 1358 only, because the beacon at 1315 sits outside the video band, off the left edge',
              'Beacon at 1315 and test pattern at 1322 to 1358, with your 1465 uplink mirrored off the right edge',
            ],
            correctIndex: 0,
            explanation:
              "Know what sits next to your signals. The CW beacon (an unmodulated tone) and the 36 MHz test pattern are both on screen. The 1290 MHz signal off the left edge is the station hearing itself through the satellite, and it'll matter more than anything else here once you start transmitting.",
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
      description:
        'AOS is 10:06:00, and the satellite rises at azimuth 140. Point the antenna at azimuth 140, elevation 5 degrees, so the slew is finished before the satellite clears the horizon.',
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
      description:
        'AOS is 10:06. Turn on program-track for MERIDIAN-SAR-3 and confirm the 11785 MHz beacon (IF 1315 MHz) on the RX Analysis tab. Keep the transmit chain cold, meaning nothing on the air, until the beacon is in.',
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
      description: 'The command window opens at 10:06:22. Bring the chain up in order. The first step is to put the TX modem on the air into the BUC while the BUC is still muted.',
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
      description: 'Second step: unmute the BUC. The carrier now reaches the HPA input, and the HPA is still disabled.',
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
            question: 'The modem goes into a muted BUC, then the BUC is unmuted, then the HPA is enabled. Why that order and not the reverse?',
            options: [
              'Each stage gets signal before gain: an HPA with no drive amplifies the noise floor into the feed',
              "The BUC can't unmute while the HPA is enabled: a rack interlock holds the mute until the HPA drops",
              "It's only convention on a Ku rack: either order works, and the card just wants three separate lines",
              'The key is checked before the carrier radiates: the modem has to be on air for that check to run',
            ],
            correctIndex: 0,
            explanation:
              "The order protects the HPA from amplifying noise with no carrier to carry, and a BUC unmuted with the modem off would put noise into the HPA the same way, at a lower level. On the way down it's the mirror image: HPA off first, then mute the BUC, then take the carrier off the air.",
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
      description: "Third step: enable the HPA output and confirm on the TX Chain tab that it's linear, meaning it isn't overdriven. The uplink is now on the air.",
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
      description: 'Send PLD-ON, the payload power-on command, and confirm its acknowledgement inside the window (10:06:22 to 10:15:08).',
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
        "PLD-ON is acknowledged. Send PLD-TEST-PATTERN, confirm its ACK, and record the command checkout on the card. The console won't enforce the order, but the card does.",
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
              'Command checkout entry. PLD-ON and PLD-TEST-PATTERN were both acknowledged inside the window. What does the card record as the checkout result, and what does that pair of ACKs actually prove?',
            options: [
              'PLD-ON then PLD-TEST-PATTERN, both ACKed: the ACKs prove receipt in order, and the decode proves they worked.',
              'Two ACKs, so the payload is verified: the decode that follows is a customer courtesy, not part of the checkout.',
              'The pattern ACK alone, so the checkout passed: PLD-ON is implied by the pattern and needs no line of its own.',
              'Two ACKs and a linear HPA, so the uplink is accepted: the payload is accepted when Rotterdam sees telemetry.',
            ],
            correctIndex: 0,
            explanation:
              'An acknowledgement is receipt, not effect. A pattern commanded to an unpowered payload gets an ACK just the same, which is why the checkout result is only complete once the decode is on the card.',
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
      id: 'call-the-return',
      nice: ['S0648', 'K0926', 'K0773'],
      title: 'Call the Return',
      description:
        'Since the HPA came up, a strong carrier has been sitting at 1290 MHz IF, about 50 dB above the pattern. Check the HPA state on the TX Chain tab and the key status on the RX Analysis tab, then call it: fault, interference, intrusion, or something you caused. It sits just off the left edge of your 1300 to 1360 MHz screen, so move the center down to see it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['payload-test-pattern'],
      timeLimitSeconds: 90,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'hpa-observed',
          type: 'hpa-enabled',
          description: 'HPA state read on TX Chain',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          id: 'key-observed',
          type: 'rx-key-status',
          description: 'RX key status read on RX Analysis',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Fault, interference, intrusion, or own uplink',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt: "That carrier at 1290 has been there since your HPA came up, and it's 50 dB above my pattern. What is it, and what are you doing about it?",
            evidence: ['hpa-observed', 'key-observed'],
            decisionOptions: [
              {
                label: 'Receive-chain fault: open a ticket and hold the decode',
                correctWhen: { fact: 'equipment-fault-active', is: true },
                feedback: 'Nothing on the receive chain is broken. The AGC is doing exactly what an AGC does with a strong in-band signal.',
              },
              {
                label: 'External interference: characterise it and report',
                correctWhen: {
                  all: [
                    { fact: 'interference-active', is: true },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Interference report opened on the 1290 MHz carrier' },
                feedback: 'It appeared the moment your own amplifier came up, and it sits exactly where your uplink is relayed back to. Look at what you changed.',
              },
              {
                label: 'Intrusion on the link: escalate and hold commanding',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: { log: 'Escalated to CSIRT: suspected intrusion on the SAR-3 link' },
                feedback: "Your key reads Valid and every command has been acknowledged, so there's no sign anyone but you is on this link.",
              },
              {
                label: 'Own uplink relayed back: secure the HPA before the decode',
                correctWhen: {
                  all: [
                    { fact: 'interference-active', is: false },
                    { fact: 'equipment-fault-active', is: false },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Self-interference identified: 14065 MHz uplink returned at 11810 MHz; securing the HPA before the decode' },
              },
            ],
            explanation:
              "The station is hearing itself through the satellite: the signal is co-polar (the same polarization as your receiver), in the receive band, and 50 dB up. There's no fault, no outsider and no intrusion, because the evidence for all three is negative and the timing points straight at your own amplifier. Take the strong signal away and the number comes back.",
            pointPenalty: 10,
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
        "Both ACKs are in. Disable the HPA before you touch the receiver, because the amplifier has nothing left to do until the next command, and while it's up the decode can't be trusted.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-return'],
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
            question: 'With the HPA up, the 1340 MHz test pattern reads about 3 dB of C/N instead of the 11 dB the worksheet predicts. What is happening?',
            options: [
              "SAR-3's transponder returns your own 14065 MHz carrier at 11810 MHz in band, and the AGC cuts the receive gain",
              'The HPA heats the LNB through the feed and raises the noise temperature: Tsys climbs past the 125 K on the worksheet',
              'Uplink Doppler compensation drags the receiver off frequency: the modem locks on the skirt of the pattern',
              "The payload can't transmit the pattern while it's receiving commands: the ACK traffic on 14065 MHz starves the video",
            ],
            correctIndex: 0,
            explanation:
              "The station is hearing itself through the satellite: your carrier comes back co-polar, inside the receive band, some 50 dB above the pattern, and the video goes down with the AGC. Nothing on the receive chain is broken. It's doing exactly what an AGC does with a strong in-band signal. Take the strong signal away and the number comes back.",
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
        'Retune RX modem 1 from 1414 MHz to 1340 MHz (11760 MHz RF), lock the test pattern, and hold C/N above 8 dB. Then press Commit Link near maximum elevation (10:10:45), with at least 4 dB of margin over the 4.2 dB threshold, and put the number on the card beside your prediction.',
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
          description: 'Measured Margin >= 4 dB Over Threshold',
          params: { minMarginDb: 4 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Measured C/N Recorded',
          params: {
            character: Character.SYSTEM,
            question:
              'Payload entry. You predicted 11.3 dB at maximum elevation, the modem locked the pattern on 1340 MHz, and the link committed with at least 4 dB of margin. What goes on the card?',
            options: [
              'The measured C/N beside the 11.3 dB prediction: agreement within 1 dB is the acceptance evidence.',
              'PASS beside the 4.2 dB threshold: clearing the threshold is the acceptance evidence, not the number.',
              'The peak C/N only: the worksheet was a planning aid and has no place on a test record.',
              'The committed margin: it is what the modem used against the 4.2 dB threshold, so it is the evidence.',
            ],
            correctIndex: 0,
            explanation:
              "The margin alone says the link worked today, not that the payload performs as designed. A measurement that matches the model is what lets Rotterdam and the customer predict every pass after this one. A measurement with no prediction beside it's a good day, not an acceptance.",
            pointPenalty: 5,
            documentSection: 'Payload',
            documentLine:
              'Payload: test pattern locked on IF 1340 MHz (11760 MHz RF) with the uplink secured. Predicted C/N 11.3 dB at max el (764 km, FSPL 171.5 dB at 11760 MHz); measured within 1 dB of prediction; committed with >= 4 dB margin over the 4.2 dB QPSK 3/4 threshold.',
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
      description:
        'LOS is 10:15:29. The HPA is already off. Once the satellite sets, finish the reverse order: mute the BUC, then take the carrier off the air. The two minutes start at LOS.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-video'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-3 Pass Over (LOS)',
          params: { noradId: 61703, phase: 'set' },
          mustMaintain: false,
        },
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
      description:
        "Record the verdict along with its residual risk, meaning what the test didn't cover. Whatever is in the Verdict section when Anneke countersigns is the contract.",
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
              'Verdict entry. The command checkout is complete and the first imagery was decoded at the predicted performance. What is the verdict, and what residual risk does the card carry?',
            options: [
              'ACCEPTED at the tested performance. Residual risk: one pass, 28 deg, one site; PLD-SAFE not exercised.',
              'ACCEPTED with no residual risk. The payload works, and the rest is routine operations.',
              'PROVISIONAL at the tested performance. Residual risk: Shetland has not repeated the test on its own pass.',
              'ACCEPTED at the tested performance. Residual risk: the decode was taken with the uplink secured rather than live.',
            ],
            correctIndex: 0,
            explanation:
              "Acceptance is a statement about what was tested, and no more. Low-elevation passes and Shetland are unproven, and so is PLD-SAFE, the command that puts the payload in safe mode. Writing down what wasn't tested is what makes the card usable when the first low pass comes in under budget. Decoding with the uplink secured is the procedure, not a risk.",
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
      description: 'Erik is copied on the signed card and wants to task the satellite. Confirm what acceptance transfers to Nordic Maritime Watch.',
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
            question: 'The card is signed and Erik is asking when he can task SAR-3, meaning order imagery from it. What does acceptance transfer to the customer?',
            options: [
              'SAR-3 enters the tasking pool at the tested performance; anything below it becomes a service ticket.',
              'Nothing yet: acceptance is an internal record, and the customer waits for a further shakedown period first.',
              'Unlimited tasking: acceptance means the payload is proven under every condition it will ever fly in, at any site.',
              'Tasking on Galway passes above 28 degrees only: Shetland has to run its own card on its own pass first.',
            ],
            correctIndex: 0,
            explanation:
              'The tested performance is now the contract number. Erik can task from the next pass, and the first time a pass comes in under that number, the card is what turns a complaint into a ticket with a number on it.',
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
        <em>[Text message from Anneke Visser at {{stationTime}}]</em>
      </p>
      <p>
        "Test plan attached. The spacecraft's bus has been clean for two days, so today is the payload. Please do readiness first, then chain up in order, power the payload, command the test pattern, secure the uplink, decode, and record, all in the order on the card.
      </p>
      <p>
        There's one pass, with AOS at 10:06. Erik is copied, and he'll ask the moment it's signed."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/intro.mp3'),
    },
    objectives: {
      'enable-the-hpa': {
        text: `
        <p>
          I can see your carrier at 14065 MHz on my display, and it's clean and linear. Send PLD-ON once the command window is open, and wait for the acknowledgement before you send the pattern.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-enable-the-hpa.mp3'),
      },
      'payload-test-pattern': {
        text: `
        <p>
          Both acknowledgements are on my screen, so the spacecraft has received both commands. Before you take the decode, what's that carrier at 1290? It's been there since your amplifier came up.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-payload-test-pattern.mp3'),
      },
      'call-the-return': {
        text: `
        <p>
          Yes, that's you, coming back through my transponder. Nobody else is on this link, and nothing of yours is broken. Secure the amplifier and take the decode, because the amplifier has done its job for today.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-call-the-return.mp3'),
      },
      'first-video': {
        text: `
        <p>
          First frames from SAR-3 are on my screen. The numbers on that card are the ones the customer contract will quote back to us, so thank you for recording them against your prediction. Take the chain down once SAR-3 has set.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-first-video.mp3'),
      },
      'sign-the-card': {
        text: `
        <p>
          I'm copied on the card. It has four sections, and the last one says accepted. When can I task it?
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-sign-the-card.mp3'),
      },
      'deliver-to-customer': {
        text: `
        <p>
          The card is signed, Erik has his answer, and SAR-3 is in the tasking pool. LEOP, the launch and early orbit phase, is closed, which means I can finally stop checking my phone. Thank you, Galway. Rotterdam out.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/12/obj-deliver-to-customer.mp3'),
      },
    },
  },
};
