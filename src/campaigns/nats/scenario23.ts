import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, Hertz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 23: "Emergency Bypass"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 7 of 8)
 * Time Pressure: Moderate - the link is up but the safety net is gone
 * Calculation Required: NO (the pointing solution is on the prediction sheet)
 * New Mechanic: ACU automation fault (engine: isAcuAutomationFaulted disables
 *   program-track / step-track / move-to-target; manual servos still work).
 *   First scenario where the automation itself is the broken thing.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0424: Skill in executing command line tools (manual operation)
 *   - T1588: Diagnose faulty system and server hardware
 *   - S0671: Skill in implementing contingency and recovery plans
 *
 * Supporting Codes:
 *   - T0531: Troubleshoot hardware/software interoperability problems
 *   - S0421: Skill in operating network equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *
 * Premise: The ACU automation controller crashed mid-shift. Program-track,
 * move-to-target, and step-track are unavailable; the dish is parked where
 * automation left it - on TIDEMARK-1. Servos and manual mode still work. The
 * operator must switch to manual deliberately, prove pointing against the
 * prediction sheet using the beacon (the ACU lock logic is dead, so the
 * spectrum is the only truth source), hold the link, and resist rebooting the
 * controller while IT works the root cause.
 *
 * TIDEMARK-1 is GEO and well-behaved, so manual holding is feasible for a
 * shift - the lesson is that manual ops is a fallback competency, and that the
 * automation was doing real work the operator must now do by hand.
 *
 * Tone: Crisis-phase. Dana at the console (intro + IT updates), IT rendered as
 * SYSTEM ticket notes. All quizzes SYSTEM. 4 clips.
 *
 * Sim notes:
 *   - VT-01 antenna starts on TIDEMARK-1 (program-track, locked) but with
 *     isAcuAutomationFaulted: true. The faulted automation means the operator
 *     cannot use program-track/step-track; the objective is to commit to
 *     MANUAL and prove the link there.
 *   - In manual mode the dish holds position (GEO bird barely moves over a
 *     shift), so beacon + carrier stay locked once the operator is on target.
 */

export const scenario23Data: ScenarioData = {
  id: 'nats-scenario23',
  prerequisiteScenarioIds: ['nats-scenario22'],
  url: 'nats/scenarios/nats-scenario23',
  imageUrl: 'nats/23/card.png',
  number: 23,
  title: 'Emergency Bypass',
  subtitle: 'Manual Operations During Automation Failure',
  duration: '25-30 min',
  difficulty: 'advanced',
  missionType: 'Contingency Operations',
  description: `The ACU automation processor faulted at 1358. Program-track, move-to-target, and step-track are all offline - the dish is sitting exactly where automation left it, which for now is on TIDEMARK-1. The servos still work; it's the brains that died, not the muscles.<br><br>IT owns the controller and has no ETA. You own the link. TIDEMARK-1 is GEO and well-behaved, so the pointing solution doesn't change - but with the automation's lock logic dead, the ACU panel can no longer tell you whether you're on the satellite. The beacon on the spectrum is your only proof.<br><br>Get into manual cleanly, prove you're on the bird, hold it there, and do not experiment with the broken automation while IT is mid-diagnosis.`,
  equipment: ['9-meter C-band Antenna (manual servo control)', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'TIDEMARK-1 prediction sheet'],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            // On TIDEMARK-1 where automation left it - but the automation
            // controller has faulted. Program-track/step-track are dead;
            // manual servo control is the only way to move the dish.
            isPowered: true,
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            polarization: 14 as Degrees,
            trackingMode: 'program-track',
            isStepTrackEnabled: false,
            isBeaconLocked: true,
            targetSatelliteId: 61525,
            targetAzimuth: 161.8 as Degrees,
            targetElevation: 34.2 as Degrees,
            targetPolarization: 14 as Degrees,
            slewing: false,
            beaconCN: 10.4 as dB,
            beaconFrequencyHz: 1074.5e6 as Hertz,
            isLocked: true,
            isAcuAutomationFaulted: true,
          } as Partial<AntennaState>,
        ],
      },
    ],
    satellites: [tidemark1Satellite, ses10Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-23?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Fault',
      description: 'Open the brief and IT ticket NOC-2026-2231.',
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
          description: 'Frame the Problem',
          params: {
            character: Character.SYSTEM,
            question: 'The ACU automation processor crashed. What is and is not working?',
            options: [
              'Broken: program-track, step-track, move-to-target, lock logic. Working: servos, manual mode, the RF chain - you have to fly it',
              'Broken: servos, manual mode, program-track, step-track. Working: the RF chain and the lock logic - the dish is frozen until IT reboots',
              'Broken: step-track only. Working: program-track, move-to-target, servos, the RF chain - the ephemeris still flies the dish',
              'Broken: the RF chain, receiver lock, beacon detect. Working: program-track, step-track, servos - tracking is unaffected',
            ],
            correctIndex: 0,
            explanation:
              'Separating the failed subsystem from the healthy ones IS the bypass plan. The automation brain is dead; the muscles work, so the dish can still move. You become the brain.',
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
    // PHASE 1: ASSESS THE FAULT
    // ============================================================
    {
      id: 'confirm-fault-dashboard',
      nice: ['T1588', 'T0531'],
      title: 'Confirm the Automation Fault',
      description: 'Dashboard: confirm the ACU automation alarm and that the RF chain is healthy.',
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
          description: 'Fault Scope',
          params: {
            character: Character.SYSTEM,
            question: 'The ACU automation fault alarm is up. Before touching anything, what do you record?',
            options: [
              'Current position (Az 161.8 / El 34.2 on TM-1) and that beacon + carrier are still locked - the dish is ON the bird',
              'Nothing yet (the alarm is time-stamped by IT) and switch to manual at once - every second in faulted program-track risks the bird',
              'The ACU serial and firmware (for ticket NOC-2026-2231) and the alarm text - IT needs the warranty details before they touch it',
              'A full spectrum sweep (every TM-1 transponder) and the noise floor - the fault could be RF, and the sweep proves it is not',
            ],
            correctIndex: 0,
            explanation:
              'The single most valuable asset right now is that the dish is already pointed correctly, and whatever you do next must not lose that. Record it before you move, so if a manual input goes wrong you know exactly where home was.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'what-automation-did-quiz',
      nice: ['K1032', 'S0671'],
      title: 'What the Automation Was Doing',
      description: 'Make explicit the work you are about to inherit.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-fault-dashboard'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Inherited Work',
          params: {
            character: Character.SYSTEM,
            question: 'Which functions does the operator now have to perform by hand?',
            options: [
              'Compute pointing (from the prediction sheet), drive the axes by hand, and judge lock from the spectrum - not the ACU indicator',
              'Slew the axes (from the ACU panel), watch the polar plot, and wait for the lock indicator - the lock logic is separate from the crash',
              'Select manual (from the mode buttons), enter the target, and let manual mode point it - manual automates the pointing differently',
              'Re-derive the orbit (from first principles), compute the ephemeris, and drive the axes - the prediction sheet came from the dead ACU',
            ],
            correctIndex: 0,
            explanation:
              'The dangerous assumption is trusting the ACU lock light - it is driven by the failed processor. The spectrum analyzer (beacon at the right IF) is the only pointing truth source that does not depend on the broken thing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'no-reboot-quiz',
      nice: ['T1588', 'T0531'],
      title: 'Why Not Reboot It',
      description: 'IT has not rebooted the controller. Confirm why bypassing beats rebooting right now.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['what-automation-did-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Bypass vs Reboot',
          params: {
            character: Character.SYSTEM,
            question: 'Why is "go manual and hold" the right move instead of power-cycling the ACU yourself?',
            options: [
              'A reboot risks defaulted axis calibration and wipes the crash state IT needs - bypass keeps the link up and keeps the evidence',
              "A reboot takes too long - the ACU cold-start and self-test run past the customer's tolerance, and manual is faster to reach",
              "A reboot needs authorization the operator does not hold - the power switch is IT's, and touching it puts the ticket on you",
              'A reboot would drop the customer, which manual avoids - that is the whole reason, and nothing about the box itself matters',
            ],
            correctIndex: 0,
            explanation:
              'Same discipline as the S8/S16 LNB lesson scaled up: you cycle equipment you own; you coordinate cycles on equipment someone else is debugging - IT cycles it on their schedule. The calibration risk is the technical reason; preserving crash state for root cause is the investigative one.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: COMMIT TO MANUAL
    // ============================================================
    {
      id: 'switch-to-manual',
      nice: ['S0424', 'S0671'],
      title: 'Switch to Manual Control',
      description: 'Open ACU Control and deliberately select MANUAL - a faulted controller in a half-automatic state is worse than honest manual.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['no-reboot-quiz'],
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
          description: 'Manual Mode Engaged',
          params: { trackingMode: 'manual' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'manual-deliberate-quiz',
      nice: ['S0424', 'K1032'],
      title: 'Why Deliberate Manual',
      description: 'Confirm why committing to manual is safer than leaving the dish in a faulted program-track.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-manual'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Honest Manual',
          params: {
            character: Character.SYSTEM,
            question: 'Why deliberately select MANUAL rather than leave it in program-track with dead automation?',
            options: [
              'In program-track the panel implies a loop is flying the dish when none is - manual makes YOU the controller, explicitly',
              'In program-track the dead loop will resume on its own and undo your inputs - manual locks it out until IT clears the fault',
              'In program-track the servo resolution is coarser than the hand controls - manual is the more accurate mode for a fine hold',
              'In program-track nothing is different once the automation is dead - manual is a label change, and the panel behaves the same',
            ],
            correctIndex: 0,
            explanation:
              'A half-failed automatic state is the worst of both worlds: it looks like something is in control and nothing is. Honest manual removes the ambiguity - the displays mean what they say, every control does exactly what it says, and there is no phantom loop to fight.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: PROVE THE LINK ON INSTRUMENTS
    // ============================================================
    {
      id: 'prove-beacon',
      nice: ['S0424', 'K0773'],
      title: 'Prove Pointing on the Beacon',
      description: 'Tune the spectrum analyzer to the TM-1 beacon IF (1074.5 MHz) and confirm it - your only pointing truth source.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['manual-deliberate-quiz'],
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
          description: 'Spectrum at 1074.5 MHz IF',
          params: {
            centerFrequency: 1074.5e6,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Present',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'prove-carrier',
      nice: ['S0424', 'T0153'],
      title: 'Prove the Carrier',
      description: 'Confirm the receiver is locked on the TM-1 carrier with healthy margin - the link is alive under manual control.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['prove-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N ≥ 9 dB',
          params: { minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'instruments-not-feel-quiz',
      nice: ['S0424', 'K1032'],
      title: 'Fly Instruments, Not Feel',
      description: 'Lock in the verification discipline for manual ops.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['prove-carrier'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verification Source',
          params: {
            character: Character.SYSTEM,
            question: 'After any manual pointing input during this fault, what confirms you are still on the satellite?',
            options: [
              'The beacon at 1074.5 MHz on the spectrum and receiver lock - the RF truth, independent of the dead ACU automation',
              'The ACU lock indicator turning green and the polar plot on target - the lock logic reads the RF chain, which is healthy',
              'The polar plot on target and Az/El matching the prediction sheet - the position readouts come from the servos, not the processor',
              'The dish stopped moving and the axes holding still - a GEO bird does not move, so a still dish is a pointed dish',
            ],
            correctIndex: 0,
            explanation:
              'The ACU lock light is computed by the failed processor - it is exactly the instrument you cannot trust, so never use it. The beacon and receiver lock come from the RF chain, which is healthy. Fly the instruments that still work.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: HOLD AND COORDINATE
    // ============================================================
    {
      id: 'sustained-manual-hold',
      nice: ['S0671', 'T0153'],
      title: 'Hold Under Manual Control',
      description: 'Sustain the link manually - TIDEMARK-1 is GEO and barely moves, so a steady manual hold is feasible for the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['instruments-not-feel-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Manual Mode Held',
          params: { trackingMode: 'manual' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Carrier Held',
          params: { modemNumber: 1 },
          mustMaintain: true,
          maintainDuration: 30,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'geo-feasibility-quiz',
      nice: ['K1032', 'S0671'],
      title: 'Why Manual Holds (This Time)',
      description: 'Confirm what makes a manual hold sustainable here - and when it would not be.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sustained-manual-hold'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Feasibility',
          params: {
            character: Character.SYSTEM,
            question: 'Manual holding works for this shift. What makes it feasible, and when would it NOT be?',
            options: [
              "TIDEMARK-1 is a well-behaved GEO bird that barely moves, so a fixed point holds - NOT on AURORA-7's inclined figure-8",
              'Manual always works, since the servos are the muscles and they are healthy - NOT dependent on which satellite is the target',
              'The LNB compensates for drift, so the receiver keeps lock as the bird wanders - NOT possible on a receiver without AGC',
              'It only works at night, when the sun is off the array and the bird stops drifting - NOT during daytime thermal cycling',
            ],
            correctIndex: 0,
            explanation:
              'The same fault on AURORA-7 would be a genuine crisis - no step-track means chasing a figure-8 by hand. TIDEMARK-1\'s stability is what turns "automation failure" into "annoying but holdable."',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'it-coordination-quiz',
      nice: ['T0531', 'S0671'],
      title: 'Coordinate the Repair',
      description: 'IT is ready to attempt recovery. Set the coordination.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['geo-feasibility-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Repair Coordination',
          params: {
            character: Character.SYSTEM,
            question: 'IT wants to attempt the ACU recovery now. What does the ground operator coordinate?',
            options: [
              'Confirm the link is stable on manual, agree a window, then re-verify pointing on RF after recovery - ready to fall back to manual',
              'Tell IT to wait, hold manual until end of shift, then hand the recovery to the next operator - never restart a box mid-shift',
              'Let IT proceed, keep flying manual, then trust program-track when the panel comes back - it is their system and their call',
              'Switch back to program-track now, let IT watch the loop, then confirm on the lock indicator - a live test beats a cold restart',
            ],
            correctIndex: 0,
            explanation:
              'You drive the link; IT drives the box. The link must be on a stable footing (manual, verified) before the box gets touched, and program-track re-established and re-verified on the RF after - never assume a recovered automation is pointed correctly just because it says so.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-bypass',
      nice: ['K0645', 'S0671'],
      title: 'Log the Bypass',
      description: 'Record the manual-operations timeline for the shift and for IT.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['it-coordination-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Bypass Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry records the bypass correctly?',
            options: [
              'ACU fault 1358 (NOC-2026-2231); manual 1404, TM-1 held on sheet pointing, beacon + carrier verified on RF; not rebooted',
              'ACU fault 1358 (NOC-2026-2231); rebooted 1404, program-track restored, lock indicator green; link fine, ticket closed',
              'ACU fault 1358 (NOC-2026-2231); manual 1404, link fine, no further action; IT issue, nothing for operations to record',
              'ACU fault 1358 (NOC-2026-2231); manual 1404, TM-1 held on ACU lock indicator, polar plot on target; rebooted for IT',
            ],
            correctIndex: 0,
            explanation:
              'The details the next shift and IT need: the pointing source (prediction sheet), that the lock light was distrusted (driven by the failed processor), that the link is nominal under manual, that the controller was deliberately NOT rebooted (crash state preserved), and that recovery needs RF re-verification post-restart.',
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
        <em>[Dana, at your console, 14:04]</em>
      </p>
      <p>
        "ACU automation processor faulted at 1358 - program-track, move-to-target, step-track all offline. Dish is parked on TM-1 where it died. Servos and manual still work; it's the brains, not the muscles. IT owns the controller and has no ETA. You own the link. Get into manual cleanly, prove you're on the bird with the spectrum, and hold it. Do NOT play with the broken automation while IT's mid-diagnosis."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/23/intro.mp3'),
    },
    objectives: {
      'no-reboot-quiz': {
        text: `
        <p>
          <em>[IT ticket NOC-2026-2231 update, 14:09]</em>
        </p>
        <p>
          "Do NOT power-cycle the ACU - we need the crash dump and the axis calibration is suspect on restart. Hold on manual, we'll coordinate a recovery window once we've pulled the logs. - IT/NOC"
        </p>
        `,
        character: Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/23/obj-no-reboot-quiz.mp3'),
      },
      'prove-carrier': {
        text: `
        <p>
          Beacon's where the sheet says, receiver's locked, and you got there without trusting a single readout from the dead controller. That's the whole skill - the automation was never magic, just bookkeeping you can do by hand when you have to.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/23/obj-prove-carrier.mp3'),
      },
      'log-bypass': {
        text: `
        <p>
          Clean bypass, link never dropped, and you left IT everything they need to find the root cause. Log it the way you ran it - especially the part about not trusting the lock light. That's the line that teaches the next person.
        </p>
        <p>
          IT will take the box when they're ready. The link's yours until they hand it back.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/23/obj-log-bypass.mp3'),
      },
    },
  },
};
