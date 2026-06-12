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
 * NATS Level 10: "Customer Pass"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 2 of 8)
 * Time Pressure: Light (per-objective timers only; the "pass window" is narrative)
 * Calculation Required: NO - frequencies pre-configured by previous shift
 * New UI Elements: None - reuses S6 step-track and S2/S4 HPA backoff mechanics
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0478: Skill in providing customer support
 *   - T1580: Monitor client-level computer system performance
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0740: Knowledge of system performance indicators
 *   - S0675: Skill in optimizing system performance
 *
 * Premise: SeaLink (Marcus Chen, Halifax) has booked a 30-minute high-priority
 * data window on AURORA-7. The link is already up from the previous shift on
 * program-track with conservative HPA backoff. For the pass window the operator
 * needs to: switch to step-track for stable beacon hold on the inclined orbit,
 * verify the customer downlink is clean, optimize HPA backoff for more EIRP
 * without overdriving, monitor sustained margin while Marcus watches the link
 * live, then restore conservative settings when the pass closes.
 *
 * Tone: Qualified-operator. Dana introduces by text. Marcus Chen speaks at
 * pre-pass, mid-pass (mid-window throughput acknowledgment), and post-pass.
 * Dana signs off. All quizzes use Character.SYSTEM.
 *
 * Story Continuity:
 *   - First scenario with an active customer voice during operations (S4 was
 *     bracketing only).
 *   - AURORA-7 still aging; same inclined-orbit behavior as S6/S8.
 *   - BUC LO 7500 MHz + TX IF 1447 MHz matches the S6 convention so the
 *     player isn't asked to re-derive frequencies mid-customer-pass.
 *
 * Technical Reference (AURORA-7):
 *   - LNB LO: 5250 MHz → Beacon IF 1085 MHz, Downlink IF 1422 MHz
 *   - BUC LO: 7500 MHz → TX IF 1447 MHz (matches S6 convention)
 *   - Bandwidth: 24 MHz
 */

export const scenario10Data: ScenarioData = {
  id: 'nats-scenario10',
  prerequisiteScenarioIds: ['nats-scenario9'],
  url: 'nats/scenarios/nats-scenario10',
  imageUrl: 'nats/10/card.png',
  number: 10,
  title: 'Customer Pass',
  subtitle: 'High-Throughput Window on AURORA-7',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Customer Operations',
  description: `SeaLink has booked a 30-minute high-priority data window on AURORA-7 - a routine maritime synchronization burst Marcus Chen in Halifax is watching live from the spacecraft side. The link is up from the overnight shift on program-track with a conservative 10 dB HPA backoff.<br><br>For a sustained high-throughput window on an inclined-orbit bird, that's not the right configuration. You need step-track to hold beacon stable through the figure-8 drift, and a tighter HPA backoff to give the customer the EIRP margin they're paying for - without overdriving the amp.<br><br>Customer is on the line. Marcus will be watching payload telemetry on his end throughout the pass. Standard work - just don't break the link with a customer watching.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
  ],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            // Antenna on AURORA-7 in program-track. Beacon lock marginal due to
            // inclined-orbit drift - step-track is required for sustained pass.
            isPowered: true,
            azimuth: 190 as Degrees,
            elevation: 32 as Degrees,
            polarization: 0 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 28899, // AURORA-7
            targetAzimuth: 190 as Degrees,
            targetElevation: 32 as Degrees,
            targetPolarization: 0 as Degrees,
            slewing: false,
            beaconCN: 6.5 as dB, // Marginal under program-track drift
            beaconFrequencyHz: 1085e6 as Hertz, // AURORA-7 beacon IF (5250 - 4165)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 65 as dB,
              isExtRefLocked: true,
            },
            buc: {
              isPowered: true,
              isMuted: false, // Uplink live - SeaLink return path
              isLoopback: false,
              loFrequency: 7500 as MHz, // Matches S6 AURORA-7 convention
              isExtRefLocked: true,
              gain: 23 as dB,
            },
            hpa: {
              isPowered: true,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
              backOff: 10, // Conservative - player optimizes to ~6 dB for pass
              outputPower: 50 as dBm,
              isOverdriven: false,
              gain: 44 as dB,
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
            // Pre-tuned on AURORA-7 beacon at 1085 MHz IF
            centerFrequency: 1085e6 as Hertz,
            span: 100e3 as Hertz,
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
                frequency: 1422 as MHz, // AURORA-7 downlink IF (5250 - 3828)
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
            activeModem: 1,
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                modem_number: 1,
                isTransmitting: true,
                isTransmittingSwitchUp: true,
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'AURORA-7-Uplink',
                  noradId: 28899,
                  frequency: 1447e6 as IfFrequency, // 7500 - 6053
                  bandwidth: 24e6 as Hertz,
                  modulation: 'QPSK' as ModulationType,
                  fec: '3/4' as FECType,
                  origin: SignalOrigin.TRANSMITTER,
                  power: -7 as dBm,
                },
              },
            ],
          },
        ],
      },
    ],
    satellites: [aurora7Satellite, tidemark1Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-10?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Customer Pass Brief',
      description: 'Open the pass brief and acknowledge the SeaLink window.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Acknowledge Pass Window',
          params: {
            character: Character.SYSTEM,
            question: 'Ready to take the SeaLink high-throughput pass on AURORA-7?',
            options: ['Yes - link is up on program-track. Switching to pass configuration.'],
            correctIndex: 0,
            explanation: 'Pass clock running. Customer is on the line.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: PRE-PASS TRACKING SETUP
    // ============================================================
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Select the Vermont Ground Station.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
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
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Pre-Pass Alarm Sweep',
      description: 'Check the Dashboard for active alarms before the customer window opens.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Confirm Alarm State',
          params: {
            character: Character.SYSTEM,
            question: 'What is the alarm state on VT-01 going into the pass?',
            options: [
              'No active alarms - clean board, link up on AURORA-7',
              'LNB reference unlocked',
              'HPA output fault',
              'GPSDO holdover',
            ],
            correctIndex: 0,
            explanation: 'Clean board. Safe to push the link harder for the customer window.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'why-step-track',
      nice: ['K1032', 'K0773'],
      title: 'Confirm Tracking Mode for the Pass',
      description: 'Choose the right tracking strategy for a 30-minute sustained pass on AURORA-7.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Pick the Tracking Mode',
          params: {
            character: Character.SYSTEM,
            question: 'AURORA-7 is on program-track right now. Why is that wrong for a 30-minute high-throughput window?',
            options: [
              'Inclined orbit drift will degrade C/N across the pass - step-track holds beacon optimum continuously',
              'Program-track consumes more antenna motor cycles than step-track over a long pass',
              'Program-track is only certified for TIDEMARK birds, not AURORA',
              'Step-track is required by the customer contract regardless of orbit type',
            ],
            correctIndex: 0,
            explanation: 'Program-track follows ephemeris and lets the figure-8 drift bleed off C/N. For a sustained pass on an inclined bird, step-track keeps the beacon at peak.',
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
      nice: ['S0421', 'K1032'],
      title: 'Switch to Step-Track',
      description: 'Command the antenna into step-track mode.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['why-step-track'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Active',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-stable-beacon',
      nice: ['T0153', 'K1032'],
      title: 'Acquire Stable Beacon Lock',
      description: 'Hold beacon lock under step-track long enough to confirm stable peak.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-step-track'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Sustained',
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: CUSTOMER LINK VERIFICATION
    // ============================================================
    {
      id: 'verify-rx-lock',
      nice: ['T0153', 'T1580', 'K0740'],
      title: 'Verify Customer Downlink',
      description: 'Confirm the AURORA-7 downlink modem is locked with C/N margin for the pass.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-stable-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'payload-integrity-check',
      nice: ['T1580', 'K0740'],
      title: 'Payload Data Integrity',
      description: 'Confirm the indicators that prove the customer payload path is clean.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-lock'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Payload Health Indicators',
          params: {
            character: Character.SYSTEM,
            question: 'Marcus wants confirmation his payload telemetry is clean. Which indicator set proves the data path is healthy end-to-end?',
            options: [
              'Frame sync locked + CRC valid + FEC engaged with no uncorrectables',
              'Receive power above -70 dBm alone',
              'Antenna beacon lock alone',
              'Modem temperature inside spec',
            ],
            correctIndex: 0,
            explanation: 'Beacon lock proves RF. Frame sync + CRC + FEC prove the data path. Different layers, different evidence - the customer cares about the data path.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-uplink-active',
      nice: ['T0431', 'K0740'],
      title: 'Verify Uplink Return Path',
      description: 'Confirm the uplink (BUC unmuted, HPA enabled, no overdrive) is carrying the SeaLink return traffic.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['payload-integrity-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not Overdriven',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: HPA BACKOFF OPTIMIZATION FOR THE PASS
    // ============================================================
    {
      id: 'assess-current-backoff',
      nice: ['S0675', 'K0740'],
      title: 'Assess Current HPA Backoff',
      description: 'Evaluate the HPA backoff that the link inherited from the overnight shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-uplink-active'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Backoff Assessment',
          params: {
            character: Character.SYSTEM,
            question: 'HPA is at 10 dB backoff. For a 30-minute customer window with sustained margin requirement, what is the operational reality?',
            options: [
              'Safe but conservative - tighter backoff gives the customer more EIRP without breaking the amp',
              'Already optimal - never lower backoff below 10 dB for any customer pass',
              'Too aggressive - raise backoff to 15 dB before the pass',
              'Backoff is irrelevant; only HPA output power matters',
            ],
            correctIndex: 0,
            explanation: '10 dB is a quiet-night default. For a paying customer expecting sustained margin, 6-7 dB buys real EIRP - so long as the amp stays linear.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'optimize-hpa-backoff',
      nice: ['S0675', 'S0421'],
      title: 'Tighten HPA Backoff for the Pass',
      description: 'Reduce HPA backoff to 6 dB to give the customer more EIRP during the pass window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assess-current-backoff'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-back-off-set',
          description: 'Backoff: 6 dB',
          params: { backOff: 6, backOffTolerance: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-no-overdrive',
      nice: ['T0153', 'S0675'],
      title: 'Confirm HPA Stays Linear',
      description: 'Verify the HPA is not overdriven after the backoff change.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['optimize-hpa-backoff'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not Overdriven',
          mustMaintain: true,
          maintainDuration: 10,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'imd-tradeoff-check',
      nice: ['K0740', 'S0675'],
      title: 'Acknowledge the IMD Tradeoff',
      description: 'Confirm the operational tradeoff between EIRP and amplifier linearity.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-no-overdrive'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'EIRP vs Linearity',
          params: {
            character: Character.SYSTEM,
            question: 'Lowering backoff from 10 dB to 6 dB increases EIRP. What is the tradeoff to watch during a sustained pass?',
            options: [
              'IMD products rise as the amp moves closer to saturation - monitor for overdrive across the window',
              'Backoff has no effect on intermodulation distortion',
              'Lower backoff cools the amp because gain is lower',
              'EIRP and IMD are independent and can be optimized separately',
            ],
            correctIndex: 0,
            explanation: 'Closer to saturation means more IMD. The decision is to spend a small amount of linearity for meaningful EIRP - then watch for overdrive across the window.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 4: SUSTAINED MARGIN MONITORING
    // ============================================================
    {
      id: 'sustain-rx-margin',
      nice: ['T1580', 'T0153'],
      title: 'Sustain Customer Downlink Margin',
      description: 'Hold receive C/N above the customer threshold for the pass window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['imd-tradeoff-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Held Above 9 dB',
          params: { modemNumber: 1, minCNRatio: 9 },
          mustMaintain: true,
          maintainDuration: 30,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'sustain-beacon-track',
      nice: ['K1032', 'T0153'],
      title: 'Sustain Step-Track Through the Pass',
      description: 'Beacon stays locked under step-track as the satellite drifts.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sustain-rx-margin'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Stays Locked',
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Held',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 5: PASS CLOSE
    // ============================================================
    {
      id: 'restore-conservative-backoff',
      nice: ['S0421', 'S0675'],
      title: 'Restore Conservative Backoff',
      description: 'Pass window has closed. Return HPA backoff to the 10 dB resting value to reduce stress between passes.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sustain-beacon-track'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-back-off-set',
          description: 'Backoff: 10 dB',
          params: { backOff: 10, backOffTolerance: 1 },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Healthy',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'final-pass-snapshot',
      nice: ['T1580', 'S0478'],
      title: 'Final Pass Disposition',
      description: 'Summarize what the customer received during the window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['restore-conservative-backoff'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Pass Summary',
          params: {
            character: Character.SYSTEM,
            question: 'Which line is the right disposition to give Marcus for the pass?',
            options: [
              'AURORA-7 pass complete - step-track held throughout, C/N margin sustained, no overdrive events, HPA returned to 10 dB',
              'Pass aborted - step-track failed to acquire',
              'Pass complete but link was on program-track the whole time',
              'Pass complete - HPA was overdriven briefly mid-window',
            ],
            correctIndex: 0,
            explanation: 'Clean delivery. That is what the customer is paying for - and what gets logged.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-customer-pass',
      nice: ['K0645', 'S0478'],
      title: 'Log the Customer Pass',
      description: 'Select the correct shift-log entry for the SeaLink window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-pass-snapshot'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly records this pass in the operations log?',
            options: [
              'SeaLink 30-min high-priority pass on AURORA-7 - step-track engaged, HPA optimized to 6 dB backoff for window then restored to 10 dB. C/N margin sustained, no link events.',
              'AURORA-7 routine monitoring - no customer impact.',
              'SeaLink pass deferred - link not ready.',
              'AURORA-7 HPA fault during customer window.',
            ],
            correctIndex: 0,
            explanation: 'Capture what changed (backoff), what was sustained (margin), and what was restored (resting state). Next operator picks up with full context.',
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
        <em>[Text message from Dana at 09:48]</em>
      </p>
      <p>
        "SeaLink booked a 30-minute high-priority window on AURORA-7 starting at 10:00. Marcus from Halifax is on the line - he'll be watching payload telemetry live. Link's up on program-track from the overnight shift, but you'll want step-track for the pass and a tighter HPA backoff. Standard work. Don't break it with a customer watching."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/10/intro.mp3'),
    },
    objectives: {
      'why-step-track': {
        text: `
        <p>
          Marcus here from Halifax. We're spun up on our end - payload's nominal, watching the spacecraft side telemetry now. Customer's expecting clean throughput from 10:00 to 10:30 sharp.
        </p>
        <p>
          Whenever you've got the ground side in pass configuration, give me a wave and I'll start watching the inbound.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/10/obj-why-step-track.mp3'),
      },
      'sustain-rx-margin': {
        text: `
        <p>
          Beauty. Payload telemetry's locked on our end - frame sync solid, no FEC uncorrectables, link's coming through clean. The C/N's holding right where we want it.
        </p>
        <p>
          Keep doing what you're doing. I'll let you know when the customer's twenty-eight minutes are up.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/10/obj-sustain-rx-margin.mp3'),
      },
      'sustain-beacon-track': {
        text: `
        <p>
          That's the window. Pass closed at 10:30 on our side - customer's confirmed the data, telemetry shows a clean delivery, no dropouts. Nicely done.
        </p>
        <p>
          Bring the amp back to resting and I'll send the disposition through to SeaLink ops. Thanks, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/10/obj-sustain-beacon-track.mp3'),
      },
      'log-customer-pass': {
        text: `
        <p>
          Marcus says clean. That's a paid pass logged with margin to spare. Get it in the book and take a breath.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/10/obj-log-customer-pass.mp3'),
      },
    },
  },
};
