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
 * Calculation Required: YES - beacon IF frequency calculation
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
 *
 * Premise: This is a training exercise to practice step-track mode on AURORA-7,
 * a legacy satellite with an inclined orbit. Charlie Brooks has pre-configured
 * the encryption and payload settings - the student just needs to understand
 * what they do.
 *
 * Key Learning Objectives:
 * 1. Understand why inclined orbits require step-track
 * 2. Configure beacon frequency for step-track acquisition
 * 3. Enable step-track mode and achieve beacon lock
 * 4. Configure RX modem for downlink reception
 * 5. Understand encryption and payload card functions
 * 6. Enable transmit path
 *
 * Technical Reference (AURORA-7):
 *   - Uplink RF: 5830 MHz
 *   - Downlink RF: 3605 MHz
 *   - Beacon RF: 4165 MHz
 *   - LNB LO: 5250 MHz
 *   - Beacon IF: 1085 MHz (5250 - 4165)
 *   - Downlink IF: 1645 MHz (5250 - 3605)
 *   - BUC LO: 4925 MHz
 *   - TX IF: 905 MHz (5830 - 4925)
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
  // prerequisiteScenarioIds: ['nats-scenario5'],
  imageUrl: 'nats/6/card.png',
  number: 6,
  title: 'Old Faithful',
  subtitle: 'Step-Track Operations on Inclined Orbit',
  duration: '25-30 min',
  timeLimitSeconds: 30 * 60,
  difficulty: 'intermediate',
  missionType: 'Training Exercise',
  description: `AURORA-7 is a legacy C-band satellite that's been in service for over 15 years. To conserve fuel, the operators stopped north-south station-keeping, so the orbit is now inclined. The satellite traces a figure-8 pattern in the sky - you can't just point and forget.<br><br>This is a training exercise to practice step-track mode. Unlike program-track which follows predicted orbital elements, step-track uses the beacon signal to continuously adjust antenna pointing. It's essential for tracking satellites with inclined orbits.<br><br>Charlie has pre-configured the encryption and payload settings. Your job is to acquire the satellite using step-track, establish receive lock, and bring up the transmit path.<br><br>Take your time and pay attention to the beacon - it's your guide.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem',
    'Transmitter Modem',
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
            beaconFrequencyHz: 0 as Hertz, // Not configured - student must set
            isLocked: true, // Program-track is locked on TIDEMARK-1
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // TX chain pre-configured by Charlie but disabled
            buc: {
              isMuted: true,
              loFrequency: 4925 as MHz, // Set for AURORA-7
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
                  frequency: 905e6 as IfFrequency, // Pre-configured for AURORA-7
                  bandwidth: 24e6 as Hertz,
                  power: -7 as dBm,
                },
              },
            ],
          },
        ],
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-6?content-only=true&dark=true',
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
      id: 'calculate-beacon-if',
      // K0773: Knowledge of telecommunications principles and practices
      nice: ['K0773'],
      title: 'Calculate Beacon IF Frequency',
      description: 'AURORA-7\'s beacon is at 4165 MHz RF. Calculate the IF frequency with your LNB LO at 5250 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-program-track-limitation'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon IF Calculated',
          params: {
            question: 'What IF frequency should you configure for the AURORA-7 beacon?',
            options: [
              '1085 MHz (5250 - 4165 = 1085)',
              '1165 MHz (4165 + 1000 = 1165)',
              '9415 MHz (5250 + 4165 = 9415)',
              '915 MHz (4165 - 3250 = 915)',
            ],
            correctIndex: 0,
            explanation: 'The LNB local oscillator is at 5250 MHz. For high-side injection: IF = LO - RF = 5250 - 4165 = 1085 MHz.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-beacon-frequency',
      // S0421: Skill in operating network equipment
      nice: ['S0421'],
      title: 'Configure Beacon Frequency',
      description: 'Set the beacon frequency in the ACU to 1085 MHz for step-track acquisition.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-beacon-if'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-frequency-set',
          description: 'Beacon Frequency: 1085 MHz',
          params: {
            beaconFrequency: 1085e6,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-step-track',
      // S0421: Skill in operating network equipment
      nice: ['S0421'],
      title: 'Enable Step-Track Mode',
      description: 'Switch the antenna to step-track mode and start tracking.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-beacon-frequency'],
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
      nice: ['K0773', 'S0421'],
      title: 'Configure Spectrum Analyzer for Downlink',
      description: 'Reconfigure the spectrum analyzer to view the main downlink signal at IF 1645 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-beacon-lock'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center: 1645 MHz',
          params: {
            centerFrequency: 1645e6 as Hertz,
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
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-rx-modem',
      // K0773: Knowledge of telecommunications principles and practices
      // S0421: Skill in operating network equipment
      nice: ['K0773', 'S0421'],
      title: 'Configure RX Modem',
      description: 'Set the receiver modem to the AURORA-7 downlink IF frequency (1645 MHz) with correct bandwidth and modulation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-speca-downlink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency: 1645 MHz',
          params: {
            frequency: 1645e6,
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
    // PHASE 5: TRANSMIT ENABLE
    // ============================================================
    {
      id: 'enable-transmit-path',
      // T0431: Check system hardware availability, functionality, integrity
      // K0741: Knowledge of system availability measures
      nice: ['T0431', 'K0741'],
      title: 'Enable Transmit Path',
      description: 'The TX modem is already configured. Unmute the BUC and enable the HPA to begin transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['quiz-encryption'],
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
              'Step-track maintaining lock on beacon, RX at 1645 MHz IF, TX at 905 MHz IF, AES-256 encrypted',
              'Program-track following TLE, RX at 1085 MHz IF, TX at 1043 MHz IF, unencrypted',
              'Manual pointing, RX at 1532 MHz IF, TX at 1094 MHz IF, AES-128 encrypted',
              'Step-track on beacon, RX at 3605 MHz RF, TX at 5830 MHz RF, no encryption',
            ],
            correctIndex: 0,
            explanation: 'Your link uses step-track mode to maintain pointing on the inclined-orbit AURORA-7 satellite. The receiver is configured for 1645 MHz IF (downlink), transmitter for 905 MHz IF (uplink), and AES-256-GCM encryption is active.',
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
        I've already configured the encryption and payload settings. Your job is to get the antenna tracking, establish receive lock, and bring up the transmit path. Take your time - this is practice.
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
          That's why we need step-track - it actively follows the beacon signal instead of relying on predictions. First, calculate the beacon IF frequency. AURORA-7's beacon is at 4,165 megahertz RF. Your LNB local oscillator is at 5,250 megahertz.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-quiz-program-track-limitation.mp3'),
      },
      'calculate-beacon-if': {
        text: `
        <p>
          1,085 megahertz. Good. Now go to the ACU Control tab and set the beacon frequency to 1,085 megahertz.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-calculate-beacon-if.mp3'),
      },
      'configure-beacon-frequency': {
        text: `
        <p>
          Beacon frequency is set. Now switch the antenna to step-track mode. The algorithm will start searching for the beacon once you enable it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-configure-beacon-frequency.mp3'),
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
          The TX modem is already configured at 905 megahertz IF. All you need to do is unmute the BUC and enable the HPA.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-quiz-encryption.mp3'),
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
