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
import { createTidemark1Satellite, ses10Satellite, tidemark2Satellite } from './satellites';

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
 * HPA overdrive with the amplifier running hot (back-off drifted to 1 dB).
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
 *     at 1 dB/min. Starts with 2.5 dB already on the feed (the front came
 *     overnight). Ice recovery checked via custom evaluator.
 *   - Phase 27 (stand-ins gone): the TM-1 carrier VT-01 receives is its own
 *     uplink, so feed ice costs both directions (uplink EIRP, downlink loss
 *     and the lossy ice's noise). Headless run 2026-10-07: 2.7 dB of ice ->
 *     C/N 5.0 (locked, 0.8 dB margin); 3.7 dB -> 3.8 (unlocked); 1.7 dB ->
 *     7.4; melted, under the snow, 12.5-13.5 dB.
 *   - ME-02: HPA backOff 1 -> 59 dBm (794 W), isOverdriven, IM3 ~-25 dBc,
 *     case temperature ~62 degC (about 44 degC at 10 dB). The HPA
 *     over-temperature alarm is > 85 degC, which a healthy amplifier never
 *     reaches, so the thermal symptom is the temperature readout, not an
 *     alarm. Restoring back-off drops it with a 2 min time constant
 *     (62 -> ~50 degC in 2 min). BUC stays unmuted throughout (RF-safety rule).
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
  description: `Two boards lit at once. Vermont is at the front edge of a winter storm and the feed is icing, because the heater that should have been running since last night is off, and the receive margin is shrinking toward the point where the receiver loses lock. Maine just threw an HPA overdrive, and the amplifier is running hot on top of it, because the back-off has walked all the way down to 1 dB.<br><br>The two problems are unrelated, but they hit the same shift, and you're the only operator on it. Dana is forty minutes out on bad roads, and James Okafor is already asking whether two stations failing at once is something worse than bad luck.<br><br>Triage them. Start the slow recovery first, because it costs nothing to start. Give the dangerous fault your full attention right after that. Then answer James's question with evidence.`,
  equipment: ['9-meter C-band Antennas (both sites)', 'RF Front Ends (both sites)', 'Spectrum Analyzers', 'RX/TX Modems', 'Weather radar feed'],
  timeLimitSeconds: 45 * 60,
  settings: {
    isSync: true,
    // Brief: Friday 0712 local; the log quiz's 0712 / ~0715 / ~0720 follow this clock
    scenarioStartDate: '2026-03-06',
    scenarioStartWallTime: '07:12:00',
    groundStations: [
      // VT-01: storm overhead, heater OFF (the inherited failure), ice building.
      // The front arrived overnight: 2.5 dB of ice is already on the feed, the
      // TM-1 carrier about 5 dB C/N and a dB above the lock point, still
      // locked. Unheated, the ice grows ~0.6 dB/min, so the carrier drops
      // lock about a minute in: "bleeding toward the demod floor" is real.
      // With 6 dB (before phase 27) the own-uplink link was already unlocked
      // at load. The melt back to a healthy C/N takes 2-4 min of heater.
      {
        ...vermontGroundStation,
        antennasState: [{ ...vermontGroundStation.antennasState[0], iceAccumulation_dB: 2.5 }],
      },
      // ME-02: carrying TIDEMARK-2; HPA back-off drifted to 1 dB - overdriven
      // and running hot (~62 degC). BUC unmuted (traffic flowing).
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
            azimuth: 146.96 as Degrees, // Maine sees TM-2 (45 W) here, not at Vermont's 143.3 / 31.8 (Phase 28 D4)
            elevation: 32.42 as Degrees,
            // polarization: derived from geometry (Phase 29 D8, geoPolarizationSkewDeg; about +22.6 deg TM-2 at ME-02)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526,
            targetAzimuth: 146.96 as Degrees,
            targetElevation: 32.42 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 4180e6 as Hertz, // TIDEMARK-2 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // The fault: back-off drifted to 1 dB. Overdriven (59 dBm, 794 W),
            // IM3 ~-25 dBc, and the amplifier runs hot (~62 degC vs ~44 at
            // 10 dB back-off). Traffic still flowing - BUC unmuted.
            hpa: {
              backOff: 1,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
            centerFrequency: 1070e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
            // Phase 27: the TIDEMARK beacon reads -54 to -59 dBm at the RX IF tap
            // (ledger), the floor ~-114 dBm in 3 Hz: both on screen, 10 dB/div
            minAmplitude: -140 as dBm,
            maxAmplitude: -40 as dBm,
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
                  frequency: 983e6 as IfFrequency, // TM-2 TP-1: 7000 - 6017
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
    // TIDEMARK-1 fades +/-1 dB here (the roster default is 0.3 dB, Phase 30):
    // VT-01's clear-sky margin sits at 1.4-2.1 dB, so the wider fade swings it
    // about 0.8-2.8 dB over tens of seconds and the "Degraded margin" warning
    // comes and goes, as the brief says.
    satellites: [createTidemark1Satellite({ powerVariationRange: 1.0 as dBm }), tidemark2Satellite, ses10Satellite],
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
      description: 'Open the incident brief. It covers both sites, a summary of each fault and a table for the triage order.',
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
            question: "Two sites are degrading at once and Dana is 40 minutes out. What's your first move?",
            options: [
              'Read both boards before fixing either, because the order depends on the whole picture',
              'Fix the board in front of you first, because a live fault beats a plan and the second site can wait',
              'Call Dana before touching either site, because a dual outage is beyond solo authority and the order is hers to set',
              'Hand all traffic to the healthier site first, because customers see one clean trunk and the diagnosis can wait',
            ],
            correctIndex: 0,
            explanation:
              'This is the cascade rule scaled up to two sites: triage before you act. Thirty seconds spent reading both boards gives you the order that costs the customers least, while fixing the first board you see could leave the worse fault waiting.',
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
      description: 'Select VT-01 first. The storm is the fault that keeps getting worse, so it comes first.',
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
      // The weather readouts (precipitation, ice, feed heater) live on ACU
      // Control, not the Dashboard (nats-s20-F3)
      description: 'On ACU Control, read the precipitation and ice accumulation, then find what should have prevented the ice.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
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
          type: 'status-check',
          description: 'Vermont Diagnosis',
          params: {
            character: Character.SYSTEM,
            question: "Precipitation is ACTIVE and ice is starting to build on the VT-01 feed. What's the actual failure here?",
            options: [
              'The feed heater is off, and it should have been running before the front arrived',
              'The storm itself, because no heater can outrun an active front and no operator action changes that',
              'The antenna drive is frozen, because the axes stalled when the front hit',
              'The LNB has failed in the cold, because its noise figure collapsed with the temperature',
            ],
            correctIndex: 0,
            explanation:
              "Weather isn't a fault, but being unprepared for forecast weather is. The standing station discipline is to turn the heater on before the front, and the previous shift missed it, so the recovery now costs minutes instead of nothing.",
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
      description:
        'Turn on the feed heater on ACU Control right now. One switch starts a recovery that runs by itself while you work Maine. This objective is timed, and running out of time fails the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-read-board'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      // The priority call: the zero-cost slow fix starts first, or not at all
      timeoutFails: true,
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
      description: "Vermont's recovery is running, so switch to ME-02. That's the dangerous fault.",
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
      description: 'On the Dashboard, confirm the HPA fault signature: the overdrive alarm and the HPA temperature.',
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
            question: 'ME-02 shows an HPA overdrive alarm, and the HPA panel reads about 62°C where it normally sits near 44°C. How are the two related?',
            options: [
              'One fault: 1 dB back-off pushes the HPA near saturation, raising IMD (overdrive) and heat dissipation (thermal)',
              'Two faults: a drive-level fault causes IMD (overdrive) and a separate cooling fault lets the amplifier run hot (thermal)',
              'One fault: the output stage overheated first, so gain drifted up (overdrive) and stayed hot (thermal)',
              "No fault: a failed sensor board reports both, because an HPA can't be saturated and hot at once",
            ],
            correctIndex: 0,
            explanation:
              'This is the thermal-anomaly lesson again: trace the symptoms back to the single input that explains them all. Back-off is the input, and heat and IMD are the outputs. At 1 dB back-off the HPA puts out 59 dBm (794 W) instead of 50 dBm (100 W) at 10 dB, and the IM3 (2-tone) readout sits near -25 dBc instead of -43. Fix the back-off and both symptoms clear.',
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
      description: "James asked whether this is an attack. Decide how you'll treat that question before you finish the fixes.",
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
            question: 'Two sites are degrading at the same time. How do you treat the "is this an attack?" question right now?',
            options: [
              'Hold it open and collect rule-out evidence as you work: independent causes at each site, no unexplained RF on either spectrum',
              'Dismiss it and work the faults, because storms and config drift happen every week and simultaneity alone proves nothing',
              'Assume an attack and isolate both stations: disconnect the network links, hold the uplinks down and wait for a security review',
              'Park it and finish the fixes, because attribution is above the operator level and the question goes to Dana with the report',
            ],
            correctIndex: 0,
            explanation:
              "Simultaneity is what coordinated interference would look like, and it's also what an ordinary Friday in March looks like. The right posture is neither paranoia nor dismissal: keep the question open for as long as the evidence takes. Answer it with evidence after the fixes, not with a shrug before them.",
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
      description: "You started Vermont's heater before coming to Maine. Now say why that order was right.",
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
            question: 'Why was "turn on VT\'s heater, then work ME\'s HPA from start to finish" the right order?',
            options: [
              "VT's fix is one switch that runs unattended, while ME's fault is dangerous and needs your full attention",
              "VT is the primary station and always comes first, and ME's fault is only a config value that could wait for the second pass",
              "VT comes first alphabetically by station ID, and ME's fault is no bigger than VT's, so the order was arbitrary",
              "VT's ice is the customer-visible fault, and ME's HPA was still passing traffic, so it could have waited for Dana",
            ],
            correctIndex: 0,
            explanation:
              "Triage is clock management: start what runs unattended, then give your full attention to what needs it. The few seconds you spent at VT bought minutes of parallel recovery. ME's fault is also predictable to fix, because restoring the back-off clears both symptoms, which is why it gets your full attention right after.",
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
      description: 'On TX Chain, disable the HPA output so the overdriven signal comes off the air first. This objective is timed, and running out of time fails the shift.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['triage-order-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      // IMD into adjacent transponders and a cooking amplifier: the
      // dangerous fault cannot wait
      timeoutFails: true,
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
      description: 'Re-enable the HPA output. The BUC stayed unmuted the whole time, because the drive level was never the problem.',
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
      description: 'Check that the single-input diagnosis held: back-off restored, overdrive alarm gone and HPA temperature falling.',
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
            question: 'Back-off is at 10 dB and the output is re-enabled. What does the HPA temperature do, and why?',
            options: [
              'It falls on its own, because output power dropped about 9 dB and the stage dissipates far less heat',
              'It stays latched, because a hardware latch holds the reading until maintenance resets it on site',
              'It falls only after a power cycle, because the BUC and HPA share a sensor bus and both must restart',
              'It stays high for 24 hours, because the thermal protection runs a cooldown timer that has to expire first',
            ],
            correctIndex: 0,
            explanation:
              "This confirms the diagnosis was right: one input (back-off), two symptoms, and both are gone. The temperature falls along with the dissipation that caused it, toward about 44°C over a few minutes (the time constant is 2 minutes). If it had stayed high, the single-fault story would be wrong and you'd start looking for a second fault.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    {
      // Rule-out evidence the brief promises: no unexplained RF (nats-s20-F8)
      id: 'me-spectrum-check',
      nice: ['K0751', 'T0153'],
      title: 'Sweep the Maine Spectrum',
      description:
        "On RX Analysis, center ME-02's analyzer on the TM-2 carrier (1458 MHz IF) with a span of about 50 MHz, and look for any signal that isn't ours. This is rule-out evidence for James.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer at 1458 MHz IF',
          params: { centerFrequency: 1458e6, centerFrequencyTolerance: 2e6 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span About 50 MHz',
          params: { span: 50e6, spanTolerance: 15e6, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
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
      description: 'Maine is clean. Switch back to VT-01 and check on the recovery you started at the top of the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['me-spectrum-check'],
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
      description: 'Confirm the heater is winning: ice below 2 dB, and the receiver locked with C/N back above 10 dB for 10 s. A melted feed under the snow reads about 12-13 dB.',
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
          // r2-s20-F1: measured post-melt C/N under the snow is 12.5-13.5 dB
          // (headless, 2026-10-07); 10 dB held 10 s is the melted feed, not
          // a passing frame on the way down from the ice
          type: 'receiver-snr-threshold',
          description: 'C/N Recovered (≥ 10 dB, held 10 s)',
          params: { minCNRatio: 10, cnHoldSeconds: 10 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'vt-spectrum-check',
      nice: ['K0751', 'T0153'],
      title: 'Sweep the Vermont Spectrum',
      description: "On RX Analysis, center VT-01's analyzer on the TM-1 carrier (1532 MHz IF) with a span of about 50 MHz, and look for any signal that isn't ours.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-verify-recovery'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer at 1532 MHz IF',
          params: { centerFrequency: 1532e6, centerFrequencyTolerance: 2e6 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span About 50 MHz',
          params: { span: 50e6, spanTolerance: 15e6, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'spectra-read-quiz',
      nice: ['K0751', 'S0807'],
      title: 'What the Spectra Showed',
      description: 'Record what the two sweeps showed. This is the RF half of the rule-out.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-spectrum-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Spectrum Evidence',
          params: {
            character: Character.SYSTEM,
            question: 'You swept both carriers at about 50 MHz span. What did the two analyzers show?',
            options: [
              'One carrier at each site where the plan puts it (1458 at ME-02, 1532 at VT-01), and nothing else in either passband',
              'A narrow unexplained carrier beside ours at each site, at the same offset, which points at a common source',
              'Our carriers missing at both sites, with only the noise floor across the passband, so the satellites have stopped relaying',
              'Our carrier at ME-02 only, with the VT-01 passband empty under the ice, so the rule-out can only cover Maine for now',
            ],
            correctIndex: 0,
            explanation:
              "Two clean passbands, each holding exactly the carrier the plan says should be there. A jammer or a rogue uplink shows up as energy the plan can't explain, and there was none. That line goes into the rule-out next to the storm radar and the back-off history.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'storm-steady-state-quiz',
      nice: ['S0671', 'K0689'],
      title: 'Steady State in the Storm',
      description: "The storm hasn't stopped. Decide what keeps Vermont healthy for the rest of it.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['spectra-read-quiz'],
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
              'Nothing new: the heater holds ice off as fast as it forms, so leave it on and check margin until the front clears',
              "A melt cycle every thirty minutes: the heater can't run continuously, so cycle it off and on until the front clears",
              'A precautionary handover to Maine: the heater only slows the ice, so move TM-1 to ME-02 until the front clears',
              'More LNB gain: the heater holds but margin sags, so step the gain up to cover the loss until the front clears',
            ],
            correctIndex: 0,
            explanation:
              'The rain-fade lesson holds: with the right protections running, weather is something you monitor, not something you fight. The failure this morning was a cold heater, not a strong storm.',
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
      description: 'James asked two questions at the top of the shift: what happened, and whether he should be worried.',
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
            question: 'What do you tell James when you call him back?',
            options: [
              "Both trunks are up. Vermont was storm icing (heater on), Maine was an amplifier config fault (fixed). It was coincidence, and here's why",
              "Both trunks are up. Vermont was the storm (bad luck), Maine was config drift (fixed), and like I said, there's nothing to worry about",
              "Both trunks are up. The full incident report is attached (14 pages, conclusions on page 11), so call back after you've read it",
              "Both trunks are up. Vermont was storm icing (heater on), Maine was an amplifier fault (fixed), and we're still investigating, with an update in 24 hours",
            ],
            correctIndex: 0,
            explanation:
              'A good callback gives the cause, the action and the status for each site, then answers the question he actually asked and shows the reasoning. Showing the reasoning is what makes "coincidence" a finding instead of a hope. A bare "nothing to worry about" gives him nothing to take to his board, a 14-page attachment isn\'t an answer, and "still investigating" after the rule-out is done leaves him worried for nothing.',
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
      description: 'Write the rule-out into the record: the evidence, not just the conclusion.',
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
              'VT tracked the storm (radar and precipitation agree, heater fixed it), ME was a config value with a mundane history, both spectra clean',
              'VT and ME were both fixed (heater on, back-off restored), and a fixed fault is a benign fault, so no attack survives its own repair',
              'VT is a rural teleport with no strategic customer, and ME carries the same traffic, so nobody targets either and the question closes itself',
              "VT and ME failed within minutes of each other (0712 at both), and simultaneity needs a federal investigation that the operator can't close",
            ],
            correctIndex: 0,
            explanation:
              'Each cause independently explains its own site, the fixes behaved as predicted, and the spectra are clean. Document it every time it\'s coincidence, because that record is what makes you credible the day it isn\'t. "Fixed" alone proves nothing, and "nobody would bother" isn\'t evidence.',
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
      description: 'Write one log entry that covers both sites and the full timeline.',
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
              'Dual degradation 0712: VT-01 icing (heater on, melted) | ME-02 HPA back-off 1 dB (10 dB restored); causes independent; process fix: heater on shift-change checklist',
              'Dual degradation 0712: VT-01 weather event (storm, no action taken) | ME-02 HPA fault (see separate ticket); both resolved; no further action needed, no process change to log',
              'Dual degradation 0712: VT-01 icing (heater on, melted) | ME-02 HPA back-off 1 dB (10 dB restored); causes independent; further details on request from the shift lead',
              'Dual degradation 0712: VT-01 icing (storm, heater on) | ME-02 HPA fault (fixed); both stations had problems and both were fixed; incident closed, no follow-up needed',
            ],
            correctIndex: 0,
            explanation:
              "This entry has the start time, both causes, both fixes, the rule-out (causes independent) and the process fix (heater on the shift-change checklist), so the next shift can't inherit the same failure. The others leave out a cause, push the details somewhere else or drop the process fix. When you write the full entry later, add the fix times from the Ops Log, the clean sweeps of both spectra and the customer notifications.",
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
        <em>[Call from Dana at 07:12 - road noise]</em>
      </p>
      <p>
        "Two boards lit at once. Vermont's feed is icing because the heater's been off since last night, and don't ask. Maine just threw an HPA overdrive, with the amplifier running hot on top of it. I'm forty minutes out on bad roads, so you're triaging both. Rank the work by SLA exposure first and recovery time second. SLA exposure is what we owe customers if service drops. Don't try anything clever with the sequencing. Just give me the order that costs the customers least."
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
          I'm catching up on the log from the car. The heater's running at Vermont and Maine's amplifier is back at 10 dB back-off. You left the BUC alone too, which was the right call. Next, sweep the Maine spectrum for any signal that isn't ours, because James needs evidence and not just our word.
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
          Still on the road - and the incident's already closed with the process fix in the log. Two sites, one operator, zero customer drama. That's the qualification I actually care about.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/20/obj-log-dual-outage.mp3'),
      },
    },
  },
};
