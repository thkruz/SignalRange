import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/signal-origin";
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { Degrees } from 'ootk';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 5: "Interference Hunt"
 *
 * Phase: Intermediate
 * Time Pressure: Moderate
 * Calculation Required: None (guided analysis)
 * Focus: Spectrum analysis, interference identification, notch filter mitigation
 *
 * Premise: Customer reports degraded service on TIDEMARK-1. C/N ratio has dropped
 * because of a 3 MHz interference spike WITHIN our 36 MHz signal bandwidth. This is
 * caused by a third-party operator's polarization mismatch - their cross-pol leakage
 * is landing in our transponder. The AGC is reducing gain based on the spike, which
 * degrades overall C/N.
 *
 * Solution: Apply a 3 MHz notch filter at the interference frequency to block the
 * spike while passing the rest of our 36 MHz signal.
 *
 * Flow:
 * 1. Navigate to station and review mission brief
 * 2. Navigate to receiver and observe degraded C/N
 * 3. Understand the full impact of the degradation
 * 4. Navigate to spectrum analyzer and understand its current configuration
 * 5. Widen span to see full signal bandwidth
 * 6. Center on downlink and locate interference spike
 * 7. Identify and characterize the interference
 * 8. Measure exact frequency with marker
 * 9. Understand cross-polarization cause
 * 10. Understand AGC impact mechanism
 * 11. Evaluate mitigation options
 * 12. Navigate to filter bank and configure notch filter
 * 13. Verify interference removed on spectrum
 * 14. Verify C/N restored
 * 15. Understand documentation requirements
 */

export const scenario5Data: ScenarioData = {
  id: 'nats-scenario5',
  prerequisiteScenarioIds: ['nats-scenario4'],
  url: 'nats/scenarios/nats-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  title: 'Interference Hunt',
  subtitle: 'Spectrum Analysis and Mitigation',
  duration: '20-25 min',
  difficulty: 'beginner',
  missionType: 'Troubleshooting',
  description: `Customer reports degraded service on TIDEMARK-1. The C/N ratio has dropped significantly, causing packet errors.<br><br>The spectrum analyzer is currently configured for beacon tracking - you'll need to reconfigure it to investigate the main signal. Something's causing interference, and you'll need to find it, understand what's happening, and apply the right mitigation.<br><br>Charlie will guide you through the troubleshooting process and provide hints along the way.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem',
    'IF Filter Bank',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
      {
        ...maineGroundStation,
        isOperational: true,
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-5?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        'TIDEMARK-1',
        61525,
        [
          // Uplink signals - routed to transponders based on frequency and polarization
          {
            signalId: 'TIDEMARK-1-TDMA-Composite',
            serverId: 1,
            noradId: 61525,
            frequency: 5943e6 as RfFrequency,
            polarization: 'H',
            power: 20 as dBm,
            bandwidth: 36e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            // Cross-pol interference: 3 MHz spike within TP-1's 36 MHz passband
            // 5960 MHz uplink = 17 MHz above TP-1 center (5943 MHz)
            // Falls within TP-1's passband (5925-5961 MHz)
            // Simulates polarization mismatch from another operator
            signalId: 'cross-pol-interference',
            serverId: 1,
            noradId: 61525,
            frequency: 5960e6 as RfFrequency,
            polarization: 'H',
            power: 26 as dBm,
            bandwidth: 1e6 as Hertz, // Narrowband spike
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [], // Beacons now defined in transponderConfigs
        {
          az: 161.8 as Degrees,
          el: 34.2 as Degrees,
          rotation: 14 as Degrees,
          frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
          transponderConfigs: [
            {
              id: 'TP-1',
              uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
              polarization: 'H',
              beacon: {
                frequency: 4175.5e6 as RfFrequency,
                signalId: 'TIDEMARK-1-Beacon',
                serverId: 1,
                noradId: 61525,
                power: 40 as dBm,
                bandwidth: 1e3 as Hertz,
                modulation: 'CW' as ModulationType,
                fec: 'null' as FECType,
                polarization: 'H',
                feed: '',
                isDegraded: false,
                origin: SignalOrigin.TRANSMITTER,
                noiseFloor: null,
                gainInPath: 0 as dBi,
              },
            } as TransponderConfig,
            {
              id: 'TP-2',
              uplinkCenterFrequency: 5906e6 as RfFrequency, // Passband: 5963-5999 MHz
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3756 MHz
              polarization: 'H',
              // No beacon for TP-2
            } as TransponderConfig,
          ],
        }
      ),
      ses10Satellite,
      tidemark2Satellite
    ],
  },
  timeLimitSeconds: 1500, // 25 minutes (expanded from 20)
  objectives: [
    // =========================================================================
    // PHASE 1: MISSION PREPARATION
    // =========================================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'], // K0645: Knowledge of media interface concepts (knowledge of how to receive and understand operational communications)
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
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
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface is the fundamental skill for all subsequent operations
      nice: ['S0421'],
      title: 'Select Vermont Ground Station',
      description: 'Navigate to the VT-01 ground station where the affected customer link terminates.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
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

    // =========================================================================
    // PHASE 2: CONFIRM THE PROBLEM
    // =========================================================================
    {
      id: 'navigate-rx-analysis',
      // S0421: Skill in operating network equipment - navigating to the receive
      // chain panel within the ground station control interface
      nice: ['S0421'],
      title: 'Navigate to Receiver',
      description: 'Navigate to the Receiver Modem tab to check the current signal status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Receiver Modem Tab Open',
          params: { tab: 'rx-modem' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'phase-1-observe-degradation',
      nice: ['K0740', 'T0153'], // K0740: Knowledge of network performance parameters, T0153: Monitor network capacity and performance
      title: 'Confirm Signal Degradation',
      description: 'Check the receiver modem to confirm the customer\'s report of degraded service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify C/N Degradation',
          params: {
            question: 'Looking at the receiver modem, what is the current C/N ratio status?',
            options: [
              'C/N is degraded - well below normal operating threshold',
              'C/N is healthy - operating normally',
              'C/N is marginal - at threshold',
              'No signal lock - receiver is offline',
            ],
            correctIndex: 0,
            explanation: 'The C/N ratio is well below the normal operating level. This confirms the customer complaint - something is degrading our signal quality.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-receiver-state-quiz',
      nice: ['K0740', 'T0081'], // K0740: Knowledge of network performance parameters, T0081: Analyze anomalies in network traffic
      title: 'Assess Full Impact',
      description: 'Consider what other indicators might show this degradation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-observe-degradation'],
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Degradation Indicators',
          params: {
            question: 'Besides low C/N ratio, what other symptoms would you expect to see with this type of degradation?',
            options: [
              'Elevated BER (Bit Error Rate) and increased packet retransmissions',
              'Higher than normal transmit power from the modem',
              'Increased antenna tracking errors',
              'LNB temperature warnings',
            ],
            correctIndex: 0,
            explanation: 'When C/N degrades, the demodulator makes more bit errors. This increases BER and causes more packet retransmissions, which is exactly what the customer is reporting - packet errors and degraded throughput.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 3: CONFIGURE SPECTRUM ANALYZER
    // =========================================================================
    {
      id: 'navigate-speca-config',
      // S0421: Skill in operating network equipment - navigating to the spectrum
      // analyzer panel within the ground station control interface
      nice: ['S0421'],
      title: 'Navigate to Spectrum Analyzer',
      description: 'Navigate to the Spectrum Analyzer tab to investigate the signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-receiver-state-quiz'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Spectrum Analyzer Tab Open',
          params: { tab: 'speca' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-speca-initial-state',
      nice: ['K0737', 'K1032', 'T0153'], // K0737: Knowledge of RF spectrum characteristics, K1032: Knowledge of RF propagation, T0153: Monitor network capacity and performance
      title: 'Assess Current Configuration',
      description: 'Before adjusting the spectrum analyzer, understand why its current configuration is inadequate.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-speca-config'],
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Span Limitation',
          params: {
            question: 'The spectrum analyzer is currently configured for beacon observation. Why is this configuration inadequate for troubleshooting the customer issue?',
            options: [
              'The narrow span only shows the beacon, not our 36 MHz wideband signal where the problem likely exists',
              'The center frequency is wrong for this satellite',
              'The resolution bandwidth is too high to see small signals',
              'The reference level is clipping the signal',
            ],
            correctIndex: 0,
            explanation: 'When tracking beacons, we use a narrow span (typically 10-20 MHz) focused on the beacon frequency. But our customer traffic is on a 36 MHz wideband carrier at a different frequency. We need to widen the span and recenter to see what\'s happening to the actual customer signal.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-2-configure-span',
      nice: ['K0737', 'S0421', 'T0153'], // K0737: Knowledge of RF spectrum characteristics, S0421: Skill in using test equipment, T0153: Monitor network capacity and performance
      title: 'Widen Spectrum View',
      description: 'The spectrum analyzer is currently configured for beacon observation. Widen the frequency span to see the full signal bandwidth.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-speca-initial-state'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-span-set',
          description: 'Span widened to see full signal',
          params: {
            span: 75e6, // 75 MHz span
            frequencyTolerance: 25e6, // Allow 50-100 MHz
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
        {
          type: 'speca-center-frequency',
          description: 'Center frequency set to see full signal',
          params: {
            centerFrequency: 1532e6 as Hertz, // Beacon IF is 1520 MHz, signal is 10 MHz higher
            centerFrequencyTolerance: 1e6, // Allow +/- 1 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min amplitude set just below noise floor',
          params: {
            minAmplitude: -115 as dBm,
            minAmplitudeTolerance: 20 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max amplitude set just above signal peak',
          params: {
            maxAmplitude: 0 as dBm,
            maxAmplitudeTolerance: 30 as dBm,
          },
          mustMaintain: true,
        }
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // =========================================================================
    // PHASE 4: LOCATE AND IDENTIFY INTERFERENCE
    // =========================================================================
    {
      id: 'phase-3-locate-signal',
      nice: ['T0153', 'K1032'], // T0153: Monitor network capacity and performance, K1032: Knowledge of RF propagation
      title: 'Center on Downlink Signal',
      description: 'Move the spectrum analyzer center frequency to observe the main downlink signal. Think about where the signal should appear at IF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-configure-span'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center frequency set to see main signal',
          params: {
            centerFrequency: 1532e6 as Hertz, // Main signal IF
            centerFrequencyTolerance: 20e6, // Allow 1512-1552 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Main signal visible',
          params: {
            signalId: 'TIDEMARK-1-TDMA-Composite',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-4-identify-interference',
      nice: ['T0081', 'K0773'], // T0081: Analyze anomalies in network traffic, K0773: Knowledge of signal analysis
      title: 'Identify Interference',
      description: 'Look at the spectrum analyzer display. Our wideband signal should be visible - is there anything else that shouldn\'t be there?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-locate-signal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify the Interference',
          params: {
            question: 'Looking at the spectrum analyzer, what do you see within our wideband signal?',
            options: [
              'A narrowband spike sitting within our wideband signal',
              'Our signal looks normal with no interference',
              'The entire noise floor is elevated uniformly',
              'Multiple spikes scattered across the spectrum',
            ],
            correctIndex: 0,
            explanation: 'There\'s a narrowband spike sitting within our wideband signal. This is in-band interference - it\'s not adjacent to our signal, it\'s inside it. That\'s why it\'s so problematic.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-5-characterize-interference',
      nice: ['K0737', 'K0773', 'K0740'], // K0737: Knowledge of RF spectrum characteristics, K0773: Knowledge of signal analysis, K0740: Knowledge of network performance parameters
      title: 'Characterize the Interference',
      description: 'Look closely at the interference. What can you determine about its bandwidth compared to our main signal?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-identify-interference'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Interference Bandwidth',
          params: {
            question: 'How does the interference bandwidth compare to our main signal?',
            options: [
              'Much narrower - a spike only a few MHz wide within our wideband signal',
              'Same width - the interference matches our signal bandwidth',
              'Much wider - the interference spans beyond our signal',
              'Variable - the interference bandwidth keeps changing',
            ],
            correctIndex: 0,
            explanation: 'The interference is a narrowband spike - only a few MHz wide compared to our wideband signal. This is important because it means we can surgically remove it with a notch filter without affecting most of our signal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'measure-interference-frequency',
      nice: ['S0421', 'T0153'], // S0421: Skill in using test equipment, T0153: Monitor network capacity and performance
      title: 'Measure Interference Frequency',
      description: 'Use the spectrum analyzer marker to measure the exact center frequency of the interference spike. This will be critical for notch filter configuration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-characterize-interference'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-marker-placed',
          description: 'Marker on Interference',
          params: {
            frequency: 1515e6 as Hertz, // IF frequency of interference
            frequencyTolerance: 2e6, // Allow +/- 2 MHz
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Record Frequency',
          params: {
            question: 'What is the approximate IF frequency of the interference spike?',
            options: [
              '1515 MHz',
              '1532 MHz',
              '1520 MHz',
              '1500 MHz',
            ],
            correctIndex: 0,
            explanation: 'The interference is centered at approximately 1515 MHz IF. This corresponds to a downlink frequency of 3735 MHz (using our 5250 MHz LO). You\'ll need this exact frequency to configure the notch filter.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // =========================================================================
    // PHASE 5: UNDERSTAND THE CAUSE
    // =========================================================================
    {
      id: 'phase-6-understand-cause',
      nice: ['T0081', 'K0773'], // T0081: Analyze anomalies in network traffic, K0773: Knowledge of signal analysis
      title: 'Understand the Interference Source',
      description: 'Determine what\'s causing this in-band interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['measure-interference-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Interference Cause',
          params: {
            question: 'What is the most likely cause of this narrowband spike within our signal bandwidth?',
            options: [
              'Cross-polarization leakage from another operator\'s uplink',
              'A faulty component in our own transmit chain',
              'Terrestrial interference from nearby radio towers',
              'Solar radio emissions during a flare event',
            ],
            correctIndex: 0,
            explanation: 'This is cross-polarization interference. Satellites use orthogonal polarizations (H and V) to allow frequency reuse - different operators can use the same frequency on opposite polarizations. But polarization isolation isn\'t perfect. Another operator\'s signal on the V polarization is leaking into our H polarization due to imperfect antenna alignment or atmospheric effects.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-7-understand-impact',
      nice: ['K0740', 'K0773'], // K0740: Knowledge of network performance parameters, K0773: Knowledge of signal analysis
      title: 'Understand the AGC Impact',
      description: 'Understand why this spike is affecting our C/N ratio across the entire signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-6-understand-cause'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand AGC Impact',
          params: {
            question: 'Why is this narrowband spike causing the C/N to drop across our entire wideband signal?',
            options: [
              'The AGC sees the spike as part of the total signal and reduces gain accordingly',
              'The spike is overloading the LNB causing compression',
              'The interference is jamming our tracking beacon',
              'The spike is exactly on our carrier center frequency',
            ],
            correctIndex: 0,
            explanation: 'The receiver\'s AGC (Automatic Gain Control) measures total power in the passband. It sees the strong spike and reduces gain to prevent overload. But this gain reduction affects our entire signal, degrading the C/N ratio for the wanted carrier. This is why even a narrowband interferer can impact a wideband signal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 6: EVALUATE MITIGATION OPTIONS
    // =========================================================================
    {
      id: 'understand-mitigation-options',
      nice: ['K0737', 'K0773', 'S0582'], // K0737: Knowledge of RF spectrum characteristics, K0773: Knowledge of signal analysis, S0582: Skill in troubleshooting RF systems
      title: 'Evaluate Mitigation Approaches',
      description: 'Consider the available options for mitigating this interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-understand-impact'],
      conditions: [
        {
          type: 'status-check',
          description: 'Select Best Mitigation',
          params: {
            question: 'What is the best approach to mitigate this in-band interference?',
            options: [
              'Notch filter - surgically removes the spike while passing the rest of our signal',
              'Narrower bandpass filter - reduce overall bandwidth to exclude the interference',
              'Increase transmit power - overpower the interference with more signal',
              'Contact the interfering operator and wait for them to fix it',
            ],
            correctIndex: 0,
            explanation: 'A notch filter is the surgical solution. It removes only the narrow interference spike while passing our full 36 MHz signal. A narrower bandpass would sacrifice our own bandwidth. Increasing power wouldn\'t help the C/N ratio and would violate coordination agreements. Contacting the operator is the long-term solution, but we need an immediate fix for the customer.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 7: APPLY NOTCH FILTER
    // =========================================================================
    {
      id: 'navigate-filter-bank',
      // S0421: Skill in operating network equipment - navigating to the IF filter
      // bank panel within the ground station control interface
      nice: ['S0421'],
      title: 'Navigate to Filter Bank',
      description: 'Navigate to the IF Filter Bank tab to configure the notch filter.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-mitigation-options'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Filter Bank Tab Open',
          params: { tab: 'if-filter' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'phase-8-apply-notch-filter',
      nice: ['K0737', 'S0582', 'S0421'], // K0737: Knowledge of RF spectrum characteristics, S0582: Skill in troubleshooting RF systems, S0421: Skill in using test equipment
      title: 'Configure Notch Filter',
      description: 'Configure a notch filter to surgically remove the interference spike. Match the filter settings to what you observed on the spectrum.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-filter-bank'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch Filter Configured',
          params: {
            notchCenterFrequency: 1515, // MHz - IF frequency of interference (5250 - 3735 = 1515)
            notchBandwidth: 1, // MHz - matches narrowband interference
            notchDepth: 40, // dB - sufficient attenuation
            notchCenterFrequencyTolerance: 0, // Exact match required
            notchBandwidthTolerance: 0.25,
            notchDepthTolerance: 20,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      timePenalty: {
        elapsedTimeThreshold: 18 * 60, // 18 minutes
        pointsDeducted: 30,
        message: "We just violated the SLA! This is going to cost us a lot of money.",
      },
      conditionLogic: 'AND',
      points: 25,
    },

    // =========================================================================
    // PHASE 8: VERIFY RESTORATION
    // =========================================================================
    {
      id: 'verify-spectrum-cleared',
      nice: ['T0153', 'S0421'], // T0153: Monitor network capacity and performance, S0421: Skill in using test equipment
      title: 'Verify Spectrum Cleared',
      description: 'Return to the spectrum analyzer and verify the interference spike has been removed.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-apply-notch-filter'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Spectrum Analyzer Tab Open',
          params: { tab: 'speca' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Confirm Spike Removed',
          params: {
            question: 'Looking at the spectrum analyzer, what happened to the interference spike?',
            options: [
              'The spike is gone - the notch filter removed it from the passband',
              'The spike is still visible at the same level',
              'The spike moved to a different frequency',
              'The entire signal disappeared',
            ],
            correctIndex: 0,
            explanation: 'The notch filter is working. It\'s attenuating the interference spike by 40 dB, effectively removing it from the receiver\'s passband. Our wideband signal passes through unaffected because the notch is narrow enough to only target the interferer.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-9-verify-restoration',
      nice: ['K0740', 'T0153'], // K0740: Knowledge of network performance parameters, T0153: Monitor network capacity and performance
      title: 'Verify Service Restored',
      description: 'Confirm the notch filter has restored normal C/N ratio.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-spectrum-cleared'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify C/N Restoration',
          params: {
            question: 'After applying the notch filter, what happened to the signal?',
            options: [
              'C/N restored to normal levels - the spike is notched out and AGC normalized',
              'C/N unchanged - the filter had no effect',
              'Signal lock lost - the notch filter blocked our carrier',
              'C/N dropped further - wrong filter settings',
            ],
            correctIndex: 0,
            explanation: 'The notch filter blocks the interference spike while passing the rest of our wideband signal. With the spike removed, the AGC no longer sees the excess power and allows proper gain. C/N returns to normal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // =========================================================================
    // PHASE 9: DOCUMENTATION
    // =========================================================================
    {
      id: 'document-interference-quiz',
      nice: ['K0645', 'T0081'], // K0645: Knowledge of media interface concepts, T0081: Analyze anomalies in network traffic
      title: 'Understand Documentation Requirements',
      description: 'Consider what should be documented and reported about this interference event.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-9-verify-restoration'],
      conditions: [
        {
          type: 'status-check',
          description: 'Documentation Knowledge',
          params: {
            question: 'Which of the following is most important to document and report about this interference event?',
            options: [
              'Interference frequency, bandwidth, apparent source, time of occurrence, and mitigation applied',
              'Just the notch filter settings in case we need to apply them again',
              'Customer complaint details only - they don\'t need technical specifics',
              'Nothing - the problem is fixed so no documentation is needed',
            ],
            correctIndex: 0,
            explanation: 'Complete documentation is essential. The frequency and bandwidth help identify the source. The time helps correlate with other operators\' activities. Recording the mitigation allows quick response if it recurs. This data also supports the interference coordination process to resolve the root cause with the other operator.',
            pointPenalty: 5,
            preserveOptionOrder: true,
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
        Got a trouble ticket from SeaLink - their maritime customer is reporting packet errors and degraded throughput on TIDEMARK-1. This started about two hours ago with no changes on our end.
      </p>
      <p>
        I checked the basics - antenna is tracking fine, LNB is powered, no alarms on the RF chain. But I haven't had time to dig into the signal quality yet. The spectrum analyzer was last configured for beacon tracking, so you'll need to reconfigure it to see the actual customer signal.
      </p>
      <p>
        This is a priority customer - they're using this link for critical vessel communications in the North Atlantic. The SLA clock is ticking, so let's work efficiently but thoroughly. Read the mission brief to get the full picture, then let me know when you're ready to start troubleshooting.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/6/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Good. Now let's approach this systematically. The customer is reporting packet errors, which usually means a C/N problem somewhere in the chain. Start by checking the receiver modem to see what's actually happening with the signal quality.
        </p>
        <p>
          Don't jump to conclusions yet - could be anything from antenna issues to interference to equipment problems. Let the data guide you.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-mission-brief.mp3'),
      },
      'select-vermont-station': {
        text: `
        <p>
          Good, you're at VT-01 where the SeaLink traffic terminates. This is our primary TIDEMARK-1 gateway for North Atlantic maritime services.
        </p>
        <p>
          Head to the receiver modem to check the signal metrics. That's where we'll see if the customer's complaint is legitimate and get our first clues about what's wrong.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-select-station.mp3'),
      },
      'navigate-rx-analysis': {
        text: `
        <p>
          This is the receiver modem handling the SeaLink customer traffic. Take a look at the key metrics - C/N ratio, lock status, and any error indicators.
        </p>
        <p>
          Remember, C/N is your primary signal quality metric. Anything below the demodulator threshold means the receiver is struggling to extract clean data from the noise.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-navigate-rx.mp3'),
      },
      'phase-1-observe-degradation': {
        text: `
        <p>
          That C/N is well below where it should be. The customer's complaint is definitely legitimate - we've got a real problem here, not a false alarm.
        </p>
        <p>
          Now we need to understand the full impact. A degraded C/N doesn't happen in isolation - it affects the entire receive chain. Think about what other symptoms you'd expect to see when the demodulator is struggling with a poor signal.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-1.mp3'),
      },
      'verify-receiver-state-quiz': {
        text: `
        <p>
          Exactly right. Degraded C/N means the demodulator is making bit errors because it can't clearly distinguish the signal from the noise. Those bit errors propagate up the stack as packet errors, which is exactly what the customer is seeing.
        </p>
        <p>
          But to fix this, we need to understand what's causing the C/N to drop. Time to look at the spectrum. The spectrum analyzer is currently set up for beacon observation, so you'll need to reconfigure it to see our main carrier.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-receiver.mp3'),
      },
      'navigate-speca-config': {
        text: `
        <p>
          Here's the spectrum analyzer. Right now it's configured with a narrow span focused on the beacon frequency - that's how we left it after the last calibration check.
        </p>
        <p>
          For troubleshooting the customer signal, we need a much wider view. Think about what settings you'll need to change to see the full 36 megahertz wideband carrier where the customer traffic lives.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-navigate-speca.mp3'),
      },
      'verify-speca-initial-state': {
        text: `
        <p>
          Right. Beacon observation uses a narrow span because beacons are themselves narrowband - just a few kilohertz. We only need to see enough spectrum to capture the beacon and verify it's there.
        </p>
        <p>
          But our customer signal is wideband - 36 megahertz of QPSK-modulated data. To see what's happening to that signal, we need to widen the span to at least 50 megahertz, and re-center on the signal's IF frequency.
        </p>
        <p>
          Remember, the receiver modem is tuned to 1,532 megahertz IF - that's where you'll find the main signal.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-speca.mp3'),
      },
      'phase-2-configure-span': {
        text: `
        <p>
          Good. Now we can see the bigger picture. With a wider span and proper center frequency, you should be able to see our full wideband carrier.
        </p>
        <p>
          Take a careful look at the spectrum display. Our 36 megahertz signal should be clearly visible as a raised plateau of energy. But we're troubleshooting because something's wrong - so look carefully for anything that doesn't belong.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-2.mp3'),
      },
      'phase-3-locate-signal': {
        text: `
        <p>
          There's our wideband signal - you can see the 36 megahertz carrier clearly now. But look carefully within that bandwidth. There's something else in there that shouldn't be.
        </p>
        <p>
          In-band interference is the worst kind because you can't just filter it out with a narrower passband - it's sitting right on top of your wanted signal. See if you can spot what's contaminating our spectrum.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-3.mp3'),
      },
      'phase-4-identify-interference': {
        text: `
        <p>
          You found it. That spike is classic in-band interference. It's not adjacent to our signal - it's inside it. That's what makes it so problematic. We can't just tighten our bandpass to exclude it.
        </p>
        <p>
          Now we need to characterize it. Look at the spike compared to our wideband signal. How does its bandwidth compare? Understanding the interference signature will tell us a lot about what's causing it and how to fix it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-4.mp3'),
      },
      'phase-5-characterize-interference': {
        text: `
        <p>
          It's narrowband - just a spike compared to our 36 megahertz wideband carrier. That's actually good news for us. A narrowband interferer means we can potentially use a notch filter to surgically remove it.
        </p>
        <p>
          Before we apply any mitigation, we need to measure exactly where this spike is sitting. Use the spectrum analyzer's marker function to get a precise frequency reading. That's the target for our notch filter.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-5.mp3'),
      },
      'measure-interference-frequency': {
        text: `
        <p>
          Good - 1,515 megahertz IF. That's our target frequency. Now let's figure out what's causing this.
        </p>
        <p>
          Think about what could put a narrowband signal inside our transponder bandwidth. We're using horizontal polarization on this transponder. Satellite transponders often have matching transponders on the orthogonal polarization for frequency reuse - another operator might be using that vertical pol slot.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-measure.mp3'),
      },
      'phase-6-understand-cause': {
        text: `
        <p>
          Cross-polarization interference. Satellites use orthogonal polarizations to double capacity - you can have two signals on the same frequency, one horizontal and one vertical. In theory, they're completely isolated from each other.
        </p>
        <p>
          In practice, nothing's perfect. Antenna feeds have finite cross-pol isolation, typically 25 to 35 dB. Rain, ice, and Faraday rotation in the ionosphere can degrade polarization purity further. The result is leakage between polarizations.
        </p>
        <p>
          Another operator's signal on V-pol is leaking into our H-pol. But here's the puzzle - that spike is narrow, yet it's degrading our entire wideband signal. Think about how the receiver's AGC works.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-6.mp3'),
      },
      'phase-7-understand-impact': {
        text: `
        <p>
          Exactly. The AGC measures total power in the IF passband and adjusts gain to keep the signal level optimal for the demodulator. It doesn't know the difference between wanted signal and interference - it just sees power.
        </p>
        <p>
          That spike adds power to the passband. The AGC responds by reducing gain. But reducing gain affects everything - including our wanted carrier. So even though the interference is narrowband, it degrades C/N across our entire wideband signal.
        </p>
        <p>
          Now we know the problem. The question is: what's the best way to fix it? We have several options available.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-7.mp3'),
      },
      'understand-mitigation-options': {
        text: `
        <p>
          Right - a notch filter is the surgical solution. We configure it at exactly 1,515 megahertz with just enough bandwidth to cover the spike - probably 1 megahertz or so. The filter attenuates that narrow slice while passing the rest of our 36 megahertz signal untouched.
        </p>
        <p>
          With the spike removed, the AGC will see only our wanted signal power and set the gain appropriately. C/N should recover.
        </p>
        <p>
          Head to the IF Filter Bank to configure the notch. Set the center frequency to 1,515 megahertz, bandwidth to 1 megahertz, and depth to at least 40 dB. That should be enough to suppress the interference below the noise floor.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-understand-mitigation.mp3'),
      },
      'navigate-filter-bank': {
        text: `
        <p>
          Here's the IF filter bank. This is where we can configure notch filters to remove unwanted signals from the receive path.
        </p>
        <p>
          You'll need to set three parameters: center frequency (1,515 megahertz based on your measurement), bandwidth (narrow enough to just cover the spike - 1 megahertz should work), and depth (how much attenuation - 40 dB will push the spike well below the noise floor).
        </p>
        <p>
          Double-check your values before applying. A notch in the wrong place could affect our wanted signal.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-navigate-filter.mp3'),
      },
      'phase-8-apply-notch-filter': {
        text: `
        <p>
          Good - the notch filter is configured. Let's verify it's working. Head back to the spectrum analyzer and look at where the spike was. If the notch is properly placed, that spike should be gone or severely attenuated.
        </p>
        <p>
          Remember, the notch filter is a receive-side fix. It doesn't eliminate the interference at the source - it just prevents our receiver from seeing it. The other operator's signal is still there on V-pol, but our filter is blocking the leakage from affecting our equipment.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-8.mp3'),
      },
      'verify-spectrum-cleared': {
        text: `
        <p>
          The spike is gone from our view. The notch filter is attenuating that frequency by 40 dB, which pushes the interference power well below the noise floor. Our spectrum shows a clean wideband signal now.
        </p>
        <p>
          But spectrum is only half the story. The real test is whether the receiver's performance has improved. Check the receiver modem to see if C/N has recovered.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-spectrum.mp3'),
      },
      'phase-9-verify-restoration': {
        text: `
        <p>
          C/N is back to normal operating levels. The AGC is no longer being fooled by the interference spike, so it's setting the gain correctly for our wanted signal. The customer should see their packet errors clear up immediately.
        </p>
        <p>
          Nice work. You diagnosed a non-obvious interference problem, understood the mechanism behind it, and applied the right mitigation. That's the kind of systematic troubleshooting that separates good operators from great ones.
        </p>
        <p>
          One more thing - this kind of event needs to be properly documented for the long-term fix.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/complete.mp3'),
      },
      'document-interference-quiz': {
        text: `
        <p>
          Perfect. I'll file a coordination request with the satellite operator to track down the source of the cross-pol interference. With the frequency, bandwidth, and timing information you've gathered, they can identify which uplink is causing the problem and work with that operator to improve their polarization alignment.
        </p>
        <p>
          Meanwhile, the notch filter gives us a solid workaround. The customer is back online, the SLA is intact, and we have a path to the root cause fix.
        </p>
        <p>
          This is exactly how professional interference mitigation works - quick restoration of service, followed by proper documentation and coordination to prevent recurrence. Well done.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/outro.mp3'),
      },
    },
  },
};
