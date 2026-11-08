import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite, tidemark3Satellite } from './satellites';

/**
 * NATS Level 11: "Planned Maintenance: Hand Off"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 3 of 8)
 * Arc: Start of S11-S12 mini-arc (planned maintenance cycle)
 * Time Pressure: None (planned window, procedural cleanliness is the grade)
 * Calculation Required: NO
 * New UI Elements: None
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0718: Knowledge of network communications principles and practices
 *   - T0129: Integrate new systems into existing network architecture
 *   - S0593: Skill in handling incidents
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0741: Knowledge of system availability measures
 *   - S0421: Skill in operating network equipment
 *   - K0770: Knowledge of system administration principles and practices
 *
 * Premise: Scheduled 2-hour VT-01 maintenance window for HPA waveguide
 * gasket inspection. ME-02 has been pre-coordinated with Catherine to take
 * TIDEMARK-1 traffic for the window. The operator executes the planned
 * handover, then safes the Vermont RF chain and parks the antenna at
 * maintenance position for the inbound crew.
 *
 * Unlike S3's emergency weather handover, there is no time pressure. The
 * grade is procedural cleanliness: pre-handover verification, formal
 * commit, post-handover safing. Same mechanic, planning discipline.
 *
 * Tone: Qualified operator. Dialog limited to a Dana text-message intro,
 * one Catherine coordination beat at the receive side, a Catherine
 * confirmation after the handover commits, a Dana phase transition into
 * safing, and a Dana sign-off. All quizzes are SYSTEM.
 *
 * Story Continuity:
 *   - ME-02 has been pre-coordinated and is already tracking TM-1 in
 *     parallel with VT-01 (RX-only). Catherine has the receive side hot
 *     and is waiting on the operator's commit.
 *   - This is the first of a 2-scenario mini-arc. S12 brings VT-01 back
 *     to service and takes TM-1 traffic back from ME-02.
 */

export const scenario11Data: ScenarioData = {
  id: 'nats-scenario11',
  prerequisiteScenarioIds: ['nats-scenario10'],
  url: 'nats/scenarios/nats-scenario11',
  imageUrl: 'nats/11/card.png',
  number: 11,
  title: 'Planned Maintenance | Hand Off',
  subtitle: 'Coordinated Traffic Transfer to Sister Teleport',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Planned Operations',
  description: `Scheduled maintenance window opens at 10:00 for HPA waveguide gasket inspection on VT-01, with the gasket replacement booked for next Tuesday's window. Maine holds TIDEMARK-1 until VT-01 is back in service.<br><br>Catherine has ME-02 standing by. It's already tracking TIDEMARK-1 in parallel with its receive chain hot, and it's waiting on your commit. Your job is to verify her receive side, stage ME-02's transmit chain cold (the transfer is what swaps RF authority), execute the handover, and then safe VT-01 for the maintenance crew.<br><br>There's no fire, no weather and no surprise. This is procedural work, and the grade is cleanliness. The maintenance crew arrives in thirty minutes.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational - RX Standing By'],
  timeLimitSeconds: 30 * 60, // 30 minutes
  settings: {
    isSync: true,
    scenarioStartDate: '2026-02-18',
    scenarioStartWallTime: '09:30:00',
    groundStations: [
      // VT-01: healthy, owns TIDEMARK-1 traffic, about to hand off
      {
        ...vermontGroundStation,
      },
      // ME-02: operational, RX-only on TIDEMARK-1, TX pre-staged but cold (BUC muted, HPA switch off)
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
            azimuth: 157.0 as Degrees, // Maine sees TM-1 (53 W) here, not at Vermont's 153.1 / 35.1 (Phase 28 D4)
            elevation: 35.33 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61525, // TIDEMARK-1
            targetAzimuth: 157.0 as Degrees,
            targetElevation: 35.33 as Degrees,
            slewing: false,
            beaconCN: 10.4 as dB,
            beaconFrequencyHz: 4175.5e6 as Hertz, // TIDEMARK-1 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // Receive side hot, TX pre-staged but cold until operator commits
            buc: { isMuted: true },
            hpa: { isHpaEnabled: false, isHpaSwitchEnabled: false },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
            centerFrequency: 1074.5e6 as Hertz, // TM-1 beacon IF
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
            // Phase 27: the TIDEMARK beacon reads -44 to -59 dBm at the RX IF
            // tap (ledger; higher when the AGC sees no carrier), the floor ~-114
            // dBm in 3 Hz: both on screen, 10 dB/div
            minAmplitude: -120 as dBm,
            maxAmplitude: -30 as dBm,
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
            activeModem: 1,
            modems: [
              {
                isPowered: true,
                antenna_id: 1,
                modem_number: 1,
                isFaulted: false,
                isTransmitting: false,
                isTransmittingSwitchUp: false,
                isFaultSwitchUp: false,
                id: 0, // Modem 1 is index 0, as the station default builds it (Phase 28)
                isLoopback: false,
                ifSignal: {
                  signalId: 'TIDEMARK-1-Teleport',
                  serverId: 1,
                  noradId: 61525,
                  polarization: 'V',
                  feed: '',
                  isDegraded: false,
                  origin: SignalOrigin.TRANSMITTER,
                  noiseFloor: null,
                  gainInPath: 0 as dBi,
                  // D5 frequency plan: BUC LO 7000 (LSB) - 1057 = 5943 MHz, TM-1 TP-1
                  frequency: 1057e6 as IfFrequency,
                  power: -7 as dBm,
                  bandwidth: 36e6 as Hertz,
                  modulation: 'QPSK' as ModulationType,
                  fec: '3/4' as FECType,
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
                frequency: 1532 as MHz, // TM-1 downlink IF (5250 - 3718), matches VT-01
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
    satellites: [tidemark1Satellite, tidemark2Satellite, tidemark3Satellite, ses10Satellite],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'VT-01',
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-11?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Shift Brief',
      description: 'Open the shift brief, then answer the question to show you understand the maintenance window plan.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Acknowledge Handover Plan',
          params: {
            character: Character.SYSTEM,
            question: 'What is the planned outcome of this shift?',
            options: [
              'TIDEMARK-1 traffic moves to ME-02 for the VT-01 maintenance, then comes back once the crew signs the work off',
              'TIDEMARK-1 traffic moves to ME-02 permanently after the VT-01 maintenance, then VT-01 is decommissioned',
              'TIDEMARK-1 traffic is taken off the air for the VT-01 maintenance, then comes back once the crew signs the work off',
              'All VT-01 satellites move to ME-02 for the VT-01 maintenance, then come back once the crew signs the work off',
            ],
            correctIndex: 0,
            explanation:
              'This is a planned handover, not a permanent move and not an outage. ME-02 holds TM-1 while the crew works on VT-01, with the inspection today and the gasket replacement next Tuesday. Traffic comes back to VT-01 after the crew signs the work off.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: VT-01 PRE-HANDOVER VERIFICATION
    // ============================================================
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Select the Vermont Ground Station.',
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
      id: 'vt-pre-handover-dashboard',
      nice: ['T0129', 'K0741'],
      title: 'VT-01 Pre-Handover Sweep',
      description: 'Open the Dashboard and confirm the VT-01 link is clean before you start the handover.',
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
          description: 'Pre-Handover Baseline',
          params: {
            character: Character.SYSTEM,
            question: 'Why does a planned handover start with a baseline check of the source station?',
            options: [
              'It records what the link looked like healthy, so any anomaly after the transfer can be attributed',
              'It is required by the satellite operator, so the transfer request is approved before the crew arrives',
              'It gives the maintenance crew advance notice, so they know the work window is about to open',
              'It captures the billing counters at the switch, so the traffic hours can be recovered afterwards',
            ],
            correctIndex: 0,
            explanation:
              'A baseline gives you something to compare against. If something looks off on ME-02 after the transfer, you can tell whether it started before the handover or because of it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'vt-confirm-tm1-locked',
      nice: ['T0129', 'S0421'],
      title: 'Confirm VT-01 Owns TIDEMARK-1',
      description: 'Confirm the VT-01 antenna is still tracking TIDEMARK-1 and VT-01 is the current traffic owner. Read the target and beacon status on the ACU Control tab.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['vt-pre-handover-dashboard'],
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
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-1',
          params: { noradId: 61525, requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'traffic-owner',
          description: 'VT-01 Owns TIDEMARK-1 Traffic',
          // Evaluator compares the objective's groundStation against the
          // current owner of params.satelliteId.
          params: { satelliteId: 61525 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Read the VT-01 ACU',
          params: {
            character: Character.SYSTEM,
            question: 'What target and beacon status does the VT-01 ACU show?',
            options: [
              'Current target TIDEMARK-1, beacon LOCKED, program-track',
              'Current target TIDEMARK-2, beacon LOCKED, program-track',
              'Current target TIDEMARK-1, beacon searching, step-track',
              'No target, manual mode, beacon idle',
            ],
            correctIndex: 0,
            explanation:
              "VT-01 is on TIDEMARK-1 with the beacon locked, so it's the station carrying TM-1's traffic until the transfer. That's the starting state you'll compare ME-02 against.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 2: ME-02 RECEIVE-SIDE VERIFICATION (Catherine)
    // ============================================================
    {
      id: 'switch-to-maine',
      nice: ['S0421', 'K0718'],
      title: 'Open ME-02',
      description: 'Switch to the Maine Ground Station so you can verify its receive side before you commit.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['vt-confirm-tm1-locked'],
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
      id: 'me-verify-antenna-on-tm1',
      nice: ['T0129', 'K0718'],
      title: 'ME-02 Antenna on TIDEMARK-1',
      description: 'Confirm ME-02 is locked on TIDEMARK-1 in program-track, the way Catherine set it up.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['switch-to-maine'],
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
          type: 'antenna-locked',
          description: 'ME-02 Locked on TIDEMARK-1',
          params: { noradId: 61525, requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-verify-beacon-and-rx',
      nice: ['T0129', 'K0741'],
      title: 'Verify ME-02 Receive Chain Hot',
      description: "On RX Analysis, confirm ME-02 sees the TIDEMARK-1 beacon and its receiver is locked on VT-01's carrier. Then read the C/N, which should be at least 10 dB.",
      groundStation: 'ME-02',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['me-verify-antenna-on-tm1'],
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
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon at ME-02',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'ME-02 Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 10 dB',
          params: {
            minCNRatio: 10,
            modemNumber: 1,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Read the ME-02 C/N',
          params: {
            character: Character.SYSTEM,
            question: "What C/N does the ME-02 receiver modem show on TIDEMARK-1's carrier?",
            options: [
              '12 to 14 dB - locked with good margin',
              '4 to 6 dB - locked, degraded margin',
              '8 to 9 dB - just under the 10 dB commit margin',
              'No C/N reading - the modem is not locked',
            ],
            correctIndex: 0,
            // VT-01's own TP-1 carrier reads ~12-13 dB at either site: same
            // dish class, GEO slant ranges within tens of km (r2-s11-F2)
            explanation:
              "It's about 12 to 14 dB, the same as VT-01 sees, because ME-02 is receiving VT-01's carrier through the same transponder with the same class of dish a few hundred km away. That's well over the 10 dB commit margin, so Maine's receive side is ready.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: ME-02 TRANSMIT COMMIT
    // ============================================================
    {
      id: 'me-stage-tx-for-handover',
      nice: ['T0129', 'S0421', 'K0770'],
      title: 'Stage ME-02 Transmit',
      description:
        'Enable transmit on Modem 1 so the TX chain is staged, but leave the BUC muted and the HPA disabled. The handover itself swaps RF authority between the stations, not you.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-beacon-and-rx'],
      timeLimitSeconds: 4 * 60,
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
          type: 'tx-modem-transmitting',
          description: 'Modem 1 Transmitting (into muted BUC)',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Stays Muted Until the Swap',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Stays Disabled Until the Swap',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'understand-commit-point',
      nice: ['K0718', 'S0593'],
      title: 'Understand the Commit Point',
      description: 'Answer what "ready to commit" means in a planned handover.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-stage-tx-for-handover'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Commit Criteria',
          params: {
            character: Character.SYSTEM,
            question: 'What makes ME-02 ready to commit to the TIDEMARK-1 handover?',
            options: [
              'Antenna locked, RX carrier with C/N margin, TX staged cold - modem on, BUC muted, HPA disabled until the transfer',
              'Antenna locked, RX carrier with C/N margin, TX chain hot - modem on, BUC unmuted, HPA enabled before the transfer',
              'Antenna locked, beacon on the analyzer, TX chain untouched - the RX modem and TX chain come up during the transfer',
              'Antenna locked, RX carrier with C/N margin, loopback passed - modem on, BUC in loopback, HPA disabled until the transfer',
            ],
            correctIndex: 0,
            explanation:
              "The receive side proves the link works coming in, and the transmit side is staged but cold. If both stations radiated into the same transponder, the satellite would see two carriers, which is called dual illumination. That's why the handover stands the source down and brings the target up in one coordinated swap.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 4: EXECUTE HANDOVER
    // ============================================================
    {
      id: 'open-tm1-dashboard',
      nice: ['S0421'],
      title: 'Open TIDEMARK-1 Dashboard',
      description: 'Select TIDEMARK-1 in the asset tree to open the traffic transfer controls.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['understand-commit-point'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'satellite-selected',
          description: 'TIDEMARK-1 Selected',
          params: { assetSatelliteId: 'sat-61525' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'execute-handover',
      nice: ['T0129', 'S0593', 'K0741'],
      title: 'Execute Handover',
      description: 'Transfer TIDEMARK-1 traffic from VT-01 to ME-02.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['open-tm1-dashboard'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'traffic-transferred',
          description: 'Traffic Transferred to ME-02',
          params: {
            sourceStation: 'VT-01',
            targetStation: 'ME-02',
            satelliteId: 61525,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      // nats-r2-s03-F3 (S11): this used to tick on the Execute click itself.
      // Continuity is judged after the handover, on ME-02's own receiver: it
      // now hears ME-02's carrier relayed by TIDEMARK-1, and the player has
      // to go and look at it
      id: 'verify-me-traffic-owner',
      nice: ['T0129', 'K0741'],
      title: 'Verify Service Continuity on ME-02',
      description:
        "On ME-02's RX Analysis, confirm the receiver is still locked on the TIDEMARK-1 TP-1 carrier. That carrier is now ME-02's own, relayed back down by the satellite. Then confirm ME-02 owns the TIDEMARK-1 traffic.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['execute-handover'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'traffic-owner',
          description: 'ME-02 Owns TIDEMARK-1',
          // Evaluator compares the objective's groundStation against the
          // current owner of params.satelliteId.
          params: { satelliteId: 61525 },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'ME-02 Receiver Locked After the Transfer',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'catherine-confirm-hot',
      nice: ['K0718', 'K0741'],
      title: 'Confirm with Catherine',
      description: "Answer the question about Catherine's report that ME-02 has the link clean.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-me-traffic-owner'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Cross-Station Confirmation',
          params: {
            character: Character.SYSTEM,
            question: 'Catherine reports ME-02 is carrying TIDEMARK-1 clean. What is the next correct action?',
            options: [
              'Switch back to VT-01 and safe the RF chain for the maintenance crew',
              'Stay on ME-02 and continue monitoring until the maintenance window closes',
              'Power down ME-02 to conserve equipment hours',
              'Re-enable the VT-01 transmitter as a hot standby',
            ],
            correctIndex: 0,
            explanation:
              'The handover is committed and ME-02 is carrying the traffic. The unfinished work is at the source station, so you go back to VT-01 to safe the RF chain and park the antenna for the crew.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 5: VT-01 SAFING FOR MAINTENANCE CREW
    // ============================================================
    {
      id: 'switch-to-vermont-safing',
      nice: ['S0421'],
      title: 'Return to VT-01',
      description: 'Switch back to Vermont to safe the station for the maintenance crew.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['catherine-confirm-hot'],
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
      id: 'vt-safe-tx-chain',
      nice: ['S0421', 'K0770', 'S0593'],
      title: 'Verify VT-01 TX Chain Safed',
      description:
        "The handover stood VT-01's transmit down automatically, with the HPA disabled and the BUC muted. Check both on the TX Chain panel, because you shouldn't trust an automatic safing you haven't looked at.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-vermont-safing'],
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
          type: 'hpa-disabled',
          description: 'HPA Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'vt-antenna-maintenance-position',
      nice: ['S0421', 'K0770'],
      title: 'Park VT-01 Antenna at Maintenance Position',
      // nats-r3-s11-F2: MAINT stages, APPLY commits the mode and the move
      description:
        'On ACU Control, press MAINT and then APPLY. MAINT only stages the 5° maintenance elevation (the card shows "MAINTENANCE pending APPLY" and the dish keeps tracking), and APPLY switches the mode and moves the dish. Wait for the dish to park at 5° for the crew.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-safe-tx-chain'],
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
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode Set to Maintenance',
          params: { trackingMode: 'maintenance' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Antenna at Maintenance Position',
          params: {
            elevation: 5 as Degrees,
            tolerance: 1,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'vt-final-rf-safety-check',
      nice: ['K0770', 'S0593'],
      title: 'Final RF Safety Check',
      description: 'Answer which conditions make VT-01 safe to hand to the maintenance crew.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-antenna-maintenance-position'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Crew-Ready Criteria',
          params: {
            character: Character.SYSTEM,
            question: 'Which combination of conditions confirms VT-01 is safe for the maintenance crew to begin work?',
            options: [
              'HPA disabled, BUC muted, antenna at maintenance position - no RF energy on the feed, dish accessible',
              'HPA disabled, BUC left unmuted, antenna at maintenance position - the BUC cannot radiate without the HPA',
              'HPA disabled, BUC muted, antenna stowed at 90° elevation - no RF energy on the feed, dish protected',
              'RF rack fully powered off, GPSDO off, antenna at maintenance position - nothing energized, dish accessible',
            ],
            correctIndex: 0,
            explanation:
              'The crew needs the RF de-energized and the dish where they can reach it. Stow at 90° protects the dish from weather, but the maintenance position at 5° is the one that lets a person work on the feed.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SHIFT WRAP
    // ============================================================
    {
      id: 'log-handover-entry',
      nice: ['K0645', 'T0129'],
      title: 'Log the Handover',
      description: 'In one or more Operations Log entries (log icon in the station sidebar), record that ME-02 now has TM-1 and what state VT-01 is left in.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-final-rf-safety-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ops-log-entry',
          description: 'Handover Typed in Ops Log',
          params: { logKeywords: ['me-02|maine', 'safe|maintenance|parked|stow|offline|out of service'], logMinLength: 20 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      // The log-line quiz follows the typed entry (it used to open before it)
      id: 'log-handover-quiz',
      nice: ['K0645', 'T0129'],
      title: 'Check the Log Line',
      description: 'Pick the log line that records the handover the way you typed it in.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['log-handover-entry'],
      conditions: [
        {
          type: 'status-check',
          description: 'Handover Log Entry',
          params: {
            character: Character.SYSTEM,
            // nats-r3-s09-F1 (S11): no clock stamp in the options; the Ops
            // Log stamps the station clock on the entry itself
            question: 'Which line correctly records this handover in the operations log?',
            options: [
              'Planned TM-1 handover to ME-02 complete. VT-01 safed, antenna at maintenance position, crew on-site. Return to service after crew sign-off.',
              'Emergency TM-1 handover to ME-02 complete. VT-01 fault cause unknown, antenna still on TM-1, crew on-site. Investigation pending.',
              'Crew on-site for VT-01 HPA waveguide gasket. TM-1 handover to ME-02 deferred, VT-01 still carrying traffic. Return to service after crew sign-off.',
              'Planned TM-1 handover to ME-02 complete. VT-01 maintenance finished, antenna back on TM-1, crew released. Traffic resumed on VT-01.',
            ],
            correctIndex: 0,
            explanation:
              "A good entry says who did what, why, where things stand and who has the link. The Operations Log stamps the station clock on the entry for you, so you don't need to type a time. The next operator should be able to pick up the shift without asking you a question.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 09:30]</em>
      </p>
      <p>
        "The maintenance window opens at 10:00 so the crew can inspect the waveguide gasket on VT-01's HPA. Catherine's already got ME-02 tracking TM-1 with the receive chain hot, and she's waiting on your commit. Verify her side, stage ME-02's transmit chain, do the transfer, and then safe VT-01 for the crew. They'll be at the gate in thirty minutes."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/11/intro.mp3'),
    },
    objectives: {
      'switch-to-maine': {
        text: `
        <p>
          Catherine here. I've got TIDEMARK-1 in program-track from this side, the beacon's clean, and the C/N is holding above ten. It's clear skies up here, so nothing's getting in the way. The receive side is yours to verify. After that, stage my transmit chain cold, because the transfer is what brings it up when you commit.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-switch-to-maine.mp3'),
      },
      'switch-to-vermont-safing': {
        text: `
        <p>
          Maine's carrying the traffic now. The transfer stood your transmitter down on its own, so check the HPA and the BUC on the panel yourself. Then move the antenna to the maintenance position. The crew lead is on his way up.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-switch-to-vermont-safing.mp3'),
      },
    },
    // Clips that describe a step play as it opens. Catherine's report plays as
    // the confirmation step opens, so the quiz that cites it comes after it (it
    // used to play on completion, after the quiz had already been answered)
    objectivesOnStart: {
      // nats-r3-s02-F1 (D18): "Log it" plays as the log step opens, not after
      // the entry has been typed and checked
      'log-handover-entry': {
        text: `
        <p>
          Clean handover. Log it and meet me in the conference room - I want to walk through the gasket replacement procedure with you before they start.
        </p>
        <p>
          When the crew signs the gasket work off, you bring it back.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-log-handover-entry.mp3'),
      },
      'catherine-confirm-hot': {
        text: `
        <p>
          Maine has TM-1. Carrier's clean over here, no packet loss across the transfer. I've got it while your station's down - go take care of it.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-catherine-confirm-hot.mp3'),
      },
    },
  },
};
