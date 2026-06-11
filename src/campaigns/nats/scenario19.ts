import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { aurora7Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 19: "Train the New Hire"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 3 of 8)
 * Time Pressure: None - teaching is the work
 * Calculation Required: YES - the card's numbers must be derived correctly
 * New Mechanic: the Working Document panel. Each teaching quiz carries a
 *   params.documentLine; correct answers append to the in-game quick-reference
 *   card the player is producing. The deliverable is visible and reviewable.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1411: Deliver technical training to customers
 *   - T1334: Produce cybersecurity instructional materials
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *
 * Supporting Codes:
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - S0421: Skill in operating network equipment
 *   - K0773: Knowledge of telecommunications principles and practices
 *
 * Premise: Dana wants a one-page AURORA-7 acquisition/track quick-reference
 * card for an incoming new hire - written by someone who flies the procedure,
 * not copied from a vendor manual. The player performs the live procedure
 * end-to-end and, at each step, chooses which callout, formula, or
 * common-mistake warning belongs on the card. Correct choices build the card
 * in the Working Document panel.
 *
 * The deeper lesson: executing a procedure and knowing which three of its
 * fifty steps a new operator will get wrong are different skills. This is the
 * campaign's mentoring beat - the player must articulate the WHY.
 *
 * Tone: Reflective-operational. Dana intro + acknowledgment only (3 clips).
 * All quizzes SYSTEM. The new hire never appears on screen.
 */

export const scenario19Data: ScenarioData = {
  id: 'nats-scenario19',
  prerequisiteScenarioIds: ['nats-scenario18'],
  url: 'nats/scenarios/nats-scenario19',
  imageUrl: 'nats/19/card.png',
  number: 19,
  title: 'Train the New Hire',
  subtitle: 'Producing the Quick-Reference Card',
  duration: '30-35 min',
  difficulty: 'intermediate',
  missionType: 'Knowledge Transfer',
  description: `A new hire starts ground school next month, and Dana wants a one-page quick-reference card for the AURORA-7 acquisition and step-track procedure - written by someone who actually flies it.<br><br>The method: run the procedure live this afternoon. At each step, choose the one callout, formula, or warning that belongs on the card. The card builds in front of you as you work - and at the end it gets handed to someone for whom it may be the only thing between a clean acquisition and a lost afternoon.<br><br>Anyone can execute a procedure. Teaching it means knowing which mistakes are actually waiting for the person who comes after you.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'Working Document panel (the card)',
  ],
  timeLimitSeconds: 35 * 60,
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
      title: 'AURORA-7 Quick-Reference Card',
      description: 'Console copy for the incoming new hire - built live during the procedure run.',
    },
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-19?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Assignment',
      description: 'Open the brief - the deliverable today is a document, built by flying the procedure.',
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
          description: 'Accept the Assignment',
          params: {
            character: Character.SYSTEM,
            question: 'Ready to fly the AURORA-7 procedure and build the card as you go?',
            options: ['Ready - procedure live, card building in the Working Document panel.'],
            correctIndex: 0,
            explanation: 'Every teaching choice you make appends to the card. Choose like the reader\'s first solo shift depends on it.',
            pointPenalty: 0,
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
    {
      id: 'card-scope-quiz',
      nice: ['T1334', 'T1411'],
      title: 'Set the Card\'s Scope',
      description: 'Decide what kind of document this is before writing a line of it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Scope Decision',
          params: {
            character: Character.SYSTEM,
            question: 'What is a quick-reference card, as opposed to the SOP it accompanies?',
            options: [
              'The numbers someone needs under pressure plus the mistakes with the highest local base rate - one page, taped to the console; the procedure itself stays in the SOP',
              'A condensed copy of every SOP step in smaller type',
              'A vendor datasheet excerpt',
              'A training syllabus for the first month',
            ],
            correctIndex: 0,
            explanation: 'Selection is the work. Everything on the card competes for attention during a real acquisition - a line that does not earn its place costs the reader time when they can least afford it.',
            pointPenalty: 5,
            documentSection: 'Header',
            documentLine: 'AURORA-7 ACQUIRE & TRACK - console copy | Audience: first-solo operator | The SOP is the procedure; this card is the pressure kit',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 1: ACQUIRE (and teach the acquisition)
    // ============================================================
    {
      id: 'repoint-to-aurora',
      nice: ['S0421', 'K1032'],
      title: 'Fly It: Acquire AURORA-7',
      description: 'Program-track to AURORA-7 (NORAD 28899) - the live half of the lesson.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['card-scope-quiz'],
      timeLimitSeconds: 4 * 60,
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
      id: 'acquire-callout-quiz',
      nice: ['T1411', 'K1032'],
      title: 'Card Line: Acquisition',
      description: 'You just acquired the bird. Which callout belongs on the card for this step?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-to-aurora'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Acquisition Callout',
          params: {
            character: Character.SYSTEM,
            question: 'Which line teaches the acquisition step best?',
            options: [
              'Program-track FIRST - it puts you inside beacon capture range. Nominal: Az 190, El 32, but the bird rides a ±3° figure-8',
              'Acquire AURORA-7 using the standard acquisition procedure',
              'The antenna must be powered before acquisition can begin',
              'AURORA-7 was launched over nineteen years ago and is approaching end of life',
            ],
            correctIndex: 0,
            explanation: 'Numbers plus the why. "Use the standard procedure" teaches nothing; trivia about launch dates costs card space the reader pays for at 2 AM.',
            pointPenalty: 5,
            documentSection: 'Acquire',
            documentLine: 'Program-track FIRST - puts you inside beacon capture range. Nominal Az 190 / El 32, bird rides a ±3° figure-8',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tune-beacon',
      nice: ['S0421', 'K0773'],
      title: 'Fly It: Find the Beacon',
      description: 'Tune the spectrum analyzer to the AURORA-7 beacon IF and confirm it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-callout-quiz'],
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
          description: 'AURORA-7 Beacon Detected',
          params: {
            signalId: 'AURORA-7-Beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'beacon-formula-quiz',
      nice: ['T1411', 'K0773'],
      title: 'Card Line: the Beacon Number',
      description: 'The beacon is on your screen. Put the number on the card the way the reader needs it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tune-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon Callout',
          params: {
            character: Character.SYSTEM,
            question: 'Which beacon line belongs on the card?',
            options: [
              'Beacon IF = LO − RF = 5250 − 4165 = 1085 MHz. Weak CW (aging bird) - use a narrow span, ~2 kHz',
              'The beacon is at 1085',
              'Beacon frequencies are listed in the satellite operator\'s handbook, appendix C',
              'IF = |LO − RF| (see SOP for values)',
            ],
            correctIndex: 0,
            explanation: 'The formula WITH the worked numbers, plus the trap (weak CW needs a narrow span). A bare "1085" breaks the day the LO changes; a bare formula breaks at 2 AM.',
            pointPenalty: 5,
            documentSection: 'Acquire',
            documentLine: 'Beacon IF = LO − RF = 5250 − 4165 = 1085 MHz. Weak CW - use ~2 kHz span',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mistake-lo-quiz',
      nice: ['T1334', 'K0645'],
      title: 'Card Line: First Watch-Out',
      description: 'Pick the highest-value warning for the acquisition phase from the station\'s actual history.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['beacon-formula-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Watch-Out Selection',
          params: {
            character: Character.SYSTEM,
            question: 'Station history lists five past mistakes. Which acquisition-phase warning earns card space?',
            options: [
              'Beacon "missing" at 1085? Check the LNB LO = 5250 - an operator fresh from Maine duty once hunted a healthy beacon for an hour with the LO still at Maine\'s 6080 default',
              'Do not look directly into the feed horn',
              'Remember that AURORA-7 is older than the other satellites',
              'Double-check that the spectrum analyzer is powered on',
            ],
            correctIndex: 0,
            explanation: 'It actually happened here, it costs an hour, and the check takes five seconds. That ratio - cost of mistake over cost of check - is what earns a warning its card space.',
            pointPenalty: 5,
            documentSection: 'Watch Out',
            documentLine: 'Beacon "missing"? Verify LNB LO = 5250 - the Maine default (6080) bites cross-site operators',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: TRACK (and teach the tracking)
    // ============================================================
    {
      id: 'enable-step-track',
      nice: ['S0421', 'K1032'],
      title: 'Fly It: Engage Step-Track',
      description: 'Engage step-track on the acquired beacon - the half of the procedure the card is really for.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mistake-lo-quiz'],
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
      points: 10,
    },
    {
      id: 'step-track-rule-quiz',
      nice: ['T1411', 'K1032'],
      title: 'Card Line: the Engagement Rule',
      description: 'Capture the step-track rule that prevents the most common engagement error.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-step-track'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Engagement Rule',
          params: {
            character: Character.SYSTEM,
            question: 'Which step-track line goes on the card?',
            options: [
              'Step-track RIDES program-track - engage it as an optimization on an acquired beacon, never from MANUAL (the loop needs a beacon to optimize)',
              'Enable step-track when tracking AURORA-7',
              'Step-track was invented to track inclined-orbit satellites',
              'Step-track may be engaged in any antenna mode',
            ],
            correctIndex: 0,
            explanation: 'A new hire here once engaged step-track from manual with no beacon in the capture cone and watched the dish wander. The rule plus the reason makes the mistake impossible to repeat.',
            pointPenalty: 5,
            documentSection: 'Track',
            documentLine: 'Step-track RIDES program-track - engage on an acquired beacon, never from MANUAL',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hold-beacon',
      nice: ['T0153', 'K1032'],
      title: 'Fly It: Hold the Figure-8',
      description: 'Hold beacon lock while the bird wanders - watch what "healthy" looks like so you can describe it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['step-track-rule-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Held',
          mustMaintain: true,
          maintainDuration: 20,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'healthy-track-quiz',
      nice: ['T1411', 'T0153'],
      title: 'Card Line: What Healthy Looks Like',
      description: 'Describe the picture of a working step-track so the reader can recognize it - and its absence.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['hold-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Healthy Picture',
          params: {
            character: Character.SYSTEM,
            question: 'Which description of a healthy step-track belongs on the card?',
            options: [
              'Healthy = beacon C/N steady at its peak while Az/El visibly wander the figure-8. Moving dish + flat C/N is the loop WORKING, not a fault',
              'Healthy step-track means the antenna position never changes',
              'Check the step-track LED is illuminated',
              'C/N values are documented in the link budget on file',
            ],
            correctIndex: 0,
            explanation: 'The counterintuitive part IS the lesson: motion is health. A new operator who expects a still dish will "fix" a working loop - this line inoculates them.',
            pointPenalty: 5,
            documentSection: 'Track',
            documentLine: 'Healthy = C/N steady at peak while Az/El wander the figure-8. Moving dish + flat C/N = loop WORKING',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mistake-chase-quiz',
      nice: ['T1334', 'K0645'],
      title: 'Card Line: Second Watch-Out',
      description: 'Pick the tracking-phase warning with the highest base rate.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['healthy-track-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Watch-Out Selection',
          params: {
            character: Character.SYSTEM,
            question: 'Which tracking warning earns the card space?',
            options: [
              'C/N sagging mid-track? Verify step-track is still ON before touching the axes - hand-chasing the figure-8 is a losing game an operator here once played for twenty minutes',
              'Do not unplug the ACU during tracking',
              'AURORA-7\'s transponder bandwidth is narrower than TIDEMARK\'s',
              'Step-track parameters are configured by engineering and should not be modified',
            ],
            correctIndex: 0,
            explanation: 'Again the local base rate: the chase mistake has actually happened, has a cheap check (is the loop on?), and an expensive failure mode (losing the beacon entirely).',
            pointPenalty: 5,
            documentSection: 'Watch Out',
            documentLine: 'C/N sagging? Check step-track is ON before touching axes - never hand-chase the figure-8',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: VERIFY (and teach the proof chain)
    // ============================================================
    {
      id: 'verify-receiver',
      nice: ['T0153', 'S0421'],
      title: 'Fly It: Prove the Link',
      description: 'Verify the receiver end-to-end - the proof chain the card must teach.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mistake-chase-quiz'],
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
          description: 'C/N ≥ 8 dB',
          params: { minCNRatio: 8 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-chain-quiz',
      nice: ['T1411', 'K0773'],
      title: 'Card Line: the Proof Chain',
      description: 'Reduce link verification to the minimum chain that actually proves it.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-receiver'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Proof Chain',
          params: {
            character: Character.SYSTEM,
            question: 'Which verification line belongs on the card?',
            options: [
              'Proof chain, in order: beacon at 1085 (pointing + LO) → RX locked at 1422 MHz / 24 MHz (carrier) → C/N ≥ 8 (margin). Each link proves something the others don\'t',
              'Verify the link is working before reporting completion',
              'Run the full link budget calculation and compare against the design values',
              'If the dashboard shows green, the link is verified',
            ],
            correctIndex: 0,
            explanation: 'Ordered, numeric, and explains what each check proves - the S9 lesson (beacon proves RF, lock proves data, margin proves durability) compressed to one card line.',
            pointPenalty: 5,
            documentSection: 'Verify',
            documentLine: 'Proof chain: beacon 1085 (pointing+LO) → RX locked 1422 / 24 MHz (carrier) → C/N ≥ 8 (margin)',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mistake-span-quiz',
      nice: ['T1334', 'K0773'],
      title: 'Card Line: Third Watch-Out',
      description: 'One more warning slot. Spend it on the verification-phase trap.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-chain-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Watch-Out Selection',
          params: {
            character: Character.SYSTEM,
            question: 'Last warning slot on the card - which one?',
            options: [
              'Carrier "gone" but beacon fine? Widen the span - a 24 MHz carrier is invisible at the 2 kHz span you used for the beacon. (Operator here once declared an outage over this)',
              'The spectrum analyzer reference level should be checked weekly',
              'Always log out of the console at end of shift',
              'AURORA-7 may be retired in the coming years - check the operations bulletin',
            ],
            correctIndex: 0,
            explanation: 'The span trap is the natural sequel to the card\'s own beacon advice ("use 2 kHz span") - a good card warns about the mistakes its own instructions set up.',
            pointPenalty: 5,
            documentSection: 'Watch Out',
            documentLine: 'Carrier "gone" but beacon fine? WIDEN THE SPAN - 24 MHz won\'t show at the beacon\'s 2 kHz',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tx-numbers-quiz',
      nice: ['T1411', 'K0773'],
      title: 'Card Line: the TX Number',
      description: 'The card needs the transmit-side number even though today\'s run was receive-only.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mistake-span-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'TX Card Line',
          params: {
            character: Character.SYSTEM,
            question: 'Which transmit-side line belongs on the card?',
            options: [
              'TX IF = BUC LO − uplink RF = 7500 − 6053 = 1447 MHz. AURORA\'s chain uses BUC LO 7500 - NOT the TIDEMARK 7000',
              'Transmit procedures are covered in a separate SOP',
              'TX IF = 1447 MHz',
              'The BUC local oscillator converts IF to RF',
            ],
            correctIndex: 0,
            explanation: 'The 7500-vs-7000 trap has burned a real operator here (carrier 500 MHz off). The worked formula carries both the number and the trap in one line.',
            pointPenalty: 5,
            documentSection: 'Numbers',
            documentLine: 'TX IF = 7500 − 6053 = 1447 MHz. AURORA BUC LO is 7500 - NOT the TIDEMARK 7000',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: EDITORIAL REVIEW AND HANDOFF
    // ============================================================
    {
      id: 'card-review-quiz',
      nice: ['T1334', 'T1411'],
      title: 'Editorial Review',
      description: 'Review the finished card in the Working Document panel - and defend what you left off.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tx-numbers-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Cut List',
          params: {
            character: Character.SYSTEM,
            question: 'The card intentionally omits launch history, link-budget math, and the full SOP steps. Why is leaving things OFF the card a teaching decision?',
            options: [
              'Card space is the reader\'s attention under pressure - every line they scan past to find the one they need is time on a degraded link; the card earns trust by containing only what earns its place',
              'Shorter documents are cheaper to print',
              'The omitted material is classified',
              'It is not a decision - the card was simply finished',
            ],
            correctIndex: 0,
            explanation: 'Dana\'s test for the card is whether SHE would tape it to a console. Editing is the difference between a reference and a re-printed manual.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-handoff',
      nice: ['K0645', 'T1411'],
      title: 'Hand Off the Card',
      description: 'Log the deliverable for Dana.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['card-review-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Handoff Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which log entry closes the assignment?',
            options: [
              'AURORA-7 quick-reference card complete - built against a live procedure run (acquire, step-track, verify, all green). Sections: Acquire / Track / Verify / Numbers / 3x Watch-Out from station history. Delivered to Dana for the new-hire packet.',
              'Training card finished.',
              'Procedure run complete, no anomalies.',
              'Card drafted - pending engineering review of all values.',
            ],
            correctIndex: 0,
            explanation: '"Built against a live run" is the card\'s provenance - it is what separates this document from the vendor manual it replaces.',
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
        <em>[Text message from Dana at 12:55]</em>
      </p>
      <p>
        "New hire starts ground school next month. I want a one-page quick-reference card for AURORA-7 acquisition and step-track - written by someone who flies it, not copied from the vendor book. Run the procedure this afternoon; at each step pick the one callout that belongs on the card. It builds in the Working Document panel as you go. When you're done I want to be able to hand it to someone on day one."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/19/intro.mp3'),
    },
    objectives: {
      'mistake-chase-quiz': {
        text: `
        <p>
          I'm reading the card as it builds - the Watch-Out section is exactly right so far. Notice every line in it is something that actually happened here? That's the difference between a warning and a superstition. Keep going.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/19/obj-mistake-chase-quiz.mp3'),
      },
      'log-handoff': {
        text: `
        <p>
          This is the card I'd have wanted my first week. Procedure flown clean, numbers worked not copied, and three warnings that each cost somebody here a real afternoon. It goes in the new-hire packet tonight.
        </p>
        <p>
          You know the material differently now than you did this morning. That's not an accident - teaching it is the last step of learning it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/19/obj-log-handoff.mp3'),
      },
    },
  },
};
