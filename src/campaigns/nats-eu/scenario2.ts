import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 2 - "Proving the Link" / Acceptance Testing & Link Budgets
 *
 * New mechanic: M1 link-budget / EIRP planning console (Link Analysis tab).
 * GW-01 is still in commissioning, so every claimed number has to be proven on
 * a test card: predict the C/N for the next MERIDIAN-SAR-1 pass from first
 * principles, then measure it at three points on the pass and show the
 * measured margin clears the demod threshold at culmination.
 *
 * Phase 16 rewrite: the acceptance shift around the pass. The uplink is
 * confirmed cold, the reference and LNB are checked, the survey inputs are read
 * off the rack before they go into the worksheet, the path loss is checked at
 * the mask as well as at culmination, and the measurement is taken on the
 * rising leg, at culmination and on the setting leg so the elevation curve is
 * observed rather than asserted. A second bird runs as an optional regression.
 *
 * Clock: sim starts 2027-03-15 13:45:00 UTC (the brief freezes it until read);
 * the passes are scenario 1's, so the RF envelope is the one Phase A validated:
 * - MERIDIAN-SAR-1: AOS 14:03:10 (5 deg mask) az 000, max el 28.0 at 14:06:45
 *   (761 km), LOS 14:10:18. Settled C/N through the real chain (harness):
 *   el 10 deg 5.5 dB, el 15 deg 7.2 dB, el 18 deg 8.0 dB, culmination 10.9 dB,
 *   symmetric on the way down.
 * - MERIDIAN-SAR-2: AOS 14:18:42 az 130, max el 25.0 at 14:22:10, LOS 14:25:40;
 *   C/N >= 8 dB roughly 14:20:45 .. 14:23:45, peak 10.2 dB.
 *
 * Link-budget numbers (measured, not assumed - see
 * test/campaigns/nats-eu-phase-b-validation.test.ts):
 * - slant range at max elevation 761 km -> FSPL 171.4 dB at 11686 MHz
 *   (2270 km at the 5 deg mask -> 180.9 dB, which is why the window is the
 *   middle of the pass)
 * - EIRP 28 dBm, GW-01 4m Ku gain 51.8 dBi, Tsys 88 K, BW 36 MHz, misc 1 dB
 * - correct worksheet -> C/N 10.96 dB (expectedCNRDb 11.0, tolerance 1.0)
 * - measured peak through the real chain: 10.93 dB at culmination
 * - threshold 6 dB (QPSK 3/4 demod) + 2 dB required margin -> commit anywhere in
 *   the window 14:05:10 .. 14:08:20.
 *
 * Staged state (scenario-local clone of GW-01): BUC muted, as a receive-only
 * acceptance should find it.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0080: Test and evaluate system performance against requirements
 *   - S0015: Skill in conducting test events
 *   - K0740: Knowledge of system performance indicators
 *
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0645: Knowledge of standard operating procedures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - S0421: Skill in operating network equipment
 *   - T1580: Report service status to stakeholders
 */

/** GW-01 for a receive-only acceptance: BUC muted. Deep clone, never spread. */
const galwayAcceptance: GroundStationConfig = structuredClone(galwayGroundStation);
galwayAcceptance.rfFrontEnds[0].buc = { ...galwayAcceptance.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario2Data: ScenarioData = {
  id: 'nats-eu-scenario2',
  url: 'nats-eu/scenarios/nats-eu-scenario2',
  imageUrl: 'nats/2/card.png',
  number: 2,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario1'],
  title: 'Proving the Link',
  subtitle: 'Acceptance Testing & Link Budgets',
  duration: '30-35 min',
  missionType: 'Commissioning',
  description: `GW-01 is not accepted yet. Yesterday you worked a pass; today you have to prove the station performs to the number on the contract, and sign a test card saying so.<br><br>The acceptance test is simple to state and unforgiving to fake: predict the carrier-to-noise ratio for the next MERIDIAN-SAR-1 pass from the link budget, then measure it on the rising leg, at culmination and on the setting leg, and show the two agree with margin over the demodulator threshold.<br><br>Charlie has left the site survey numbers on the console. Read the ones you can verify off the rack first. Do the arithmetic before AOS - the pass is seven minutes long and the useful part is shorter than that.`,
  equipment: ['4m Ku-Band LEO Tracking Antenna', 'Ku-Band RF Front End (13100 MHz LNB LO)', 'Link Analysis Console', 'QPSK 3/4 Receiver'],
  settings: {
    isSync: true,
    groundStations: [galwayAcceptance],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-2?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'Acceptance Test Card GW-01-ATP-002',
      description: 'MERIDIAN-SAR-1 imagery downlink, C/N at maximum elevation. Sections: Prediction, Measurement, Verdict.',
    },

    // M1 - the acceptance test card. expectedCNRDb is what a CORRECT worksheet
    // yields from the numbers published in the objective description below;
    // requiredMarginDb is measured against the live receiver at Commit Link.
    linkBudget: {
      label: 'GW-01 acceptance: MERIDIAN-SAR-1 downlink at max elevation',
      expectedCNRDb: 11.0,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 2,
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Test Card',
      description: 'Open the shift brief and confirm you understand what acceptance requires: a predicted C/N, a measured C/N, and margin over threshold.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Test Card Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Acceptance Criteria Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Acceptance needs a predicted C/N, a measured C/N, and margin over the demod threshold. Which of those can you do before AOS?',
            options: [
              'The prediction - it comes from the link budget, not the pass.',
              'The measurement - the receiver reads C/N whether or not the bird is up.',
              'None of them. Everything waits for AOS.',
            ],
            correctIndex: 0,
            explanation: 'Right. The budget is arithmetic on known geometry and hardware; do it now so the pass is spent measuring, not calculating. Eighteen minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS - STATION STATE AND SURVEY INPUTS
    // ============================================================
    {
      id: 'tx-cold-check',
      nice: ['T0431', 'K0645'],
      title: 'Confirm the Uplink is Cold',
      description: 'A receive-only acceptance: HPA output disabled and BUC muted before the pass. Confirm both on the TX chain.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why Cold',
          params: {
            character: Character.SYSTEM,
            question: 'Nothing on this test card transmits. Why check the TX chain at all before the pass?',
            options: [
              'An untasked carrier breaks flight rules, and an HPA with no drive amplifies its own noise',
              'The receiver cannot lock while the HPA is disabled, and a muted BUC drops the LNB reference',
              'The link budget needs the HPA output power, and the card cannot be computed without it',
              'The interlocks handle it either way, and the log shows whatever state the chain was in',
            ],
            correctIndex: 0,
            explanation:
              'Cold and confirmed. A carrier radiated at a bird with no tasking breaks flight rules, and an HPA enabled with nothing behind it amplifies its own noise into the feed. The transmit half of the licence is a later card; today the station only listens, and it has to be seen to only listen.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'reference-and-lnb',
      nice: ['T0431', 'K0740'],
      title: 'Reference and LNB Check',
      description: 'GPSDO locked, LNB thermally stable. Both feed the system noise figure the test card assumes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tx-cold-check'],
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
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'read-the-rack',
      nice: ['S0015', 'K0740'],
      title: 'Read the Survey Inputs Off the Rack',
      description:
        'Before the survey numbers go into the worksheet, verify the one you can: LNB gain 65 dB on RX analysis. Then account for the system noise temperature on the card.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-and-lnb'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain 65 dB',
          params: { gain: 65 as dB, gainTolerance: 0.5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'System Noise Accounted For',
          params: {
            character: Character.SYSTEM,
            question: 'The card puts Tsys at 88 K with the LNB at 60 K. Where do the other 28 K come from?',
            options: [
              'Sky and atmosphere at 28 degrees elevation plus the feed loss ahead of the LNA',
              'The GPSDO reference plus the phase noise it adds to the LNB local oscillator',
              'Rounding in the survey plus the 1 dB miscellaneous loss folded into the card',
              'The BUC, even when muted, plus its coupling through the OMT into the receive side',
            ],
            correctIndex: 0,
            explanation:
              'Everything in front of the first amplifier adds noise: the sky the beam looks through, the atmosphere at that elevation, the feed and the OMT. Tsys is the sum referenced to the LNA input, and it is why the same LNB gives a different Tsys at a different elevation.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'open-link-analysis',
      nice: ['T0080', 'S0015'],
      title: 'Open the Link Analysis Console',
      description: 'The Link Analysis tab holds the acceptance worksheet. Open it and read the survey numbers before you start entering values.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-rack'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Link Analysis Tab Open',
          params: { tab: 'link-budget' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'compute-link-budget',
      nice: ['T0080', 'S0015', 'K0740'],
      title: 'Predict the Downlink C/N',
      description:
        'Fill the worksheet for MERIDIAN-SAR-1 at maximum elevation and press Compute. Survey numbers: satellite EIRP 28 dBm; slant range at max elevation 761 km (free-space path loss 171.4 dB at 11686 MHz); GW-01 receive gain 51.8 dBi; system noise temperature 88 K; occupied bandwidth 36 MHz; miscellaneous losses 1 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['open-link-analysis'],
      timeLimitSeconds: 5 * 60,
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
      points: 20,
    },
    {
      id: 'path-loss-check',
      nice: ['K0773', 'K0740'],
      title: 'Check the Path Loss at the Mask',
      description:
        'The worksheet used 761 km at culmination. At the 5 degree mask the slant range is 2270 km. Work out the path loss there and what it means for the measurement window.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['compute-link-budget'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'FSPL at AOS',
          params: {
            character: Character.SYSTEM,
            question: 'FSPL is 171.4 dB at 761 km. What is it at 2270 km, the range at the 5 degree mask?',
            options: [
              '180.9 dB - about 9.5 dB more, so C/N at AOS is roughly 1.5 dB',
              '176.1 dB - about 4.7 dB more, so C/N at AOS is roughly 6.3 dB',
              '171.4 dB - no more at all, so C/N at AOS is still roughly 11 dB',
              '190.4 dB - about 19 dB more, so C/N at AOS is roughly -8 dB',
            ],
            correctIndex: 0,
            explanation:
              'Path loss goes with range squared: 20 log10(2270 / 761) = 9.5 dB, which takes the 11 dB at culmination down to about 1.5 dB at the mask. Ten times the log is 4.7 dB; forty times is 19 dB; neither is free-space loss. That single number is why the acceptance window is the middle of the pass and why nobody decodes at the horizon.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'review-pass-schedule',
      nice: ['K1032', 'S0421'],
      title: 'Confirm the Measurement Point',
      description: 'Open the Pass Schedule tab and confirm when MERIDIAN-SAR-1 culminates. That is where the card wants the number.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['path-loss-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Pass Schedule Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Culmination Read',
          params: {
            character: Character.SYSTEM,
            question: 'When and where does the acceptance measurement get taken?',
            options: [
              '14:06:45, 28 degrees elevation, 761 km - culmination',
              '14:03:10, 5 degrees elevation, 2270 km - AOS',
              '14:10:18, 5 degrees elevation, 2270 km - LOS',
              '14:22:10, 25 degrees elevation, 761 km - SAR-2 culmination',
            ],
            correctIndex: 0,
            explanation:
              'Culmination is the shortest range of the pass, so it is the best C/N the station will see on this geometry and the number the card is written against. The 14:22 culmination is SAR-2, which is not on the card.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE ACCEPTANCE PASS
    // ============================================================
    {
      id: 'track-for-acceptance',
      nice: ['S0421', 'K1032'],
      title: 'Track MERIDIAN-SAR-1',
      description:
        'Put the antenna in program-track on MERIDIAN-SAR-1 before 14:03 so the measurement is taken on boresight, not on the shoulder of the beam. Confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-pass-schedule'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Detected',
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
      points: 10,
    },
    {
      id: 'rising-leg',
      nice: ['T0080', 'K0740'],
      title: 'Measure on the Rising Leg',
      description:
        'Lock the 1414 MHz carrier and read C/N around 15 degrees on the way up (about 14:04:45). Expect roughly 7 dB: above the 6 dB demodulator threshold, below the acceptance line.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-for-acceptance'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 5 dB on the Rising Leg',
          params: { modemNumber: 1, minCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'commit-the-link',
      nice: ['T0080', 'K0740', 'S0015'],
      title: 'Measure and Commit the Link',
      description:
        'With the receiver locked on the 1414 MHz downlink, return to Link Analysis and press Commit Link near culmination (14:05:10 to 14:08:20). Acceptance needs at least 2 dB of margin over the 6 dB demodulator threshold.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rising-leg'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 2 dB Over Threshold',
          params: { minMarginDb: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'setting-leg',
      nice: ['T0080', 'K0773'],
      title: 'Measure on the Setting Leg',
      description: 'Stay on RX analysis past culmination and read C/N around 15 degrees on the way down (about 14:08:40). Compare it with the rising leg.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['commit-the-link'],
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 5 dB on the Setting Leg',
          params: { modemNumber: 1, minCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Curve Read',
          params: {
            character: Character.SYSTEM,
            question: 'At 15 degrees on the way up you read about 7 dB. At 15 degrees on the way down you read about 7 dB. Why the same?',
            options: [
              'Same elevation, same slant range, same path loss - the curve is symmetric about culmination',
              'The AGC has settled by the setting leg - the two readings agree once the loop catches up',
              'Doppler is equal and opposite on the two legs - the demod reports the same C/N either way',
              'Coincidence - the two readings are independent samples that happened to fall on the same value',
            ],
            correctIndex: 0,
            explanation:
              'Same elevation means the same slant range, the same path loss and the same sky noise. C/N on a pass is a function of geometry. Read one leg and you have predicted the other; a difference between them is a fault, not physics.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 4: RECORD
    // ============================================================
    {
      id: 'record-measurements',
      nice: ['T0080', 'T1580'],
      title: 'Record the Measurements',
      description: 'LOS at 14:10. Enter the measurement section of the test card.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['setting-leg'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Measurement Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the measurement section of GW-01-ATP-002?',
            options: [
              'Predicted 11.0 dB; measured 10.9 dB at 28 deg; margin 4.9 dB over 6 dB; ~7 dB at 15 deg both legs',
              'Predicted 11.0 dB; measured 10.9 dB at 28 deg; margin 0.1 dB under prediction; no shoulder readings',
              'Predicted 11.0 dB; measured 10.9 dB at 28 deg; margin 2.9 dB over 8 dB; ~7 dB at 15 deg both legs',
              'Predicted 11.0 dB; measurement not required; margin 5.0 dB over 6 dB; shoulders predicted ~7 dB',
            ],
            correctIndex: 0,
            explanation:
              'Prediction, measurement, margin over the 6 dB demodulator threshold, and the two shoulder readings that prove the curve. Margin is measured against the threshold, not against the prediction and not against the 8 dB service line. A card Rotterdam can check tomorrow against a different pass.',
            pointPenalty: 5,
            documentSection: 'Measurement',
            documentLine:
              'MERIDIAN-SAR-1 14:03Z pass: predicted C/N 11.0 dB at culmination; measured 10.9 dB at 28 deg / 761 km; margin over 6 dB demod threshold 4.9 dB; rising leg 15 deg ~7 dB, setting leg 15 deg ~7 dB.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 5: REGRESSION RUN (SAR-2)
    // ============================================================
    {
      id: 'set-up-regression',
      nice: ['S0421', 'S0015'],
      title: 'Set Up the Regression Run',
      description: 'MERIDIAN-SAR-2 rises at 14:18:42 from azimuth 130. It is not on the card; run it anyway. Retune modem 1 to its 1370 MHz imagery carrier.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['record-measurements'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why a Regression Run',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-2 is not on the acceptance card. Why work its pass?',
            options: [
              'A second bird on a second geometry: if the model predicts this one too, the number was not luck',
              'Rotterdam pays per pass: every contact worked before acceptance is billable against the contract',
              'The receiver needs the exercise: a second lock before sign-off proves the modem is stable',
              'No reason on the card: it is a stretch goal only, and the verdict is signed without it',
            ],
            correctIndex: 0,
            explanation: 'Repeatability. A 25 degree pass at 828 km should come in around 10 dB; if it does, the model holds across the constellation.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'regression-sar2',
      nice: ['S0421', 'T0080'],
      title: 'Regression: MERIDIAN-SAR-2',
      description: 'Program-track MERIDIAN-SAR-2 and confirm C/N above 8 dB near its 25 degree culmination (14:22:10). Optional: the card is complete without it.',
      groundStation: 'GW-01',
      isOptional: true,
      prerequisiteObjectiveIds: ['set-up-regression'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 8 dB on SAR-2',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4: SIGN
    // ============================================================
    {
      id: 'sign-the-test-card',
      nice: ['T0080', 'K0740'],
      title: 'Sign the Test Card',
      description: 'Record the acceptance verdict: does the measured link support the service, and why does the prediction matter if you measured it anyway?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['set-up-regression'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Acceptance Result Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Measured C/N came in within a decibel of prediction. Why does acceptance require the prediction at all?',
            options: [
              'Because a match proves the station performs as designed - a good number from a broken model is luck.',
              'It does not - the measurement is the only thing that matters, and the prediction is a formality.',
              'Because the customer contract specifies a calculation, not a test - the measurement is the formality.',
            ],
            correctIndex: 0,
            explanation:
              "Exactly. A good measurement from a broken model is luck, not acceptance. Agreement between model and measurement is what lets you predict tomorrow's pass, and every pass after it. GW-01 is accepted.",
            pointPenalty: 5,
            documentSection: 'Verdict',
            documentLine:
              'ACCEPTED. Measured within 1 dB of prediction with 4.9 dB margin over threshold. GW-01 cleared for MERIDIAN receive tasking. Signed GW-01 operator; countersigned C. Brooks.',
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
        <em>[Text message from Charlie Brooks at 13:44]</em>
      </p>
      <p>
        "Yesterday counted as first light. It does not count as acceptance. Rotterdam wants a number on a signed card before they schedule us for real tasking, and the number has to be predicted before it is measured or it is not a test, it is a guess that happened to work. Survey figures are on the Link Analysis console. Read the ones you can check off the rack first. Do the arithmetic before AOS."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'tx-cold-check': {
        text: `
        <p>
          Receive-only card. I want the amplifier disabled and the BUC muted where Rotterdam can see it in the log. A station that radiates when nobody asked is a station that does not get tasking.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'read-the-rack': {
        text: `
        <p>
          Sixty-five dB on the LNB is on the survey and it is on the rack; check they agree. Tsys you cannot read off anything - that is the sky plus everything in front of the LNA. Know what is in the eighty-eight.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'compute-link-budget': {
        text: `
        <p>
          EIRP is in dBm on that sheet. Boltzmann is in dBW. Mind the thirty. Everyone loses it once; lose it now, on a worksheet, not on a card.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'path-loss-check': {
        text: `
        <p>
          Now do the same sum for the mask. Three times the range. That number is the whole reason the useful part of a pass is three minutes in the middle.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'track-for-acceptance': {
        text: `
        <p>
          Program-track before it rises. A measurement on the shoulder of the beam is a measurement of your pointing, not the station.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'rising-leg': {
        text: `
        <p>
          Read it now, low. Seven-ish at fifteen degrees. Remember the number; you will see it again on the way down and it should be the same.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'commit-the-link': {
        text: `
        <p>
          Top of the pass. Commit it when the margin reads what the card needs, not a second earlier. That button records what the receiver sees at the moment you press it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'record-measurements': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at 14:11]</em>
        </p>
        <p>
          "Galway - SAR-1 telemetry shows your receive window 14:04:50 to 14:08:30, clean. Send the card when it is signed and I will schedule you. Welcome to the network."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'set-up-regression': {
        text: `
        <p>
          Second bird is not on the card. Run it anyway. One good number is a number; two good numbers on two geometries is a model.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'sign-the-test-card': {
        text: `
        <p>
          Sign it. I will countersign it. Rotterdam will pretend they never doubted us. Accepted for receive - the other half of the licence is tomorrow's problem.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
    },
  },
};
