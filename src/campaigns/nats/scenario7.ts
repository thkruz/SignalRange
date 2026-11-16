import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * 4. Troubleshooting a minor fault (BUC left unmuted in loopback at a 50 dB test gain)
 * 5. Full uplink enable sequence with encryption awareness
 *
 * Technical Reference (TIDEMARK-1):
 *   - Uplink RF: 5943 MHz (TP-1 center)
 *   - BUC LO: 7000 MHz
 *   - TX IF: 1057 MHz (7000 - 5943 = 1057)
 *   - Beacon RF: 4175.5 MHz
 *   - LNB LO: 5250 MHz
 *   - Beacon IF: 1074.5 MHz (5250 - 4175.5 = 1074.5)
 *   - Loop IF: 1532 MHz (loop translator 5943 - 2225 = 3718 MHz RF; 5250 - 3718 = 1532)
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
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Unavailable'],
  timeLimitSeconds: 35 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // Post-maintenance state: TX chain disabled, RX operational
            // BUC left unmuted in loopback at a 50 dB test gain by the maintenance crew.
            // The TX modem is not keyed, so the BUC has no drive: the Dashboard shows only
            // "BUC in loopback mode" (2.6 A idle). Keyed at -10 dBm, 50 dB would saturate it
            // at 30.1 dBm and draw 5.0 A (high-current + saturation alarms); nats-s07-F1)
            buc: {
              isMuted: false, // Left unmuted by maintenance
              isLoopback: true, // Left in loopback mode by maintenance
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 50 as dB, // Maintenance test gain (station standard is 23 dB)
              temperature: 52, // The thermal model settles it from here
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
                // Left on the maintenance crew's narrow test carrier: the
                // student sets the TIDEMARK-1 plan (1057 / 36 MHz / QPSK 3/4 / -7)
                ifSignal: {
                  frequency: 950e6 as IfFrequency,
                  bandwidth: 9e6 as Hertz,
                  power: -10 as dBm,
                  modulation: 'BPSK',
                  fec: '1/2',
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
            // Left on the crew's wide sweep of the test carrier, not the beacon:
            // the player sets centre and span for the beacon
            centerFrequency: 950e6 as Hertz,
            span: 100e6 as Hertz,
          },
        ],
      },
      { ...maineGroundStation, isOperational: false },
    ],
    scenarioStartDate: '2026-02-12',
    scenarioStartWallTime: '08:45:00',
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
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Identify Active Alarms',
          params: {
            question: 'What alarm condition is currently displayed on the Dashboard?',
            options: ['BUC in loopback mode', 'LNB Reference Unlocked', 'HPA Output Fault', 'No active alarms'],
            correctIndex: 0,
            explanation:
              'The Dashboard shows the BUC in loopback mode. The maintenance crew left it unmuted in loopback, so anything the modem sends would be fed straight back into our receive chain. We need to mute it and take it out of loopback before we go on.',
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
      title: 'Diagnose BUC Test Configuration',
      description: 'Navigate to the TX Chain and identify what else maintenance left in the BUC test setup.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-dashboard-status'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Identify Cause',
          params: {
            question: 'Looking at the BUC panel, what would drive the BUC into saturation the moment the modem keys up?',
            options: ['BUC has been on for a few hours and is overheating', 'BUC gain is set too high', 'External reference is unlocked', 'BUC temperature is too low'],
            correctIndex: 1,
            explanation:
              "The BUC gain is set to 50 dB, and the station standard is 23 dB. The modem's current -10 dBm plus 50 dB asks for 40 dBm from a BUC whose 1 dB compression point is 28 dBm. That's the output level where the gain has dropped by 1 dB, so past it the BUC flattens out. It'd sit at about 30 dBm, 10 dB into compression, draw about 5 A and trip the high-current alarm. The maintenance crew likely forgot to mute it after testing.",
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
      description: "Mute the BUC and disable loopback, so nothing can drive it until you're ready.",
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
      description: 'Confirm the Dashboard no longer shows the BUC loopback alarm.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['resolve-buc-high-current'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Dashboard Tab Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Confirm Alarm Cleared',
          params: {
            // nats-r3-s07-F2: the AGC noise-only alarm stays listed (no traffic
            // carrier in the receive passband until our own uplink is back)
            question: 'With the BUC muted and out of loopback, what does the Dashboard alarm list show now?',
            options: [
              'The loopback alarm has cleared; only the AGC noise-only alarm remains',
              'The loopback alarm is still listed; it stays latched until the BUC is power-cycled',
              'Every alarm has cleared; the board shows no active alarms',
              'A BUC high-current alarm has replaced the loopback alarm',
            ],
            correctIndex: 0,
            explanation:
              'Muting the BUC and taking it out of loopback cleared the loopback alarm. The AGC noise-only alarm stays because no traffic carrier is up yet. The receive passband holds nothing but noise until our own carrier is back on the air, so that alarm is expected right now. Always check on the Dashboard that an alarm has cleared before you go on.',
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
          params: { satelliteId: 61525, requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Antenna Status Verified',
          params: {
            question: 'What is the current antenna tracking mode and target satellite?',
            options: ['Program Track - TIDEMARK-1', 'Program Track - TIDEMARK-2', 'Step Track - TIDEMARK-1', 'Maintenance - Stowed'],
            correctIndex: 0,
            explanation: "The ACU Control tab shows the antenna in Program Track mode, locked on TIDEMARK-1. That's the satellite we're about to transmit to.",
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
      intent: 'confirm',
      prerequisiteObjectiveIds: ['verify-antenna-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: { equipment: 'lnb', requiresObservation: true, observationTab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
          // A read of the running LNB: confirm it, never cycle it
          requiresChange: false,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Noise Temperature Understanding',
          params: {
            question: 'What does the LNB noise temperature value indicate about receiver performance?',
            options: [
              'Lower noise temperature means better sensitivity and signal-to-noise ratio',
              'Higher noise temperature means better sensitivity and signal-to-noise ratio',
              'Noise temperature sets the transmit power and has no effect on sensitivity',
              'Noise temperature has no effect on sensitivity or signal-to-noise ratio',
            ],
            correctIndex: 0,
            explanation:
              "Noise temperature measures the thermal noise the LNB adds to the received signal. A lower value, such as 45 K, means less added noise, so the signal-to-noise ratio and the receiver's sensitivity are better.",
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
      description:
        'Set the spectrum analyzer to Center 1074.5 MHz, Span 0.002 MHz (2 kHz), Min Amp -100 dBm and Max Amp -30 dBm to look at the TIDEMARK-1 beacon. It should read about -49 dBm.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-lnb-operational'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
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
          description: 'Max Amplitude: around -30 dBm',
          params: {
            maxAmplitude: -30 as dBm,
            maxAmplitudeTolerance: 5,
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
            question: 'What distinguishes the beacon signal from other signals on the spectrum display?',
            options: [
              'Beacon is a narrow CW carrier spike, while data signals have wider bandwidth',
              'Beacon is a wide modulated carrier, while data signals show up as narrow CW spikes',
              'Beacon shows visible modulation, while data signals appear as flat CW lines',
              'Beacon sits at exactly -50 dBm, while data signals sit lower on the display',
            ],
            correctIndex: 0,
            explanation:
              "A beacon is an unmodulated carrier, called continuous wave or CW, so it appears as a narrow spike. Its job is to give you a frequency and power reference that doesn't depend on traffic.",
            pointPenalty: 5,
            character: Character.DANA_TORRES,
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Beacon Purpose',
          params: {
            question: 'What does successful beacon acquisition confirm about the receive chain?',
            options: [
              'Antenna is pointed at the satellite',
              'LNB is functioning and converting RF to IF',
              'Signal path from antenna to spectrum analyzer is operational',
              'All of the above',
            ],
            correctIndex: 3,
            explanation: 'The beacon validates the whole receive chain: antenna pointing, LNB operation and signal routing. If any one of them fails, the beacon disappears.',
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
      description: "Work out the beacon's IF frequency from its RF frequency and the LNB LO.",
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
            options: ['1,074.5 MHz', '1,174.5 MHz', '9,425.5 MHz', '925.5 MHz'],
            correctIndex: 0,
            explanation:
              "The LNB downconverts the C-band beacon to L-band IF by subtracting the RF from its LO: 5,250 - 4,175.5 = 1,074.5 MHz. That's the center frequency you set on the analyzer.",
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
      description: 'Work out the IF frequency the transmitter modem needs for the TIDEMARK-1 uplink.',
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
            options: ['1,057 MHz', '12,943 MHz', '957 MHz', '1,157 MHz'],
            correctIndex: 0,
            explanation: "The BUC upconverts the modem's IF to the uplink RF, so TX IF = BUC LO - RF = 7,000 - 5,943 = 1,057 MHz.",
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
      description: 'Set transmitter modem 1 to 1057 MHz, 36 MHz bandwidth, QPSK with 3/4 FEC and -7 dBm power, then start it transmitting.',
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
            isTransmitting: true,
          },
          maintainUntilObjectiveComplete: true,
        },
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
      description:
        'Set the BUC gain to 20 dB before loopback. The test loop couples the BUC output into the LNB about 66 dB down. At the standard 23 dB, the -7 dBm modem drive puts +16 dBm out of the BUC and -50 dBm into the LNB. That is its input compression point at 60 dB gain (0.7 dB compressed, "LNB input overload"). At 20 dB the LNB sees -53 dBm, 3 dB under it, so the loop carrier you measure is linear.',
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
      description:
        'Turn loopback on and unmute the BUC. The loop feeds a coupled sample of the transmit signal back into the receive chain, so you can test without transmitting to the satellite.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['reduce-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
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
            // nats-r4-s07-F2: the loop is a coupled sample (coupler + pad +
            // 2,225 MHz translator), not a switch; the HPA path stays connected
            options: [
              'A coupler samples the BUC output and a translator shifts it into the LNB; the HPA path stays connected',
              'A switch routes the whole BUC output to the LNB instead of the HPA, so the HPA path is cut while the loop is on',
              'The LNB LO is retuned to the BUC LO so the receive chain sees the 5,943 MHz uplink directly',
              'The BUC output is fed back into the modem RX input at IF, bypassing the LNB and the antenna',
            ],
            correctIndex: 0,
            explanation:
              "Loopback taps the BUC output with a directional coupler, pads the sample about 66 dB down and runs it through the loop translator. The translator shifts it down by the satellite's 2,225 MHz translation, into the LNB's band. Nothing is switched out of the transmit path. The BUC still drives the HPA input, so the HPA has to stay off until the loop test is done. That way you can verify the modem and BUC without radiating anything through the antenna.",
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
        "Find the loop carrier on the spectrum analyzer. The test loop translator shifts the 5943 MHz uplink down by the satellite's 2225 MHz translation, to 3718 MHz. The normal LNB LO (5250 MHz) then puts it at 1532 MHz IF, which is where our own downlink will sit. Leave the LNB alone and set Center 1532 MHz, Span 50 MHz, Min Amp -100 dBm, Max Amp -20 dBm and RBW Auto. The AGC levels the loop carrier like any other, so it reads around -55 dBm per RBW. On RX Analysis, a carrier this clean reads an Effective C/N well under Raw C/N. The grey ceiling line (about 40 dB) is the converter's own limit, not a fault.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-loopback'],
      timeLimitSeconds: 5 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          // Phase 28 D3 (nats-r3-s08-F1): the loop translator lands the loop
          // carrier at the normal RX IF (5943 - 2225 = 3718 MHz RF, 5250 - 3718
          // = 1532 MHz IF); no LNB LO retune
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1532 MHz (Loop IF)',
          params: {
            centerFrequency: 1532e6 as Hertz,
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
          type: 'status-check',
          description: 'Loopback Signal Verified',
          params: {
            question: 'What do you see on the spectrum analyzer in this window?',
            options: [
              'A 36 MHz wide modulated carrier centered at 1,532 MHz - the TX modem output via the test loop',
              'Nothing but the noise floor - the loop carrier would only show with the LNB LO retuned to the BUC LO',
              'Only a narrow CW spike - the TIDEMARK-1 beacon, no loop carrier',
              'A narrow CW carrier spike at 1,532 MHz - the BUC LO leaking through the loop',
            ],
            correctIndex: 0,
            explanation:
              "The modem's 1,057 MHz IF leaves the BUC at 5,943 MHz (7,000 - 1,057). The loop translator shifts that sample down by the satellite's 2,225 MHz translation to 3,718 MHz, and the normal 5,250 MHz LNB LO puts it at 1,532 MHz IF (5,250 - 3,718). That's a 36 MHz modulated carrier, in the same place our downlink will appear once we're on the air, so the modem and BUC path are working. A C-band LNB only receives 3.4-4.2 GHz, so nobody retunes it to look for the 6 GHz uplink itself.",
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
      description: 'Say what a successful loopback test tells you.',
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
              'Satellite transponder and downlink path are responding',
              'HPA output stage and waveguide path are at full power',
              'Antenna pointing and feed alignment are on the satellite',
            ],
            correctIndex: 0,
            explanation:
              'A successful loopback test shows that the low-power part of the transmit chain, the modem and BUC, is working. It does that without engaging the HPA or transmitting, so it catches configuration errors before they can cause interference.',
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
      description: "Check the TX Chain tab and confirm the link's encryption is active and its key is valid.",
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['quiz-loopback-purpose'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
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
            options: ['AES-256 Enabled', 'AES-128 Enabled', 'Encryption Disabled', 'Key Expired - Renewal Required'],
            correctIndex: 0,
            explanation: 'The link uses AES-256 encryption, as the TIDEMARK-1 service agreement requires. Always verify the encryption status before you transmit.',
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
      title: 'Disable Loopback, Restore BUC Gain',
      description: 'Disable loopback and set the BUC gain back to the station standard of 23 dB. The 20 dB loopback setting would leave the HPA 3 dB short of drive.',
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
        {
          type: 'buc-gain-set',
          description: 'BUC Gain Restored to 23 dB',
          params: {
            gain: 23 as dB,
            gainTolerance: 0.5 as dB,
          },
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
      description: 'Enable the HPA output stage without overdriving it.',
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
        'Lower the HPA back-off (how far the output sits below its maximum) until output is above 400 W, the minimum for the TIDEMARK-1 link budget. The HPA is 60 dBm (1 kW) at P1dB, its 1 dB compression point. 3 dB of back-off gives 57 dBm (501 W), and 4 dB gives only 398 W. Below 3 dB it trips the overdrive alarm.',
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
      description: "Pick the description that matches the uplink you've just validated.",
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
            explanation: 'The validated uplink takes the 1,057 MHz TX IF up to 5,943 MHz RF through the 7,000 MHz BUC LO, with QPSK modulation, 3/4 FEC and AES-256 encryption.',
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
        Hey, it's Charlie. Quick call: I'm stuck at the main office all day with paperwork.
      </p>
      <p>
        The overnight crew finished the HPA work, so you need to validate the uplink before we go live. It's the standard post-maintenance procedure.
      </p>
      <p>
        Dana's on shift if you need anything, but you should be able to handle this. The Mission Brief has the details.
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
          I'm Dana Torres, the shift supervisor, and I don't think we've met yet. Charlie mentioned you'd be handling the uplink validation solo today.
        </p>
        <p>
          I'll check in at a few points, just making sure neither of us gets in trouble, but don't wait for me. Go ahead and select the Vermont station.
        </p>
        <p>
          I got called in early this morning, so you'll mostly have the floor to yourself.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-review-mission-brief.mp3'),
      },
      'check-dashboard-status': {
        text: `
        <p>
          That's the BUC alarm I spotted on the board too. Maintenance may have left something misconfigured, so open the TX Chain tab and see what they left behind.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-check-dashboard-status.mp3'),
      },
      'diagnose-buc-high-current': {
        text: `
        <p>
          Bingo. We'll deal with the gain later. For now, mute the BUC and disable loopback so we can clear that alarm before the modem has a chance to transmit into it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-diagnose-buc-high-current.mp3'),
      },
      'resolve-buc-high-current': {
        text: `
        <p>
          Good catch. The BUC is safe now.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-resolve-buc-high-current.mp3'),
      },
      'acquire-beacon': {
        text: `
        <p>
          The receive chain's confirmed. Work out the beacon's IF, and then we'll move on to the uplink.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-acquire-beacon.mp3'),
      },
      'enable-loopback': {
        text: `
        <p>
          Loopback's up. Check it on the analyzer.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-enable-loopback.mp3'),
      },
      'final-verification': {
        text: `
        <p>
          The TIDEMARK-1 uplink is validated and operational.
        </p>
        <p>
          You caught that maintenance left the BUC unmuted in loopback, you secured it, and then you used loopback properly for your own testing. You brought the uplink up clean, and I'll let Charlie know.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-final-verification.mp3'),
      },
    },
    objectivesOnStart: {
      // nats-s07-F7: the warning belongs before the gain step, not after loopback is up
      'reduce-buc-gain': {
        text: `
        <p>
          Before you loop back, drop the BUC gain to 20 dB. The test loop takes the BUC output about 66 dB down into the LNB. At our normal 23 dB, that's right at the LNB's compression point, where it stops amplifying evenly. A compressed loop carrier would give you a misleading reading, and 20 dB keeps the LNB linear. At the 50 dB maintenance left, the modem would drive the BUC itself straight into saturation.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/7/obj-reduce-buc-gain.mp3'),
      },
    },
  },
};
