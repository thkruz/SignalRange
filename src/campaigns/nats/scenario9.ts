import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite, tidemark3Satellite } from './satellites';

/**
 * NATS Level 9: "Morning Rounds"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 1 of 8)
 * Time Pressure: None (routine work, per-objective timers only)
 * Calculation Required: NO - this is routine verification
 * New UI Elements: None - this is a "qualified operator" scenario reusing
 *   mechanics learned in S1-S8 without introducing anything new.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - S0421: Skill in operating network equipment
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K1032: Knowledge of satellite-based communication systems and software
 *
 * Premise: First qualified shift after the S8 night-shift solo evaluation.
 * Normal morning rounds across three TIDEMARK birds: VT-01 carrying TIDEMARK-1,
 * ME-02 carrying TIDEMARK-2 (operational since the S3 weather handover), and
 * a quick verification spot-check on the newly commissioned TIDEMARK-3 using
 * VT-01's antenna while TM-1 traffic is briefly handed to a sister teleport.
 *
 * Tone: Player is qualified. No instructional dialog. Dialog is limited to
 * a brief intro text from Dana, three short phase-transition check-ins, and
 * a sign-off. Every quiz uses Character.SYSTEM (no audio).
 *
 * Story Continuity:
 *   - Charlie has transferred to Europe (gone since shortly after S8).
 *   - Dana Torres is now the primary on-site supervisor.
 *   - ME-02 fully operational since S3.
 *   - TIDEMARK-3 was commissioned overnight by another crew.
 */

export const scenario9Data: ScenarioData = {
  id: 'nats-scenario9',
  prerequisiteScenarioIds: ['nats-level-8-night-shift'],
  url: 'nats/scenarios/nats-scenario9',
  imageUrl: 'nats/9/card.png',
  number: 9,
  title: 'Morning Rounds',
  subtitle: 'Multi-Satellite Health Check',
  duration: '20-25 min',
  difficulty: 'intermediate',
  missionType: 'Routine Operations',
  description: `First qualified shift. Three birds to check this morning: TIDEMARK-1 from Vermont, TIDEMARK-2 from Maine, and a spot-check on the newly commissioned TIDEMARK-3.<br><br>Standard morning rounds - verify each link is healthy, log any anomalies, move on. The overnight commissioning crew brought TIDEMARK-3 online a few hours ago; the only thing on your list is a quick beacon verification before our customers start lighting it up.<br><br>No drama today. Just routine.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Operational',
  ],
  timeLimitSeconds: 25 * 60, // 25 minutes
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: healthy, tracking TIDEMARK-1, default morning-shift state
      {
        ...vermontGroundStation,
      },
      // ME-02: operational, tracking TIDEMARK-2 (clone Vermont's RF chain for matching LO)
      {
        id: 'ME-02',
        name: 'Maine Ground Station',
        isOperational: true,
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            isPowered: true,
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            polarization: -25 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526, // TIDEMARK-2
            targetAzimuth: 219.7 as Degrees,
            targetElevation: 26.3 as Degrees,
            targetPolarization: -25 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 1070e6 as Hertz, // 5250 LNB LO - 4180 beacon RF
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // Inherits VT-01 LNB LO 5250 MHz so the TM-2 beacon lands at 1070 MHz IF
            // Maine TX is muted - we're not transmitting from ME-02 in this scenario
            buc: { isMuted: true },
            hpa: { isHpaEnabled: false, isHpaSwitchEnabled: false },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            centerFrequency: 1070e6 as Hertz, // Tuned to TM-2 beacon IF
            span: 2e3 as Hertz,
            rbw: 1e3 as Hertz,
            minAmplitude: -95 as dBm,
            maxAmplitude: -75 as dBm,
            scaleDbPerDiv: 10 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          },
        ],
        transmitters: [],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      tidemark1Satellite,
      tidemark2Satellite,
      tidemark3Satellite,
      ses10Satellite,
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-9?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Shift Brief',
      description: 'Open the shift brief and acknowledge you are ready to start rounds.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Begin Rounds',
          params: {
            character: Character.SYSTEM,
            question: 'Have you reviewed the shift brief and are you ready to begin morning rounds?',
            options: ['Yes, brief reviewed. Starting rounds.'],
            correctIndex: 0,
            explanation: 'Shift clock started. Three birds on the list.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: VT-01 / TIDEMARK-1 MORNING CHECK
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
      id: 'vt-dashboard-check',
      nice: ['T0153', 'K0741'],
      title: 'VT-01 Dashboard Sweep',
      description: 'Check the Dashboard for active alarms.',
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
          description: 'Confirm Alarm Status',
          params: {
            character: Character.SYSTEM,
            question: 'What is the active alarm state on VT-01?',
            options: [
              'No active alarms - all systems nominal',
              'BUC high current draw',
              'LNB reference unlocked',
              'HPA output fault',
            ],
            correctIndex: 0,
            explanation: 'Clean board on the primary station. Moving on to timing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'vt-gpsdo-spot-check',
      nice: ['T0431', 'K0740'],
      title: 'VT-01 GPSDO Spot Check',
      description: 'Verify the GPSDO is locked and providing a stable reference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-dashboard-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'GPS Timing Open',
          params: { tab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'GPSDO Confirmation',
          params: {
            character: Character.SYSTEM,
            question: 'What does the GPSDO lock indicator confirm?',
            options: [
              'Stable 10 MHz reference available to all downstream RF equipment',
              'GPS receiver is searching for satellites',
              'External reference is in holdover',
              'GPSDO is powered off',
            ],
            correctIndex: 0,
            explanation: 'Reference is stable. RX/TX chains can trust their frequencies.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'vt-rx-beacon-check',
      nice: ['T0153', 'K1032', 'K0773'],
      title: 'VT-01 RX Chain Spot Check',
      description: 'Confirm the TIDEMARK-1 beacon is present and the receiver is locked with good C/N.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-gpsdo-spot-check'],
      timeLimitSeconds: 2 * 60,
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
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'vt-tx-hpa-check',
      nice: ['T0431', 'K0740'],
      title: 'VT-01 TX Chain Spot Check',
      description: 'Verify the HPA is enabled and operating with proper backoff.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-rx-beacon-check'],
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
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Operating Limits',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'HPA Backoff Understanding',
          params: {
            character: Character.SYSTEM,
            question: 'What does the 10 dB HPA backoff during routine ops indicate?',
            options: [
              'Standard operating margin - reduces stress on the amplifier',
              'HPA is faulted and limiting itself',
              'Customer requested low power',
              'Output stage saturated and clipping',
            ],
            correctIndex: 0,
            explanation: 'Headroom is the goal. No drama on TIDEMARK-1.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: ME-02 / TIDEMARK-2 HEALTH CHECK (PASSIVE)
    // ============================================================
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Switch to the Maine Ground Station.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['vt-tx-hpa-check'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected',
          params: { groundStationId: 'ME-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-dashboard-check',
      nice: ['T0153', 'K0741'],
      title: 'ME-02 Dashboard Sweep',
      description: 'Check the Maine Dashboard for active alarms.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
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
          description: 'ME-02 Alarm Status',
          params: {
            character: Character.SYSTEM,
            question: 'What is the alarm state on ME-02?',
            options: [
              'No active alarms - station nominal',
              'Antenna tracking lost',
              'GPSDO holdover',
              'LNB over-temperature',
            ],
            correctIndex: 0,
            explanation: 'Maine is clean. Catherine has the station in good shape.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-rx-beacon-check',
      nice: ['T0153', 'K1032', 'K0773'],
      title: 'ME-02 TIDEMARK-2 Beacon Check',
      description: 'Verify the TIDEMARK-2 beacon is present on the spectrum analyzer and the LNB is thermally stable.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-dashboard-check'],
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
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: { equipment: 'lnb', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-2 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-2-Beacon',
            minPower: -100 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'me-verify-tracking',
      nice: ['K1032', 'T0431'],
      title: 'ME-02 Antenna Tracking Check',
      description: 'Confirm the Maine antenna is locked on TIDEMARK-2 in program-track.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-rx-beacon-check'],
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
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-2',
          params: { noradId: 61526, requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Tracking Mode for GEO',
          params: {
            character: Character.SYSTEM,
            question: 'Why is program-track the appropriate mode for TIDEMARK-2 right now?',
            options: [
              'GEO satellite holding station - ephemeris is accurate enough; no need to hunt the beacon',
              'Step-track is unavailable on ME-02 hardware',
              'Program-track uses less antenna motion which extends motor life',
              'TIDEMARK-2 is in an inclined orbit and requires program-track',
            ],
            correctIndex: 0,
            explanation: 'For a healthy GEO bird with good TLE, program-track is the right default. Save step-track for inclined birds like AURORA-7.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'me-tx-payload-spot',
      nice: ['T0153', 'K0740'],
      title: 'ME-02 Customer Traffic Indicator',
      description: 'Verify your understanding of how to spot-check downlink data integrity from the dashboard.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-tracking'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Payload Health Indicators',
          params: {
            character: Character.SYSTEM,
            question: 'On a routine spot check, which combination of indicators confirms the downlink data path is healthy?',
            options: [
              'Frame sync locked + CRC valid + FEC engaged (Reed-Solomon active, no uncorrectables)',
              'High RX power alone is sufficient - if power is good, data is good',
              'Antenna beacon lock is sufficient confirmation of data integrity',
              'Modem temperature within range proves the data path is healthy',
            ],
            correctIndex: 0,
            explanation: 'Beacon lock proves the RF path. Frame sync + CRC + FEC prove the data path. Different layers, different evidence.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 3: TIDEMARK-3 VERIFICATION ON VT-01
    // ============================================================
    {
      id: 'switch-to-vermont',
      nice: ['S0421'],
      title: 'Return to VT-01',
      description: 'Switch back to the Vermont Ground Station for the TIDEMARK-3 spot check.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['me-tx-payload-spot'],
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
      id: 'repoint-to-tidemark3',
      nice: ['S0421', 'K1032', 'T1567'],
      title: 'Repoint VT-01 to TIDEMARK-3',
      description: 'Command program-track to TIDEMARK-3 (NORAD 61527) at Az 140.5°, El 37.8°. TM-1 traffic is briefly handed to the sister teleport for this check.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-vermont'],
      timeLimitSeconds: 3 * 60,
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
          description: 'Program-Track Mode',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-3',
          params: { noradId: 61527 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tidemark3-beacon-acquire',
      nice: ['T0153', 'K0773', 'K1032'],
      title: 'TIDEMARK-3 Beacon Verification',
      description: 'Tune the spectrum analyzer to the TIDEMARK-3 beacon IF (1078 MHz) and confirm the beacon is present.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-to-tidemark3'],
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
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1078 MHz IF',
          params: {
            centerFrequency: 1078e6 as Hertz,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-3 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-3-Beacon',
            minPower: -100 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tidemark3-beacon-quality',
      nice: ['K0773', 'K1032'],
      title: 'Interpret TIDEMARK-3 Beacon',
      description: 'Confirm what a clean beacon at 1078 MHz IF tells you about TIDEMARK-3.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tidemark3-beacon-acquire'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon Significance',
          params: {
            character: Character.SYSTEM,
            question: 'TIDEMARK-3 beacon RF is 4172 MHz. With VT-01 LNB LO at 5250 MHz, seeing the beacon at 1078 MHz IF confirms what?',
            options: [
              'Antenna pointing is correct AND LNB LO is set correctly (5250 - 4172 = 1078)',
              'Only the antenna pointing - LO has no effect on where the beacon appears',
              'Only the LO - antenna pointing is verified by separate means',
              'Nothing meaningful - any noise spike at 1078 would look like this',
            ],
            correctIndex: 0,
            explanation: 'Both have to be right. Wrong pointing = no signal. Wrong LO = signal at a different IF.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'return-to-tidemark1',
      nice: ['S0421', 'K1032'],
      title: 'Return VT-01 to TIDEMARK-1',
      description: 'Repoint program-track back to TIDEMARK-1 and retune the spectrum analyzer to the TM-1 beacon IF (1074.5 MHz).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tidemark3-beacon-quality'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Locked on TIDEMARK-1',
          params: { noradId: 61525 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1074.5 MHz IF',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SHIFT WRAP
    // ============================================================
    {
      id: 'final-alarm-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Final Alarm Sweep',
      description: 'Do a final dashboard sweep before logging the shift summary.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-to-tidemark1'],
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
          description: 'Three-Bird Health Summary',
          params: {
            character: Character.SYSTEM,
            question: 'Summarize the morning round result.',
            options: [
              'TIDEMARK-1 healthy, TIDEMARK-2 healthy, TIDEMARK-3 beacon verified - all three nominal',
              'TIDEMARK-1 degraded, TIDEMARK-2 nominal, TIDEMARK-3 offline',
              'TIDEMARK-1 nominal, TIDEMARK-2 not yet checked, TIDEMARK-3 verified',
              'All three birds in fault state',
            ],
            correctIndex: 0,
            explanation: 'Clean round. Log it and move on.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-shift-summary',
      nice: ['K0645', 'T0153'],
      title: 'Log Shift Summary',
      description: 'Select the correct entry for the shift log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-alarm-sweep'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which line correctly records this shift in the operations log?',
            options: [
              '0700 - Morning rounds complete. VT-01/TM-1, ME-02/TM-2, TM-3 beacon verified via VT-01 spot-check. No anomalies.',
              '0700 - Morning rounds incomplete. TM-3 spot-check deferred.',
              '0700 - Multiple alarms cleared. See trouble ticket.',
              '0700 - Antenna swap performed VT-01 to ME-02.',
            ],
            correctIndex: 0,
            explanation: 'Routine work logged routinely. Next operator picks up with full context.',
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
        <em>[Text message from Dana at 06:42]</em>
      </p>
      <p>
        "Welcome to your first qualified shift. Three birds today - TM-1, TM-2, TM-3. Overnight commissioning crew brought TM-3 up a few hours ago; just need a beacon spot-check before customers light it up. Standard morning rounds. Coffee's in the kitchen."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/9/intro.mp3'),
    },
    objectives: {
      'select-maine-station': {
        text: `
        <p>
          VT-01 looks clean. Catherine's run Maine since the handover stuck - shouldn't be anything to surprise you over there.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-select-maine-station.mp3'),
      },
      'switch-to-vermont': {
        text: `
        <p>
          Maine confirmed nominal. Sister teleport is taking TM-1 customer traffic for the next few minutes while you spot-check TM-3. No transmit needed - just a beacon look. Antenna's yours.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-switch-to-vermont.mp3'),
      },
      'return-to-tidemark1': {
        text: `
        <p>
          TM-3 looks clean. Bring VT-01 back to TM-1 and we'll pull customer traffic back. Sister teleport's been notified.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-return-to-tidemark1.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          That's the morning. Routine work logged routinely. Welcome to qualified ops - this is what most days look like.
        </p>
        <p>
          See you tomorrow.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-log-shift-summary.mp3'),
      },
    },
  },
};
