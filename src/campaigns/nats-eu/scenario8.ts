import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 8 - "Night Passes" / Solo Evaluation (Phase 1 graduation)
 *
 * No new mechanics. Everything from S1-S7 in one unassisted shift: build a
 * valid two-station contact plan, complete a COMSEC rotation, prove the link
 * budget, command the bird inside its window, and decode the payload - with no
 * coaching quiz telling the operator what to do next.
 *
 * This is the campaign's only genuinely nocturnal shift, and it uses a real
 * night pass rather than a relabelled afternoon one. The scenario clock starts
 * 2027-03-16 00:28:00 UTC, which puts MERIDIAN-SAR-1's 40.4 deg pass at
 * AOS T+3.3 / LOS T+10.8 - a better pass than any in the phase so far:
 *
 *   measured peak C/N 13.38 dB at T+7.0 (581 km slant range at max elevation)
 *   C/N >= 8 dB for 234 s (T+5.1 .. T+9.0)
 *   correct worksheet at 169.1 dB FSPL -> 13.30 dB (expectedCNRDb 13.3)
 *
 * MERIDIAN-SAR-2 only manages a 5.6 deg graze during this shift, so it appears
 * in the contact plan (allocated to Shetland) but is not worked from Galway -
 * which is itself the lesson the plan exists to teach.
 *
 * All numbers measured through the real chain; see
 * test/campaigns/nats-eu-phase-b-validation.test.ts.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0081: Perform operational testing and evaluation
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K0874: Knowledge of cryptographic key management
 *   - K0689: Knowledge of network systems management
 *   - K0740: Knowledge of system performance indicators
 */
export const natsEuScenario8Data: ScenarioData = {
  id: 'nats-eu-scenario8',
  url: 'nats-eu/scenarios/nats-eu-scenario8',
  imageUrl: 'nats/8/card.png',
  number: 8,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario7'],
  title: 'Night Passes',
  subtitle: 'Solo Evaluation',
  duration: '25-30 min',
  missionType: 'Evaluation',
  description: `00:28 local. Charlie is at home. Fiona is on the Shetland console but she has her own passes to work and will not be watching yours.<br><br>This is the qualification shift for NATS Europe LEO operations: a contact plan to build across two sites, a COMSEC rotation that landed on your watch, an acceptance budget to prove, and a command that has to reach MERIDIAN-SAR-1 inside a seven-minute window.<br><br>Nobody is going to prompt you. Everything on this shift you have already done once.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker',
    'Contact Plan / Link Analysis / TT&C consoles',
    'Ku-Band BUC + HPA, QPSK 3/4 modems',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-16',
    scenarioStartWallTime: '00:28:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-8?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 3,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // The SAR-2 graze sits at T+150 min (windowStartS 9020). Sitting through
    // two and a half hours of empty sky is not the evaluation; working the
    // contact is. Mission-elapsed advances with the skip, so the commanding
    // window and the contact plan stay aligned with the sky.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 4,
    },

    // M3 - the night plan. SAR1-GW and SAR1-SH overlap, so the pair has to be
    // split across the sites exactly as in scenario 5.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'N-SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 40 deg pass)', priority: 1, windowStartS: 198, windowEndS: 648 },
        { id: 'N-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland horizon)', priority: 1, windowStartS: 320, windowEndS: 790 },
        { id: 'N-SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, low graze)', priority: 2, windowStartS: 9020, windowEndS: 9140 },
      ],
    },

    // M1 - acceptance budget for the night pass geometry (581 km at max el).
    linkBudget: {
      label: 'Night pass: MERIDIAN-SAR-1 downlink at max elevation',
      expectedCNRDb: 13.3,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 3,
    },

    // M5 - the rotation landed on the night shift, as they always do. Window is
    // the SAR-1 pass: AOS T+3.3 (198 s) .. LOS T+10.8 (648 s).
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 220,
      windowEndS: 630,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Take the Shift',
      description: 'Open the shift brief and take the console. Everything you need is in it; nobody will walk you through the rest.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'build-the-night-plan',
      nice: ['K0689', 'T0129'],
      title: 'Build the Night Contact Plan',
      description: 'Allocate every contact across GW-01 and SH-02 with no site double-booked. The plan must read VALID.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'night-key-rotation',
      nice: ['K0874', 'S0077'],
      title: 'Complete the COMSEC Rotation',
      description: 'The scheduled rotation is pending. Complete it before the pass or nothing you send will authenticate.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'key-rotation-completed',
          description: 'Key Rotation Completed',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'night-budget',
      nice: ['T0081', 'K0740'],
      title: 'Predict the Night Link',
      description: 'Compute the expected C/N for this pass. The geometry is better than the afternoon passes: 581 km at maximum elevation, free-space path loss 169.1 dB at 11686 MHz. EIRP 28 dBm, receive gain 51.8 dBi, system noise temperature 88 K, bandwidth 36 MHz, miscellaneous losses 1 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'link-budget-computed',
          description: 'Predicted C/N Matches Truth',
          params: {},
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'night-acquire',
      nice: ['S0421', 'K1032'],
      title: 'Work the Pass',
      description: 'AOS T+3.3 min. Program-track MERIDIAN-SAR-1, engage uplink Doppler compensation, and acquire the beacon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['build-the-night-plan', 'night-key-rotation', 'night-budget'],
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
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'night-decode-and-commit',
      nice: ['T0153', 'T0081', 'K0740'],
      title: 'Decode and Prove the Margin',
      description: 'Lock the 1414 MHz imagery downlink, then commit the link in Link Analysis with at least 3 dB of margin over the 6 dB threshold. The strong part of this pass runs T+5 to T+9.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['night-acquire'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 3 dB',
          params: { minMarginDb: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'night-command',
      nice: ['T1567', 'S0421'],
      title: 'Command the Bird',
      description: 'Modem on air first, then the HPA, then send REC-PLAYBACK and confirm the acknowledgement before LOS at T+10.8.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['night-acquire'],
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'command-acknowledged',
          description: 'REC-PLAYBACK Acknowledged',
          params: { commandId: 'REC-PLAYBACK' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'hand-over-the-shift',
      nice: ['T0081', 'K0645'],
      title: 'Hand Over the Shift',
      description: 'Close the shift log for the qualification.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['night-decode-and-commit', 'night-command'],
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Closed',
          params: {
            character: Character.SYSTEM,
            question: 'Pass worked, command acknowledged, margin proven, plan published. What carries over to the next operator?',
            options: [
              'The contact plan and the COMSEC state - the next shift inherits both, so both are part of the handover, not just the pass result.',
              'Nothing. Each shift starts clean.',
              'Only the recorded telemetry, which goes to the customer.',
            ],
            correctIndex: 0,
            explanation: 'Correct. Qualified for NATS Europe LEO operations. The network is yours to run.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
};
