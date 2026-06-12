import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { aurora7Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 8: "Night Shift"
 *
 * Phase: Final Evaluation (Graduation Exam)
 * Time Pressure: Moderate (30-40 minutes total)
 * Calculation Required: YES - IF frequency calculations for AURORA-7
 * New UI Elements: None (mastery of all existing systems)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0081: Diagnose network connectivity problems
 *   - S0421: Skill in operating network equipment
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0153: Monitor network capacity and performance
 *   - S0582: Skill in troubleshooting system performance
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0431: Check system hardware availability, functionality
 *   - T1567: Configure system hardware, software, and equipment
 *
 * Premise: It's 2 AM on a Saturday night. You're alone at the Vermont station
 * for your first solo night shift. Charlie is visiting family out of state.
 * Dana is on-call but sleeping - she'll only answer if it's truly urgent.
 *
 * A customer reports intermittent connectivity on AURORA-7, an aging satellite
 * with an inclined orbit. You must independently:
 * 1. Perform initial system health check (Scenario 1)
 * 2. Diagnose and resolve an LNB fault (Scenario 7)
 * 3. Make weather-related operational decisions (Scenario 3)
 * 4. Calculate IF frequencies for AURORA-7 (Scenarios 4, 6)
 * 5. Use spectrum analysis to verify signals (Scenario 5)
 * 6. Execute proper power sequencing for emergency maintenance (Scenario 2)
 *
 * This is your graduation exam - minimal hand-holding, multiple tasks,
 * and time pressure. Show that you're ready for solo operations.
 */

export const scenario8Data: ScenarioData = {
  id: 'nats-level-8-night-shift',
  prerequisiteScenarioIds: ['nats-scenario7'],
  url: 'nats/level-8/night-shift',
  imageUrl: 'nats/8/card.png',
  number: 8,
  isDisabled: false,
  difficulty: 'intermediate',
  title: 'Level 8: Night Shift',
  subtitle: 'Solo Operations Evaluation',
  duration: '30-40 min',
  missionType: 'Final Evaluation',
  description: `It's 2 AM on a Saturday night - your first solo night shift at the Vermont station. Charlie is visiting family out of state. Dana is on-call but sleeping; she's made it clear she only wants to be woken for genuine emergencies.<br><br>A customer reports intermittent connectivity issues on AURORA-7, an aging C-band satellite with an inclined orbit. You'll need to investigate independently, diagnose any equipment issues, verify the link, and handle whatever complications arise.<br><br>This is your graduation exam. Everything you've learned in Scenarios 1-7 comes together here. No one is going to walk you through each step. Make good decisions, work methodically, and prove you're ready for solo operations.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
  ],
  timeLimitSeconds: 40 * 60, // 40 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            // Antenna tracking AURORA-7 in program-track (needs step-track for inclined orbit)
            isPowered: true,
            azimuth: 190 as Degrees,
            elevation: 32 as Degrees,
            polarization: 0 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: false,
            targetSatelliteId: 28899,
            targetAzimuth: 190 as Degrees,
            targetElevation: 32 as Degrees,
            targetPolarization: 0 as Degrees,
            slewing: false,
            beaconCN: 5.2 as dB, // Marginal due to tracking error
            beaconFrequencyHz: 1085e6 as Hertz, // AURORA-7 beacon IF
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // LNB has reference unlock issue (fault to diagnose)
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 65 as dB,
              isExtRefLocked: false, // Fault condition
              hasRefLockFault: true, // Sticky fault - clears on power cycle
              noiseTemperature: 55, // Slightly elevated
              temperature: 32,
            },
            buc: {
              isPowered: true,
              isMuted: false, // Link was operational - BUC was transmitting
              isLoopback: false,
              loFrequency: 7100 as MHz, // AURORA-7 BUC LO (RF 6000 - IF 1047 = 4925)
              isExtRefLocked: true,
              gain: 23 as dB,
            },
            hpa: {
              isPowered: true,
              isHpaEnabled: true, // Link was operational - HPA was enabled
              isHpaSwitchEnabled: true,
              outputPower: 50 as dBm,
            },
            gpsdo: {
              isPowered: true,
              isLocked: true,
              gnssSignalPresent: true,
              isGnssSwitchUp: true,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 1000e6 as Hertz, // Not configured - player must set
            span: 100e6 as Hertz,
            rbw: 1e6 as Hertz,
            referenceLevel: -50 as dBm,
            minAmplitude: -120 as dBm,
            maxAmplitude: -30 as dBm,
            scaleDbPerDiv: 10 as dB,
          },
        ],
        receivers: [
          {
            ...vermontGroundStation.receivers[0],
            modems: [
              {
                ...vermontGroundStation.receivers[0].modems[0],
                frequency: 1422 as MHz, // AURORA-7 downlink RF
                bandwidth: 24 as MHz,
              }
            ],
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            activeModem: 1,
            modems: [
              {
                // Modem 1: Configured for AURORA-7 but has intermittent hardware fault
                ...vermontGroundStation.transmitters[0].modems[0],
                modem_number: 1,
                intermittentFault: true, // Hardware fault causing periodic signal dropout
                isTransmitting: true, // Was trying to transmit
                isTransmittingSwitchUp: true,
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'AURORA-7-Uplink',
                  noradId: 28899,
                  frequency: 1047e6 as IfFrequency, // Correct IF for AURORA-7
                  bandwidth: 24e6 as Hertz,
                  modulation: 'QPSK' as ModulationType,
                  fec: '3/4' as FECType,
                  origin: SignalOrigin.TRANSMITTER,
                },
              },
              // Modem 2-4: Default/unconfigured (player will configure Modem 2)
            ],
          },
        ],
      },
    ],
    satellites: [aurora7Satellite, tidemark1Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-8?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Customer Trouble Ticket',
      description: 'Review the trouble ticket details and acknowledge you are ready to investigate.',
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
          description: 'Ready to Investigate',
          params: {
            character: Character.SYSTEM,
            question: 'Customer reports intermittent connectivity on AURORA-7. You are alone at the station. How will you proceed?',
            options: [
              'Begin systematic troubleshooting - check timing, RX chain, antenna, then TX if needed',
              'Call Dana immediately to report the issue',
              'Wait until morning shift to investigate',
              'Reboot all equipment and hope it fixes itself',
            ],
            correctIndex: 0,
            explanation: 'Systematic troubleshooting is the professional approach. You have the skills to investigate this independently.',
            pointPenalty: 15,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 1: INITIAL HEALTH CHECK (Scenario 1 Skills)
    // ============================================================
    {
      id: 'access-vermont-station',
      nice: ['S0421'],
      title: 'Access Ground Station',
      description: 'Select Vermont Ground Station to begin your investigation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
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
      id: 'check-dashboard-alarms',
      nice: ['T0153', 'K0741'],
      title: 'Check Dashboard for Alarms',
      description: 'Review the Dashboard for any active fault conditions.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['access-vermont-station'],
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
          description: 'Identify Alarm Condition',
          params: {
            character: Character.SYSTEM,
            question: 'What alarm is displayed on the Dashboard?',
            options: [
              'LNB Reference Unlocked',
              'BUC Over-Temperature',
              'HPA Output Fault',
              'No active alarms',
            ],
            correctIndex: 0,
            explanation: 'The LNB shows a reference unlock condition. This means the LNB is not locked to the GPSDO 10 MHz reference, which can cause frequency drift and degraded receive performance.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-gpsdo-status',
      nice: ['T0431', 'K0740'],
      title: 'Verify GPSDO Status',
      description: 'Check the GPS Timing tab to verify the timing reference is operational.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-dashboard-alarms'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'GPS Timing Tab Open',
          params: { tab: 'gps-timing' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'GPSDO Status Verified',
          params: {
            character: Character.SYSTEM,
            question: 'The GPSDO shows locked status. What does this tell you about the LNB reference unlock alarm?',
            options: [
              'The 10 MHz reference is available - the problem is likely the cable or LNB input',
              'The GPSDO is faulty and causing the LNB problem',
              'The LNB alarm is a false positive',
              'We need to restart the GPSDO',
            ],
            correctIndex: 0,
            explanation: 'The GPSDO is generating a valid 10 MHz reference. Since the LNB shows unlocked, the issue is downstream - either the reference cable to the LNB or the LNB reference input itself.',
            pointPenalty: 10,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: FAULT DIAGNOSIS (Scenario 7 Skills)
    // ============================================================
    {
      id: 'diagnose-lnb-fault',
      nice: ['T0081', 'S0582'],
      title: 'Diagnose LNB Reference Fault',
      description: 'Navigate to RX Analysis and investigate the LNB reference unlock condition.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-gpsdo-status'],
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
          description: 'LNB Powered',
          params: { equipment: 'lnb' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Fault Diagnosis',
          params: {
            character: Character.SYSTEM,
            question: 'The LNB is powered but shows reference unlocked. What is the most likely corrective action?',
            options: [
              'Power cycle the LNB to re-acquire the external reference',
              'Replace the LNB immediately',
              'Increase LNB gain to compensate',
              'Switch to internal oscillator mode',
            ],
            correctIndex: 0,
            explanation: 'Power cycling the LNB will force it to re-acquire the external 10 MHz reference. This is a common fix for reference lock issues, especially after thermal cycling or power glitches.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'resolve-lnb-fault',
      nice: ['S0582', 'T1567'],
      title: 'Resolve LNB Reference Fault',
      description: 'Power cycle the LNB to restore reference lock. Power OFF, wait for status to update, then power ON.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-lnb-fault'],
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
          description: 'LNB Powered',
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stable',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-fault-cleared',
      nice: ['K0741', 'T0153'],
      title: 'Verify Fault Cleared',
      description: 'Confirm the Dashboard no longer shows the LNB reference alarm.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['resolve-lnb-fault'],
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
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          params: { requiresObservation: true, observationTab: 'dashboard' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: IF FREQUENCY CALCULATION (Scenarios 4, 6 Skills)
    // ============================================================
    {
      id: 'calculate-aurora7-beacon-if',
      nice: ['K0773', 'K1032'],
      title: 'Calculate AURORA-7 Beacon IF',
      description: 'Determine the correct IF frequency to view the AURORA-7 beacon on the spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-fault-cleared'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon IF Calculation',
          params: {
            character: Character.SYSTEM,
            question: 'AURORA-7 beacon is at 4165 MHz RF. The LNB LO is 5250 MHz. What IF frequency should you tune the spectrum analyzer to?',
            options: [
              '1085 MHz',
              '9415 MHz',
              '915 MHz',
              '4165 MHz',
            ],
            correctIndex: 0,
            explanation: 'IF = LO - RF = 5250 - 4165 = 1085 MHz. The LNB downconverts by subtracting the RF frequency from the LO frequency.',
            pointPenalty: 15,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-speca-beacon',
      nice: ['S0421', 'K0773'],
      title: 'Configure Spectrum Analyzer for Beacon',
      description: 'Set up the spectrum analyzer to observe the AURORA-7 beacon at 1085 MHz IF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-aurora7-beacon-if'],
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
          description: 'Center Frequency',
          hint: 'Set the spectrum analyzer center frequency to 1085 MHz to view the AURORA-7 beacon.',
          params: {
            centerFrequency: 1085e6 as Hertz,
            centerFrequencyTolerance: 2e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span Configured',
          hint: 'Set a narrow span to clearly see the beacon signal.',
          params: {
            span: 0.01e6 as Hertz,
            spanTolerance: 0.01e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude Set',
          hint: 'Set the maximum amplitude to -108 dBm to properly view the beacon signal.',
          params: {
            maxAmplitude: -95 as dBm,
            maxAmplitudeTolerance: 15 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude Set',
          hint: 'Set the minimum amplitude to -120 dBm to properly view the beacon signal.',
          params: {
            minAmplitude: -130 as dBm,
            minAmplitudeTolerance: 15 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW Configured to Auto',
          params: {
            rbw: null,
          },
          maintainUntilObjectiveComplete: true,
        }
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: ANTENNA TRACKING (Scenario 6 Skills)
    // ============================================================
    {
      id: 'identify-tracking-problem',
      nice: ['T0081', 'K1032'],
      title: 'Identify Tracking Problem',
      description: 'The beacon keeps dropping out. Analyze the antenna tracking mode to identify potential issues.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-speca-beacon'],
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
          description: 'Tracking Mode Analysis',
          params: {
            character: Character.SYSTEM,
            question: 'AURORA-7 is a legacy satellite with an inclined orbit. The antenna is in program-track mode. Why might this cause tracking problems?',
            options: [
              'Inclined orbits require step-track to follow satellite drift - program-track cannot compensate',
              'Program-track mode is only for LEO satellites',
              'The antenna motors are too slow for program-track',
              'Program-track requires manual polarization adjustment',
            ],
            correctIndex: 0,
            explanation: 'AURORA-7 has stopped north-south station-keeping, causing its orbit to become inclined. This makes the satellite trace a figure-8 pattern in the sky. Program-track follows predicted positions, but step-track actively hunts for peak signal, which is required for drifting satellites.',
            pointPenalty: 15,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'enable-step-track',
      nice: ['S0421', 'T1567'],
      title: 'Enable Step-Track Mode',
      description: 'Switch the antenna to step-track mode to actively track the inclined-orbit satellite.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-tracking-problem'],
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
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Mode Enabled',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-beacon-lock',
      nice: ['T0153', 'K0740'],
      title: 'Verify Beacon Acquisition',
      description: 'Confirm the antenna has acquired beacon lock and the signal is now visible on the spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-step-track'],
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
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Acquired',
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Visible',
          params: {
            signalId: 'AURORA-7-Beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 5: WEATHER DECISION (Scenario 3 Skills)
    // ============================================================
    {
      id: 'weather-alert-decision',
      nice: ['K0741', 'K0740'],
      title: 'Weather Alert Assessment',
      description: 'A weather alert notification appears. Assess the situation and decide on appropriate action.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-lock'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Weather Decision',
          params: {
            character: Character.SYSTEM,
            question: 'Weather service reports freezing rain expected in 2 hours. AURORA-7 link is now stable. What is the appropriate action?',
            options: [
              'Enable feed heater now as a precaution, continue monitoring the link',
              'Immediately stow the antenna to protect it',
              'Call Dana to report the weather forecast',
              'Ignore the weather alert - it is 2 hours away',
            ],
            correctIndex: 0,
            explanation: 'Enabling the feed heater proactively prevents ice accumulation. The link is stable so there is no need to stow yet, but preparing for weather is good practice. This is not urgent enough to wake Dana at 2 AM.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-feed-heater',
      nice: ['S0421', 'K0741'],
      title: 'Enable Feed Heater',
      description: 'Enable the feed heater on the ACU Control tab as a weather precaution.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['weather-alert-decision'],
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
          description: 'Feed Heater Enabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 6: TX MODEM FAULT DIAGNOSIS
    // ============================================================
    {
      id: 'verify-acu-tracking-stable',
      nice: ['T0081', 'K0740'],
      title: 'Verify Antenna Tracking Stable',
      description: 'Customer still reports intermittent errors. First, confirm the antenna tracking is stable after enabling step-track.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-feed-heater'],
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
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Confirmed',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Tracking Analysis',
          params: {
            character: Character.SYSTEM,
            question: 'The customer still reports intermittent errors. The ACU shows stable step-track with beacon lock. What does this tell you?',
            options: [
              'The antenna is tracking properly - the intermittent issue is not caused by tracking problems',
              'The beacon frequency is drifting and causing lock instability',
              'The polarization needs to be adjusted for the inclined orbit',
              'Step-track mode is inadequate for AURORA-7',
            ],
            correctIndex: 0,
            explanation: 'With stable beacon lock in step-track mode, we can rule out antenna tracking as the cause of intermittent errors. The antenna is correctly following the satellite. We need to look elsewhere.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-rx-path-healthy',
      nice: ['T0153', 'K0740'],
      title: 'Verify RX Path Health',
      description: 'Check the receiver modem to confirm the RX path is healthy after the LNB fix.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-acu-tracking-stable'],
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
          type: 'receiver-signal-locked',
          description: 'Receiver Modem Locked',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Ratio Adequate',
          params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'RX Path Analysis',
          params: {
            character: Character.SYSTEM,
            question: 'The receiver shows stable lock with good C/N. What does this indicate about the customer\'s intermittent errors?',
            options: [
              'The RX path is healthy - the problem must be in the transmit direction',
              'The receiver is masking the real problem with AGC',
              'We need to check the LNB temperature before concluding',
              'The C/N margin is still too low for reliable service',
            ],
            correctIndex: 0,
            explanation: 'With stable receiver lock and good C/N, the downlink (RX) path is working correctly. Since the customer reports bidirectional issues, and RX is healthy, the problem must be in the uplink (TX) direction.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'check-tx-chain-status',
      nice: ['T0081', 'S0582'],
      title: 'Investigate TX Chain',
      description: 'Navigate to the TX Chain tab to investigate the transmit path for intermittent faults.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-path-healthy'],
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
          description: 'TX Chain Inspection',
          params: {
            character: Character.SYSTEM,
            question: 'When investigating an intermittent TX fault, which indicator would show evidence of the problem?',
            options: [
              'The modem Output Power display - it shows DROPOUT during fault periods',
              'The HPA reflected power - it increases during modem faults',
              'The BUC temperature - it spikes during signal dropouts',
              'The GPSDO holdover counter - it increments during TX faults',
            ],
            correctIndex: 0,
            explanation: 'The TX modem Output Power display directly indicates when an intermittent hardware fault causes a signal dropout. During fault periods, the display shows "DROPOUT" in red, making it easy to identify the source of the problem.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'switch-to-modem-2',
      nice: ['S0421', 'T1567'],
      title: 'Switch to Backup Modem',
      description: 'Select Modem 2 as the active transmitter to replace the faulted Modem 1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-tx-chain-status'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-active-modem',
          description: 'Modem 2 Selected',
          params: { modemNumber: 2 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 7: MODEM 2 CONFIGURATION (Scenarios 4, 6 Skills)
    // ============================================================
    {
      id: 'calculate-aurora7-uplink-if',
      nice: ['K0773', 'K1032'],
      title: 'Calculate AURORA-7 Uplink IF',
      description: 'Calculate the correct TX modem IF frequency to configure Modem 2 for AURORA-7 uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-modem-2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Uplink IF Calculation',
          params: {
            character: Character.SYSTEM,
            question: 'AURORA-7 uplink RF is 7100 MHz. The BUC LO is 6053 MHz. What TX IF frequency is required?',
            options: [
              '1047 MHz',
              '13153 MHz',
              '1043 MHz',
              '6000 MHz',
            ],
            correctIndex: 0,
            explanation: 'TX IF = RF - BUC LO = 7100 - 6053 = 1047 MHz. The BUC upconverts by adding the LO frequency to the IF.',
            pointPenalty: 15,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-tx-modem',
      nice: ['S0421', 'T1567'],
      title: 'Configure Modem 2 for AURORA-7',
      description: 'Configure Modem 2 with the correct settings for AURORA-7 uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-aurora7-uplink-if'],
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
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency Set to 1047 MHz',
          params: {
            modemNumber: 2,
            frequency: 1047e6,
            frequencyTolerance: 2e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'TX Bandwidth Set to 24 MHz',
          params: {
            modemNumber: 2,
            bandwidth: 24e6,
            bandwidthTolerance: 2e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'TX Modulation: QPSK',
          params: { modemNumber: 2, modulation: 'QPSK' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-power-set',
          description: 'TX Power: -7 dBm',
          params: { modemNumber: 2, power: -7 as dBm, powerTolerance: 1 as dBm },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'TX FEC: 3/4',
          params: { modemNumber: 2, fec: '3/4' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 8: BUC LOOPBACK TESTING
    // ============================================================
    {
      id: 'prepare-buc-loopback',
      nice: ['T1313', 'S0582'],
      title: 'Prepare BUC for Loopback Test',
      description: 'Before transmitting on a new modem, disable the faulted Modem 1 and enable BUC loopback mode for safe testing.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-tx-modem'],
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
          type: 'tx-modem-not-transmitting',
          description: 'Modem 1 Disabled',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-loopback-enabled',
          description: 'BUC Loopback Enabled',
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Disabled',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Loopback Safety',
          params: {
            character: Character.SYSTEM,
            question: 'Why must BUC loopback be enabled BEFORE starting transmission on a new modem?',
            options: [
              'To prevent accidental RF transmission through the HPA until the new modem is verified',
              'To reduce power consumption during testing',
              'To improve signal quality measurements',
              'To synchronize the modem clock with the BUC',
            ],
            correctIndex: 0,
            explanation: 'Enabling loopback before transmission ensures the signal is routed back to the receiver for testing, rather than going to the HPA and antenna. This prevents accidental RF transmission until the new modem configuration is verified.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'test-modem2-loopback',
      nice: ['T1313', 'S0582'],
      title: 'Test Modem 2 Transmission',
      description: 'With BUC loopback engaged, enable Modem 2 transmission to test the signal path.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['prepare-buc-loopback'],
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
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Modem 2 Transmitting',
          params: { modemNumber: 2 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'BUC Loopback Purpose',
          params: {
            character: Character.SYSTEM,
            question: 'What does BUC loopback test that modem loopback does not?',
            options: [
              'The full signal path from modem through BUC, without engaging the HPA',
              'The HPA output power level',
              'The antenna pointing accuracy',
              'The satellite transponder response',
            ],
            correctIndex: 0,
            explanation: 'BUC loopback tests the complete modem-to-BUC signal path while keeping the HPA disengaged. This verifies the full low-power TX chain.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-lnb-for-loopback',
      nice: ['T0153', 'K0740'],
      title: 'Configure LNB for Loopback Test',
      description: 'Set the LNB LO to 7000 MHz to view the BUC loopback signal. The BUC LO is 7100 MHz, so the 1047 MHz TX IF becomes 6053 MHz RF, which downconverts to 947 MHz with a 7000 MHz LNB.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['test-modem2-loopback'],
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
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 7000 MHz',
          params: {
            loFrequency: 7000 as MHz,
            loFrequencyTolerance: 10 as MHz,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-loopback-signal',
      nice: ['T0153', 'K0740'],
      title: 'Verify Loopback Signal',
      description: 'Check the spectrum analyzer at 947 MHz to confirm the BUC loopback signal is present.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-lnb-for-loopback'],
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
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 947 MHz',
          params: {
            centerFrequency: 947e6 as Hertz,
            centerFrequencyTolerance: 5e6,
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Loopback Signal Verified',
          params: {
            character: Character.SYSTEM,
            question: 'What should you observe on the spectrum analyzer at 947 MHz?',
            options: [
              'A 24 MHz wide modulated signal - confirming TX chain is working',
              'A narrow CW spike like the beacon',
              'No signal - loopback does not produce visible output',
              'The AURORA-7 beacon signal',
            ],
            correctIndex: 0,
            explanation: 'The loopback signal appears as a 24 MHz wide modulated carrier at 947 MHz (TX IF 1047 MHz upconverted by BUC LO 7100 MHz to 6053 MHz RF, then downconverted by LNB LO 7000 MHz). This confirms Modem 2 and the BUC are working correctly.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'restore-lnb-frequency',
      nice: ['T0153', 'K0740'],
      title: 'Restore LNB Frequency',
      description: 'Return the LNB LO to 5250 MHz for normal satellite reception.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-loopback-signal'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Restored to 5250 MHz',
          params: {
            loFrequency: 5250 as MHz,
            loFrequencyTolerance: 10 as MHz,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 10: UPLINK ENABLE (Scenario 2 Power Sequencing)
    // ============================================================
    {
      id: 'disable-loopback-prepare-uplink',
      nice: ['S0421', 'T1567'],
      title: 'Prepare for Live Uplink',
      description: 'Disable loopback mode and mute BUC in preparation for HPA enable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['restore-lnb-frequency'],
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
          type: 'buc-loopback-disabled',
          description: 'Loopback Disabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-hpa-sequence',
      nice: ['S0421', 'K0770'],
      title: 'Enable HPA',
      description: 'Power on and enable the HPA output stage following proper sequencing.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-loopback-prepare-uplink'],
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
          type: 'equipment-powered',
          description: 'HPA Powered',
          params: { equipment: 'hpa' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
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
      id: 'verify-link-operational',
      nice: ['T0153', 'K0741'],
      title: 'Verify Link Operational',
      description: 'Confirm the AURORA-7 link is fully operational with both RX and TX paths verified.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-hpa-sequence'],
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
          description: 'Link Status Verification',
          params: {
            character: Character.SYSTEM,
            question: 'What indicators confirm the AURORA-7 link is now operational?',
            options: [
              'No active alarms on Dashboard',
              'Antenna in step-track with beacon lock',
              'HPA enabled and BUC unmuted',
              'All of the above',
            ],
            correctIndex: 3,
            explanation: 'A fully operational link shows: no Dashboard alarms, antenna tracking with beacon lock (step-track for inclined orbit), and active TX chain (HPA enabled, BUC unmuted). All conditions must be met.',
            pointPenalty: 10,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'final-summary',
      nice: ['K0645', 'T0153'],
      title: 'Document Resolution',
      description: 'Summarize the actions taken to resolve the customer issue.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-link-operational'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Resolution Summary',
          params: {
            character: Character.SYSTEM,
            question: 'Which summary correctly describes the root cause and resolution?',
            options: [
              'LNB reference unlock caused RX degradation; program-track inadequate for inclined orbit; TX Modem 1 intermittent fault. Fixed by power cycling LNB, enabling step-track, and switching to Modem 2.',
              'HPA fault caused TX failure; fixed by replacing the HPA tube.',
              'Weather degradation caused link loss; handed over to backup station.',
              'Customer equipment issue; no action required at ground station.',
            ],
            correctIndex: 0,
            explanation: 'The customer intermittent connectivity had three causes: (1) LNB reference unlock degraded receive quality, (2) program-track mode could not follow AURORA-7\'s inclined orbit drift, (3) TX Modem 1 had an intermittent hardware fault. All were resolved without waking Dana or escalating.',
            pointPenalty: 15,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 2:17 AM]</em>
      </p>
      <p>
        "Hey - just got a trouble ticket. Customer reports intermittent connectivity on AURORA-7, signal dropouts every few minutes. I'm on-call but heading back to sleep. You've got this."
      </p>
      <p>
        "Charlie's out of state visiting family. Call me only if it's a genuine emergency. Good luck."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/8/intro.mp3'),
    },
    objectives: {
      'final-summary': {
        text: `
        <p>
          <em>[Text message from Dana at 4:45 AM]</em>
        </p>
        <p>
          "Saw the ticket resolution come through. LNB reference issue, tracking mode, and good call switching to Modem 2. You handled it right. No need to wake me for that."
        </p>
        <p>
          "Charlie will be proud. See you at shift change."
        </p>
        <p>
          <strong>Congratulations. You've demonstrated the skills for solo operations.</strong>
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/8/obj-final-summary.mp3'),
      },
    },
  },
};
