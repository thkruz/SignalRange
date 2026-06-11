import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 13: "Thermal Anomaly"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 5 of 8)
 *
 * Premise: Mid-shift. VT-01 is up on TIDEMARK-1 carrying normal customer
 * traffic. The BUC temperature has been creeping upward for the last
 * ~15 minutes: 57°C -> 62°C with a steady ~+0.3°C/min slope. No alarm
 * (the over-temperature trip is at 70°C). BUC current draw is also
 * elevated (4.1A vs nominal ~3.0A). Everything else on the station is
 * nominal: GPSDO locked, RX beacon clean, antenna locked, HPA backoff
 * 8 dB and not overdriven.
 *
 * The trend signature points at one root cause: BUC gain is sitting at
 * 33 dB - 10 dB above the 23 dB operating value (same class of leftover
 * the S12 maintenance crew taught us to look for). The BUC is dissipating
 * the excess as heat into its own chassis. The right call is to de-rate
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
  description: `Mid-shift on VT-01. TIDEMARK-1 carrying normal customer traffic. The trend display flagged something fifteen minutes ago: BUC temperature has been climbing roughly a third of a degree per minute - 57°C up to 62°C, no alarm yet, but the slope is unambiguous.<br><br>Nothing else has moved. GPSDO locked, RX beacon clean, HPA in backoff. The question is whether to act now, schedule a swap and keep going, switch to backup, or hold and monitor.<br><br>The right answer is judgment, not a checklist. Read the trend, pick a course of action, and execute it without putting the customer in the dark.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Operational',
  ],
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
              temperature: 62, // °C - climbing ~0.3°C/min for the last 15 min
              currentDraw: 4.1, // A - elevated from nominal ~3.0A
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
              'Already in alarm - mute the BUC immediately',
              'No relevance - the trip point is fixed and the trend is unrelated',
              'Threshold has been raised by the maintenance crew - ignore the reading',
            ],
            correctIndex: 0,
            explanation: 'Pre-alarm trends are the ideal time to act. Acting at alarm means you are already late.',
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
      description: 'Read the BUC temperature against the 15-minute history shown in the brief and call the trend.',
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
            question: 'BUC temperature is 62°C, rising about +0.3°C/min for the last 15 minutes. If the slope holds, when does it cross the 70°C trip?',
            options: [
              'Roughly 25-30 minutes from now if nothing changes',
              'Already past it - the dashboard alarm is suppressed',
              'Never - thermal trends always self-stabilize before trip',
              'In a few seconds - the slope accelerates exponentially',
            ],
            correctIndex: 0,
            explanation: 'Linear extrapolation: 8°C of headroom at +0.3°C/min is roughly 25 minutes. Enough time for a deliberate response.',
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
            question: 'BUC current draw is 4.1A (nominal ~3.0A). What does the elevated current tell you?',
            options: [
              'BUC is dissipating more electrical power - consistent with the thermal rise, not a separate fault',
              'Power supply is failing and pushing extra current into the module',
              'Current is unrelated to thermal state - look at LNB telemetry instead',
              'BUC is in over-current shutdown',
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
      description: 'Verify the TIDEMARK-1 beacon is still clean on the RX side. If the RX is healthy, the trend is isolated to the TX chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-current-draw'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
              'Time, BUC temperature, BUC current, BUC gain, HPA backoff - so the next operator can rebuild the curve',
              'BUC temperature alone - the rest is derivable from it',
              'Customer SLA metrics only - the equipment state is irrelevant',
              'A screenshot of the dashboard',
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
            question: 'BUC gain is 33 dB. The operating value for this chain is 23 dB. What is the most likely root cause of the thermal trend?',
            options: [
              'BUC gain is set higher than required - the module is dissipating the excess as heat instead of useful RF',
              'BUC is failing internally and should be swapped immediately - no other action is safe',
              'HPA is overdriven and bleeding heat backward into the BUC',
              'Ambient temperature in the equipment room is rising',
            ],
            correctIndex: 0,
            explanation: 'When the gain stage is set above what the drive chain needs, the excess turns into heat. Classic over-gain dissipation.',
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
              'De-rate now: reduce BUC gain ~10 dB to cut dissipation, monitor the trend reverse, schedule a swap during the next planned window',
              'Swap the BUC now - take the carrier down hard and let maintenance replace the module',
              'Mute and switch traffic to the backup modem chain immediately',
              'Hold and monitor - thermal trends usually flatten on their own',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'De-rating addresses the cause (excess dissipation) without taking the customer down. Swap-now is over-spend; mute-and-switch is over-reaction; hold-and-monitor ignores a trend that has not flattened in 15 minutes.',
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
              'Lower BUC gain ~10 dB, verify HPA still in linear region, verify carrier still nominal, then watch the temperature curve bend',
              'Mute the BUC, change the gain, then unmute - to be safe',
              'Lower BUC gain in a single step to 0 dB, then ramp back up while watching telemetry',
              'Change BUC gain only after physically swapping the module',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Live adjustment is safe when the HPA has backoff headroom. Muting would interrupt the customer; ramping from 0 is unnecessary theater.',
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
      description: 'Confirm the HPA is not overdriven after the change. With less drive from the BUC, the HPA should be sitting in a comfortable backoff.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['reduce-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Linear Region',
          mustMaintain: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Output Not Saturated',
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
      description: 'Decide what evidence will confirm the de-rate actually took effect on the thermal trend.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-headroom'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Evidence of Success',
          params: {
            character: Character.SYSTEM,
            question: 'How do you know the de-rate worked before you log the shift?',
            options: [
              'Watch 5-10 minutes: temperature slope flattens then trends down, current draw drops toward nominal, carrier still locked downstream',
              'Temperature drops instantly the moment the gain knob moves',
              'Trust the gain change is correct and move on - thermal verification is not needed',
              'Mute the carrier and re-measure cold-start temperature',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Thermal mass is slow. The slope changes before the absolute value does. Watch the curve, not a single reading.',
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
              'Trend record (15-min curve), de-rate action taken, current BUC gain/backoff settings, recommendation to swap module during next planned window',
              'Just "BUC running hot" - the maintenance crew will figure out the rest',
              'A request to replace the entire RF front end',
              'A note that the trend was a false alarm and no action is needed',
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
              'No active alarms, BUC running de-rated, carrier nominal, swap ticket open against next planned window',
              'BUC in alarm, customer down, ticket open',
              'BUC swapped on-shift, customer briefly down, ticket closed',
              'No change - hold and monitor still in effect',
            ],
            correctIndex: 0,
            preserveOptionOrder: true,
            explanation: 'Clean summary. Customer never noticed; trend addressed at the source; next crew has a clear handoff.',
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
              '1003 - VT-01 BUC thermal trend (57°C->62°C over 15 min) addressed by 10 dB gain de-rate. Trend reversing. Swap ticket opened for next planned window. Carrier nominal throughout.',
              '1003 - BUC failure on VT-01, customer outage logged.',
              '1003 - Hold and monitor - no action taken.',
              '1003 - BUC swap completed on-shift.',
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
        "Trend display flagged BUC temp on VT-01. Up from 57 to 62 over the last fifteen, no alarm yet. Carrier is fine. Take a look at it and decide what you want to do - I trust your read."
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
