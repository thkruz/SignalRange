import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 8 - "Night Passes" / Solo Evaluation (Phase 1 graduation)
 *
 * No new mechanics. Everything from S1-S7 in one unassisted night: build a
 * valid two-station contact plan, complete a COMSEC rotation, prove the link
 * budget on a cold chain, chain up in order inside the window, command the
 * bird, chain down,
 * then run the rest of the night alone across both sites - a remote telemetry
 * contact from Shetland on a reference in holdover, and a steep pass at Galway
 * after a traffic-key roll - with no coaching clip telling the operator what to
 * do next. Quizzes are the operator's own checklist.
 *
 * Phase 16 rewrite: four contacts on the board, three worked (beats 2-4 each),
 * two faults staged on the mission clock (E3): a GNSS outage at SH-02 from
 * 02:44 to 02:59 that puts the Shetland reference into holdover for the 02:54
 * contact, and the fleet traffic-key roll at 04:15 that the operator finds as
 * a Mismatch during the pre-pass check for the 04:27 contact.
 *
 * Clock: sim starts 2027-03-16 00:15:00 UTC, sixteen minutes before the first
 * AOS so the plan, rotation, budget and chain fit before it. Passes at the
 * 5 deg mask (0 deg horizon in brackets):
 * - C1 GW-01 MERIDIAN-SAR-1: AOS 00:31:19 az 184 (00:30:10), max el 40.4 at
 *   00:35:03 (581 km), LOS 00:38:49 az 338 (00:39:58). Peak C/N 13.4 dB, >= 8 dB
 *   ~00:33:10 .. 00:37:00. Command window 00:31:40 .. 00:38:30.
 *   SH-02 sees the same pass at 17 deg (00:33:31 .. 00:39:56): Fiona's, overlaps.
 * - C2 SH-02 MERIDIAN-SAR-2: AOS 02:54:39 az 042, max el 13.4 at 02:57:34
 *   (1233 km), LOS 03:00:27 az 140. Peak C/N 6.6 dB, >= 5 dB for 228 s: a
 *   telemetry contact, not an imagery one. Galway sees a 5.6 deg graze.
 * - C3 GW-01 MERIDIAN-SAR-2: AOS 04:27:31 az 018, max el 73.1 at 04:31:23
 *   (408 km), LOS 04:35:12 az 192. Peak C/N 16.5 dB, >= 8 dB for 259 s; the
 *   20 deg/s pedestal holds it through the top (no keyhole at 73 deg).
 *   SH-02 sees a 72.5 deg pass at the same time (04:25:31 .. 04:33:13):
 *   priority 3, one operator, dropped.
 * All numbers measured through the real chain; see
 * test/campaigns/nats-eu-phase-b-validation.test.ts.
 *
 * Staged state (scenario-local clone): SH-02 modem 1 on the 1414 MHz SAR-1
 * carrier from Fiona's evening, BUC muted. GW-01 is the shared default.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0081: Perform operational testing and evaluation
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K0874: Knowledge of cryptographic key management
 *   - K0728: Knowledge of cryptographic key storage and handling
 *   - K0689: Knowledge of network systems management
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0129: Coordinate and manage system operations schedules
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - T1567: Conduct satellite command and control operations
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** SH-02 as Fiona left it: modem on SAR-1, BUC muted. Deep clone, never spread. */
const shetlandNight: GroundStationConfig = structuredClone(shetlandGroundStation);
shetlandNight.rfFrontEnds[0].buc = { ...shetlandNight.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario8Data: ScenarioData = {
  id: 'nats-eu-scenario8',
  url: 'nats-eu/scenarios/nats-eu-scenario8',
  imageUrl: 'nats/8/card.png',
  number: 8,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario7'],
  title: 'Night Passes',
  subtitle: 'Solo Evaluation',
  duration: '40 min',
  missionType: 'Evaluation',
  description: `00:15 local. Charlie is at home. Fiona takes the first Shetland pass and goes off shift at 01:00; after that SH-02 is yours, remote, along with everything else.<br><br>This is the qualification shift for NATS Europe LEO operations: a contact plan to build across two sites, a COMSEC rotation that landed on your watch, an acceptance budget to prove, a command that has to reach MERIDIAN-SAR-1 inside a seven-minute window, and then two more contacts before dawn that nobody has pre-checked for you.<br><br>Nobody is going to prompt you. Everything on this shift you have already done once.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'Contact Plan / Link Analysis / TT&C consoles',
    'Ku-Band BUC + HPA, QPSK 3/4 modems',
    'Payload Crypto (AES-256-GCM)',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandNight],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-16',
    scenarioStartWallTime: '00:15:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-8?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 5,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // Two and a half hours of empty sky between the first and second contact,
    // and ninety minutes between the second and third. The skip stops 2 min
    // before the next pass at either site and is blocked while a timed
    // objective runs; mission-elapsed advances with it, so the plan, the faults
    // and the command window stay aligned with the sky.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 5,
    },

    workingDocument: {
      title: 'GW-01 Night Shift Handover',
      description: 'What the day shift inherits: every contact worked, every fault found and cleared, the state of both sites at handover.',
    },

    // M3 - the night plan. Two overlapping pairs have to be split across the
    // sites; the 04:25 Shetland overhead is priority 3 and one operator cannot
    // fly both 04:27 passes, so it may be dropped. Windows are the 5 deg mask
    // crossings from the 00:15 epoch, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'N-SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 40 deg pass)', priority: 1, windowStartS: 980, windowEndS: 1430, stationId: 'GW-01' },
        { id: 'N-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 17 deg pass)', priority: 1, windowStartS: 1110, windowEndS: 1500, stationId: 'SH-02' },
        { id: 'N-SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, 13 deg pass)', priority: 2, windowStartS: 9580, windowEndS: 9930, stationId: 'SH-02' },
        { id: 'N-SAR2-GW', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Galway, 73 deg pass)', priority: 1, windowStartS: 15150, windowEndS: 15610, stationId: 'GW-01' },
        {
          id: 'N-SAR2-SH-2',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Shetland, 72 deg overhead, same orbit)',
          priority: 3,
          windowStartS: 15030,
          windowEndS: 15490,
          stationId: 'SH-02',
        },
      ],
    },

    // M1 - acceptance budget for the night pass geometry (581 km at max el).
    linkBudget: {
      label: 'Night pass: MERIDIAN-SAR-1 downlink at max elevation',
      expectedCNRDb: 13.3,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 3,
    },

    // M5 - the rotation landed on the night shift, as they always do. Window is
    // the SAR-1 pass: AOS 00:31:19 (979 s) .. LOS 00:38:49 (1429 s).
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 1000,
      windowEndS: 1410,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },

    // E3 - two faults on the mission clock, unlabelled: noticing them is the
    // evaluation. The Shetland GNSS antenna drops out at 02:44 and comes back at
    // 02:59, so the 02:54 contact is flown on the oscillator; the fleet traffic
    // key rolls at 04:15 and the station's payload crypto reads Mismatch until
    // the operator re-keys before the 04:27 pass.
    hardwareFaultEvents: [
      { id: 'sh-gnss-outage', groundStationId: 'SH-02', target: 'gpsdo-gnss-loss', startTime: 8940, duration: 900 },
      { id: 'traffic-key-roll', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startTime: 14400 },
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'T0081'],
      title: 'Take the Shift',
      description: 'Open the shift brief and take the console. Everything you need is in it; nobody will walk you through the rest.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Order of Work',
          params: {
            character: Character.SYSTEM,
            question: 'Plan, rotation, budget. AOS is at 00:31. Which of these depend on the spacecraft being in view?',
            options: [
              'None of them - all three can and should be finished before AOS; the pass is seven and a half minutes and none of it should be spent on preparation',
              'The rotation - the far end must be in view to acknowledge the new key',
              'The budget - it needs a live C/N to compute',
              'The plan - a contact can only be allocated while its bird is visible',
            ],
            correctIndex: 0,
            explanation:
              'The plan, the key and the worksheet are all ground-side. The chain goes up inside the window, after the downlink is proven cold. Sixteen minutes to AOS. Shift clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 5 / BEAT 1: PLAN, KEY, BUDGET, CHAIN
    // ============================================================
    {
      id: 'build-the-night-plan',
      nice: ['K0689', 'T0129'],
      title: 'Build the Night Contact Plan',
      description: 'Allocate the required contacts across GW-01 and SH-02 with no site double-booked. The plan must read DECONFLICTED.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Contact Plan Open',
          params: { tab: 'contact-schedule' },
          mustMaintain: false,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Dropped Contact Justified',
          params: {
            character: Character.SYSTEM,
            question: 'The 04:25 Shetland overhead and the 04:27 Galway pass are the same orbit. One operator, two sites. What happens to the overhead?',
            options: [
              'It is priority 3 and may be dropped: the plan is valid without it, and one operator cannot fly both sites through the same four minutes',
              'It must be allocated to SH-02; the plan is invalid without it',
              'Both go to Galway - the higher pass wins',
              'It replaces the Galway pass, because 72 degrees is better geometry',
            ],
            correctIndex: 0,
            explanation:
              'The plan requires priority 2 and above. Dropping a P3 is a decision, and the plan records who made it and why: Fiona is off shift, and the 73 degree Galway pass is the stronger one to fly alone.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'night-key-rotation',
      nice: ['K0874', 'K0728', 'T1567'],
      title: 'Complete the COMSEC Rotation',
      description: 'The scheduled rotation is pending on the command key. Initiate, then confirm, before the pass - or nothing you send will authenticate.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'key-rotation-completed',
          description: 'Key Rotation Completed',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'night-budget',
      nice: ['T0081', 'K0740'],
      title: 'Predict the Night Link',
      description:
        'Compute the expected C/N for this pass. The geometry is better than the afternoon passes: 581 km at maximum elevation, free-space path loss 169.1 dB at 11686 MHz. EIRP 28 dBm, receive gain 51.8 dBi, system noise temperature 88 K, bandwidth 36 MHz, miscellaneous losses 1 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'link-budget-computed',
          description: 'Predicted C/N Matches Truth',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Range Delta Read',
          params: {
            character: Character.SYSTEM,
            question: 'The afternoon card used 171.4 dB of path loss at 761 km; tonight is 169.1 dB at 581 km. Where do the 2.3 dB come from?',
            options: [
              '20 log(761 / 581): a 40 degree pass puts the bird a third closer than a 28 degree one, and path loss goes with the square of range',
              'Cooler night sky lowering the noise temperature',
              'The transmitter runs hotter on the night side',
              'Less atmosphere at night',
            ],
            correctIndex: 0,
            explanation: 'Every dB of the difference is geometry. Predicted 13.3 dB; the card is wrong if the measurement is more than a decibel away.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'gw-reference-and-chain',
      nice: ['T0431', 'K0740'],
      title: 'GW-01 Reference and BUC Lock',
      description: 'GPSDO locked, BUC on the external reference, before the chain goes up.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['build-the-night-plan', 'night-key-rotation', 'night-budget'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'GW-01 BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'chain-up-for-commanding',
      nice: ['S0421', 'T1567', 'K0645'],
      title: 'Chain Up for Commanding',
      description:
        'Downlink proven, window open until 00:38:30. Uplink Doppler compensation on the TT&C console, then the chain in order: carrier into the muted BUC, unmute, HPA. An uplink on this rack spoils the receive measurement, which is why the link was proven cold first. Nobody will check the order for you.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['prove-the-night-link'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // CONTACT 1: MERIDIAN-SAR-1 FROM GALWAY (BEATS 2-4)
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'AOS 00:31. Program-track MERIDIAN-SAR-1 and confirm the beacon on RX analysis. Chain cold until the link is proven.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['gw-reference-and-chain'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'prove-the-night-link',
      nice: ['T0153', 'T0081', 'K0740'],
      title: 'Prove the Night Link',
      description:
        'Lock the 1414 MHz imagery downlink, then commit the link in Link Analysis with at least 3 dB of margin over the 6 dB threshold. The strong part of this pass runs 00:33 to 00:37.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 3 dB',
          params: { minMarginDb: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'command-the-bird',
      nice: ['T1567', 'S0421', 'K0874'],
      title: 'Command the Bird',
      description: 'Send REC-PLAYBACK under the rotated key and confirm the acknowledgement before the window closes at 00:38:30.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up-for-commanding'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'REC-PLAYBACK Acknowledged',
          params: { commandId: 'REC-PLAYBACK' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'secure-the-chain',
      nice: ['S0421', 'K0645'],
      title: 'Secure the Chain',
      description: 'LOS 00:38:49. Chain down in the mirror order: HPA off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['command-the-bird'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-contact-1',
      nice: ['T1580', 'K0645'],
      title: 'Log the First Contact',
      description: 'Write contact 1 into the handover before you skip ahead. The next window is two and a half hours away and at the other site.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['secure-the-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Contact 1 Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What does the handover need for the 00:31 contact?',
            options: [
              'Rotation completed before the window, link committed with the margin measured, REC-PLAYBACK acknowledged, chain cold - with the numbers',
              'Pass worked',
              'The command was sent',
              'The plan validated',
            ],
            correctIndex: 0,
            explanation: 'Key state, link number, command result, chain state. The day shift commands on the key you rotated and schedules against the card you signed.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '00:31Z MERIDIAN-SAR-1 GW-01: command key rotated before the window; link committed, predicted 13.3 dB, margin >= 3 dB over 6 dB threshold; REC-PLAYBACK ACK; chain secured HPA-BUC-modem.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // CONTACT 2: MERIDIAN-SAR-2 FROM SHETLAND, ON HOLDOVER (BEATS 5, 1-4)
    // ============================================================
    {
      id: 'shetland-remote-sweep',
      nice: ['T0431', 'S0421', 'K0741'],
      title: 'Shetland Remote Sweep',
      description:
        'Skip ahead to the 02:54 Shetland window. Select SH-02: BUC temperature normal, LNB thermally stable, and retune modem 1 from the 1414 MHz SAR-1 carrier Fiona left it on to 1370 MHz for SAR-2.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['log-contact-1'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'buc-temperature-normal',
          description: 'SH-02 BUC Temperature Normal',
          params: { maxTemperature: 70, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'SH-02 LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'holdover-diagnosis',
      nice: ['T0431', 'K0740', 'K0741'],
      title: 'Read the Shetland Reference',
      description:
        'The SH-02 GPS Timing panel is not what you left it. Read it - lock, GNSS, satellite count, holdover - and decide what the reference is doing and whether the pass can be flown on it.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-remote-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'SH-02 GPS Timing Panel Open',
          params: { tab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Holdover Diagnosed',
          params: {
            character: Character.SYSTEM,
            question: 'SH-02 GPSDO: locked, HOLDOVER active, GNSS input switch up, zero satellites. What is happening, and what do you do about the 02:54 pass?',
            options: [
              'A GNSS outage at the site - the switch is up and nothing is being received. The oscillator holds the reference within microseconds for tens of minutes; fly the pass on holdover, leave the switch alone, confirm re-lock when the signal returns',
              'Somebody left the GNSS switch down - cycle it and wait for lock before AOS',
              'The reference is lost - the pass cannot be flown from Shetland',
              'The oscillator has failed - power-cycle the GPSDO',
            ],
            correctIndex: 0,
            explanation:
              'Holdover is what the disciplined oscillator is for: GNSS disciplines it, and when GNSS goes away it coasts on the last correction. Switch up with zero satellites is an outage, not an operator error; cycling the switch cannot conjure a signal. A few minutes of holdover is a few microseconds and a few hertz at Ku.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-sar2-from-shetland',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-2 from Shetland',
      description: 'AOS 02:54:39 from azimuth 042. Program-track MERIDIAN-SAR-2 on the SH-02 pedestal, on holdover, and confirm the carrier on Shetland’s RX analysis.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['holdover-diagnosis'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Downlink on the Shetland Analyzer',
          params: {
            signalId: 'MERIDIAN-SAR-2-VIDEO',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'telemetry-contact',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Work the Telemetry Contact',
      description:
        'A 13 degree pass at 1233 km will not decode imagery. Hold lock and C/N above 5 dB through culmination (02:57:34) for the state-of-health frames, and read what the geometry did to the number.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 5 dB',
          params: { modemNumber: 1, minCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Geometry Read',
          params: {
            character: Character.SYSTEM,
            question: 'Contact 1 peaked at 13.4 dB at 40 degrees and 581 km. This one peaks near 6.6 dB at 13 degrees and 1233 km. Is the Shetland station underperforming?',
            options: [
              'No: 20 log(1233 / 581) is 6.5 dB of extra path loss, and a 13 degree elevation adds atmosphere on top - the number is what the geometry predicts',
              'Yes: same hardware should give the same C/N',
              'Yes: holdover has degraded the reference and the demodulator with it',
              'Unknown until the outage clears',
            ],
            correctIndex: 0,
            explanation:
              'A telemetry contact on a low pass is worked for what it can give: lock and frames, not imagery. A site is underperforming only when its number is worse than its geometry.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'confirm-reference-recovered',
      nice: ['T0431', 'K0740', 'T1580'],
      title: 'Confirm the Shetland Reference Recovered',
      description: 'The GNSS signal returns at 02:59. Confirm on the SH-02 GPS Timing panel that the receiver has re-locked and left holdover, then log contact 2.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['telemetry-contact'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-gnss-locked',
          description: 'SH-02 GNSS Receiving Again',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'SH-02 Out of Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Contact 2 Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What does the handover need about the Shetland reference?',
            options: [
              'GNSS outage 02:44 to 02:59, reference held on the oscillator through the contact, re-locked on return, no action taken at the switch - so the day shift knows the outage was real and the site recovered itself',
              'Nothing - it recovered on its own',
              'That the GPSDO should be replaced',
              'That the contact was flown without a reference',
            ],
            correctIndex: 0,
            explanation:
              'A fault that cleared is still a fault. The day shift decides whether a fifteen-minute GNSS outage in a Shetland gale is weather or a failing antenna; they cannot decide it without the record.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '02:54Z MERIDIAN-SAR-2 SH-02 (remote): 13 deg telemetry contact, locked, C/N >= 5 dB, peak ~6.6 dB. SH-02 GNSS outage 02:44-02:59Z, reference in holdover through the contact (switch up, zero satellites), re-locked on return. No action at the switch.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // CONTACT 3: MERIDIAN-SAR-2 OVER GALWAY, AFTER THE KEY ROLL (BEATS 5, 1-3)
    // ============================================================
    {
      id: 'traffic-key-alarm',
      nice: ['K0728', 'K0874', 'T0431'],
      title: 'Read the Traffic Key',
      description: 'Skip ahead to the 04:27 Galway window and select GW-01. Before the pass, read the payload crypto on RX analysis. It is not what you left it either.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['confirm-reference-recovered'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Reads Mismatch',
          params: { keyStatus: 'Mismatch', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Mismatch Diagnosed',
          params: {
            character: Character.SYSTEM,
            question:
              'Traffic key Mismatch on the payload crypto, command key still Valid, nobody has touched the station since 00:40. What happened, and what does it do to the 04:27 pass?',
            options: [
              'Rotterdam rolled the fleet traffic key on schedule and the station did not follow. The imagery downlink will not decrypt until the payload crypto is re-keyed; the command key is a different key and is fine.',
              'Your rotation at 00:20 corrupted the traffic key',
              'The spacecraft zeroized its keys',
              'A holdover reference at Shetland desynchronised the crypto',
            ],
            correctIndex: 0,
            explanation:
              'Two keys, two schedules, and the one you did not rotate is the one that moved. A mismatch is the two ends of a handshake on different keys; the fix is on the payload panel, not the TT&C console.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 're-key-before-aos',
      nice: ['K0728', 'K0874', 'S0421'],
      title: 'Re-key the Payload Crypto',
      description: 'Load the new traffic key on the TX chain payload panel and confirm both directions read Valid before AOS.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['traffic-key-alarm'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'TX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-sar2-galway',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-2 over Galway',
      description:
        'AOS 04:27:31 from azimuth 018, and this one goes to 73 degrees. Retune modem 1 to 1370 MHz if you have not, program-track MERIDIAN-SAR-2 and confirm the carrier on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['re-key-before-aos'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Downlink Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-VIDEO',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'decode-the-steep-pass',
      nice: ['T0153', 'K0740', 'K0728'],
      title: 'Decode the Steep Pass',
      description: 'Lock the 1370 MHz carrier, hold C/N above 8 dB through the top of the pass (04:31:23, 73 degrees, 408 km) and confirm the payload decrypts under the new key.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2-galway'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'rx-crypto-status',
          description: 'Payload Decrypting',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Steep Pass Read',
          params: {
            character: Character.SYSTEM,
            question: 'C/N peaks near 16.5 dB at 73 degrees, the best number of the night, and the pedestal held it through the top. Why did this one not keyhole?',
            options: [
              'The azimuth rate at the top of a 73 degree pass is a few degrees a second, inside the 20 deg/s the pedestal can do; the keyhole is a near-zenith problem, where the rate goes to infinity',
              'Program-track disables the azimuth axis above 60 degrees',
              'The bird slowed down at the top of the pass',
              'It did keyhole; the receiver held lock through it on stored frames',
            ],
            correctIndex: 0,
            explanation: 'Steep is strong, and 73 degrees is still tracking. The last few degrees to the zenith are a different problem, and a different shift.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4: HANDOVER
    // ============================================================
    {
      id: 'hand-over-the-shift',
      nice: ['T0081', 'T1580', 'K0645'],
      title: 'Hand Over the Shift',
      description: 'Close the handover for the qualification: three contacts, two sites, two faults found and cleared.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-the-steep-pass'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Closed',
          params: {
            character: Character.SYSTEM,
            question: 'Plan built, key rotated, link proven, command acknowledged, a holdover flown through and a traffic key re-keyed. What carries over to the day shift?',
            options: [
              'The contact plan, the COMSEC state of both keys, the Shetland outage record and the state of both sites - the next operator inherits all of it, not just the pass results',
              'Nothing. Each shift starts clean.',
              'Only the recorded telemetry, which goes to the customer.',
              'The dropped 04:25 Shetland contact, so the day shift can reschedule it',
            ],
            correctIndex: 0,
            explanation: 'Qualified for NATS Europe LEO operations. The network is yours to run.',
            pointPenalty: 5,
            documentSection: 'Handover',
            documentLine:
              '04:27Z MERIDIAN-SAR-2 GW-01: fleet traffic key rolled 04:15Z, payload crypto re-keyed before AOS (TX/RX Valid), 73 deg pass decoded, peak C/N ~16.5 dB. Dropped: N-SAR2-SH-2 (P3, one operator). Both sites cold, references locked, plan DECONFLICTED. Shift handed over.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Charlie Brooks at 23:40]</em>
      </p>
      <p>
        "Evening shift left it tidy. SAR-1 has a 40 degree pass at 00:31 and it is the best geometry this station has seen. Rotation is pending on the command key. Rotterdam wants REC-PLAYBACK on the pass. Contact plan for the night is not built, and after Fiona goes off at one the Shetland console is yours as well. This is the qualification shift. Everything on it you have done once. Nobody is going to prompt you to do it again."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'build-the-night-plan': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 00:17]</em>
        </p>
        <p>
          "On console till one. I'll take whatever the plan gives me before then and after that SH-02 is yours, remote. The GNSS antenna up here has been flaky in the wind all week; if it drops out you know what holdover looks like. Don't ring unless the building's on fire."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'command-the-bird': {
        text: `
        <p>
          "ACK on REC-PLAYBACK, authenticated under the new key. Thank you, Galway. Nothing more from us tonight - the traffic key rolls on the fleet schedule at 04:15, as it does every Tuesday."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'log-contact-1': {
        text: `
        <p>
          <em>[Text message from Dana Torres at 00:41]</em>
        </p>
        <p>
          "Charlie says tonight's the one. Same as Vermont: nobody's coming, and that's the point. Text me when it's done."
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'shetland-remote-sweep': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 00:58]</em>
        </p>
        <p>
          "Off. SAR-1 was seventeen degrees and decoded, for the record. Modem's still on 1414. Station's yours. Night."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'traffic-key-alarm': {
        text: `
        <p>
          <em>[Automated notice from MERIDIAN Ops at 04:15]</em>
        </p>
        <p>
          "Fleet traffic key rotation executed 04:15:00Z per schedule. Sites: load new material before your next payload contact."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'decode-the-steep-pass': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 04:33]</em>
        </p>
        <p>
          "Couldn't sleep, watched yours from the flat. Seventy-three degrees and it never wobbled. Mine would've gone over the top and lost it. Right call dropping it."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'hand-over-the-shift': {
        text: `
        <p>
          That was your night. Three contacts, two sites, a reference that went walkabout, a key that did not match and a plan that had to drop something. You did not call me. Good.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
