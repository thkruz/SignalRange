import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
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
  description: `It's 2 AM on a Saturday night - your first solo night shift at the Vermont station. Charlie is visiting family out of state. Dana is on-call but sleeping; she's made it clear she only wants to be woken for genuine emergencies.<br><br>A customer reports intermittent connectivity issues on AURORA-7, an aging C-band satellite with an inclined orbit. You'll need to investigate independently, diagnose any equipment issues, verify the link, and handle whatever complications arise.<br><br>This is your graduation exam. Everything you've learned in training comes together here. No one is going to walk you through each step. Make good decisions, work methodically, and prove you're ready for solo operations.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems'],
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
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: false,
            targetSatelliteId: 28899,
            targetAzimuth: 190 as Degrees,
            targetElevation: 32 as Degrees,
            slewing: false,
            beaconCN: 5.2 as dB, // Marginal due to tracking error
            beaconFrequencyHz: 4165e6 as Hertz, // AURORA-7 beacon (RF)
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
              loFrequency: 7100 as MHz, // AURORA-7 BUC LO (LO 7100 - IF 1047 = RF 6053, LSB)
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
            rbw: null, // Auto, like every other analyzer at shift start (Phase 31 D9)
            referenceLevel: -50 as dBm,
            // A wideband view: the beacon step asks for its own -120/-60 window
            minAmplitude: -110 as dBm,
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
              },
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
    scenarioStartDate: '2026-02-14',
    scenarioStartWallTime: '02:15:00',
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
      description: "Read the trouble ticket and confirm you're ready to investigate.",
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
            question: "A customer reports intermittent connectivity on AURORA-7, and you're alone at the station. How do you proceed?",
            options: [
              'Troubleshoot step by step: timing, RX chain, antenna, then TX if needed',
              'Call Dana now, report the ticket and wait for her to direct the troubleshooting',
              'Wait for the morning shift: log the ticket, keep monitoring and let the day crew investigate',
              'Power cycle everything: reboot the LNB, BUC, HPA and modems, then see if the dropouts stop',
            ],
            correctIndex: 0,
            explanation:
              'Working through the system in order is the professional approach, because it finds the fault without making anything worse. Calling Dana or waiting for the day crew just delays the fix on a fault you have the skills to investigate yourself. Power cycling everything would also hide which part was failing.',
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
            question: 'What alarm does the Dashboard show?',
            options: ['LNB Reference Unlocked', 'BUC Over-Temperature', 'HPA Output Power Fault', 'No active alarms'],
            correctIndex: 0,
            explanation:
              "The LNB is reporting a reference unlock, which means it isn't locked to the GPSDO's 10 MHz reference. Without that lock its frequency can drift and receive performance suffers. The BUC and HPA aren't alarming, and the Dashboard isn't clear.",
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
          mustMaintain: true,
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
            question: 'The GPSDO shows locked. What does that tell you about the LNB reference unlock alarm?',
            options: [
              'The 10 MHz reference is available - the problem is likely the cable or LNB input',
              'The 10 MHz reference is faulty - the GPSDO lock indicator is masking a bad output',
              'The LNB alarm is a false positive - a locked GPSDO means the LNB must be locked too',
              'The GPSDO needs a restart - the LNB will re-lock once the reference is re-acquired',
            ],
            correctIndex: 0,
            explanation:
              "The GPSDO is generating a valid 10 MHz reference, but the LNB still shows unlocked, so the problem is downstream. It's either the reference cable to the LNB or the LNB's reference input. Restarting the GPSDO wouldn't help, because it's already locked.",
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
          // A read of the panel: confirm it is on, never cycle it here
          params: { equipment: 'lnb', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
          requiresChange: false,
        },
        {
          type: 'status-check',
          description: 'Fault Diagnosis',
          params: {
            character: Character.SYSTEM,
            question: 'The LNB is powered but shows reference unlocked. What is the most likely corrective action?',
            options: [
              'Power cycle the LNB to re-acquire the external reference',
              'Replace the LNB since the reference input has failed',
              'Increase the LNB gain to compensate for the lost reference',
              'Switch the LNB to its internal oscillator to bypass the reference',
            ],
            correctIndex: 0,
            explanation:
              "Power cycling the LNB forces it to re-acquire the external 10 MHz reference. It's a common fix for reference lock problems, especially after thermal cycling or a power glitch. Replacing the LNB is premature before a power cycle has been tried, and more gain does nothing for a missing reference.",
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
      description:
        'Power cycle the LNB to restore reference lock: power OFF, wait for status to update, then power ON. The LNB re-locks to the 10 MHz reference and needs about 90 seconds to warm up before it reads stable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-lnb-fault'],
      // 90 s warm-up after the cycle
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
          // requiresChange (default): counts only once the LNB goes off and back on
          type: 'equipment-powered',
          description: 'LNB Power-Cycled (Off, Then On)',
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
            question: 'The AURORA-7 beacon is at 4165 MHz RF and the LNB LO is 5250 MHz. What IF frequency should you tune the spectrum analyzer to?',
            options: ['1085 MHz', '9415 MHz', '915 MHz', '4165 MHz'],
            correctIndex: 0,
            explanation:
              'IF = LO - RF = 5250 - 4165 = 1085 MHz, because the LNB downconverts by subtracting the RF frequency from the LO frequency. Adding them gives 9415 MHz, and tuning to the RF itself (4165 MHz) ignores the downconversion.',
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
      description:
        'Set up the spectrum analyzer to watch the AURORA-7 beacon. Set Center to 1085 MHz, Span to 10 kHz (0.01 MHz), Min Amplitude to -120 dBm and Max Amplitude to -60 dBm, and leave RBW on Auto.',
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
          hint: 'Set the span to 10 kHz (0.01 MHz) to clearly see the beacon signal.',
          params: {
            span: 0.01e6 as Hertz,
            spanTolerance: 0.01e6, // 0-20 kHz
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude Set',
          // The AURORA-7 beacon reads about -76 to -81 dBm at the RX IF tap
          // (phase 27 ledger): -60 puts it 15+ dB under the top
          hint: 'Set the maximum amplitude to -60 dBm so the beacon sits below the top of the screen.',
          params: {
            maxAmplitude: -60 as dBm,
            maxAmplitudeTolerance: 3 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude Set',
          // The floor at 10 kHz span (RBW auto 30 Hz) is ~-103 dBm: on screen at -120
          hint: 'Set the minimum amplitude to -120 dBm so the noise floor shows under the beacon.',
          params: {
            minAmplitude: -120 as dBm,
            minAmplitudeTolerance: 3 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
        // No RBW row: the analyzer starts on Auto since Phase 31 D9, so the
        // row would tick before the player acts (nats-objective-intent lint)
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
      description:
        'The beacon holds steady on the analyzer, but the RX 1 carrier keeps dropping lock. The antenna is still in program-track on an inclined bird: check the tracking mode on ACU Control before chasing the carrier.',
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
            question: 'AURORA-7 is a legacy satellite with an inclined orbit, and the antenna is in program-track mode. Why might that cause tracking problems?',
            options: [
              'Inclined orbits require step-track to follow satellite drift - program-track cannot compensate',
              'Program-track is only valid for LEO satellites - a GEO bird needs step-track regardless of orbit',
              'The antenna motors are too slow for program-track - step-track moves the dish in smaller steps',
              'Program-track needs manual polarization updates - step-track adjusts polarization on its own',
            ],
            correctIndex: 0,
            explanation:
              'AURORA-7 has stopped north-south station-keeping, so its orbit has become inclined and the satellite traces a figure-8 pattern in the sky. Program-track follows predicted positions, while step-track actively hunts for the signal peak, which a drifting satellite needs.',
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
      description: 'Watch the beacon on the RX Analysis spectrum analyzer and confirm that step-track holds beacon lock for 10 seconds with the beacon visible.',
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
          // Watched, not timed from arrival: the lock must hold for 10 s while
          // the player is on RX Analysis (s08 obj 12, phase 27)
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Held for 10 s',
          params: { requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 10 },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Visible',
          params: {
            signalId: 'AURORA-7-Beacon',
            minPower: -95 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
            observationDwellSeconds: 5,
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
      description: 'A weather alert has come in from the forecast service. Assess the situation and decide on appropriate action.',
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
            question:
              "The weather service reports freezing rain expected in 2 hours. Step-track now holds beacon lock, though RX 1 still drops the carrier every few seconds. What's the appropriate action?",
            options: [
              'Enable the feed heater now as a precaution and keep monitoring the link',
              'Stow the antenna now as a precaution and accept the link outage until it passes',
              'Call Dana now with the forecast and let her decide whether to stow or heat',
              'Ignore the alert because the rain is 2 hours out, and revisit when it starts',
            ],
            correctIndex: 0,
            explanation:
              "Turning on the feed heater now prevents ice from building up on the feed once the rain arrives. The antenna is holding the beacon and the rain is two hours out, so there's no need to stow yet, and the carrier dropouts are a separate fault to chase next. This isn't urgent enough to wake Dana at this hour, and waiting for the rain to start means ice could already be forming.",
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
      description: 'The customer still reports intermittent errors, so first confirm the antenna tracking is stable now that step-track is on.',
      groundStation: 'VT-01',
      intent: 'confirm',
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
          params: { requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Tracking Analysis',
          params: {
            character: Character.SYSTEM,
            question: 'The customer still reports intermittent errors, and the ACU shows stable step-track with beacon lock. What does that tell you?',
            options: [
              'The antenna is tracking properly - the intermittent issue is not caused by tracking problems',
              'The beacon frequency is drifting - the intermittent issue is caused by lock instability',
              'The polarization is misaligned - the inclined orbit needs a manual polarization adjustment',
              'Step-track is inadequate for AURORA-7 - the intermittent issue is the antenna hunting the peak',
            ],
            correctIndex: 0,
            explanation:
              'A stable beacon lock in step-track means the antenna is following the satellite correctly, so you can rule out tracking as the cause of the intermittent errors. The fault is somewhere else, and the receive and transmit paths are next to check.',
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
      title: 'Compare Beacon and Carrier',
      description:
        "Watch RX Analysis: the receiver modem listens to VT-01's own AURORA-7 carrier, relayed back down by the satellite. Compare it with the beacon under step-track.",
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
          type: 'signal-detected',
          description: 'Watched the RX Analysis Tab',
          params: { signalId: 'AURORA-7-Beacon', anyTuning: true, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 10 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'RX Path Analysis',
          params: {
            character: Character.SYSTEM,
            question:
              'The AURORA-7 beacon holds steady under step-track, but the receiver modem keeps losing our own carrier (NO LOCK / ACQUIRING every few seconds). What does that tell you?',
            options: [
              'The receive chain is healthy, so the carrier is dropping on the transmit side',
              'The LNB reference fault is back, so the receive chain is losing our carrier again',
              'Step-track is hunting, so the antenna keeps losing the satellite and our carrier',
              'Rain fade on the downlink is pushing the carrier below the lock threshold',
            ],
            correctIndex: 0,
            explanation:
              "The beacon and our carrier come down through the same antenna, feed and LNB, so a pointing, LNB or weather problem would hit the beacon too. A steady beacon with a carrier that drops every few seconds means our carrier isn't reaching the satellite consistently, so the fault is in our own transmit chain. VT-01's receiver hears its own uplink relayed by AURORA-7, which makes it a loopback through the satellite.",
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
      description: 'Open the TX Chain tab and look for an intermittent fault in the transmit path.',
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
            question: 'When you investigate an intermittent TX fault, which indicator shows evidence of the problem?',
            options: [
              'The modem Output Power display - it shows DROPOUT during fault periods',
              'The HPA reflected power readout - it climbs during the modem fault periods',
              'The BUC temperature readout - it spikes during each signal dropout',
              'The GPSDO holdover counter - it increments during each TX fault period',
            ],
            correctIndex: 0,
            explanation:
              'The TX modem Output Power display shows "DROPOUT" in red whenever an intermittent hardware fault interrupts the signal, which points straight at the source of the problem. The fault is in the modem, so the HPA, BUC and GPSDO readouts don\'t react to it.',
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
      description:
        "Take the faulted Modem 1 out of service: on its TX Chain tab, power it off, which clears its fault alarm. Then open the Modem 2 tab, where the spare is already powered and standing by. Don't start Modem 2 transmitting yet. It's still unconfigured, and it goes up through the loopback test first.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-tx-chain-status'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      // Phase 31 D14: selecting a modem tab is only a view, so the step grades
      // the real switch (Modem 1 off, Modem 2 on). Transmitting on Modem 2 is
      // graded by test-modem2-loopback, after the configure and loopback steps,
      // so no unconfigured carrier goes out through the HPA.
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-not-powered',
          description: 'Modem 1 Powered Off (Out of Service)',
          params: { equipment: 'transmitter', modemNumber: 1 },
          mustMaintain: true,
        },
        {
          // Modem 2 starts powered (the spare stands by), so its power is not
          // a row: the change the player makes is Modem 1 off. The tab row
          // puts the Modem 2 controls in front for the configure step.
          type: 'tx-active-modem',
          description: 'Modem 2 Tab Selected',
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
      description: 'Calculate the correct TX modem IF frequency for the AURORA-7 uplink on Modem 2.',
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
            question: 'The AURORA-7 uplink RF is 6053 MHz and the BUC LO is 7100 MHz. What TX IF frequency is required?',
            options: ['1047 MHz', '13153 MHz', '1043 MHz', '6000 MHz'],
            correctIndex: 0,
            explanation:
              'TX IF = BUC LO - RF = 7100 - 6053 = 1047 MHz. The LO sits above the uplink, so the BUC outputs the lower sideband and RF = LO - IF. Adding the two instead gives 13153 MHz, which uses the wrong sign for this BUC.',
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
      description: "Configure Modem 2 to match Modem 1's AURORA-7 settings: 1047 MHz, 24 MHz bandwidth, FEC 3/4 and -7 dBm power. The spare already runs QPSK.",
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
      description:
        "Before Modem 2 transmits, keep the faulted Modem 1 powered off, disable the HPA output, set the BUC gain to 15 dB and enable BUC loopback for safe testing. The BUC stays unmuted so the loop carries the signal. The loop couples the BUC output into the LNB about 66 dB down, and at tonight's 65 dB LNB gain the LNB compresses at about -55 dBm in. The standard 23 dB (-7 dBm drive, +16 dBm out, -50 dBm in) would overload it, while 15 dB puts -58 dBm in, 3 dB under.",
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
          type: 'equipment-not-powered',
          description: 'Modem 1 Powered Off (Out of Service)',
          params: { equipment: 'transmitter', modemNumber: 1 },
          mustMaintain: true,
        },
        {
          // Phase 28 D3: the loop keeps the 66 dB coupler and the LNB's input
          // compression. LNB gain 65 dB: input P1dB -55 dBm; at BUC 23 dB the
          // loop puts -50 dBm in (~3.4 dB compressed, "LNB input overload").
          // 15 dB: -58 dBm, ~0.2 dB (16 dB ~0.45; 17 dB trips the 0.5 dB alarm)
          type: 'buc-gain-set',
          description: 'BUC Gain Backed Off to 15 dB',
          params: {
            gain: 15 as dB,
            gainTolerance: 1 as dB,
          },
          mustMaintain: true,
        },
        {
          type: 'buc-loopback-enabled',
          description: 'BUC Loopback Enabled',
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
            question: 'Why must BUC loopback be enabled BEFORE a new modem starts transmitting?',
            options: [
              'To prevent accidental RF transmission through the HPA until the new modem is verified',
              'To reduce power consumption in the BUC and HPA until the new modem is verified',
              'To give the spectrum analyzer a cleaner signal to measure while the new modem is verified',
              'To let the new modem clock synchronize to the BUC before the HPA is engaged',
            ],
            correctIndex: 0,
            explanation:
              "With loopback on, the signal is routed back to the receiver for testing instead of going to the HPA and antenna, so nothing radiates until the new modem configuration is verified. Loopback isn't about power consumption, a cleaner measurement or clock synchronization.",
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
            question: "What does BUC loopback test that modem loopback doesn't?",
            options: [
              'The full signal path from modem through BUC, without engaging the HPA',
              'The HPA output stage and its power level, without radiating from the antenna',
              'The antenna pointing accuracy, without transmitting to the satellite',
              'The satellite transponder response, without the customer traffic loaded',
            ],
            correctIndex: 0,
            explanation:
              'BUC loopback tests the complete signal path from the modem through the BUC while keeping the HPA disengaged. That verifies the full low-power TX chain without radiating anything. The HPA stage, the antenna pointing and the satellite transponder are all outside the loop.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-loopback-signal',
      nice: ['T0153', 'K0740'],
      title: 'Verify Loopback Signal',
      description:
        "Find the loop carrier on RX Analysis with the LNB left at its normal 5250 MHz LO. The loop translator shifts the 6053 MHz uplink down by the satellite's 2225 MHz translation to 3828 MHz, which the LNB puts at 1422 MHz IF. Set the spectrum analyzer to center 1422 MHz with a 40 MHz span, Min Amplitude -100 dBm and Max Amplitude -30 dBm. On RX Analysis a carrier this clean reads Effective C/N well under Raw C/N. The grey ceiling line (about 40 dB) is the converter's own limit, not a fault.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['test-modem2-loopback'],
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
          // Phase 28 D3 (nats-r3-s08-F1): loop translator, normal LNB LO:
          // 6053 - 2225 = 3828 MHz RF, 5250 - 3828 = 1422 MHz IF
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1422 MHz',
          params: {
            centerFrequency: 1422e6 as Hertz,
            centerFrequencyTolerance: 5e6,
          },
          mustMaintain: true,
        },
        {
          // The 24 MHz carrier is invisible at the beacon span (nats-s08-F10)
          type: 'speca-span-set',
          description: 'Span 40 MHz',
          params: {
            span: 40e6 as Hertz,
            spanTolerance: 15e6,
          },
          mustMaintain: true,
        },
        {
          // The beacon step leaves -120/-60. The AGC holds its output at
          // -30 dBm total, so the 24 MHz loopback carrier reads ~-53 dBm in
          // the 100 kHz auto RBW (~-44 dBm while the AGC rails at min gain on
          // an uncoupled loop): it needs a window up to -30 (phase 27)
          type: 'speca-max-amplitude',
          description: 'Max Amplitude -30 dBm',
          hint: 'Raise Max Amp to -30 dBm: the loopback carrier is far stronger than the beacon you were just looking at.',
          params: {
            maxAmplitude: -30 as dBm,
            maxAmplitudeTolerance: 5 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude -100 dBm',
          hint: 'Set Min Amp to -100 dBm.',
          params: {
            minAmplitude: -100 as dBm,
            minAmplitudeTolerance: 5 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Loopback Signal Verified',
          params: {
            character: Character.SYSTEM,
            question: 'What do you see on the spectrum analyzer in this window?',
            options: [
              'A 24 MHz wide modulated carrier at 1422 MHz - Modem 2 through the BUC and the test loop',
              'A narrow CW spike at 1422 MHz - the BUC LO leaking through the loop',
              'Nothing but the noise floor - the loop carrier only shows with the LNB LO retuned to the BUC LO',
              'The AURORA-7 beacon at 1422 MHz - the loop only proves the receive side',
            ],
            correctIndex: 0,
            explanation:
              "The loop carrier is a 24 MHz modulated carrier at 1422 MHz. TX IF 1047 MHz goes up to 6053 MHz RF through the 7100 MHz BUC LO, down 2225 MHz in the loop translator to 3828 MHz, and then to 1422 MHz IF through the normal 5250 MHz LNB LO. That's AURORA-7's TP-1 slot, where our own downlink sits once we're live, and the beacon stays at 1085 MHz. Modem 2 and the BUC are working.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 10: UPLINK ENABLE (Scenario 2 Power Sequencing)
    // ============================================================
    {
      id: 'disable-loopback-prepare-uplink',
      nice: ['S0421', 'T1567'],
      title: 'Prepare for Live Uplink',
      description:
        'Disable loopback mode and set the BUC gain back to the standard 23 dB (at 15 dB the HPA would be 8 dB short of drive). The BUC stays unmuted for the HPA enable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-loopback-signal'],
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
        {
          type: 'buc-gain-set',
          description: 'BUC Gain Back to 23 dB',
          params: {
            gain: 23 as dB,
            gainTolerance: 0.5 as dB,
          },
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
      description: 'Enable the HPA output stage. It stayed powered during the loopback test, and only its output was off.',
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
      description:
        "Confirm the AURORA-7 link is fully operational. Modem 2's carrier should be up, the receiver should hold steady lock on it with no more dropouts, and the Dashboard should show no warning or critical alarms.",
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
            // nats-r3-s08-F3: the receiver on our own carrier is the end-to-end proof
            options: [
              'No warning or critical alarms on Dashboard',
              'Antenna in step-track with beacon lock',
              'HPA enabled and BUC unmuted',
              'Receiver holding steady lock on our own carrier',
              'All of the above',
            ],
            correctIndex: 4,
            explanation:
              "A fully operational link shows no Dashboard warning or critical alarms, and Modem 1's fault alarm cleared when you took it out of service. It shows the antenna tracking with beacon lock (step-track for the inclined orbit) and an active TX chain (HPA enabled, BUC unmuted). It also shows the receiver holding steady lock on Modem 2's carrier, relayed back down by AURORA-7, where Modem 1's dropouts used to knock the lock off. That last one is the end-to-end proof, because our carrier went up, through the satellite and back. Every one of those conditions must be met, so the answer is all of the above.",
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
              'LNB reference unlock, program-track drift, Modem 1 fault; fixed by LNB power cycle, step-track, Modem 2',
              'HPA output fault, program-track drift, Modem 1 fault; fixed by HPA tube swap, step-track, Modem 2',
              'Freezing rain fade, LNB reference unlock, feed icing; fixed by feed heater, LNB power cycle, backup station',
              'Customer modem fault, program-track drift, GPSDO holdover; fixed by customer reset, step-track, GPSDO restart',
            ],
            correctIndex: 0,
            explanation:
              "The customer's intermittent connectivity had three causes. The LNB reference unlock degraded receive quality, program-track couldn't follow AURORA-7's inclined-orbit drift, and TX Modem 1 had an intermittent hardware fault. You fixed all three without waking Dana or escalating, and the feed heater was a precaution against the rain, not part of the root cause.",
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
        <em>[Text message from Dana at 2:03 AM]</em>
      </p>
      <p>
        "Hey - just got a trouble ticket. Customer reports intermittent connectivity on AURORA-7, signal dropouts every few seconds. I'm on-call but heading back to sleep. You've got this."
      </p>
      <p>
        "Charlie's out of state visiting family. Call me only if it's a genuine emergency. Good luck."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/8/intro.mp3'),
    },
    objectivesOnStart: {
      // nats-s08-F13: the objective promised an alert that never appeared
      'weather-alert-decision': {
        text: `
        <p>
          <em>[Text message from Dana, forwarding the NWS winter weather alert]</em>
        </p>
        <p>
          "Weather alert just pinged my phone. There's freezing rain headed for the site in about 2 hours, with 0.1 to 0.3 inches of accumulation and temps falling to 22. It's your call. I'm going back to sleep."
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/8/obj-weather-alert-decision.mp3'),
      },
    },
    objectives: {
      'final-summary': {
        text: `
        <p>
          <em>[Text message from Dana]</em>
        </p>
        <p>
          "I saw the ticket resolution come through. You caught the LNB reference issue and the tracking mode problem, and switching to Modem 2 was a good call. You handled it right, and there was no need to wake me for that."
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
