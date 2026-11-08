import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, IfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 16 - "Cascade" / Network Multi-Failure (Phase 2 capstone)
 *
 * Midday, the densest window of the week, three problems and one operator.
 * MERIDIAN-SAR-2 slipped 90 s overnight and its Galway window now overlaps
 * the SAR-1 command contact (the slipped pass). At 12:01 the Shetland BUC
 * loses its cooling fan with a carrier still driving it from the morning's
 * uplink check (timed fault, phase 16 E3): mute is the fix, power-off is
 * wrong twice over. At 12:18, as the command window opens, Galway's GNSS
 * antenna drops out and the reference goes to holdover with the switch up
 * (timed fault): the command contact is flown on the oscillator and the
 * re-lock confirmed when the signal returns (45 s after the confirm objective
 * opens). Shetland is armed on
 * program-track and takes the receive-only SAR-2 contact on a muted BUC with
 * nobody on its console until the operator comes to check the number.
 *
 * Clock starts 2027-04-09 12:00:00 UTC. Passes (0 deg horizon, per station,
 * scripts/author-passes.mjs):
 *
 *   SH-02 MERIDIAN-SAR-1: AOS T+15.91 (12:15:54Z), max el 55.8 deg, LOS
 *                         T+25.82 (nobody's: one operator).
 *   GW-01 MERIDIAN-SAR-1: AOS T+17.98 (12:17:59Z, az 021), max el 29.8 deg at
 *                         T+22.82 (12:22:49Z, 728 km), LOS T+27.59 (12:27:35Z,
 *                         az 173), 9.6 min, southbound. The command contact.
 *   SH-02 MERIDIAN-SAR-2: AOS T+21.28 (12:21:16Z, az 024), max el 28.0 deg at
 *                         T+26.08 (12:26:05Z, 763 km), LOS T+30.85 (12:30:51Z,
 *                         az 173), 9.6 min, southbound. Receive-only, unattended
 *                         acquisition, checked from the console before LOS.
 *   GW-01 MERIDIAN-SAR-2: AOS T+23.54 (12:23:32Z), max el 15.5 deg, LOS
 *                         T+32.38: the slipped half, overlapping SAR-1 on
 *                         Galway by four minutes. Dropped.
 *
 * Command window is the Galway SAR-1 pass with 20 s guards (1100-1640 s).
 * Faults: SH-02 BUC cooling fault at 90 s (reading jumps to 72 degC; thermal
 * resistance x1.6 with the fan gone and a hot output stage drawing 1.3 A extra
 * while driven, clears at 1590 s when the fan is restored); GW-01 GNSS loss at
 * 1120 s for 500 s (12:18:40 to 12:27:00). All thresholds flown in
 * test/campaigns/nats-eu-phase-c-validation.test.ts, the Shetland one from
 * Shetland.
 *
 * Staged state (scenario-local clones): GW-01 TX modem 1 on 1465 MHz from a
 * SAR-3 shift (retune to 1405 for SAR-1), RX modem 1 on 1414. SH-02 TX modem
 * 1 ON AIR into an UNMUTED BUC (HPA off) from the morning's uplink check -
 * the drive that keeps the BUC hot until the operator removes it - and RX
 * modem 1 on 1414 (retune to 1370 for SAR-2).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0531: Troubleshoot system hardware and software
 *   - S0677: Skill in prioritizing and responding to multiple concurrent failures
 *   - S0807: Skill in making operational decisions under uncertainty
 *
 * Supporting Codes:
 *   - K0741: Knowledge of system administration concepts
 *   - K0689: Knowledge of network systems management
 *   - T0129: Coordinate and manage system operations schedules
 *   - T1567: Conduct satellite command and control operations
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0153: Monitor network capacity and performance
 *   - K0740: Knowledge of system performance indicators
 *   - T1606: Report findings and recommendations
 *   - T1277: Document incidents and their impact
 *   - S0575: Skill in documenting operational procedures
 */

/** MERIDIAN-SAR-1 (61701) at the S16 epoch: the 30 deg command contact over Galway. */
const SAR1_S16_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27099.50000000  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61701  97.2000 193.5000 0010000  90.0000 308.2500 15.60000000123458' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S16 epoch: 28 deg over Shetland, the slipped 15 deg half over Galway. */
const SAR2_S16_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27099.50000000  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61702  98.4000 199.7500 0010000  90.0000 288.5000 15.60000000123450' as TleLine2,
};

const meridianSar1S16 = createMeridianSar1(SAR1_S16_TLE);
const meridianSar2S16 = createMeridianSar2(SAR2_S16_TLE);

/** GW-01 as the SAR-3 shift left it: TX modem on the SAR-3 uplink IF. Deep clone, never spread. */
const galwayMidday: GroundStationConfig = structuredClone(galwayGroundStation);
galwayMidday.transmitters![0].modems[0] = {
  ...galwayMidday.transmitters![0].modems[0],
  ifSignal: { ...galwayMidday.transmitters![0].modems[0].ifSignal, frequency: 1465e6 as IfFrequency },
};

/**
 * SH-02 after the morning's uplink check: TX modem 1 still on air into an
 * unmuted BUC (HPA off, so nothing leaves the rack). With the fan gone the
 * driven BUC draws 4.3 A and climbs ~0.3 degC/min toward 75 degC; muted it
 * drops to the 2.6 A idle draw at once and heads for 55 degC, under the 70 degC
 * alarm ~80 s after a prompt mute (72.2 degC), ~2.5 min after ten minutes
 * driven (74.1 degC), 3 min from fully settled (measured, Phase 19.6).
 */
const shetlandHotBuc: GroundStationConfig = structuredClone(shetlandGroundStation);
shetlandHotBuc.transmitters![0].modems[0] = {
  ...shetlandHotBuc.transmitters![0].modems[0],
  isTransmitting: true,
  isTransmittingSwitchUp: true,
};

export const natsEuScenario16Data: ScenarioData = {
  id: 'nats-eu-scenario16',
  url: 'nats-eu/scenarios/nats-eu-scenario16',
  imageUrl: 'nats-eu/16/card.png',
  number: 16,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario15'],
  title: 'Cascade',
  subtitle: 'Network Multi-Failure',
  duration: '40 min',
  missionType: 'Evaluation',
  description: `12:00 UTC. This is the busiest window of the week, and the handover is a list of things that are going wrong.<br><br>MERIDIAN-SAR-2 slipped 90 seconds overnight, so its Galway pass now overlaps the SAR-1 command contact. Erik wants collects on both passes. Fiona is on the Shetland roof looking at the BUC fan, the console is yours, and nobody has checked the rack since this morning's uplink test. Anneke needs REC-PLAYBACK and a watchdog reset sent to SAR-1 inside the 12:18 window.<br><br>Order the work, then do it: resolve the slip, ready Galway to command, cool the Shetland BUC the right way, arm Shetland to take SAR-2 on its own, fly the command contact through whatever happens to the reference, check Shetland's pass before it sets, and write the report that Erik and maintenance both need. This is the qualification for the network.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'TT&C Commanding Console',
    'Contact Plan Console',
    'Ku-Band RF Front End (GPSDO / LNB / BUC / HPA)',
    'RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayMidday, shetlandHotBuc],
    satellites: [meridianSar1S16, meridianSar2S16],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-09',
    scenarioStartWallTime: '12:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-16?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    workingDocument: {
      title: 'Shift Incident and Impact Report',
      description: '2027-04-09 midday shift. Contacts as worked, customer impact, actions and open items.',
    },

    // M3 - the slipped pass. SAR-2's Galway window (P2) now overlaps the SAR-1
    // command contact (P1) on Galway; the SAR-2 collect is covered from
    // Shetland (P1). Priority 1 must be assigned for the plan to validate.
    // Windows are 0 deg horizon crossings, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 1,
      contacts: [
        { id: 'C-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 56 deg)', priority: 2, windowStartS: 950, windowEndS: 1550, stationId: 'SH-02' },
        {
          id: 'C-SAR1-GW',
          satelliteNoradId: 61701,
          label: 'MERIDIAN-SAR-1 (Galway, 30 deg) - command contact',
          priority: 1,
          windowStartS: 1080,
          windowEndS: 1660,
          stationId: 'GW-01',
        },
        {
          id: 'C-SAR2-SH',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Shetland, 28 deg) - NMW collect',
          priority: 1,
          windowStartS: 1280,
          windowEndS: 1850,
          stationId: 'SH-02',
        },
        {
          id: 'C-SAR2-GW',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Galway, 15 deg) - SLIPPED +90 s, overlaps SAR-1',
          priority: 2,
          windowStartS: 1410,
          windowEndS: 1940,
          stationId: 'GW-01',
        },
      ],
    },

    // M2 - the command contact. Window is the Galway SAR-1 pass: AOS 12:17:59
    // (1079 s) + 20 s to LOS 12:27:35 (1655 s) - 20 s.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 1100,
      windowEndS: 1640,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },

    // E3 - two faults on the mission clock. The Shetland BUC loses its fan at
    // 12:01:30 with a carrier still driving it (labelled: the alarm is in the
    // ops log); the fan is back at 12:26:30. Galway's GNSS drops at 12:18:40,
    // as the command window opens, and returns at 12:27:00 - unlabelled,
    // because noticing holdover on the GPS Timing panel is the evaluation.
    hardwareFaultEvents: [
      {
        id: 'sh-buc-fan',
        groundStationId: 'SH-02',
        target: 'buc-overtemp',
        startTime: 90,
        duration: 1500,
        // Phase 19.6 physical fault: the dead fan multiplies the heatsink's
        // thermal resistance by 1.6 and the hot output stage draws 1.3 A extra
        // while driven (gated off by the mute). Driven: 4.3 A, heading for 75 degC.
        // Muted: 2.6 A, heading for 55 degC; under 70 inside 3 min.
        params: { startTemperatureC: 72, coolingFactor: 1.6, excessCurrentA: 1.3 },
        label: 'SH-02 BUC cooling fan alarm',
      },
      // Phase 19.0a: the signal returns 45 s after 'confirm-galway-reference-recovered'
      // opens, not at a fixed 1620 s, which a fast player could time out waiting for
      {
        id: 'gw-gnss-outage',
        groundStationId: 'GW-01',
        target: 'gpsdo-gnss-loss',
        startAfterObjectiveId: 'command-on-holdover',
        startTime: 0,
        duration: 500,
        endAfterObjectiveId: 'confirm-galway-reference-recovered',
        endOffsetS: 45,
      },
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'S0807'],
      title: 'Take the Shift',
      description:
        'Read the handover: a slipped pass, a command request at Galway, a BUC fan problem at Shetland, and about eighteen minutes before the first acquisition of signal. Decide the order of work before you touch anything.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Handover Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Order of Work',
          params: {
            character: Character.SYSTEM,
            question: 'The handover lists a slipped pass, a SAR-1 command contact at 12:18, a Shetland BUC fan problem and a SAR-2 collect. What is the right order of work?',
            options: [
              'The plan first, since it decides what each site needs; then ready Galway, then Shetland, then fly, then report',
              'Shetland first, because an alarm is the loudest problem; then the plan, then Galway, then fly, then report',
              'The command contact first, because Anneke is waiting on it; then Shetland, then the plan, then fly, then report',
              'The report first, so nothing is forgotten in the rush; then the plan, then Shetland, then Galway, then fly',
            ],
            correctIndex: 0,
            explanation:
              'The plan comes first because it decides which site flies which pass. Galway comes before Shetland because the command window has a fixed time, while the Shetland contact is receive-only and never uses the BUC. Triage follows what each problem blocks, not how loud it is, and a hot BUC on a receive-only site blocks nothing today. You have about eighteen minutes until Galway acquires SAR-1.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 5: RESOLVE THE SLIP
    // ============================================================
    {
      id: 'resolve-the-slipped-pass',
      nice: ['S0807', 'K0689', 'T0129'],
      title: 'Resolve the Slipped Pass',
      description:
        "SAR-2's Galway window now overlaps the SAR-1 command contact. Keep the command contact on GW-01, assign the SAR-2 collect to SH-02, and leave the slipped Galway SAR-2 window unassigned, so the plan reads DECONFLICTED.",
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
          type: 'contact-assigned',
          description: 'SAR-1 Command Contact on GW-01',
          params: { contactId: 'C-SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Collect on SH-02',
          params: { contactId: 'C-SAR2-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Slip Resolved',
          params: {
            character: Character.SYSTEM,
            question: 'Why is the slipped Galway SAR-2 window dropped from the plan rather than moved?',
            options: [
              'It overlaps the command contact on the only site that can command, and Shetland already has the same satellite at 28 degrees',
              "A slipped pass can't be flown, because a window that has moved 90 seconds no longer matches the antenna's tracking data",
              "The plan won't validate with any P2 contact assigned, and the board only needs the P1 windows covered to read DECONFLICTED",
              'It should be moved to Shetland instead, because two windows on one site make a backup and 15 degrees is still above the mask',
            ],
            correctIndex: 0,
            explanation:
              "Galway can only track one satellite at a time, and the SAR-1 command contact needs the dish through the four-minute overlap. Shetland already covers the SAR-2 collect, at 28 degrees against Galway's 15, so the Galway window adds nothing the customer needs. Moving it to Shetland would double-book a site that's already tracking the same satellite. The slip removed one window from the network, and the plan records which one.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 1: GALWAY READY TO COMMAND
    // ============================================================
    {
      id: 'galway-reference-check',
      nice: ['T0431', 'K0740'],
      title: 'GW-01 Reference Check',
      description: 'Open the GPS Timing panel and check that the GW-01 GPSDO is locked and not in holdover. Read it now, so you know what it looks like before the command window.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['resolve-the-slipped-pass'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GW-01 GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'galway-crypto-check',
      nice: ['T0431', 'K0874', 'K0728'],
      title: 'GW-01 Crypto Check',
      description: 'Check that both keys read Valid before any command goes up: the command key on the TX Chain tab and the traffic key on the RX Analysis tab.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-reference-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'TX Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'galway-uplink-setup',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'GW-01 Uplink Setup',
      description:
        'The SAR-3 shift left TX modem 1 on 1465 MHz. Retune it to 1405 MHz, the SAR-1 command uplink, and turn on uplink Doppler compensation on the TT&C (telemetry, tracking and command) console. Leave RX modem 1 on 1414 MHz, and put the analyzer on the 1389 MHz beacon with a 2 MHz span.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-crypto-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'GW-01 TX 1405 MHz',
          params: { modemNumber: 1, frequency: 1405e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          // RX modem 1 stays on 1414 (staged): a confirm row (phase 27 B1)
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-galway-for-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position Galway for SAR-1',
      description: 'Point the GW-01 antenna at the spot where SAR-1 will rise: azimuth 21 degrees, elevation 5 degrees, ready for acquisition at 12:18.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-uplink-setup'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Az 21 / El 5',
          params: { azimuth: 21, elevation: 5, tolerance: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 5 -> BEAT 1: SHETLAND, THE HOT BUC
    // ============================================================
    {
      id: 'shetland-alarm-sweep',
      nice: ['T0153', 'K0741', 'T0531'],
      title: 'SH-02 Alarm Sweep',
      description: 'Select SH-02 and read its board. The BUC fan alarm is real, so work out why the temperature is still climbing.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['preposition-galway-for-sar1'],
      timeLimitSeconds: 2 * 60,
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
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Alarm Diagnosed',
          params: {
            character: Character.SYSTEM,
            question:
              "SH-02 shows a BUC over-temperature and a fan alarm. Its HPA is off, but its TX modem is still on air from this morning's uplink check, sending a carrier (the drive) into the BUC. What is keeping the BUC hot?",
            options: [
              'The drive. A BUC dissipates heat in proportion to its output; with the fan gone, a carrier going in holds it above the alarm',
              'The roof. A BUC on an outdoor mount takes on the ambient temperature; with the fan gone, a warm afternoon holds it above the alarm',
              'The reference. An unlocked GPSDO makes the BUC work harder to hold frequency; with the fan gone, that holds it above the alarm',
              'The HPA. Its heat has nowhere to go but the BUC beside it; with the fan gone, that heat holds the BUC above the alarm',
            ],
            correctIndex: 0,
            explanation:
              "The BUC makes heat in proportion to the drive it's given, so removing the carrier is what stops the climb, and without the fan it settles under the alarm. The HPA is off, so it can't be the source. The fix is on the transmit chain, not in the rack cabinet: take the carrier off, mute the BUC, keep it powered and let it come down.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'remove-the-drive',
      nice: ['S0677', 'T0531', 'S0421'],
      title: 'Remove the Drive from the Shetland BUC',
      description:
        'On the SH-02 TX Chain tab, take the TX modem off air and mute the BUC, but leave the BUC powered. Shetland is receive-only today, so it needs none of the transmit chain.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-alarm-sweep'],
      timeLimitSeconds: 2 * 60,
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
          type: 'tx-modem-not-transmitting',
          description: 'SH-02 Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'SH-02 BUC Muted',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'confirm-shetland-buc-cooling',
      nice: ['S0677', 'T0531', 'K0740'],
      title: 'Confirm the Shetland BUC Cooling',
      description:
        "Watch the SH-02 TX Chain tab. With the drive gone, the BUC current should drop to its 2.6 A idle draw at once, and the temperature should come down under 70 degrees within two or three minutes. Don't power the BUC off.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['remove-the-drive'],
      timeLimitSeconds: 4 * 60,
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
          description: 'SH-02 BUC Under 70 degC',
          params: { maxTemperature: 70, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Power-Off Rejected',
          params: {
            character: Character.SYSTEM,
            question: 'Why not power the BUC off and let it cool properly?',
            options: [
              'Power-off does cool it, but the BUC then reads off rather than normal, so the alarm only closes on a powered reading',
              'Power-off is the right fix, because an unpowered BUC has no output to dissipate, so the alarm clears sooner than with a mute',
              'Power-off loses the reference, because a powered-down BUC drops the external reference and re-locking on power-up takes about an hour',
              'Power-off trips the HPA, because it faults without a BUC ahead of it, and that takes the site off the board for the day',
            ],
            correctIndex: 0,
            explanation:
              'Powering the BUC off does cool it, but it then reads off and never reads normal, and the fan is still dead when it comes back up with a carrier in it. Muting removes the heat source and keeps the thermometer working, while power-off takes the thermometer away too. Every equipment fault on this network has a right action and a louder wrong one, and the louder one is usually the power switch.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'arm-shetland-for-sar2',
      nice: ['S0421', 'K0645', 'T0129'],
      title: 'Arm Shetland for SAR-2',
      description:
        'Shetland will acquire SAR-2 on its own at 12:21. Retune RX modem 1 from 1414 MHz to the 1370 MHz SAR-2 downlink, and set the antenna to program-track on MERIDIAN-SAR-2. Then go back to Galway.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['confirm-shetland-buc-cooling'],
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
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Armed',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Unattended Contact Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Shetland will take SAR-2 with a BUC alarm in the log and nobody at its console. What makes that acceptable?',
            options: [
              'The contact is receive-only: the BUC plays no part, the receive path is healthy, and the antenna acquires on its own',
              "Nothing does: a site with an active alarm shouldn't fly, and a contact nobody watches is a contact nobody can log",
              'Fiona is on the roof: she can see the dish move, the BUC is beside her, and a dish in sight is as good as an operator',
              'The plan assigned it: an assigned contact configures the station, the modem tunes itself, and the dish follows the plan',
            ],
            correctIndex: 0,
            explanation:
              "The BUC is part of the transmit chain and this contact only receives, so the alarm doesn't touch it. A station armed on program-track acquires without an operator, but someone still has to check the C/N before LOS. Assigning a contact only puts it in the plan, arming the station is what makes it happen, and a number read before LOS is what makes it a contact.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: THE COMMAND CONTACT, ON HOLDOVER
    // ============================================================
    {
      id: 'acquire-sar1-at-galway',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-1 at Galway',
      description: 'Select GW-01. SAR-1 rises at 12:18 from azimuth 21 degrees. Turn on program-track for MERIDIAN-SAR-1 and confirm the beacon on the RX Analysis tab.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['arm-shetland-for-sar2'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
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
          description: 'GW-01 Tracking SAR-1',
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
      id: 'chain-up-for-the-command',
      nice: ['S0421', 'T1567', 'K0645'],
      title: 'Chain Up for the Command',
      description: 'The command window opens at 12:18:20. Start the carrier into the muted BUC, then unmute the BUC, then enable the HPA, in that order.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1-at-galway'],
      conditions: [
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
    {
      id: 'command-the-playback',
      nice: ['T1567', 'S0421', 'K0773'],
      title: 'Command the Playback',
      description: 'Send REC-PLAYBACK, the command that starts the recorder playback, and confirm that the spacecraft acknowledges it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up-for-the-command'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'REC-PLAYBACK Acknowledged',
          params: { commandId: 'REC-PLAYBACK' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'command-on-holdover',
      nice: ['S0677', 'T0531', 'K0741'],
      title: 'Command on Holdover',
      description:
        "Open the GPS Timing panel and read what the reference is doing now. Decide whether the second command can go up with it, and send OBC-WDT-RESET, the onboard computer's watchdog reset, before the window closes at 12:27:20.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['command-the-playback'],
      conditions: [
        {
          type: 'tab-active',
          description: 'GW-01 GPS Timing Panel Read',
          params: { tab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Holdover Decision',
          params: {
            character: Character.SYSTEM,
            question:
              'The GW-01 GPSDO now reads HOLDOVER, with the GNSS switch up and zero satellites, since {{at:event:gw-gnss-outage:start|12:18:40}}. The command window is still open for several more minutes. Should OBC-WDT-RESET go up?',
            options: [
              'Yes. A GNSS outage with the switch up is an outage, not an operator error; the oscillator holds for tens of minutes',
              "No. Nothing goes up on a reference in holdover; the uplink Doppler pre-compensation needs GNSS time, and that's gone",
              'Yes, after cycling the GNSS switch; a switch cycle forces a re-lock, and the reference is back on satellites in a few seconds',
              'Yes, after power-cycling the GPSDO; a power cycle clears the holdover flag, and the reference is back inside the window',
            ],
            correctIndex: 0,
            explanation:
              "The oscillator keeps the reference accurate to microseconds while the GNSS signal is gone, and the uplink Doppler pre-compensation doesn't need more than that. Holdover is what the disciplined oscillator is for, so send the command and leave the switch alone. Cycling the switch can't bring back a satellite signal that isn't there, and a power cycle means a ten-minute warm-up that outlasts the window. Confirm the re-lock when the signal returns.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'command-acknowledged',
          description: 'OBC-WDT-RESET Acknowledged (on holdover)',
          params: { commandId: 'OBC-WDT-RESET' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 3 (SHETLAND) / BEAT 4 (GALWAY)
    // ============================================================
    {
      id: 'check-the-shetland-pass',
      nice: ['T0153', 'T0431', 'K0740'],
      title: 'Check the Shetland Pass',
      description:
        'Select SH-02 while SAR-2 is still up, until 12:30:51. The antenna should be locked on it in program-track, and the RX modem should be locked with C/N above 8 dB around culmination, the highest point of the pass, at 12:26.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['command-on-holdover'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'secure-galway',
      nice: ['S0421', 'K0645'],
      title: 'Secure Galway',
      description: 'Go back to GW-01. Both commands are acknowledged, so take the chain down in the reverse order: disable the HPA, mute the BUC, then take the TX modem off air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['check-the-shetland-pass'],
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
          type: 'hpa-disabled',
          description: 'GW-01 HPA Output Disabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'GW-01 BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'GW-01 Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'confirm-galway-reference-recovered',
      nice: ['T0431', 'K0740', 'T1580'],
      title: 'Confirm the Galway Reference Recovered',
      description:
        'The GNSS signal returns within a minute of this objective opening. Confirm on the GW-01 GPS Timing panel that the receiver has re-locked and left holdover, then log the contacts.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['secure-galway'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-gnss-locked',
          description: 'GW-01 GNSS Receiving Again',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GW-01 Out of Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Contacts Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What should the report say about the two contacts?',
            options: [
              'SAR-1: both commands ACKed in the window, the second on holdover. SAR-2: Shetland unattended on a muted BUC, with the numbers',
              'SAR-1: both commands ACKed in the window, reference clean throughout. SAR-2: Shetland unattended, with the numbers',
              'SAR-1: REC-PLAYBACK and OBC-WDT-RESET acknowledged, nothing else. SAR-2: both contacts worked normally, so one line covers the pair',
              "SAR-1: both commands ACKed in the window, the second on holdover. SAR-2: Shetland's contact, which belongs on Fiona's log",
            ],
            correctIndex: 0,
            explanation:
              'The SAR-1 entry has to say that the second command went up on holdover, from 12:18 to {{at:cond:confirm-galway-reference-recovered.0|12:27}}, that nobody touched the switch, and that the reference re-locked on return. The SAR-2 entry has to say that Shetland acquired unattended, locked and decoded with margin, and was checked before LOS. A fault that cleared is still a fault, and a contact nobody watched is still a contact, so both go in with the numbers.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '12:18Z MERIDIAN-SAR-1 GW-01: REC-PLAYBACK ACK; GW-01 GNSS outage 12:18:40-{{at:cond:confirm-galway-reference-recovered.0:s|12:27:00}}Z, reference in holdover (switch up, zero satellites), OBC-WDT-RESET ACK on holdover, no action at the switch, re-locked on return; chain secured HPA-BUC-modem. 12:21Z MERIDIAN-SAR-2 SH-02 (unattended acquisition, BUC muted): locked, C/N >= 8 dB at 28 deg, checked 12:26Z. Dropped: C-SAR2-GW (slipped, overlapped command contact).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'close-the-shetland-alarm',
      nice: ['T0531', 'S0807', 'K0740'],
      title: 'Close the Shetland Alarm',
      description: 'Select SH-02 once more. The fan is running again and the BUC temperature should read normal, so close the alarm with its cause.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['confirm-galway-reference-recovered'],
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
          type: 'status-check',
          description: 'Alarm Closed',
          params: {
            character: Character.SYSTEM,
            question: 'Why was Shetland able to take SAR-2 with a BUC alarm open, and what does the alarm close as?',
            options: [
              'The contact was receive-only and the BUC is transmit only; the alarm closes as a fan fault with a carrier left driving the BUC',
              'The alarm cleared itself once the fan came back before LOS; the alarm closes as a transient fan fault with nothing further',
              'Fiona was on the roof beside the BUC; the alarm closes as a fan fault she can confirm by eye, so no ticket is needed',
              "It shouldn't have, because a site with an open alarm is off the board; the alarm closes as a fan fault and the contact as unplanned",
            ],
            correctIndex: 0,
            explanation:
              'Shetland could take SAR-2 because a transmit-chain fault blocks nothing on a receive-only day. The alarm closes as a fan fault, with a ticket for the fan and a note for whoever left the carrier up. Knowing which faults block which work is what lets one operator run two sites.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 4: THE REPORT
    // ============================================================
    {
      id: 'customer-impact',
      nice: ['T1606', 'T1277', 'S0478'],
      title: 'Customer Impact',
      description: 'Write the customer impact for Erik: what he received, and what the shift cost him.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['close-the-shetland-alarm'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Impact Written',
          params: {
            character: Character.SYSTEM,
            question: 'What is the customer impact of a slipped pass, a hot BUC and a reference in holdover?',
            options: [
              'None he can see: both collects captured, both commands ACKed on time, and the slip cost the network a redundant window',
              'One collect lost to the slip: the Galway SAR-2 window was dropped from the plan, so the slip cost the customer a collect',
              'Both collects degraded by the faults: one on a hot BUC, one on a reference in holdover, so the faults cost the customer margin',
              'Unknown until Rotterdam processes the frames: both collects captured, both commands ACKed, so the cost is theirs to report',
            ],
            correctIndex: 0,
            explanation:
              'No tasking was missed. The slip cost the network one redundant window, not the customer a collect. The impact line says so plainly, and the actions line says what it took.',
            pointPenalty: 5,
            documentSection: 'Impact',
            documentLine:
              'Customer impact (NMW): none. Both P1 collects captured (SAR-1 GW-01, SAR-2 SH-02), REC-PLAYBACK and OBC-WDT-RESET acknowledged inside the window, zero missed tasking. Slip cost one redundant Galway window (C-SAR2-GW), not a collect.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'actions-and-open-items',
      nice: ['T1606', 'T1277', 'S0575'],
      title: 'Actions and Open Items',
      description: 'Write the actions: the tickets for maintenance, the question about the slip for Rotterdam, and what the station itself needs to fix.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['customer-impact'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Actions Written',
          params: {
            character: Character.SYSTEM,
            question: 'What are the actions and open items?',
            options: [
              'Maintenance: GW-01 GNSS antenna, SH-02 BUC fan. Rotterdam: root cause of the SAR-2 slip. Station: carrier left on the BUC',
              'Maintenance: nothing, every fault cleared itself. Rotterdam: nothing, the slip was flown around. Station: nothing open on either site',
              'Maintenance: replace the GW-01 GPSDO and the SH-02 BUC. Rotterdam: nothing, the slip is theirs. Station: both sites cold and locked',
              'Maintenance: SH-02 BUC fan. Rotterdam: request that SAR-2 be moved back to its old orbit. Station: GW-01 GPSDO to be power-cycled',
            ],
            correctIndex: 0,
            explanation:
              "The GNSS ticket carries the outage, from 12:18 to {{at:cond:confirm-galway-reference-recovered.0|12:27}} with the holdover flown. The slip is Rotterdam's to explain, because a 90 second slip removed a window from the plan. The carrier left driving the SH-02 BUC after the morning test is the station's to fix. That's three problems and three owners, and none of them is the customer. You're qualified for NATS Europe network operations, and both sites are yours to run.",
            pointPenalty: 5,
            documentSection: 'Actions',
            documentLine:
              'Actions: (1) Maintenance - GW-01 GNSS antenna fault, outage 12:18:40-{{at:cond:confirm-galway-reference-recovered.0:s|12:27:00}}Z, reference held on oscillator. (2) Maintenance - SH-02 BUC cooling fan; carrier found driving the BUC after the morning uplink check, removed before the 12:18Z window. (3) Rotterdam - root cause of MERIDIAN-SAR-2 90 s slip requested. Both sites cold, references locked, plan DECONFLICTED.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
      </p>
      <p>
        "The BUC fan on my side has been making a noise I don't like, so I'm going up to look at it and the console's yours. Nobody's touched the rack since the uplink check this morning. SAR-2 moved overnight and Rotterdam hasn't said why. Your GPSDO's been fine. Enjoy."
      </p>
      `,
      character: Character.FIONA_MACLEOD,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/intro.mp3'),
    },
    objectives: {
      'resolve-the-slipped-pass': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at {{stationTime}}]</em>
        </p>
        <p>
          "Thank you, that's the plan deconflicted. The slip is ours: SAR-2 moved ninety seconds overnight, and we're looking into why. Your SAR-1 command contact stands, so I need REC-PLAYBACK and OBC-WDT-RESET, the onboard computer's watchdog reset, sent inside the 12:18 window. Erik still wants both collects."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-resolve-the-slipped-pass.mp3'),
      },
      'remove-the-drive': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "The fan's dead, I can see the blades sitting still. The temperature stopped climbing on the panel the moment you took the carrier off, so it was the carrier heating it, not the roof. Leave it powered and it'll come down by itself. I'm staying up here a while."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-remove-the-drive.mp3'),
      },
      'command-the-playback': {
        text: `
        <p>
          Playback acknowledged, thank you. The watchdog reset is the last command, and it has to go up before the window closes. Whatever your reference is doing, the spacecraft can't tell.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-command-the-playback.mp3'),
      },
      'check-the-shetland-pass': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "I watched the dish take SAR-2 from the roof with the BUC muted. Nobody was at the console and it flew itself, which is the network doing its job. And since I was up here anyway, the feed heater cable is finished at last, so the torch can go back in the shed. You've still got Galway's chain up, so go and take that down properly."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-check-the-shetland-pass.mp3'),
      },
      'customer-impact': {
        text: `
        <p>
          I've got both collects, and both were on time. I heard afterwards that three things went wrong at once, and I never noticed, which I understand is the point. That vessel that went dark off the Faroes put into port, by the way. Your pictures helped.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-customer-impact.mp3'),
      },
      'actions-and-open-items': {
        text: `
        <p>
          <em>[Text message from Charlie Brooks at {{stationTime}}]</em>
        </p>
        <p>
          "I hear it was a busy lunch. A slipped pass, a hot BUC and a reference in holdover, all inside half an hour, and you sorted them by what each one was blocking. That's the whole job. The network's yours."
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/16/obj-actions-and-open-items.mp3'),
      },
    },
  },
};
