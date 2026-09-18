import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
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
  const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
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
  equipment: ['9-meter C-band Antennas (both sites)', 'RF Front Ends (both sites)', 'Spectrum Analyzers', 'RX/TX Modems', 'Weather radar feed'],
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
              'Fix the board in front of you first - a live fault beats a plan, and the second site waits its turn',
              'Call Dana before touching either site - dual outages exceed solo authority, and the order is hers to set, not yours',
              'Hand all traffic to the healthier site first - customers see one clean trunk, and the diagnosis can wait',
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
              'The feed heater is OFF - it should have been running before the front; ice is the consequence, the cold heater is the fault',
              'The storm itself - no heater outruns an active front; ice is the fault, and no operator action changes it',
              'The antenna drive is frozen - the axes stalled when the front hit; ice is the symptom, the seized motor is the fault',
              'The LNB has failed in the cold - its noise figure collapsed with the temperature; ice is a bystander, the receiver is the fault',
            ],
            correctIndex: 0,
            explanation:
              'Weather is not a fault; being unprepared for forecast weather is. The S3/S14 discipline - heater before the front - was missed on the previous shift, and now the recovery costs minutes instead of nothing.',
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
      description: "Vermont's recovery is running. Now the dangerous one.",
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
              'One fault, two symptoms: 1 dB back-off drives the HPA near saturation - IMD rises (overdrive) and dissipation climbs (thermal)',
              'Two faults, two symptoms: a drive-level fault pushes the HPA into IMD (overdrive) and a cooling fault lets it run hot (thermal)',
              'One fault, two symptoms: the output stage overheated first - gain drifted up with temperature (overdrive) and stayed hot (thermal)',
              'No fault, two readings: a failed sensor board reports both - an HPA cannot be saturated (overdrive) and hot (thermal) at once',
            ],
            correctIndex: 0,
            explanation:
              "S13's lesson in an HPA jacket: trace symptoms to the single input that explains them all. Back-off is the input; heat and IMD are the outputs. Fix the back-off and both clear.",
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
              'Hold it open and collect rule-out evidence as you work: independent causes for each site, no unexplained RF on either spectrum',
              'Dismiss it and work the faults: storms and config drift happen every week, and simultaneity on its own proves nothing',
              'Assume attack and isolate both stations: disconnect the network links, hold the uplinks down, and wait for a security review',
              'Park it and finish the fixes: attribution is above the operator level, so the question goes to Dana with the incident report',
            ],
            correctIndex: 0,
            explanation:
              'Simultaneity is what coordinated interference would look like - and what a Friday in January looks like. The discipline is neither paranoia nor dismissal: keep the question open exactly as long as the evidence takes. Answer it with evidence after the fixes, not with a shrug before them.',
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
      description: "You started Vermont's heater before coming here. Make the triage logic explicit.",
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
              "VT's fix is one switch that runs unattended; ME's fault is dangerous (spectrum pollution + HPA stress) and needs full attention",
              "VT is the primary station and always comes first; ME's fault is a config value (back-off drift) and can wait for the second pass",
              "VT comes first alphabetically by station identifier; ME's fault is the same size (one alarm pair) and the order was arbitrary",
              "VT's ice is the customer-visible fault; ME's HPA was still passing traffic (carrier locked) and could have waited for Dana",
            ],
            correctIndex: 0,
            explanation:
              "Triage is about clock management: start what runs unattended, then serialize your attention on what needs it. Ten seconds at VT bought minutes of parallel recovery. ME's fault is also deterministic to fix, which is why it gets full attention immediately after.",
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
              'It clears on its own - output power dropped ~9 dB, so the output stage dissipates a fraction of the heat and cools',
              'It stays latched - the over-temperature flag is a hardware latch, so maintenance has to reset it physically on site',
              'It clears only after a power cycle - the BUC and HPA share the alarm bus, so the fault holds until both restart',
              'It stays on for 24 hours - the thermal alarm runs a cooldown timer, so the output stage is protected until it expires',
            ],
            correctIndex: 0,
            explanation:
              'Confirmation that the diagnosis was right: one input (back-off), two symptoms, both gone. The temperature falls with the dissipation that caused it. If the thermal alarm had stayed up, the single-fault story would be wrong - and you would start looking for the second fault.',
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
              'Nothing new - the heater holds ice at bay as fast as it forms; heater ON plus periodic margin checks until the front clears',
              'A melt cycle every thirty minutes - the heater cannot run continuously; heater cycled OFF and ON until the front clears',
              'A precautionary handover to Maine - the heater only slows the ice; TM-1 moved to ME-02 until the front clears',
              'Raising LNB gain to cover the loss - the heater holds but margin sags; gain stepped up until the front clears',
            ],
            correctIndex: 0,
            explanation:
              'The S14 lesson holds: with the right protections running, weather is something you monitor, not something you fight. The failure this morning was a cold heater, not a strong storm.',
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
              'Both trunks up: Vermont was storm icing (heater on), Maine an amplifier config fault (fixed) - coincidence, and here is why',
              'Both trunks up: Vermont was the storm (bad luck), Maine a config drift (fixed) - like I said, nothing to worry about',
              'Both trunks up: full incident report attached (14 pages), conclusions on page 11 (both sites) - call back after you read it',
              'Both trunks up: Vermont was storm icing (heater on), Maine an amplifier fault (fixed) - still investigating, update in 24 hours',
            ],
            correctIndex: 0,
            explanation:
              'Cause, action, status for each site - then the answer to the question he actually asked, with the reasoning shown. "Here is why we are confident" is what makes "coincidence" a finding instead of a hope. A 14-page attachment is not an answer, and "still investigating" after the rule-out is done leaves him worried for nothing.',
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
      title: 'Close the Question Cleanly',
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
              'VT tracked the storm (radar + precip agree, heater fixed it); ME was a config value with mundane history; both spectra clean',
              'VT and ME were both fixed (heater on, back-off restored); a fixed fault is a benign fault; no attack survives its own repair',
              'VT is a rural teleport (no strategic customer); ME carries the same traffic; nobody targets either, so the question closes itself',
              'VT and ME failed within minutes (0712 both); simultaneity needs a federal investigation; the operator cannot close it',
            ],
            correctIndex: 0,
            explanation:
              'Each cause independently explains its own site, the fixes behaved as predicted, and the spectra are clean. Document it every time it IS coincidence - that record is what makes you credible the day it is not. "Fixed" alone proves nothing, and "nobody would bother" is not evidence.',
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
              'Dual degradation 0712: VT-01 icing (heater on 0716, melted) | ME-02 HPA back-off 1 dB (10 dB restored 0734); causes independent',
              'Dual degradation 0712: VT-01 weather event (storm, no action) | ME-02 HPA fault (see separate ticket); both resolved by 0734',
              'Dual degradation 0712: VT-01 icing (heater on 0716, melted) | ME-02 HPA back-off 1 dB (10 dB restored 0734); details on request',
              'Dual degradation 0712: VT-01 icing (storm, heater on) | ME-02 HPA fault (fixed); both stations had problems, both fixed by 0734',
            ],
            correctIndex: 0,
            explanation:
              'Timeline, both causes, both fixes, the rule-out, and the process fix (heater on the shift-change checklist) so the inherited failure stops being inheritable. In full: heater off ahead of the front, corrected 0716 and melt verified; output disabled, 10 dB restored, re-enabled clean by 0734; customers notified; heater discipline flagged for the shift-change checklist.',
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
          Appreciate the callback - and the homework behind it. "Here's why we're confident" goes over a lot better with my board than "trust us." Both trunks look clean from our side. We're good.
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
