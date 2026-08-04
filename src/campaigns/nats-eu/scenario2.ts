import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 2 - "Proving the Link" / Acceptance Testing & Link Budgets
 *
 * New mechanic: M1 link-budget / EIRP planning console (Link Analysis tab).
 * GW-01 is still in commissioning, so every claimed number has to be proven on
 * a test card: predict the C/N for the next MERIDIAN-SAR-1 pass from first
 * principles, then commit the link during the pass and show the measured margin
 * clears the demod threshold.
 *
 * Pass timeline (scenario clock starts 2027-03-15 14:00:00 UTC), identical to
 * scenario 1 so the RF envelope is the one Phase A validated:
 * - MERIDIAN-SAR-1: AOS T+3.2 min, max el 28.0 deg at T+6.8, LOS T+10.3 min
 *
 * Link-budget numbers (measured, not assumed - see
 * test/campaigns/nats-eu-phase-b-validation.test.ts):
 * - slant range at max elevation 761 km -> FSPL 171.4 dB at 11686 MHz
 * - EIRP 28 dBm, GW-01 4m Ku gain 51.8 dBi, Tsys 88 K, BW 36 MHz, misc 1 dB
 * - correct worksheet -> C/N 10.96 dB (expectedCNRDb 11.0, tolerance 1.0)
 * - measured peak through the real chain: 10.93 dB at T+6.8
 * - threshold 6 dB (QPSK 3/4 demod) + 2 dB required margin -> commit anywhere in
 *   the 193 s window T+5.2 .. T+8.4, which is the same window S1 already asks
 *   the operator to hit.
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
 */
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
  duration: '20-25 min',
  missionType: 'Commissioning',
  description: `GW-01 is not accepted yet. Yesterday you worked a pass; today you have to prove the station performs to the number on the contract, and sign a test card saying so.<br><br>The acceptance test is simple to state and unforgiving to fake: predict the carrier-to-noise ratio for the next MERIDIAN-SAR-1 pass from the link budget, then measure it during the pass and show the two agree with margin over the demodulator threshold.<br><br>Charlie has left the site survey numbers on the console. Do the arithmetic before AOS - the pass is seven minutes long and the useful part is shorter than that.`,
  equipment: [
    '4m Ku-Band LEO Tracking Antenna',
    'Ku-Band RF Front End (13100 MHz LNB LO)',
    'Link Analysis Console',
    'QPSK 3/4 Receiver',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-2?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
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
            explanation: 'Right. The budget is arithmetic on known geometry and hardware; do it now so the pass is spent measuring, not calculating.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'open-link-analysis',
      nice: ['T0080', 'S0015'],
      title: 'Open the Link Analysis Console',
      description: 'The Link Analysis tab holds the acceptance worksheet. Open it and read the survey numbers before you start entering values.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Link Analysis Tab Open',
          params: { tab: 'link-budget' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'compute-link-budget',
      nice: ['T0080', 'S0015', 'K0740'],
      title: 'Predict the Downlink C/N',
      description: 'Fill the worksheet for MERIDIAN-SAR-1 at maximum elevation and press Compute. Survey numbers: satellite EIRP 28 dBm; slant range at max elevation 761 km (free-space path loss 171.4 dB at 11686 MHz); GW-01 receive gain 51.8 dBi; system noise temperature 88 K; occupied bandwidth 36 MHz; miscellaneous losses 1 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['open-link-analysis'],
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
      id: 'track-for-acceptance',
      nice: ['S0421', 'K1032'],
      title: 'Track MERIDIAN-SAR-1',
      description: 'AOS is at T+3.2 min. Put the antenna in program-track on MERIDIAN-SAR-1 so the measurement is taken on boresight, not on the shoulder of the beam.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['compute-link-budget'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
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
      id: 'commit-the-link',
      nice: ['T0080', 'K0740', 'S0015'],
      title: 'Measure and Commit the Link',
      description: 'With the receiver locked on the 1414 MHz downlink, return to Link Analysis and press Commit Link near maximum elevation (T+5 to T+8 min). Acceptance needs at least 2 dB of margin over the 6 dB demodulator threshold.',
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
      id: 'sign-the-test-card',
      nice: ['T0080', 'K0740'],
      title: 'Sign the Test Card',
      description: 'Record the acceptance result: does the measured link support the service, and why does the prediction matter if you measured it anyway?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['commit-the-link'],
      conditions: [
        {
          type: 'status-check',
          description: 'Acceptance Result Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Measured C/N came in within a decibel of prediction. Why does acceptance require the prediction at all?',
            options: [
              'Because a measurement that matches prediction proves the station is performing as designed - a good measurement from a broken model is luck, not acceptance.',
              'It does not. The measurement is the only thing that matters.',
              'Because the customer contract specifies a calculation, not a test.',
            ],
            correctIndex: 0,
            explanation: 'Exactly. Agreement between model and measurement is what lets you predict tomorrow\'s pass, and every pass after it. GW-01 is accepted.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
