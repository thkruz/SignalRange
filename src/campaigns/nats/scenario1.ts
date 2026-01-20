import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { tidemark1Satellite } from './satellites';

/**
 * NATS Level 1: "First Day" - TIDEMARK-1 Health Check
 *
 * Phase: Introduction (Phase 1, Scenario 1 of 8)
 * Time Pressure: None (tutorial pacing)
 * Calculation Required: NO - observation and familiarization only
 * New UI Elements: All panels introduced - asset tree, tabs, equipment displays
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K1032: Knowledge of satellite-based communication systems and software
 *   - S0421: Skill in operating network equipment
 *   - T0431: Check system hardware availability, functionality, integrity, and efficiency
 *
 * Premise: First day at North Atlantic Teleport Services. Charlie Brooks, senior
 * operator transferring to Europe next month, walks you through a routine health
 * check on TIDEMARK-1. This is observation and familiarization - learn what each
 * panel shows, what the indicators mean, and what "normal" looks like.
 *
 * Key Learning Objectives:
 * 1. Navigate the ground station UI (asset tree, tabs)
 * 2. Identify key equipment panels (GPSDO, LNB, HPA, Spectrum Analyzer, Modems)
 * 3. Understand what "normal" readings look like for each system
 * 4. Learn the systematic health check workflow (timing → RX → TX → antenna → alarms)
 * 5. Build foundation for independent operations in later scenarios
 *
 * Character Notes:
 *   - Charlie Brooks: Senior operator, 6 years experience, transferring soon.
 *     Direct, efficient, no-nonsense. Won't repeat himself but the system will.
 *     Wants to get you up to speed quickly before he leaves.
 */

export const scenario1Data: ScenarioData = {
  id: 'nats-scenario1',
  url: 'nats/scenarios/nats-scenario1',
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: 'First Day',
  subtitle: 'TIDEMARK-1 Health Check',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Routine Operations',
  description: `Welcome to your first day at North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. Your company provides ground segment services for the TIDEMARK constellation - SeaLink Global Communications' fleet of GEO satellites providing maritime broadband across the Atlantic.<br><br>TIDEMARK-1 is already online at 53°W, serving customer traffic. Today, Charlie Brooks will walk you through a routine health check. You'll learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.<br><br>No pressure today - just observation and familiarization. Click through each panel and verify the status indicators as Charlie explains them.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem (pre-configured)',
    'Transmitter Modem (pre-configured)',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-1?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
    ]
  },
  timeLimitSeconds: 35 * 60, // 35 minutes
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs) - reviewing the mission brief
      // establishes the procedural framework for the health check workflow
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Document Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Proceed',
          params: {
            question: 'Have you reviewed the mission brief and are you ready to begin?',
            options: [
              'Yes, I have read the mission brief and I am ready to proceed.',
            ],
            correctIndex: 0,
            explanation: 'The mission timer has started. Good luck!',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // STATION ACCESS
    // ============================================================
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface is the fundamental skill for all subsequent operations
      nice: ['S0421'],
      title: 'Access Vermont Ground Station',
      description: 'Select the Vermont Ground Station in the asset tree to access its equipment panels.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Ground Station Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // TIMING REFERENCE
    // ============================================================
    {
      id: 'navigate-gps-timing',
      // S0421: Skill in operating network equipment - navigating to the GPS timing
      // subsystem panel within the ground station control interface
      nice: ['S0421'],
      title: 'Open GPS Timing Tab',
      description: 'Click the GPS Timing tab to view the timing reference equipment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'GPS Timing Tab Open',
          params: { tab: 'gps-timing' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-gpsdo-status',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying the GPSDO is locked and providing stable timing reference
      // K0741: Knowledge of system availability measures - understanding what "Locked" status
      // indicates about the timing reference availability to downstream equipment
      nice: ['T0431', 'K0741'],
      title: 'GPSDO Status Check',
      description: 'Verify the GPSDO is locked and providing a stable timing reference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-gps-timing'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'GPS Timing Tab Open',
          params: { tab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify GPSDO Status',
          params: {
            question: 'What does the GPSDO "Lock" indicator show?',
            options: [
              'Locked (green) - stable frequency reference',
              'Unlocked (red) - no frequency reference',
              'Holdover (yellow) - using backup oscillator',
              'Off - GPSDO is powered down',
            ],
            correctIndex: 0,
            explanation: 'The green "Locked" indicator means the GPSDO is receiving GPS timing signals and providing a stable 10 MHz reference to all equipment in the rack.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // RECEIVE CHAIN
    // ============================================================
    {
      id: 'navigate-rx-analysis',
      // S0421: Skill in operating network equipment - navigating to the receive
      // chain analysis panel within the ground station control interface
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to view the receive chain equipment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-gpsdo-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-lnb',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // confirming the LNB is powered on and thermally stabilized before operations
      // K0740: Knowledge of system performance indicators - interpreting noise temperature
      // as a key metric for receive sensitivity and system health
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // how LNB noise temperature affects overall receive chain performance
      nice: ['T0431', 'K0740', 'K0773'],
      title: 'Verify LNB Status',
      description: 'Check that the LNB is powered, thermally stable, and noise temperature is within spec.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis'],
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
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: { equipment: 'lnb' },
          mustMaintain: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify LNB Noise Temperature',
          params: {
            question: 'What is the LNB noise temperature reading, and is it within spec?',
            options: [
              '43K - within spec (good receive sensitivity)',
              '150K - above spec (degraded sensitivity)',
              '290K - far above spec (major problem)',
              'No reading - LNB is offline',
            ],
            correctIndex: 0,
            explanation: 'The LNB noise temperature of 43K is excellent. Lower noise temperature means better receive sensitivity. Anything under 100K is considered good for C-band.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-tap-points',
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // signal routing and tap points in the receive chain for spectrum analysis
      // S0421: Skill in operating network equipment - recognizing the tap point
      // selector and its role in the monitoring workflow
      nice: ['K0773', 'S0421'],
      title: 'Tap Points Configuration',
      description: 'Review the Tap Points card to understand signal monitoring points.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-lnb'],
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
          type: 'status-check',
          description: 'Understand Tap Points',
          params: {
            question: 'What does the Tap Points card show, and what is its purpose?',
            options: [
              'RX IF selected - monitoring the receive chain after downconversion',
              'TX IF selected - monitoring the transmit chain',
              'Both TX and RX IF active - dual monitoring mode',
              'No tap point selected - spectrum analyzer disabled',
            ],
            correctIndex: 0,
            explanation: 'The Tap Points card selects where in the signal chain the spectrum analyzer takes its input. RX IF monitors the receive path after the LNB downconverts from RF to IF - this is the standard monitoring point for receive operations.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'identify-beacon',
      // T0153: Monitor network capacity and performance - locating and confirming
      // the satellite beacon signal on the spectrum analyzer
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding that the beacon is a satellite telemetry signal used for link verification
      // K0773: Knowledge of telecommunications principles and practices -
      // interpreting spectrum analyzer display to identify signal characteristics
      nice: ['T0153', 'K1032', 'K0773'],
      title: 'Identify Beacon Signal',
      description: 'Locate the TIDEMARK-1 beacon signal on the spectrum analyzer and confirm receive chain status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tap-points'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Identify Beacon Signal',
          params: {
            question: 'What do you see at the center of the spectrum analyzer display?',
            options: [
              'A clear spike - the TIDEMARK-1 beacon signal',
              'Only noise floor - no signal detected',
              'Multiple interference spikes - contaminated spectrum',
              'Flat line at 0 dBm - equipment malfunction',
            ],
            correctIndex: 0,
            explanation: 'The beacon signal appears as a narrow spike rising above the noise floor. This CW (continuous wave) intermediate frequency signal confirms the satellite is in view and the receive chain is working.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-speca-settings',
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // IF frequency configuration and reference levels for signal observation
      // K0740: Knowledge of system performance indicators - recognizing correct
      // spectrum analyzer settings as baseline for monitoring
      nice: ['K0773', 'K0740'],
      title: 'Spectrum Analyzer Settings',
      description: 'Review the spectrum analyzer configuration for beacon observation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-beacon'],
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
          type: 'status-check',
          description: 'Verify Spectrum Analyzer Configuration',
          params: {
            question: 'What center frequency and span are set on the spectrum analyzer?',
            options: [
              '1074.5 MHz center, 0.002 MHz span',
              '1532 MHz center, 2 kHz span',
              '0.002 MHz center, 1074.5 MHz span',
              '1074.5 MHz center, 2 MHz span',
            ],
            correctIndex: 0,
            explanation: 'The spectrum analyzer is set to 1074.5 MHz (beacon IF frequency for TIDEMARK-1 after LNB downconversion) with a 2 kHz (0.002 MHz) span. This narrow span allows you to clearly see the beacon signal above the noise floor.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-receiver',
      // T0153: Monitor network capacity and performance - evaluating C/N ratio
      // to assess link quality and available margin
      // K0740: Knowledge of system performance indicators - understanding C/N
      // thresholds and what constitutes healthy link margin for QPSK
      nice: ['T0153', 'K0740'],
      title: 'Receiver Modem Check',
      description: 'Verify the receiver modem is locked and the link quality is good.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-speca-settings'],
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
          type: 'status-check',
          description: 'Verify Link Quality',
          params: {
            question: 'What does the receiver modem C/N indicate for a QPSK link?',
            options: [
              '≥ 8 dB - Strong link with good operating margin',
              '5-7 dB - Usable link; FEC working normally',
              '3-4 dB - Near lock threshold; errors likely',
              '< 3 dB - Below demodulation threshold; no reliable lock',
            ],
            correctIndex: 0,
            explanation: 'A C/N ratio above 10 dB indicates a healthy link with adequate margin for reliable data reception. This confirms the entire receive chain from antenna to modem is functioning properly.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-constellation',
      // K0773: Knowledge of telecommunications principles and practices - interpreting
      // I&Q constellation diagrams to assess QPSK demodulation quality
      // K0740: Knowledge of system performance indicators - recognizing tight clusters
      // as visual confirmation of healthy signal-to-noise conditions
      nice: ['K0773', 'K0740'],
      title: 'I&Q Constellation Check',
      description: 'Examine the I&Q constellation diagram to verify signal quality.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-receiver'],
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
          type: 'status-check',
          description: 'Interpret I&Q Constellation',
          params: {
            question: 'What does the I&Q constellation diagram show about the received signal?',
            options: [
              'Tight clusters at symbol points - clean QPSK modulation',
              'Scattered points in a circle - high noise, poor signal',
              'Points along a line - phase-only modulation issue',
              'Empty display - no signal lock',
            ],
            correctIndex: 0,
            explanation: 'The tight clusters at the four QPSK symbol points indicate clean demodulation with good signal-to-noise ratio. Spread or scattered points would indicate noise, interference, or phase problems.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // RX PAYLOAD DATA
    // ============================================================
    {
      id: 'verify-rx-payload',
      // K0740: Knowledge of system performance indicators - understanding frame sync,
      // BER, and CRC as indicators of data integrity in the receive chain
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding forward error correction and data validation
      nice: ['K0740', 'K0773'],
      title: 'RX Payload Data Check',
      description: 'Review the Payload Data Integrity card to verify the receive data path is healthy.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-constellation'],
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
          type: 'status-check',
          description: 'Verify RX Payload Status',
          params: {
            question: 'What does the Payload Data Integrity card show about the received data?',
            options: [
              'Frame sync locked, CRC valid, Reed-Solomon active - data path healthy',
              'Frame sync unlocked - no data being received',
              'CRC errors detected - data corruption',
              'Viterbi decoder disabled - no error correction',
            ],
            correctIndex: 0,
            explanation: 'The Payload Data Integrity card confirms the data path is healthy: frame sync is locked (receiving valid frames), CRC checks pass (no corruption), and the Reed-Solomon decoder is actively correcting any bit errors.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // TRANSMIT CHAIN
    // ============================================================
    {
      id: 'navigate-tx-chain',
      // S0421: Skill in operating network equipment - navigating to the transmit
      // chain panel within the ground station control interface
      nice: ['S0421'],
      title: 'Open TX Chain Tab',
      description: 'Click the TX Chain tab to view the transmit equipment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-payload'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-hpa-status',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying the HPA operational state and transmit status
      // K0740: Knowledge of system performance indicators - understanding backoff levels
      // as indicators of amplifier operating margin and stress
      nice: ['T0431', 'K0740'],
      title: 'HPA Status Check',
      description: 'Verify the High Power Amplifier is operating correctly.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain'],
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
          description: 'Verify HPA Status',
          params: {
            question: 'What is the current state of the HPA (High Power Amplifier)?',
            options: [
              'Transmitting with 10 dB backoff',
              'Powered on but not enabled (safe standby)',
              'Transmitting at full power',
              'Powered off completely',
            ],
            correctIndex: 0,
            explanation: 'The HPA is powered on and transmitting with 10 dB backoff, which is a safe condition for routine operations. This reduces stress on the amplifier while still allowing signal transmission.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // TX PAYLOAD DATA
    // ============================================================
    {
      id: 'verify-tx-payload',
      // K0740: Knowledge of system performance indicators - understanding data rate,
      // buffer status, and encryption indicators in the transmit chain
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding data encoding and encryption for secure communications
      nice: ['K0740', 'K0773'],
      title: 'TX Payload Data Check',
      description: 'Review the TX Payload Data card to verify the transmit data path is ready.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-status'],
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
          description: 'Verify TX Payload Status',
          params: {
            question: 'What does the TX Payload Data card show about the transmit data path?',
            options: [
              'Source feed active, encryption enabled, buffer healthy - ready to transmit',
              'Source feed inactive - no data available',
              'Encryption disabled - transmitting in clear',
              'Buffer overflow - data loss occurring',
            ],
            correctIndex: 0,
            explanation: 'The TX Payload Data card shows the transmit path is healthy: source feed is active, encryption is enabled with a valid key, and the buffer utilization is within normal range with no overflows or underruns.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // ANTENNA CONTROL
    // ============================================================
    {
      id: 'navigate-acu-control',
      // S0421: Skill in operating network equipment - navigating to the antenna
      // control unit panel within the ground station control interface
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to view the antenna control unit.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tx-payload'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-tracking-mode',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding antenna tracking modes and their application to GEO satellites
      // T0153: Monitor network capacity and performance - verifying antenna is
      // correctly tracking the target satellite
      nice: ['K1032', 'T0153'],
      title: 'Antenna Tracking Status',
      description: 'Verify the antenna is correctly tracking TIDEMARK-1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-acu-control'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify Antenna Tracking Mode',
          params: {
            question: 'What tracking mode is the antenna currently using?',
            options: [
              'Step-track - actively tracking beacon signal',
              'Program-track - following predicted orbital position',
              'Manual - operator-controlled pointing',
              'Stow - antenna in safe position',
            ],
            correctIndex: 1,
            explanation: 'Program-track mode follows the predicted orbital position of the satellite based on ephemeris data. This mode is used when the beacon signal is not available, during initial acquisition, or when the satellite is GEO stationary and we don\'t want the ACU to make constant adjustments.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-polarization',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding polarization alignment requirements for satellite links
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding how polarization mismatch affects signal strength and cross-pol interference
      nice: ['K1032', 'K0773'],
      title: 'Polarization Check',
      description: 'Verify the antenna polarization matches TIDEMARK-1 requirements.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tracking-mode'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify Polarization Setting',
          params: {
            question: 'What is the current polarization angle shown on the ACU, and why is it set to that value?',
            options: [
              '14° - matched to TIDEMARK-1 satellite polarization',
              '0° - default horizontal polarization',
              '90° - vertical polarization',
              '45° - circular polarization',
            ],
            correctIndex: 0,
            explanation: 'The polarization is set to 14° to match TIDEMARK-1\'s polarization angle. Proper polarization alignment maximizes signal strength and minimizes cross-pol interference.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // FINAL VERIFICATION
    // ============================================================
    {
      id: 'navigate-dashboard',
      // S0421: Skill in operating network equipment - navigating to the alarm
      // dashboard within the ground station control interface
      nice: ['S0421'],
      title: 'Open Dashboard Tab',
      description: 'Click the Dashboard tab to view the alarm summary.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-polarization'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'Dashboard Tab Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-alarm-status',
      // T0153: Monitor network capacity and performance - reviewing aggregated
      // alarm status to confirm overall system health
      // K0741: Knowledge of system availability measures - understanding alarm
      // dashboard as indicator of system operational status
      nice: ['T0153', 'K0741'],
      title: 'Dashboard Alarm Check',
      description: 'Confirm no active alarms on the dashboard.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-dashboard'],
      timeLimitSeconds: 3 * 60,
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
          description: 'Verify Alarm Status',
          params: {
            question: 'What is the current alarm status shown on the dashboard?',
            options: [
              'No active alarms - all systems nominal',
              'Warning: LNB temperature high',
              'Error: GPSDO holdover mode',
              'Critical: Antenna tracking lost',
            ],
            correctIndex: 0,
            explanation: 'A clean alarm dashboard with no active alarms confirms all equipment is operating within normal parameters. This is the final confirmation of a healthy ground station.',
            pointPenalty: 10,
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
      You must be the new hire. Good - I was starting to think HR forgot about me. I'm Charlie Brooks, senior operator. I've been here six years, but I'm transferring to one of the European stations next month. Family stuff.
    </p>
    <p>
      Point is, I've got three of you to get up to speed before I leave, and not a lot of time to do it. Let's not waste any.
    </p>
    <p>
      TIDEMARK-1 is already online at 53 West, serving customer traffic for SeaLink. Today's a health check - you watch, I explain. You'll learn what each panel shows, what the indicators mean, and what "normal" looks like. Tomorrow we'll see if any of it stuck.
    </p>
    <p>
      If you need to review something later, the buttons on the left are your friends - Mission Brief, Checklist, Dialog History. I'm not repeating myself, but the system will.
    </p>
    `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/1/intro-v2.mp3'),
    },
    objectives: {
      // ============================================================
      // MISSION PREPARATION
      // ============================================================
      'review-mission-brief': {
        text: `
      <p>
        Alright. First thing, always - the GPSDO. GPS-Disciplined Oscillator. It's the timing heart of this whole rack. Every piece of equipment keys off that 10 MHz reference. If the GPSDO is unhappy, nothing else matters.
      </p>
      <p>
        Start by clicking Vermont Ground Station in the asset tree on the left. That'll give you access to the equipment panels.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-open-mission-brief.mp3'),
      },

      // ============================================================
      // STATION ACCESS
      // ============================================================
      'select-vermont-station': {
        text: `
      <p>
        Good. You've got Vermont selected. See the tabs across the top? Dashboard, ACU Control, RX Analysis, TX Chain, GPS Timing. Each one shows different equipment.
      </p>
      <p>
        Click GPS Timing. That's where we check the GPSDO.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-select-vermont-station.mp3'),
      },

      // ============================================================
      // TIMING REFERENCE
      // ============================================================
      'navigate-gps-timing': {
        text: `
      <p>
        This is the GPS Timing panel. The GPSDO locks to GPS satellites and generates a 10 MHz reference signal. Everything in the rack - LNB, BUC, modems - uses this reference to stay on frequency.
      </p>
      <p>
        You might notice that its labeled GNSS instead of GPS. Modern timing units can use multiple Global Navigation Satellite Systems - GPS, GLONASS, Galileo, BeiDou - to improve accuracy and reliability.
      <p>
        Look at the lock indicator. Tell me what it shows - locked, holdover, unlocked, or off.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-navigate-gps-timing.mp3'),
      },
      'verify-gpsdo-status': {
        text: `
      <p>
        Locked. Good start. That green light means we have a stable frequency reference - everything downstream can trust the timing. If you ever see it drop to holdover, you've got maybe twenty minutes before drift becomes a problem. Unlocked means stop what you're doing and fix it.
      </p>
      <p>
        Now let's check the receive chain. Click the RX Analysis tab.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-1-gpsdo.mp3'),
      },

      // ============================================================
      // RECEIVE CHAIN
      // ============================================================
      'navigate-rx-analysis': {
        text: `
      <p>
        RX Analysis - this is your receive chain. LNB at the top, spectrum analyzer in the middle, receiver modem at the bottom. Signal flows from antenna to data.
      </p>
      <p>
        The LNB - Low Noise Block downconverter - sits at the antenna feed. Converts C-band RF down to IF so it can travel through coax. First, verify it's powered and thermally stable.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-navigate-rx-analysis.mp3'),
      },
      'verify-lnb': {
        text: `
      <p>
        LNB is powered and temperature is stable. That's what you want to see. Cold LNBs drift. Hot LNBs fail. Stable is the goal.
      </p>
      <p>
        43K noise temperature - that's solid. The cooler the LNB runs, the less noise it adds to your signal. Under 100K is acceptable for C-band. You start seeing that number climb, it's an early warning. Equipment doesn't fail all at once - it degrades. Your job is to catch it before the customer does.
      </p>
      <p>
        Now before we check the spectrum analyzer, take a look at the Tap Points card. That controls where the analyzer takes its signal from.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-2-lnb.mp3'),
      },
      'verify-tap-points': {
        text: `
      <p>
        Good. The Tap Points card tells you where in the signal chain the spectrum analyzer takes its input. RX IF means you're looking at the receive path after the LNB downconverts from RF - that's what you want for monitoring the downlink. TX IF would show you the transmit side before it goes to the BUC.
      </p>
      <p>
        For a health check, RX IF is the standard choice. Now let's move to the spectrum analyzer.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-verify-tap-points.mp3'),
      },
      'identify-beacon': {
        text: `
      <p>
        You're looking for the beacon - TIDEMARK-1's CW carrier. It's already configured to show it. Should be a clean spike above the noise floor. If you don't see it, check the center frequency. Beacon IF is 1074.5 MHz after the LNB downconverts from RF.
      </p>
      <p>
        There it is. Clean beacon. That carrier is your canary - if you can see it, the receive path is working. If it disappears or goes ragged, something changed. Could be weather, could be equipment, could be the satellite.
      </p>
      <p>
        Now check the analyzer settings. Center frequency and reference level determine what you're actually looking at.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-6-spectrum.mp3'),
      },
      'verify-speca-settings': {
        text: `
      <p>
        1074.5 center, span set to 2kHz. That's the setup for beacon watch. Get these wrong and you're either staring at the wrong frequency or your signal's buried in the noise floor. I've seen new ops spend an hour troubleshooting a "missing" signal that was just off-screen. Don't be that person.
      </p>
      <p>
        Receiver modem next. This is where RF becomes data. The number you care about is C/N - Carrier-to-Noise ratio.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-7-speca-settings.mp3'),
      },
      'verify-receiver': {
        text: `
      <p>
        Good margin. That headroom is what keeps you online when a storm rolls through or the satellite has a bad day. C/N is your primary health metric - know it, watch it, respect it.
      </p>
      <p>
        Last thing on the receive side - the constellation diagram. Visual representation of the demodulated symbols.
      </p>
      <p>
        QPSK gives you four clusters, one per symbol. Tight clusters mean clean demod. Scattered means noise. Rotating means phase problems. Empty means no lock.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-8-receiver.mp3'),
      },
      'verify-constellation': {
        text: `
      <p>
        Tight clusters. That's the picture of a healthy link. After a while you'll glance at that diagram and know instantly if something's off. Noise spreads the points, phase errors rotate them, interference makes them dance.
      </p>
      <p>
        One more thing on the receive side - scroll down to the Payload Data Integrity card. This shows you the data path after demodulation. Frame sync, error correction, decryption status - the whole pipeline.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-9-constellation.mp3'),
      },

      // ============================================================
      // RX PAYLOAD DATA
      // ============================================================
      'verify-rx-payload': {
        text: `
      <p>
        Good. Frame sync locked, CRC passing, Reed-Solomon doing its job. That's what a clean data path looks like. The Viterbi decoder and encryption are pre-configured for TIDEMARK-1's downlink - you just need to verify they're working.
      </p>
      <p>
        Receive chain is done. Now let's check the transmit side. Click the TX Chain tab.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-verify-rx-payload.mp3'),
      },

      // ============================================================
      // TRANSMIT CHAIN
      // ============================================================
      'navigate-tx-chain': {
        text: `
      <p>
        TX Chain - your transmit path. BUC at the top left, HPA at the top right, transmitter modem at the bottom left, and payload data at the bottom right. Signal flows from data to antenna.
      </p>
      <p>
        The HPA - High Power Amplifier - is the muscle. Takes your milliwatt signal and turns it into real power. It's also the equipment most likely to ruin your day if you're not paying attention.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-navigate-tx-chain.mp3'),
      },
      'verify-hpa-status': {
        text: `
      <p>
        Transmitting with 10 dB backoff - that's normal ops. We run with headroom so we're not stressing the amplifier. The day you see that backoff at zero, you better have a good reason.
      </p>
      <p>
        One thing - never assume the HPA is muted. I've seen guys reach into the waveguide thinking RF was off. It wasn't. Always verify.
      </p>
      <p>
        Check the TX Payload Data card next - that's the data side of transmission. Source status, encryption, buffer health.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-3-hpa.mp3'),
      },

      // ============================================================
      // TX PAYLOAD DATA
      // ============================================================
      'verify-tx-payload': {
        text: `
      <p>
        Source active, encryption enabled, buffer healthy. That's what you want. Encryption is mandatory for TIDEMARK-1 traffic - SeaLink's customers pay for secure maritime comms.
      </p>
      <p>
        Transmit chain is good. Now let's check the antenna. Click ACU Control.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-verify-tx-payload.mp3'),
      },

      // ============================================================
      // ANTENNA CONTROL
      // ============================================================
      'navigate-acu-control': {
        text: `
      <p>
        ACU Control - antenna control unit. The dish needs to stay pointed at TIDEMARK-1.
      </p>
      <p>
        There are different tracking modes: program-track follows ephemeris predictions, manual is operator-controlled, stow parks it safe. What mode are we in?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-navigate-acu-control.mp3'),
      },
      'verify-tracking-mode': {
        text: `
      <p>
        Program-track. Right answer for a GEO bird. TIDEMARK-1 sits in essentially the same spot, so we follow the math instead of constantly hunting. Eight years old now, starting to drift a bit in its box, but nothing the ephemeris can't handle.
      </p>
      <p>
        Next is polarization - how the wave is oriented. Has to match what the satellite expects or you lose signal. Could be horizontal at 0 degrees, vertical at 90, or something in between.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-4-antenna.mp3'),
      },
      'verify-polarization': {
        text: `
      <p>
        14 degrees - matched to TIDEMARK-1. That's a detail people overlook. Wrong polarization costs you dBs, and dBs are money. Or in bad weather, dBs are the difference between link and no link.
      </p>
      <p>
        One more check, then we're done. The alarm dashboard aggregates everything into one view. Click the Dashboard tab.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-5-polarization.mp3'),
      },

      // ============================================================
      // FINAL VERIFICATION
      // ============================================================
      'navigate-dashboard': {
        text: `
      <p>
        Dashboard - your early warning system. Shows status of all equipment at a glance. Green is good. Yellow needs attention. Red means stop and investigate.
      </p>
      <p>
        Could be clean, could be warnings, could be critical faults. What's it showing?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-navigate-dashboard.mp3'),
      },
      'verify-alarm-status': {
        text: `
      <p>
        Clean board. That's what right looks like. Remember it.
      </p>
      <p>
        Alright - GPSDO, LNB, beacon, spectrum analyzer, receiver, HPA, tracking mode, polarization, alarms. That's your health check. Do it at the start of every shift, do it after any anomaly, do it whenever something feels off.
      </p>
      <p>
        You did fine. Tomorrow we'll actually touch some controls - power sequencing, safe states, that kind of thing. I need to know you won't break anything before I leave you alone with the equipment.
      </p>
      <p>
        Go get some coffee or something. I've got logs to finish.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-10-alarms.mp3'),
      },
    },
  },
}