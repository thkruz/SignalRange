import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz } from '@app/types';
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
  description: `The automation processor in the antenna control unit (ACU) faulted at 1358. Program-track, move-to-target and step-track are all offline, and the dish is sitting exactly where automation left it, which for now is on TIDEMARK-1. The servos still work; it's the brains that died, not the muscles.<br><br>IT owns the controller and has no estimate for a fix. You own the link. TIDEMARK-1 is GEO and well-behaved, so the pointing solution doesn't change. But the ACU's lock light and beacon readout died with the processor, so lock reads UNKNOWN and the beacon on the spectrum is your only proof.<br><br>Get into manual cleanly, prove you're on the bird, hold it there, and don't experiment with the broken automation while IT diagnoses it.`,
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
            azimuth: 153.1 as Degrees,
            elevation: 35.1 as Degrees,
            // polarization: derived from geometry (Phase 29 D8, geoPolarizationSkewDeg; +18.8 deg TM-1 at VT-01)
            trackingMode: 'program-track',
            isStepTrackEnabled: false,
            isBeaconLocked: true,
            targetSatelliteId: 61525,
            targetAzimuth: 153.1 as Degrees,
            targetElevation: 35.1 as Degrees,
            slewing: false,
            beaconCN: 10.4 as dB,
            beaconFrequencyHz: 4175.5e6 as Hertz, // TIDEMARK-1 beacon (RF)
            isLocked: true,
            isAcuAutomationFaulted: true,
          } as Partial<AntennaState>,
        ],
        // The analyzer was left on the carrier view, so proving the beacon
        // means retuning to 1074.5 MHz (nats-s23-F4: the station default sat
        // on the beacon already and the step latched with no input)
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            referenceLevel: -85 as dBm,
            centerFrequency: 1532e6 as Hertz, // TM-1 carrier IF
            span: 50e6 as Hertz,
            rbw: null, // Auto, like every other analyzer at shift start (Phase 31 D9)
            minAmplitude: -100 as dBm,
            maxAmplitude: -40 as dBm,
          },
        ],
      },
    ],
    satellites: [tidemark1Satellite, ses10Satellite],
    scenarioStartDate: '2026-03-19', // Thursday, per the brief
    scenarioStartWallTime: '14:02:00',
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
      description:
        "Open the mission brief and answer the check on what's broken and what still works. IT's update on ticket NOC-2026-2231 arrives as a notice once you've confirmed the fault on the Dashboard.",
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
              'Broken: step-track only. Working: program-track, move-to-target, servos, the RF chain - the orbit predictions still fly the dish',
              'Broken: the RF chain, receiver lock, beacon detect. Working: program-track, step-track, servos - tracking is unaffected',
            ],
            correctIndex: 0,
            explanation:
              "Separating the failed subsystem from the healthy ones is the bypass plan. The automation brain is dead, but the servos and manual mode work, so the dish can still move. That makes you the brain, and the RF chain is how you'll check your work.",
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
      description: 'On the Dashboard, confirm the RF chain is healthy. The ACU fault itself shows on the alarm ticker and in red on the Antenna card.',
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
            question: 'The ACU automation fault is on the ticker and the Antenna card is red, but the RF chain is healthy. Before touching anything, what do you record?',
            options: [
              'Current position (Az 153.1 / El 35.1 on TM-1) and that the carrier is still locked - the dish is ON the bird',
              'Nothing yet (the alarm is time-stamped by IT) and switch to manual at once - every second in faulted program-track risks the bird',
              'The ACU serial and firmware (for ticket NOC-2026-2231) and the alarm text - IT needs the warranty details before they touch it',
              'A full spectrum sweep (every TM-1 transponder) and the noise floor - the fault could be RF, and the sweep proves it is not',
            ],
            correctIndex: 0,
            explanation:
              'The most valuable thing you have right now is that the dish is already pointed correctly, and nothing you do next should lose that. The carrier is still locked (the Receivers card reads "Signals: 1 locked"), so the dish is on the bird. The Antenna card\'s lock and beacon C/N read UNKNOWN because the ACU is faulted, and you\'ll prove the beacon on RF later. Recording the position first means that if a manual input goes wrong, you know exactly where home was.',
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
      description: "Say which jobs the automation was doing that you'll now do by hand.",
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
            question: 'Which jobs does the operator now have to do by hand?',
            options: [
              'Compute pointing (from the prediction sheet), drive the axes by hand, and judge lock from the spectrum - not the ACU indicator',
              'Slew the axes (from the ACU panel), watch the polar plot, and wait for the lock indicator - the lock logic is separate from the crash',
              'Select manual (from the mode buttons), enter the target, and let manual mode point it - manual still automates the pointing',
              "Re-derive the orbit (from first principles), compute the satellite's position, and drive the axes - the prediction sheet came from the dead ACU",
            ],
            correctIndex: 0,
            explanation:
              "The dangerous assumption is waiting for the ACU lock light. The failed processor drives that light, so it reads UNKNOWN until IT restores it. The spectrum analyzer, with the beacon at the right IF, is the one pointing check that doesn't depend on the broken processor.",
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
      description: 'IT has asked you not to power-cycle the controller (ticket NOC-2026-2231). Confirm why going manual beats rebooting right now.',
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
              'A reboot risks a bad axis calibration and wipes the crash state IT needs - manual keeps the link up and the evidence intact',
              "A reboot takes too long - the ACU cold-start and self-test run past the customer's tolerance, and manual is faster to reach",
              "A reboot needs authorization the operator does not hold - the power switch is IT's, and touching it puts the ticket on you",
              'A reboot would drop the customer, which manual avoids - that is the whole reason, and nothing about the box itself matters',
            ],
            correctIndex: 0,
            explanation:
              "Going manual keeps the link up and leaves the ACU exactly as it crashed, which is the evidence IT needs for the root cause. A restart could also leave the axis calibration wrong, and a wiped crash state can't be recovered. You power-cycle equipment you own, but you coordinate with the owner when someone else is debugging it, so IT restarts the ACU on their schedule.",
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
      description:
        'Open ACU Control and select MANUAL on purpose. A faulted controller in a half-automatic state is worse than honest manual. This step is timed, and running out of time fails the shift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['no-reboot-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      // The dish is coasting under a dead loop: getting into honest manual is
      // the emergency action of the bypass
      timeoutFails: true,
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
              "A half-failed automatic state is the worst of both worlds, because it looks like something is in control when nothing is. Honest manual removes that ambiguity: the displays mean what they say, every control does what it says, and there's no phantom loop to fight.",
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
      description:
        "On RX Analysis, the spectrum analyzer is showing the carrier at 1532 MHz. Retune its center frequency to the TIDEMARK-1 beacon at 1074.5 MHz IF and confirm the beacon is there. It's your only pointing check now. This step is timed, and running out of time fails the shift.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['manual-deliberate-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      // Until the beacon is proven the link is only assumed to be up
      timeoutFails: true,
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
      description:
        'On RX Analysis, read receiver modem 1. It should be locked on the TIDEMARK-1 carrier at 1532 MHz with a C/N of at least 9 dB, which shows the link is alive under manual control.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['prove-beacon'],
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
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N ≥ 9 dB',
          params: { minCNRatio: 9 },
          mustMaintain: true,
        },
        {
          // Read quiz in place of the 5 s dwell (Phase 27 Q3, s23-F4).
          // Calibration (test/calibration/nats-scenario23.json): 14.35 dB raw C/N, 10.1 dB lock
          // margin, with the dish parked where the automation died
          type: 'status-check',
          description: 'Carrier C/N Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does RX modem 1 show on the TM-1 carrier, now that the dish is under manual control?',
            options: [
              'Locked, C/N about 14 dB - the same healthy link the automation left behind',
              'Locked, C/N about 5 dB - the dish has drifted toward the edge of the beam since the processor died',
              'Unlocked, C/N below 0 dB - the dish is off the satellite and the beacon on the analyzer is a sidelobe',
              'Locked, C/N about 30 dB - manual mode bypasses the LNB, so the reading is higher than normal',
            ],
            correctIndex: 0,
            explanation:
              "The modem is locked at about 14 dB and the beacon is where the sheet says, so you have two readings from the RF chain, which never failed. The ACU lock light comes from the dead processor, and these readings don't.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'instruments-not-feel-quiz',
      nice: ['S0424', 'K1032'],
      title: 'Fly Instruments, Not Feel',
      description: "Pick the check you'll rely on after any manual pointing change.",
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
              "The ACU lock light is computed by the failed processor. It reads UNKNOWN now, and even if it came back on its own you couldn't trust it. The beacon and receiver lock come from the RF chain, which is healthy, so fly the instruments that still work.",
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
      description:
        'Stay on RX Analysis and watch the link for 30 s under manual control. TIDEMARK-1 is GEO and barely moves, so a steady manual hold is feasible for the shift. Then say what the instruments did.',
      groundStation: 'VT-01',
      // A watch: manual mode and the lock are meant to stay as they are
      intent: 'confirm',
      prerequisiteObjectiveIds: ['instruments-not-feel-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          // B3: the 30 s hold accrues only while the player watches the RF
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
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
        {
          type: 'status-check',
          description: 'Hold Read',
          params: {
            character: Character.SYSTEM,
            question: 'Over the 30 s you watched, what did the beacon on the analyzer and RX modem 1 do?',
            options: [
              'Nothing worth a correction: beacon steady on the analyzer, modem locked at about 14 dB throughout',
              'The beacon walked steadily down the screen and the C/N fell a dB every few seconds - a nudge is due',
              'The modem dropped lock twice and relocked - normal for manual mode, so no action is needed',
              'The beacon vanished and the C/N held - the analyzer lost the beacon but the link is fine',
            ],
            correctIndex: 0,
            explanation:
              "A well-kept GEO bird moves a few hundredths of a degree in hours, which is a tiny fraction of a 0.6 degree beam, so 30 s of manual hold shows no change at all. That's why manual is a sustainable bypass here, and it wouldn't be on an inclined bird.",
            pointPenalty: 5,
          },
          mustMaintain: false,
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
              "The same fault on AURORA-7 would be a real crisis, because without step-track you'd be chasing a figure-8 by hand. TIDEMARK-1's stability is what turns an automation failure into something annoying but holdable.",
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
      description: "IT is ready to attempt the recovery. Choose how you'll coordinate with them.",
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
              'Confirm the link is stable on manual, agree a window, then re-verify pointing on RF afterward - ready to fall back to manual',
              'Tell IT to wait, hold manual until end of shift, then hand the recovery to the next operator - never restart a box mid-shift',
              'Let IT proceed, keep flying manual, then trust program-track when the panel comes back - it is their system and their call',
              'Switch back to program-track now, let IT watch the loop, then confirm on the lock indicator - a live test beats a cold restart',
            ],
            correctIndex: 0,
            explanation:
              'You drive the link and IT drives the box. The link has to be on a stable footing (manual and verified) before anyone touches the box, and after recovery you re-establish program-track and re-verify it on the RF. Never assume a recovered automation is pointed correctly just because it says so.',
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
      description:
        "Pick the entry that records the bypass, then type your own entry in the Ops Log (sidebar). It must mention the switch to manual and that the ACU wasn't rebooted.",
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
              'ACU fault 1358 (NOC-2026-2231); to manual (time-stamped), TM-1 on sheet pointing, beacon + carrier checked on RF; not rebooted',
              'ACU fault 1358 (NOC-2026-2231); rebooted (time-stamped), program-track restored, lock indicator green; link fine, ticket closed',
              'ACU fault 1358 (NOC-2026-2231); to manual (time-stamped), link fine, no further action; IT issue, nothing for operations to record',
              'ACU fault 1358 (NOC-2026-2231); to manual (time-stamped), TM-1 held on ACU lock indicator, polar plot on target; rebooted for IT',
            ],
            correctIndex: 0,
            explanation:
              "The correct entry gives the next shift and IT what they need: the pointing source (the prediction sheet), proof from the RF that the link is healthy under manual, and the fact that the controller was deliberately not rebooted. That keeps the crash state intact. The other entries say you rebooted, skip the details, or lean on the lock indicator, which comes from the failed processor. After IT's recovery, the next operator still has to re-verify pointing on RF.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'ops-log-entry',
          description: 'Bypass Entry Typed in the Ops Log',
          params: { logKeywords: ['manual', 'reboot'], logMinLength: 20 },
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
        <em>[Dana, at your console, 14:02]</em>
      </p>
      <p>
        "The automation processor in the ACU faulted at 1358, so program-track, move-to-target and step-track are all offline. The ACU is the antenna control unit, the box that points the dish. The dish is parked on TIDEMARK-1 where the processor died. The servos and manual mode still work, because it's the brains that failed, not the muscles. IT owns the controller and doesn't know when it'll be back. You own the link. Get into manual cleanly, prove you're on the bird using the spectrum, and hold it there. Do NOT play with the broken automation while IT diagnoses it."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/23/intro.mp3'),
    },
    objectives: {
      // After the first diagnosis, so the IT ask is on screen before "Why Not Reboot It"
      // (nats-r5-s23-F1, Phase 30 D19); same clip as before, keyed to the earlier step
      'confirm-fault-dashboard': {
        text: `
        <p>
          <em>[IT ticket NOC-2026-2231 update, {{stationTime}}]</em>
        </p>
        <p>
          "Please do NOT power-cycle the ACU. We need its crash dump, which records what it was doing when it failed. The axis calibration may also be wrong after a restart. Once you're on manual, hold the link there until we've pulled the logs, and then we'll coordinate a recovery window with you. - IT/NOC"
        </p>
        `,
        character: Character.NOTICE,
        emotion: Emotion.NEUTRAL,
        audioUrl: '', // NOTICE clips are text-only (Phase 35 decision 6)
      },
      'prove-carrier': {
        text: `
        <p>
          The beacon's where the sheet says and the receiver's locked, so the link is alive under manual. That's the whole skill. The automation was never magic, just bookkeeping you can do by hand when you have to.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/23/obj-prove-carrier.mp3'),
      },
      'log-bypass': {
        text: `
        <p>
          That was a clean bypass. The link never dropped, and you left IT everything they need to find the root cause. Recording the switch to manual and that nobody rebooted the ACU is what the next shift and IT look for.
        </p>
        <p>
          IT takes the box when they're ready. The link's yours until they hand it back.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/23/obj-log-bypass.mp3'),
      },
    },
  },
};
