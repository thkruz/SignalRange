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
 *     visible/usable from VT-01 for the pass. Phase 29 D13: the front's rain
 *     band (80 mm/h) follows the go/no-go and costs the step-tracked AURORA-7
 *     beacon about 1 dB (Sky Temp 12 -> 32 K); the AGC stays At Max on noise.
 *   - Phase 27: VT-01's TM-1 carrier is keyed at the start (TM-1 service
 *     through the storm). Before the dish leaves TIDEMARK-1 for the AURORA-7
 *     pass the player takes it off the air (HPA output off, then BUC mute):
 *     a carrier keyed through a slew sweeps every satellite on the arc.
 *     SeaLink's backup hub carries the TM-1 trunk for the AURORA-7 window
 *     (booked with the pass). The AURORA-7 carrier is SeaLink's, up at 0800
 *     (brief), after this shift's setup, so nothing of ours is keyed on it.
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
  description: `Everything at once. A storm front is minutes from Vermont. Maine's BUC is running hot again, the same unit with the same signature as the thermal trend you caught months ago, and its replacement never cleared procurement. AURORA-7 has a SeaLink sync pass booked at 0800 on a beacon about six dB under its reference level. James is already calling, and Francis wants a board note by the end of the morning.<br><br>That makes five tracks. Three are clocks you don't control: the storm, the pass window and the board deadline. Two are trends you can bend: the BUC heat and the customer's confidence.<br><br>You've done every piece of this before. Today you do all of it, in the right order, while everyone watches. Incident command is yours, and Dana is your resource, not your safety net. This is the exam, so fly it like any other shift.`,
  equipment: ['9-meter C-band Antennas (VT-01 + ME-02)', 'RF Front Ends (both)', 'Spectrum Analyzers', 'RX/TX Modems', 'Incident-command log (Working Document)'],
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
            // BUC over-gain (33 dB vs 23 operating), heating - the S13 thermal
            // trend signature. De-rate to clear.
            buc: {
              isMuted: false,
              isLoopback: false,
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 33 as dB,
              saturationPower: 28 as dBm,
              temperature: 63, // set by the 'me02-buc-heat' fault below
              currentDraw: 4.0, // the model settles at 4.0 A at 33 dB, 3.1 A at 23 dB
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
        // Front arrives ~4 min after the sequencing quiz opens (the brief is
        // done) - heater must be on before. Anchored so the quiz's "~4
        // minutes" holds however long the brief takes to read.
        startAfterObjectiveId: 'sequencing-quiz',
        startTime: 240,
        duration: 2400,
        linkMarginDegradation: 6,
      },
      {
        // Phase 29 D13 (nats-r4-s24-F1): the front's rain band, so the storm
        // has an RF signature (the snow event above only ices an unheated
        // feed). Authored like S14: at C-band the wet path mostly adds sky
        // noise. Headless (2026-10-13, VT-01 on AURORA-7, El 29.2): Sky Temp
        // 12 -> 32 K, step-tracked beacon 9.0 -> 8.0 dB (about 1 dB), lock
        // held. Program-track sits at 7.0 dB, only 0.5 dB over the 6.5 dB
        // lock, so the rain is anchored after step-track has held the beacon
        // (it would unlock a program-tracked beacon from about 30 mm/h).
        // Attenuation alone is about 0.3 dB; the RAIN FADE alarm reads the C/N
        // the rain costs (attenuation + sky-noise rise), so the ticker shows
        // "RAIN FADE" (info, depth ~1.1 dB in the detail) at the plateau beside Sky Temp and C/N.
        id: 'vermont-rain-band',
        groundStationId: 'VT-01',
        type: 'rain',
        severity: 'severe',
        rainRateMmPerHour: 80,
        startAfterObjectiveId: 'pass-go-nogo-quiz',
        startTime: 0,
        duration: 900, // ramp 135 s in, 135 s out
        linkMarginDegradation: 1.1,
      },
    ],
    // The BUC heat is a staged cooling fault, not a seeded start value: the
    // thermal model relaxes a plain `temperature: 63` toward the drive-derived
    // target within moments (nats-s24-F5). The slow fan holds a 33 dB BUC
    // climbing ~0.2 C/min from 63 toward ~65 C (pre-alarm); the 23 dB de-rate
    // drops the current to 3.1 A at once and turns the temperature down.
    hardwareFaultEvents: [
      {
        id: 'me02-buc-heat',
        groundStationId: 'ME-02',
        target: 'buc-overtemp',
        startTime: 0,
        // Same unit, same fan (phase 19.6): R_th x 1.38 heads for 65 degC at
        // 33 dB (4.04 A), 55.5 degC at 23 dB (3.07 A)
        params: { startTemperatureC: 63, coolingFactor: 1.38 },
      },
    ],
    workingDocument: {
      title: 'Incident Command Log - Constellation Crisis',
      description: 'Live incident command record. Triage calls, decisions, customer commitments, and the board note build here as you work.',
    },
    scenarioStartDate: '2026-03-27', // Friday, per the brief
    scenarioStartWallTime: '06:58:00',
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
      description: 'Open the mission brief, then read the five-track board.',
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
            question: 'You hold incident command over five tracks at once. What does command require first?',
            options: [
              'Order the board: fixed clocks (storm, pass, board note) against trends you can bend (BUC heat, customer)',
              'Work the loudest alarm first: the climbing ME-02 BUC outranks anything that is still only a forecast, like the storm',
              'Escalate to Dana first, because five tracks are more than one operator at one console can hold',
              'Consolidate everything on the healthiest station and wait out the morning until the storm has passed',
            ],
            correctIndex: 0,
            explanation:
              "Command is sequencing, not speed. It's the same triage discipline as any multi-fault morning, scaled up to five tracks. Before you spend a single action, know which clocks are fixed (the storm, the pass and the board note) and which trends you can still bend (the BUC heat and the customer's confidence), then sequence your attention to match. The other options react to noise, hand the problem off or retreat, and none of them orders the work.",
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
      description: 'Decide the order of the work before you touch anything. That is the heart of incident command.',
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
            question: 'The storm reaches VT-01 in about 4 minutes, the ME-02 BUC is hot but not yet in alarm, and the AURORA-7 pass is at 0800. What order do you work them in?',
            options: [
              'Switch the VT-01 heater on now, then de-rate the ME-02 BUC, then set up the AURORA-7 pass before 0800',
              'Set up the AURORA-7 pass first because customers are watching, then the BUC, then the heater once the front arrives',
              'De-rate the ME-02 BUC first because heat can damage hardware, then the heater, then the pass if the window is open',
              "Answer James first because he's the loudest, then the heater, then the BUC, then the AURORA-7 pass at 0800",
            ],
            correctIndex: 0,
            explanation:
              "The storm has the nearest fixed deadline and the cheapest protection, which is one heater switch. Start it, then work the BUC trend you can bend, then stage the pass before its window. Sequence by deadline and cost, not by volume. That's why the loud caller and the customer-facing pass don't go first.",
            pointPenalty: 10,
            documentSection: 'Command',
            documentLine: 'PLAN - sequence: (1) VT-01 heater before front, (2) ME-02 BUC de-rate, (3) AURORA pass setup before 0800.',
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
      description: 'Select VT-01 first, because the storm is the shortest clock.',
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
      description:
        'In ACU Control, turn on the feed heater now, before the storm arrives, so the protection is on before the threat rather than after. This one is timed, and running out of time fails the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      // The storm clock is the one fixed deadline the operator can beat with a
      // single switch; missing it is the failure this scenario tests
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
      description: "The heater's running at Vermont without you. Now take on the BUC trend at Maine.",
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
      description: "Open ME-02's TX Chain tab and read the BUC panel: gain, temperature, trend and current. You've seen this BUC before, so name the problem and the fix.",
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
            question:
              "The ME-02 BUC gain is 10 dB over its operating value, the temperature is climbing, the current is high, and it's not yet in alarm. What is this, and what is the fix?",
            options: [
              'The same over-gain trend as before, swap still pending. De-rate the gain back to the 23 dB operating value',
              "A new BUC hardware failure, not the earlier trend. Swap it at once, accepting a TM-2 outage while it's done",
              'The HPA overdriving the BUC through a shared chassis. Back the HPA off by up to 10 dB and leave the BUC gain alone',
              'Ambient heat in the Maine equipment room. Call facilities and leave the BUC gain at 33 dB until the room cools',
            ],
            correctIndex: 0,
            explanation:
              "Pattern recognition is the payoff of experience. You've diagnosed this exact signature before: 4.0 A at 33 dB against 3.1 A at 23 dB, on a unit with a degraded fan, and the swap never cleared procurement. The de-rate cuts the heat at the source without taking the customer down, whereas an immediate swap would cause the outage you're trying to avoid. Log that the swap is still pending.",
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
      description: 'On TX Chain, set the BUC gain back to its 23 dB operating value.',
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
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-buc-trending-down',
      nice: ['T0153', 'T0531'],
      title: 'Confirm the Trend Bends',
      description:
        'On TX Chain, read the BUC and HPA panels after the de-rate. Check the current draw, the temperature and its Trend, the P1dB Margin, that the HPA is still linear, and that the TM-2 carrier is still locked.',
      groundStation: 'ME-02',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['derate-buc'],
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
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Still Linear',
          mustMaintain: true,
        },
        {
          // Held 45 s so the panel read below opens on a turned Trend
          // (nats-r3-s24-F1). The Trend (1 min) readout is a least-squares
          // slope over 60 s of 5 s samples: at the de-rate the target drops
          // from ~65 to 55.5 degC (10 min time constant), the true slope flips
          // from about +0.2 to about -0.75 C/min, and the fitted slope crosses
          // zero 15-20 s later, reads below -0.05 (down arrow) by ~25 s and
          // about -0.5 to -0.65 C/min at 45 s, while the reading is still
          // 62.4-63.4 degC. No condition reads the trend, so time gates it.
          type: 'buc-current-normal',
          description: 'BUC Current ≤ 3.5 A, held 45 s (let the Trend turn)',
          params: { maxCurrentDraw: 3.5 },
          mustMaintain: true,
          maintainDuration: 45,
        },
        {
          // The trend itself, read off the TX Chain panel (nats-s24-F5): the
          // rows were true the instant gain hit 23 dB with nothing to read.
          // Same unit as S13: 3.1 A at 23 dB at once; the quiz opens after the
          // 45 s hold above, when the Trend (1 min) already reads negative
          type: 'status-check',
          description: 'BUC Panel Read',
          params: {
            character: Character.SYSTEM,
            question: 'Most of a minute after the de-rate, what does the ME-02 BUC panel show?',
            options: [
              'Current about 3.1 A, temperature still in the low 60s, Trend (1 min) negative, P1dB Margin about 12 dB',
              "Current still about 4.0 A and temperature climbing, because the gain change hasn't reached the module yet",
              'Current about 3.1 A and temperature already back in the 40s, because the BUC cools as fast as current drops',
              'Current about 1 A with the BUC output gone, because the de-rate muted the TM-2 carrier outright',
            ],
            correctIndex: 0,
            explanation:
              'Current answers within seconds, but temperature lags behind the thermal mass, so the reading barely moves in a minute. What has changed is the one-minute Trend, which now shows a down arrow as the temperature heads for the mid-50s. Together with 12 dB of P1dB margin and the TM-2 carrier still locked, that tells you the de-rate is taking.',
            pointPenalty: 5,
          },
          mustMaintain: false,
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
      description: 'Two tracks are holding. Go back to VT-01 to set up the AURORA-7 pass before its window.',
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
      id: 'inhibit-tm1-tx',
      nice: ['S0593', 'T1567'],
      title: 'Take TM-1 Off the Air',
      description:
        "Before the dish leaves TIDEMARK-1, take VT-01's TM-1 carrier off the air on TX Chain. Disable the HPA output first, then mute the BUC. A carrier left on while the dish slews sweeps across every satellite on the arc. SeaLink's backup hub carries the TM-1 trunk for the AURORA-7 window, which was booked with the pass. Once the carrier is off, VT-01's Dashboard will show two alarms, 'AGC on noise only' and 'Carrier lock lost' (Modem 1 has no carrier to lock to). Both are expected, and they stay up while SeaLink's backup hub carries TM-1.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-vermont-for-pass'],
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
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-aurora',
      nice: ['S0421', 'K1032'],
      title: 'Acquire AURORA-7',
      description:
        'In ACU Control, select AURORA-7 (NORAD 28899) as the target and use Move to Target in program-track for the SeaLink pass. The dish takes about a minute to slew there, and the lock comes once it arrives.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['inhibit-tm1-tx'],
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
        // No separate Program-Track row: VT-01 is already in program-track on
        // TIDEMARK-1, so it ticked before the player acted
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
      description:
        'Turn on step-track in ACU Control and watch it hold the AURORA-7 beacon. The satellite is near the end of its life and its beacon is weak, so every bit of pointing accuracy counts.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-aurora'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          // B3: the 15 s hold counts while the player watches the ACU
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          // AURORA-7's beacon, not the TIDEMARK-1 lock VT-01 starts with
          type: 'antenna-beacon-locked',
          description: 'Beacon Held',
          params: { noradId: 28899 },
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
      description: 'Decide whether the booked pass goes ahead, and tell Marcus at the right time.',
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
            question: 'Step-track is holding the weak beacon and the C/N is marginal but adequate. What call do you make to Marcus?',
            options: [
              'GO with a caveat: the margin is thin, so flag the sunset trajectory to Marcus BEFORE 0800',
              'NO-GO with a scrub: the margin is thin on an end-of-life beacon, so tell Marcus BEFORE 0800 that the pass is off',
              "GO with no caveat: the margin is adequate for the pass, so keep the margin and sunset detail off Marcus's plate",
              'GO with a deferred call: judge the margin during the pass, then brief Marcus mid-pass once the numbers settle',
            ],
            correctIndex: 0,
            explanation:
              'The link supports the pass now, so the right call is GO, and you flag the end-of-life reality too. That ties back to the sunset recommendation already with the board, the proposal to retire AURORA-7 from service. Timing matters: Marcus needs the caveat before the window, not as an excuse during it, and never mid-pass. A NO-GO would scrub a pass the link can carry, and a GO with no caveat hides the thin margin.',
            pointPenalty: 5,
            documentSection: 'VT-01 / AURORA-7',
            documentLine: 'DECISION - pass GO (caveat: thin margin, EOL beacon per sunset rec); step-track holding. Brief Marcus before the 0800 window.',
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
      description: 'James is calling about both of his trunks. Handle the customer channel without dropping any other track.',
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
            question: 'James wants a status on TM-1 (the storm) and TM-2 (the BUC). What do you give him, and how often?',
            options: [
              'Cause, action and next-update time for each trunk, thirty seconds each: TM-1 on its backup, TM-2 stabilized',
              'A full technical briefing on both faults right now, covering storm dynamics, ice rate, BUC gain and current draw',
              'Nothing until both faults are resolved, so he waits for the all-clear while the heater and the de-rate do their work',
              "A hand-off of both trunks to Dana, because customer comms sit above incident command and aren't yours to hold",
            ],
            correctIndex: 0,
            explanation:
              'Command keeps the customer channel short and scheduled: cause, action, next update. A committed next-update time turns an escalating caller into a manageable one, because he stops calling, you keep working, and your attention stays on the tracks. A long briefing eats the time you need for those tracks, and silence keeps him calling.',
            pointPenalty: 5,
            documentSection: 'Customer (SeaLink/James)',
            documentLine: 'PLAN - James per trunk: TM-1 on booked backup for the AURORA window, VT-01 feed heated; TM-2 BUC de-rated, no impact. Commit the next update time.',
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
      description: 'Confirm Vermont is riding out the front. On ACU Control, watch Ice, Sky Temp and the AURORA-7 beacon C/N as the rain band comes over.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['customer-escalation-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          // Phase 29 D13 (nats-r4-s24-F1): the rain band (vermont-rain-band)
          // ramps in over 135 s from the go/no-go; the hold lets the player
          // see Sky Temp climb and the beacon come down before answering
          type: 'tab-active',
          description: 'Watch the beacon on ACU Control (held 60 s)',
          params: { tab: 'acu-control' },
          mustMaintain: true,
          maintainDuration: 60,
        },
        {
          type: 'status-check',
          description: 'Storm Posture',
          params: {
            character: Character.SYSTEM,
            question: 'The front is over Vermont now, with the dish on AURORA-7 for the pass. Read Ice, Sky Temp and the beacon C/N on ACU Control. What is the situation?',
            options: [
              'The heater is holding the feed clear (Ice 0.0 dB) and rain costs the beacon about 1 dB, still above the 6.5 dB lock',
              'The feed is icing faster than the heater can clear it, so the beacon sag is ice and an emergency handover to ME-02 is due',
              "The feed is clear and the front is overhead, so the heater isn't needed and can be cycled off until ice actually starts",
              'The AGC is at max, which is the rain-fade threshold, so the margin is gone and the dish should repoint to a clearer sky',
            ],
            correctIndex: 0,
            explanation:
              'Two things are happening, and only one is yours to stop. The heater, switched on before the front, keeps the feed clear. Ice stays at 0.0 dB, so the outage that ice would have caused never starts. The rain is real: the wet path radiates into the beam (Sky Temp climbs from about 12 K to about 32 K) and costs the AURORA-7 beacon about a dB. That leaves it near 8 dB, still above the 6.5 dB lock step-track needs. The AGC sits At Max because TM-1 is off the air and only noise and beacons are in the passband, not because of the rain, so act on the margin, not the AGC. Rain over the station is in every satellite path from VT-01, so a repoint buys nothing.',
            pointPenalty: 5,
            documentSection: 'VT-01 / TM-1',
            documentLine:
              'Front over VT-01, heater on: Ice 0.0 dB, feed clear. Rain costs the AURORA-7 beacon about 1 dB (Sky Temp up), still above the 6.5 dB lock on step-track: riding it on the margin, not the AGC.',
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
      description: 'Francis wants one paragraph for the board. Choose the summary that belongs in the command log.',
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
              'Posture and exposure: both stations stable, no outage, AURORA pass GO for 0800 on a sunsetting beacon, BUC swap as residual risk',
              'Timeline and procedure: every action time-stamped, heater then de-rate then pass, each switch and setting listed as logged',
              'Status only: all systems nominal, with no detail on the storm, the BUC or the pass, so there is nothing for the board to act on or worry about',
              'Staffing and cost: five tracks exceeded one operator, so a second console seat is requested and the BUC swap is deferred',
            ],
            correctIndex: 0,
            explanation:
              'Board-level means posture and exposure, not procedure: one paragraph, without jargon. The note also does institutional work. The AURORA pass on a dying beacon reinforces the sunset case already before the board, which is the case for retiring AURORA-7. And the pending BUC swap is named as the residual risk the board controls, because procurement is theirs.',
            pointPenalty: 10,
            documentSection: 'Board Note (Martin)',
            documentLine:
              'Both stations stable through concurrent storm + BUC thermal event, zero customer outage. AURORA pass GO for 0800 on EOL beacon (reinforces sunset rec). Residual risk: pending ME-02 BUC swap (procurement).',
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
      description: 'Review the incident-command log in the Working Document and decide what makes it the after-action record, the review of what happened.',
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
              "It shows the ordered board, the sequence and why, each track's action and outcome, the comms and the residual risk",
              'It lists every button pressed in order with a time-stamp, every setting before and after, and the alarm text verbatim',
              'It concludes that everything is fine, states zero outages, closes every track and leaves nothing open for the next shift',
              'It is brief enough to read in ten seconds, leads with the outcome, skips the reasoning and points to tickets for detail',
            ],
            correctIndex: 0,
            explanation:
              "This is the final discipline, scaled to its largest case: the log is the work made legible. It holds the ordered board, the reasoned sequence, the outcome of each track, the customer and board comms and the open risk, so someone could pick up your shift cold and know exactly what happened and what's still open. It's the same form as a good shift log, just holding five tracks at once.",
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
      description:
        'Pick the entry that closes the incident, then type it into the Ops Log in the sidebar. The entry should say the incident is closed and name the residual ME-02 BUC swap.',
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
              'IC closed: VT-01 storm protected, ME-02 BUC de-rated, AURORA pass GO for 0800 (caveat briefed); zero outage; residual = ME-02 BUC swap',
              'IC closed: VT-01 storm handled, ME-02 BUC handled, AURORA pass handled; busy morning, all fine; residual = none, see individual tickets',
              'IC closed: VT-01 storm outage averted, ME-02 BUC swapped, AURORA pass scrubbed; one outage, five tracks; residual = none',
              'IC closed: VT-01 heater on, ME-02 gain 23 dB, AURORA step-track on; crisis averted, five tracks; residual = details on request',
            ],
            correctIndex: 0,
            explanation:
              "The finale entry covers five tracks, one operator, zero customer outage and one open risk named. It records the proactive heater and no ice at VT-01, and the thermal trend de-rated with no outage at ME-02. It also records the SeaLink pass called GO on an end-of-life beacon with the caveat briefed, the customers briefed per trunk, and the board note filed. That entry is the whole job, every skill held together at once and made legible for whoever comes next. The other entries hide the facts behind 'handled', report things that didn't happen, or leave the open BUC swap off the log.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'ops-log-entry',
          description: 'Closing Entry Typed in the Ops Log',
          params: { logKeywords: ['close', 'buc'], logMinLength: 20 },
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
        <em>[Dana, at the door, 06:58]</em>
      </p>
      <p>
        "Everything at once this morning. There's a storm front about to hit Vermont, and Maine's BUC is running hot again. It's the same unit with the same signature you caught before, because the replacement never got through procurement. AURORA-7 has a SeaLink pass at 0800 on a beacon about six dB under its reference level. James is already calling, and Francis wants a board note by the end of the morning. You've done every piece of this before. Today you do all of it, in the right order, while everyone watches. Incident command is yours. I'm your resource, not your safety net."
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
          James Okafor, Atlantic Shipping. I've got alerts on both my trunks and a storm on your radar - talk to me. Are we about to lose Vermont?
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-enable-heater-proactive.mp3'),
      },
      'recognize-buc-signature': {
        text: `
        <p>
          Catherine here. I'm your hands on the Maine floor today, but you're calling it. I'm looking at the same BUC numbers you are, and your read matches mine. Tell me the move and I'll back you up.
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
          Copy your GO with the caveat. I've noted the sunset, which is the plan to retire AURORA-7 and move its traffic. That's the third time she's come up thin this quarter, so your migration recommendation is starting to look more like a schedule than a plan. We'll take the pass. Thanks.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-pass-go-nogo-quiz.mp3'),
      },
      'storm-hold-check': {
        text: `
        <p>
          Okafor again, and I'll be quick. Both trunks stayed green on my side through all of that. Whatever you did, you did it before I felt it. That's the difference between a vendor and a partner. We're good.
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
          That was five tracks, one operator and not a second of customer outage. I sat on my hands the whole morning and you never needed me, which was the exam.
        </p>
        <p>
          Your first week here you couldn't read an alarm board. Today you ran a constellation through a crisis and kept a log so clean the board will never know how close it was. That's the job. Welcome to the top of it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/24/obj-log-crisis-closed.mp3'),
      },
    },
  },
};
