import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 4: "New Bird on the Block"
 *
 * Phase: Intermediate operations
 * Time Pressure: Per-objective timers
 * Calculation Required: YES - IF frequency adjustments
 * New UI Elements: Multi-character dialog, satellite switchover workflow
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating network equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0773: Knowledge of telecommunications principles and practices
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0770: Knowledge of system administration principles
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - T1567: Equipment configuration happens throughout
 *
 * Premise: ME-02 is maintaining primary operations on TIDEMARK-1. TIDEMARK-2 has
 * just completed station-keeping at 45°W and the Halifax spacecraft team has handed
 * over the communications payload. VT-01 needs to switch from monitoring TIDEMARK-1
 * to establishing full uplink/downlink with TIDEMARK-2.
 *
 * Key Learning Objectives:
 * 1. Verify current system state before making changes
 * 2. Command antenna to new satellite position using program track
 * 3. Calculate and configure IF frequencies for new satellite
 * 4. Acquire beacon signal and verify receive chain
 * 5. Configure receiver modem with correct parameters
 * 6. Configure transmitter and enable uplink in proper sequence
 * 7. Verify full duplex operation
 */

export const scenario4Data: ScenarioData = {
  id: 'nats-scenario4',
  url: 'nats/scenarios/nats-scenario4',
  prerequisiteScenarioIds: ['nats-scenario3'],
  imageUrl: 'nats/4/card.png',
  number: 4,
  title: 'New Bird on the Block',
  subtitle: 'Satellite Switchover Operations',
  duration: '25-30 min',
  timeLimitSeconds: 30 * 60,
  difficulty: 'beginner',
  missionType: 'Operations Phase',
  description: `ME-02 is maintaining primary communications with TIDEMARK-1. The spacecraft operations team in Halifax has just confirmed that TIDEMARK-2 has completed station-keeping at 45°W and the communications payload is ready for ground operations.<br><br>Your task at VT-01 is to switch from monitoring TIDEMARK-1 to establishing full uplink and downlink with TIDEMARK-2. You'll need to repoint the antenna, acquire the new beacon, reconfigure the modems for the new frequencies, and bring up the transmit path.<br><br>Marcus Chen from Halifax spacecraft ops will confirm payload status. Take your time - ME-02 has primary coverage while you complete the switchover.`,
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
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { isMuted: true, loFrequency: 7000 as MHz },
            hpa: { isHpaEnabled: false },
          }),
        ],
        receivers: [
          {
            ...vermontGroundStation.receivers[0],
            modems: [
              {
                ...vermontGroundStation.receivers[0].modems[0],
                fec: "1/2",
              },
            ],
          }
        ]
      },
      {
        ...vermontGroundStation,
        id: maineGroundStation.id,
        name: maineGroundStation.name,
        location: maineGroundStation.location,
        isOperational: true,
      }
    ],
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-4?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
      tidemark2Satellite
    ],
  },
  objectives: [
    // ============================================================
    // PHASE 1: MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs) - reviewing the mission brief
      // establishes the procedural framework for the satellite switchover workflow
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open the mission brief to understand the switchover requirements, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Reviewed',
          params: {
            boxId: 'mission-brief',
          },
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
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface is fundamental to all subsequent operations
      nice: ['S0421'],
      title: 'Access Vermont Ground Station',
      description: 'Select the Vermont Ground Station (VT-01) in the asset tree to access its equipment panels.',
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
    {
      id: 'navigate-acu-verify',
      // S0421: Skill in operating network equipment - navigating to the antenna
      // control panel to verify current tracking state
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to verify the current antenna tracking state before making changes.',
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
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-current-status',
      // K0740: Knowledge of system performance indicators - understanding current antenna tracking
      // state and satellite assignments before initiating switchover procedures
      // K1032: Knowledge of satellite-based communication systems - identifying which satellite
      // the ground station is currently tracking based on antenna position
      nice: ['K0740', 'K1032'],
      title: 'Verify Current TIDEMARK-1 Status',
      description: 'Confirm which satellite VT-01 is currently tracking and its current antenna position.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-acu-verify'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Current Satellite Identified',
          params: {
            question: 'What satellite is VT-01 currently tracking?',
            options: [
              'TIDEMARK-1',
              'TIDEMARK-2',
              'SES-10',
              'None - antenna is stowed',
            ],
            correctIndex: 0,
            explanation: 'VT-01 is currently tracking TIDEMARK-1. The antenna is pointed at Az: 161.8°, El: 34.2° with beacon lock confirmed. We need to switch to TIDEMARK-2 at Az: 219.7°, El: 26.3°.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-antenna-initial-state',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying antenna mode and position before commanding a slew
      // K0740: Knowledge of system performance indicators - understanding tracking mode
      // indicators and their implications for satellite acquisition
      nice: ['T0431', 'K0740'],
      title: 'Verify Antenna Configuration',
      description: 'Before commanding the antenna, verify its current tracking mode and understand why this matters.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-current-status'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Verify Tracking Mode',
          params: {
            question: 'What tracking mode is the antenna currently in, and why does this matter for the switchover?',
            options: [
              'Program-track - the antenna follows ephemeris data and will need new coordinates for TIDEMARK-2',
              'Step-track - the antenna is actively hunting for peak signal and will automatically find TIDEMARK-2',
              'Manual - the antenna is locked in position and cannot be moved remotely',
              'Stow - the antenna is parked and needs to be unstowed first',
            ],
            correctIndex: 0,
            explanation: 'The antenna is in program-track mode, following TIDEMARK-1\'s predicted position from ephemeris data. To switch to TIDEMARK-2, we need to command new coordinates. The ACU will calculate the slew path and move the antenna smoothly to the new position.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: ANTENNA RECONFIGURATION
    // ============================================================
    {
      id: 'command-antenna',
      // S0421: Skill in operating network equipment - commanding the antenna control unit
      // to slew to a new satellite position using program track mode
      // K1032: Knowledge of satellite-based communication systems - understanding orbital
      // positions and the relationship between azimuth/elevation and satellite location
      nice: ['S0421', 'K1032'],
      title: 'Command Antenna to Track TIDEMARK-2',
      description: 'Slew the antenna to TIDEMARK-2 position (Az: 219.7°, El: 26.3°). The antenna will calculate the optimal slew path.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-antenna-initial-state'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program Track Mode Active',
          params: {
            trackingMode: 'program-track',
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position',
          description: 'Antenna at TIDEMARK-2 Position',
          params: {
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-antenna-slew-quiz',
      // K1032: Knowledge of satellite-based communication systems - understanding why
      // the antenna position changed significantly between satellites
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // the relationship between orbital position and ground station look angles
      nice: ['K1032', 'K0773'],
      title: 'Understand Position Change',
      description: 'The antenna has moved significantly. Understand why the look angles are so different.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['command-antenna'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Antenna Movement',
          params: {
            question: 'The antenna slewed about 58° in azimuth and dropped 8° in elevation. Why such a large change?',
            options: [
              'TIDEMARK-2 is at a different orbital slot (45°W vs 53°W), requiring different look angles from Vermont',
              'The antenna was incorrectly pointed at TIDEMARK-1 before',
              'TIDEMARK-2 has a lower orbit than TIDEMARK-1',
              'Wind pushed the antenna off-target during the slew',
            ],
            correctIndex: 0,
            explanation: 'TIDEMARK-1 sits at 53°W and TIDEMARK-2 is at 45°W - that\'s 8 degrees of orbital separation. From Vermont\'s perspective, this translates to about 58° of azimuth change and 8° of elevation change. Different satellites require different pointing angles even when both are GEO.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: BEACON ACQUISITION
    // ============================================================
    {
      id: 'navigate-rx-beacon',
      // S0421: Skill in operating network equipment - navigating to the receive
      // analysis panel to configure spectrum analyzer for beacon acquisition
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to access the spectrum analyzer and receiver equipment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-antenna-slew-quiz'],
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
      id: 'understand-frequency-calculation',
      // K0773: Knowledge of telecommunications principles and practices - calculating the
      // correct IF frequency from RF frequency and LO before configuring equipment
      nice: ['K0773'],
      title: 'Calculate Beacon IF Frequency',
      description: 'Before configuring the spectrum analyzer, you need to calculate where the TIDEMARK-2 beacon will appear at IF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-beacon'],
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
          description: 'Calculate IF Frequency',
          params: {
            question: 'TIDEMARK-2\'s beacon transmits at 4,180 MHz RF. With the LNB LO at 5,250 MHz, what IF frequency should you see the beacon at?',
            options: [
              '1,070 MHz (LO minus RF = 5,250 - 4,180)',
              '9,430 MHz (LO plus RF = 5,250 + 4,180)',
              '4,180 MHz (same as RF)',
              '1,074.5 MHz (same as TIDEMARK-1 beacon)',
            ],
            correctIndex: 0,
            explanation: 'The LNB downconverts by mixing with the local oscillator. IF = LO - RF = 5,250 - 4,180 = 1,070 MHz. Note this is slightly different from TIDEMARK-1\'s beacon at 1,074.5 MHz IF - each satellite has its own beacon frequency.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-speca-beacon',
      // K0773: Knowledge of telecommunications principles and practices - selecting appropriate
      // span and RBW for CW beacon observation
      // S0421: Skill in operating network equipment - configuring spectrum analyzer parameters
      // including center frequency, span, RBW, and reference level
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'S0421', 'T1567'],
      title: 'Configure Spectrum Analyzer for TIDEMARK-2 Beacon',
      description: 'Set spectrum analyzer to view TIDEMARK-2 beacon at IF frequency 1070 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-frequency-calculation'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center Frequency: 1070 MHz',
          params: {
            centerFrequency: 1070e6 as Hertz,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 10 kHz (narrow for CW)',
          params: {
            span: 10e3,
            frequencyTolerance: 5e3,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW: 1 kHz',
          params: {
            rbw: 1000 as Hertz,
            frequencyTolerance: 500,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-reference-level-set',
          description: 'Reference Level: -90 dBm',
          params: {
            referenceLevel: -90,
            referenceLevelTolerance: 5,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-beacon',
      // T0153: Analyze network traffic to identify anomalous activity - recognizing the
      // beacon signal on the spectrum analyzer as confirmation of successful acquisition
      // K1032: Knowledge of satellite-based communication systems - understanding the role
      // of beacon signals in satellite link establishment and health monitoring
      nice: ['T0153', 'K1032'],
      title: 'Acquire TIDEMARK-2 Beacon',
      description: 'Verify beacon signal appears on spectrum analyzer at the calculated IF frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-speca-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-2-Beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: false,
        },
        {
          type: 'signal-level-correct',
          description: 'Beacon Level Stable',
          params: {
            signalId: 'TIDEMARK-2-Beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-beacon-acquisition',
      // K1032: Knowledge of satellite-based communication systems - understanding that
      // beacon acquisition confirms both antenna pointing and LNB frequency configuration
      // K0773: Knowledge of telecommunications principles and practices - comprehending
      // how RF-to-IF conversion must be correct to observe the beacon at expected frequency
      nice: ['K1032', 'K0773'],
      title: 'Verify Beacon Acquisition',
      description: 'Confirm understanding of what beacon acquisition indicates.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon Significance Understood',
          params: {
            question: 'What does a stable beacon signal confirm?',
            options: [
              'Antenna is pointed correctly',
              'LNB local oscillator frequency is correct',
              'Both antenna pointing and LNB frequency are correct',
              'Neither - beacon is independent of ground equipment',
            ],
            correctIndex: 2,
            explanation: 'A stable beacon confirms both: (1) the antenna is pointed at the correct satellite, and (2) the LNB LO frequency is set correctly to downconvert the beacon RF to the expected IF. If either were wrong, you would not see the beacon at the expected frequency.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-beacon-chain-quiz',
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // the entire receive chain from antenna to spectrum analyzer
      // T0431: Check system hardware availability - using beacon to validate receive chain
      nice: ['K0773', 'T0431'],
      title: 'Understand Receive Chain Validation',
      description: 'Understand what the beacon proves about the receive chain before configuring the modem.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-acquisition'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Chain Validation',
          params: {
            question: 'We verified the beacon on the spectrum analyzer. Why is this important before configuring the receiver modem?',
            options: [
              'It proves the entire RF path is working - antenna feed, LNB, cables, and signal routing - so we know modem issues would be modem configuration, not upstream problems',
              'The modem cannot lock without first seeing the beacon',
              'The beacon automatically configures the modem frequency',
              'It\'s just a procedural requirement with no technical purpose',
            ],
            correctIndex: 0,
            explanation: 'Seeing the beacon on the spectrum analyzer validates the entire upstream chain. If the modem fails to lock after this, you know the problem is modem configuration - not antenna pointing, not LNB settings, not cables. This systematic approach eliminates troubleshooting guesswork.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: RECEIVER CONFIGURATION
    // ============================================================
    {
      id: 'configure-rx-frequency',
      // K0773: Knowledge of telecommunications principles and practices - calculating
      // downlink IF frequency from transponder RF output and LNB local oscillator
      // S0421: Skill in operating network equipment - configuring receiver modem
      // frequency and bandwidth parameters to match satellite transponder output
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'S0421', 'T1567'],
      title: 'Configure RX Modem Frequency',
      description: 'Set receiver modem to TIDEMARK-2 downlink IF frequency (1458 MHz). This is calculated from the transponder downlink RF and the LNB LO.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-chain-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency: 1458 MHz',
          params: {
            frequency: 1458e6,
            frequencyTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-bandwidth-set',
          description: 'RX Bandwidth: 36 MHz',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-rx-modulation',
      // K0773: Knowledge of telecommunications principles and practices - understanding
      // digital modulation schemes (QPSK) and forward error correction (FEC) rates
      // and their relationship to link performance
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'T1567'],
      title: 'Configure RX Modem Modulation',
      description: 'Set receiver modem modulation and FEC to match TIDEMARK-2 signal format.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-rx-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
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
      points: 10,
    },
    {
      id: 'verify-rx-lock',
      // T0153: Analyze network traffic to identify anomalous activity - verifying receiver
      // lock status and monitoring signal-to-noise ratio for link quality assessment
      // K0740: Knowledge of system performance indicators - understanding SNR thresholds
      // required for reliable QPSK demodulation and what constitutes healthy link margin
      nice: ['T0153', 'K0740'],
      title: 'Verify RX Signal Lock',
      description: 'Confirm receiver has locked to TIDEMARK-2 downlink with acceptable SNR.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-rx-modulation'],
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
          description: 'SNR Above 10 dB',
          params: {
            minCNRatio: 10,
            modemNumber: 1,
          },
          maintainUntilObjectiveComplete: true,
          maintainDuration: 30,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-rx-margin-quiz',
      // K0740: Knowledge of system performance indicators - understanding the difference
      // between achieving lock and having adequate operating margin
      // K0773: Knowledge of telecommunications principles - understanding FEC thresholds
      nice: ['K0740', 'K0773'],
      title: 'Understand Link Margin',
      description: 'Understand why we verify C/N margin, not just lock status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-lock'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Link Margin',
          params: {
            question: 'The modem shows "Locked" with C/N above 10 dB. Why do we check the C/N value and not just the lock indicator?',
            options: [
              'Lock can occur at C/N as low as 3-4 dB, but error rates would be high - we need margin for reliable operation',
              'The lock indicator is unreliable and often shows false positives',
              '10 dB is required for the modem hardware to function',
              'The C/N value determines the data rate we can achieve',
            ],
            correctIndex: 0,
            explanation: 'QPSK with FEC 3/4 can achieve lock at about 4-5 dB C/N, but bit error rates would be significant. With 10+ dB, we have comfortable margin - the link stays solid even if weather degrades it slightly. Lock without margin is asking for trouble during the first rain fade.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 5: TRANSMITTER CONFIGURATION
    // ============================================================
    {
      id: 'navigate-tx-chain',
      // S0421: Skill in operating network equipment - navigating to the transmit
      // chain panel to configure uplink equipment
      nice: ['S0421'],
      title: 'Open TX Chain Tab',
      description: 'Click the TX Chain tab to access the transmitter modem, BUC, and HPA controls.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-margin-quiz'],
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
      id: 'verify-tx-initial-state',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying transmit chain state before enabling RF output
      // K0740: Knowledge of system performance indicators - understanding HPA and BUC
      // status indicators
      nice: ['T0431', 'K0740'],
      title: 'Verify TX Chain Status',
      description: 'Check the current state of the transmit chain before configuring for TIDEMARK-2.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain'],
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
          type: 'status-check',
          description: 'Verify TX Chain State',
          params: {
            question: 'What is the current state of VT-01\'s transmit chain?',
            options: [
              'BUC is muted and HPA is disabled - no RF output (safe state for switchover)',
              'BUC and HPA are active but transmitting to TIDEMARK-1',
              'TX chain is completely powered off',
              'TX chain is faulted and needs reset',
            ],
            correctIndex: 0,
            explanation: 'The transmit chain was placed in safe state for the switchover - BUC muted and HPA disabled. This is standard procedure when changing satellites. ME-02 is handling TIDEMARK-1 traffic, so VT-01 doesn\'t need to transmit until we\'re ready for TIDEMARK-2.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-tx-modem',
      // K0773: Knowledge of telecommunications principles and practices - configuring
      // uplink parameters including IF frequency, bandwidth, power level, and modulation
      // S0421: Skill in operating network equipment - setting transmitter modem parameters
      // to establish uplink through the satellite transponder
      // T1567: Equipment configuration happens throughout
      nice: ['K0773', 'S0421', 'T1567'],
      title: 'Configure TX Modem',
      description: 'Set transmitter modem parameters for TIDEMARK-2 uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tx-initial-state'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency: 1020 MHz',
          params: {
            frequency: 1020e6,
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
          type: 'tx-modem-power-set',
          description: 'TX Power: -7 dBm',
          params: {
            power: -7,
            powerTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'TX Modulation: QPSK',
          params: {
            modulation: 'QPSK',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'TX FEC: 3/4',
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
      id: 'understand-buc-hpa-sequence',
      // K0770: Knowledge of system administration principles and practices - understanding
      // proper power-up sequencing for RF equipment
      // K0741: Knowledge of system availability measures - preventing equipment damage
      // through correct operational sequences
      nice: ['K0770', 'K0741'],
      title: 'Understand TX Sequence',
      description: 'Before enabling the transmit path, understand the correct sequence.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-tx-modem'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand TX Sequence',
          params: {
            question: 'You need to enable the transmit path. What is the correct sequence and why?',
            options: [
              'Unmute BUC first, then enable HPA - drive the amplifier chain from input to output to avoid undriven amplifiers',
              'Enable HPA first, then unmute BUC - warm up the high-power stage before applying signal',
              'Both can be enabled simultaneously - order doesn\'t matter',
              'The modem automatically sequences them when you press transmit',
            ],
            correctIndex: 0,
            explanation: 'Always enable the signal chain from input to output: BUC first, then HPA. An enabled HPA with no input signal can oscillate or amplify noise. By unmuting the BUC first, we ensure the HPA sees a proper signal as soon as it\'s enabled. Same principle as any amplifier chain.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-transmit-path',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying BUC and HPA readiness before enabling RF transmission
      // K0741: Knowledge of system availability measures - understanding the significance
      // of unmuting BUC and enabling HPA for full duplex satellite communications
      // T1567: Equipment configuration happens throughout
      nice: ['T0431', 'K0741', 'T1567'],
      title: 'Enable Transmit Path',
      description: 'Unmute BUC and enable HPA for transmission, in the correct sequence.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-buc-hpa-sequence'],
      timeLimitSeconds: 2 * 60,
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
      points: 10,
    },
    {
      id: 'verify-full-duplex-quiz',
      // K1032: Knowledge of satellite-based communication systems - understanding
      // full duplex operation through bent-pipe transponder
      // T0153: Monitor network capacity and performance - confirming bidirectional
      // communication is established
      nice: ['K1032', 'T0153'],
      title: 'Verify Full Duplex Operation',
      description: 'Confirm you understand what full duplex operation means for this link.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-transmit-path'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Full Duplex',
          params: {
            question: 'VT-01 now has both receive and transmit paths active to TIDEMARK-2. What confirms full duplex operation?',
            options: [
              'Receiver locked with good C/N, HPA enabled with proper backoff, no alarms - bidirectional link established',
              'The satellite has acknowledged our uplink signal',
              'Both the TX and RX indicators are green',
              'The modem shows "Full Duplex" mode',
            ],
            correctIndex: 0,
            explanation: 'Full duplex means simultaneous transmit and receive. We confirm this by: (1) receiver locked with margin - downlink working, (2) HPA enabled with proper backoff - uplink active, (3) no alarms - everything in tolerance. The satellite doesn\'t "acknowledge" uplinks - it\'s a bent-pipe transponder that simply relays what it receives.',
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
        Hey there, this is Marcus Chen from Halifax spacecraft ops. TIDEMARK-2's station-keeping is looking good - we finished the last maneuver sequence yesterday and the payload's been handed over to ground ops. She's all yours now.
      </p>
      <p>
        Sorry for the short notice on this one. The bird came online about a week ahead of schedule, but that's a good problem to have. Charlie tells me you've been making solid progress, so I'm confident you can handle the switchover.
      </p>
      <p>
        The mission brief has all the details - frequencies, look angles, everything you need. ME-02's got primary on TIDEMARK-1, so there's no customer impact while you work. Take your time, be methodical, and give me a shout when you've got lock. I'll be watching the payload telemetry from our end.
      </p>
      <p>
        One thing to remember: TIDEMARK-2 is at a different orbital slot than TIDEMARK-1, so your look angles and frequencies will all be different. Don't just copy what worked for the other bird. Think through each step.
      </p>
      `,
      character: Character.MARCUS_CHEN,
      emotion: Emotion.HAPPY,
      audioUrl: getAssetUrl('/assets/campaigns/nats/4/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Good, you've got the mission brief open. This is a standard satellite switchover, but it's your first time doing one end-to-end, so let's be thorough.
        </p>
        <p>
          Since you're new, I'll be handling your training directly. Once I think you're ready, you'll be assigned to a shift rotation with a supervisor like Dana Torres. She runs second shift and keeps her crew sharp. But for now, you're with me.
        </p>
        <p>
          VT-01 is currently locked on TIDEMARK-1 at azimuth 161.8, elevation 34.2. TIDEMARK-2 is about 58 degrees away in azimuth, at a lower elevation - that's a significant slew across the sky.
        </p>
        <p>
          Before we move anything, let's verify exactly where we're starting from. Select Vermont Ground Station in the asset tree and we'll check the current antenna status.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-brief.mp3'),
      },
      'select-vermont-station': {
        text: `
        <p>
          Good. You've got Vermont selected. Now open the ACU Control tab - that's where we verify the current antenna tracking state before making any changes.
        </p>
        <p>
          Always know your starting point before commanding a slew. If you don't know where you are, you can't be sure you'll end up where you want to be.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-select-vermont.mp3'),
      },
      'navigate-acu-verify': {
        text: `
        <p>
          This is the antenna control unit panel. You can see the current pointing angles, tracking mode, and feed status. Before we command a slew to TIDEMARK-2, confirm which satellite we're currently tracking.
        </p>
        <p>
          Look at the position indicators and target selection. The antenna should be pointed at TIDEMARK-1's location right now.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-navigate-acu-verify.mp3'),
      },
      'verify-current-status': {
        text: `
        <p>
          That's right - TIDEMARK-1. Good to confirm you know what you're working with before making changes.
        </p>
        <p>
          The antenna is in program-track mode, following ephemeris predictions. That's typical for GEO satellites - they sit in essentially the same spot, so we follow the math rather than actively hunting for peak signal.
        </p>
        <p>
          Now let's verify the tracking mode and understand why it matters for the switchover.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-status.mp3'),
      },
      'verify-antenna-initial-state': {
        text: `
        <p>
          Right. Program-track uses ephemeris data - orbital predictions - to calculate where the satellite should be. The ACU continuously updates the pointing based on time and orbital parameters.
        </p>
        <p>
          When you command a new target, the ACU will calculate the slew path to TIDEMARK-2's position. The antenna will move smoothly from one set of coordinates to another. Ready to command the slew?
        </p>
        <p>
          Set tracking mode to program-track and select TIDEMARK-2 as the target. The ACU will handle the rest.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-verify-antenna.mp3'),
      },
      'command-antenna': {
        text: `
        <p>
          Antenna's slewing. Nice and smooth. You can see the position indicators updating as it moves across the sky.
        </p>
        <p>
          That was a big move - about 58 degrees in azimuth and 8 degrees in elevation. Takes a minute or two for a dish this size to cover that distance safely. The ACU limits slew rate to prevent mechanical stress.
        </p>
        <p>
          While it's settling, think about why the position change was so significant.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-antenna.mp3'),
      },
      'verify-antenna-slew-quiz': {
        text: `
        <p>
          Exactly. TIDEMARK-1 is at 53 West, TIDEMARK-2 is at 45 West. That's 8 degrees of orbital separation along the Clarke belt. From our perspective here in Vermont, that translates to the angular change you just saw.
        </p>
        <p>
          Every satellite has its own unique look angles from any given ground station. That's why we use program-track with proper ephemeris data instead of just copying numbers from another site.
        </p>
        <p>
          Now let's acquire the beacon. Go to the RX Analysis tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-slew-quiz.mp3'),
      },
      'navigate-rx-beacon': {
        text: `
        <p>
          This is where we verify the antenna is actually pointed correctly. The spectrum analyzer will show us the beacon signal - if it's there and at the right frequency, we know the pointing is good.
        </p>
        <p>
          But first, you need to calculate the correct IF frequency for TIDEMARK-2's beacon. It's different from TIDEMARK-1.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-navigate-rx.mp3'),
      },
      'understand-frequency-calculation': {
        text: `
        <p>
          Good math. TIDEMARK-2's beacon is at 4,180 MHz RF, and with our LNB LO at 5,250 MHz, that gives us 1,070 MHz IF. Note that's slightly different from TIDEMARK-1's beacon - every satellite can have different beacon frequencies.
        </p>
        <p>
          Never assume frequencies are the same between satellites. Check the mission brief, do the calculation, configure correctly. Now set up the spectrum analyzer to see that beacon.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-freq-calc.mp3'),
      },
      'configure-speca-beacon': {
        text: `
        <p>
          Spectrum analyzer's configured correctly. 1,070 MHz center, narrow span for the CW beacon, tight RBW to see it clearly above the noise, and reference level set appropriately.
        </p>
        <p>
          The antenna should be on target by now. Watch the display - if everything's aligned, the beacon should appear right at center frequency. A clean spike above the noise floor.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-speca.mp3'),
      },
      'acquire-beacon': {
        text: `
        <p>
          Marcus here - Charlie just pinged me to say you've got the antenna on TIDEMARK-2 and you're seeing the beacon. That's great news, exactly what we want to see from the ground side.
        </p>
        <p>
          The beacon's been rock solid since we finished station-keeping. If you're seeing it clean on the spectrum analyzer at the expected frequency, your pointing and receive chain are good to go.
        </p>
        <p>
          I'm watching the payload telemetry from Halifax - everything's nominal on our end. Keep going with the configuration.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-beacon.mp3'),
      },
      'verify-beacon-acquisition': {
        text: `
        <p>
          Exactly right. The beacon confirms both your antenna pointing AND your LNB configuration. If either were wrong, you wouldn't see the beacon at the expected IF frequency.
        </p>
        <p>
          Think about it: wrong pointing means no signal at all. Wrong LO frequency means the beacon appears at a different IF. Seeing it where you calculated proves both are correct.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-beacon-quiz.mp3'),
      },
      'verify-beacon-chain-quiz': {
        text: `
        <p>
          That's the right way to think about troubleshooting. The beacon on the spectrum analyzer validates everything upstream of that point - antenna, feed, LNB, cables, routing.
        </p>
        <p>
          If the modem fails to lock after this, you know exactly where the problem is: modem configuration. No need to second-guess the RF path.
        </p>
        <p>
          Now configure the receiver modem. The transponder output is at 3,792 MHz RF. With your LO, that's an IF of 1,458 MHz.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-chain-quiz.mp3'),
      },
      'configure-rx-frequency': {
        text: `
        <p>
          Receiver frequency and bandwidth are set. 1,458 MHz, 36 MHz bandwidth to match the transponder. The modem will start searching for a carrier at that frequency.
        </p>
        <p>
          Now set the modulation and FEC to match TIDEMARK-2's signal format - QPSK with rate 3/4 coding. These parameters must match exactly what the satellite is transmitting.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-freq.mp3'),
      },
      'configure-rx-modulation': {
        text: `
        <p>
          Modulation parameters are set. The modem should start searching for lock now. Watch the lock indicator and the C/N display.
        </p>
        <p>
          We need to see a stable lock with at least 10 dB carrier-to-noise before we consider the receive path complete. Lock alone isn't enough - we need margin.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-mod.mp3'),
      },
      'verify-rx-lock': {
        text: `
        <p>
          Catherine here from ME-02. I'm seeing your receiver come online on the network status display. Looks like you've got good lock on TIDEMARK-2's downlink.
        </p>
        <p>
          We're holding steady on TIDEMARK-1 over here - all customers are happy, no impact from your switchover work. Take your time getting the transmit side configured.
        </p>
        <p>
          C/N on your link looks healthy from what I can see on the dashboard. Good margin there.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-lock.mp3'),
      },
      'verify-rx-margin-quiz': {
        text: `
        <p>
          Exactly. A modem can technically lock at much lower C/N, but the bit error rate would be high. With 10 dB or more, we have comfortable margin - enough headroom to handle rain fade, aging equipment, or any other factor that might degrade the link slightly.
        </p>
        <p>
          Receive path is solid. Now let's configure the transmitter. Go to the TX Chain tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-margin-quiz.mp3'),
      },
      'navigate-tx-chain': {
        text: `
        <p>
          This is the transmit chain. You've got the TX modem at the bottom, BUC in the middle, and HPA at the top. Signal flows from modem to antenna.
        </p>
        <p>
          Before configuring anything, check the current state. The TX chain should be in a safe configuration right now - we don't want to be transmitting until we're pointed at the right satellite.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-navigate-tx.mp3'),
      },
      'verify-tx-initial-state': {
        text: `
        <p>
          Good. BUC muted, HPA disabled - that's the safe state for a switchover. No RF output until we're ready. ME-02 is handling all the traffic right now anyway.
        </p>
        <p>
          This is standard procedure when changing satellites. You don't want to accidentally transmit to the wrong bird while you're repointing. Could cause interference for another operator.
        </p>
        <p>
          Now configure the TX modem for TIDEMARK-2's uplink parameters.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-tx-state.mp3'),
      },
      'configure-tx-modem': {
        text: `
        <p>
          Transmitter modem's configured. 1,020 MHz IF, 36 MHz bandwidth, QPSK 3/4 - those parameters will put your signal right in TIDEMARK-2's transponder passband after the BUC upconverts.
        </p>
        <p>
          Before we enable the RF path, let's make sure you understand the correct sequence. There's a right order for bringing up the transmit chain.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-tx-modem.mp3'),
      },
      'understand-buc-hpa-sequence': {
        text: `
        <p>
          Right. Signal chain from input to output: BUC first, then HPA. You want the amplifier to see a proper signal when it's enabled, not noise or oscillation.
        </p>
        <p>
          An HPA enabled with no input is an amplifier looking for something to amplify. It'll find noise, and it'll amplify that. At several hundred watts, that's not something you want. Drive the chain from the input side.
        </p>
        <p>
          Unmute the BUC first, then enable the HPA output.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-sequence.mp3'),
      },
      'enable-transmit-path': {
        text: `
        <p>
          Marcus again from Halifax. We're seeing your uplink appear on the payload side - clean signal, right in the passband, no anomalies. Beauty, eh?
        </p>
        <p>
          Full duplex established with TIDEMARK-2. VT-01 is now operational on the new bird. The switchover is complete from the spacecraft perspective.
        </p>
        <p>
          Charlie, your trainee did good work today. Nice and methodical, no shortcuts. That's how you avoid problems.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-enable-tx.mp3'),
      },
      'verify-full-duplex-quiz': {
        text: `
        <p>
          That's right. Full duplex confirmed by: receiver locked with margin - downlink working. HPA enabled with proper backoff - uplink active. No alarms anywhere - everything in spec.
        </p>
        <p>
          TIDEMARK-2 is a bent-pipe transponder - it just relays what it receives. It doesn't send acknowledgments or confirmations. We verify the uplink by seeing our own signal appear on the receive side after it loops through the satellite.
        </p>
        <p>
          Well done. VT-01 is now fully operational on TIDEMARK-2. Grab yourself a coffee - you've earned it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/complete.mp3'),
      },
    },
  },
};
