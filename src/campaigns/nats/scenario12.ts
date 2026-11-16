import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 12: "Planned Maintenance: Return to Service"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 4 of 8)
 * Time Pressure: None (planned procedure - procedural cleanliness is the grade)
 * Calculation Required: NO - operational values already known
 * New UI Elements: None - reuses S2 power-up, S7 leftover-detection, S3 handover.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1314: Maintain network infrastructure
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - T0431: Check system hardware availability, functionality, integrity
 *
 * Supporting Codes:
 *   - T0153: Monitor network capacity and performance
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0741: Knowledge of system availability measures
 *   - S0421: Skill in operating network equipment
 *   - S0593: Skill in handling incidents
 *
 * Premise: Closes the S11-S12 planned-maintenance mini-arc. The maintenance crew
 * has finished waveguide gasket inspection on VT-01. TM-1 traffic is currently
 * being held at ME-02 (Catherine took it during S11). Player brings VT-01 back
 * online in a clean restoration sequence, catches a small leftover from the
 * maintenance crew (BUC gain bumped during testing), then coordinates the
 * traffic return from Catherine.
 *
 * Tone: Qualified operator. Dana intros via text and signs off; Catherine handles
 * the cross-station release dialogue; Marcus closes the customer loop. All quizzes
 * are SYSTEM-voiced. No tab coaching.
 *
 * Story Continuity:
 *   - S11 left VT-01 stowed and powered down; ME-02 holds TM-1 traffic.
 *   - The maintenance leftover (BUC gain at 50 dB instead of 23 dB operating value)
 *     is the same class of mistake as S7 — establishes that the maintenance crew's
 *     habits haven't changed.
 *   - Catherine is a peer, not a supervisor. She talks like Catherine, not Dana.
 *
 * Technical Reference (TIDEMARK-1 from VT-01):
 *   - Az 153.1°, El 35.1°, Pol 14°
 *   - LNB LO: 5250 MHz; Beacon RF: 4175.5 MHz; Beacon IF: 1074.5 MHz
 *   - BUC LO: 7000 MHz (LSB); Teleport carrier RF: 5943 MHz (TP-1); TX IF: 1057 MHz
 *   - Operating BUC gain: 23 dB (post-maintenance leftover: 50 dB - same as S7 testing value)
 */

export const scenario12Data: ScenarioData = {
  id: 'nats-scenario12',
  prerequisiteScenarioIds: ['nats-scenario11'],
  url: 'nats/scenarios/nats-scenario12',
  imageUrl: 'nats/12/card.png',
  number: 12,
  title: 'Planned Maintenance | Return to Service',
  subtitle: 'Post-Maintenance Restoration',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Maintenance Recovery',
  description: `Waveguide gasket replacement is done, and the maintenance crew is clear of the antenna and signed out. VT-01 is stowed with its RF chain cold, and Catherine is holding TM-1 traffic on ME-02.<br><br>Bring Vermont back the clean way. Point the antenna at the target, check the receive chain against the beacon, sweep the transmit side for anything the maintenance crew left behind, and then take the traffic back from Maine. Marcus will want to hear from us once SeaLink's link is back where it started.<br><br>There's no clock pressure. Just do it right.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Holding TM-1 traffic'],
  timeLimitSeconds: 35 * 60, // 35 minutes
  settings: {
    isSync: true,
    scenarioStartDate: '2026-02-24',
    scenarioStartWallTime: '09:14:00',
    groundStations: [
      // VT-01: stowed for maintenance window, RF chain cold, BUC has a
      // gain leftover from maintenance crew's bench testing (50 dB instead
      // of operating 23 dB)
      {
        ...vermontGroundStation,
        antennasState: [
          {
            isPowered: true,
            // Stowed at zenith on TIDEMARK-1's azimuth: stow parks the
            // elevation and leaves the azimuth (phase 19.4)
            azimuth: 153.1 as Degrees,
            elevation: 90 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'stow',
            isBeaconLocked: false,
            targetSatelliteId: null,
            slewing: false,
            beaconCN: 0 as dB,
            isLocked: false,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // RF chain safed for maintenance window. The LNB has been off for
            // the window, so its noise temperature settles over ~90 s after
            // power-up instead of the instant-stable station default; the
            // power-up step holds 30 s on it (nats-s12-F3: LNB, beacon and RX
            // lock all completed the instant the LNB powered).
            lnb: {
              isPowered: false,
              noiseTemperatureStabilizationTime: 90,
              thermalStabilizationTime: 90,
            },
            buc: {
              isPowered: false,
              isMuted: true,
              isLoopback: false,
              // ----- Maintenance leftover -----
              // Crew bumped BUC gain to 50 dB during bench testing and forgot
              // to dial it back. Won't matter until the chain is energized, but
              // if HPA is brought up at this gain the output stage gets driven
              // hard. Operator should catch this before powering up.
              gain: 50 as dB,
              temperature: 25,
              currentDraw: 0,
              outputPower: -10 as dBm,
            },
            hpa: {
              isPowered: false,
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
              outputPower: 0 as dBm,
              backOff: 10,
            },
          }),
        ],
        // Analyzer parked off the beacon (the crew used it during the window),
        // so the beacon step is a real retune
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 600e6 as Hertz,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                isTransmitting: false,
                isTransmittingSwitchUp: false,
              },
            ],
          },
        ],
      },
      // ME-02: holding TIDEMARK-1 traffic. Catherine has the bird while VT-01
      // is in the maintenance window. LO overridden to 5250 to match VT-01 IFs.
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
            azimuth: 157.0 as Degrees, // Maine sees TM-1 (53 W) here, not at Vermont's 153.1 / 35.1 (Phase 28 D4)
            elevation: 35.33 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61525, // TIDEMARK-1
            targetAzimuth: 157.0 as Degrees,
            targetElevation: 35.33 as Degrees,
            slewing: false,
            beaconCN: 10.4 as dB,
            beaconFrequencyHz: 4175.5e6 as Hertz, // TIDEMARK-1 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 is holding TM-1: LNB LO override 5250 (matches VT-01 IFs),
            // TX chain hot and carrying customer traffic until handover return.
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
            centerFrequency: 1074.5e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
            // Phase 27: the TIDEMARK beacon reads -54 to -59 dBm at the RX IF tap
            // (ledger), the floor ~-114 dBm in 3 Hz: both on screen, 10 dB/div
            minAmplitude: -140 as dBm,
            maxAmplitude: -40 as dBm,
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
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1532 as MHz, // TM-1 downlink IF (5250 - 3718), matches VT-01
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
    satellites: [tidemark1Satellite, tidemark2Satellite, ses10Satellite],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'ME-02', // Catherine is holding it at scenario start
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-12?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Restoration Brief',
      description: 'Open the restoration brief and acknowledge you are ready to bring VT-01 back online.',
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
          description: 'Ready for Restoration',
          params: {
            character: Character.SYSTEM,
            question: 'The maintenance is complete, the antenna is stowed and ME-02 is holding TM-1. Are you ready to bring VT-01 back?',
            options: ['Confirmed. Beginning restoration.'],
            correctIndex: 0,
            explanation: 'The restoration timer starts now. Procedural cleanliness is the grade today, so take each step in order.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: PRE-RESTORATION STATE VERIFICATION
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
      id: 'pre-restoration-dashboard',
      nice: ['T0431', 'K0741'],
      title: 'Confirm Safed State',
      description: 'Verify VT-01 is in the expected post-maintenance state - cold RF chain, antenna stowed.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Verify Post-Maintenance State',
          params: {
            character: Character.SYSTEM,
            question: 'What state should VT-01 be in before starting restoration?',
            options: [
              'Antenna stowed, LNB/BUC/HPA powered off, GPSDO still running',
              'Antenna on TIDEMARK-1, full RF chain hot, modem transmitting',
              'Antenna stowed, RF chain hot, modem standby',
              'Antenna stowed, all equipment powered down, GPSDO included',
            ],
            correctIndex: 0,
            explanation:
              "You parked the dish at the maintenance position (5°) for the crew, and on sign-out they stowed it at 90° under the post-work procedure. A stowed antenna, a cold RF chain and a GPSDO still running for timing continuity is the state you should get back. Anything else means somebody touched something they shouldn't have.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 2: ANTENNA RESTORATION
    // ============================================================
    {
      id: 'repoint-antenna-tm1',
      nice: ['T1567', 'S0421', 'K1032'],
      title: 'Repoint VT-01 to TIDEMARK-1',
      // nats-r3-s12-F3: a Target Satellite pick only stages; Move to Target commits the slew
      description:
        'On ACU Control, select PROGRAM, pick TIDEMARK-1 in Target Satellite, and then press Move to Target. The pick only stages the target, and Move to Target slews the dish off stow so it can lock on.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['pre-restoration-dashboard'],
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
          description: 'Locked on TIDEMARK-1',
          params: { noradId: 61525 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RX CHAIN RESTORATION
    // ============================================================
    {
      id: 'power-up-lnb',
      nice: ['T1567', 'S0421'],
      title: 'Power Up LNB',
      description:
        'Power on the LNB and wait while it warms up. The LNB panel reads "Thermal: Warming m:ss" for about 90 s, then Stable once the noise temperature is under 100 K with LOCK locked. Stable has to hold for 30 s. The LO is still set to 5,250 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-antenna-tm1'],
      timeLimitSeconds: 4 * 60,
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
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Stable for 30 s',
          mustMaintain: true,
          maintainDuration: 30,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-tm1-beacon',
      nice: ['T0153', 'K0773'],
      title: 'Acquire TIDEMARK-1 Beacon',
      description: 'The analyzer is parked where the crew left it. Tune it to the TM-1 beacon IF at 1,074.5 MHz and confirm the beacon shows on the trace.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-lnb'],
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
          description: 'Spectrum Analyzer at 1,074.5 MHz IF',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 0.5e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-rx-modem-lock',
      nice: ['T0153', 'K0740'],
      title: 'Verify RX Modem Lock',
      description: "Confirm the receiver modem has locked onto TIDEMARK-1's carrier (ME-02's uplink, for now) with a healthy C/N margin, then read the C/N.",
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['acquire-tm1-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 5 },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N ≥ 10 dB',
          params: { minCNRatio: 10, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 5 },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Read the C/N',
          params: {
            character: Character.SYSTEM,
            question: 'What C/N does the VT-01 receiver modem show on the TIDEMARK-1 carrier?',
            options: [
              '12 to 14 dB - locked with good margin',
              '4 to 6 dB - locked, degraded margin',
              '8 to 9 dB - just under the 10 dB return margin',
              'No C/N reading - the modem is not locked',
            ],
            correctIndex: 0,
            // Ledger: ME-02's own TP-1 carrier reads 12.4 dB; VT-01, the same
            // dish class a few hundred km away, sees the same within a few tenths
            explanation:
              "The modem should read about 12 to 14 dB. VT-01 is receiving the TP-1 carrier that ME-02 is uplinking through the same transponder, so with the LNB warm and the dish back on TIDEMARK-1, Vermont's receive side reads what Maine's does. That's over the 10 dB return margin, while the 8 to 9 dB option would fall just short of it.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 5: TX CHAIN RESTORATION
    // ============================================================
    {
      id: 'power-up-buc',
      nice: ['T1567', 'S0421', 'K0770'],
      title: 'Power Up BUC (Muted)',
      description: 'Power on the BUC. It stays muted from the safed state, so no RF flows, and its reference lock should come up against the locked GPSDO.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-modem-lock'],
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
          type: 'equipment-powered',
          description: 'BUC Powered',
          params: { equipment: 'buc' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Still Muted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC Reference Locked',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // ============================================================
    // POST-MAINTENANCE LEFTOVER SWEEP (after BUC power-up: the BUC card
    // shows '--' for gain and LO while it is off, nats-s12-F1)
    // ============================================================
    {
      id: 'tx-chain-inspection',
      nice: ['T0431', 'S0593'],
      title: 'TX Chain Leftover Inspection',
      description:
        'With the BUC powered and muted, inspect the TX chain panel before anything else comes up. Look for any setting the maintenance crew left out of operating spec.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-buc'],
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
          type: 'status-check',
          description: 'Identify the Leftover',
          params: {
            character: Character.SYSTEM,
            question: 'The BUC is powered and muted, and the HPA and TX modem are still off. Which setting on the TX chain is out of operating spec?',
            options: [
              'BUC gain is at 50 dB, left over from maintenance; operating value is 23 dB',
              'BUC LO is at 6,500 MHz, left over from maintenance; operating value is 7,000 MHz',
              'HPA backoff is at 10 dB, left over from maintenance; operating value is 0 dB',
              'Nothing is out of spec; gain, LO and backoff all match the operating baseline',
            ],
            correctIndex: 0,
            explanation:
              // nats-r3-s12-F1: BUC model (Rapp s = 2, P1dB 28 dBm, Psat ~30.2 dBm):
              // -7 + 50 = 43 dBm small-signal -> ~30.2 dBm out, ~12.8 dB compressed
              "The bench-test gain (50 dB) was never dialed back to 23 dB. The moment the modem keyed, its -7 dBm plus 50 dB would ask for 43 dBm. That's 15 dB past the 28 dBm P1dB, so the output would pin at saturation near 30 dBm with almost 13 dB of gain compression. P1dB is the output level where the gain has dropped by 1 dB. The BUC would draw about 5 A with a high-current alarm and hand the HPA a distorted carrier. At 23 dB the same drive gives 16 dBm, 12 dB under P1dB. Catch it before you energize the HPA.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'correct-buc-gain',
      nice: ['T1567', 'S0421'],
      title: 'Restore BUC Operating Gain',
      description: 'With the BUC powered but still muted, dial the gain back to its 23 dB operating value before the rest of the chain comes up.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tx-chain-inspection'],
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
          type: 'buc-gain-set',
          description: 'BUC Gain Set to 23 dB',
          params: {
            gain: 23 as dB,
            gainTolerance: 2 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-up-hpa',
      nice: ['T1567', 'S0421'],
      title: 'Power Up HPA',
      description: 'Power on the HPA. Its output stays disabled until you toggle enable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['correct-buc-gain'],
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
          type: 'equipment-powered',
          description: 'HPA Powered',
          params: { equipment: 'hpa' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'start-modem-transmitting',
      nice: ['T1567', 'S0421'],
      title: 'Enable TX Modem',
      description: 'Enable the transmit modem. Its operating configuration is already set: 1,057 MHz IF, QPSK 3/4, 36 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-hpa'],
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
          type: 'tx-modem-transmitting',
          description: 'TX Modem Transmitting',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-tx-staged',
      nice: ['T1567', 'K0645', 'S0421'],
      title: 'Confirm TX Staged Cold',
      description:
        "Confirm the transmit chain is staged for the handover return, with the modem transmitting into a muted BUC and the HPA output disabled. The transfer brings VT-01's RF up as Maine stands down.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['start-modem-transmitting'],
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
          type: 'tx-modem-transmitting',
          description: 'TX Modem Transmitting (into muted BUC)',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Stays Muted Until the Swap',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Stays Disabled Until the Swap',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Why TX Stays Cold',
          params: {
            character: Character.SYSTEM,
            question: "ME-02 is still carrying TIDEMARK-1. Why does VT-01's transmit chain stay cold (BUC muted, HPA disabled) until the handover executes?",
            options: [
              'Two uplinks on one transponder is dual illumination, so the handover keeps only one on the air',
              "The BUC can't be unmuted in program-track, so the handover switches the ACU to step-track before RF comes up",
              'Radiating into a muted BUC wastes HPA hours, so the handover brings RF up only once the customer confirms',
              "The HPA isn't re-certified after the gasket work, so the handover carries the sign-off that unlocks its output",
            ],
            correctIndex: 0,
            explanation:
              'The satellite must never see two carriers fighting over one transponder, which is the same rule that protected the hand-off to Maine. So you stage the chain cold, and then the transfer stands Maine down and brings Vermont up in a single swap.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 6: HANDOVER RETURN FROM ME-02
    // ============================================================
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Switch to ME-02',
      description: 'Switch to the Maine console so you can coordinate the handover return with Catherine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-tx-staged'],
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
      id: 'pre-handover-criteria',
      nice: ['T0153', 'K0741', 'S0593'],
      title: 'Confirm Handover-Ready State',
      description: 'Work out what has to be true on VT-01 before you pull traffic back from Maine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Handover Criteria',
          params: {
            character: Character.SYSTEM,
            question: 'Which combination must be true on VT-01 before you pull TM-1 traffic back?',
            options: [
              'Beacon lock + RX modem lock with C/N margin + TX chain staged cold (modem on, BUC muted, HPA disabled)',
              'Beacon lock + RX modem lock with C/N margin + TX chain hot (modem on, BUC unmuted, HPA radiating)',
              'Antenna pointed at TM-1 + program-track holding + TX chain off (modem off, BUC off, HPA off until transfer)',
              'Beacon lock + RX modem lock with C/N margin + loopback test passed (modem on, BUC in loopback, HPA disabled)',
            ],
            correctIndex: 0,
            explanation:
              "This mirrors the hand-off to Maine. The station taking over proves its receive side and stages its transmit side cold, and then the transfer stands Maine down and brings Vermont up in one swap. Radiating early would put two carriers on the transponder, and a chain that's fully off has nothing ready to come up at the swap.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'execute-handover-return',
      nice: ['T0129', 'S0421', 'S0593'],
      title: 'Pull Traffic Back to VT-01',
      description: 'Select TIDEMARK-1 and execute the planned handover return, moving its traffic from ME-02 back to VT-01.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['pre-handover-criteria'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'satellite-selected',
          description: 'TIDEMARK-1 Selected',
          params: { assetSatelliteId: 'sat-61525' },
          mustMaintain: false,
        },
        {
          type: 'traffic-transferred',
          description: 'Traffic Returned to VT-01',
          params: {
            sourceStation: 'ME-02',
            targetStation: 'VT-01',
            satelliteId: 61525,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-handover-success',
      nice: ['T0153', 'K0741'],
      title: 'Confirm Return Complete',
      description: 'Select VT-01 again and check that the transfer unmuted the BUC and enabled the HPA, with no new alarms.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['execute-handover-return'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'VT-01 BUC Unmuted by the Transfer',
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'VT-01 HPA Enabled by the Transfer',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Handover Result',
          params: {
            character: Character.SYSTEM,
            question: 'Traffic ownership has returned to VT-01. What confirms the return was clean?',
            options: [
              'VT-01 owns TM-1 traffic, ME-02 TX stood down, no packet loss reported, no new alarms',
              'VT-01 owns TM-1 traffic, ME-02 antenna auto-stowed, RX modem re-locked, no new alarms',
              'VT-01 owns TM-1 traffic, C/N ratio up after the transfer, HPA enabled, no new alarms',
              'VT-01 owns TM-1 traffic, customer re-registered manually, packet loss cleared, no new alarms',
            ],
            correctIndex: 0,
            explanation:
              "A clean return means the target station owns the traffic, the source station has released it, and there are no warning or critical alarms. From the customer's side nothing happened, so there's no packet loss and no manual re-registration.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 7: CUSTOMER NOTIFICATION & SHIFT CLOSE
    // ============================================================
    {
      id: 'notify-customer',
      nice: ['S0478', 'K0645'],
      title: 'Notify SeaLink',
      description: 'Pick the right message to send Marcus after a clean return to service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-handover-success'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Comms',
          params: {
            character: Character.SYSTEM,
            question: 'Marcus is waiting for confirmation. Which message should you send him?',
            options: [
              'VT-01 restored, TM-1 traffic returned to primary station, no service interruption observed.',
              'VT-01 restored, TM-1 traffic returned to primary station, please rerun all your health checks.',
              'VT-01 restored, brief outage during the handover return, please flag any data loss to us.',
              'No message sent, TM-1 traffic never dropped from the customer side, nothing to report.',
            ],
            correctIndex: 0,
            explanation:
              "Marcus's side needs to hear that the uplink is coming from Vermont again and that nothing was affected. They don't need to act, but they do need to know where the uplink comes from. Silence leaves them guessing, and reporting an outage or asking for health checks describes something that didn't happen.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'final-dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Final Dashboard Sweep',
      description: 'Do a last alarm sweep on the VT-01 dashboard before you log the maintenance cycle complete.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['notify-customer'],
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
          description: 'Post-Restoration Health',
          params: {
            character: Character.SYSTEM,
            question: 'Read the VT-01 dashboard. Which description matches the station after restoration?',
            options: [
              'No warning or critical alarms; TM-1 traffic on primary',
              'BUC over-temperature - TX chain alarm, TM-1 traffic on primary',
              'LNB reference unlocked - RX chain alarm, TM-1 traffic degraded',
              'HPA overdriven - TX chain alarm, TM-1 traffic still held on ME-02',
            ],
            correctIndex: 0,
            explanation:
              "The dashboard is clean, so the restoration went well. Catching the BUC gain earlier is the reason the HPA isn't overdriven right now, and each of the other options describes an alarm that isn't there.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-maintenance-complete',
      nice: ['K0645', 'T1314'],
      title: 'Log Maintenance Cycle Complete',
      description:
        'Type the close-out into the Operations Log (the log icon in the station sidebar), covering VT-01 back in service and the BUC gain leftover you corrected. Then pick the matching entry.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-dashboard-sweep'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ops-log-entry',
          description: 'Close-Out Typed in Ops Log',
          params: { logKeywords: ['gain', 'service|return|restor'], logMinLength: 20 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly closes out the gasket maintenance cycle?',
            options: [
              'VT-01 back in service after gasket replacement. TM-1 returned from ME-02. BUC gain leftover (50 dB) corrected before energizing. No customer impact.',
              'VT-01 back in service after gasket replacement. TM-1 returned from ME-02. Customer reported a brief outage during the return. Ticket opened.',
              'VT-01 maintenance window incomplete. TM-1 still on ME-02. HPA waveguide gasket work deferred to the next window. No customer impact.',
              'VT-01 back in service after gasket replacement. TM-1 returned from ME-02. Chain energized at the values the crew left, no leftovers found. No customer impact.',
            ],
            correctIndex: 0,
            explanation:
              "The correct entry records the leftover you found and fixed, so the next shift can see what the maintenance crew did and what you caught. That's how the pattern gets fixed. The other entries hide the leftover, report an outage that never happened, or call an unfinished window complete.",
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
        <em>[Text message from Dana at 09:14]</em>
      </p>
      <p>
        "The crew's clear, and the gasket's replaced and signed off. Catherine is holding TM-1 on Maine and she's good for another hour, but there's no reason to make her wait. Bring Vermont back, pull the traffic home, and let Marcus know when you're done. It's a standard restoration."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/12/intro.mp3'),
    },
    objectives: {
      'verify-rx-modem-lock': {
        text: `
        <p>
          The receive side is back. When the BUC comes up, stop and look at the TX Chain tab before anything else goes on, because maintenance crews leave bench-test values behind. This same crew left the BUC unmuted in loopback a few months back. Loopback is the BUC's test mode. Catch a leftover on the panel, not after the HPA's been on for ten seconds.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-verify-rx-modem-lock.mp3'),
      },
      'select-maine-station': {
        text: `
        <p>
          Catherine here. I've been watching VT-01 come back on the network status, and the receive side looks healthy from here, so you're ready to take TM-1 back. The C/N has been steady on our side and there haven't been any events. Whenever you're set, give me the call.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-select-maine-station.mp3'),
      },
      'execute-handover-return': {
        text: `
        <p>
          That was a clean release on my end. The Maine transmitter is down, and the antenna's still on TM-1 if you want it as a warm standby. Nice work bringing Vermont back without a hole in the link. I asked for a spare BUC for Maine weeks ago and it's still stuck in procurement, so if you know anyone in purchasing, send them my way.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-execute-handover-return.mp3'),
      },
      'notify-customer': {
        text: `
        <p>
          Marcus from Halifax here. The spacecraft side just saw your uplink come back on TM-1, with a clean signal right in the passband. The passband is the slice of spectrum the transponder relays. There are no anomalies, and the customers never noticed the swap. Beauty.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-notify-customer.mp3'),
      },
      // nats-r3-s02-F1 (D18): past tense; it plays after the entry is logged
      'log-maintenance-complete': {
        text: `
        <p>
          That closes the maintenance cycle. You caught the BUC gain leftover, and that's the kind of save that never shows up on a dashboard. It's in the log now, so the next shift will see what the crew left behind and know to look for it.
        </p>
        <p>
          Good shift.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/12/obj-log-maintenance-complete.mp3'),
      },
    },
  },
};
