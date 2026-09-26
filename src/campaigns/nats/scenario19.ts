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
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'Working Document panel (the card)'],
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
            explanation: "Every teaching choice you make appends to the card. Choose like the reader's first solo shift depends on it.",
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
      title: "Set the Card's Scope",
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
              'The numbers needed under pressure plus the highest-base-rate local mistakes - one page; the procedure stays in the SOP',
              'Every SOP step condensed into smaller type - one page; the reader never has to open the SOP itself',
              'The vendor datasheet values for the AURORA-7 chain - one page; the procedure stays in the SOP',
              'The first-month training syllabus as a checklist - one page, taped to the console; the SOP is retired once it is learned',
            ],
            correctIndex: 0,
            explanation:
              'Selection is the work. Everything on the card competes for attention during a real acquisition - a line that does not earn its place costs the reader time when they can least afford it. The card is a pressure kit taped to the console, not a condensed SOP, a datasheet, or a syllabus.',
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
              'Program-track FIRST - it puts you inside beacon capture range. Nominal Az 190, El 32, but the bird rides a ±3° figure-8',
              'Step-track FIRST - it hunts the beacon from any starting point. Nominal Az 190, El 32, and the figure-8 takes care of itself',
              'Manual FIRST - slew to nominal and wait for the beacon to appear. Nominal Az 190, El 32, and the bird holds within ±3° of it',
              'Program-track FIRST - it follows the standard acquisition procedure. Nominal Az 190, El 32, launched over nineteen years ago',
            ],
            correctIndex: 0,
            explanation:
              'Numbers plus the why. "Use the standard procedure" teaches nothing; trivia about launch dates costs card space the reader pays for at 2 AM. Step-track cannot start without a beacon in the cone, and a manual park loses a bird that wanders ±3°.',
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
              'Beacon IF = LO − RF = 6080 − 4165 = 1915 MHz. Weak CW (aging bird) - use a narrow span, ~2 kHz',
              'Beacon IF = LO − RF = 5250 − 4165 = 1085 MHz. Weak CW (aging bird) - use a wide span, ~24 MHz',
              'Beacon IF = |LO − RF| per the SOP values, currently 1085 MHz. Weak CW (aging bird) - use a narrow span, ~2 kHz',
            ],
            correctIndex: 0,
            explanation:
              'The formula WITH the worked numbers, plus the trap (weak CW needs a narrow span). A bare "1085" breaks the day the LO changes; a bare formula breaks at 2 AM. 6080 is the Maine LO, and a 24 MHz span buries a CW line in the noise.',
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
      description: "Pick the highest-value warning for the acquisition phase from the station's actual history.",
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
              'Beacon "missing" at 1085? Check the LNB LO = 5250 - an operator fresh from Maine duty once hunted a healthy beacon for an hour',
              'Beacon "missing" at 1085? Check the analyzer is powered on - a dark screen has fooled more than one operator at the end of a shift',
              'Beacon "missing" at 1085? Remember AURORA-7 is the oldest bird - its beacon runs weaker than the TIDEMARK beacons and is easy to miss',
              'Beacon "missing" at 1085? Check the dish is powered and out of stow - nothing reaches the feed until the drives are up',
            ],
            correctIndex: 0,
            explanation:
              "It actually happened here, it costs an hour, and the check takes five seconds. That ratio - cost of mistake over cost of check - is what earns a warning its card space. The LO was still at Maine's 6080 default. A dark analyzer or a stowed dish is caught by the acquisition step before it; a weaker beacon is a fact, not a mistake.",
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
          hidden: true,
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
              'Step-track RIDES program-track - engage it on an acquired beacon, never from MANUAL (the loop needs a beacon to optimize)',
              'Step-track REPLACES program-track - engage it as soon as the dish is powered, from any mode (the loop finds the beacon itself)',
              'Step-track FOLLOWS the ephemeris - engage it before acquisition whenever AURORA-7 is the target (the loop pre-positions the dish)',
              'Step-track NEEDS manual first - park on nominal Az 190 / El 32, then engage from MANUAL (the loop optimizes from a still start)',
            ],
            correctIndex: 0,
            explanation:
              'A new hire here once engaged step-track from manual with no beacon in the capture cone and watched the dish wander. The rule plus the reason makes the mistake impossible to repeat. The loop has no ephemeris and no search - it only optimizes a beacon it can already see.',
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
              'Healthy = beacon C/N steady at its peak while Az/El wander the figure-8. Moving dish + flat C/N is the loop WORKING',
              'Healthy = Az/El frozen on nominal 190 / 32 while beacon C/N rides the figure-8. Still dish + moving C/N is the loop WORKING',
              'Healthy = beacon C/N climbing steadily as Az/El converge on the peak. Slowing dish + rising C/N is the loop WORKING',
              'Healthy = step-track LED lit and Az/El matching the ephemeris exactly. Matched dish + any C/N is the loop WORKING',
            ],
            correctIndex: 0,
            explanation:
              'The counterintuitive part IS the lesson: motion is health. A new operator who expects a still dish will "fix" a working loop - this line inoculates them. A still dish on an inclined bird means the loop is NOT following it, and the LED only says the mode is selected.',
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
              'C/N sagging mid-track? Verify step-track is still ON before touching the axes - hand-chasing the figure-8 is a losing game',
              'C/N sagging mid-track? Nudge the axes toward the peak before the loop loses it - step-track recovers faster from a good start',
              'C/N sagging mid-track? Leave the step-track parameters alone until engineering clears it - the loop is tuned per axis',
              'C/N sagging mid-track? Narrow the span before judging the carrier - the AURORA-7 transponder is narrower than TIDEMARK',
            ],
            correctIndex: 0,
            explanation:
              'Again the local base rate: the chase mistake has actually happened (an operator here hand-chased the figure-8 for twenty minutes), has a cheap check (is the loop on?), and an expensive failure mode (losing the beacon entirely). Nudging the axes under a live loop fights it; the other two are not tracking faults at all.',
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
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N ≥ 8 dB',
          params: { minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
              'Proof chain, in order: beacon at 1085 (pointing + LO) → RX locked at 1422 / 24 MHz (carrier) → C/N ≥ 8 dB (margin)',
              'Proof chain, in order: C/N ≥ 8 dB (margin) → RX locked at 1422 / 24 MHz (carrier) → beacon at 1085 (pointing + LO)',
              'Proof chain, in order: dashboard green (link) → RX locked at 1422 / 24 MHz (carrier) → link budget matches design (margin)',
              'Proof chain, in order: beacon at 1085 (pointing + LO) → RX locked at 1447 / 24 MHz (carrier) → C/N ≥ 8 dB (margin)',
            ],
            correctIndex: 0,
            explanation:
              'Ordered, numeric, and explains what each check proves - the S9 lesson (beacon proves RF, lock proves data, margin proves durability) compressed to one card line. Each link proves something the others do not, and the order matters: no margin without lock, no lock without pointing. 1447 is the TX IF, not the receive carrier; a green dashboard proves nothing by itself.',
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
              'Carrier "gone" but beacon fine? Widen the span - a 24 MHz carrier is invisible at the 2 kHz span you used for the beacon',
              'Carrier "gone" but beacon fine? Check the reference level - a 24 MHz carrier hides under a level set for a narrow CW beacon line',
              'Carrier "gone" but beacon fine? Check the operations bulletin - AURORA-7 is near retirement and its transponder may be off',
              'Carrier "gone" but beacon fine? Re-acquire in program-track - the dish has drifted off the transponder beam but not the beacon',
            ],
            correctIndex: 0,
            explanation:
              'The span trap is the natural sequel to the card\'s own beacon advice ("use 2 kHz span") - a good card warns about the mistakes its own instructions set up. An operator here once declared an outage over it. Beacon and carrier ride the same beam, so pointing is already proven; the reference level moves the trace, not the carrier.',
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
      description: "The card needs the transmit-side number even though today's run was receive-only.",
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
              "TX IF = BUC LO − uplink RF = 7500 − 6053 = 1447 MHz. AURORA's chain uses BUC LO 7500 - NOT the TIDEMARK 7000",
              "TX IF = BUC LO − uplink RF = 7000 − 6053 = 947 MHz. AURORA's chain uses BUC LO 7000 - the same as the TIDEMARK chain",
              "TX IF = uplink RF − LNB LO = 6053 − 5250 = 803 MHz. AURORA's chain uses the one LO 5250 - the same on both sides",
              "TX IF = 1447 MHz per the transmit SOP. AURORA's chain uses its own BUC LO - see the separate transmit procedure for the value",
            ],
            correctIndex: 0,
            explanation:
              'The 7500-vs-7000 trap has burned a real operator here (carrier 500 MHz off). The worked formula carries both the number and the trap in one line. The LNB LO belongs to the receive chain, and a bare number with no working breaks the day the LO changes.',
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
              "Card space is the reader's attention under pressure - every line they scan past is time lost on a degraded link",
              'Card space is a printing budget - every extra line pushes the card past one page and onto a second sheet',
              'Card space is not the question - the omitted material lives in the SOP, so the card was simply finished when the run ended',
              'Card space is a security boundary - launch history and link-budget math are restricted to engineering distribution',
            ],
            correctIndex: 0,
            explanation:
              "Dana's test for the card is whether SHE would tape it to a console. Editing is the difference between a reference and a re-printed manual. The card earns trust by containing only what earns its place; the omitted material is neither restricted nor an afterthought.",
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
              'AURORA-7 card complete - built against a live procedure run, all green; delivered to Dana for the new-hire packet',
              'AURORA-7 card drafted - values copied from the vendor manual, procedure not run; held pending engineering review',
              'AURORA-7 procedure run complete - acquire, step-track and verify all green; no anomalies, card to follow next shift',
              'AURORA-7 training card finished - built from the SOP step list, condensed to one page; delivered to Dana for ground school',
            ],
            correctIndex: 0,
            explanation:
              '"Built against a live run" is the card\'s provenance - it is what separates this document from the vendor manual it replaces. Sections: Acquire / Track / Verify / Numbers / three Watch-Outs from station history, every one flown green today.',
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
