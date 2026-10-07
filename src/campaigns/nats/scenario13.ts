import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
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
  description: `Mid-shift on VT-01. TIDEMARK-1 carrying normal customer traffic. The station's BUC temperature log flagged something ten minutes ago (the readings are in the brief's trend table): BUC temperature has climbed from 57°C to 62°C and is still rising, now about a third of a degree per minute. No over-temperature alarm yet, just a cooling-fault warning on the BUC fan.<br><br>Nothing else has moved. GPSDO locked, RX beacon clean, HPA in backoff. The question is whether to act now, schedule a swap and keep going, switch to backup, or hold and monitor.<br><br>The right answer is judgment, not a checklist. Read the trend, pick a course of action, and execute it without putting the customer in the dark.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational'],
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
      { ...maineGroundStation, isOperational: true },
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
    // the de-rate turns the curve at once and it passes 61 degC in 2-3 min,
    // never reaching the 70 degC trip.
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
            question: 'Brief reviewed. Ready to assess the BUC trend?',
            options: ['Yes - moving to VT-01 to read the equipment.'],
            correctIndex: 0,
            explanation: 'Shift clock running. Pre-alarm trend - no time pressure, but no reason to dawdle either.',
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
      description: 'Check the Dashboard. Confirm the BUC has not tripped its over-temperature alarm yet.',
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
            question: 'BUC over-temperature trip is at 70°C. Current reading is 62°C. What does that mean for your decision timeline?',
            options: [
              'Pre-alarm - you have time to choose a deliberate action instead of a reflexive one',
              'Already in alarm - the 62°C reading means the BUC must be muted right now',
              'No relevance - the 70°C trip point is fixed and the slope does not change it',
              'Threshold raised - the maintenance crew moved the trip point, so ignore the reading',
            ],
            correctIndex: 0,
            explanation:
              'Pre-alarm trends are the ideal time to act. Acting at alarm means you are already late. The BUC cooling-fault warning on the board (fan/heatsink degraded) is a maintenance flag, not the trip.',
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
      description: 'Switch to the TX Chain view to read live BUC telemetry.',
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
      description: 'Read the BUC temperature against the 10-minute history shown in the brief and call the trend.',
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
            question: 'BUC temperature is 62°C (57°C ten minutes ago) and still rising at about +0.3°C/min. If that slope holds, when does it cross the 70°C trip?',
            options: [
              'Roughly 25-30 minutes from now if nothing changes',
              'Already past it - the dashboard alarm is suppressed',
              'Never - thermal trends always self-stabilize before trip',
              'In a few seconds - the slope accelerates exponentially',
            ],
            correctIndex: 0,
            explanation:
              'Linear extrapolation: 8°C of headroom at +0.3°C/min is roughly 25 minutes. The slope has been easing, so that is the worst case, not a forecast - the unit may level off short of the trip, or may not. Either way there is time for a deliberate response.',
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
      description: 'Read BUC current draw and interpret what it tells you about the cause of the heat.',
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
            question: 'BUC current draw is 4.0 A (about 3.1 A at the 23 dB operating gain). What does the elevated current tell you?',
            options: [
              'BUC is dissipating more power as heat - consistent with the thermal rise, not a separate fault',
              'Power supply is failing - it is pushing extra current into the module as a separate fault',
              'Current is unrelated to thermal state - the heat source is elsewhere, so check LNB telemetry instead',
              'BUC is in over-current shutdown - 4.0 A is past the protection limit and the output is off',
            ],
            correctIndex: 0,
            explanation: 'Heat in an amplifier comes from electrical power that does not leave as RF. Higher current + higher temperature is one story, not two.',
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
      description: 'Open RX Analysis and watch the TIDEMARK-1 beacon for a few seconds. If the RX side is clean, the trend is isolated to the TX chain.',
      groundStation: 'VT-01',
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
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Still Present',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
            // A look, not a glance: the beacon must read clean for 5 s (nats-s13-F3)
            observationDwellSeconds: 5,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'record-baseline-readings',
      nice: ['K0645', 'K0740'],
      title: 'Record Baseline Readings',
      description: 'Note the current state before you act. Anyone reading the log later needs the trend curve, not just the outcome.',
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
            explanation: 'Trend records are only useful if someone else can replay them. Capture the inputs, not just the outputs.',
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
      description: 'All inputs are nominal except the BUC. Identify the most likely root cause.',
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
              'BUC gain is 33 dB; the operating value for this chain is 23 dB. The Dashboard also carries a BUC cooling-fault warning (fan/heatsink degraded). What explains the thermal trend?',
            options: [
              'Excess gain on a weak fan - 10 dB over the operating value adds dissipation the degraded fan cannot shed',
              'BUC is failing internally - the gain reading is a symptom, and only a swap makes the chain safe',
              'HPA is overdriven at 8 dB backoff - it is bleeding heat backward into the BUC through the drive path',
              'Ambient temperature in the equipment room is rising - the gain setting is a coincidence, not the cause',
            ],
            correctIndex: 0,
            explanation:
              'Two causes stack. At 33 dB the BUC draws 4.0 A against 3.1 A at 23 dB; with a healthy fan that alone would settle in the mid-50s. The degraded fan pushes the same dissipation toward the mid-60s. The gain is the cause you can remove live; the fan is why the swap ticket still matters.',
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
      description: 'Four options on the table. Pick the one with the right cost-to-effect ratio for a pre-alarm trend.',
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
              'De-rate now - reduce BUC gain ~10 dB, watch the trend reverse, schedule a swap for the next planned window',
              'Swap now - take the carrier down, have maintenance replace the module, restore service on the new unit',
              'Mute and switch - move traffic to the backup modem chain now, let the BUC cool with no drive on it',
              'Hold and monitor - 8°C of headroom is enough, thermal trends usually flatten before the trip point',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              'De-rating cuts the dissipation at its source without taking the customer down. Swap-now is over-spend; mute-and-switch is over-reaction; hold-and-monitor bets the customer on a curve that has eased but not stopped, on a unit with a degraded fan.',
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
      description: 'Spell out the de-rate sequence before you touch the gain knob.',
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
              'Lower BUC gain ~10 dB, verify HPA still linear, verify carrier still nominal, then watch the temperature curve',
              'Mute the BUC, lower the gain ~10 dB, verify carrier returns after unmute, then watch the temperature curve',
              'Lower BUC gain to 0 dB in one step, ramp back up to 23 dB, verify carrier, then watch the temperature curve',
              'Open the swap ticket first, hold the gain at 33 dB, change gain only on the new module, then watch the curve',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              'Live adjustment is safe: the HPA ALC holds its output, and the customer EIRP, by raising its own gain by the 10 dB you take out of the BUC. Muting would interrupt the customer; ramping from 0 is unnecessary theater.',
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
      description: 'Lower BUC gain back to the 23 dB operating value (down from 33 dB).',
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
      description:
        'Stay on TX Chain and read the HPA and BUC panels after the change: HPA output and back-off unchanged (the ALC raised its gain by 10 dB), HPA not overdriven, BUC output below saturation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['reduce-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Linear Region',
          // Read on the panel, not inferred: both were already true (nats-s13-F3)
          params: { requiresObservation: true, observationTab: 'tx-chain', observationDwellSeconds: 5 },
          mustMaintain: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Output Not Saturated',
          params: { requiresObservation: true, observationTab: 'tx-chain', observationDwellSeconds: 5 },
          mustMaintain: true,
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
        'Watch the BUC on TX Chain until the curve turns over: temperature below 61°C and current draw under 3.2 A. Then decide what evidence confirms the de-rate took.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-headroom'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        // The curve has to actually bend on the panel (nats-s13-F3): the
        // de-rate drops the thermal target to ~56 degC, so from ~62-64 degC
        // the reading passes 61 within about 1.5-3 minutes
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
              'Watch a few minutes: current drops to about 3.1 A at once, temperature turns down and passes 61°C in about 2 minutes, carrier still locked',
              'Trust the first reading: current drops the moment the gain changes, so the temperature needs no watching',
              'Check the setpoint: gain reads 23 dB, HPA output unchanged, no thermal verification is needed beyond that',
              'Mute and re-measure: carrier off for a minute, cold-start temperature recorded, then unmute and compare readings',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation:
              'Current answers in seconds; temperature lags behind the thermal mass (about a 10-minute time constant). It turns down at once and needs about 2 minutes to pass 61°C, then keeps easing toward the mid-50s. Watch the curve, not a single reading.',
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
      description: 'Choose the right contents for the swap ticket so the maintenance crew has what they need.',
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
              'Trend record (10-min curve), cooling-fault warning, de-rate action taken, gain/backoff settings, swap recommended for next planned window',
              'Symptom only (BUC running hot), current temperature reading, no settings - the crew will pull their own telemetry',
              'Full RF front end replacement (BUC, HPA, LNB), current temperature reading, request for the earliest available window',
              'Trend record (10-min curve), note that de-rate resolved it, no swap needed - close the ticket once the temperature settles',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Tickets are handoffs. The next person needs context, not a verdict.',
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
      description: 'Final look at the Dashboard before closing the shift entry.',
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
            question: 'Final state of VT-01 after the action?',
            options: [
              'Only the BUC cooling-fault warning, BUC running de-rated, carrier nominal, swap ticket open against next planned window',
              'BUC over-temperature alarm active, carrier muted, customer down, swap ticket open against next planned window',
              'No active alarms, BUC swapped on-shift, customer briefly down during the swap, maintenance ticket closed',
              'No active alarms, BUC gain unchanged at 33 dB, carrier nominal, hold and monitor still in effect for next shift',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Clean summary. The fan warning stays until the swap; the trend is addressed at the source; the customer never noticed; next crew has a clear handoff.',
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
      description: 'Select the correct entry for the operations log.',
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
              '1003 - VT-01 BUC thermal trend (57->62°C over 10 min, fan degraded) addressed by 10 dB gain de-rate. Trend reversing, swap ticket open, carrier nominal.',
              '1003 - VT-01 BUC failure (over-temperature alarm at 70°C) forced BUC mute. Customer outage logged, swap ticket open, carrier restored.',
              '1003 - VT-01 BUC thermal trend (57->62°C over 10 min) noted. Hold and monitor, no action taken, next shift to reassess, carrier nominal.',
              '1003 - VT-01 BUC thermal trend (57->62°C over 10 min) addressed by on-shift BUC swap. Customer briefly down, ticket closed, carrier restored.',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Trend, action, evidence of effect, and the open ticket - all in one line.',
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
        "Temperature log flagged BUC temp on VT-01. Up from 57 to 62 over the last ten, no alarm yet - readings are in the brief. Carrier is fine. Take a look at it and decide what you want to do - I trust your read."
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
          Trend's bending. Customer never knew anything happened. That's the job - catch it on the curve, not at the alarm.
        </p>
        <p>
          See you tomorrow.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/13/obj-log-shift-summary.mp3'),
      },
    },
  },
};
