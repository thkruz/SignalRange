import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 20: "Dual Outage"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 4 of 8)
 * Time Pressure: High - both sites degrading simultaneously
 * Calculation Required: NO - this is triage and parallel recovery
 * New Value: true multi-SITE prioritization (S16 was one site, many faults;
 *   S20 is two sites, unrelated root causes) plus the campaign's first
 *   explicit adversarial-awareness beat: "two at once - coincidence or
 *   attack?" answered with evidence, not vibes.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1144: Implement network backup and recovery procedures
 *   - S0671: Skill in implementing contingency and recovery plans
 *   - S0807: Skill in solving problems
 *
 * Supporting Codes:
 *   - T1538: Resolve customer-reported system incidents
 *   - S0593: Skill in handling incidents
 *   - T0531: Troubleshoot hardware/software interoperability problems
 *   - K0751: Knowledge of system threats
 *
 * Premise: A winter storm is icing VT-01's feed (the inherited failure: the
 * heater was left off ahead of the front) while ME-02 simultaneously throws an
 * HPA overdrive with an over-temperature alarm (back-off drifted to 1 dB).
 * Dana is 40 minutes out. The operator triages: start VT's slow recovery (one
 * switch - heater on), work ME's dangerous-but-deterministic fault end to end,
 * then verify both recoveries and document why simultaneity was coincidence.
 *
 * Triage logic taught: a slow recovery you can START costs nothing to start
 * first; a dangerous fast fault gets your full attention immediately after;
 * verification happens in the order recoveries complete.
 *
 * Sim notes:
 *   - VT-01: 'snow'/severe weather event from T=0; heater OFF (vermont
 *     default) so ice accumulates (~10 dB max, tau 720 s). Heater ON melts
 *     at 1 dB/min. Ice recovery checked via custom evaluator.
 *   - ME-02: HPA backOff 1 -> isOverdriven; temperature recomputed from
 *     output power each tick, so restoring back-off clears the thermal alarm
 *     deterministically. BUC stays unmuted throughout (RF-safety rule).
 */

/** Current ice accumulation (dB) on VT-01's feed, 99 if unavailable. */
const vt01Ice = (): number => {
  const w = window as unknown as {
    signalRange?: {
      simulationManager?: {
        groundStations?: Array<{
          state?: { id?: string };
          antennas?: Array<{ state?: { iceAccumulation_dB?: number } }>;
        }>;
      };
    };
  };
  const gs = w.signalRange?.simulationManager?.groundStations?.find(g => g.state?.id === 'VT-01');
  return gs?.antennas?.[0]?.state?.iceAccumulation_dB ?? 99;
};

export const scenario20Data: ScenarioData = {
  id: 'nats-scenario20',
  prerequisiteScenarioIds: ['nats-scenario19'],
  url: 'nats/scenarios/nats-scenario20',
  imageUrl: 'nats/20/card.png',
  number: 20,
  title: 'Dual Outage',
  subtitle: 'Concurrent Site Loss - Prioritized Recovery',
  duration: '35-45 min',
  difficulty: 'advanced',
  missionType: 'Incident Response',
  description: `Two boards lit at once. Vermont is in the front edge of a winter storm and the feed is icing - the heater that should have been running since last night is off, and the RX margin is bleeding toward the demod floor. Maine just threw an HPA overdrive with an over-temperature alarm stacked on top: the back-off walked all the way down to 1 dB.<br><br>Unrelated problems. Same shift. One operator. Dana is forty minutes out on bad roads, and James Okafor is already asking whether two stations failing at once is something worse than bad luck.<br><br>Triage them: the slow recovery you can start costs nothing to start first; the dangerous fault gets your full attention immediately after; and the question James asked deserves an answer built from evidence.`,
  equipment: [
    '9-meter C-band Antennas (both sites)',
    'RF Front Ends (both sites)',
    'Spectrum Analyzers',
    'RX/TX Modems',
    'Weather radar feed',
  ],
  timeLimitSeconds: 45 * 60,
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: storm overhead, heater OFF (the inherited failure), ice building
      {
        ...vermontGroundStation,
      },
      // ME-02: carrying TIDEMARK-2; HPA back-off drifted to 1 dB - overdriven
      // and over-temperature. BUC unmuted (traffic flowing).
      {
        id: 'ME-02',
        name: 'Maine Ground Station',
        isOperational: true,
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            isPowered: true,
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            polarization: -25 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526,
            targetAzimuth: 219.7 as Degrees,
            targetElevation: 26.3 as Degrees,
            targetPolarization: -25 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 1070e6 as Hertz,
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // The fault: back-off drifted to 1 dB. Overdriven, IMD elevated,
            // and the amplifier is cooking (temperature recomputes from
            // output power). Traffic still flowing - BUC unmuted.
            hpa: {
              backOff: 1,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            centerFrequency: 1070e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: 1e3 as Hertz,
            minAmplitude: -95 as dBm,
            maxAmplitude: -75 as dBm,
            scaleDbPerDiv: 10 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'TIDEMARK-2-Teleport',
                  noradId: 61526,
                  frequency: 1020e6 as IfFrequency, // TM-2 TP-2: 7000 - 5980
                },
              },
            ],
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1458 as MHz, // TM-2 downlink IF (5250 - 3792)
                bandwidth: 36 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite, ses10Satellite],
    weatherEvents: [
      {
        id: 'vermont-winter-storm',
        groundStationId: 'VT-01',
        type: 'snow',
        severity: 'severe',
        startTime: 0, // Already overhead at shift start
        duration: 3600, // Outlasts the scenario - the heater is the fix, not patience
        linkMarginDegradation: 10,
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-20?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Incident Brief',
      description: 'Open the brief. Two sites, two fault summaries, one triage table.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Take Command',
          params: {
            character: Character.SYSTEM,
            question: 'Two sites degrading at once and Dana is 40 minutes out. First move?',
            options: [
              'Read both boards before fixing either - triage is a decision about order, and order needs the whole picture',
              'Fix whichever site you happen to be looking at',
              'Wait for Dana - dual outages exceed solo authority',
              'Hand all traffic to whichever site is healthier',
            ],
            correctIndex: 0,
            explanation: 'The S16 rule scaled up: triage before action. Thirty seconds of reading both boards buys the order that costs the customers least.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 1: READ VERMONT, START THE SLOW RECOVERY
    // ============================================================
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Start with Vermont - the storm is the fault with momentum.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'vt-read-board',
      nice: ['T0153', 'K0741'],
      title: 'Read the Vermont Board',
      description: 'Dashboard: identify what the storm is doing and what should have prevented it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Vermont Diagnosis',
          params: {
            character: Character.SYSTEM,
            question: 'Ice is accumulating on the VT-01 feed during an active storm. What is the actual failure here?',
            options: [
              'The feed heater is OFF - it should have been running before the front arrived; ice is the consequence, the cold heater is the fault',
              'The storm itself - no operator action is relevant',
              'The antenna drive is frozen',
              'The LNB has failed in the cold',
            ],
            correctIndex: 0,
            explanation: 'Weather is not a fault; being unprepared for forecast weather is. The S3/S14 discipline - heater before the front - was missed on the previous shift, and now the recovery costs minutes instead of nothing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'vt-enable-heater',
      nice: ['S0671', 'S0421'],
      title: 'Start the Slow Recovery',
      description: 'Enable the feed heater NOW - one switch starts a recovery that runs while you work Maine.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-read-board'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'feed-heater-enabled',
          description: 'Feed Heater ON',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 2: READ MAINE, KILL THE DANGEROUS FAULT
    // ============================================================
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Vermont\'s recovery is running. Now the dangerous one.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['vt-enable-heater'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected',
          params: { groundStationId: 'ME-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-read-board',
      nice: ['T0153', 'T0531'],
      title: 'Read the Maine Board',
      description: 'Dashboard: confirm the HPA fault signature.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Maine Diagnosis',
          params: {
            character: Character.SYSTEM,
            question: 'ME-02 shows HPA overdrive and HPA over-temperature together. What is the relationship?',
            options: [
              'One fault, two symptoms: back-off at 1 dB drives the amplifier near saturation - IMD rises (overdrive alarm) and the output stage dissipates harder (thermal alarm). Fix the back-off and both clear',
              'Two independent HPA faults that must be worked separately',
              'The thermal alarm caused the back-off to drift',
              'Sensor error - an amplifier cannot be hot and overdriven at once',
            ],
            correctIndex: 0,
            explanation: 'S13\'s lesson in an HPA jacket: trace symptoms to the single input that explains them all. Back-off is the input; heat and IMD are the outputs.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'coincidence-quiz',
      nice: ['K0751', 'S0807'],
      title: 'Coincidence or Attack?',
      description: 'James asked the question. Set the posture before you finish the fixes.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-read-board'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Adversarial Posture',
          params: {
            character: Character.SYSTEM,
            question: 'Two sites degrading simultaneously. How do you treat the "is this an attack?" question right now?',
            options: [
              'Hold it open and collect the rule-out evidence as you work: independent causes that each fully explain their own site, no unexplained RF on either spectrum. Answer it with evidence after the fixes, not with a shrug before them',
              'Dismiss it - storms and config drift happen all the time',
              'Assume attack and disconnect both stations from the network',
              'It cannot be answered at the operator level',
            ],
            correctIndex: 0,
            explanation: 'Simultaneity is what coordinated interference would look like - and what a Friday in January looks like. The discipline is neither paranoia nor dismissal: keep the question open exactly as long as the evidence takes.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'triage-order-quiz',
      nice: ['S0807', 'S0671'],
      title: 'Defend the Order',
      description: 'You started Vermont\'s heater before coming here. Make the triage logic explicit.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['coincidence-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Triage Logic',
          params: {
            character: Character.SYSTEM,
            question: 'Why was "flip VT\'s heater, then work ME\'s HPA end-to-end" the right order?',
            options: [
              'VT\'s recovery is slow but starts with one switch - starting it first costs ME nothing. ME\'s fault is actively dangerous (spectrum pollution + amplifier stress) and deterministic to fix, so it gets full attention immediately after',
              'Vermont is the primary station and always comes first',
              'Alphabetical order by station identifier',
              'The HPA fault could have waited - the order was arbitrary',
            ],
            correctIndex: 0,
            explanation: 'Triage is about clock management: start what runs unattended, then serialize your attention on what needs it. Ten seconds at VT bought minutes of parallel recovery.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'me-disable-hpa',
      nice: ['S0593', 'S0677'],
      title: 'Take the Dirty Uplink Down',
      description: 'Disable the HPA output - the overdriven signal comes off the air first.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['triage-order-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'me-restore-backoff',
      nice: ['S0677', 'T1567'],
      title: 'Restore the Back-off',
      description: 'Set HPA back-off to the 10 dB operating margin while the output is safely down.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-disable-hpa'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-back-off-set',
          description: 'Back-off at 10 dB',
          params: {
            backOff: 10,
            backOffTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'me-reenable-hpa',
      nice: ['S0677', 'T1567'],
      title: 'Bring Maine Back Clean',
      description: 'Re-enable the HPA output. The BUC stayed unmuted throughout - drive was never the problem.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-restore-backoff'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Operating Linearly',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'me-verify-quiz',
      nice: ['T0531', 'K0740'],
      title: 'Confirm Both Symptoms Cleared',
      description: 'Verify the single-input diagnosis held: back-off restored, both alarms gone.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-reenable-hpa'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Maine Verification',
          params: {
            character: Character.SYSTEM,
            question: 'Back-off is at 10 dB and the output is re-enabled. What does the thermal alarm do, and why?',
            options: [
              'It clears on its own - output power dropped ~9 dB, so the output stage dissipates a fraction of the heat; the temperature falls with the dissipation that caused it',
              'It stays latched until maintenance resets it physically',
              'It clears only after the BUC is power-cycled',
              'It stays on as a 24-hour cooldown precaution',
            ],
            correctIndex: 0,
            explanation: 'Confirmation that the diagnosis was right: one input (back-off), two symptoms, both gone. If the thermal alarm had stayed up, the single-fault story would be wrong - and you would start looking for the second fault.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: VERIFY VERMONT'S RECOVERY
    // ============================================================
    {
      id: 'return-to-vermont',
      nice: ['S0421'],
      title: 'Back to Vermont',
      description: 'Maine is clean. Check on the recovery you started fifteen minutes ago.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['me-verify-quiz'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'vt-verify-recovery',
      nice: ['S0671', 'T0153'],
      title: 'Verify the Melt',
      description: 'Confirm the heater is winning: ice below 2 dB and the receiver healthy again.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-to-vermont'],
      timeLimitSeconds: 8 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'feed-heater-enabled',
          description: 'Heater Still Running',
          mustMaintain: true,
        },
        {
          type: 'custom',
          description: 'Ice Melted Below 2 dB',
          params: {
            evaluator: () => vt01Ice() < 2,
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Recovered (≥ 9 dB)',
          params: { minCNRatio: 9 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'storm-steady-state-quiz',
      nice: ['S0671', 'K0689'],
      title: 'Steady State in the Storm',
      description: 'The storm has not stopped. Define the posture for the rest of it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-verify-recovery'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Storm Posture',
          params: {
            character: Character.SYSTEM,
            question: 'The front is still overhead. What keeps Vermont healthy for the rest of it?',
            options: [
              'Nothing new - the heater holds ice at bay as fast as it forms; the steady state is heater ON plus periodic margin checks until the front clears',
              'Repeating the melt cycle every thirty minutes',
              'A precautionary handover of TM-1 to Maine',
              'Raising LNB gain to compensate for the storm',
            ],
            correctIndex: 0,
            explanation: 'The S14 lesson holds: with the right protections running, weather is something you monitor, not something you fight. The failure this morning was a cold heater, not a strong storm.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: CUSTOMER, EVIDENCE, LOG
    // ============================================================
    {
      id: 'james-comms-quiz',
      nice: ['T1538', 'S0478'],
      title: 'Call James Back',
      description: 'He asked two questions an hour ago: what happened, and should he be worried.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['storm-steady-state-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Callback',
          params: {
            character: Character.SYSTEM,
            question: 'What does James get?',
            options: [
              'Both trunks restored: Vermont was storm icing (heater now running, holding), Maine was an amplifier config fault (corrected, verified). Causes independent and fully explained - the simultaneity was coincidence, and here is why we are confident.',
              'Everything is fixed. Bad luck, like I said.',
              'Technical incident report attached, 14 pages, conclusions on page 11.',
              'Still investigating, will update within 24 hours.',
            ],
            correctIndex: 0,
            explanation: 'Cause, action, status for each site - then the answer to the question he actually asked, with the reasoning shown. "Here is why we are confident" is what makes "coincidence" a finding instead of a hope.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'adversarial-ruleout-quiz',
      nice: ['K0751', 'S0807'],
      title: 'Close the Question Honestly',
      description: 'Write the rule-out into the record - the evidence, not the conclusion.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['james-comms-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Rule-Out',
          params: {
            character: Character.SYSTEM,
            question: 'Which evidence set closes the "coincidence or attack" question?',
            options: [
              'VT degradation tracked the storm exactly (radar + precip sensor agree, heater-on fixed it); ME fault was a config value with mundane history; no unexplained signals on either spectrum; both recoveries behaved as their diagnoses predicted',
              'Both faults were fixed, therefore neither was an attack',
              'No attacker would target a teleport in Vermont',
              'The question cannot be closed without a federal investigation',
            ],
            correctIndex: 0,
            explanation: 'Each cause independently explains its own site, the fixes behaved as predicted, and the spectra are clean. Document it every time it IS coincidence - that record is what makes you credible the day it is not.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'log-dual-outage',
      nice: ['K0645', 'T1144'],
      title: 'Log the Dual Recovery',
      description: 'One entry, two sites, full timeline.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['adversarial-ruleout-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Incident Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry records this incident correctly?',
            options: [
              'Concurrent site degradation 0712: VT-01 feed icing (heater off ahead of front - corrected 0716, melt verified) | ME-02 HPA back-off drift to 1 dB (output disabled, 10 dB restored, re-enabled clean by 0734). Causes independent - rule-out documented. Customers notified. Heater discipline flagged for shift-change checklist.',
              'Both stations had problems this morning. Fixed.',
              'Weather event at VT-01. See separate ME-02 ticket.',
              'Dual outage resolved - details available on request.',
            ],
            correctIndex: 0,
            explanation: 'Timeline, both causes, both fixes, the rule-out, and the process fix (heater on the shift-change checklist) so the inherited failure stops being inheritable.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Call from Dana at 07:09 - road noise]</em>
      </p>
      <p>
        "Two boards lit at once. Vermont's icing - the heater's been off since last night, don't ask - and Maine just threw an HPA overdrive with a temperature alarm on top. I'm forty minutes out on bad roads. Triage them: SLA exposure first, recovery time second. Don't give me hero sequencing - give me the order that costs the customers least."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/20/intro.mp3'),
    },
    objectives: {
      'vt-enable-heater': {
        text: `
        <p>
          Seeing margin alerts on both our trunks at once. Two stations at the same time - should I be worried this is something other than bad luck? Call me when you know. Not when it's fixed - when you KNOW.
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/20/obj-vt-enable-heater.mp3'),
      },
      'me-verify-quiz': {
        text: `
        <p>
          Just passed the county line - catching up on the log. Heater running at Vermont, Maine's amp back in its lane, and you kept the BUC out of it. Right order, right reasons. Finish the verification and get James his answer.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/20/obj-me-verify-quiz.mp3'),
      },
      'adversarial-ruleout-quiz': {
        text: `
        <p>
          Appreciate the callback - and the homework behind it. "Here's why we're confident" lands a lot better with my board than "trust us." Both trunks look clean from our side. We're good.
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/20/obj-adversarial-ruleout-quiz.mp3'),
      },
      'log-dual-outage': {
        text: `
        <p>
          Walking in now - and the incident's already closed with the process fix in the log. Two sites, one operator, zero customer drama. That's the qualification I actually care about.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/20/obj-log-dual-outage.mp3'),
      },
    },
  },
};
