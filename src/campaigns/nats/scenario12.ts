import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 12: "Planned Maintenance: Return to Service"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 4 of 8)
 * Time Pressure: None (planned procedure - procedural cleanliness is the grade)
 * Calculation Required: NO - operational values already known
 * New UI Elements: None - reuses S2 power-up, S7 leftover-detection, S3 handover.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1314: Maintain network infrastructure
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - T0431: Check system hardware availability, functionality, integrity
 *
 * Supporting Codes:
 *   - T0153: Monitor network capacity and performance
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0741: Knowledge of system availability measures
 *   - S0421: Skill in operating network equipment
 *   - S0593: Skill in handling incidents
 *
 * Premise: Closes the S11-S12 planned-maintenance mini-arc. The maintenance crew
 * has finished waveguide gasket inspection on VT-01. TM-1 traffic is currently
 * being held at ME-02 (Catherine took it during S11). Player brings VT-01 back
 * online in a clean restoration sequence, catches a small leftover from the
 * maintenance crew (BUC gain bumped during testing), then coordinates the
 * traffic return from Catherine.
 *
 * Tone: Qualified operator. Dana intros via text and signs off; Catherine handles
 * the cross-station release dialogue; Marcus closes the customer loop. All quizzes
 * are SYSTEM-voiced. No tab coaching.
 *
 * Story Continuity:
 *   - S11 left VT-01 stowed and powered down; ME-02 holds TM-1 traffic.
 *   - The maintenance leftover (BUC gain at 50 dB instead of 23 dB operating value)
 *     is the same class of mistake as S7 — establishes that the maintenance crew's
 *     habits haven't changed.
 *   - Catherine is a peer, not a supervisor. She talks like Catherine, not Dana.
 *
 * Technical Reference (TIDEMARK-1 from VT-01):
 *   - Az 161.8°, El 34.2°, Pol 14°
 *   - LNB LO: 5250 MHz; Beacon RF: 4175.5 MHz; Beacon IF: 1074.5 MHz
 *   - BUC LO: 7000 MHz; Teleport carrier RF: 5906 MHz (TP-2); TX IF: 1094 MHz
 *   - Operating BUC gain: 23 dB (post-maintenance leftover: 50 dB - same as S7 testing value)
 */

export const scenario12Data: ScenarioData = {
  id: 'nats-scenario12',
  prerequisiteScenarioIds: ['nats-scenario11'],
  url: 'nats/scenarios/nats-scenario12',
  imageUrl: 'nats/12/card.png',
  number: 12,
  title: 'Planned Maintenance: Return to Service',
  subtitle: 'Post-Maintenance Restoration',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Maintenance Recovery',
  description: `Waveguide gasket inspection is done. Maintenance crew is clear of the antenna and signed out. VT-01 is stowed, RF chain cold, and Catherine is holding TM-1 traffic on ME-02.<br><br>Bring Vermont back the clean way: antenna on target, RX chain validated against the beacon, transmit side swept for any leftovers the maintenance crew left behind, then a coordinated handover return from Maine. Marcus will want to hear from us once SeaLink's link is back where it started.<br><br>No clock pressure. Just do it right.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Holding TM-1 traffic',
  ],
  timeLimitSeconds: 35 * 60, // 35 minutes
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: stowed for maintenance window, RF chain cold, BUC has a
      // gain leftover from maintenance crew's bench testing (50 dB instead
      // of operating 23 dB)
      {
        ...vermontGroundStation,
        antennasState: [
          {
            isPowered: true,
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            polarization: 0 as Degrees,
            trackingMode: 'stow',
            isBeaconLocked: false,
            targetSatelliteId: null,
            slewing: false,
            beaconCN: 0 as dB,
            isLocked: false,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // RF chain safed for maintenance window. LNB was operational before
            // the window so it restabilizes quickly on power-up; we don't override
            // the thermalStabilizationTime fields (inherit instant-stable from
            // vermontGroundStation defaults).
            lnb: {
              isPowered: false,
            },
            buc: {
              isPowered: false,
              isMuted: true,
              isLoopback: false,
              // ----- Maintenance leftover -----
              // Crew bumped BUC gain to 50 dB during bench testing and forgot
              // to dial it back. Won't matter until the chain is energized, but
              // if HPA is brought up at this gain the output stage gets driven
              // hard. Operator should catch this before powering up.
              gain: 50 as dB,
              temperature: 25,
              currentDraw: 0,
              outputPower: -10 as dBm,
            },
            hpa: {
              isPowered: false,
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
              outputPower: 0 as dBm,
              backOff: 10,
            },
          }),
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                isTransmitting: false,
                isTransmittingSwitchUp: false,
              },
            ],
          },
        ],
      },
      // ME-02: holding TIDEMARK-1 traffic. Catherine has the bird while VT-01
      // is in the maintenance window. LO overridden to 5250 to match VT-01 IFs.
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
            beaconFrequencyHz: 1074.5e6 as Hertz,
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 is holding TM-1: LNB LO override 5250 (matches VT-01 IFs),
            // TX chain hot and carrying customer traffic until handover return.
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            centerFrequency: 1074.5e6 as Hertz,
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
    satellites: [
      tidemark1Satellite,
      tidemark2Satellite,
      ses10Satellite,
    ],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'ME-02', // Catherine is holding it at scenario start
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-12?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Restoration Brief',
      description: 'Open the restoration brief and acknowledge you are ready to bring VT-01 back online.',
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
          description: 'Ready for Restoration',
          params: {
            character: Character.SYSTEM,
            question: 'Maintenance complete, antenna stowed, ME-02 holding TM-1. Ready to bring VT-01 back?',
            options: ['Confirmed. Beginning restoration.'],
            correctIndex: 0,
            explanation: 'Restoration timer started. Procedural cleanliness is the grade today.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: PRE-RESTORATION STATE VERIFICATION
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
      id: 'pre-restoration-dashboard',
      nice: ['T0431', 'K0741'],
      title: 'Confirm Safed State',
      description: 'Verify VT-01 is in the expected post-maintenance state - cold RF chain, antenna stowed.',
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
          description: 'Verify Post-Maintenance State',
          params: {
            character: Character.SYSTEM,
            question: 'What state should VT-01 be in before starting restoration?',
            options: [
              'Antenna stowed, LNB/BUC/HPA powered off, GPSDO still running',
              'Antenna on TIDEMARK-1, full RF chain hot, modem transmitting',
              'Antenna stowed, RF chain hot, modem standby',
              'All equipment powered down including GPSDO',
            ],
            correctIndex: 0,
            explanation: 'You parked the dish at maintenance position (5°) for the crew; on sign-out they stowed it at 90° per post-work SOP. Stowed antenna + cold RF chain + GPSDO still up for timing continuity is the expected handback state. Anything else means somebody touched something they should not have.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 2: ANTENNA RESTORATION
    // ============================================================
    {
      id: 'repoint-antenna-tm1',
      nice: ['T1567', 'S0421', 'K1032'],
      title: 'Repoint VT-01 to TIDEMARK-1',
      description: 'Set tracking mode to program-track and acquire TIDEMARK-1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['pre-restoration-dashboard'],
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
          description: 'Program-Track Mode',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-1',
          params: { noradId: 61525 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RX CHAIN RESTORATION
    // ============================================================
    {
      id: 'power-up-lnb',
      nice: ['T1567', 'S0421'],
      title: 'Power Up LNB',
      description: 'Power on the LNB and wait for thermal stabilization. LO is preserved at 5,250 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-antenna-tm1'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stable',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-tm1-beacon',
      nice: ['T0153', 'K0773'],
      title: 'Acquire TIDEMARK-1 Beacon',
      description: 'Tune the spectrum analyzer to the TM-1 beacon IF (1,074.5 MHz) and verify the beacon.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-lnb'],
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
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1,074.5 MHz IF',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 0.5e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-rx-modem-lock',
      nice: ['T0153', 'K0740'],
      title: 'Verify RX Modem Lock',
      description: 'Confirm the receiver modem regains lock on the carrier with healthy C/N margin.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-tm1-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1 },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N ≥ 10 dB',
          params: { minCNRatio: 10 },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: POST-MAINTENANCE LEFTOVER SWEEP
    // ============================================================
    {
      id: 'tx-chain-inspection',
      nice: ['T0431', 'S0593'],
      title: 'TX Chain Pre-Power Inspection',
      description: 'Inspect the TX chain panel before energizing. Look for anything the maintenance crew left out of operating spec.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-modem-lock'],
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
          type: 'status-check',
          description: 'Identify the Leftover',
          params: {
            character: Character.SYSTEM,
            question: 'BUC, HPA, and TX modem are all powered off as expected. What is out of operating spec?',
            options: [
              'BUC gain is at 50 dB - testing value left over from maintenance, operating value is 23 dB',
              'BUC LO is wrong - operating value should be 6,500 MHz, not 7,000 MHz',
              'HPA backoff is at 10 dB - should be 0 dB for full operation',
              'Nothing is out of spec - state matches the operating baseline',
            ],
            correctIndex: 0,
            explanation: 'The bench-test gain (50 dB) was never dialed back to 23 dB. With BUC powered off this is harmless, but bringing the chain up at this gain would over-drive the HPA the moment loopback or transmit was engaged. Catch it before you energize.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // ============================================================
    // PHASE 5: TX CHAIN RESTORATION
    // ============================================================
    {
      id: 'power-up-buc',
      nice: ['T1567', 'S0421', 'K0770'],
      title: 'Power Up BUC (Muted)',
      description: 'Power on the BUC - it stays muted from the safed state, so no RF flows. Reference lock should come up against the locked GPSDO.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tx-chain-inspection'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'BUC Powered',
          params: { equipment: 'buc' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Still Muted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'correct-buc-gain',
      nice: ['T1567', 'S0421'],
      title: 'Restore BUC Operating Gain',
      description: 'With the BUC powered but still muted, dial the gain back to its 23 dB operating value before the rest of the chain comes up.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-gain-set',
          description: 'BUC Gain Set to 23 dB',
          params: {
            gain: 23 as dB,
            gainTolerance: 2 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-up-hpa',
      nice: ['T1567', 'S0421'],
      title: 'Power Up HPA',
      description: 'Power on the HPA. Output stays disabled until enable is toggled.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['correct-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'HPA Powered',
          params: { equipment: 'hpa' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'start-modem-transmitting',
      nice: ['T1567', 'S0421'],
      title: 'Enable TX Modem',
      description: 'Enable the transmit modem. Operational config (1,094 MHz IF, QPSK 3/4, 36 MHz) is preserved.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-hpa'],
      timeLimitSeconds: 2 * 60,
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
          description: 'TX Modem Transmitting',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-tx-staged',
      nice: ['T1567', 'K0645', 'S0421'],
      title: 'Confirm TX Staged Cold',
      description: 'Confirm the transmit chain is staged for the handover return: modem transmitting into a muted BUC, HPA output disabled. The transfer brings VT-01 RF up as Maine stands down.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['start-modem-transmitting'],
      timeLimitSeconds: 2 * 60,
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
          description: 'TX Modem Transmitting (into muted BUC)',
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
        {
          type: 'status-check',
          description: 'Why TX Stays Cold',
          params: {
            character: Character.SYSTEM,
            question: 'ME-02 is still carrying TIDEMARK-1. Why does VT-01\'s transmit chain stay cold (BUC muted, HPA disabled) until the handover executes?',
            options: [
              'Two stations radiating at the same transponder is dual illumination - the handover swaps RF authority in one coordinated action so only one uplink is ever on the air',
              'The BUC cannot be unmuted while the antenna is in program-track',
              'It saves power until the customer confirms the return',
              'The HPA needs the maintenance crew to re-certify it before it can radiate',
            ],
            correctIndex: 0,
            explanation: 'Same rule that protected the S11 hand-off: the satellite must never see two carriers fighting on one transponder. Stage the chain, then let the transfer stand Maine down and bring Vermont up atomically.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 6: HANDOVER RETURN FROM ME-02
    // ============================================================
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Switch to ME-02',
      description: 'Move to the Maine console to coordinate the handover return with Catherine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-tx-staged'],
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
      id: 'pre-handover-criteria',
      nice: ['T0153', 'K0741', 'S0593'],
      title: 'Confirm Handover-Ready State',
      description: 'Confirm what has to be true on VT-01 before pulling traffic back from Maine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Handover Criteria',
          params: {
            character: Character.SYSTEM,
            question: 'Which combination is required on VT-01 before pulling TM-1 traffic back?',
            options: [
              'Beacon lock + RX modem lock with C/N margin + TX chain staged cold (modem on, BUC muted, HPA disabled)',
              'BUC unmuted and HPA radiating - the link must be hot before the transfer',
              'Antenna pointed at TM-1 only - the rest comes up when traffic transfers',
              'No specific criteria - planned handovers cannot fail',
            ],
            correctIndex: 0,
            explanation: 'Symmetric to S11: the receiving station proves its receive side and stages its transmit side cold. The transfer stands Maine down and brings Vermont up in one swap - radiating early would put two carriers on the transponder.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'execute-handover-return',
      nice: ['T0129', 'S0421', 'S0593'],
      title: 'Pull Traffic Back to VT-01',
      description: 'Execute the planned handover return: TIDEMARK-1 traffic from ME-02 back to VT-01.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['pre-handover-criteria'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'satellite-selected',
          description: 'TIDEMARK-1 Selected',
          params: { assetSatelliteId: 'sat-61525' },
          mustMaintain: false,
        },
        {
          type: 'traffic-transferred',
          description: 'Traffic Returned to VT-01',
          params: {
            sourceStation: 'ME-02',
            targetStation: 'VT-01',
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
      id: 'verify-handover-success',
      nice: ['T0153', 'K0741'],
      title: 'Confirm Return Complete',
      description: 'Verify the handover return landed clean.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['execute-handover-return'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'VT-01 BUC Unmuted by the Transfer',
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'VT-01 HPA Enabled by the Transfer',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Handover Result',
          params: {
            character: Character.SYSTEM,
            question: 'Traffic ownership has returned to VT-01. What confirms the return was clean?',
            options: [
              'VT-01 owns TM-1 traffic, ME-02 TX stood down, no packet loss reported, no new alarms',
              'ME-02 antenna automatically stowed',
              'VT-01 C/N ratio increased after the transfer',
              'Customer dialed in to manually re-register',
            ],
            correctIndex: 0,
            explanation: 'Clean return: target station owns the traffic, source station released, no service interruption, no alarms. From the customer side, nothing happened.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 7: CUSTOMER NOTIFICATION & SHIFT CLOSE
    // ============================================================
    {
      id: 'notify-customer',
      nice: ['S0478', 'K0645'],
      title: 'Notify SeaLink',
      description: 'Confirm the right customer notification for a clean return-to-service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-handover-success'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Comms',
          params: {
            character: Character.SYSTEM,
            question: 'Marcus is waiting for confirmation. What is the right message?',
            options: [
              'VT-01 restored, TM-1 traffic returned to primary station, no service interruption observed.',
              'Service restored, please rerun all customer health checks on your end.',
              'Brief outage during handover - apologies, please flag any data loss.',
              'No notification needed - the link was never down from their perspective.',
            ],
            correctIndex: 0,
            explanation: 'Notify the spacecraft side of the change in source station and confirm no impact. They do not need to act, but they do need to know where the uplink is coming from now.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'final-dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Final Dashboard Sweep',
      description: 'Final alarm sweep on VT-01 before logging the maintenance cycle complete.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['notify-customer'],
      timeLimitSeconds: 1 * 60,
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
          description: 'Post-Restoration Health',
          params: {
            character: Character.SYSTEM,
            question: 'Final VT-01 health check after restoration.',
            options: [
              'No active alarms - all systems nominal, TM-1 traffic on primary',
              'BUC over-temperature',
              'LNB reference unlocked',
              'HPA overdriven',
            ],
            correctIndex: 0,
            explanation: 'Clean restoration. The BUC gain catch earlier is the reason the HPA is not overdriven right now.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-maintenance-complete',
      nice: ['K0645', 'T1314'],
      title: 'Log Maintenance Cycle Complete',
      description: 'Select the correct entry to close out the maintenance cycle in the ops log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-dashboard-sweep'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly closes out the S11-S12 maintenance cycle?',
            options: [
              'VT-01 returned to service post-waveguide-gasket inspection. TM-1 traffic returned from ME-02. Maintenance leftover (BUC gain 50 dB) corrected before energizing. No customer impact.',
              'VT-01 restored. Customer reported brief outage during handover.',
              'Maintenance window incomplete - HPA work deferred.',
              'Traffic transferred to ME-02 for weather event.',
            ],
            correctIndex: 0,
            explanation: 'Logging the leftover is the part that matters. Next shift sees what the maintenance crew did and what we caught - that is how the pattern gets fixed.',
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
        <em>[Text message from Dana at 09:14]</em>
      </p>
      <p>
        "Crew's clear. Gasket replaced, signed off. Catherine has TM-1 on Maine - she's good for another hour but no reason to make her wait. Bring Vermont back, pull traffic home, ping Marcus when done. Standard restoration."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/12/intro.mp3'),
    },
    objectives: {
      'verify-rx-modem-lock': {
        text: `
        <p>
          RX side's back. Before you energize anything on transmit - actually look at the TX panel. Maintenance crews leave bench-test values behind. Same crew left the BUC unmuted in loopback a few months back. Catch it on the panel, not after the HPA's been on for ten seconds.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-verify-rx-modem-lock.mp3'),
      },
      'select-maine-station': {
        text: `
        <p>
          Catherine here. I've been watching your beacon come up on the network status - looks like you're ready to take TM-1 back. C/N's been steady our side, no events. Whenever you're set, give me the call.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-select-maine-station.mp3'),
      },
      'execute-handover-return': {
        text: `
        <p>
          Clean release on my end. Maine TX is down, antenna's still on TM-1 if you want a warm standby. Nice work bringing Vermont back without a hole in the link.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-execute-handover-return.mp3'),
      },
      'notify-customer': {
        text: `
        <p>
          Marcus from Halifax. Spacecraft side just saw your uplink come back on TM-1 - clean signal, right in the passband, no anomalies. Customers never noticed the swap. Beauty, eh?
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-notify-customer.mp3'),
      },
      'log-maintenance-complete': {
        text: `
        <p>
          Maintenance cycle closed. You caught the BUC gain leftover - that's the kind of save that doesn't show up on a dashboard. Log it the way you wrote it; I want the next crew that gets these guys to see the pattern.
        </p>
        <p>
          Good shift.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-log-maintenance-complete.mp3'),
      },
    },
  },
};
