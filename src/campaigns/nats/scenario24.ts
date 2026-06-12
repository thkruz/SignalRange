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
import { aurora7Satellite, ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 24: "Constellation Crisis"
 *
 * Phase: Crisis Operations (Phase 3 capstone, Scenario 8 of 8) - CAMPAIGN FINALE
 * Time Pressure: High - five concurrent tracks, three on clocks you don't control
 * Calculation Required: NO (every mechanic was taught; this is orchestration)
 * New Value: holding five tracks at once without dropping one - multi-station,
 *   multi-satellite, multi-customer, plus a board note. No new mechanics; the
 *   Working Document is the incident-command log / after-action report.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0807: Skill in solving problems
 *   - T1606: Prepare impact reports
 *   - T0531: Troubleshoot hardware/software interoperability problems
 *
 * Supporting Codes:
 *   - T1538: Resolve customer-reported system incidents
 *   - S0593: Skill in handling incidents
 *   - S0677: Skill in recovering failed systems
 *   - T1429: Prepare trend analysis reports
 *   - T1144: Implement network backup and recovery procedures
 *
 * Premise: A compound emergency. A storm front is inbound on VT-01 (S14
 * playbook: heater before the front). ME-02's BUC is running hot, same
 * signature as S13 (de-rate). AURORA-7 has a booked SeaLink pass at a marginal,
 * end-of-life beacon (S6/S22). Two customers escalate, and the board wants a
 * note. The operator holds incident command across both stations and all
 * channels, ordering the board and bending the trends, logging it as they go.
 *
 * The campaign finale: every Phase 1-3 skill, exercised together, under the
 * one pressure no single prior scenario applied - holding the whole job in
 * your head at once.
 *
 * Tone: Capstone - the one Phase 2/3 scenario where dialog density expands
 * (8-10 clips). All named characters appear. Quizzes SYSTEM. The Working
 * Document is the incident-command log.
 *
 * Sim notes:
 *   - VT-01: TIDEMARK-1, storm inbound (weather event at T+240, heater off so
 *     the operator must enable it proactively - S14 discipline). AURORA-7 also
 *     visible/usable from VT-01 for the pass.
 *   - ME-02: TIDEMARK-2, BUC over-gain/hot (S13 signature) - de-rate to clear.
 *   - The Working Document accumulates the incident-command log from the
 *     triage/decision/board quizzes.
 */

export const scenario24Data: ScenarioData = {
  id: 'nats-scenario24',
  prerequisiteScenarioIds: ['nats-scenario23'],
  url: 'nats/scenarios/nats-scenario24',
  imageUrl: 'nats/24/card.png',
  number: 24,
  title: 'Constellation Crisis',
  subtitle: 'Campaign Capstone',
  duration: '40-50 min',
  difficulty: 'advanced',
  missionType: 'Incident Command',
  description: `Everything at once. A storm front tracks onto Vermont inside the hour. Maine's BUC is running hot - the same unit, the same signature as the thermal trend you caught months ago, and the swap never cleared procurement. AURORA-7 has a SeaLink sync pass booked at 0800 on a beacon four dB weaker than the day you qualified. James is already calling. Francis wants a board note by end of morning.<br><br>Five tracks. Three are clocks you don't control - the storm, the pass window, the board deadline. Two are trends you can bend - the BUC heat, the customer's confidence.<br><br>You've done every piece of this before. Today you do all of it, in the right order, while everyone watches. Incident command is yours. Dana is your resource, not your safety net. This is the exam - fly it like a Tuesday.`,
  equipment: [
    '9-meter C-band Antennas (VT-01 + ME-02)',
    'RF Front Ends (both)',
    'Spectrum Analyzers',
    'RX/TX Modems',
    'Incident-command log (Working Document)',
  ],
  timeLimitSeconds: 50 * 60,
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: TIDEMARK-1, storm inbound, AURORA-7 pass pending. Heater OFF.
      {
        ...vermontGroundStation,
      },
      // ME-02: TIDEMARK-2, BUC over-gain and hot (S13 signature)
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
            // BUC over-gain (33 dB vs 23 operating), heating - the S13 thermal
            // trend signature. De-rate to clear.
            buc: {
              isMuted: false,
              isLoopback: false,
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 33 as dB,
              saturationPower: 28 as dBm,
              temperature: 63,
              currentDraw: 4.1,
            },
            hpa: {
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
              backOff: 8 as dB,
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
                  frequency: 1020e6 as IfFrequency,
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
                frequency: 1458 as MHz, // TM-2 downlink IF
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
    satellites: [tidemark1Satellite, tidemark2Satellite, aurora7Satellite, ses10Satellite],
    weatherEvents: [
      {
        id: 'vermont-front-inbound',
        groundStationId: 'VT-01',
        type: 'snow',
        severity: 'moderate',
        startTime: 240, // Front arrives ~4 min in - heater must be on before
        duration: 2400,
        linkMarginDegradation: 6,
      },
    ],
    workingDocument: {
      title: 'Incident Command Log - Constellation Crisis',
      description: 'Live incident command record. Triage calls, decisions, customer commitments, and the board note build here as you work.',
    },
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-24?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION - ASSUME COMMAND, ORDER THE BOARD
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Assume Incident Command',
      description: 'Open the brief and the five-track board.',
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
            question: 'Five concurrent tracks, you hold incident command. What is the first thing command requires?',
            options: [
              'Order the board before touching anything: separate the clocks you do not control (storm ETA, pass window, board deadline) from the trends you can bend (BUC heat, customer confidence), and sequence your attention accordingly',
              'Start fixing the loudest alarm immediately',
              'Escalate everything to Dana since it exceeds one operator',
              'Hand all traffic to whichever station is healthiest and wait out the morning',
            ],
            correctIndex: 0,
            explanation: 'Command is sequencing, not speed. The S16/S20 triage discipline scaled to five tracks: know which clocks are fixed and which trends you own before you spend a single action.',
            pointPenalty: 10,
            documentSection: 'Command',
            documentLine: 'IC assumed. Board ordered: fixed clocks = storm ETA / AURORA pass / board note; bendable trends = ME-02 BUC heat / customer confidence.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'sequencing-quiz',
      nice: ['S0807', 'S0593'],
      title: 'Set the Sequence',
      description: 'Decide the order before acting - the heart of the capstone.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Action Sequence',
          params: {
            character: Character.SYSTEM,
            question: 'Storm hits VT-01 in ~4 minutes; ME-02 BUC is hot but pre-alarm; AURORA pass is at 0800. What order?',
            options: [
              'Protect against the fixed clock first: enable VT-01 heater NOW (one switch, beats the front), then de-rate the ME-02 BUC trend, then set up the AURORA pass before its window - acting on the soonest fixed deadline first, cheap protections before expensive ones',
              'AURORA pass first because customers are watching',
              'ME-02 BUC first because thermal could damage hardware',
              'Whichever customer is loudest on the phone',
            ],
            correctIndex: 0,
            explanation: 'The storm has the nearest fixed deadline and the cheapest protection (one heater switch). Start it, then work the bendable BUC trend, then stage the pass before its window. Sequence by deadline and cost, not by volume.',
            pointPenalty: 10,
            documentSection: 'Command',
            documentLine: 'Sequence: (1) VT-01 heater before front, (2) ME-02 BUC de-rate, (3) AURORA pass setup before 0800.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // TRACK 1: VT-01 STORM PROTECTION (beat the fixed clock)
    // ============================================================
    {
      id: 'select-vermont',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Vermont first - the storm clock is shortest.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sequencing-quiz'],
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
      id: 'enable-heater-proactive',
      nice: ['S0671', 'K0689'],
      title: 'Heater Before the Front',
      description: 'Enable the feed heater now, before the storm arrives - proactive, the S14 discipline.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont'],
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
          description: 'Feed Heater ON (before the front)',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // TRACK 2: ME-02 BUC THERMAL TREND (bend the trend)
    // ============================================================
    {
      id: 'select-maine',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Heater\'s running unattended at Vermont. Now the BUC trend at Maine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['enable-heater-proactive'],
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
      id: 'recognize-buc-signature',
      nice: ['T0531', 'S0807'],
      title: 'Recognize the Signature',
      description: 'You have seen this BUC before. Name it.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine'],
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
          type: 'status-check',
          description: 'Signature ID',
          params: {
            character: Character.SYSTEM,
            question: 'ME-02 BUC: gain 10 dB over operating, temperature climbing, current elevated, pre-alarm. What is this and what is the fix?',
            options: [
              'The same over-gain thermal trend from before - the swap that never cleared procurement. Fix is the de-rate: gain back to the 23 dB operating value, which cuts the dissipation at the source',
              'A new BUC hardware failure requiring immediate swap and customer outage',
              'HPA overdrive bleeding heat into the BUC',
              'Ambient temperature in the Maine equipment room',
            ],
            correctIndex: 0,
            explanation: 'Pattern recognition is the payoff of the campaign: you diagnosed this exact signature once. The de-rate addresses the cause without taking the customer down - and you log that the swap is still pending.',
            pointPenalty: 5,
            documentSection: 'ME-02 / TM-2',
            documentLine: 'BUC over-gain thermal trend (recurrence - swap still pending procurement). Action: de-rate to 23 dB operating.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'derate-buc',
      nice: ['T0531', 'S0421'],
      title: 'De-Rate the BUC',
      description: 'Bring the BUC gain back to the 23 dB operating value.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['recognize-buc-signature'],
      timeLimitSeconds: 3 * 60,
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
          type: 'buc-gain-set',
          description: 'BUC Gain at 23 dB',
          params: { gain: 23, gainTolerance: 2 },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Still Linear',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-buc-trending-down',
      nice: ['T0153', 'T0531'],
      title: 'Confirm the Trend Bends',
      description: 'Verify the de-rate took: carrier still up, BUC no longer climbing.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['derate-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'TM-2 Carrier Still Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Out of Saturation Risk',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // TRACK 3: AURORA-7 CUSTOMER PASS (marginal beacon)
    // ============================================================
    {
      id: 'return-vermont-for-pass',
      nice: ['S0421'],
      title: 'Back to VT-01 for the Pass',
      description: 'Two tracks holding. Now set up the AURORA-7 pass before its window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-buc-trending-down'],
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
      id: 'acquire-aurora',
      nice: ['S0421', 'K1032'],
      title: 'Acquire AURORA-7',
      description: 'Program-track to AURORA-7 (NORAD 28899) for the SeaLink pass.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-vermont-for-pass'],
      timeLimitSeconds: 4 * 60,
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
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Mode',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Locked on AURORA-7',
          params: { noradId: 28899 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'step-track-weak-beacon',
      nice: ['S0421', 'K1032'],
      title: 'Step-Track the Weak Beacon',
      description: 'Engage step-track - on an end-of-life beacon, every bit of pointing accuracy counts.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-aurora'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Held',
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'pass-go-nogo-quiz',
      nice: ['K0721', 'T1538'],
      title: 'Pass Go/No-Go',
      description: 'Make the call on the booked pass - and time the customer comms right.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['step-track-weak-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Go/No-Go',
          params: {
            character: Character.SYSTEM,
            question: 'Step-track is holding the weak beacon and C/N is marginal-but-adequate. What is the call to Marcus?',
            options: [
              'GO with a caveat: step-track holding, margin thin on an end-of-life beacon; proceed with the pass but flag that AURORA is on its sunset trajectory - and deliver that BEFORE 0800, not mid-pass',
              'NO-GO - the beacon is too weak, scrub it',
              'GO silently - do not worry the customer with margin details',
              'Defer the decision until the pass is already underway',
            ],
            correctIndex: 0,
            explanation: 'Honest go: the link supports the pass now, the operator says so, and flags the EOL reality (tying back to the S22 recommendation). Communication timing matters - the caveat before the window, not an excuse during it.',
            pointPenalty: 5,
            documentSection: 'VT-01 / AURORA-7',
            documentLine: 'Pass GO (caveat: thin margin, EOL beacon per sunset rec). Step-track holding. Marcus briefed pre-window.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CUSTOMER + BOARD CHANNELS
    // ============================================================
    {
      id: 'customer-escalation-quiz',
      nice: ['T1538', 'S0593'],
      title: 'Manage the Customer Channel',
      description: 'James is escalating across both his trunks. Handle the channel without dropping a track.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['pass-go-nogo-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Comms',
          params: {
            character: Character.SYSTEM,
            question: 'James wants status on TM-1 (storm) and TM-2 (BUC). What do you give him, and how often?',
            options: [
              'Per-trunk cause/action/next-update, in thirty seconds each: TM-1 protected ahead of the storm (heater on, holding), TM-2 stabilized (BUC de-rated, no impact) - with a committed next-update time so he stops calling and you keep working',
              'A full technical briefing on both faults now',
              'Tell him to wait until everything is resolved',
              'Route him to Dana - customer comms is above incident command',
            ],
            correctIndex: 0,
            explanation: 'Command keeps the customer channel short and scheduled: cause, action, next update. A committed update time converts an escalating caller into a manageable one - protecting your attention for the tracks.',
            pointPenalty: 5,
            documentSection: 'Customer (SeaLink/James)',
            documentLine: 'James briefed per-trunk: TM-1 storm-protected (heater on), TM-2 BUC de-rated (no impact). Next update committed.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'storm-hold-check',
      nice: ['S0671', 'T0153'],
      title: 'Storm Holding',
      description: 'Confirm Vermont is riding the front - the proactive heater is doing its job.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['customer-escalation-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Storm Posture',
          params: {
            character: Character.SYSTEM,
            question: 'The front is over Vermont now. Because you enabled the heater early, what is the situation?',
            options: [
              'The feed stays clear as fast as ice tries to form - no accumulation, link holding; the proactive heater turned a potential outage into a non-event you only have to monitor',
              'Vermont is icing and needs an emergency handover',
              'The heater should be cycled off to save power now that the storm is here',
              'The storm requires a repoint to a clearer-sky satellite',
            ],
            correctIndex: 0,
            explanation: 'The whole point of beating the fixed clock: protection in place before the threat means the threat never becomes an incident. This is the S14/S20 lesson paying its dividend under maximum load.',
            pointPenalty: 5,
            documentSection: 'VT-01 / TM-1',
            documentLine: 'Storm over VT-01: no ice accumulation (heater pre-enabled). TM-1 holding, monitor-only.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'board-note-quiz',
      nice: ['T1606', 'T1429'],
      title: 'The Board Note',
      description: 'Francis wants one paragraph. Write the board-level summary into the command log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['storm-hold-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Board Paragraph',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the one-paragraph board note for Francis?',
            options: [
              'Posture, exposure, action: both stations stable through a concurrent storm + thermal-trend morning, no customer outage; AURORA pass delivered on a sunsetting beacon (reinforces the migration recommendation); residual risk = the pending ME-02 BUC swap. One paragraph, board-level, no jargon',
              'A detailed technical timeline of every action taken',
              'Just "all systems nominal"',
              'A request for more staff',
            ],
            correctIndex: 0,
            explanation: 'Board-level means posture and exposure, not procedure. The note also does institutional work: the AURORA pass on a dying beacon reinforces the S22 sunset case, and the pending BUC swap is named as the residual risk the board controls (procurement).',
            pointPenalty: 10,
            documentSection: 'Board Note (Martin)',
            documentLine: 'Both stations stable through concurrent storm + BUC thermal event, zero customer outage. AURORA pass delivered on EOL beacon (reinforces sunset rec). Residual risk: pending ME-02 BUC swap (procurement).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // CLOSE: REVIEW THE COMMAND LOG, AFTER-ACTION
    // ============================================================
    {
      id: 'review-command-log',
      nice: ['T1606', 'S0807'],
      title: 'Review the Command Log',
      description: 'Open the incident-command log and confirm it stands as the after-action record.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['board-note-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'After-Action Check',
          params: {
            character: Character.SYSTEM,
            question: 'What makes this command log a complete after-action record?',
            options: [
              'It shows the ordered board, the sequence and why, each track\'s action and outcome, the customer and board comms, and the residual risk - someone could pick up your shift cold and know exactly what happened and what is still open',
              'It lists every button pressed in order',
              'It concludes that everything is fine',
              'It is brief enough to read in ten seconds',
            ],
            correctIndex: 0,
            explanation: 'The campaign\'s final discipline, scaled to its largest case: the log IS the work made legible. Ordered board, reasoned sequence, per-track outcomes, comms, open risk. The same shape as a good shift log - just holding five tracks at once.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-crisis-closed',
      nice: ['K0645', 'T1606'],
      title: 'Close the Incident',
      description: 'Log the capstone closed.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-command-log'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Closing Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry closes the incident?',
            options: [
              'Constellation crisis worked under single-operator incident command: VT-01 storm protected (proactive heater, no ice), ME-02 BUC thermal trend de-rated (no outage), AURORA SeaLink pass delivered on EOL beacon, customers briefed per-trunk, board note filed. Zero customer outage across five concurrent tracks. Residual: ME-02 BUC swap pending. IC closed.',
              'Busy morning, everything handled.',
              'Multiple faults, all fixed, see individual tickets.',
              'Crisis averted.',
            ],
            correctIndex: 0,
            explanation: 'The finale entry: five tracks, one operator, zero customer outage, one open risk named. That sentence is the whole campaign - every skill, held together at once, made legible for whoever comes next.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Dana, at the door, 07:00]</em>
      </p>
      <p>
        "Everything at once this morning. Storm front onto Vermont inside the hour. Maine's BUC is running hot - same unit, same signature you caught before, swap never cleared procurement. AURORA's got a SeaLink pass at 0800 on a beacon four dB down. James is calling, Francis wants a board note. You've done every piece of this. Today you do all of it, in the right order, while everyone watches. Incident command is yours - I'm your resource, not your safety net."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/24/intro.mp3'),
    },
    objectives: {
      'enable-heater-proactive': {
        text: `
        <p>
          James Okafor, SeaLink. I've got alerts on both my trunks and a storm on your radar - talk to me. Are we about to lose Vermont?
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-enable-heater-proactive.mp3'),
      },
      'recognize-buc-signature': {
        text: `
        <p>
          Catherine here - I'm your hands on the Maine floor today, but you're calling it. I'm looking at the same BUC numbers you are. Tell me the move and I'll back you up, but this one's your read.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-recognize-buc-signature.mp3'),
      },
      'acquire-aurora': {
        text: `
        <p>
          Marcus from Halifax - SeaLink's spun up for the 0800 sync window on AURORA. I know she's tired; I just need to know if we're going. Your call on the beacon - you've flown her more than anyone.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-acquire-aurora.mp3'),
      },
      'pass-go-nogo-quiz': {
        text: `
        <p>
          Copy your GO with the caveat - and noted on the sunset. That's the third time AURORA's come up thin this quarter; your migration recommendation's looking less like planning and more like a schedule. We'll take the pass. Thanks, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-pass-go-nogo-quiz.mp3'),
      },
      'storm-hold-check': {
        text: `
        <p>
          Okafor again - I'll be quick. Both trunks reading green on my side through all of that. Whatever you did, you did it before I felt it. That's the difference between a vendor and a partner. We're good.
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-storm-hold-check.mp3'),
      },
      'board-note-quiz': {
        text: `
        <p>
          Francis Martin. I'm told this morning could have been a very bad day and instead it's a paragraph. That paragraph is what I take to the board. The note on the BUC swap - I hear it; procurement's mine to fix and I will. Good work under real pressure.
        </p>
        `,
        character: Character.FRANCIS_MARTIN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-board-note-quiz.mp3'),
      },
      'log-crisis-closed': {
        text: `
        <p>
          Five tracks, one operator, not a second of customer outage. I sat on my hands the whole morning and you never needed me - which was the exam.
        </p>
        <p>
          Twenty-four scenarios ago you couldn't read an alarm board. Today you ran a constellation through a crisis and wrote it up so clean the board will never know how close it was. That's the job. Welcome to the top of it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-log-crisis-closed.mp3'),
      },
    },
  },
};
