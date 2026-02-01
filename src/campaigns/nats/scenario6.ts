import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { aurora7Satellite, ses10Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 6: "Old Faithful"
 *
 * Phase: Intermediate (first intermediate scenario)
 * Time Pressure: Moderate (30-minute scenario timer)
 * Calculation Required: YES - TX IF frequency calculation (uplink, for variety)
 * New UI Elements: Step-track mode, encryption/payload cards awareness
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0077: Skill in securing network communications
 *   - K0740: Knowledge of system performance indicators
 *   - T1567: Equipment configuration happens throughout
 *
 * Premise: This is a training exercise to practice step-track mode on AURORA-7,
 * a legacy satellite with an inclined orbit. Charlie Brooks has pre-configured
 * the encryption and payload settings - the student just needs to understand
 * what they do.
 *
 * Key Learning Objectives:
 * 1. Understand why inclined orbits require step-track
 * 2. Enable step-track mode and achieve beacon lock (beacon pre-configured)
 * 3. Configure RX modem for downlink reception
 * 4. Understand encryption and payload card functions
 * 5. Calculate TX IF frequency (uplink calculation - adds curriculum variety)
 * 6. Configure TX modem and enable transmit path
 *
 * Technical Reference (AURORA-7):
 *   - Uplink RF: 5830 MHz
 *   - Downlink RF: 3605 MHz
 *   - Beacon RF: 4165 MHz
 *   - LNB LO: 5250 MHz
 *   - Beacon IF: 1085 MHz (5250 - 4165) - PRE-CONFIGURED by Charlie
 *   - Downlink IF: 1422 MHz (5250 - 3828)
 *   - BUC LO: 7500 MHz
 *   - TX IF: 1447 MHz (5830 - 7500) - STUDENT CALCULATES THIS
 *   - Bandwidth: 24 MHz
 *
 * Key Differences from Scenario 4:
 *   - Uses step-track mode (not program-track)
 *   - No tab-active conditions - student navigates independently
 *   - Quiz-heavy for conceptual understanding
 *   - Training narrative - lower stakes, focus on learning
 */

export const scenario6Data: ScenarioData = {
  id: 'nats-scenario6',
  url: 'nats/scenarios/nats-scenario6',
  prerequisiteScenarioIds: ['nats-scenario5'],
  imageUrl: 'nats/6/card.png',
  number: 6,
  title: 'Old Faithful',
  subtitle: 'Step-Track Operations on Inclined Orbit',
  duration: '25-30 min',
  timeLimitSeconds: 30 * 60,
  difficulty: 'beginner',
  missionType: 'Training Exercise',
  description: `AURORA-7 is a legacy C-band satellite that's been in service for over 15 years. To conserve fuel, the operators stopped north-south station-keeping, so the orbit is now inclined. The satellite traces a figure-8 pattern in the sky - you can't just point and forget.<br><br>This is a training exercise to practice step-track mode. Unlike program-track which follows predicted orbital elements, step-track uses the beacon signal to continuously adjust antenna pointing. It's essential for tracking satellites with inclined orbits.<br><br>Charlie has pre-configured the beacon frequency, encryption, and payload settings. Your job is to acquire the satellite using step-track, establish receive lock, calculate the TX IF frequency, and bring up the transmit path.<br><br>Take your time - this is practice.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
  ],
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            // Antenna in program-track on TIDEMARK-1 (wrong satellite)
            // Student must switch to AURORA-7, then to step-track
            isPowered: true,
            azimuth: 180 as Degrees,
            elevation: 45 as Degrees,
            polarization: 0 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: false,
            targetSatelliteId: 61525, // TIDEMARK-1 (wrong satellite)
            targetAzimuth: 180 as Degrees,
            targetElevation: 45 as Degrees,
            targetPolarization: 0 as Degrees,
            slewing: false,
            beaconCN: 0 as dB,
            beaconFrequencyHz: 1085e6 as Hertz, // Pre-configured by Charlie
            isLocked: true, // Program-track is locked on TIDEMARK-1
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // TX chain pre-configured by Charlie but disabled
            buc: {
              isMuted: true,
              loFrequency: 7500 as MHz, // Set for AURORA-7
              isExtRefLocked: true,
            },
            hpa: {
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
            },
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 60,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 1085e6 as Hertz, // Pre-set near beacon IF
            span: 100e3 as Hertz, // Narrow span for beacon
            rbw: 1e3 as Hertz,
            referenceLevel: -90 as dBm,
            minAmplitude: -100 as dBm,
            maxAmplitude: -70 as dBm,
          },
        ],
        receivers: [
          {
            ...vermontGroundStation.receivers[0],
            modems: [
              {
                ...vermontGroundStation.receivers[0].modems[0],
                frequency: 1200 as MHz, // Wrong - student must configure
                bandwidth: 24 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
              },
            ],
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
                  frequency: 1050e6 as IfFrequency, // Wrong - student must calculate TX IF
                  bandwidth: 24e6 as Hertz,
                  power: -7 as dBm,
                },
              },
            ],
          },
        ],
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-6?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [aurora7Satellite, tidemark1Satellite, ses10Satellite],
  },
  objectives: [
    // ============================================================
    // PHASE 1: MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs)
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open the mission brief to understand the step-track training requirements.',
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
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'understand-inclined-orbit',
      // K1032: Knowledge of satellite-based communication systems
      nice: ['K1032'],
      title: 'Understand Inclined Orbits',
      description: 'Before we start tracking, let\'s make sure you understand why AURORA-7 requires special handling.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Inclined Orbit Understanding',
          params: {
            question: 'Why does AURORA-7 require step-track mode instead of program-track?',
            options: [
              'Inclined orbit causes the satellite to drift in az/el; step-track follows the beacon',
              'The satellite has a faulty antenna requiring manual adjustment',
              'Step-track uses less power than program-track',
              'Program-track only works with newer satellites',
            ],
            correctIndex: 0,
            explanation: 'Legacy satellites with inclined orbits drift in a figure-8 pattern as seen from the ground. Step-track uses the beacon signal to continuously adjust antenna pointing, while program-track relies on TLE predictions that assume a fixed geostationary position.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'recognize-wrong-satellite',
      // K1032: Knowledge of satellite-based communication systems
      nice: ['K1032'],
      title: 'Identify Current Target',
      description: 'The antenna is in program-track mode. Check the ACU Control tab to see which satellite is currently targeted.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-inclined-orbit'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Wrong Satellite Identified',
          params: {
            question: 'Which satellite is the antenna currently tracking?',
            options: [
              'TIDEMARK-1 - we need to change to AURORA-7',
              'AURORA-7 - we are already on the correct satellite',
              'No satellite selected',
              'Cannot determine from current display',
            ],
            correctIndex: 0,
            explanation: 'The ACU shows TIDEMARK-1 selected. AURORA-7 is our target for this mission - we need to change the program-track target.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'program-track-aurora7',
      // S0421: Skill in operating network equipment
      // K1032: Knowledge of satellite-based communication systems
      nice: ['S0421', 'K1032'],
      title: 'Acquire AURORA-7 via Program-Track',
      description: 'Change the program-track target to AURORA-7 and move the antenna to acquire it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['recognize-wrong-satellite'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program Track Mode',
          params: { trackingMode: 'program-track' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'antenna-locked',
          description: 'Locked on AURORA-7',
          params: { noradId: 28899 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'quiz-program-track-limitation',
      // K1032: Knowledge of satellite-based communication systems
      nice: ['K1032'],
      title: 'Understand Program-Track Limitations',
      description: 'Program-track has acquired AURORA-7, but there\'s a problem with inclined-orbit satellites.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['program-track-aurora7'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Program-Track Limitation',
          params: {
            question: 'Why can\'t we stay in program-track mode for AURORA-7?',
            options: [
              'AURORA-7\'s inclined orbit causes drift - ephemeris predictions aren\'t accurate enough',
              'Program-track consumes more power than step-track',
              'The antenna hardware doesn\'t support program-track for C-band',
              'Program-track only works for LEO satellites',
            ],
            correctIndex: 0,
            explanation: 'Program-track follows TLE predictions that assume a fixed geostationary position. AURORA-7\'s inclined orbit means it drifts in a figure-8 pattern, so predictions are only accurate for rough pointing. We need step-track to actively follow the beacon.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: STEP-TRACK CONFIGURATION
    // ============================================================
    {
      id: 'verify-beacon-config',
      // K0773: Knowledge of telecommunications principles and practices
      nice: ['K0773'],
      title: 'Verify Beacon Configuration',
      description: 'Charlie pre-configured the beacon frequency for step-track. Check the ACU to verify the beacon IF is set to 1085 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-program-track-limitation'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon Configuration Verified',
          params: {
            question: 'Charlie pre-configured the beacon IF at 1085 MHz. How was this value calculated?',
            options: [
              'LNB LO (5250 MHz) minus beacon RF (4165 MHz) = 1085 MHz',
              'Beacon RF (4165 MHz) minus a standard offset (3080 MHz)',
              'It\'s the satellite\'s default beacon IF setting',
              'BUC LO (7500 MHz) minus beacon RF (4165 MHz) = 3355 MHz',
            ],
            correctIndex: 0,
            explanation: 'The beacon IF is calculated using high-side LO injection: IF = LO - RF = 5250 - 4165 = 1085 MHz. The LNB converts the RF signal down to IF for processing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-step-track',
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['S0421', 'T1567'],
      title: 'Enable Step-Track Mode',
      description: 'Switch the antenna to step-track mode. The beacon is already configured - just enable tracking.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-config'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Mode Active',
          params: {
            trackingMode: 'step-track',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-beacon-lock',
      // T0153: Analyze network traffic to identify anomalous activity
      nice: ['T0153'],
      title: 'Acquire Beacon Lock',
      description: 'Wait for the step-track algorithm to acquire beacon lock. Watch the C/N ratio rise as the antenna optimizes pointing.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-step-track'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Acquired',
          params: {},
          mustMaintain: true,
          maintainDuration: 10, // Hold lock for 10 seconds
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 3: RECEIVE CHAIN CONFIGURATION
    // ============================================================
    {
      id: 'configure-speca-downlink',
      // K0773: Knowledge of telecommunications principles and practices
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'S0421', 'T1567'],
      title: 'Configure Spectrum Analyzer for Downlink',
      description: 'Reconfigure the spectrum analyzer to view the main downlink signal at IF 1422 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-beacon-lock'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center: 1422 MHz',
          params: {
            centerFrequency: 1422e6 as Hertz,
            centerFrequencyTolerance: 5e6,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 50 MHz',
          params: {
            span: 50e6,
            frequencyTolerance: 25e6,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude: -20 dBm',
          params: {
            maxAmplitude: -20 as dBm,
            amplitudeTolerance: 5 as dB,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude: -50 dBm',
          params: {
            minAmplitude: -50 as dBm,
            amplitudeTolerance: 5 as dB,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW set to automatic',
          params: {
            rbw: null, // Automatic RBW
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-rx-modem',
      // K0773: Knowledge of telecommunications principles and practices
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'S0421', 'T1567'],
      title: 'Configure RX Modem',
      description: 'Set the receiver modem to the AURORA-7 downlink IF frequency (1422 MHz) with correct bandwidth and modulation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-speca-downlink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency: 1422 MHz',
          params: {
            frequency: 1422e6 as Hertz,
            frequencyTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-bandwidth-set',
          description: 'RX Bandwidth: 24 MHz',
          params: {
            bandwidth: 24e6,
            bandwidthTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-modulation-set',
          description: 'Modulation: QPSK',
          params: {
            modulation: 'QPSK',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC: 3/4',
          params: {
            fec: '3/4',
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-rx-lock',
      // T0153: Monitor network capacity and performance
      // K0740: Knowledge of system performance indicators
      nice: ['T0153', 'K0740'],
      title: 'Verify RX Signal Lock',
      description: 'Confirm receiver has locked to AURORA-7 downlink with acceptable SNR.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-rx-modem'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: {
            modemNumber: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SNR Above 8 dB',
          params: {
            minCNRatio: 8,
            modemNumber: 1,
          },
          maintainUntilObjectiveComplete: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 4: ENCRYPTION & PAYLOAD UNDERSTANDING
    // ============================================================
    {
      id: 'quiz-encryption',
      // S0077: Skill in securing network communications
      nice: ['S0077'],
      title: 'Verify Encryption Understanding',
      description: 'Before we enable transmission, let\'s verify you understand the encryption configuration. Look at the Encryption card on the TX Chain tab.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-lock'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Encryption Understanding',
          params: {
            question: 'Looking at the Encryption card, what security configuration is active?',
            options: [
              'AES-256-GCM with valid key - ready for secure transmission',
              'AES-128-CBC with expired key - needs renewal',
              'Encryption bypassed - transmitting in clear',
              'Triple-DES with pending key rotation',
            ],
            correctIndex: 0,
            explanation: 'The Encryption card shows AES-256-GCM active with a valid key. AES-256 provides strong symmetric encryption, and GCM mode adds authenticated encryption to detect tampering. Always verify encryption status before transmitting.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // ============================================================
    // PHASE 5: TRANSMIT CONFIGURATION
    // ============================================================
    {
      id: 'calculate-tx-if',
      // K0773: Knowledge of telecommunications principles and practices
      nice: ['K0773'],
      title: 'Calculate TX IF Frequency',
      description: 'AURORA-7\'s uplink is at 6053 MHz RF. Calculate the TX IF frequency using the BUC LO at 7500 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-encryption'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'TX IF Calculated',
          params: {
            question: 'What TX IF frequency should you configure to transmit at 6053 MHz RF?',
            options: [
              '1447 MHz (7500 - 6053 = 1447)',
              '13553 MHz (6053 + 7500 = 13553)',
              '2303 MHz (6053 - 7500 / 2 = 2303)',
              '755 MHz (7500 - 4170 = 755)',
            ],
            correctIndex: 0,
            explanation: 'For uplink, the BUC upconverts the IF to RF: RF = IF + LO, so IF = LO - RF = 7500 - 6053 = 1447 MHz. This is similar to the downlink calculation because the BUC is also using low-side injection.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-tx-modem',
      // S0421: Skill in operating network equipment
      // T1567: Equipment configuration happens throughout
      nice: ['S0421', 'T1567'],
      title: 'Configure TX Modem',
      description: 'Set the TX modem frequency to 1447 MHz to transmit on AURORA-7\'s uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-tx-if'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency: 1447 MHz',
          params: {
            frequency: 1447e6,
            frequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-transmit-path',
      // T0431: Check system hardware availability, functionality, integrity
      // K0741: Knowledge of system availability measures
      // T1567: Equipment configuration happens throughout
      nice: ['T0431', 'K0741', 'T1567'],
      title: 'Enable Transmit Path',
      description: 'Unmute the BUC and enable the HPA to begin transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-tx-modem'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not Overdriven',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 6: FINAL VERIFICATION
    // ============================================================
    {
      id: 'final-verification',
      // K1032: Knowledge of satellite-based communication systems
      nice: ['K1032'],
      title: 'Full Duplex Established',
      description: 'Verify your understanding of the complete step-track link.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-transmit-path'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Link Summary',
          params: {
            question: 'Which statement best describes your operational link to AURORA-7?',
            options: [
              'Step-track maintaining lock on beacon, RX at 1422 MHz IF, TX at 1447 MHz IF, AES-256 encrypted',
              'Program-track following TLE, RX at 1085 MHz IF, TX at 1043 MHz IF, unencrypted',
              'Manual pointing, RX at 1532 MHz IF, TX at 1094 MHz IF, AES-128 encrypted',
              'Step-track on beacon, RX at 3605 MHz RF, TX at 5830 MHz RF, no encryption',
            ],
            correctIndex: 0,
            explanation: 'Your link uses step-track mode to maintain pointing on the inclined-orbit AURORA-7 satellite. The receiver is configured for 1422 MHz IF (downlink), transmitter for 1447 MHz IF (uplink), and AES-256-GCM encryption is active.',
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
        Today's a training day. We're going to practice step-track on AURORA-7 - she's an old bird with an inclined orbit.
      </p>
      <p>
        Unlike the TIDEMARK satellites which sit in nice geostationary slots, AURORA-7 drifts north and south throughout the day. Program-track won't cut it because the orbital predictions aren't accurate enough. You need step-track.
      </p>
      <p>
        Step-track uses the beacon signal to continuously adjust antenna pointing. The algorithm hunts for maximum signal, making small adjustments to keep the antenna optimized.
      </p>
      <p>
        I've already configured the beacon frequency, encryption, and payload settings. Your job is to get the antenna tracking, establish receive lock, and configure the transmit path. You'll need to calculate the TX IF frequency yourself. Take your time - this is practice.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/6/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Good. The mission brief covers the basics of inclined orbit operations. Key thing to remember - AURORA-7 moves, so you need to track it actively.
        </p>
        <p>
          Let's start with a quick knowledge check on why step-track is necessary.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-review-mission-brief.mp3'),
      },
      'understand-inclined-orbit': {
        text: `
        <p>
          Exactly. The satellite's orbit is tilted relative to the equator, so it appears to move north and south from our perspective.
        </p>
        <p>
          Take a look at the ACU Control tab. The antenna is already in program-track mode, but it's pointed at the wrong satellite. Check which one is selected.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-understand-inclined-orbit.mp3'),
      },
      'recognize-wrong-satellite': {
        text: `
        <p>
          Good catch. The antenna was left tracking TIDEMARK-1 from the previous shift. We need AURORA-7.
        </p>
        <p>
          Program-track gives us rough pointing using ephemeris data - it's quick and doesn't require beacon lock. Change the target to AURORA-7 and move the antenna.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-recognize-wrong-satellite.mp3'),
      },
      'program-track-aurora7': {
        text: `
        <p>
          Good. Program-track has acquired AURORA-7's predicted position. But there's a catch with inclined-orbit satellites...
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-program-track-aurora7.mp3'),
      },
      'quiz-program-track-limitation': {
        text: `
        <p>
          Right. Program-track assumes the satellite stays put. AURORA-7's inclined orbit means it drifts throughout the day, so the predictions are only good for rough pointing.
        </p>
        <p>
          That's why we need step-track - it actively follows the beacon signal instead of relying on predictions. I've already configured the beacon frequency at 1,085 megahertz IF. Let's verify that configuration before switching modes.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-quiz-program-track-limitation.mp3'),
      },
      'verify-beacon-config': {
        text: `
        <p>
          Good - you understand how the beacon IF was calculated. Now switch the antenna to step-track mode. The beacon is ready - the algorithm will start searching as soon as you enable it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-beacon-config.mp3'),
      },
      'enable-step-track': {
        text: `
        <p>
          Step-track is active. Watch the beacon C/N ratio - it should start rising as the algorithm finds the optimal pointing. This takes a few seconds as it hunts around.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-enable-step-track.mp3'),
      },
      'acquire-beacon-lock': {
        text: `
        <p>
          Beacon lock acquired. The antenna is now actively tracking AURORA-7. You'll see small corrections happening continuously as the satellite drifts.
        </p>
        <p>
          Time to configure the receive chain. Widen the spectrum analyzer view to see the main downlink signal at 1,645 megahertz IF.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-acquire-beacon-lock.mp3'),
      },
      'configure-speca-downlink': {
        text: `
        <p>
          Good, you can see the downlink signal on the spectrum analyzer. Now configure the receiver modem to match - 1,645 megahertz center frequency, 24 megahertz bandwidth, QPSK modulation, 3/4 FEC.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-configure-speca-downlink.mp3'),
      },
      'configure-rx-modem': {
        text: `
        <p>
          Receiver is configured. Watch for lock and check the signal-to-noise ratio.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-configure-rx-modem.mp3'),
      },
      'verify-rx-lock': {
        text: `
        <p>
          Receiver locked with good SNR. We're halfway there - receiving from AURORA-7.
        </p>
        <p>
          Before we enable transmission, I want to make sure you understand the encryption and payload systems. Look at the TX Chain tab - you'll see the Encryption and Payload cards I pre-configured.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-rx-lock.mp3'),
      },
      'quiz-encryption': {
        text: `
        <p>
          Correct. AES-256-GCM is the standard for our links. Never transmit without verifying encryption status.
        </p>
        <p>
          Now here's your main calculation for this mission. The TX modem is set to the wrong frequency. AURORA-7's uplink is at 5,830 megahertz RF, and your BUC local oscillator is at 4,925 megahertz. Calculate the correct TX IF frequency.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-quiz-encryption.mp3'),
      },
      'calculate-tx-if': {
        text: `
        <p>
          1447 megahertz. Good work. The BUC upconverts from IF to RF, so it's a different calculation than the downlink. Set the TX modem to 1447 megahertz.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-calculate-tx-if.mp3'),
      },
      'configure-tx-modem': {
        text: `
        <p>
          TX modem configured. Now unmute the BUC and enable the HPA to begin transmission.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-configure-tx-modem.mp3'),
      },
      'enable-transmit-path': {
        text: `
        <p>
          Transmit path is active. Full duplex established with AURORA-7.
        </p>
        <p>
          One final check - let's make sure you understand the complete link configuration.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-enable-transmit-path.mp3'),
      },
      'final-verification': {
        text: `
        <p>
          Perfect. You've successfully established a step-track link to an inclined-orbit satellite. The antenna is actively tracking, receive is locked, transmit is enabled, and encryption is verified.
        </p>
        <p>
          Step-track is a critical skill for working with aging satellites. As more birds reach end-of-life and stop station-keeping, you'll use this technique more often.
        </p>
        <p>
          Well done. Let's call it a day on the training.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/complete.mp3'),
      },
    },
  },
};
