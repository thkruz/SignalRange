import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
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
  title: 'Planned Maintenance: Hand Off',
  subtitle: 'Coordinated Traffic Transfer to Sister Teleport',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Planned Operations',
  description: `Scheduled maintenance window opens at 10:00 for HPA waveguide gasket inspection on VT-01. Two hours of downtime, pre-coordinated with Maine.<br><br>Catherine has ME-02 standing by - already tracking TIDEMARK-1 in parallel, RX hot, waiting on your commit. Your job: verify her receive side, stage ME-02's transmit chain (cold - the transfer swaps RF authority), execute the handover, then safe VT-01 for the maintenance crew.<br><br>No fire, no weather, no surprise. This is procedural work and the grade is cleanliness. Maintenance crew arrives in thirty minutes.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Operational - RX Standing By',
  ],
  timeLimitSeconds: 30 * 60, // 30 minutes
  settings: {
    isSync: true,
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
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            polarization: 14 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61525, // TIDEMARK-1
            targetAzimuth: 161.8 as Degrees,
            targetElevation: 34.2 as Degrees,
            targetPolarization: 14 as Degrees,
            slewing: false,
            beaconCN: 10.4 as dB,
            beaconFrequencyHz: 1074.5e6 as Hertz, // 5250 LNB LO - 4175.5 beacon RF
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
            referenceLevel: -91 as dBm,
            centerFrequency: 1074.5e6 as Hertz, // TM-1 beacon IF
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
        transmitters: [{
          activeModem: 1,
          modems: [{
            isPowered: true,
            antenna_id: 1,
            modem_number: 1,
            isFaulted: false,
            isTransmitting: false,
            isTransmittingSwitchUp: false,
            isFaultSwitchUp: false,
            id: 1,
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
              frequency: 1094e6 as IfFrequency,
              power: -7 as dBm,
              bandwidth: 36e6 as Hertz,
              modulation: 'QPSK' as ModulationType,
              fec: '3/4' as FECType,
            },
          }],
        }],
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
    satellites: [
      tidemark1Satellite,
      tidemark2Satellite,
      tidemark3Satellite,
      ses10Satellite,
    ],
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
      description: 'Open the shift brief and acknowledge you understand the maintenance window plan.',
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
              'TIDEMARK-1 traffic moves to ME-02 for a 2-hour VT-01 maintenance window, then comes back next shift',
              'TIDEMARK-1 traffic moves to ME-02 permanently and VT-01 is decommissioned',
              'TIDEMARK-1 is taken out of service for the duration of the maintenance window',
              'ME-02 takes over all VT-01 satellites for the maintenance window',
            ],
            correctIndex: 0,
            explanation: 'Planned handover for a maintenance window. ME-02 holds TM-1 while the crew works VT-01. Return to service is the next shift.',
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
      description: 'Confirm the VT-01 link is clean before initiating the handover.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
              'A pre-handover snapshot documents what the link looked like healthy, so any post-handover anomaly can be attributed correctly',
              'It is required by the satellite operator before they allow a transfer',
              'It gives the maintenance crew advance notice that work is starting',
              'It is needed to recover billing data',
            ],
            correctIndex: 0,
            explanation: 'Baseline first. If something looks off on ME-02 after the transfer, you need to know whether it started before or after the handover.',
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
      description: 'Verify VT-01 antenna is still tracking TIDEMARK-1 and is the current traffic owner.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-pre-handover-dashboard'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-1',
          params: { noradId: 61525 },
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
      description: 'Switch to the Maine Ground Station to verify the receive side before committing.',
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
      description: 'Confirm Catherine has ME-02 locked on TIDEMARK-1 in program-track.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['switch-to-maine'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'ME-02 Locked on TIDEMARK-1',
          params: { noradId: 61525 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-verify-beacon-and-rx',
      nice: ['T0129', 'K0741'],
      title: 'ME-02 Receive Chain Hot',
      description: 'Verify the TIDEMARK-1 beacon is visible at ME-02 and the receiver is locked with healthy C/N margin.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-antenna-on-tm1'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'ME-02 Receiver Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 10 dB',
          params: {
            minCNRatio: 10,
            modemNumber: 1,
          },
          mustMaintain: true,
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
      description: 'Enable transmit on Modem 1 so the TX chain is staged - but leave the BUC muted and the HPA disabled. The handover transfer, not the operator, swaps RF authority between stations.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-beacon-and-rx'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
      description: 'Confirm what "ready to commit" means in a planned handover.',
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
              'Antenna locked, RX carrier with C/N margin, TX chain staged - modem transmitting into a muted BUC, HPA disabled until the transfer swaps RF authority',
              'BUC unmuted and HPA enabled now - the station must be radiating before the transfer',
              'Antenna locked is sufficient - the rest happens during the transfer',
              'A successful loopback test before the transfer',
            ],
            correctIndex: 0,
            explanation: 'Receive side proves the link works in; transmit side is staged but cold. If both stations radiated at the same transponder, the satellite would see two carriers - dual illumination. The handover stands the source down and brings the target up in one coordinated swap.',
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
      description: 'Select TIDEMARK-1 in the asset tree to access the traffic transfer controls.',
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
        {
          type: 'service-continuity',
          description: 'Service Continuity Maintained',
          params: { maxPacketLoss: 0.1 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-me-traffic-owner',
      nice: ['T0129', 'K0741'],
      title: 'Verify ME-02 Owns Traffic',
      description: 'Confirm ME-02 is now the traffic owner for TIDEMARK-1.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['execute-handover'],
      timeLimitSeconds: 1 * 60,
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
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'catherine-confirm-hot',
      nice: ['K0718', 'K0741'],
      title: 'Confirm with Catherine',
      description: 'Acknowledge Catherine\'s confirmation that ME-02 has the link clean.',
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
            explanation: 'Handover is committed. The unfinished work is on the source station - safe the RF chain and park the antenna for the crew.',
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
      description: 'The handover stood VT-01\'s transmit down automatically - HPA disabled, BUC muted. Verify it on the panel; never trust an automatic safing you have not looked at.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-vermont-safing'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Disabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
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
      description: 'Set the antenna tracking mode to MAINTENANCE so the dish parks at 5° elevation for the crew.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-safe-tx-chain'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
      description: 'Confirm VT-01 is safe to hand to the maintenance crew.',
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
              'HPA disabled alone is sufficient - the BUC cannot transmit without HPA',
              'Antenna stowed at 90° elevation is the correct maintenance position',
              'Powering off the entire RF rack is required before the crew approaches',
            ],
            correctIndex: 0,
            explanation: 'RF de-energized AND dish in a position the crew can reach. Stow at 90° protects against weather; maintenance at 5° lets a person work the feed.',
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
      description: 'Select the correct entry for the operations log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-final-rf-safety-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Handover Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which line correctly records this handover in the operations log?',
            options: [
              '1000 - Planned handover TM-1 VT-01 to ME-02 complete. VT-01 RF chain safed, antenna at maintenance position. Crew on-site for HPA waveguide inspection. ME-02 (Vega) carrying traffic. Return to service next shift.',
              '1000 - Emergency handover TM-1 VT-01 to ME-02. Cause unknown. Investigation pending.',
              '1000 - Maintenance crew arrived. Traffic handover deferred to next shift.',
              '1000 - TM-1 traffic resumed on VT-01 after maintenance complete.',
            ],
            correctIndex: 0,
            explanation: 'Who, what, why, where it stands, who has the link. The next operator should be able to pick up the shift without asking a question.',
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
        <em>[Text message from Dana at 09:42]</em>
      </p>
      <p>
        "Maintenance window opens at 10:00 - HPA waveguide gasket on VT-01. Catherine's pre-staged ME-02 on TM-1, RX hot, waiting on your commit. Verify her side, stage ME-02 transmit, do the transfer, safe VT-01 for the crew. They're at the gate in thirty."
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
          Catherine here. I've got TIDEMARK-1 in program-track from this side, beacon's clean, C/N's holding above ten. Receive side is yours to verify. Stage my TX cold - the transfer brings it up when you commit.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-switch-to-maine.mp3'),
      },
      'catherine-confirm-hot': {
        text: `
        <p>
          Maine has TM-1. Carrier's clean over here, no packet loss across the transfer. I've got it for the window - go take care of your station.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-catherine-confirm-hot.mp3'),
      },
      'switch-to-vermont-safing': {
        text: `
        <p>
          Maine's carrying. The transfer stood your TX down - verify HPA and BUC on the panel, then antenna to maintenance. Crew lead is on his way up.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-switch-to-vermont-safing.mp3'),
      },
      'log-handover-entry': {
        text: `
        <p>
          Clean handover. Log it and meet me in the conference room - I want to walk through the gasket replacement procedure with you before they start.
        </p>
        <p>
          Next shift you bring it back.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/11/obj-log-handover-entry.mp3'),
      },
    },
  },
};
