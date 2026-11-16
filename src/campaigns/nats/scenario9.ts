import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { ME02_TM2_TRANSMITTER, vermontGroundStation } from './ground-stations';
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
  description: `This is your first qualified shift, and there are three birds to check this morning: TIDEMARK-1 from Vermont, TIDEMARK-2 from Maine, and a spot-check on the newly commissioned TIDEMARK-3.<br><br>It's a standard round. You verify that each link is healthy, log anything unusual and move on. The overnight commissioning crew brought TIDEMARK-3 online a few hours ago. The only thing on your list for it is a quick beacon verification before our customers start lighting it up.<br><br>No drama is expected. It's routine.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational'],
  timeLimitSeconds: 25 * 60, // 25 minutes
  settings: {
    isSync: true,
    scenarioStartDate: '2026-02-16',
    scenarioStartWallTime: '06:42:00',
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
            azimuth: 146.96 as Degrees, // Maine sees TM-2 (45 W) here, not at Vermont's 143.3 / 31.8 (Phase 28 D4)
            elevation: 32.42 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526, // TIDEMARK-2
            targetAzimuth: 146.96 as Degrees,
            targetElevation: 32.42 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 4180e6 as Hertz, // TIDEMARK-2 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 mirrors VT-01's LNB LO so the TM-2 beacon comes out at 1070 MHz IF.
            // Maine carries TIDEMARK-2 (its own hub carrier, phase 27): chain hot,
            // BUC unmuted, HPA on at its operating back-off
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            // Left on the TM-1 beacon IF from a cross-check, so the player has
            // to retune to TM-2's 1070 MHz (nats-s09-F4: a pre-set analyzer
            // made the beacon check complete on opening the tab)
            centerFrequency: 1074.5e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz)
            // Phase 27: TIDEMARK beacons read -44 to -59 dBm at the RX IF tap
            // (ledger; higher when the AGC sees no carrier), the floor ~-114
            // dBm in 3 Hz
            minAmplitude: -120 as dBm,
            maxAmplitude: -30 as dBm,
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
        // ME-02's TM-2 hub carrier keyed (phase 27)
        transmitters: [ME02_TM2_TRANSMITTER],
        // RX modem on the TM-2 carrier so the payload spot-check reads a healthy
        // link (nats-s09-F6: the factory default sat at 1400 MHz, NO LOCK)
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
    satellites: [tidemark1Satellite, tidemark2Satellite, tidemark3Satellite, ses10Satellite],
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
      description: "Open the shift brief, then confirm you're ready to start rounds.",
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
            explanation: 'Thanks. The shift clock has started, and you have three birds on your list today: TIDEMARK-1, TIDEMARK-2 and TIDEMARK-3.',
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
      description: 'Open the Dashboard and check VT-01 for active alarms.',
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
            question: 'What alarm state does the VT-01 Dashboard show?',
            options: [
              'No warning or critical alarms',
              'A BUC high-current alarm on the TX chain',
              'An LNB reference-unlock alarm on the RX chain',
              'An HPA output-fault alarm on the transmit path',
            ],
            correctIndex: 0,
            explanation:
              'The Dashboard shows nothing above informational on the primary station, so there are no warning or critical alarms to chase. Next you check the timing reference.',
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
              'GPS receiver has enough satellites to start disciplining the oscillator',
              'External reference in holdover, oscillator free-running on last correction',
              '1 PPS output present but the 10 MHz output is still warming up',
            ],
            correctIndex: 0,
            explanation:
              'A locked GPSDO means the 10 MHz reference is stable, so the receive and transmit chains can trust their frequencies. The other options all describe states short of lock: still acquiring satellites, holding over without GPS, or still warming up.',
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
      title: 'Verify VT-01 RX Chain',
      description: 'Confirm the TIDEMARK-1 beacon is present and the receiver is locked, and read the C/N the receiver modem shows.',
      groundStation: 'VT-01',
      intent: 'confirm',
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
            observationDwellSeconds: 5,
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 5 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Read the TIDEMARK-1 C/N',
          params: {
            character: Character.SYSTEM,
            question: 'What C/N does the VT-01 receiver modem show on the TIDEMARK-1 carrier?',
            options: [
              '12 to 14 dB - locked with good margin',
              '4 to 6 dB - locked, degraded margin',
              '8 to 9 dB - just above the service minimum',
              'No C/N reading - the modem is not locked',
            ],
            correctIndex: 0,
            // Ledger: VT-01's own TP-1 carrier, 13.1 dB at shift start
            explanation:
              "It reads about 13 dB. That's the TP-1 carrier VT-01 uplinks, coming back down through TIDEMARK-1, and it sits some 8 dB above where QPSK 3/4 acquires lock. The modem shows Required Es/N0 5.0 dB, and Es/N0 runs about 0.8 dB above Raw C/N. So it acquires lock from about 4.7 dB C/N (Required 5.0 plus a 0.5 dB acquisition margin, less the 0.8 dB Es/N0 offset) and holds it down to about 3.7 dB. That's the clear-sky baseline to compare against on the next shift.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'vt-tx-hpa-check',
      nice: ['T0431', 'K0740'],
      title: 'Verify VT-01 TX Chain',
      description: 'Open TX Chain, confirm the HPA is enabled and not overdriven, and read its output power.',
      groundStation: 'VT-01',
      intent: 'confirm',
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
          // Q2: a read of the running uplink, never a toggle
          requiresChange: false,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Operating Limits',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Read the HPA Output',
          params: {
            character: Character.SYSTEM,
            question: 'What output power does the VT-01 HPA panel show?',
            options: ['About 50 dBm (100 W)', 'About 60 dBm (1 kW)', 'About 40 dBm (10 W)', 'About 57 dBm (500 W)'],
            correctIndex: 0,
            explanation:
              "The BUC supplies 16 dBm of drive and the HPA adds 34 dB of gain, which gives 50 dBm, or 100 W. That's 10 dB under the amplifier's 1 kW P1dB, its 1 dB compression point.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    // The backoff quiz used to sit in the spot check above, where it could be
    // answered before the TX tab was ever opened (nats-s09-F4)
    {
      id: 'vt-tx-backoff-check',
      nice: ['K0740'],
      title: 'VT-01 HPA Backoff Reading',
      description: 'Read the HPA backoff on the TX Chain tab, then pick what it means.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['vt-tx-hpa-check'],
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
          type: 'status-check',
          description: 'HPA Backoff Understanding',
          params: {
            character: Character.SYSTEM,
            question: 'What does the 10 dB HPA backoff during routine ops indicate?',
            options: [
              'Standard operating margin - reduces stress on the amplifier',
              'HPA fault protection - the amplifier is limiting its own output',
              'Customer requested setting - low power for a light traffic load',
              'Output stage saturation - the amplifier is clipping at its peak',
            ],
            correctIndex: 0,
            explanation:
              "Backoff is deliberate headroom. Running 10 dB under P1dB means 50 dBm (100 W) from a 1 kW amplifier, with the IM3 (2-tone) readout around -43 dBc. It isn't a fault, a customer setting or saturation, which is what the other three options claim.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
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
      prerequisiteObjectiveIds: ['vt-tx-backoff-check'],
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
            question: 'What alarm state does the ME-02 Dashboard show?',
            options: [
              'No warning or critical alarms',
              'An antenna tracking-lost alarm from the ACU',
              'A GPSDO holdover alarm on the timing chain',
              'An LNB over-temperature alarm on the RX chain',
            ],
            correctIndex: 0,
            explanation: 'The Maine Dashboard shows nothing above informational, so there are no warning or critical alarms. Catherine has the station in good shape.',
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
      description:
        'The ME-02 analyzer is still parked on the TM-1 beacon IF. Retune it to the TIDEMARK-2 beacon IF (1070 MHz) and confirm the beacon is present and the LNB noise temperature is normal.',
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
          requiresChange: false,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Noise Temperature Normal',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at 1070 MHz IF',
          params: {
            centerFrequency: 1070e6 as Hertz,
            centerFrequencyTolerance: 0.5e6,
          },
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
              'Step-track unavailable on ME-02 - ACU has no beacon receiver; program-track is the only mode',
              'Program-track moves the dish less - fewer motor cycles; saves the drive on a long shift',
              'TIDEMARK-2 is in an inclined orbit - figure-8 drift is predictable; program-track follows it',
            ],
            correctIndex: 0,
            explanation:
              "For a healthy GEO bird with a good TLE (the orbital element set), program-track is the right default, because the satellite holds station and the dish doesn't need to hunt for the beacon. Save step-track for inclined birds like AURORA-7.",
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
      // nats-r4-s09-F1: frame sync / CRC / FEC live on RX Analysis > Payload
      // Data Integrity; the Dashboard has no such indicators
      description: 'Spot-check downlink data integrity on RX Analysis. The Payload Data Integrity card shows frame sync, CRC and FEC for the receiver.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['me-verify-tracking'],
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
          type: 'status-check',
          description: 'Payload Health Indicators',
          params: {
            character: Character.SYSTEM,
            question: 'On the Payload Data Integrity card, which combination of indicators confirms the downlink data path is healthy?',
            options: [
              'Frame sync locked + CRC valid + FEC engaged (Reed-Solomon active, no uncorrectables)',
              'RX power high + AGC mid-range + C/N above threshold (strong carrier, data must follow)',
              'Beacon lock + antenna on peak + program-track holding (RF path proven, data follows)',
              'Modem temperature in range + fans nominal + no hardware alarms (healthy unit, clean data)',
            ],
            correctIndex: 0,
            explanation:
              "Beacon lock only proves the RF path. Frame sync, CRC and FEC are checks on the data itself, so they're what prove the data path. The other options are RF or hardware evidence, which can't tell you whether the data is arriving intact.",
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
      // Phase 27: never slew a keyed dish. The carrier would sweep ~100 W
      // across the GEO arc, and the sister teleport takes over the TM-1
      // carrier: two uplinks on one carrier interfere
      id: 'inhibit-vt-tx',
      nice: ['S0421', 'K0741'],
      title: 'Inhibit TX Before Repointing',
      description:
        "The sister teleport is taking TIDEMARK-1's carrier for the check. On TX Chain, disable VT-01's HPA output before the dish moves. A keyed dish sweeping off TIDEMARK-1 would paint the neighboring satellites, and two stations on one carrier would interfere. Until you take TM-1 back, expect two alarms on VT-01's Dashboard: 'AGC on noise only' (with our carrier off, the receive modem's passband holds noise and no traffic carrier) and 'Carrier lock lost' (Modem 1 has no carrier to lock to). Both are expected, and both clear once VT-01 takes TM-1 back.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-vermont'],
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
          type: 'hpa-disabled',
          description: 'HPA Output Disabled (TX Inhibited)',
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
      description:
        'With TX inhibited, command program-track to TIDEMARK-3 (NORAD 61527), which sits at Az 145.7°, El 32.7°. Pick it in Target Satellite (the pick only stages it), then press Move to Target.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['inhibit-vt-tx'],
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
          type: 'hpa-disabled',
          description: 'TX Still Inhibited',
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
              'Only the antenna pointing is correct (the beacon sits at 1078 whatever LO the LNB uses)',
              'Only the LNB LO is correct (5250 - 4172 = 1078 works whether or not the dish is on TM-3)',
              'Nothing about the chain (any noise spike near 1078 would look the same on a 5250 LO)',
            ],
            correctIndex: 0,
            explanation:
              'Both have to be right. If the dish is off TIDEMARK-3 you see no beacon at all, and if the LO is wrong the beacon shows up at a different IF. Seeing it at exactly 1078 MHz means the pointing and the LO are both correct.',
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
      description:
        'Repoint program-track back to TIDEMARK-1 (pick it in Target Satellite, then Move to Target) and retune the spectrum analyzer to the TM-1 beacon IF (1074.5 MHz).',
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

    {
      id: 'restore-vt-tx',
      nice: ['S0421', 'K0741'],
      title: 'Take TIDEMARK-1 Back',
      description: "You're back on TIDEMARK-1 and locked, so the sister teleport drops the carrier and VT-01 takes it back. On TX Chain, enable the HPA output again.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-to-tidemark1'],
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
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
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
      prerequisiteObjectiveIds: ['restore-vt-tx'],
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
            question: 'Which line summarizes the result of the morning round?',
            options: [
              'TIDEMARK-1 healthy, TIDEMARK-2 healthy, TIDEMARK-3 beacon verified - all three nominal',
              'TIDEMARK-1 degraded, TIDEMARK-2 healthy, TIDEMARK-3 beacon absent - one bird offline',
              'TIDEMARK-1 healthy, TIDEMARK-2 not yet checked, TIDEMARK-3 beacon verified - round open',
              'TIDEMARK-1 healthy, TIDEMARK-2 healthy, TIDEMARK-3 not yet verified - spot-check deferred',
            ],
            correctIndex: 0,
            explanation:
              'All three birds checked out: TIDEMARK-1 and TIDEMARK-2 were healthy and the TIDEMARK-3 beacon was verified. Each of the other lines describes a bird that was degraded, unchecked or deferred, and none of that happened.',
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
      description:
        'Type a one-line summary of the round in the Operations Log (log icon in the station sidebar): mention the morning rounds and the TM-3 beacon check. Then pick the line that matches it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-alarm-sweep'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ops-log-entry',
          description: 'Round Summary Typed in Ops Log',
          params: { logKeywords: ['round', 'tm-3|tm3|tidemark-3|tidemark 3'], logMinLength: 20 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            // nats-r3-s09-F1: no clock stamp in the options; the Ops Log stamps
            // the station clock on the entry itself
            question: 'Which line correctly records this shift in the operations log?',
            options: [
              'Morning rounds complete. VT-01/TM-1 and ME-02/TM-2 checked, TM-3 beacon verified with TM-1 on the sister teleport. Expected alarms cleared. No anomalies.',
              'Morning rounds incomplete. VT-01/TM-1 and ME-02/TM-2 checked, TM-3 spot-check deferred to the next shift because the sister teleport was busy. No anomalies.',
              'Morning rounds complete. VT-01/TM-1 and ME-02/TM-2 checked, TM-3 beacon verified. Trouble ticket opened for the two alarms VT-01 raised during the check.',
              'Morning rounds complete. VT-01 repointed to TM-3 for the spot-check while TM-1 customer traffic dropped for the duration. TM-3 beacon verified. No anomalies.',
            ],
            correctIndex: 0,
            explanation:
              'Routine work gets logged routinely: what you checked, what the TM-3 check needed (TM-1 on the sister teleport meanwhile) and that nothing was found. The two VT-01 alarms, AGC on noise only and Carrier lock lost, were the expected result of the TX inhibit and cleared once VT-01 took TM-1 back. They belong in the log line rather than a trouble ticket. The Operations Log stamps the station clock on the entry for you, so the next operator picks up with full context.',
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
        "Welcome to your first qualified shift. You've got three birds today: TM-1, TM-2 and TM-3. The overnight commissioning crew brought TM-3 up a few hours ago, and it just needs a beacon spot-check before customers light it up. Otherwise it's standard morning rounds."
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
          VT-01 looks clean. Catherine's run Maine since the weather handover, so there shouldn't be anything over there to surprise you.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-select-maine-station.mp3'),
      },
      'switch-to-vermont': {
        text: `
        <p>
          Maine's confirmed nominal. The sister teleport is taking the TM-1 customer traffic for the next few minutes while you spot-check TM-3, so you'll switch our transmit output off before the dish moves. You don't need to transmit for a beacon look, and the antenna's yours.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-switch-to-vermont.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          That's the morning done, and routine work got logged routinely. I'll admit I had you down for a few more weeks of supervised shifts, and I was wrong. This is what most days in qualified ops look like.
        </p>
        <p>
          I'll see you tomorrow.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/9/obj-log-shift-summary.mp3'),
      },
    },
    // nats-r3-s02-F1 (D18): Dana's "Bring VT-01 back" plays as the return step
    // opens, not after the retune is already done
    objectivesOnStart: {
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
    },
  },
};
