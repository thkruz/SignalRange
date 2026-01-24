import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 3: "Weather Emergency Handover"
 *
 * Phase: Introduction (Phase 1, Scenario 3 of 8)
 * Time Pressure: Moderate (snow already falling, 15 minutes before link unusable)
 * Calculation Required: NO - all values provided by Charlie
 * New UI Elements: Ground station switcher, multi-site monitoring, AGC observation
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0153: Monitor network capacity and performance
 *   - K0689: Knowledge of network infrastructure principles and practices
 *   - S0421: Skill in operating network equipment
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0770: Knowledge of system administration concepts (handover procedures)
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K0792: Knowledge of network configurations
 *   - K1032: Knowledge of satellite-based communication systems and software
 *   - T0431: Check system hardware availability, functionality, integrity, and efficiency
 *
 * Premise: Heavy snow is already falling on Vermont. The link margin is degrading
 * and will drop below operational threshold within 15 minutes. You need to bring
 * the Maine backup station online, configure it to match Vermont's parameters,
 * verify signal acquisition, and execute a clean traffic handover before the
 * Vermont link becomes unusable.
 *
 * Key Learning Objectives:
 * 1. Understand weather protection (feed heater) and why it matters
 * 2. Navigate between multiple ground stations in the asset tree
 * 3. Understand AGC and how it compensates for signal degradation
 * 4. Configure a backup site to match primary site parameters
 * 5. Verify beacon acquisition on spectrum analyzer before trusting modem lock
 * 6. Execute traffic handover with service continuity
 * 7. Protect equipment during severe weather (antenna stow)
 *
 * Character Notes:
 *   - Charlie Brooks: Urgent but controlled. Weather handovers are routine but
 *     time-critical. He's done dozens of these but needs you to execute correctly.
 *   - Catherine Vega: Maine station operator, arriving mid-scenario. Professional,
 *     helpful, will take over once handover is complete.
 */

export const scenario3Data: ScenarioData = {
  id: 'nats-scenario3',
  prerequisiteScenarioIds: ['nats-scenario2'],
  url: 'nats/scenarios/nats-scenario3',
  imageUrl: 'nats/3/card.png',
  number: 3,
  title: 'Weather Emergency Handover',
  subtitle: 'Multi-Site Operations',
  duration: '30-40 min',
  difficulty: 'beginner',
  missionType: 'Emergency Operations',
  description: `Heavy snow is already falling on Vermont - the link margin to TIDEMARK-1 is degrading fast. You've got maybe 15 minutes before the signal drops below operational threshold.<br><br>Your job: bring the Maine backup station online, configure it to match Vermont's parameters exactly, verify signal acquisition, and execute a clean traffic handover before Vermont goes dark. Catherine from Maine is on her way in and will take over once the handover is complete.<br><br>This is your first time managing multiple ground stations simultaneously. Weather handovers happen several times each winter in the Northeast - routine procedure, but time-critical. Don't rush, but don't dawdle either.`,
  equipment: [
    '9-meter C-band Antenna (×2)',
    'RF Front End (×2)',
    'Spectrum Analyzer (×2)',
    'Receiver Modem (×2)',
    'Transmitter Modem (×2)',
  ],
  timeLimitSeconds: 30 * 60, // 30 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
      },
      {
        id: 'ME-02',
        name: 'Maine Backup Station',
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Stowed, needs to be configured
            isPowered: true,
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            polarization: 0 as Degrees,
            isTracking: false,
            trackingMode: 'manual',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            gpsdo: {
              gnssSignalPresent: true,
              isGnssSwitchUp: true,
              isLocked: true,
            },
            lnb: { isPowered: false, noiseTemperature: 300, temperature: 25 },
            buc: { isMuted: true },
            hpa: { isHpaEnabled: false },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: 0,
            centerFrequency: 1e9 as Hertz,
            span: 100e6 as Hertz,
            rbw: 1e6 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 17 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          }
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
              fec: '1/2' as FECType,
            },
          }],
        }],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
    ],
    weatherEvents: [
      {
        id: 'vermont-blizzard',
        groundStationId: 'VT-01',
        type: 'snow',
        severity: 'severe',
        startTime: 5, // 5 seconds into scenario - urgency!
        duration: 7200, // 2 hours
        linkMarginDegradation: 8, // dB - exceeds acceptable threshold
      }
    ],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'VT-01', // Vermont initially owns traffic
      }
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-3?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs) - reviewing the mission brief
      // establishes the procedural framework for weather emergency handover
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief document including weather handover procedures, then acknowledge you are ready to proceed.',
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
            question: 'Have you reviewed the mission brief and weather handover procedures?',
            options: [
              'Yes, I have read the mission brief and I am ready to proceed.',
            ],
            correctIndex: 0,
            explanation: 'The mission timer has started. Snow is already falling - move quickly but carefully.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // WEATHER PROTECTION - VT-01
    // ============================================================
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface to enable weather protection
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
    {
      id: 'navigate-acu-vt01-heater',
      // S0421: Skill in operating network equipment - navigating to the antenna
      // control panel to enable weather protection
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to access the feed heater controls.',
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
      id: 'enable-vt01-heater',
      // S0421: Skill in operating network equipment - enabling feed heater
      // K0741: Knowledge of system availability measures - understanding weather
      // protection as critical to maintaining system availability
      nice: ['S0421', 'K0741'],
      title: 'Enable Feed Heater',
      description: 'Enable the feed heater on VT-01 to prevent ice accumulation on the waveguide and feed assembly.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-acu-vt01-heater'],
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
          type: 'feed-heater-enabled',
          description: 'VT-01 Feed Heater Enabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'understand-prioritization',
      // K0721: Knowledge of operational priorities - understanding the priority
      // framework for handling multiple operational concerns
      // S0593: Skill in prioritizing operational tasks
      nice: ['K0721', 'S0593'],
      title: 'Understand Operational Priorities',
      description: 'Learn the priority framework for handling multiple operational concerns.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-vt01-heater'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Priority Framework',
          params: {
            question: 'When multiple issues need attention simultaneously, what is the correct priority order?',
            options: [
              'Safety → Customer Impact → Equipment Protection → Efficiency',
              'Customer Impact → Safety → Efficiency → Equipment Protection',
              'Efficiency → Customer Impact → Safety → Equipment Protection',
              'Equipment Protection → Safety → Customer Impact → Efficiency',
            ],
            correctIndex: 0,
            explanation: "Safety always comes first - protecting personnel from RF hazards or other dangers. Next is customer impact - maintaining service. Then equipment protection - preventing damage. Finally, efficiency - doing things the optimal way. This framework guides what to address first when multiple concerns compete for attention - it's about prioritization, not about sacrificing lower priorities.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-heater-quiz',
      // K0741: Knowledge of system availability measures - understanding why
      // feed heaters are critical during precipitation events
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding how ice affects RF performance
      nice: ['K0741', 'K0773'],
      title: 'Understand Feed Heater Consequences',
      description: 'Understand what would happen if the feed heater was turned off during this storm.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-prioritization'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Feed Heater Consequences',
          params: {
            question: 'What would happen if the feed heater was turned off during this snow event?',
            options: [
              'Ice would accumulate on the feed horn and waveguide, causing signal attenuation and potential physical damage',
              'The LNB would cool down and produce more noise',
              'The antenna motors would freeze and stop tracking',
              'Snow would build up on the dish reflector',
            ],
            correctIndex: 0,
            explanation: 'Without the heater, ice would accumulate on the feed horn and waveguide. This causes signal attenuation (making the weather degradation even worse) and can physically damage the feed assembly. The heater prevents ice from forming on these critical RF components.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // AGC MONITORING - VT-01
    // ============================================================
    {
      id: 'navigate-rx-vt01-agc',
      // S0421: Skill in operating network equipment - navigating to RX analysis
      // to monitor AGC during weather degradation
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to monitor the receive chain and AGC status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-heater-quiz'],
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
      id: 'verify-agc-status',
      // T0153: Monitor network capacity and performance - observing AGC behavior
      // during weather-induced signal degradation
      // K0740: Knowledge of system performance indicators - understanding AGC
      // as an indicator of signal level changes
      nice: ['T0153', 'K0740'],
      title: 'Understand AGC Function',
      description: 'Understand what the AGC (Automatic Gain Control) does and why it matters during weather degradation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-vt01-agc'],
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
          description: 'Understand AGC Consequences',
          params: {
            question: 'What would happen if the AGC was disabled during this weather event?',
            options: [
              'The output signal level would drop as weather attenuated the input, eventually causing loss of lock',
              'The receiver would overheat from trying to process a weak signal',
              'The LNB would automatically increase its own gain to compensate',
              'Nothing - AGC only matters for clear weather conditions',
            ],
            correctIndex: 0,
            explanation: 'Without AGC, the output level would drop proportionally as the snow attenuates the input signal. Once the signal falls below the demodulation threshold, the receiver loses lock and data is lost. AGC compensates by automatically increasing gain to maintain a stable output level - but it has limits.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'estimate-time-remaining',
      // K0740: Knowledge of system performance indicators - understanding why
      // weather handovers are time-critical
      // T0153: Monitor network capacity and performance - understanding urgency
      nice: ['K0740', 'T0153'],
      title: 'Understand Time Pressure',
      description: 'Understand why weather handovers are time-critical operations.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-agc-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Urgency',
          params: {
            question: 'I mentioned you have about six minutes before the link fails. What makes weather handovers so time-critical?',
            options: [
              'Weather degradation is progressive - once AGC runs out of compensation range, the link fails rapidly',
              'The antenna motors slow down in cold weather and take longer to move',
              'Customer data must be backed up before switching sites',
              'Maine operators need time to physically travel to the station',
            ],
            correctIndex: 0,
            explanation: 'Weather degradation is continuous and progressive. The AGC compensates up to a point, but once it maxes out, any further signal loss causes rapid link failure. There\'s no graceful degradation - you either have enough margin or you don\'t. This is why we start the handover process well before the predicted failure point.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-agc-limits-quiz',
      // K0740: Knowledge of system performance indicators - understanding AGC
      // limitations and why handover is necessary
      // K0689: Knowledge of network infrastructure principles and practices -
      // understanding multi-site redundancy for weather resilience
      nice: ['K0740', 'K0689'],
      title: 'Understand AGC Limitations',
      description: 'Understand why AGC alone cannot solve the weather problem.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['estimate-time-remaining'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand AGC Limits',
          params: {
            question: 'The AGC is compensating for the weather degradation. Why do we still need to hand over to Maine?',
            options: [
              'AGC has a maximum gain limit - once reached, further signal loss cannot be compensated',
              'AGC uses too much power during heavy compensation',
              'AGC introduces phase errors that corrupt the data',
              'Maine has a bigger antenna with more gain',
            ],
            correctIndex: 0,
            explanation: 'AGC can only compensate within its gain range. The forecast predicts 8+ dB of degradation - once the AGC hits its maximum gain, any further signal loss will cause C/N to drop below the demodulation threshold and we lose lock. Maine is 150 miles away with clear weather, so their link is unaffected.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // ============================================================
    // SWITCH TO MAINE STATION
    // ============================================================
    {
      id: 'switch-to-maine',
      // S0421: Skill in operating network equipment - navigating between
      // multiple ground stations in the control interface
      // K0689: Knowledge of network infrastructure principles and practices -
      // understanding multi-site network topology
      nice: ['S0421', 'K0689'],
      title: 'Access Maine Backup Station',
      description: 'Use the asset tree on the left to select ME-02 (Maine). Vermont will continue serving traffic in the background while you configure Maine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-agc-limits-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Maine Ground Station Selected',
          params: { groundStationId: 'ME-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-multisite-quiz',
      // K0689: Knowledge of network infrastructure principles and practices -
      // understanding how multi-site operations work
      nice: ['K0689'],
      title: 'Understand Multi-Site Operations',
      description: 'Confirm you understand how the multi-site control works.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['switch-to-maine'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Multi-Site Control',
          params: {
            question: 'You switched to Maine in the asset tree. What is happening to Vermont right now?',
            options: [
              'Vermont continues operating normally - customers are still being served from VT-01',
              'Vermont has been placed in standby mode until we switch back',
              'Vermont is now being controlled by Maine operators',
              'Vermont traffic has been automatically paused',
            ],
            correctIndex: 0,
            explanation: 'Switching your view to Maine does not affect Vermont operations. VT-01 continues serving customer traffic normally. You are simply changing which station\'s equipment panels you see and can control. Both stations operate independently.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // VERIFY MAINE TIMING REFERENCE
    // ============================================================
    {
      id: 'navigate-gps-timing-maine',
      // S0421: Skill in operating network equipment - navigating to GPS timing
      // panel on the backup station
      nice: ['S0421'],
      title: 'Open GPS Timing Tab',
      description: 'Click the GPS Timing tab to verify the timing reference before configuring RF equipment.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-multisite-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Maine Station Active',
          params: { groundStationId: 'ME-02' },
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
      id: 'verify-maine-gpsdo',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying GPSDO is locked before configuring dependent equipment
      // K0741: Knowledge of system availability measures - understanding GPSDO
      // as prerequisite for all RF equipment operation
      nice: ['T0431', 'K0741'],
      title: 'Verify GPSDO Lock Status',
      description: 'Confirm the GPSDO is locked and providing stable timing reference.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['navigate-gps-timing-maine'],
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
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify GPSDO Status',
          params: {
            question: 'What does the Maine GPSDO status show?',
            options: [
              'Locked - stable frequency reference available',
              'Holdover - using backup oscillator, limited time remaining',
              'Unlocked - no frequency reference, cannot proceed',
              'Warming up - need to wait for stabilization',
            ],
            correctIndex: 0,
            explanation: 'The GPSDO shows locked status, meaning it has GPS satellite lock and is providing a stable 10 MHz reference. All RF equipment in the rack depends on this reference for frequency accuracy.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-gpsdo-weather-quiz',
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding that GPS signals are not affected by weather like
      // C-band satellite signals
      nice: ['K0773'],
      title: 'Understand Weather Impact on GPSDO',
      description: 'Understand why the GPSDO is unaffected by the snow at Vermont.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-gpsdo'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand GPSDO Weather Independence',
          params: {
            question: 'The snow is degrading Vermont\'s TIDEMARK-1 link. Why isn\'t the snow affecting Vermont\'s GPSDO?',
            options: [
              'GPS uses L-band frequencies (~1.5 GHz) which are less affected by precipitation than C-band',
              'The GPSDO antenna is indoors, protected from weather',
              'GPS satellites are in a different part of the sky than TIDEMARK-1',
              'The GPSDO has a backup battery that maintains lock during weather',
            ],
            correctIndex: 0,
            explanation: 'GPS operates at L-band (~1.5 GHz), which experiences much less rain/snow attenuation than C-band (~4-6 GHz). The TIDEMARK-1 link uses C-band, which is more susceptible to precipitation fade. This is why the GPSDO remains locked even as the satellite link degrades.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CONFIGURE MAINE ANTENNA
    // ============================================================
    {
      id: 'navigate-acu-maine',
      // S0421: Skill in operating network equipment - navigating to antenna
      // control panel on backup station
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to configure the Maine antenna.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-gpsdo-weather-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Maine Station Active',
          params: { groundStationId: 'ME-02' },
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
      id: 'configure-maine-antenna',
      // S0421: Skill in operating network equipment - commanding antenna to
      // acquire target satellite
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding program-track mode for GEO satellites
      nice: ['S0421', 'K1032'],
      title: 'Point Antenna at TIDEMARK-1',
      description: 'Set tracking mode to PROGRAM TRACK to acquire TIDEMARK-1. The system will calculate the correct look angles for Maine\'s location.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['navigate-acu-maine'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 8 * 60, // 8 minutes
        pointsDeducted: 20,
        message: 'Vermont\'s link margin is getting critical. Speed up.',
      },
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode Set to Program Track',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Antenna Pointed at TIDEMARK-1',
          params: {
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            tolerance: 0.5,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'catherine-look-angles',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding that look angles depend on ground station location
      // K0689: Knowledge of network infrastructure principles and practices -
      // understanding geographic diversity in ground station networks
      nice: ['K1032', 'K0689'],
      title: 'Catherine\'s Sanity Check',
      description: 'Catherine has arrived at the Maine station and is checking your work.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-antenna'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Acknowledge Catherine\'s Check',
          params: {
            question: "I see you used program-track mode. Good choice. Do you know why I was checking the antenna pointing?",
            options: [
              'Because look angles to a satellite depend on the ground station\'s geographic location',
              'Because the antenna might have been damaged during storage',
              'Because program-track mode sometimes points at the wrong satellite',
              'Because Maine uses a different antenna model than Vermont',
            ],
            correctIndex: 0,
            explanation: 'Each ground station has unique look angles to any given satellite based on its latitude and longitude. Maine is about 150 miles from Vermont, so the azimuth and elevation are slightly different. Program-track mode calculates this automatically, but a common mistake for new operators is manually entering Vermont\'s angles at Maine.',
            pointPenalty: 10,
            character: Character.CATHERINE_VEGA,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CONFIGURE MAINE LNB
    // ============================================================
    {
      id: 'navigate-rx-maine-lnb',
      // S0421: Skill in operating network equipment - navigating to RX analysis
      // panel to configure LNB
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to configure the receive chain.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['catherine-look-angles'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Maine Station Active',
          params: { groundStationId: 'ME-02' },
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
      id: 'configure-maine-lnb',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // powering on and configuring LNB
      // S0421: Skill in operating network equipment - executing LNB configuration
      // K0792: Knowledge of network configurations - matching LNB settings to
      // primary site for consistent downconversion
      nice: ['S0421', 'K0792'],
      title: 'Power Up LNB',
      description: 'Power on the LNB and configure it to match Vermont: LO frequency 5,250 MHz, Gain 60 dB. Wait for thermal stabilization.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['navigate-rx-maine-lnb'],
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
          type: 'equipment-powered',
          description: 'LNB Powered On',
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 5,250 MHz',
          params: {
            loFrequency: 5250 as MHz,
            loFrequencyTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 60 dB',
          params: {
            gain: 60,
            gainTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-lnb-config-quiz',
      // K0792: Knowledge of network configurations - understanding why LNB
      // settings must match between sites
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding LO frequency and IF calculation
      nice: ['K0792', 'K0773'],
      title: 'Verify LNB Configuration',
      description: 'Confirm you understand why the LNB settings must match Vermont.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-lnb'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand LNB Matching',
          params: {
            question: 'Why must Maine\'s LNB LO frequency match Vermont\'s exactly?',
            options: [
              'Same LO frequency produces the same IF frequency, so downstream equipment configuration is identical',
              'Different LO frequencies would cause interference between the two sites',
              'The satellite requires all ground stations to use the same LO frequency',
              'It\'s just company policy for consistency',
            ],
            correctIndex: 0,
            explanation: 'With the same LO frequency (5,250 MHz), the TIDEMARK-1 beacon at 4,175.5 MHz RF produces the same 1,074.5 MHz IF at both sites. This means the spectrum analyzer, receiver modem, and all downstream equipment use identical frequency settings, simplifying handover and reducing configuration errors.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // VERIFY BEACON ON SPECTRUM ANALYZER
    // ============================================================
    {
      id: 'configure-speca-maine',
      // S0421: Skill in operating network equipment - configuring spectrum
      // analyzer to observe beacon signal
      // K0773: Knowledge of telecommunications principles and practices -
      // setting correct IF frequency for beacon observation
      nice: ['S0421', 'K0773'],
      title: 'Configure Spectrum Analyzer',
      description: 'Set the spectrum analyzer to observe the TIDEMARK-1 beacon: Center frequency 1,074.5 MHz, Span 2 kHz, Minimum Amplitude -65 dBm, Maximum Amplitude -50 dBm.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-lnb-config-quiz'],
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
          description: 'Center Frequency Set to 1,074.5 MHz',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 0.5e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span Set to 2 kHz',
          params: {
            span: 2e3 as Hertz,
            spanTolerance: 100,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Minimum Amplitude Set to -65 dBm',
          params: {
            minAmplitude: -65 as dBm,
            minAmplitudeTolerance: 2,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Maximum Amplitude Set to -50 dBm',
          params: {
            maxAmplitude: -50 as dBm,
            maxAmplitudeTolerance: 2,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-beacon-maine',
      // T0153: Monitor network capacity and performance - confirming beacon
      // reception as proof of antenna pointing and receive chain function
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding beacon as satellite health and pointing indicator
      nice: ['T0153', 'K1032'],
      title: 'Verify Beacon Signal',
      description: 'Confirm the TIDEMARK-1 beacon is visible on the spectrum analyzer.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-speca-maine'],
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
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-beacon-reason-quiz',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding why beacon verification is important even with program-track
      // T0153: Monitor network capacity and performance - using visual
      // confirmation to validate equipment chain
      nice: ['K1032', 'T0153'],
      title: 'Understand Beacon Verification',
      description: 'Understand why we verify the beacon even when using program-track mode.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-beacon-maine'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Beacon Verification Purpose',
          params: {
            question: 'The antenna is in program-track mode, which calculates pointing from ephemeris data. Why did we still verify the beacon on the spectrum analyzer?',
            options: [
              'Beacon confirms the entire receive chain is working - antenna, feed, LNB, cables, and spectrum analyzer',
              'Program-track mode only works after the beacon is acquired',
              'The beacon is needed to calibrate the spectrum analyzer',
              'Company policy requires visual beacon confirmation',
            ],
            correctIndex: 0,
            explanation: 'Seeing the beacon confirms more than just antenna pointing - it proves the entire receive path is functional: antenna feed is clear, LNB is downconverting correctly, cables are connected, and the spectrum analyzer is configured properly. Program-track could have the antenna pointed perfectly, but if the LNB was misconfigured or a cable was disconnected, you\'d never see the signal.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CONFIGURE MAINE RECEIVER MODEM
    // ============================================================
    {
      id: 'configure-maine-rx-modem',
      // K0792: Knowledge of network configurations - configuring modem parameters
      // to match primary site for seamless handover
      // S0421: Skill in operating network equipment - executing modem configuration
      nice: ['K0792', 'S0421'],
      title: 'Configure Receiver Modem',
      description: 'Configure the receiver modem to match Vermont: Frequency 1,532 MHz, Bandwidth 36 MHz, QPSK modulation, FEC 3/4.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-beacon-reason-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency Set to 1,532 MHz',
          params: {
            frequency: 1532e6 as RfFrequency,
            frequencyTolerance: 1e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-bandwidth-set',
          description: 'Bandwidth Set to 36 MHz',
          params: {
            bandwidth: 36e6 as Hertz,
            bandwidthTolerance: 1e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-modulation-set',
          description: 'Modulation Set to QPSK',
          params: {
            modulation: 'QPSK' as ModulationType,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC Set to 3/4',
          params: {
            fec: '3/4' as FECType,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-modem-match-quiz',
      // K0792: Knowledge of network configurations - understanding why exact
      // parameter matching is critical for handover
      nice: ['K0792'],
      title: 'Understand Parameter Matching',
      description: 'Understand why modem parameters must match exactly.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-rx-modem'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Parameter Matching',
          params: {
            question: 'Why must the receiver modem parameters (frequency, bandwidth, modulation, FEC) match Vermont exactly?',
            options: [
              'Both sites are receiving the same satellite carrier - mismatched parameters would fail to demodulate',
              'The satellite checks that all ground stations use identical parameters',
              'Different parameters would cause interference between the two ground stations',
              'It\'s easier to copy settings than calculate new ones',
            ],
            correctIndex: 0,
            explanation: 'TIDEMARK-1 is transmitting a single carrier with specific characteristics. Any ground station receiving that carrier must configure their modem to match those characteristics exactly - wrong frequency misses the signal, wrong bandwidth captures noise, wrong modulation/FEC produces garbage data. This isn\'t about coordination between ground stations; it\'s about matching what the satellite is actually transmitting.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // VERIFY MAINE RECEIVER LOCK
    // ============================================================
    {
      id: 'verify-maine-lock',
      // T0153: Monitor network capacity and performance - confirming carrier
      // lock and C/N ratio before handover
      // K0740: Knowledge of system performance indicators - understanding
      // C/N threshold for reliable demodulation
      nice: ['T0153', 'K0740'],
      title: 'Confirm Signal Acquisition',
      description: 'Wait for the receiver modem to achieve carrier lock and verify C/N ratio is above 10 dB.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-modem-match-quiz'],
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
          type: 'receiver-signal-locked',
          description: 'Receiver Modem Locked',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Ratio ≥ 10 dB',
          params: {
            minCNRatio: 10,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-lock-quality-quiz',
      // K0740: Knowledge of system performance indicators - understanding
      // the difference between lock status and link quality
      nice: ['K0740'],
      title: 'Understand Lock vs. Quality',
      description: 'Understand why we check both lock status AND C/N ratio.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-lock'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Lock Quality',
          params: {
            question: 'The modem shows "Locked" status. Why do we also verify the C/N ratio is above 10 dB?',
            options: [
              'Lock can occur at low C/N but with high error rates - we need margin for reliable data',
              'The lock indicator doesn\'t work below 10 dB C/N',
              '10 dB is the minimum for the modem to power on',
              'C/N below 10 dB would damage the modem',
            ],
            correctIndex: 0,
            explanation: 'A modem can achieve lock at C/N ratios as low as 3-4 dB for QPSK, but error rates would be high and the link fragile. We want at least 10 dB of margin - that means even if weather degrades the Maine link somewhat, we still have headroom before errors become a problem. Lock without margin is asking for trouble.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CONFIGURE MAINE TRANSMITTER
    // ============================================================
    {
      id: 'navigate-tx-maine',
      // S0421: Skill in operating network equipment - navigating to TX chain
      // panel to configure transmitter
      nice: ['S0421'],
      title: 'Open TX Chain Tab',
      description: 'Click the TX Chain tab to configure the Maine transmitter.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-lock-quality-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Maine Station Active',
          params: { groundStationId: 'ME-02' },
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
      id: 'configure-maine-tx-modem',
      // K0792: Knowledge of network configurations - configuring transmitter
      // parameters to match primary site
      // S0421: Skill in operating network equipment - executing TX modem configuration
      nice: ['K0792', 'S0421'],
      title: 'Configure Transmitter Modem',
      description: 'Configure the transmitter modem to match Vermont: Frequency 1,094 MHz, Power -7 dBm, Bandwidth 36 MHz, QPSK modulation, FEC 3/4. Enable transmission.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['navigate-tx-maine'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 15 * 60, // 15 minutes
        pointsDeducted: 30,
        message: 'Vermont\'s link has degraded significantly. The handover should have been complete by now.',
      },
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'Transmitter Powered',
          params: { equipment: 'transmitter' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency Set to 1,094 MHz',
          params: {
            frequency: 1094e6 as IfFrequency,
            frequencyTolerance: 1e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-power-set',
          description: 'TX Power Set to -7 dBm',
          params: {
            power: -7 as dBm,
            powerTolerance: 1 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'Bandwidth Set to 36 MHz',
          params: {
            bandwidth: 36e6 as Hertz,
            bandwidthTolerance: 1e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'Modulation Set to QPSK',
          params: {
            modulation: 'QPSK' as ModulationType,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'FEC Set to 3/4',
          params: {
            fec: '3/4' as FECType,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Transmitter Enabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // EXECUTE TRAFFIC HANDOVER
    // ============================================================
    {
      id: 'navigate-dashboard-handover',
      // S0421: Skill in operating network equipment - navigating to satellite
      // dashboard for traffic handover execution
      nice: ['S0421'],
      title: 'Open Satellite Dashboard',
      description: 'Click on TIDEMARK-1 in the map to access the traffic handover controls.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-tx-modem'],
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
      id: 'understand-handover-quiz',
      // K0689: Knowledge of network infrastructure principles and practices -
      // understanding what traffic handover does at the network level
      // K0741: Knowledge of system availability measures - understanding
      // service continuity during handover
      // K0770: Knowledge of system administration concepts (handover procedures)
      nice: ['K0689', 'K0741', 'K0770'],
      title: 'Understand Handover Process',
      description: 'Understand what happens during traffic handover.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['navigate-dashboard-handover'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Handover Process',
          params: {
            question: 'What happens when you execute the traffic handover from Vermont to Maine?',
            options: [
              'Maine\'s transmitter activates fully while Vermont\'s is disabled - avoiding dual uplinks to the satellite',
              'Both stations transmit simultaneously and the satellite selects the stronger signal',
              'Customer connections are dropped and re-established through Maine',
              'Vermont\'s antenna is automatically pointed away from the satellite',
            ],
            correctIndex: 0,
            explanation: 'The handover process coordinates the transition: Maine\'s uplink chain (BUC, HPA) is fully enabled while Vermont\'s is disabled in a controlled sequence. This prevents dual uplinks (two ground stations transmitting on the same frequency to the same satellite), which would cause interference. The satellite transponder doesn\'t care which ground station is transmitting - it just relays what it receives.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'execute-handover',
      // S0421: Skill in operating network equipment - executing traffic handover
      // K0741: Knowledge of system availability measures - ensuring service
      // continuity during site transition
      // K0770: Knowledge of system administration concepts (handover procedures)
      nice: ['S0421', 'K0741', 'K0770'],
      title: 'Execute Traffic Handover',
      description: 'Transfer active customer traffic from VT-01 to ME-02. The handover process will automatically coordinate the transmitter switching.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['understand-handover-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'traffic-transferred',
          description: 'Traffic Transferred to ME-02',
          params: {
            sourceStation: 'VT-01',
            targetStation: 'ME-02',
            satelliteId: 61525, // TIDEMARK-1
          },
          mustMaintain: false,
        },
        {
          type: 'service-continuity',
          description: 'Service Continuity Maintained',
          params: {
            maxPacketLoss: 0.1,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-handover-success-quiz',
      // T0153: Monitor network capacity and performance - confirming successful
      // handover by observing traffic flow
      nice: ['T0153'],
      title: 'Confirm Handover Success',
      description: 'Verify the handover completed successfully.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['execute-handover'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Handover Success',
          params: {
            question: 'How do you confirm the handover was successful?',
            options: [
              'Traffic indicator shows ME-02 as active, VT-01 TX disabled, no alarms, continuous data flow',
              'Vermont\'s antenna has automatically stowed',
              'The satellite has acknowledged the handover',
              'Maine\'s C/N ratio has increased',
            ],
            correctIndex: 0,
            explanation: 'A successful handover shows Maine as the active traffic owner, Vermont\'s transmitter disabled (no dual uplink), no error alarms, and continuous data flow with no packet loss. The customers should experience no interruption - from their perspective, nothing changed.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // STOW VERMONT ANTENNA
    // ============================================================
    {
      id: 'switch-to-vermont-stow',
      // S0421: Skill in operating network equipment - switching back to
      // Vermont to protect equipment
      nice: ['S0421'],
      title: 'Return to Vermont Station',
      description: 'Select VT-01 in the asset tree to stow the antenna before the storm worsens.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-handover-success-quiz'],
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
      id: 'navigate-acu-vt01-stow',
      // S0421: Skill in operating network equipment - navigating to ACU
      // for antenna stow operation
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to stow the Vermont antenna.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-vermont-stow'],
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
      id: 'stow-vermont-antenna',
      // S0421: Skill in operating network equipment - commanding antenna stow
      // K0741: Knowledge of system availability measures - protecting equipment
      // to ensure future availability
      nice: ['S0421', 'K0741'],
      title: 'Stow Vermont Antenna',
      description: 'Set tracking mode to STOW to protect the antenna during the blizzard. Stow position is straight up (El: 90°) to minimize wind loading and ice accumulation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-acu-vt01-stow'],
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
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode Set to Stow',
          params: { trackingMode: 'stow' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Antenna at Stow Position',
          params: {
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            tolerance: 1,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-stow-quiz',
      // K0741: Knowledge of system availability measures - understanding why
      // stow position protects antenna during severe weather
      nice: ['K0741'],
      title: 'Understand Stow Position',
      description: 'Understand why the stow position protects the antenna.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['stow-vermont-antenna'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Stow Protection',
          params: {
            question: 'Why does pointing the antenna straight up (90° elevation) protect it during a blizzard?',
            options: [
              'Minimizes wind loading on the dish and prevents snow from accumulating in the reflector',
              'Gets the antenna above the snow level',
              'Prevents the feed horn from getting wet',
              'Reduces electrical interference from the storm',
            ],
            correctIndex: 0,
            explanation: 'At 90° elevation (straight up), the dish presents minimal surface area to horizontal winds, dramatically reducing wind loading on the structure. Additionally, snow cannot accumulate in the reflector when it\'s vertical - it simply falls off. A dish pointed at typical satellite elevation (30-40°) would catch snow like a bowl and the wind would push against the full dish area.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'document-handover-event',
      // T1606: Knowledge of documentation requirements - understanding event
      // logging requirements for operational events
      nice: ['T1606'],
      title: 'Document Handover Event',
      description: 'Understand the documentation requirements for weather-related handover events.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-stow-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Documentation Requirements',
          params: {
            question: 'What information should be logged for this weather handover event?',
            options: [
              'Time of degradation onset and handover completion',
              'Affected satellite and services',
              'Primary and backup station identifiers',
              'All of the above',
            ],
            correctIndex: 3,
            explanation: 'Complete event documentation includes: timestamps for degradation and handover, affected assets, stations involved, weather conditions, and any anomalies observed. This information is critical for post-incident review and pattern analysis.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Documentation Purpose',
          params: {
            question: 'Why is documenting routine handover events important?',
            options: [
              'Enables pattern analysis and improves future response procedures',
              'Required only for customer billing purposes',
              'Only necessary if something went wrong',
              'Documentation is optional for weather events',
            ],
            correctIndex: 0,
            explanation: 'Even routine events should be documented. Over time, this data reveals patterns - which sites are most affected by weather, average handover times, seasonal trends. This drives infrastructure improvements and procedure refinements.',
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
        Good timing - we've got a situation developing on Vermont. Before I brief you, pull up the mission document and review the weather handover procedures.
      </p>
      <p>
        Click the Mission Brief button to open the documentation.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/intro.mp3'),
    },
    objectives: {
      // ============================================================
      // MISSION PREPARATION
      // ============================================================
      'review-mission-brief': {
        text: `
        <p>
          Look outside - it's already coming down hard. Weather service upgraded the forecast to a full blizzard warning. We've got maybe fifteen minutes before the link margin drops below threshold and we lose TIDEMARK-1.
        </p>
        <p>
          First priority: enable the feed heater on Vermont. Ice on the waveguide is bad news - degrades the signal and can physically damage the feed assembly. Won't save the link, but it'll protect the equipment.
        </p>
        <p>
          Select Vermont Ground Station in the asset tree on the left.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-review-mission-brief.mp3'),
      },

      // ============================================================
      // WEATHER PROTECTION
      // ============================================================
      'select-vermont-station': {
        text: `
        <p>
          Good. Now open the ACU Control tab - that's where the feed heater control is.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-select-vermont-station.mp3'),
      },
      'navigate-acu-vt01-heater': {
        text: `
        <p>
          Find the feed heater toggle and enable it. Should be in the antenna status section.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-acu-vt01-heater.mp3'),
      },
      'enable-vt01-heater': {
        text: `
        <p>
          Heater's on. Good instinct getting that enabled quickly.
        </p>
        <p>
          Quick lesson while the heater warms up. In this job, you'll often have multiple things demanding attention at once. You need a framework for deciding what comes first.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-enable-vt01-heater.mp3'),
      },
      'understand-prioritization': {
        text: `
        <p>
          Safety, customer, equipment, efficiency. Memorize it. When things get hectic, that order will keep you out of trouble.
        </p>
        <p>
          Now - what would happen if we turned the heater off during this storm?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-understand-prioritization.mp3'),
      },
      'verify-heater-quiz': {
        text: `
        <p>
          Right. Ice on RF components is a real problem - not just signal loss, but potential hardware damage. Heater won't save the link, but it protects the equipment for when the storm passes.
        </p>
        <p>
          Now let's look at what the snow is doing to our signal. Go to the RX Analysis tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-heater-quiz.mp3'),
      },

      // ============================================================
      // AGC MONITORING
      // ============================================================
      'navigate-rx-vt01-agc': {
        text: `
        <p>
          Look at the AGC indicator - top of the panel, next to the LNB card. AGC stands for Automatic Gain Control. See how it's compensating as the snow attenuates our signal?
        </p>
        <p>
          Think about what would happen if we didn't have AGC right now.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-rx-vt01-agc.mp3'),
      },
      'verify-agc-status': {
        text: `
        <p>
          Right. Without AGC, we'd have lost lock minutes ago. It's buying us time - but based on the forecast, we've got maybe six minutes before the AGC runs out of room to compensate.
        </p>
        <p>
          Do you understand why weather handovers are so time-critical?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-agc-status.mp3'),
      },
      'estimate-time-remaining': {
        text: `
        <p>
          Exactly. Weather degradation doesn't plateau - it keeps getting worse until you lose the link entirely. Six minutes isn't much time to bring up a backup site.
        </p>
        <p>
          This is why we practice handovers when there's no pressure. When the clock is ticking, you need to execute from muscle memory.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-estimate-time-remaining.mp3'),
      },
      'verify-agc-limits-quiz': {
        text: `
        <p>
          Right. AGC has limits. Once we hit maximum gain, any further signal loss means we lose lock. That's why we're handing over to Maine.
        </p>
        <p>
          Let's get Maine online. Click Maine Backup Station in the asset tree on the left.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-agc-limits-quiz.mp3'),
      },

      // ============================================================
      // SWITCH TO MAINE
      // ============================================================
      'switch-to-maine': {
        text: `
        <p>
          You're now looking at Maine's equipment. Notice Vermont's still running in the background - customers are still being served from there.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-switch-to-maine.mp3'),
      },
      'verify-multisite-quiz': {
        text: `
        <p>
          Right. Switching your view doesn't affect operations. Vermont keeps running, customers stay connected. You're just changing which control panel you're looking at.
        </p>
        <p>
          First thing on any cold start - verify the frequency reference. Everything keys off the GPSDO. Go to the GPS Timing tab. Let's verify Maine's GPSDO is locked.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-multisite-quiz.mp3'),
      },

      // ============================================================
      // MAINE GPSDO
      // ============================================================
      'navigate-gps-timing-maine': {
        text: `
        <p>
          Check the lock indicator. Same as Vermont - green means we have a stable reference.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-gps-timing-maine.mp3'),
      },
      'verify-maine-gpsdo': {
        text: `
        <p>
          Locked. Good - we have a frequency reference. Now a quick question about something you might be wondering.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-maine-gpsdo.mp3'),
      },
      'verify-gpsdo-weather-quiz': {
        text: `
        <p>
          Different frequencies, different physics. GPS punches through weather that kills C-band. That's why the GPSDO stays locked even when the satellite link is degrading.
        </p>
        <p>
          Now let's point the antenna. ACU Control tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-gpsdo-weather-quiz.mp3'),
      },

      // ============================================================
      // MAINE ANTENNA
      // ============================================================
      'navigate-acu-maine': {
        text: `
        <p>
          Set tracking mode to Program Track. The system will calculate the correct pointing angles for Maine's location and slew the antenna to TIDEMARK-1.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-acu-maine.mp3'),
      },
      'configure-maine-antenna': {
        text: `
        <p>
          Antenna's slewing. Good. Catherine from Maine just called - she's almost at the station.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-maine-antenna.mp3'),
      },
      'catherine-look-angles': {
        text: `
        <p>
          Hey, it's Catherine. Just got to the station - roads are fine up here, clear skies. I saw the antenna moving when I pulled in.
        </p>
        <p>
          I did a quick sanity check that you weren't inputting the same az/el for ME-02 that you were using at VT-01. We had a new guy mess that up a few months ago - spent twenty minutes troubleshooting before someone noticed he'd copied Vermont's angles. Program-track was the right call.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-catherine-look-angles.mp3'),
      },

      // ============================================================
      // MAINE LNB
      // ============================================================
      'navigate-rx-maine-lnb': {
        text: `
        <p>
          While the antenna settles, let's get the receive chain configured. Power on the LNB and set it to match Vermont - LO 5,250 MHz, gain 60 dB.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-rx-maine-lnb.mp3'),
      },
      'configure-maine-lnb': {
        text: `
        <p>
          LNB's powered and warming up. Watch the thermal indicator - we need it stable before we can trust the receive path.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-maine-lnb.mp3'),
      },
      'verify-lnb-config-quiz': {
        text: `
        <p>
          Exactly. Same LO means same IF. Makes everything downstream identical between sites. Less to think about, fewer mistakes.
        </p>
        <p>
          Now let's verify we're actually seeing the satellite. Configure the spectrum analyzer - center frequency 1,074.5 MHz, reference level around -91 dBm.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-lnb-config-quiz.mp3'),
      },

      // ============================================================
      // MAINE SPECTRUM ANALYZER / BEACON
      // ============================================================
      'configure-speca-maine': {
        text: `
        <p>
          Good. Now look for the beacon - should be a clean spike at center. That's your proof the antenna is pointed correctly and the receive chain is working.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-speca-maine.mp3'),
      },
      'verify-beacon-maine': {
        text: `
        <p>
          There it is. Clean beacon, good level. Receive path is working.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-beacon-maine.mp3'),
      },
      'verify-beacon-reason-quiz': {
        text: `
        <p>
          Exactly. The beacon doesn't just prove pointing - it proves the whole chain. I've seen operators trust program-track blindly and waste an hour because a cable was loose. Trust but verify.
        </p>
        <p>
          Now configure the receiver modem. Same parameters as Vermont: 1,532 MHz, 36 MHz bandwidth, QPSK, FEC 3/4.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-beacon-reason-quiz.mp3'),
      },

      // ============================================================
      // MAINE RX MODEM
      // ============================================================
      'configure-maine-rx-modem': {
        text: `
        <p>
          Modem's configured. Now watch for lock - the modem needs to acquire the carrier and sync to the data stream.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-maine-rx-modem.mp3'),
      },
      'verify-modem-match-quiz': {
        text: `
        <p>
          Right. The satellite transmits what it transmits. Our job is to configure the modem to receive it correctly. Mismatch any parameter and you get garbage.
        </p>
        <p>
          Watch for lock and check the C/N ratio. We need at least 10 dB before we can safely hand over.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-modem-match-quiz.mp3'),
      },

      // ============================================================
      // MAINE RX LOCK
      // ============================================================
      'verify-maine-lock': {
        text: `
        <p>
          Lock achieved, C/N looks solid. Maine's actually seeing a cleaner signal than Vermont right now - clear skies make a difference.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-maine-lock.mp3'),
      },
      'verify-lock-quality-quiz': {
        text: `
        <p>
          Right. Lock without margin is asking for trouble. 10 dB gives us headroom - even if Maine's weather changes later, we've got buffer.
        </p>
        <p>
          Receive side is ready. Now the transmitter. TX Chain tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-lock-quality-quiz.mp3'),
      },

      // ============================================================
      // MAINE TX MODEM
      // ============================================================
      'navigate-tx-maine': {
        text: `
        <p>
          Configure the transmitter modem to match Vermont: 1,094 MHz, -7 dBm, 36 MHz bandwidth, QPSK, FEC 3/4. Then enable transmission.
        </p>
        <p>
          The handover process will handle the BUC and HPA automatically - you just need to get the modem configured and enabled.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-tx-maine.mp3'),
      },
      'configure-maine-tx-modem': {
        text: `
        <p>
          Maine's transmitter is ready. Time to execute the handover.
        </p>
        <p>
          Go to Tidemark-1's satellite page in the asset tree. That's where the traffic control is.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-maine-tx-modem.mp3'),
      },

      // ============================================================
      // HANDOVER EXECUTION
      // ============================================================
      'navigate-dashboard-handover': {
        text: `
        <p>
          Before you hit the button, make sure you understand what's about to happen.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-dashboard-handover.mp3'),
      },
      'understand-handover-quiz': {
        text: `
        <p>
          Right. The system coordinates everything - enables Maine's uplink while disabling Vermont's. No dual uplinks, no interference, no service interruption.
        </p>
        <p>
          Execute the handover. Watch both sites during the transition.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-understand-handover-quiz.mp3'),
      },
      'execute-handover': {
        text: `
        <p>
          Traffic's on Maine now. Clean handover - zero packet loss. That's how it's supposed to work.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-execute-handover.mp3'),
      },
      'verify-handover-success-quiz': {
        text: `
        <p>
          Perfect. Maine's active, Vermont's TX is disabled, customers never noticed. Textbook weather handover.
        </p>
        <p>
          One more thing: stow Vermont's antenna to protect it during the storm. Switch back to Vermont Ground Station in the asset tree.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-handover-success-quiz.mp3'),
      },

      // ============================================================
      // STOW VERMONT
      // ============================================================
      'switch-to-vermont-stow': {
        text: `
        <p>
          Good. ACU Control tab to stow the antenna.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-switch-to-vermont-stow.mp3'),
      },
      'navigate-acu-vt01-stow': {
        text: `
        <p>
          Set tracking mode to Stow. Points the antenna straight up - 90 degrees elevation. Minimizes wind loading and keeps snow from accumulating in the dish.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-acu-vt01-stow.mp3'),
      },
      'stow-vermont-antenna': {
        text: `
        <p>
          Antenna's stowing. Good. One last question to make sure you understand why.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-stow-vermont-antenna.mp3'),
      },
      'verify-stow-quiz': {
        text: `
        <p>
          Maine is fully operational. TIDEMARK-1 traffic is now being served from ME-02. Vermont is in standby until the weather clears.
        </p>
        <p>
          One more thing before we're done - documentation. Every handover event gets logged, even routine weather ones.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-stow-quiz.mp3'),
      },
      'document-handover-event': {
        text: `
        <p>
          Hey, it's Catherine again. I've got things under control here - good C/N, clean traffic flow, no alarms. You did good work getting us set up.
        </p>
        <p>
          I'll keep an eye on the link and coordinate with you when the storm clears so we can bring Vermont back online. Weather service says the worst should pass in about six hours.
        </p>
        <p>
          Stay safe over there. And nice job on the handover - zero packet loss is exactly what we want to see.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-document-handover-event.mp3'),
      },
    },
  },
};