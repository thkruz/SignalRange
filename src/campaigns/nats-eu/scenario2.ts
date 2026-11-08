import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * - EIRP 31.3 dBm, GW-01 4m Ku gain 50.4 dBi (at the LNA flange), Tsys 125 K, BW 36 MHz, misc 1 dB
 * - correct worksheet -> C/N 11.37 dB (expectedCNRDb 11.4, tolerance 1.0)
 * - measured peak through the real chain: 10.93 dB at culmination
 * - threshold 4.2 dB C/N (QPSK 3/4 demod: Es/N0 5.0 dB in the 30 Msps carrier)
 *   + 4 dB required margin -> acceptance at 8.2 dB, commit near culmination in
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
  imageUrl: 'nats-eu/2/card.png',
  number: 2,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario1'],
  title: 'Proving the Link',
  subtitle: 'Acceptance Testing & Link Budgets',
  duration: '30-35 min',
  missionType: 'Commissioning',
  description: `GW-01 isn't accepted yet. Its first MERIDIAN contact worked, but now it has to prove it performs to the number on the contract, and you'll sign a test card saying so.<br><br>The acceptance test is simple to state and hard to fake. First predict the carrier-to-noise ratio (C/N) for the next MERIDIAN-SAR-1 pass from the link budget. Then measure it on the rising leg, at culmination and on the setting leg, and show the two agree with margin over the demodulator threshold.<br><br>Charlie has left the site survey numbers on the console. Read the ones you can verify off the rack first, and do the arithmetic before the pass starts, because the pass is about seven minutes long and the useful part is shorter than that.`,
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
      expectedCNRDb: 11.4,
      toleranceDb: 1.0,
      thresholdCNRDb: 4.2,
      requiredMarginDb: 4,
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
            question: 'Acceptance needs a predicted C/N, a measured C/N, and margin over the demodulator threshold. Which of those can you do before AOS?',
            options: [
              'The prediction, because it comes from the link budget and not from the pass.',
              'The measurement, because the receiver reads C/N whether or not the satellite is up.',
              'None of them, because every step needs the satellite overhead.',
            ],
            correctIndex: 0,
            explanation:
              "That's right. The budget is arithmetic on known geometry and hardware, so you can do it now and spend the pass measuring instead of calculating. The measurement has to wait, because the receiver has nothing to read until the satellite rises. AOS is eighteen minutes away.",
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
      description: 'This is a receive-only acceptance, so confirm on the TX chain that the HPA output is disabled and the BUC is muted before the pass.',
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
            question: 'Nothing on this test card transmits. Why check the TX chain before the pass anyway?',
            options: [
              'An untasked carrier breaks flight rules, and an HPA with no drive amplifies its own noise',
              "The receiver can't lock while the HPA is disabled, and a muted BUC drops the LNB's reference signal",
              "The link budget needs the HPA output power, and the card can't be computed without that number",
              'The interlocks handle it either way, and the log records whatever state the chain was in',
            ],
            correctIndex: 0,
            explanation:
              "A carrier radiated on a pass nobody tasked you on breaks the flight rules, and an HPA that's enabled with nothing driving it amplifies its own noise into the feed. The downlink budget uses the satellite's EIRP, not the HPA's output, and the BUC doesn't feed the LNB's reference, so the lock and the link budget are unaffected either way. Today the station only listens, and the log has to show that it only listens. The transmit half of the licence belongs to a later card.",
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
      description: 'Confirm the GPSDO is locked and the LNB is thermally stable, because both feed the system noise figure the test card assumes.',
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
        'Before the survey numbers go into the worksheet, verify the one you can read off the rack: LNB gain of 65 dB on RX analysis. Then work out where the system noise temperature on the card comes from.',
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
            question: 'The card puts Tsys, the system noise temperature, at 125 K with the LNB at 60 K. Where do the other 65 K come from?',
            options: [
              'Sky and atmosphere at 28 degrees elevation plus the feed loss ahead of the LNA',
              'The GPSDO reference plus the phase noise it adds to the LNB local oscillator',
              'Rounding in the survey plus the 1 dB miscellaneous loss folded into the card',
              'The BUC, even when muted, plus its coupling through the OMT into the receive side',
            ],
            correctIndex: 0,
            explanation:
              "Everything in front of the first amplifier (the LNA) adds noise: the sky the beam looks through, the atmosphere at that elevation, and the feed and OMT, the part that separates transmit from receive. Tsys is the sum of those, referenced to the LNA input. That's why the same LNB gives a different Tsys at a different elevation, and why the GPSDO and the survey rounding don't belong in the sum.",
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
      description: 'Open the Link Analysis tab, which holds the acceptance worksheet, and read the survey numbers before you start entering values.',
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
        'Fill in the worksheet for MERIDIAN-SAR-1 at maximum elevation and press Compute. The survey numbers are: satellite EIRP 31.3 dBm; slant range at maximum elevation 761 km, which gives a free-space path loss of 171.4 dB at 11686 MHz; GW-01 receive gain 50.4 dBi; system noise temperature 125 K; occupied bandwidth 36 MHz; and miscellaneous losses 1 dB.',
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
        'The worksheet used 761 km at culmination. At the 5 degree mask the slant range is 2270 km, so work out the path loss there and what it means for the measurement window.',
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
            question: 'Free-space path loss (FSPL) is 171.4 dB at 761 km. What is it at 2270 km, the range at the 5 degree mask?',
            options: [
              '180.9 dB, which is about 9.5 dB more, so C/N at AOS is roughly 1.5 dB',
              '176.1 dB, which is about 4.7 dB more, so C/N at AOS is roughly 6.3 dB',
              '171.4 dB, which is no more at all, so C/N at AOS is still roughly 11 dB',
              '190.4 dB, which is about 19 dB more, so C/N at AOS is roughly -8 dB',
            ],
            correctIndex: 0,
            explanation:
              'Path loss goes with the square of the range, so the change is 20 log10(2270 / 761) = 9.5 dB. That takes the 11 dB at culmination down to about 1.5 dB at the mask. Using 10 log instead of 20 log gives only 4.7 dB, and using 40 log gives 19 dB, and neither matches free-space loss. That one number is why the acceptance window is the middle of the pass and why nobody decodes at the horizon.',
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
      description: 'Open the Pass Schedule tab and confirm when MERIDIAN-SAR-1 culminates, because that is where the card wants the number.',
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
              'At culmination: 14:06:45, 28 degrees elevation, 761 km',
              'At AOS: 14:03:10, 5 degrees elevation, 2270 km',
              'At LOS: 14:10:18, 5 degrees elevation, 2270 km',
              'At SAR-2 culmination: 14:22:10, 25 degrees elevation, 761 km',
            ],
            correctIndex: 0,
            explanation:
              "Culmination is the shortest range of the pass, so it gives the best C/N the station will see on this geometry, and the card is written against that number. AOS and LOS sit at the 5 degree mask, where the path loss is highest. The 14:22 culmination belongs to SAR-2, which isn't on the card.",
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
        'Put the antenna in program-track on MERIDIAN-SAR-1 before 14:03, so the measurement is taken on boresight (the center of the beam) and not on the shoulder of the beam. Then confirm the beacon on RX analysis.',
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
        'Lock the 1414 MHz carrier and read C/N at about 15 degrees elevation on the way up, around 14:04:45. Expect roughly 7 dB, which is locked and above the 4.2 dB demodulator threshold but below the acceptance line.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-for-acceptance'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 5 dB on the Rising Leg',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
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
        'With the receiver locked on the 1414 MHz downlink, go back to Link Analysis and press Commit Link near culmination, between 14:05:10 and 14:08:20. Acceptance needs at least 4 dB of margin over the 4.2 dB demodulator threshold.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rising-leg'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 4 dB Over Threshold',
          params: { minMarginDb: 4 },
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
      description: 'Stay on RX analysis past culmination and read C/N at about 15 degrees elevation on the way down, around 14:08:40. Then compare it with the rising leg.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['commit-the-link'],
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Below 15 Degrees on the Setting Leg',
          params: { noradId: 61701, phase: 'setting-below', elevation: 15 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 5 dB on the Setting Leg',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Curve Read',
          params: {
            character: Character.SYSTEM,
            question: 'At 15 degrees on the way up you read about 7 dB, and at 15 degrees on the way down you read about 7 dB again. Why are they the same?',
            options: [
              'Same elevation means the same slant range, so the curve is symmetric about culmination',
              "The receiver's automatic gain control has settled by the setting leg, so the readings agree by then",
              'Doppler is equal and opposite on the two legs, so the demodulator reports the same C/N either way',
              "It's a coincidence, because the two readings are independent samples that happened to match",
            ],
            correctIndex: 0,
            explanation:
              'The same elevation means the same slant range, the same path loss and the same sky noise, so C/N on a pass is a function of geometry. That means reading one leg predicts the other. A difference between the two legs would point to a fault, not to physics.',
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
      description: 'SAR-1 sets at 14:10 (LOS). Complete the measurement section of the test card with the prediction, the measured values and the margin.',
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
              'Predicted 11.4 dB, measured about 11 dB, margin about 7 dB over threshold, and both 15 degree readings about 7 dB',
              'Predicted 11.4 dB, measured about 11 dB, margin 0.4 dB under prediction, and no readings on the legs',
              'Predicted 11.4 dB, measured about 11 dB, margin 3 dB over the 8 dB service line, and both 15 degree readings about 7 dB',
              'Predicted 11.4 dB, no measurement needed, margin 7.2 dB over threshold, and leg readings predicted at about 7 dB',
            ],
            correctIndex: 0,
            explanation:
              'The card records the prediction, the measurement, the margin over the 4.2 dB demodulator threshold, and the two leg readings that prove the curve. Margin is measured against the threshold, not against the prediction and not against the 8 dB service line. Written that way, Rotterdam can check the card tomorrow against a different pass.',
            pointPenalty: 5,
            documentSection: 'Measurement',
            documentLine:
              'MERIDIAN-SAR-1 14:03Z pass: predicted C/N 11.4 dB at culmination; measured about 11 dB at 28 deg / 761 km; margin over 4.2 dB demod threshold about 7 dB; rising leg 15 deg ~7 dB, setting leg 15 deg ~7 dB.',
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
      description: "MERIDIAN-SAR-2 rises at 14:18:42 from azimuth 130. It isn't on the card, but run it anyway. Retune modem 1 to its 1370 MHz imagery carrier.",
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
            question: "SAR-2 isn't on the acceptance card. Why work its pass?",
            options: [
              "It's a second satellite on a second geometry, so a match there shows the first result wasn't luck",
              'Rotterdam pays per pass, so every contact worked before acceptance is billable against the contract',
              'The receiver needs the exercise, because a second lock before sign-off proves the modem is stable',
              "There's no reason on the card, because it's a stretch goal and the verdict is signed without it",
            ],
            correctIndex: 0,
            explanation:
              "A second satellite on a second geometry tests the model instead of leaning on one lucky measurement. A 25 degree pass at 828 km should come in around 10 dB, and if it does, the model holds across the constellation. The pass doesn't earn billing and it isn't exercise for the modem; it only checks that the first number repeats.",
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
      description:
        'Program-track MERIDIAN-SAR-2 and confirm C/N above 8 dB near its 25 degree culmination at 14:22:10. This one is optional, because the card is complete without it.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: 'Record the acceptance verdict by saying whether the measured link supports the service, and why the prediction matters when you measured it anyway.',
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
            question: 'The measured C/N came in within a decibel of the prediction. Why does acceptance require the prediction at all?',
            options: [
              'Because a match proves the station performs as designed, and a good number alone could be luck.',
              "It doesn't, because the measurement is the only thing that matters and the prediction is a formality.",
              'Because the customer contract specifies a calculation, not a test, so the measurement is the formality.',
            ],
            correctIndex: 0,
            explanation:
              "That's right. A good measurement from a broken model is luck, not acceptance. Agreement between the model and the measurement is what lets you predict tomorrow's pass, and every pass after it. With the two agreeing, GW-01 is accepted.",
            pointPenalty: 5,
            documentSection: 'Verdict',
            documentLine:
              'ACCEPTED. Measured within 1 dB of prediction with about 7 dB margin over threshold. GW-01 cleared for MERIDIAN receive tasking. Signed GW-01 operator; countersigned C. Brooks.',
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
        "First light was a start, but it doesn't count as acceptance. Rotterdam wants a number on a signed card before they'll schedule us for real tasking, which means real customer passes. That number has to be predicted before it's measured, otherwise it isn't a test, it's a guess that happened to work. The survey figures are on the Link Analysis console. Read the ones you can check against the rack first, and do the arithmetic before AOS."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/intro.mp3'),
    },
    objectives: {
      'tx-cold-check': {
        text: `
        <p>
          That's the HPA disabled and the BUC muted, where Rotterdam can see it in the log. This is a receive-only card, and Rotterdam's flight rules are the constellation's operating rules: a station that radiates when nobody asked it to doesn't get tasking. Next, check the reference and the LNB.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-tx-cold-check.mp3'),
      },
      'read-the-rack': {
        text: `
        <p>
          Good, the LNB gain is 65 dB, which is what the survey says, and you've accounted for the 125 K of system noise temperature. You can't read Tsys off anything, because it's the sky plus everything in front of the LNA, the first amplifier in the LNB. Next, open the Link Analysis console.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-read-the-rack.mp3'),
      },
      'compute-link-budget': {
        text: `
        <p>
          That's the predicted C/N, and it matches. The satellite's EIRP, its effective radiated power, is in dBm on that sheet, but Boltzmann's constant is in dBW, so the 30 dB difference between the two catches everyone once. It's far better to catch it on a worksheet than on a signed card. Now do the same sum at the mask.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-compute-link-budget.mp3'),
      },
      'path-loss-check': {
        text: `
        <p>
          That's the path loss at the mask. At the mask the range is about three times longer than at culmination, and that's the whole reason the useful part of a pass is only about three minutes in the middle. Next, confirm the measurement point on the pass schedule.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-path-loss-check.mp3'),
      },
      'track-for-acceptance': {
        text: `
        <p>
          The antenna is on program-track and the beacon is up. That matters, because a measurement taken on the shoulder of the beam, off to one side of the center, tells you about your pointing and not about the station. Now wait for the satellite to climb through 15 degrees, about a minute and a half after it rises, and read the C/N.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-track-for-acceptance.mp3'),
      },
      'rising-leg': {
        text: `
        <p>
          That's the rising leg read. You should have seen about 7 dB. Remember that number, because you'll see it again on the way down and it should be the same. Now wait for culmination, the highest point of the pass, and commit the link there.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-rising-leg.mp3'),
      },
      'commit-the-link': {
        text: `
        <p>
          That's the link committed. The button records what the receiver sees at the moment you press it, which is why I wanted you to wait until the margin read what the card needs. Now stay on the pass and measure again on the setting leg, once the satellite is below 15 degrees.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-commit-the-link.mp3'),
      },
      'record-measurements': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at {{stationTime}}]</em>
        </p>
        <p>
          "Galway, SAR-1's telemetry shows your receive window from 14:04:50 to 14:08:30, and it's clean. Please send the card when it's signed and I'll schedule you. Welcome to the network. My flight dynamics team watched the pass from here, and the room went quiet, which is their way of saying it went well."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-record-measurements.mp3'),
      },
      'set-up-regression': {
        text: `
        <p>
          The modem is on SAR-2's imagery carrier. The second satellite isn't on the card, but running it anyway is worth it. One good number is just a number, while two good numbers from two different passes is a model. The regression run is optional, so you can sign the card whenever you're ready.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-set-up-regression.mp3'),
      },
      'sign-the-test-card': {
        text: `
        <p>
          That's the card signed, and I'll countersign it. Rotterdam will pretend they never doubted us. We're accepted for receive, and the other half of the licence, transmit, is tomorrow's problem.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/2/obj-sign-the-test-card.mp3'),
      },
    },
  },
};
