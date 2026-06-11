import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
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
 * NATS Level 18: "Satellite Anomaly"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 2 of 8)
 * Time Pressure: Moderate - the drift grows while you decide
 * Calculation Required: NO
 * New Mechanic: a scenario-local DRIFTING variant of TIDEMARK-2 (same bird,
 *   same NORAD ID, same frequency plan - but with station-keeping suspended:
 *   inclined-orbit figure-8 drift and a stale ephemeris). First scenario where
 *   the satellite itself, not the ground segment, is the unknown.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T1314: Maintain network infrastructure
 *   - K0751: Knowledge of system threats
 *
 * Supporting Codes:
 *   - K0721: Knowledge of risk management principles and practices
 *   - T0153: Monitor network capacity and performance
 *   - S0593: Skill in handling incidents
 *
 * Premise: Halifax reports TIDEMARK-2's north-south station-keeping thrusters
 * are degraded and burns are suspended. Residual inclination is building - the
 * bird traces a growing daily figure-8 the stale ephemeris no longer predicts.
 * Program-track is bleeding C/N. The operator (covering ME-02) must recognize
 * the signature, transition to step-track, hold the link, and feed the
 * spacecraft team ground-side observations - while staying inside the ground
 * role: Halifax flies the vehicle; we keep the lock.
 *
 * Tone: Crisis-phase. Marcus is the primary voice (spacecraft side), Dana
 * provides incident support. All quizzes SYSTEM. 6 clips.
 *
 * Sim notes:
 *   - The drifting TM-2 variant replaces the roster TM-2 for this scenario
 *     only (same NORAD 61526; the canonical satellite is not in the list).
 *   - ephemerisError 0.18/0.12 deg: program-track holds a degraded link
 *     (~5 dB down) - bad enough to read, good enough to acquire from.
 */

const tidemark2DriftingSatellite = new Satellite(
  'TIDEMARK-2',
  61526,
  [
    {
      signalId: 'TIDEMARK-2-TDMA-Composite',
      serverId: 1,
      noradId: 61526,
      frequency: 6017e6 as RfFrequency,
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
  ],
  [],
  {
    az: 219.7 as Degrees,
    el: 26.3 as Degrees,
    rotation: -25 as Degrees,
    frequencyOffset: 2.225e9 as Hertz,
    // Stale ephemeris: station-keeping suspended, prediction no longer matches
    ephemerisErrorAz: 0.18 as Degrees,
    ephemerisErrorEl: 0.12 as Degrees,
    orbitType: 'geosynchronous',
    geosyncConfig: {
      minAz: 218.4 as Degrees, // Growing figure-8: ±1.3° and widening daily
      maxAz: 221.0 as Degrees,
      minEl: 25.0 as Degrees,
      maxEl: 27.6 as Degrees,
    },
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6017e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3792 MHz
        polarization: 'H',
        beacon: {
          frequency: 4180e6 as RfFrequency,
          signalId: 'TIDEMARK-2-Beacon',
          serverId: 1,
          noradId: 61526,
          power: 31 as dBm,
          bandwidth: 1e3 as Hertz,
          modulation: 'CW' as ModulationType,
          fec: 'null' as FECType,
          polarization: 'V',
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
      } as TransponderConfig,
      {
        id: 'TP-2',
        uplinkCenterFrequency: 5980e6 as RfFrequency,
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
      } as TransponderConfig,
    ],
  }
);

export const scenario18Data: ScenarioData = {
  id: 'nats-scenario18',
  prerequisiteScenarioIds: ['nats-scenario17'],
  url: 'nats/scenarios/nats-scenario18',
  imageUrl: 'nats/18/card.png',
  number: 18,
  title: 'Satellite Anomaly',
  subtitle: 'TIDEMARK-2 Station-Keeping Drift',
  duration: '30-35 min',
  difficulty: 'advanced',
  missionType: 'Anomaly Response',
  description: `Halifax called at 0850: TIDEMARK-2's station-keeping thrusters are degraded and north-south burns are suspended while the vehicle team investigates. Residual inclination is building - from Maine's dish the bird now traces a growing daily figure-eight that the published ephemeris no longer predicts.<br><br>Program-track follows the ephemeris. The ephemeris is wrong. You can watch the C/N bleed in real time.<br><br>You have flown an inclined bird before - AURORA-7 taught you everything this needs. The difference is that this time the satellite is the patient, the spacecraft team is the surgeon, and the ground operator's whole job is to keep the monitors attached: hold the lock, feed Halifax your track data, and know exactly where the ground role ends.`,
  equipment: [
    '9-meter C-band Antenna (ME-02)',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'Halifax vehicle status feed',
  ],
  timeLimitSeconds: 35 * 60,
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: standby on TIDEMARK-1, untouched this shift
      {
        ...vermontGroundStation,
      },
      // ME-02: carrying TIDEMARK-2, program-track degrading on the stale ephemeris
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
            targetSatelliteId: 61526,
            targetAzimuth: 219.7 as Degrees,
            targetElevation: 26.3 as Degrees,
            targetPolarization: -25 as Degrees,
            slewing: false,
            beaconCN: 7.6 as dB, // Degraded from the usual 10+ - the drift at work
            beaconFrequencyHz: 1070e6 as Hertz,
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 carries TM-2: full chain hot (BUC unmuted, HPA enabled
            // inherit from VT-01 defaults), LNB LO 5250 for matching IFs
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            centerFrequency: 1070e6 as Hertz, // TM-2 beacon IF
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
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'TIDEMARK-2-Teleport',
                  noradId: 61526,
                  frequency: 1020e6 as IfFrequency, // TM-2 TP-2: 7000 - 5980
                },
              },
            ],
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1458 as MHz, // TM-2 downlink IF (5250 - 3792)
                bandwidth: 36 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [tidemark2DriftingSatellite, tidemark1Satellite, ses10Satellite],
    trafficOwnership: [
      {
        satelliteNoradId: 61526,
        initialOwnerId: 'ME-02',
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-18?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Anomaly Brief',
      description: 'Open the brief and Halifax\'s 0850 vehicle status report.',
      groundStation: 'ME-02',
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
          description: 'Take the Shift',
          params: {
            character: Character.SYSTEM,
            question: 'Vehicle anomaly on TIDEMARK-2, ground link degrading. What is YOUR job this shift?',
            options: [
              'Keep the link alive and feed Halifax ground observations - the vehicle is theirs, the lock is mine',
              'Diagnose the thruster fault from the ground telemetry',
              'Hand TIDEMARK-2 traffic to VT-01 preemptively',
              'Command the satellite back to its slot',
            ],
            correctIndex: 0,
            explanation: 'Role clarity is the first decision of a vehicle anomaly. Halifax flies the spacecraft; the ground station flies the antenna.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Select the Maine Ground Station.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['review-mission-brief'],
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

    // ============================================================
    // PHASE 1: READ THE SIGNATURE
    // ============================================================
    {
      id: 'dashboard-baseline',
      nice: ['T0153', 'K0741'],
      title: 'Station Health vs Link Health',
      description: 'Check the Dashboard - separate what is wrong from what is healthy.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'The Split',
          params: {
            character: Character.SYSTEM,
            question: 'The board shows degraded link margin but every equipment indicator is green. What does that combination tell you?',
            options: [
              'The ground segment is healthy - the degradation is on the space side or in the geometry, which matches Halifax\'s report exactly',
              'A hidden equipment fault - green indicators cannot be trusted during an anomaly',
              'The dashboard is stale and needs a refresh',
              'Weather - check the precipitation sensor',
            ],
            correctIndex: 0,
            explanation: 'Healthy equipment + sick link = look up, not down. The S16 cascade taught fault isolation on the ground; this is the same discipline pointed at the sky.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'station-keeping-quiz',
      nice: ['K1032', 'K0751'],
      title: 'What Died on the Spacecraft',
      description: 'Confirm what suspended north-south station-keeping means for the ground.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['dashboard-baseline'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Orbit Mechanics',
          params: {
            character: Character.SYSTEM,
            question: 'With N-S station-keeping burns suspended, what happens to TIDEMARK-2 from our point of view?',
            options: [
              'Residual inclination accumulates - the bird traces a daily figure-8 in az/el that grows over weeks, and the published ephemeris becomes progressively more wrong',
              'The satellite falls out of orbit within days',
              'The satellite drifts east along the GEO arc into another operator\'s slot immediately',
              'Nothing observable - station-keeping only matters for collision avoidance',
            ],
            correctIndex: 0,
            explanation: 'Exactly AURORA-7\'s life story, fast-forwarded. Inclination is the axis N-S burns fight; without them the figure-8 starts small and grows roughly 0.8-0.9° per year - except this drift is days old and already past the prediction.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-program-track-decay',
      nice: ['T0153', 'K1032'],
      title: 'Read the Program-Track Decay',
      description: 'Open ACU Control and read what program-track is doing with a stale ephemeris.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['station-keeping-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why the C/N Sags',
          params: {
            character: Character.SYSTEM,
            question: 'Beacon C/N is several dB below its usual value and wandering. Program-track reports it is exactly on target. Reconcile that.',
            options: [
              'Program-track IS on target - the ephemeris target. The satellite is somewhere else, and the gap between prediction and reality is being paid in pattern loss',
              'The beacon transmitter on the satellite is failing',
              'The ACU encoder is slipping and the dish is not where it reports',
              'Cross-pol interference from SES-10',
            ],
            correctIndex: 0,
            explanation: 'A 9-meter C-band dish has a half-degree-class beamwidth. A few tenths of a degree of ephemeris error puts the bird on the shoulder of the beam - present, degraded, and wandering with the figure-8.',
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
      id: 'beamwidth-risk-quiz',
      nice: ['K0721', 'K1032'],
      title: 'How Long Until It Falls Off',
      description: 'Project the risk: a growing figure-8 against a fixed beamwidth.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['read-program-track-decay'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Clock',
          params: {
            character: Character.SYSTEM,
            question: 'The figure-8 is ±1.3° and growing; the dish beamwidth is ~0.5°. What does that mean for program-track as a strategy?',
            options: [
              'Already lost - the excursion is several beamwidths and only gets worse; any fix based on following the ephemeris fails until Halifax publishes a corrected one',
              'Fine for another month - the margins are comfortable',
              'Acceptable if we raise LNB gain to compensate',
              'Program-track will self-correct as it learns the drift',
            ],
            correctIndex: 0,
            explanation: 'No gain knob recovers pointing loss. When reality has left the prediction by multiple beamwidths, the only thing worth tracking is the satellite itself - which is what the beacon is for.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: TRANSITION TO STEP-TRACK
    // ============================================================
    {
      id: 'enable-step-track',
      nice: ['S0421', 'K1032'],
      title: 'Engage Step-Track',
      description: 'Switch tracking strategy: let the beacon, not the ephemeris, steer the dish.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['beamwidth-risk-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-stable-beacon',
      nice: ['T0153', 'K1032'],
      title: 'Beacon Recovery',
      description: 'Hold beacon lock under step-track - watch the C/N climb back as the loop finds the real satellite.',
      groundStation: 'ME-02',
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
      points: 15,
    },
    {
      id: 'verify-carrier-recovery',
      nice: ['T0153', 'T1314'],
      title: 'Carrier Recovery',
      description: 'Confirm the customer carrier recovered with the pointing.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['acquire-stable-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Recovered (≥ 9 dB)',
          params: { minCNRatio: 9 },
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'no-manual-chase-quiz',
      nice: ['K0721', 'S0421'],
      title: 'Why Not Fly It By Hand',
      description: 'Confirm why manual pointing is the wrong fallback for a drifting bird.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-carrier-recovery'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Hands Off the Axes',
          params: {
            character: Character.SYSTEM,
            question: 'A colleague suggests nudging the dish manually every few minutes instead of trusting step-track. Why is that worse?',
            options: [
              'A human chases where the bird WAS; the loop tracks where it IS - manual nudges add pointing error between corrections, fatigue guarantees a missed one, and a bad nudge can drop the beacon entirely',
              'Manual mode disables the LNB',
              'It is not worse - manual tracking is more precise than step-track',
              'Manual pointing voids the antenna warranty',
            ],
            correctIndex: 0,
            explanation: 'Step-track corrects continuously against the measured beacon. The day automation actually dies you will fly manual because you must (that day comes in this campaign) - but choosing manual while the loop works is choosing worse performance at higher risk.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: HOLD AND REPORT
    // ============================================================
    {
      id: 'sustained-hold',
      nice: ['T0153', 'T1314'],
      title: 'Hold Through the Drift',
      description: 'Sustain the recovered link while the figure-8 wanders - this is the new normal until Halifax fixes the vehicle.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['no-manual-chase-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Held',
          mustMaintain: true,
          maintainDuration: 30,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Maintained',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Carrier Held',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'ground-observations-quiz',
      nice: ['T1314', 'K1032'],
      title: 'Feed the Vehicle Team',
      description: 'Choose what ground data actually helps Halifax\'s investigation.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['sustained-hold'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Useful Telemetry',
          params: {
            character: Character.SYSTEM,
            question: 'Which ground-side dataset is most valuable to the spacecraft team right now?',
            options: [
              'Timestamped step-track pointing history - the dish is physically following the satellite, so its az/el trace IS an independent measurement of the actual orbit',
              'The receiver\'s frame error counters',
              'BUC and HPA temperatures',
              'The spectrum analyzer screenshot archive',
            ],
            correctIndex: 0,
            explanation: 'When step-track follows the beacon, the antenna becomes a tracking instrument. Halifax can fit your pointing trace against their dynamics model - ground stations have refined orbits this way for decades.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'impact-assessment-quiz',
      nice: ['K0721', 'T1020'],
      title: 'Customer Impact Posture',
      description: 'Set the customer impact statement for an anomaly with no current service effect.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['ground-observations-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Statement',
          params: {
            character: Character.SYSTEM,
            question: 'Service is fully restored under step-track. What does the customer impact assessment say?',
            options: [
              'No current impact; service nominal under contingency tracking. Elevated risk posture while the vehicle anomaly is open - next decision points are loss of step-track margin or a vehicle-status change from Halifax',
              'No impact, case closed',
              'Severe impact - recommend customers migrate immediately',
              'Impact unknown - decline to assess until Halifax finishes',
            ],
            correctIndex: 0,
            explanation: 'Honest posture: green today, amber risk, named tripwires. The S22 board work later in this phase grades exactly this skill - say what you know, label what you are watching.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'escalation-boundary-quiz',
      nice: ['S0593', 'K0721'],
      title: 'Escalation Tripwires',
      description: 'Define when this stops being a ride-along and starts being Dana\'s call.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['impact-assessment-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Tripwires',
          params: {
            character: Character.SYSTEM,
            question: 'Which events escalate beyond the ground-operator role?',
            options: [
              'Step-track losing the beacon, C/N trending below demod threshold despite good tracking, or Halifax declaring the vehicle unsafe - anything where keeping the link stops being possible or stops being wise',
              'Any change in the figure-8 size',
              'Each hourly mark, automatically',
              'Nothing - the operator owns the incident end to end',
            ],
            correctIndex: 0,
            explanation: 'You own the link while the link is holdable. The moment the question becomes "should this traffic move?" or "should this bird carry traffic at all?" - that is supervision and spacecraft authority, with your data underneath it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-shift-summary',
      nice: ['K0645', 'T0153'],
      title: 'Log the Anomaly Response',
      description: 'Record the shift for the next operator - the anomaly outlives your shift.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['escalation-boundary-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry hands this off correctly?',
            options: [
              'TM-2 vehicle anomaly (Halifax NOC ref): N-S station-keeping suspended, ephemeris stale. ME-02 transitioned to step-track 0935, beacon and carrier recovered, no customer impact. Pointing history streaming to Halifax. Tripwires: step-track margin, vehicle status change. Anomaly OPEN.',
              'TM-2 had tracking problems, fixed with step-track.',
              'Vehicle anomaly resolved - returned to program-track.',
              'See Halifax for details.',
            ],
            correctIndex: 0,
            explanation: 'OPEN in capital letters is the load-bearing word. The next operator inherits a healthy link inside an unresolved anomaly - the log must make both halves of that true.',
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
        <em>[Text message from Dana at 09:07]</em>
      </p>
      <p>
        "Marcus called the ops line at 0850 - TM-2's north-south burns are coming up short, thruster degradation, vehicle team on it. The bird's drifting past the ephemeris and Maine's link is paying for it. You're covering ME-02 today: keep the link, feed Halifax what you see, and know where your job ends. The vehicle is theirs. The lock is yours."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/18/intro.mp3'),
    },
    objectives: {
      'beamwidth-risk-quiz': {
        text: `
        <p>
          Marcus here. Confirming what you're seeing: residual inclination is building faster than we'd like and the published ephemeris is days stale. Don't wait on a corrected set from us - it'll be a while. You've got a beacon; I'd trust it over my numbers right now.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-beamwidth-risk-quiz.mp3'),
      },
      'verify-carrier-recovery': {
        text: `
        <p>
          And there it is - I can see your C/N from the payload side, right back where it belongs. The dish is flying the bird instead of the prediction. Nicely done, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-verify-carrier-recovery.mp3'),
      },
      'ground-observations-quiz': {
        text: `
        <p>
          One more thing - keep that pointing history flowing to us. Your dish is the best orbit-determination instrument on this anomaly right now. Every hour of clean step-track trace tightens our solution for the recovery burn.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-ground-observations-quiz.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          Good shift. You read the signature, made one decisive change, and stayed inside your lane while owning everything in it. That's anomaly response - the vehicle team gets to work their problem because the link stopped being one.
        </p>
        <p>
          Anomaly stays open. Tomorrow's operator starts from your log.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-log-shift-summary.mp3'),
      },
    },
  },
};
