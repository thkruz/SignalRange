import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { ME02_HOT_RF_FRONT_END, ME02_TM2_ANTENNA_STATE, ME02_TM2_TRANSMITTER, maineGroundStationOperational, vermontGroundStation } from './ground-stations';
import { tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 16: "Cascade Failure"
 *
 * Phase: Qualified Operations (Phase 2 capstone, Scenario 8 of 8)
 * Time Pressure: Moderate-high (25 min limit, customer pressure)
 * Calculation Required: NO - this is multi-fault recovery
 * New UI Elements: None - reuses all Phase 1 mechanics
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0531: Troubleshoot hardware/software interoperability problems
 *   - S0677: Skill in recovering failed systems
 *   - S0807: Skill in solving problems
 *
 * Supporting Codes:
 *   - T1538: Resolve customer-reported system incidents
 *   - S0593: Skill in handling incidents
 *   - T0081: Diagnose network connectivity problems
 *   - T1606: Prepare impact reports
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0741: Knowledge of system availability measures
 *
 * Premise: Two minutes into what should have been a routine shift, three
 * unrelated faults converge on VT-01 simultaneously:
 *   1. BUC over-temperature (>70°C, 5.4 A high current draw from a failing
 *      output stage - needs a mute to cool down)
 *   2. LNB reference unlock (sticky fault, clears on power cycle; the
 *      free-running LO costs the customer carrier ~3 dB of Es/N0)
 *   3. HPA backoff drift (back-off dropped to 2 dB: 58 dBm / 631 W, overdriven)
 *
 * SeaLink's James Okafor calls about service degradation. Dana is in the
 * admin office and tells the player to take the lead. The player must
 * prioritize correctly: RF safety first (disable the overdriven HPA output,
 * THEN mute the BUC - never leave an enabled HPA without drive, per the
 * S2 sequencing rule), customer impact next (stabilize the receive side),
 * equipment health last (methodical recovery of each subsystem).
 *
 * Story Continuity (Phase 2 capstone):
 *   - Charlie remains in Europe.
 *   - Dana is the on-site supervisor but stays hands-off this shift.
 *   - James Okafor is the customer voice carrying SLA pressure.
 *   - ME-02 (Catherine) carries TIDEMARK-2 in the background, unaffected.
 *
 * Mechanical reuse:
 *   - S7 BUC fault management and loopback-state thinking
 *   - S8 LNB power-cycle recovery and intermittent-fault triage discipline
 *   - S2 HPA configuration and RF safety sequencing
 *   - S3 alarm-prioritization framework, scaled to multi-fault
 *   - S5 documentation discipline
 */

export const scenario16Data: ScenarioData = {
  id: 'nats-scenario16',
  prerequisiteScenarioIds: ['nats-scenario15'],
  url: 'nats/scenarios/nats-scenario16',
  imageUrl: 'nats/16/card.png',
  number: 16,
  title: 'Cascade Failure',
  subtitle: 'Multi-System Recovery Under Customer Pressure',
  // Billed at what it takes (nats-r3-s15-F1 in S16, Phase 29 D14): ~20 steps,
  // about seven control actions and a 90 s LNB warm-up; r4 played it in under
  // 10 min and r5 in 5:36, so it is billed 5-10 min (Phase 30 D22); the
  // 25 min limit stays (fatal step timers unchanged).
  duration: '5-10 min',
  difficulty: 'advanced',
  missionType: 'Incident Response',
  description: `Two minutes into your shift and the alarm board is lit up. BUC over-temperature, LNB reference unlocked, HPA overdriven - all on VT-01, all at once. The TIDEMARK-1 customer link is degraded and James Okafor (Atlantic Shipping Alliance, SeaLink's anchor customer) is on the line.<br><br>None of these faults is related to the others. You have to triage them in the right order: protect the equipment and the spectrum first, restore customer impact next, then methodically clear each fault.<br><br>Dana is in the admin office, and she trusts you with this one.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational (TIDEMARK-2)'],
  timeLimitSeconds: 25 * 60, // 25 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // BUC: over-temperature, not yet muted. The heat comes from the
            // 'vt-buc-overtemp' fault below; a seeded temperature is
            // overwritten by the thermal model at once (nats-s16-F2/F7).
            buc: {
              isPowered: true,
              isMuted: false,
              isLoopback: false,
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 23 as dB,
            },
            // HPA: backoff has drifted down, output is overdriven
            hpa: {
              isPowered: true,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
              backOff: 2, // Below 3 dB threshold -> isOverdriven true
              outputPower: 58 as dBm, // ALC: P1dB 60 - 2 dB = 58 dBm (631 W)
              isOverdriven: true,
              imdLevel: -27, // IM3 (2-tone) at 2 dB back-off
              temperature: 60,
            },
            // LNB: sticky reference unlock fault, clears on power cycle
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 65 as dB,
              isExtRefLocked: false,
              hasRefLockFault: true,
              noiseTemperature: 55,
              temperature: 30,
            },
          }),
        ],
      },
      // ME-02 carrying TIDEMARK-2 in the background - unaffected by VT-01
      // faults: on TM-2, its hub carrier keyed, chain hot (phase 27)
      {
        ...maineGroundStationOperational,
        antennasState: [ME02_TM2_ANTENNA_STATE],
        rfFrontEnds: [ME02_HOT_RF_FRONT_END],
        transmitters: [ME02_TM2_TRANSMITTER],
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-16?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    // Brief: Friday, 0934 Local
    scenarioStartDate: '2026-02-20',
    scenarioStartWallTime: '09:34:00',
    // BUC fault (phase 19.6 physics): the output stage's bias has run away
    // (+2.3 A, so 5.4 A from 24 V: the high-current alarm) and its fan is slow
    // (R_th x 1.3). Driven at 23 dB it heads for ~75 degC, so it sits over the
    // 70 degC alarm and creeps up until muted. Muting drops the stage bias:
    // 2.6 A idle, target ~49 degC, so it passes 70 about a minute after the
    // mute (10 min time constant). The fault clears once the cooling step is done, so the
    // unmute later in the shift does not re-trip it.
    hardwareFaultEvents: [
      {
        id: 'vt-buc-overtemp',
        groundStationId: 'VT-01',
        target: 'buc-overtemp',
        startTime: 0,
        endAfterObjectiveId: 'navigate-rx-analysis',
        params: { startTemperatureC: 72, coolingFactor: 1.3, excessCurrentA: 2.3 },
      },
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Incident Brief',
      description: "Open the incident brief, then confirm you're taking the lead on the response.",
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Incident Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Take the Lead',
          params: {
            character: Character.SYSTEM,
            question: 'Three alarms are active on VT-01 and SeaLink is on the line. How do you proceed?',
            options: [
              'Triage all three alarms first, then act in priority order: RF safety, customer impact, equipment health',
              'Clear the alarms in order of effort: easiest fault first to bring the alarm count down, then the hard ones',
              'Report to Dana first, then act on her direction, with no equipment changes until she gives the order',
              'Power cycle the whole RF chain first, resetting the BUC, LNB and HPA at once, then triage whatever is left',
            ],
            correctIndex: 0,
            explanation:
              "Triage comes before action because you can't pick a safe order until you know all three faults. Once you do, you can protect the equipment and the spectrum first, then fix what the customer feels.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 1: TRIAGE AND PRIORITIZATION
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
      id: 'triage-dashboard-alarms',
      nice: ['T0153', 'K0741', 'S0593'],
      title: 'Triage the Alarm Board',
      description: 'Open the Dashboard and read which alarms are active before you change anything.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 3 * 60,
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
          description: 'Identify Concurrent Faults',
          params: {
            character: Character.SYSTEM,
            question: 'Which alarms are active on VT-01 right now?',
            options: [
              'BUC over-temperature, LNB reference unlocked, HPA overdriven',
              'BUC reference unlocked and high current, LNB over-temperature, HPA output disabled',
              'HPA over-temperature and high current, antenna tracking lost, BUC reference unlocked',
              'GPSDO in holdover and LNB reference unlocked, TX Modem 1 fault, HPA overdriven',
            ],
            correctIndex: 0,
            explanation:
              "Three unrelated alarms are active at once. The BUC and HPA conditions threaten the equipment and the uplink spectrum, while the LNB condition degrades the customer's receive side because its free-running LO costs the TIDEMARK-1 carrier about 3 dB of Es/N0. Es/N0 is the signal-to-noise ratio per symbol.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'prioritize-recovery-order',
      nice: ['S0807', 'K0721', 'S0593'],
      title: 'Set the Recovery Order',
      description: "Choose the order you'll work the three faults in, before you touch any equipment.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['triage-dashboard-alarms'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Recovery Priority',
          params: {
            character: Character.SYSTEM,
            question: 'In what order should the three faults be addressed?',
            options: [
              'RF safety first (HPA overdrive + BUC) → customer impact next (LNB / RX) → final verification',
              'Customer impact first (LNB / RX) → RF safety next (HPA overdrive + BUC) → final verification',
              'Equipment damage first (BUC over-temp) → RF safety next (HPA overdrive) → customer impact (LNB / RX)',
              'Easiest clear first (LNB power cycle) → BUC cooldown next → HPA back-off last (longest to settle)',
            ],
            correctIndex: 0,
            explanation:
              'An overdriven HPA puts a dirty signal on the spectrum and risks the amplifier, so it comes first. Disable the HPA output, mute the BUC so it cools, and fix the back-off. Then clear the LNB fault, bring the uplink back, and confirm the customer carrier comes back down through TIDEMARK-1 locked.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: RF SAFETY - STOP THE OVERDRIVEN UPLINK
    // ============================================================
    {
      id: 'navigate-tx-chain',
      nice: ['S0421'],
      title: 'Open TX Chain',
      description: 'Open the TX Chain panel.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['prioritize-recovery-order'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'disable-hpa-for-safety',
      nice: ['S0593', 'S0677'],
      title: 'Disable the HPA Output',
      description:
        'Disable the HPA output to take the overdriven signal off the antenna. The amplifier comes down before its drive does, the same sequencing rule as a planned power-down. This step is timed, and running out of time fails the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      // An overdriven HPA is polluting the neighbours' spectrum: stopping it is
      // the time-critical safety step of the shift
      timeoutFails: true,
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
          description: 'HPA Output Disabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Why HPA First',
          params: {
            character: Character.SYSTEM,
            question: 'Why is disabling the HPA output the right first action, before you mute the BUC?',
            options: [
              'It takes the dirty uplink off the air, and an enabled HPA with no BUC drive would amplify raw noise into the feed',
              'It takes the dirty uplink off the air, and the HPA controls the BUC, so disabling it mutes the BUC at the same time',
              'It takes the dirty uplink off the air, and the HPA shares the 10 MHz reference, so disabling it lets the LNB relock',
              "It takes the dirty uplink off the air, but the order doesn't matter, because both end up off before the BUC cools either way",
            ],
            correctIndex: 0,
            explanation:
              "It's the same rule as every planned power-down: the amplifier goes off before its drive. Disabling the HPA stops the overdriven signal and keeps the chain safe for the BUC mute that comes next. If you mute the BUC first, the enabled HPA amplifies noise into the feed.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'mute-buc-for-cooldown',
      nice: ['S0677', 'T1314'],
      title: 'Mute the BUC for Cooldown',
      description:
        'With the HPA output disabled, mute the BUC on TX Chain so the over-temperature module can start cooling. Nothing on the station mutes it for you. This step is timed, and running out of time fails the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-hpa-for-safety'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      // A driven BUC over 70 degC keeps climbing: the second safety step
      timeoutFails: true,
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'diagnose-hpa-overdrive',
      nice: ['T0081', 'T0531'],
      title: 'Diagnose HPA Overdrive',
      description: 'Work out what the 2 dB back-off means for the HPA output before you touch any more controls.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mute-buc-for-cooldown'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'HPA Overdrive Cause',
          params: {
            character: Character.SYSTEM,
            question: 'The HPA back-off has drifted to 2 dB. What does that mean for the output?',
            options: [
              'The output is too close to saturation, so IMD products are rising and the amplifier is at risk',
              'The output is too low, so the amplifier is starving for drive and will trip offline within minutes',
              'The output is correct, because 2 dB is the standard back-off for a full-power uplink on a 36 MHz carrier',
              'The output is muted, because the HPA controller trips the output automatically below 3 dB back-off',
            ],
            correctIndex: 0,
            explanation:
              "Below 3 dB of back-off, the HPA counts as overdriven. At 2 dB it puts out 58 dBm (631 W) with the IM3 (2-tone) readout near -27 dBc, against 50 dBm (100 W) and about -43 dBc at 10 dB. The IMD products spill into adjacent transponders, and the amplifier wears out early. IMD (intermodulation distortion) is the set of unwanted signals an amplifier makes when it's driven too hard. Restore the back-off to the standard 10 dB margin.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'correct-hpa-backoff',
      nice: ['S0677', 'T1567'],
      title: 'Restore HPA Back-off',
      description: 'Set the HPA back-off to the standard 10 dB operating margin on TX Chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-hpa-overdrive'],
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
          type: 'hpa-back-off-set',
          description: 'HPA Back-off at 10 dB',
          params: {
            backOff: 10,
            backOffTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA No Longer Overdriven',
          // The HPA output is still disabled from the safety step; the row reads the back-off, not the output toggle
          params: { allowHpaDisabled: true },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 3: BUC THERMAL RECOVERY
    // ============================================================
    {
      id: 'wait-for-buc-cooling',
      nice: ['T1314', 'K0740'],
      title: 'Allow BUC to Cool',
      description:
        'With the BUC muted, watch the BUC THERMAL readout on TX Chain. The current drops to the 2.6 A idle at once, Trend (1 min) turns negative within about half a minute, and the temperature falls back below the 70°C threshold about a minute after the mute.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['correct-hpa-backoff'],
      timeLimitSeconds: 5 * 60,
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
          type: 'buc-muted',
          description: 'BUC Stays Muted While Cooling',
          mustMaintain: true,
        },
        {
          type: 'buc-temperature-normal',
          description: 'BUC Temperature Below 70°C',
          params: { maxTemperature: 70, requiresObservation: true, observationTab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-current-normal',
          description: 'BUC Current Draw Normal',
          params: { maxCurrentDraw: 4.5, requiresObservation: true, observationTab: 'tx-chain' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: LNB REFERENCE LOCK RECOVERY
    // ============================================================
    {
      id: 'navigate-rx-analysis',
      nice: ['S0421'],
      title: 'Open RX Analysis',
      description: 'Open the RX Analysis panel to work on the LNB fault.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['wait-for-buc-cooling'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'diagnose-lnb-fault',
      nice: ['T0081', 'S0582'],
      title: 'Diagnose LNB Reference Unlock',
      description: 'Work out what kind of LNB fault this is before you act on it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'LNB Fault Type',
          params: {
            character: Character.SYSTEM,
            question: "The GPSDO is locked and the LNB is powered, but the LNB shows reference unlocked. What's the right corrective action?",
            options: [
              'Power cycle the LNB to clear the sticky reference lock fault',
              "Replace the LNB, because the reference input has failed and won't relock",
              'Increase the LNB gain to compensate for the unlocked reference',
              'Switch the LNB to its internal reference to bypass the fault',
            ],
            correctIndex: 0,
            explanation:
              'A sticky reference lock fault clears when you power cycle the LNB. The 10 MHz reference is already available upstream because the GPSDO is locked, so the LNB just needs to re-acquire it. Until it does, its LO free-runs, with around 100 kHz or more of LO error and poor phase noise, and the customer carrier runs about 3 dB down in Es/N0.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-cycle-lnb',
      nice: ['S0677', 'T1567'],
      title: 'Power Cycle the LNB',
      description: 'Power the LNB off, then back on. The sticky fault clears and the LNB re-acquires the reference, but it needs about 90 s to stabilize thermally after power-on.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-lnb-fault'],
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
          // Latches: the cycle has to start with an off (s16 LNB Powered
          // was ticked from the start state). No "powered on" row: the
          // reference lock and thermal rows below can only come true with
          // the LNB back on after the off (the sticky fault clears on power-up)
          type: 'equipment-not-powered',
          description: 'LNB Powered Off',
          params: { equipment: 'lnb' },
          mustMaintain: false,
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
    // ============================================================
    // PHASE 5: TX RESTORATION
    // ============================================================
    {
      id: 'return-to-tx-chain',
      nice: ['S0421'],
      title: 'Return to TX Chain',
      description: 'Open the TX Chain panel again to bring the uplink back online.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-cycle-lnb'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'unmute-buc-restore-tx',
      nice: ['S0677', 'T1567'],
      title: 'Unmute the BUC',
      description: 'With the back-off corrected and the BUC cooled, unmute the BUC first, because the drive comes up before the amplifier.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['return-to-tx-chain'],
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
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-tx-output-clean',
      nice: ['T0153', 'K0740'],
      title: 'Restore HPA Output',
      description: 'Re-enable the HPA output now that the BUC is driving again, then confirm the uplink is clean.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['unmute-buc-restore-tx'],
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
          description: 'HPA Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          // Disabled since the safety step, so enabling it is the change (Q2)
          requiresChange: false,
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
          description: 'Uplink Posture Read',
          params: {
            character: Character.SYSTEM,
            question: 'With back-off at 10 dB and the BUC cool, what does the uplink look like to neighboring transponders now?',
            options: [
              "Clean: IMD products are back below the coordination limits, so we're no longer interfering",
              "Still overdriven: back-off changes output power but doesn't pull IMD back below the limits",
              "Inverted polarization: the mute and unmute cycle flipped the OMT, so we're interfering cross-pol",
              "Reduced power: IMD is down, but the customer link can't meet SLA power at 10 dB back-off",
            ],
            correctIndex: 0,
            explanation:
              "Standard 10 dB back-off (50 dBm, 100 W) puts the IM3 (2-tone) readout near -43 dBc, about 16 dB cleaner than the -27 dBc at 2 dB. That's well below the coordination floor, and the link still meets the service-level agreement (SLA) power.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    {
      id: 'verify-rx-locked',
      nice: ['T0153', 'K0740'],
      title: 'Verify Receiver Locked',
      description:
        'Switch to RX Analysis. With the uplink back on the air, your own carrier comes back down through TIDEMARK-1. Confirm RX modem 1 has reacquired it with a healthy C/N margin of at least 8 dB, now that the LNB is locked.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tx-output-clean'],
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
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above Operating Threshold',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 6: VERIFICATION AND CLOSE-OUT
    // ============================================================
    {
      id: 'final-alarm-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Final Dashboard Sweep',
      description: 'Open the Dashboard tab and confirm the alarm board is clean before you notify the customer.',
      groundStation: 'VT-01',
      // A sweep: every row confirms the recovery the player just made
      intent: 'confirm',
      prerequisiteObjectiveIds: ['verify-rx-locked'],
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
          type: 'buc-temperature-normal',
          description: 'BUC Thermal Normal',
          params: { maxTemperature: 70 },
          mustMaintain: true,
        },
        {
          type: 'buc-current-normal',
          description: 'BUC Current Normal',
          params: { maxCurrentDraw: 4.5 },
          mustMaintain: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Reference Locked',
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Limits',
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'All Clear',
          params: {
            character: Character.SYSTEM,
            question: 'Which statement describes VT-01 after the recovery?',
            options: [
              'All three faults cleared - BUC thermal normal, LNB locked, HPA within back-off - link operational',
              'Two faults cleared - BUC thermal normal, HPA within back-off, LNB still degraded - link returned to service',
              'One fault cleared - HPA within back-off, BUC still warm, LNB still unlocked - link marked partial recovery',
              'No faults cleared - BUC still hot, LNB still unlocked, HPA still overdriven - link down, escalate to Dana',
            ],
            correctIndex: 0,
            explanation: "No warning or critical alarms are left. You addressed all three independent faults in priority order, so you're ready to brief the customer.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'customer-notification',
      nice: ['T1538', 'S0478'],
      title: 'Notify the Customer',
      description: 'Pick the right message to send back to SeaLink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-alarm-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Message',
          params: {
            character: Character.SYSTEM,
            question: 'James Okafor is still on the line. Which message do you send him?',
            options: [
              'Three faults found and cleared in priority order. The link is operational, and a written report follows within the hour.',
              'No faults found on our end after a full board check. The link is operational. Please check the vessel terminals on your side.',
              'Three faults hit VT-01 at once and the link is still degraded. Recovery is under way. Expect an update within the hour.',
              "Equipment failure on VT-01 across three subsystems. The link is down. We're escalating to vendor support, with no restoration ETA yet.",
            ],
            correctIndex: 0,
            explanation:
              'The right message acknowledges the impact, says what was done, and commits to a written follow-up. During an incident, customer communication is half technical and half credibility.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-cascade-event',
      nice: ['T1606', 'K0645'],
      title: 'Log the Cascade Event',
      description: 'Choose the log entry that records this incident correctly.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['customer-notification'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Incident Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which log entry correctly captures this incident?',
            options: [
              'VT-01 concurrent unrelated faults: BUC over-temp (72°C), LNB ref unlock, HPA back-off 2 dB. Cleared in priority order: HPA, BUC, LNB. SeaLink notified.',
              'VT-01 routine maintenance: BUC thermal check (72°C peak), LNB reference reseated, HPA back-off reset to 10 dB. All alarms cleared. SeaLink not notified.',
              'VT-01 single fault: HPA failure (back-off drift to 2 dB) cascaded into BUC over-temp and LNB unlock. HPA replaced, link restored. SeaLink notified.',
              'VT-01 customer report: SeaLink intermittent drops on TM-1. Board checked, BUC, LNB and HPA all within limits. No fault found. SeaLink notified.',
            ],
            correctIndex: 0,
            explanation:
              'Concurrent unrelated faults get logged separately, with the order of recovery and the reason for it: HPA output disabled, BUC muted for cooldown, back-off restored to 10 dB, LNB power cycled, BUC unmuted, HPA restored. The next operator then inherits the trend data and the customer follow-up.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 09:34]</em>
      </p>
      <p>
        "Over here the board is lit up: BUC, LNB and HPA alarms all at once, and James Okafor's on the line about TM-1. I'm stuck in admin for twenty minutes."
      </p>
      <p>
        "You take the lead. Triage first: decide what's most urgent before you touch anything."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/16/intro.mp3'),
    },
    objectives: {
      'triage-dashboard-alarms': {
        text: `
        <p>
          We've been seeing intermittent drops on the North Atlantic route for the last ten minutes. Vessels are losing charter data mid-passage. What's the status?
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.FRUSTRATED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/16/obj-triage.mp3'),
      },
      'mute-buc-for-cooldown': {
        text: `
        <p>
          Good, you took the amplifier off the air before you muted the drive, so the spectrum's clean. The BUC can cool now while you sort out the rest.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/16/obj-mute-buc.mp3'),
      },
      // James thanks you once he has been told, not before the board is swept
      'customer-notification': {
        text: `
        <p>
          Service is back. Thank you. Let me know if it goes sideways again.
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/16/obj-verify-tx.mp3'),
      },
      'log-cascade-event': {
        text: `
        <p>
          You handled three unrelated faults at once, took them in the right order, and kept the customer informed. That's the job at this level.
        </p>
        <p>
          File the impact report before end of shift. Nice work.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/16/obj-log-cascade.mp3'),
      },
    },
  },
};
