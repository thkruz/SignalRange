import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 16: "Cascade Failure"
 *
 * Phase: Qualified Operations (Phase 2 capstone, Scenario 8 of 8)
 * Time Pressure: Moderate-high (35-45 min, customer pressure)
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
 *   1. BUC over-temperature (>70°C, high current draw - needs a mute to
 *      cool down)
 *   2. LNB reference unlock (sticky fault, clears on power cycle)
 *   3. HPA backoff drift (back-off dropped to 2 dB, HPA is overdriven)
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
  duration: '35-45 min',
  difficulty: 'advanced',
  missionType: 'Incident Response',
  description: `Two minutes into your shift and the alarm board is lit up. BUC over-temperature, LNB reference unlocked, HPA overdriven - all on VT-01, all at once. The TIDEMARK-1 customer link is degraded and James Okafor from SeaLink is on the line.<br><br>None of these faults are related. You have to triage them in the right order: protect the equipment and the spectrum first, restore customer impact next, then methodically clear each fault.<br><br>Dana is in the admin office. She trusts you with this one.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Operational (TIDEMARK-2)',
  ],
  timeLimitSeconds: 45 * 60, // 45 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // BUC: over-temperature, drawing high current, not yet muted
            buc: {
              isPowered: true,
              isMuted: false,
              isLoopback: false,
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 23 as dB,
              temperature: 72, // Over the 70°C alarm threshold
              currentDraw: 4.8, // Above 4.5 A alarm threshold
            },
            // HPA: backoff has drifted down, output is overdriven
            hpa: {
              isPowered: true,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
              backOff: 2, // Below 3 dB threshold -> isOverdriven true
              outputPower: 53 as dBm,
              isOverdriven: true,
              imdLevel: -26, // Poor IMD due to overdrive
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
      // ME-02 carrying TIDEMARK-2 in the background - unaffected by VT-01 faults
      {
        ...maineGroundStation,
        isOperational: true,
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-16?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Incident Brief',
      description: 'Open the incident brief and acknowledge you are taking the lead on the response.',
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
            question: 'Three concurrent alarms on VT-01 and SeaLink is on the line. How will you proceed?',
            options: [
              'Triage all alarms first, then act in priority order: RF safety, customer impact, equipment health',
              'Fix whichever fault is easiest to clear first to reduce the alarm count',
              'Wake Dana and wait for direction before touching anything',
              'Power cycle the entire RF chain to reset everything at once',
            ],
            correctIndex: 0,
            explanation: 'Triage before action. Knowing all three faults lets you pick the order that protects equipment and the spectrum first.',
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
      description: 'Open the Dashboard and confirm what is actually broken.',
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
              'BUC over-temperature and high current, LNB reference unlocked, HPA overdriven',
              'BUC reference unlock and LNB high current draw only',
              'HPA over-temperature and antenna tracking lost',
              'GPSDO holdover and modem fault on TX Modem 1',
            ],
            correctIndex: 0,
            explanation: 'Three concurrent, unrelated alarms. The BUC and HPA conditions threaten the equipment and the uplink spectrum; the LNB condition is degrading the customer receive.',
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
      description: 'Decide the order of operations before touching any equipment.',
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
              'LNB first because the customer is calling',
              'BUC first because the over-temperature could be permanent damage',
              'Whichever one is easiest to clear to reduce the alarm count',
            ],
            correctIndex: 0,
            explanation: 'An overdriven HPA is putting a dirty signal on the spectrum and risking the amplifier. Disable the HPA output, mute the BUC for cooldown, fix the backoff, then turn to the LNB to restore the customer downlink.',
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
      description: 'Navigate to the TX Chain panel.',
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
      description: 'Disable the HPA output to take the overdriven signal off the antenna. Amplifier comes down before its drive does - same sequencing rule as a planned power-down.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain'],
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
          description: 'HPA Output Disabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'status-check',
          description: 'Why HPA First',
          params: {
            character: Character.SYSTEM,
            question: 'Why is disabling the HPA output the correct first action - before muting the BUC?',
            options: [
              'It takes the dirty uplink off the air immediately, and an enabled HPA must never be left without BUC drive - it would amplify raw noise into the feed',
              'The HPA controls the BUC - disabling it automatically mutes the BUC too',
              'Disabling the HPA clears the LNB reference fault as a side effect',
              'Order does not matter as long as both end up off',
            ],
            correctIndex: 0,
            explanation: 'Same rule as every planned power-down: amplifier off before drive off. Killing the HPA stops the overdriven signal AND keeps the chain safe for the BUC mute that comes next. Mute the BUC first and the enabled HPA amplifies noise into the feed.',
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
      title: 'Mute the BUC',
      description: 'With the HPA output disabled, mute the BUC so the over-temperature module can begin cooling.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-hpa-for-safety'],
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
      description: 'Identify why the HPA was overdriven before you touch any more controls.',
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
              'Output is too close to saturation - IMD products are rising and the amplifier is at risk',
              'Output is too low - the amplifier is starving and will trip offline',
              'Output is correct - 2 dB is standard back-off for full-power uplinks',
              'Output is muted automatically by the HPA controller',
            ],
            correctIndex: 0,
            explanation: 'Below 3 dB back-off, the HPA is overdriven. IMD products spill into adjacent transponders and the amplifier wears prematurely. Restore back-off to the standard 10 dB margin.',
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
      description: 'Set the HPA back-off to the standard 10 dB operating margin.',
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
      description: 'With the BUC muted, the temperature will trend down. Wait for it to return below the 70°C threshold.',
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
          params: { maxTemperature: 70 },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-current-normal',
          description: 'BUC Current Draw Normal',
          params: { maxCurrentDraw: 4.5 },
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
      description: 'Switch to the RX Analysis panel to work the LNB fault.',
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
      description: 'Confirm what kind of LNB fault you are looking at before acting.',
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
            question: 'The GPSDO is locked and the LNB is powered, but the LNB shows reference unlocked. What is the right corrective action?',
            options: [
              'Power cycle the LNB to clear the sticky reference lock fault',
              'Replace the LNB - the reference input has failed',
              'Increase LNB gain to compensate for the unlock',
              'Switch the LNB to internal reference mode',
            ],
            correctIndex: 0,
            explanation: 'A sticky reference lock fault clears on power cycle. The 10 MHz reference is available upstream (GPSDO locked); the LNB just needs to re-acquire.',
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
      description: 'Power off the LNB, then power it back on. The sticky fault will clear and the LNB will re-acquire the reference.',
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
      id: 'verify-rx-locked',
      nice: ['T0153', 'K0740'],
      title: 'Verify Receiver Locked',
      description: 'Confirm the receiver has reacquired TIDEMARK-1 with a healthy C/N margin.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-cycle-lnb'],
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
    // PHASE 5: TX RESTORATION
    // ============================================================
    {
      id: 'return-to-tx-chain',
      nice: ['S0421'],
      title: 'Return to TX Chain',
      description: 'Switch back to the TX Chain panel to bring the uplink back online.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-locked'],
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
      description: 'With back-off corrected and the BUC cooled, unmute the BUC first - drive comes up before the amplifier.',
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
        {
          type: 'buc-temperature-normal',
          description: 'BUC Temperature Still Normal',
          params: { maxTemperature: 70 },
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
      description: 'Re-enable the HPA output now that the BUC is driving again, and confirm the uplink is clean.',
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
          description: 'Spectrum Posture Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'With back-off at 10 dB and the BUC cool, what does the uplink look like to neighboring transponders now?',
            options: [
              'Clean - IMD products are back below coordination limits and we are no longer interfering',
              'Still overdriven - back-off does not affect IMD on the spectrum',
              'Inverted polarization - the mute/unmute cycle flipped the OMT',
              'Reduced power - the customer link cannot meet SLA at 10 dB back-off',
            ],
            correctIndex: 0,
            explanation: 'Standard 10 dB back-off keeps IMD products well below the coordination floor while still meeting SLA power.',
            pointPenalty: 5,
          },
          mustMaintain: false,
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
      description: 'Confirm the alarm board is clean before notifying the customer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-tx-output-clean'],
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
            question: 'Summarize the post-recovery state of VT-01.',
            options: [
              'All three faults cleared - BUC thermal normal, LNB locked, HPA within back-off - link operational',
              'BUC cleared, LNB still degraded - acceptable to return to service',
              'HPA cleared, BUC and LNB still degraded - mark as partial recovery',
              'All faults still active - escalate immediately',
            ],
            correctIndex: 0,
            explanation: 'Clean board. All three independent faults addressed in priority order. Ready to brief the customer.',
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
      description: 'Choose the right message to send back to SeaLink.',
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
            question: 'James Okafor is still on the line. Which message is the right one?',
            options: [
              'Three concurrent faults identified and cleared in priority order. Link is operational. Will follow up with a written impact report within the hour.',
              'Everything looks fine on our end. Probably a problem on your side.',
              'We had a major outage and the link is still degraded. Stand by.',
              'Equipment failure - we are escalating to vendor support and have no ETA.',
            ],
            correctIndex: 0,
            explanation: 'Acknowledge the impact, state what was done, commit to written follow-up. Customer comms during incidents is half technical, half credibility.',
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
      description: 'Select the correct entry for the incident log.',
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
              'Concurrent unrelated faults VT-01: BUC over-temp (72°C, high I), LNB ref unlock (sticky), HPA back-off drift (2 dB). Recovery in order: HPA output disabled, BUC muted for cooldown, back-off restored to 10 dB, LNB power cycled, BUC unmuted, HPA restored. Customer (SeaLink) notified.',
              'VT-01 alarms cleared. Routine maintenance complete.',
              'Single fault: HPA failure. Replaced amplifier.',
              'Customer reported issue - no fault found at ground station.',
            ],
            correctIndex: 0,
            explanation: 'Concurrent unrelated faults must be logged separately with the order and rationale of recovery. The next operator inherits the trend data and the customer follow-up.',
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
        "Board over here is lit up - BUC, LNB, HPA all yelling. James Okafor's on the line about TM-1 service. I'm in admin and can't break free for the next twenty minutes."
      </p>
      <p>
        "Take the lead. Triage before you touch anything."
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
          Good sequencing - amp down before the drive. Spectrum's clean and the BUC can cool while you sort the rest.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/16/obj-mute-buc.mp3'),
      },
      'verify-tx-output-clean': {
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
          Three unrelated faults in two minutes, prioritized correctly, customer kept informed. That's the job at this level.
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
