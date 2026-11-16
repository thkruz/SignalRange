import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { ME02_HOT_RF_FRONT_END, ME02_TM2_ANTENNA_STATE, ME02_TM2_TRANSMITTER, maineGroundStationOperational, vermontGroundStation } from './ground-stations';
import { tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 13: "Thermal Anomaly"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 5 of 8)
 *
 * Premise: Mid-shift. VT-01 is up on TIDEMARK-1 carrying normal customer
 * traffic. The BUC temperature has been creeping upward for the last
 * ~10 minutes: 57°C -> 62°C, the slope easing to ~+0.3°C/min. No
 * over-temperature alarm (the trip is at 70°C), but the Dashboard carries
 * the "BUC cooling fault - fan/heatsink degraded" warning. BUC current draw
 * is elevated (4.0 A vs 3.1 A at the 23 dB operating gain). Everything else
 * on the station is nominal: GPSDO locked, RX beacon clean, antenna locked,
 * HPA backoff 8 dB and not overdriven.
 *
 * Two causes stack: BUC gain is sitting at 33 dB - 10 dB above the 23 dB
 * operating value (same class of leftover the S12 maintenance crew taught
 * us to look for) - and the slow fan cannot shed the extra dissipation.
 * The gain is the cause the operator can remove live; the fan is why the
 * swap ticket still matters. The right call is to de-rate
 * (reduce BUC gain back to 23 dB) which preserves carrier within SLA
 * margin, lets the BUC cool, and buys time for a planned swap.
 *
 * Alternative responses (swap now, mute and switch to backup, hold and
 * monitor) are not wrong - they're just costlier than necessary for a
 * pre-alarm trend. The lesson is judgment under uncertainty, not a
 * checklist.
 *
 * Tone: Qualified operator. Dana texts the trend flag at the start,
 * checks in once at the decision point, acknowledges the action, and
 * signs off. All knowledge checks are SYSTEM.
 */
export const scenario13Data: ScenarioData = {
  id: 'nats-scenario13',
  prerequisiteScenarioIds: ['nats-scenario12'],
  url: 'nats/scenarios/nats-scenario13',
  imageUrl: 'nats/13/card.png',
  number: 13,
  title: 'Thermal Anomaly',
  subtitle: 'Reading the Trend',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Trend Assessment',
  description: `It's mid-shift on VT-01, and TIDEMARK-1 is carrying normal customer traffic. The BUC temperature trend was flagged at 09:53 with the BUC at 57°C. At 10:03 it reads 62°C and is still rising, now at about a third of a degree per minute. The BUC THERMAL readout on TX Chain shows the curve: Trend (1 min), the 30-minute sparkline, and a rolling 10 min ago readout (it reads 57°C at 10:03 and moves up with the clock). There's no over-temperature alarm yet, only a cooling-fault warning on the BUC fan.<br><br>Nothing else has moved. The GPSDO is locked, the receive beacon is clean, and the HPA is in backoff. The question is whether to act now, schedule a swap and keep going, switch to backup, or hold and monitor.<br><br>The right answer is judgment, not a checklist. Read the trend, pick a course of action, and carry it out without putting the customer in the dark.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational (TIDEMARK-2)'],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // Elevated thermal state - pre-alarm but trending. The root cause
            // is BUC gain set higher than the HPA drive target requires.
            buc: {
              isMuted: false,
              isLoopback: false,
              loFrequency: 7000 as MHz,
              isExtRefLocked: true,
              gain: 33 as dB, // Elevated 10 dB above the 23 dB operating value
              // Higher-rated BUC unit on this chain: keeps the over-gain state
              // pre-alarm (no saturation warning) so the *trend* is the only
              // signal - that's the point of the scenario.
              saturationPower: 28 as dBm,
              // Temperature comes from the 'vt-buc-thermal' fault below: the
              // thermal model overwrites a seeded start value every update
              // (nats-s13-F1). Current needs no seed: at 33 dB gain the model
              // settles at ~4.0 A, at 23 dB ~3.1 A.
            },
            hpa: {
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
              backOff: 8 as dB, // Slightly tight but not overdriven
            },
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 60,
            },
          }),
        ],
      },
      // ME-02 carrying TIDEMARK-2 in the background (nats-r2-s13-F2): with its
      // TX cold and nothing in its passband, the ticker showed "ME-02(RF1): AGC
      // on noise only" all shift on a VT-01-only story. On TM-2 with its hub
      // carrier keyed, as in S16, Maine is the quiet sister station the brief
      // implies.
      {
        ...maineGroundStationOperational,
        antennasState: [ME02_TM2_ANTENNA_STATE],
        rfFrontEnds: [ME02_HOT_RF_FRONT_END],
        transmitters: [ME02_TM2_TRANSMITTER],
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-13?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    // Brief: Wednesday, 1003 Local
    scenarioStartDate: '2026-02-04',
    scenarioStartWallTime: '10:03:00',
    // Degraded BUC cooling (phase 19.6 physics): a slow fan multiplies the
    // heatsink's 0.30 degC/W by 1.38. At 33 dB the BUC puts out 25.7 dBm and
    // draws 4.04 A (97 W from 24 V), so it heads for 25 + 1.38 x 0.30 x 96.6 =
    // 65 degC: from 62 that is a ~0.3 degC/min climb (10 min time constant).
    // At the 23 dB operating gain (3.07 A, 74 W) the target is 55.5 degC, so
    // the de-rate turns the curve at once (Trend (1 min) goes negative within
    // ~30 s) and it passes 61 degC about 3 min later: 10 ln((T0 - 55.5) / 5.5)
    // min, 2.1 min from 62.3, 2.8 from 62.8, 3.5 from 63.3 (r3: 3:05 from
    // 62.8). Never reaches the 70 degC trip.
    hardwareFaultEvents: [
      {
        id: 'vt-buc-thermal',
        groundStationId: 'VT-01',
        target: 'buc-overtemp',
        startTime: 0,
        params: { startTemperatureC: 62, coolingFactor: 1.38 },
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
      title: 'Review Shift Brief',
      description: 'Open the shift brief to see the trend flag and the customer context.',
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
          description: 'Ready to Assess',
          params: {
            character: Character.SYSTEM,
            question: "You've reviewed the brief. Are you ready to assess the BUC trend?",
            options: ['Yes - moving to VT-01 to read the equipment.'],
            correctIndex: 0,
            explanation: "The shift clock is running. This is a pre-alarm trend, so there's no time pressure, but there's no reason to dawdle either.",
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: OBSERVATION
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
      id: 'confirm-no-active-alarm',
      nice: ['T0153', 'K0741'],
      title: 'Confirm Pre-Alarm State',
      description: "Check the Dashboard and confirm the BUC hasn't tripped its over-temperature alarm yet.",
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
          description: 'Alarm Threshold Awareness',
          params: {
            character: Character.SYSTEM,
            question: 'The BUC over-temperature trip is at 70°C, and the current reading is 62°C. What does that mean for your decision timeline?',
            options: [
              'Pre-alarm - you have time to choose a deliberate action instead of a reflexive one',
              'Already in alarm - the 62°C reading means the BUC must be muted right now',
              'No relevance - the 70°C trip point is fixed and the slope does not change it',
              'Threshold raised - the maintenance crew moved the trip point, so ignore the reading',
            ],
            correctIndex: 0,
            explanation:
              "A pre-alarm trend is the best time to act, because acting at the alarm means you're already late. The BUC cooling-fault warning on the board (fan/heatsink degraded) is a maintenance flag, not the trip.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'open-tx-chain',
      nice: ['T0153', 'K0740'],
      title: 'Open the TX Chain',
      description: 'Switch to the TX Chain view so you can read live BUC telemetry.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-no-active-alarm'],
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
      id: 'read-buc-temp-trend',
      nice: ['T0153', 'K0064'],
      title: 'Read the Temperature Trend',
      description: 'Read the BUC temperature and its trend on the TX Chain THERMAL readout (Temp, Trend (1 min), 10 min ago and the 30-minute curve), then call the trend.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Trend Projection',
          params: {
            character: Character.SYSTEM,
            // Read off the panel, not the stem (nats-r3-s13-F1): Temp ~62.3 and
            // Trend (1 min) ~+0.27-0.30 C/min in the first two minutes, so
            // (70 - T) / slope = 25-30 min, drifting toward 35 as the slope eases
            question: 'Read Temp and Trend (1 min) on the BUC THERMAL readout. If that slope held, when would the BUC reach the 70°C trip?',
            options: [
              'In about half an hour (25-35 minutes) if nothing changes',
              'Already past it - the dashboard alarm is suppressed',
              'Never - thermal trends always self-stabilize before trip',
              'In a few seconds - the slope accelerates exponentially',
            ],
            correctIndex: 0,
            explanation:
              "That's a straight-line extrapolation: about 8°C of headroom at about +0.3°C/min is roughly half an hour. The slope has been easing, though: the 10 min ago readout shows about 57°C, from when the BUC was climbing nearer 0.8°C/min. So half an hour is the worst case, not a forecast. The unit may level off short of the trip, or it may not, and either way there's time for a deliberate response.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'check-current-draw',
      nice: ['T0153', 'S0672'],
      title: 'Cross-Check Current Draw',
      description: 'Read the BUC current draw and work out what it tells you about the cause of the heat.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['read-buc-temp-trend'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Current Draw Interpretation',
          params: {
            character: Character.SYSTEM,
            question: 'The BUC current draw is 4.0 A, against about 3.1 A at the 23 dB operating gain. What does the elevated current tell you?',
            options: [
              'BUC is dissipating more power as heat - consistent with the thermal rise, not a separate fault',
              'Power supply is failing - it is pushing extra current into the module as a separate fault',
              'Current is unrelated to thermal state - the heat source is elsewhere, so check LNB telemetry instead',
              'BUC is in over-current shutdown - 4.0 A is past the protection limit and the output is off',
            ],
            correctIndex: 0,
            explanation: "Heat in an amplifier comes from electrical power that doesn't leave as RF. Higher current and higher temperature are one story, not two.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'cross-check-spectrum',
      nice: ['T0153', 'K0773'],
      title: 'Rule Out an RX-Side Fault',
      description:
        'Open RX Analysis and read the receive side: the TIDEMARK-1 beacon on the analyzer, and the RX modem lock and C/N for your own carrier. If the receive side is clean, the trend is isolated to the transmit chain.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['check-current-draw'],
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
          // Read quiz in place of the 5 s dwell (Phase 27 Q3, s13-F3). Own
          // carrier on TIDEMARK-1 reads 14.0 dB raw C/N in the ledger
          // (nats-scenario13.json), locked with ~9.7 dB Es/N0 margin; the
          // BUC heat does not touch the receive chain.
          type: 'status-check',
          description: 'RX Side Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does the receive side show on RX Analysis right now?',
            options: [
              'Beacon steady on the analyzer, RX modem locked at about 14 dB C/N - the receive chain is clean',
              'Beacon steady, but the RX modem is unlocked below 5 dB C/N - the BUC heat is already reaching the customer',
              'Beacon gone from the analyzer, RX modem locked at about 14 dB - the antenna has drifted off TIDEMARK-1',
              'Beacon steady, RX modem locked at about 3 dB C/N - the link is one fade away from dropping',
            ],
            correctIndex: 0,
            explanation:
              "The beacon is where it always is, and your own carrier comes back through TIDEMARK-1 locked at about 14 dB C/N, nearly 10 dB above what QPSK 3/4 needs. Nothing on the receive side moved, so the trend is a transmit-chain story and the customer isn't feeling it.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'record-baseline-readings',
      nice: ['K0645', 'K0740'],
      title: 'Record Baseline Readings',
      description: 'Note the current state before you act, because anyone reading the log later needs the trend curve and not just the outcome.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['cross-check-spectrum'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'What to Capture',
          params: {
            character: Character.SYSTEM,
            question: 'Before you act, which set of readings belongs in the log to make this trend reconstructable later?',
            options: [
              'Time, BUC temperature, BUC current, BUC gain, HPA backoff - the next operator can rebuild the curve',
              'BUC temperature and time only - current, gain and backoff are all derivable from the curve',
              'Customer SLA metrics, carrier C/N, modem lock - the equipment state is not what the log is for',
              'A dashboard screenshot at 62°C plus the 70°C trip point - one picture captures the whole state at once',
            ],
            correctIndex: 0,
            explanation:
              "A trend record is only useful if someone else can replay it, so capture the inputs and not just the outputs. Temperature and time alone can't show why the BUC heated up.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 2: DIAGNOSIS & JUDGMENT
    // ============================================================
    {
      id: 'identify-root-cause',
      nice: ['S0672', 'K0064'],
      title: 'Name the Root Cause',
      description: 'Everything else on the station is nominal except the BUC. Pick the most likely root cause.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['record-baseline-readings'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Root Cause Hypothesis',
          params: {
            character: Character.SYSTEM,
            question:
              'The BUC gain is 33 dB, but the operating value for this chain is 23 dB. The Dashboard also carries a BUC cooling-fault warning (fan/heatsink degraded). What explains the thermal trend?',
            options: [
              'Excess gain on a weak fan - 10 dB over the operating value adds heat the degraded fan cannot shed',
              'BUC is failing internally - the gain reading is a symptom, and only a swap makes the chain safe',
              'HPA is overdriven at 8 dB backoff - it is bleeding heat backward into the BUC through the drive path',
              'Ambient temperature in the equipment room is rising - the gain setting is a coincidence, not the cause',
            ],
            correctIndex: 0,
            explanation:
              'Two causes stack. At 33 dB the BUC draws 4.0 A against 3.1 A at 23 dB, and with a healthy fan that alone would settle in the mid-50s. The degraded fan pushes the same dissipation toward the mid-60s. The gain is the cause you can remove live, and the fan is why the swap ticket still matters.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'evaluate-options',
      nice: ['K0721', 'S0672'],
      title: 'Choose a Course of Action',
      description: 'There are four options on the table. Pick the one that fixes the cause at the lowest cost for a pre-alarm trend.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-root-cause'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Operational Response',
          params: {
            character: Character.SYSTEM,
            question: 'You have time. The trend is real but pre-alarm. Which response addresses the root cause at the lowest customer cost?',
            options: [
              'De-rate now - cut BUC gain ~10 dB, watch the trend reverse, book a swap for the next window',
              'Swap now - take the carrier down, have maintenance replace the module, restore service on the new unit',
              'Mute and switch - move traffic to the backup modem chain now, let the BUC cool with no drive on it',
              'Hold and monitor - 8°C of headroom is enough, thermal trends usually flatten before the trip point',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              'De-rating cuts the dissipation at its source without taking the customer down. Swapping now is overspending, and muting and switching is an overreaction. Holding and monitoring bets the customer on a curve that has eased but not stopped, on a unit with a degraded fan.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'confirm-action-plan',
      nice: ['T1314', 'K0721'],
      title: 'Confirm the Sequence',
      description: 'Pick the correct de-rate sequence before you touch the gain knob.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['evaluate-options'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'De-Rate Sequence',
          params: {
            character: Character.SYSTEM,
            question: 'What is the correct sequence for the de-rate?',
            options: [
              'Lower BUC gain ~10 dB, check the HPA is still linear, check the carrier, then watch the temperature curve',
              'Mute the BUC, lower the gain ~10 dB, verify carrier returns after unmute, then watch the temperature curve',
              'Lower BUC gain to 0 dB in one step, ramp back up to 23 dB, verify carrier, then watch the temperature curve',
              'Open the swap ticket first, hold the gain at 33 dB, change gain only on the new module, then watch the curve',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              "Live adjustment is safe, because the HPA raises its own gain by the 10 dB you take out of the BUC, which holds the output and the customer EIRP steady. That's the HPA's ALC, its automatic level control. Muting would interrupt the customer, and ramping up from 0 dB is unnecessary theater.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 3: EXECUTION
    // ============================================================
    {
      id: 'reduce-buc-gain',
      nice: ['T1314', 'S0421'],
      title: 'De-Rate the BUC',
      description: 'Lower the BUC gain from 33 dB back to the 23 dB operating value.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-action-plan'],
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
          type: 'buc-gain-set',
          description: 'BUC Gain Reduced to ~23 dB',
          params: { gain: 23, gainTolerance: 2 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-hpa-headroom',
      nice: ['T0431', 'K0740'],
      title: 'Verify HPA Still Linear',
      description: 'Stay on TX Chain and read the BUC and HPA panels now that the gain has changed: BUC Output and P1dB Margin, then HPA Output, Back-off and Overdrive.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['reduce-buc-gain'],
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
          type: 'hpa-not-overdriven',
          description: 'HPA Within Linear Region',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Output Not Saturated',
          params: {},
          mustMaintain: true,
        },
        {
          // Read quiz in place of the 5 s dwell (Phase 27 Q3, s13-F3). Ledger
          // (nats-scenario13.json): -7 dBm into the BUC, 33 dB -> 25.7 dBm out
          // (P1dB 28, margin 2.3 dB). At 23 dB: ~15.7-16.0 dBm, margin
          // ~12.0-12.3 dB. The HPA ALC holds 52.0 dBm at 8.0 dB back-off.
          type: 'status-check',
          description: 'TX Chain Read',
          params: {
            character: Character.SYSTEM,
            question: 'What do the BUC and HPA panels read now that the gain is back at 23 dB?',
            options: [
              'BUC output about 16 dBm, P1dB margin about 12 dB; HPA output still 52 dBm at 8 dB back-off, Overdrive Normal',
              'BUC output about 26 dBm, P1dB margin about 2 dB; HPA output 52 dBm - the gain change has not taken',
              'BUC output about 16 dBm, P1dB margin about 12 dB; HPA output down to 42 dBm at 18 dB back-off - the customer lost 10 dB',
              'BUC output about 16 dBm, P1dB margin about 12 dB; HPA in OVERDRIVE - the ALC is at its gain limit',
            ],
            correctIndex: 0,
            explanation:
              "The BUC dropped 10 dB, from about 2 dB under its P1dB to about 12 dB under it, so there's no saturation risk and 10 dB less to dissipate. The HPA's ALC raised its own gain by the same 10 dB, so its output, back-off and IM3 didn't move. The customer EIRP is unchanged.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-trend-stabilizing',
      nice: ['T0153', 'T0431'],
      title: 'Confirm the Trend Is Bending',
      description:
        'Watch the BUC THERMAL readout on TX Chain until the curve turns over. The current draw should fall under 3.2 A within seconds, and the temperature should drop below 61°C about 3 minutes after the de-rate. Then pick the evidence that confirms the de-rate took.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-headroom'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        // The curve has to actually bend on the panel (nats-s13-F3): the
        // de-rate drops the thermal target to ~56 degC, so from ~62-63 degC
        // the reading passes 61 in about 3 minutes (2-4; r2 and r3: ~3 min)
        {
          type: 'buc-temperature-normal',
          description: 'BUC Temperature Below 61°C',
          params: { maxTemperature: 61, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-current-normal',
          description: 'BUC Current Under 3.2 A',
          params: { maxCurrentDraw: 3.2, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Evidence of Success',
          params: {
            character: Character.SYSTEM,
            question: 'How do you know the de-rate worked before you log the shift?',
            options: [
              'Watch a few minutes: current falls at once, Trend (1 min) turns negative, temperature passes 61°C',
              'Trust the first reading: current drops the moment the gain changes, so the temperature needs no watching at all',
              'Check the setpoint: gain reads 23 dB and HPA output is unchanged, so no thermal verification is needed beyond that',
              'Mute and re-measure: carrier off for a minute, cold-start temperature recorded, then unmute and compare readings',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              'Current answers in seconds, and Trend (1 min) goes negative within about half a minute. The temperature lags because of the thermal mass (about a 10-minute time constant), so from 62-63°C it takes about 3 minutes to pass 61°C and then keeps easing toward the mid-50s. Watch the curve, not a single reading.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: SCHEDULE & DOCUMENT
    // ============================================================
    {
      id: 'schedule-maintenance-ticket',
      nice: ['K0645', 'T1314'],
      title: 'Open the Maintenance Ticket',
      description: 'Choose the right contents for the swap ticket, so the maintenance crew has what they need.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-trend-stabilizing'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Ticket Contents',
          params: {
            character: Character.SYSTEM,
            question: 'What belongs in the BUC swap ticket for the next planned maintenance window?',
            options: [
              'Trend record, cooling-fault warning, de-rate action taken, gain and backoff settings, swap for the next planned window',
              'Symptom only (BUC running hot), current temperature reading, no settings - the crew will pull their own telemetry',
              'Full RF front end replacement (BUC, HPA, LNB), current temperature reading, request for the earliest available window',
              'Trend record (10-min curve), note that de-rate resolved it, no swap needed - close the ticket once the temperature settles',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              "A ticket is a handoff, so the next person needs context and not a verdict. The trend, the cooling-fault warning, the action you took and the settings let the crew judge for themselves. Closing the ticket after the de-rate would drop the fan problem, which a de-rate doesn't fix.",
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
      description: 'Take a final look at the Dashboard before you close the shift entry.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['schedule-maintenance-ticket'],
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
          description: 'Final State Summary',
          params: {
            character: Character.SYSTEM,
            question: 'What is the final state of VT-01 after the action?',
            options: [
              'Only the BUC cooling-fault warning, BUC de-rated, carrier nominal, swap ticket open for the next planned window',
              'BUC over-temperature alarm active, carrier muted, customer down, swap ticket open against next planned window',
              'No active alarms, BUC swapped on-shift, customer briefly down during the swap, maintenance ticket closed',
              'No active alarms, BUC gain unchanged at 33 dB, carrier nominal, hold and monitor still in effect for next shift',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              "That's the clean summary. The fan warning stays until the swap, the trend is addressed at its source, the customer never noticed, and the next crew has a clear handoff.",
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
      title: 'Log the Shift Entry',
      description: 'Pick the entry that correctly records this action in the operations log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['final-dashboard-sweep'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly records this action in the operations log?',
            options: [
              '1003 - VT-01 BUC thermal trend (57->62°C, fan degraded) addressed by 10 dB gain de-rate. Trend reversing, swap ticket open, carrier nominal.',
              '1003 - VT-01 BUC failure (over-temperature alarm at 70°C) forced BUC mute. Customer outage logged, swap ticket open, carrier restored.',
              '1003 - VT-01 BUC thermal trend (57->62°C over 10 min) noted. Hold and monitor, no action taken, next shift to reassess, carrier nominal.',
              '1003 - VT-01 BUC thermal trend (57->62°C over 10 min) addressed by on-shift BUC swap. Customer briefly down, ticket closed, carrier restored.',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'A good entry records the trend, the action, the evidence that it worked and the open ticket, all in one line. The other entries get one of those wrong.',
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
        <em>[Text message from Dana at 10:03]</em>
      </p>
      <p>
        "The temperature trend flagged the BUC on VT-01. It's up from 57 to 62 degrees over the last ten minutes with no alarm yet, and the curve is on the TX Chain tab. The carrier is fine. Take a look and decide what you want to do. I trust your read."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/13/intro.mp3'),
    },
    objectives: {
      'identify-root-cause': {
        text: `
        <p>
          Take your time on this one. I'd rather you pick the right action than the fast one. Walk me through what you want to do.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/13/obj-identify-root-cause.mp3'),
      },
      'verify-trend-stabilizing': {
        text: `
        <p>
          Good call on the de-rate. Get the ticket open before end of shift so maintenance can pick the swap up on the next planned window. Don't let it slip.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/13/obj-verify-trend-stabilizing.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          The trend's bending, and the customer never knew anything happened. That's the job: catch it on the curve, not at the alarm.
        </p>
        <p>
          I'll see you tomorrow.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/13/obj-log-shift-summary.mp3'),
      },
    },
  },
};
