import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite } from './satellites';


/**
 * NATS Level 7: "Uplink Validation"
 *
 * Phase: Core Mechanics (Phase 1, Scenario 7 of 8)
 * Time Pressure: Moderate (per-objective timers)
 * Calculation Required: YES - IF frequency calculations for uplink
 * New UI Elements: BUC loopback mode, TX modem configuration, uplink power verification
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0077: Skill in securing network communications
 *   - T1313: Test network infrastructure, including software and hardware devices
 *
 * Supporting Codes:
 *   - K0740: Knowledge of network performance management
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K0792: Knowledge of network configurations
 *   - K1032: Knowledge of satellite communication systems
 *   - S0421: Skill in operating network equipment
 *   - S0582: Skill in troubleshooting system performance
 *   - T0153: Monitor network capacity and performance
 *   - T0081: Diagnose network connectivity problems
 *   - T1567: Equipment configuration happens throughout
 *
 * Premise: Routine post-maintenance uplink validation. The Vermont station completed
 * overnight maintenance on the transmit chain. Charlie is off-site but calls to check
 * in briefly. Dana Torres (Shift Supervisor) is on-site handling admin tasks but will
 * check in at key decision points. Player must work independently.
 *
 * Key Learning Objectives:
 * 1. Independent verification of RX chain status
 * 2. TX modem IF frequency calculation (RF - BUC LO = IF)
 * 3. BUC loopback mode for pre-transmission validation
 * 4. Troubleshooting a minor fault (BUC left unmuted in loopback causing high current)
 * 5. Full uplink enable sequence with encryption awareness
 *
 * Technical Reference (TIDEMARK-1):
 *   - Uplink RF: 5943 MHz (TP-1 center)
 *   - BUC LO: 7000 MHz
 *   - TX IF: 1057 MHz (7000 - 5943 = 1057)
 *   - Beacon RF: 4175.5 MHz
 *   - LNB LO: 5250 MHz
 *   - Beacon IF: 1074.5 MHz (5250 - 4175.5 = 1074.5)
 *
 * Character Notes:
 *   - Charlie Brooks: Off-site, brief intro call and final check-in only
 *   - Dana Torres: Shift Supervisor, on-site but busy, peer-level, slightly skeptical
 *     of new hire's readiness. Checks in at key decision points. "Just making sure
 *     neither of us gets in trouble."
 */

export const scenario7Data: ScenarioData = {
  id: 'nats-scenario7',
  url: 'nats/scenarios/nats-scenario7',
  prerequisiteScenarioIds: ['nats-scenario6'],
  imageUrl: 'nats/7/card.png',
  number: 7,
  title: 'Uplink Validation',
  subtitle: 'Transmit Enable Sequence & Power Verification',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Operations Phase',
  description: `The Vermont station completed overnight maintenance on the transmit chain - waveguide inspection and HPA tube replacement. Before resuming normal operations, you need to validate the entire uplink path.<br><br>Charlie is off-site today. Dana Torres, the shift supervisor, is handling paperwork but will check in periodically. You're expected to handle this independently.<br><br>Verify the receive chain, configure the transmitter, use BUC loopback to validate your signal, then bring the uplink online.<br><br>Key lesson: Always validate before you radiate.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (BUC with Loopback)',
    'Spectrum Analyzer',
    'Receiver Modem',
    'Transmitter Modem',
    'High Power Amplifier',
  ],
  timeLimitSeconds: 35 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // Post-maintenance state: TX chain disabled, RX operational
            // BUC left unmuted in loopback mode by maintenance crew - causing high current draw
            buc: {
              isMuted: false, // Left unmuted by maintenance
              isLoopback: true, // Left in loopback mode by maintenance
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 50 as dB, // Normal operating gain
              temperature: 52, // Elevated due to active loopback
              currentDraw: 5.2, // High current draw alarm triggered
            },
            hpa: {
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
              outputPower: 0 as dBm,
            },
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 60,
            },
          }),
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                ifSignal: {
                  frequency: 950e6 as IfFrequency, // Incorrect - needs to be set to 1057 MHz
                  bandwidth: 36e6 as Hertz,
                  power: -10 as dBm,
                  modulation: 'QPSK',
                  fec: '3/4',
                  signalId: 'VT-01-TX-Modem-1-IF',
                  serverId: 1,
                  noradId: null,
                  polarization: 'H',
                  feed: 'TX',
                  isDegraded: false,
                  origin: SignalOrigin.TRANSMITTER,
                  noiseFloor: -140 as dBm,
                  gainInPath: 0 as dBi,
                },
                isTransmitting: false, // Not transmitting yet
                isTransmittingSwitchUp: false,
              },
            ],
          },
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 950e6 as Hertz, // Not tuned to beacon - player must configure
          },
        ],
      },
      { ...maineGroundStation, isOperational: false },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-7?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [tidemark1Satellite, ses10Satellite],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs)
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open the mission brief to understand the post-maintenance validation requirements.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Proceed',
          params: {
            question: 'Have you reviewed the mission brief and are you ready to begin?',
            options: ['Yes, I have read the mission brief and I am ready to proceed.'],
            correctIndex: 0,
            explanation: 'The mission timer has started. Good luck!',
            pointPenalty: 0,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // RECEIVE CHAIN VERIFICATION
    // ============================================================
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment
      nice: ['S0421'],
      title: 'Access Vermont Ground Station',
      description: 'Select the Vermont Ground Station to begin system checks.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Ground Station Selected',
          params: { groundStationId: 'VT-01' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'check-dashboard-status',
      // T0153: Monitor network capacity and performance - checking system status
      // K0741: Knowledge of system availability measures - alarm awareness
      nice: ['T0153', 'K0741'],
      title: 'Check Dashboard for Alarms',
      description: 'Before proceeding with validation, check the Dashboard for any active alarms.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Dashboard Tab Open',
          params: { tab: 'dashboard' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Identify Active Alarms',
          params: {
            question: 'What alarm condition is currently displayed on the Dashboard?',
            options: [
              'BUC High Current Draw',
              'LNB Reference Unlocked',
              'HPA Output Fault',
              'No active alarms',
            ],
            correctIndex: 0,
            explanation: 'The BUC is drawing too much current. The maintenance crew left it unmuted while in loopback mode, which means it\'s actively processing signal. We need to mute it and disable loopback before proceeding.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'diagnose-buc-high-current',
      // T0081: Diagnose network connectivity problems - fault diagnosis
      // S0582: Skill in troubleshooting system performance
      nice: ['T0081', 'S0582'],
      title: 'Diagnose BUC High Current',
      description: 'Navigate to the TX Chain and identify the cause of the high current draw.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-dashboard-status'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Identify Cause',
          params: {
            question: 'Looking at the BUC panel, what is the likely cause of the high current draw?',
            options: [
              'BUC has been on for a few hours and is overheating',
              'BUC gain is set too high',
              'External reference is unlocked',
              'BUC temperature is too low',
            ],
            correctIndex: 1,
            explanation: 'The BUC gain is set to 50 dB and since it\'s in loopback mode and unmuted, it\'s actively processing signal, leading to high current draw. The maintenance crew likely forgot to mute it after testing.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'resolve-buc-high-current',
      // S0582: Skill in troubleshooting system performance - fault resolution
      // K0740: Knowledge of network performance management
      nice: ['S0582', 'K0740'],
      title: 'Secure BUC State',
      description: 'Mute the BUC and disable loopback to stop the unnecessary current draw.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-buc-high-current'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-loopback-disabled',
          description: 'BUC Loopback Disabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-fault-cleared',
      // K0741: Knowledge of system availability measures - alarm verification
      // T0153: Monitor network capacity and performance - confirming resolution
      nice: ['K0741', 'T0153'],
      title: 'Verify Fault Cleared',
      description: 'Confirm the Dashboard no longer shows the BUC high current alarm.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['resolve-buc-high-current'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Dashboard Tab Open',
          params: { tab: 'dashboard' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Confirm Alarm Cleared',
          params: {
            question: 'What is the current BUC status on the Dashboard?',
            options: [
              'Normal - current draw within limits, no active alarms',
              'Warning - current still too high',
              'Fault - BUC offline',
              'Unknown - BUC not reporting',
            ],
            correctIndex: 0,
            explanation: 'The BUC has been muted and loopback disabled. The high current alarm has cleared. Always verify alarm resolution on the Dashboard before proceeding.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-antenna-status',
      // S0421: Skill in operating network equipment
      nice: ['S0421'],
      title: 'Verify Antenna Status',
      description: 'Check the ACU Control tab and confirm antenna configuration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-fault-cleared'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: false,
        },
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on TIDEMARK-1',
          params: { satelliteId: 61525 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Antenna Status Verified',
          params: {
            question: 'What is the current antenna tracking mode and target satellite?',
            options: [
              'Program Track - TIDEMARK-1',
              'Program Track - TIDEMARK-2',
              'Step Track - TIDEMARK-1',
              'Maintenance - Stowed',
            ],
            correctIndex: 0,
            explanation: 'The antenna is in Program Track mode, locked on TIDEMARK-1.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-lnb-operational',
      // T0153: Monitor network capacity and performance
      nice: ['T0153'],
      title: 'Verify LNB Operational',
      description: 'Navigate to the RX Analysis tab, verify LNB operational status, and confirm your understanding of the displayed parameters.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-antenna-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Noise Temperature Understanding',
          params: {
            question:
              'What does the LNB noise temperature value indicate about receiver performance?',
            options: [
              'Lower noise temperature means better sensitivity and signal-to-noise ratio',
              'Higher noise temperature means better sensitivity',
              'Noise temperature only affects transmit power',
              'Noise temperature has no impact on signal quality',
            ],
            correctIndex: 0,
            explanation:
              'Noise temperature quantifies the thermal noise added by the LNB. Lower values (e.g., 45K) mean less noise is added to the received signal, improving the signal-to-noise ratio and receiver sensitivity.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-beacon',
      // K0773: Knowledge of telecommunications principles and practices
      // K1032: Knowledge of satellite communication systems
      nice: ['K0773', 'K1032'],
      title: 'Acquire TIDEMARK-1 Beacon',
      description: 'Configure the spectrum analyzer (center frequency, span, and amplitude range) to properly display and identify the satellite beacon.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-lnb-operational'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Center Frequency: 1074.5 MHz',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 2 kHz (narrow for CW beacon)',
          params: {
            span: 0.002e6 as Hertz,
            spanTolerance: 0.002e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude: around -100 dBm',
          params: {
            minAmplitude: -100 as dBm,
            minAmplitudeTolerance: 10,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude: around -50 dBm',
          params: {
            maxAmplitude: -50 as dBm,
            maxAmplitudeTolerance: 20,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -40 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Beacon Identification',
          params: {
            question:
              'What distinguishes the beacon signal from other signals on the spectrum display?',
            options: [
              'Beacon is a narrow CW carrier spike, while data signals have wider bandwidth',
              'Beacon is wider than data signals',
              'Beacon has modulation visible in the spectrum shape',
              'Beacon power level is always exactly -50 dBm',
            ],
            correctIndex: 0,
            explanation:
              'Beacons are unmodulated Continuous Wave (CW) carriers that appear as narrow spikes. Their purpose is to provide a frequency and power reference independent of traffic.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Beacon Purpose',
          params: {
            question:
              'What does successful beacon acquisition confirm about the receive chain?',
            options: [
              'Antenna is pointed at the satellite',
              'LNB is functioning and converting RF to IF',
              'Signal path from antenna to spectrum analyzer is operational',
              'All of the above',
            ],
            correctIndex: 3,
            explanation:
              'The beacon validates the entire receive chain: antenna pointing, LNB operation, and signal routing. If any component fails, the beacon disappears.',
            pointPenalty: 5,
            preserveOptionOrder: true,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'quiz-beacon-frequency',
      // K0773: Knowledge of telecommunications principles and practices
      nice: ['K0773'],
      title: 'Confirm Beacon IF Frequency',
      description: 'Verify understanding of the beacon frequency conversion.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon IF Calculation',
          params: {
            question: 'The TIDEMARK-1 beacon is at 4,175.5 MHz RF. With an LNB LO of 5,250 MHz, what IF frequency is the beacon at?',
            options: [
              '1,074.5 MHz',
              '1,174.5 MHz',
              '9,425.5 MHz',
              '925.5 MHz',
            ],
            correctIndex: 0,
            explanation: 'IF = LO - RF = 5,250 - 4,175.5 = 1,074.5 MHz. The LNB downconverts C-band RF to L-band IF.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // TRANSMIT CHAIN CONFIGURATION
    // ============================================================
    {
      id: 'calculate-tx-if',
      // K0773: Knowledge of telecommunications principles and practices
      nice: ['K0773'],
      title: 'Calculate TX IF Frequency',
      description: 'Determine the correct transmitter modem IF frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-beacon-frequency'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'TX IF Frequency Calculated',
          params: {
            question: 'TIDEMARK-1 TP-1 uplink is 5,943 MHz RF. The BUC LO is 7,000 MHz. What TX IF frequency is required?',
            options: [
              '1,057 MHz',
              '12,943 MHz',
              '957 MHz',
              '1,157 MHz',
            ],
            correctIndex: 0,
            explanation: 'TX IF = BUC LO - RF = 7,000 - 5,943 = 1,057 MHz. The BUC upconverts IF to RF.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-tx-modem',
      // K0792: Knowledge of network configurations
      // T1567: Equipment configuration happens throughout
      nice: ['K0792', 'T1567'],
      title: 'Configure TX Modem',
      description: 'Set the transmitter modem frequency, bandwidth, modulation, and power.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-tx-if'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency: 1,057 MHz',
          params: {
            frequency: 1057e6,
            frequencyTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'TX Bandwidth: 36 MHz',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'TX Modulation: QPSK',
          params: { modulation: 'QPSK' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'TX FEC: 3/4',
          params: { fec: '3/4' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-power-set',
          description: 'TX Power: -7 dBm',
          params: {
            power: -7,
            powerTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'TX Modem Transmitting',
          params: {
            isTransmitting: true
          },
          maintainUntilObjectiveComplete: true,
        }
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // LOOPBACK VALIDATION
    // ============================================================
    {
      id: 'reduce-buc-gain',
      // S0582: Skill in troubleshooting system performance
      nice: ['S0582'],
      title: 'Reduce BUC Gain for Loopback',
      description: 'Lower the BUC gain to prevent overloading the receive chain during loopback testing.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-tx-modem'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-gain-set',
          description: 'BUC Gain Reduced to 20 dB',
          params: {
            gain: 20 as dB,
            gainTolerance: 2 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-loopback',
      // T1313: Test network infrastructure, including software and hardware devices
      // T1567: Equipment configuration happens throughout
      nice: ['T1313', 'T1567'],
      title: 'Enable BUC Loopback',
      description: 'Toggle loopback mode ON to route the TX signal back to the receive chain for testing without transmitting to the satellite.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['reduce-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-loopback-enabled',
          description: 'BUC Loopback Enabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Loopback Mode Understanding',
          params: {
            question: 'What does enabling BUC loopback mode do?',
            options: [
              'Routes the TX RF signal to the LNB instead of the HPA',
              'Increases BUC output power for testing',
              'Disables the BUC for maintenance',
              'Bypasses the HPA to reduce power consumption and improve performance',
            ],
            correctIndex: 0,
            explanation: 'Loopback mode internally routes the BUC output signal back to the receive chain, allowing you to verify the TX modem and BUC are working without actually transmitting RF power through the antenna.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-loopback-signal',
      // T1313: Test network infrastructure, including software and hardware devices
      nice: ['T1313'],
      title: 'Verify Loopback Signal',
      description:
        'Configure the spectrum analyzer and LNB to view the loopback signal. Set the LNB LO to 7000 MHz to match the BUC LO for direct IF comparison, then tune to the TX IF frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-loopback'],
      timeLimitSeconds: 5 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 7000 MHz',
          params: {
            loFrequency: 7000 as MHz,
            loFrequencyTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at TX IF',
          params: {
            centerFrequency: 1057e6 as Hertz,
            centerFrequencyTolerance: 5e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span Set for Signal View',
          params: {
            span: 50e6,
            frequencyTolerance: 20e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude Set to -100 dBm',
          params: {
            minAmplitude: -100,
            minAmplitudeTolerance: 5,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude Set to -20 dBm',
          params: {
            maxAmplitude: -20,
            maxAmplitudeTolerance: 5,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW Set to Auto',
          params: {
            rbw: null as unknown as number,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Loopback Signal Verified',
          params: {
            question:
              'With the LNB LO at 7000 MHz and spectrum analyzer centered at 1,057 MHz, what do you observe?',
            options: [
              'A 36 MHz wide signal centered at 1,057 MHz - the TX modem output via loopback',
              'No signal visible at 1,057 MHz',
              'Only the beacon signal at 1,074.5 MHz',
              'A narrow CW carrier spike',
            ],
            correctIndex: 0,
            explanation:
              'By setting the LNB LO to 7000 MHz (matching the BUC LO), we can directly compare TX and RX IF frequencies. The loopback signal appears as a 36 MHz wide modulated carrier at 1,057 MHz, confirming the TX modem output and BUC loopback path are working correctly.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'quiz-loopback-purpose',
      // T1313: Test network infrastructure, including software and hardware devices
      nice: ['T1313'],
      title: 'Confirm Loopback Understanding',
      description: 'Verify understanding of the loopback test.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-loopback-signal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Loopback Purpose Understood',
          params: {
            question: 'What does a successful loopback test verify?',
            options: [
              'TX modem output and BUC signal path are functioning',
              'The satellite transponder is responding',
              'The HPA is at full power',
              'The antenna is pointed correctly',
            ],
            correctIndex: 0,
            explanation: 'Loopback testing verifies the low-power transmit chain (modem and BUC) without engaging the HPA or transmitting. This catches configuration errors before they cause interference.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // UPLINK ENABLE SEQUENCE
    // ============================================================
    {
      id: 'quiz-encryption-status',
      // S0077: Skill in securing network communications
      nice: ['S0077'],
      title: 'Verify Encryption Status',
      description: 'Confirm link security configuration before transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-loopback-purpose'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-crypto-status',
          description: 'TX Encryption Active',
          params: { cryptoMode: 'ACTIVE' },
          mustMaintain: false,
        },
        {
          type: 'tx-key-status',
          description: 'TX Encryption Key Valid',
          params: { keyStatus: 'Valid' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Encryption Status Verified',
          params: {
            question: 'What is the encryption status for this uplink?',
            options: [
              'AES-256 Enabled',
              'AES-128 Enabled',
              'Encryption Disabled',
              'Key Expired - Renewal Required',
            ],
            correctIndex: 0,
            explanation:
              'Link encryption is AES-256 per the TIDEMARK-1 service agreement. Never transmit without verifying encryption status.',
            pointPenalty: 10,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'disable-loopback',
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['S0421', 'T1567'],
      title: 'Disable Loopback Mode',
      description: 'Disable loopback to prepare for HPA enable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-encryption-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-loopback-disabled',
          description: 'BUC Loopback Disabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-hpa-output',
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['S0421', 'T1567'],
      title: 'Enable HPA Output',
      description: 'Enable the HPA output stage.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-loopback'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not Overdriven',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // FINAL VERIFICATION
    // ============================================================
    {
      id: 'verify-hpa-power',
      // T0153: Monitor network capacity and performance
      // K0740: Knowledge of network performance management
      nice: ['T0153', 'K0740'],
      title: 'Increase HPA Output Power',
      description:
        'Lower the HPA backoff to reach the minimum output power required for reliable uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-hpa-output'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-output-power-set',
          description: 'HPA Output Power Above 400 W',
          params: { minOutputPower: 400 },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'final-verification',
      // T1313: Test network infrastructure, including software and hardware devices
      nice: ['T1313'],
      title: 'Final Configuration Verification',
      description: 'Confirm complete uplink configuration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-power'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Configuration Verified',
          params: {
            question: 'Which statement correctly describes the validated uplink?',
            options: [
              'TX IF: 1,057 MHz → RF: 5,943 MHz, QPSK 3/4, AES-256',
              'TX IF: 957 MHz → RF: 5,843 MHz, QPSK 1/2, AES-128',
              'TX IF: 1,057 MHz → RF: 5,943 MHz, 8PSK 3/4, Unencrypted',
              'TX IF: 1,157 MHz → RF: 6,043 MHz, QPSK 3/4, AES-256',
            ],
            correctIndex: 0,
            explanation: 'The validated uplink: TX IF 1,057 MHz upconverted to 5,943 MHz RF (BUC LO 7,000 MHz), QPSK modulation with 3/4 FEC, AES-256 encryption.',
            pointPenalty: 5,
            character: Character.DANA_TORRES,
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
        Hey, it's Charlie. Quick call - I'm stuck at the main office all day. Paperwork.
      </p>
      <p>
        Overnight crew finished the HPA work. You need to validate the uplink before we go live. Standard post-maintenance procedure.
      </p>
      <p>
        Dana's on shift if you need anything, but you should be able to handle this. Mission Brief has the details.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/7/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Dana Torres, shift supervisor. Don't think we've met yet. Charlie mentioned you'd be handling the uplink validation solo today.
        </p>
        <p>
          Just making sure neither of us gets in trouble - I'll check in at a few points. Don't wait for me though. Open your checklist and get started.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-review-mission-brief.mp3'),
      },
      'check-dashboard-status': {
        text: `
        <p>
          Heads up - I see there's a BUC alarm on the board. Looks like maintenance may have left something misconfigured.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-check-dashboard-status.mp3'),
      },
      'diagnose-buc-high-current': {
        text: `
        <p>
          Bingo. We will worry about the gain later, for now just mute it and disable loopback so we can clear that alarm. That will stop the high current draw.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-diagnose-buc-high-current.mp3'),
      },
      'resolve-buc-high-current': {
        text: `
        <p>
          Good catch. Current draw should normalize now.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-resolve-buc-high-current.mp3'),
      },
      'acquire-beacon': {
        text: `
        <p>
          RX chain confirmed. Moving on.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-acquire-beacon.mp3'),
      },
      'enable-loopback': {
        text: `
        <p>
          Same high current issue. You'll need to work around that for the loopback test.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-enable-loopback.mp3'),
      },
      'final-verification': {
        text: `
        <p>
          TIDEMARK-1 uplink validated and operational.
        </p>
        <p>
          You caught that maintenance left the BUC unmuted in loopback, secured the equipment, then used loopback correctly for your own testing. Brought it up clean. I'll let Charlie know.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-final-verification.mp3'),
      },
    },
  },
};