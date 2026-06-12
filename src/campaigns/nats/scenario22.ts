import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { aurora7Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 22: "End-of-Life Planning"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 6 of 8)
 * Time Pressure: None - this is analysis and communication
 * Calculation Required: Light (trend extrapolation, no RF math)
 * Mechanic Reused: the Working Document panel (from S19), now producing an
 *   executive impact assessment rather than a how-to card.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0721: Knowledge of risk management principles and practices
 *   - T1429: Prepare trend analysis reports
 *   - T1606: Prepare impact reports
 *
 * Supporting Codes:
 *   - K0751: Knowledge of system threats
 *   - S0807: Skill in solving problems
 *   - T1020: Determine operational and safety impacts
 *
 * Premise: AURORA-7's beacon power has declined for months (power subsystem
 * aging) and the decline is steepening. Francis Martin (board) wants an
 * operations recommendation on retirement timing. The player runs a final
 * data-collection pass, then builds a trend assessment and sunset
 * recommendation in the Working Document - the campaign's first
 * report-producing scenario. Light on RF, heavy on analysis and the
 * discipline of labeling confidence.
 *
 * Tone: Reflective-analytical. Marcus (Halifax vehicle view), Dana (intro),
 * Francis (board-level, rare). All quizzes SYSTEM. 5 clips.
 *
 * Sim notes:
 *   - AURORA-7 starts on program-track; player engages step-track for the
 *     final ops run (the beacon is weak - end-of-life). The data-collection
 *     phase is real; the rest is analysis quizzes that build the report.
 */

export const scenario22Data: ScenarioData = {
  id: 'nats-scenario22',
  prerequisiteScenarioIds: ['nats-scenario21'],
  url: 'nats/scenarios/nats-scenario22',
  imageUrl: 'nats/22/card.png',
  number: 22,
  title: 'End-of-Life Planning',
  subtitle: 'AURORA-7 Sunset Recommendation',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Analysis & Reporting',
  description: `AURORA-7's beacon power has been declining for months - the power subsystem on a nineteen-year-old bird running out of watts - and the slope is steepening. The board wants a recommendation on retirement timing, from operations rather than from a spreadsheet.<br><br>Run one more data-collection pass this morning, then build the assessment. The Working Document panel is set up as the report template; it fills in as you make your calls. Francis Martin wants a recommendation he can forward without editing: how long the spacecraft can responsibly carry service, what degrades first, and what the migration window looks like.<br><br>Light on RF today. Heavy on reading a trend honestly and saying what you know without false precision.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'Working Document panel (the report)',
  ],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1422 as MHz, // AURORA-7 downlink IF (5250 - 3828)
                bandwidth: 24 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [aurora7Satellite, tidemark1Satellite],
    workingDocument: {
      title: 'AURORA-7 End-of-Life Assessment',
      description: 'Operations recommendation for the SeaLink board - built from today\'s data run and trend analysis.',
    },
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-22?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Tasking',
      description: 'Open the brief and Francis\'s request.',
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
          description: 'Frame the Deliverable',
          params: {
            character: Character.SYSTEM,
            question: 'Francis wants a retirement recommendation "from operations." What does that mean you must produce?',
            options: [
              'A defensible recommendation grounded in measured data and an honest trend, with assumptions labeled - not a single date with false precision',
              'A precise retirement date to the day',
              'A decision to retire immediately to avoid risk',
              'A restatement of the vendor\'s end-of-life bulletin',
            ],
            correctIndex: 0,
            explanation: 'The board can handle uncertainty; it cannot handle a confident number that unravels in a quarter. "From operations" means built from what the dish actually measures.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
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

    // ============================================================
    // PHASE 1: FINAL DATA COLLECTION RUN
    // ============================================================
    {
      id: 'acquire-aurora',
      nice: ['S0421', 'K1032'],
      title: 'Acquire AURORA-7',
      description: 'Program-track to AURORA-7 (NORAD 28899) for the final data run.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 4 * 60,
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
          description: 'Locked on AURORA-7',
          params: { noradId: 28899 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'engage-step-track',
      nice: ['S0421', 'K1032'],
      title: 'Step-Track for the Weak Beacon',
      description: 'Engage step-track - the beacon is 4 dB down from its prime and needs every bit of pointing accuracy.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-aurora'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Held',
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'measure-beacon',
      nice: ['T1429', 'K0773'],
      title: 'Measure Today\'s Beacon',
      description: 'Tune the spectrum analyzer to the beacon IF and capture today\'s level - the newest point on the trend.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['engage-step-track'],
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
          description: 'Spectrum at 1085 MHz IF',
          params: {
            centerFrequency: 1085e6,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'AURORA-7 Beacon Captured',
          params: {
            signalId: 'AURORA-7-Beacon',
            minPower: -110 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'record-data-point-quiz',
      nice: ['T1429', 'K0740'],
      title: 'Report: Today\'s Measurement',
      description: 'Record today\'s data point in the assessment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['measure-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Data Point',
          params: {
            character: Character.SYSTEM,
            question: 'What goes into the report as today\'s measured data?',
            options: [
              'Beacon at -4.0 dB relative to the 24-month reference; step-track held lock at this level; carrier C/N still above demod threshold - measured, not estimated',
              'Beacon is fine',
              'The satellite will fail soon',
              'Beacon power is declining (no number)',
            ],
            correctIndex: 0,
            explanation: 'Measured values, stated as measured. The number with its reference and the fact that step-track still holds at this level - that is data, and the report is built on data first.',
            pointPenalty: 5,
            documentSection: 'Data (measured today)',
            documentLine: 'Beacon -4.0 dB vs 24-mo reference. Step-track holds lock at this level. Carrier C/N above demod threshold.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: TREND ANALYSIS
    // ============================================================
    {
      id: 'trend-slope-quiz',
      nice: ['T1429', 'S0807'],
      title: 'Report: the Trend',
      description: 'Characterize the decline from the beacon-power history.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['record-data-point-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Trend Shape',
          params: {
            character: Character.SYSTEM,
            question: 'The history: -1.1 dB at 12 months, -2.4 at 6 months, -4.0 today. How do you characterize the trend?',
            options: [
              'Accelerating - the last 6 months lost ~1.6 dB versus ~1.1 dB in the prior 6; a steepening curve, not a straight line, so naive linear extrapolation understates the near-term decline',
              'Linear and steady at about 0.3 dB/month',
              'Flattening - the decline is slowing',
              'Random - no meaningful trend',
            ],
            correctIndex: 0,
            explanation: 'Reading acceleration vs linearity is the whole analysis. A power subsystem shedding load tends to worsen non-linearly; calling it linear would sell the board a longer runway than the spacecraft has.',
            pointPenalty: 5,
            documentSection: 'Trend',
            documentLine: 'Beacon decline ACCELERATING: -1.1 (12mo) -> -2.4 (6mo) -> -4.0 (now). Non-linear - linear extrapolation understates near-term.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'binding-constraint-quiz',
      nice: ['K0751', 'T1020'],
      title: 'Report: What Fails First',
      description: 'Identify the operational cliff that actually ends usable service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['trend-slope-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Binding Constraint',
          params: {
            character: Character.SYSTEM,
            question: 'What is the binding constraint - the thing that ends usable service first?',
            options: [
              'The beacon getting too weak to step-track. AURORA-7 is inclined, so without a trackable beacon every pass becomes manual figure-8 chasing and service quality collapses - the cliff is tracking, not transponder death',
              'The transponder ceasing to relay - the payload fails first',
              'The satellite de-orbiting',
              'Fuel exhaustion for station-keeping',
            ],
            correctIndex: 0,
            explanation: 'The S18/S23 lesson pays off: an inclined bird is only usable while step-track can hold its beacon. The recommendation hinges on when the declining beacon crosses the trackability floor, not on the transponder.',
            pointPenalty: 5,
            documentSection: 'Risk',
            documentLine: 'Binding constraint = beacon trackability (inclined bird). When beacon too weak to step-track, every pass goes manual and quality collapses. NOT transponder death.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'marcus-corroboration-quiz',
      nice: ['T1020', 'K1032'],
      title: 'Report: Vehicle Corroboration',
      description: 'Fold in Halifax\'s spacecraft-side view of the power trend.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['binding-constraint-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Corroboration',
          params: {
            character: Character.SYSTEM,
            question: 'Marcus confirms the vehicle bus is shedding RF load as the array ages. How does that affect confidence in the trend?',
            options: [
              'It raises confidence and explains the mechanism: ground-measured beacon decline and spacecraft-reported power loss are the same story from two independent vantage points - the trend is real, not an artifact of our station',
              'It contradicts the ground data and lowers confidence',
              'It is irrelevant - only ground measurements matter',
              'It means the satellite is fine and the dish is faulty',
            ],
            correctIndex: 0,
            explanation: 'Two independent measurements agreeing on cause AND trend is the strongest evidence a report can carry. It also rules out "our antenna is degrading" - the spacecraft sees its own power dropping.',
            pointPenalty: 5,
            documentSection: 'Trend',
            documentLine: 'Corroborated by Halifax: vehicle bus shedding RF load as array ages. Ground + spacecraft agree on cause and trend (independent vantage points).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RECOMMENDATION
    // ============================================================
    {
      id: 'sunset-window-quiz',
      nice: ['K0721', 'T1606'],
      title: 'Report: the Recommendation',
      description: 'Make the call - a window with decision points, not a single date.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['marcus-corroboration-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Sunset Recommendation',
          params: {
            character: Character.SYSTEM,
            question: 'What is the responsible recommendation?',
            options: [
              'Begin customer migration now; target sunset in roughly one to two quarters with a hard review at each monthly data point, and a firm decision trigger when the beacon crosses the step-track floor. A window with tripwires, not a date',
              'Retire immediately - the risk is unacceptable',
              'No action for a year - the link still works today',
              'Set a precise retirement date 8 months out',
            ],
            correctIndex: 0,
            explanation: 'A window plus tripwires gives customers runway while protecting against the accelerating curve. "Begin migration now, decide at the trackability floor" is defensible because it is tied to a measurable event, not a guess.',
            pointPenalty: 10,
            preserveOptionOrder: true,
            documentSection: 'Recommendation',
            documentLine: 'Begin customer migration NOW. Target sunset ~1-2 quarters, monthly data review, firm trigger = beacon crosses step-track floor. Window with tripwires, not a fixed date.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'assumptions-quiz',
      nice: ['K0721', 'T1606'],
      title: 'Report: Label the Assumptions',
      description: 'State what the recommendation depends on - the honesty that makes it defensible.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sunset-window-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Stated Assumptions',
          params: {
            character: Character.SYSTEM,
            question: 'Which assumptions must the report state explicitly?',
            options: [
              'The decline continues or steepens (no recovery), no single-event failure intervenes, and tracking - not the payload - is the binding constraint. If any breaks, the window changes',
              'None - the recommendation is certain',
              'Only that the customer will cooperate with migration',
              'That AURORA-7 was built to a 15-year design life',
            ],
            correctIndex: 0,
            explanation: 'A recommendation that names its assumptions can be defended and updated; one that hides them collapses the first time reality diverges. Stating them is what separates analysis from a guess in a suit.',
            pointPenalty: 5,
            documentSection: 'Assumptions',
            documentLine: 'Assumes: decline continues/steepens (no recovery), no single-event failure, tracking is the binding constraint. Window revises if any breaks.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'false-precision-quiz',
      nice: ['T1606', 'S0807'],
      title: 'Confidence Discipline',
      description: 'Confirm the line between what you measured and what you projected.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assumptions-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Measured vs Projected',
          params: {
            character: Character.SYSTEM,
            question: 'How should the report distinguish measured facts from projections?',
            options: [
              'Explicitly: today\'s -4.0 dB and the historical points are measured; the sunset window is a projection from those points under stated assumptions. Label each so the board knows which is which',
              'Present everything with equal confidence so the recommendation sounds strong',
              'Only report measurements; omit the projection entirely',
              'Round the projection to a single date to look decisive',
            ],
            correctIndex: 0,
            explanation: 'Measured and projected carry different weight; conflating them is how a report loses credibility in a quarter. The board can act on a clearly-labeled projection - it cannot trust a number it later learns was a guess dressed as a fact.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: REVIEW AND DELIVER
    // ============================================================
    {
      id: 'review-report',
      nice: ['T1606', 'T1429'],
      title: 'Review the Assessment',
      description: 'Open the Working Document and confirm the report is board-ready.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['false-precision-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Board-Ready Check',
          params: {
            character: Character.SYSTEM,
            question: 'What makes this assessment something Francis can forward without editing?',
            options: [
              'It has data, a trend, the binding-constraint risk, a windowed recommendation with tripwires, and labeled assumptions - a board member can read it, understand the basis, and defend the decision to others',
              'It is short',
              'It concludes with a single confident date',
              'It avoids any mention of uncertainty',
            ],
            correctIndex: 0,
            explanation: 'Forward-without-editing is the bar: complete enough to stand alone, honest enough to survive scrutiny, structured so the reasoning is visible. That is the difference between operations input and an opinion.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-delivery',
      nice: ['K0645', 'T1606'],
      title: 'Deliver and Log',
      description: 'Log the deliverable to the board.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-report'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Delivery Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which log entry closes the tasking?',
            options: [
              'AURORA-7 EOL assessment delivered to board (Martin). Final data run complete (beacon -4.0 dB, step-track held). Trend accelerating, binding constraint = beacon trackability. Recommendation: begin migration now, sunset ~1-2 quarters, trigger at step-track floor. Assumptions stated. Measured vs projected labeled.',
              'EOL report sent to Francis.',
              'AURORA-7 retirement recommended.',
              'Data run complete, analysis pending.',
            ],
            correctIndex: 0,
            explanation: 'The log mirrors the report\'s spine: data, trend, constraint, recommendation, assumptions. Anyone reading it later knows exactly what was delivered and on what basis.',
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
        <em>[Text message from Dana at 09:21]</em>
      </p>
      <p>
        "Board's doing budget planning and Francis wants an AURORA-7 retirement recommendation - from operations, not from a spreadsheet. You've flown that bird more than anyone on this rotation. Run one more data pass this morning, then build the assessment. The Working Document panel is your report template; it fills in as you make the calls. He wants something he can forward without editing."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/22/intro.mp3'),
    },
    objectives: {
      'measure-beacon': {
        text: `
        <p>
          Marcus from Halifax - I hear you're writing AURORA's obituary. For your trend: our vehicle telemetry shows the array down to about seventy percent of beginning-of-life output, and the bus is auto-shedding RF load to protect the housekeeping buses. Your beacon decline and our power numbers are the same story. She's earned her retirement, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.SAD,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-measure-beacon.mp3'),
      },
      'sunset-window-quiz': {
        text: `
        <p>
          Francis Martin. Appreciate you taking this on directly. What the board needs is exactly what you're building - not a date we'll have to walk back, but a window with triggers we can plan a migration around. Cost-of-being-wrong runs both directions here: retire too early and we waste an asset, too late and we strand customers. Give me the honest middle.
        </p>
        `,
        character: Character.FRANCIS_MARTIN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-sunset-window-quiz.mp3'),
      },
      'review-report': {
        text: `
        <p>
          That's a document I can take to the board without rewriting a line - and more to the point, one I can defend when they push on it. The labeled assumptions are what'll save us the quarter this goes sideways. Well done.
        </p>
        `,
        character: Character.FRANCIS_MARTIN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-review-report.mp3'),
      },
      'log-delivery': {
        text: `
        <p>
          First report you've written that goes straight to a board instead of into a shift log. Notice it's the same discipline as a good log entry - say what you know, label what you don't, make the next reader able to act. Scales all the way up.
        </p>
        <p>
          Nineteen years. Good bird. Good send-off.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-log-delivery.mp3'),
      },
    },
  },
};
