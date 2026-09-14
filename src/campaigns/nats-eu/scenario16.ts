import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, IfFrequency } from '@app/types';
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
 * re-lock confirmed when the signal returns at 12:27. Shetland is armed on
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
 * Faults: SH-02 BUC cooling fault at 90 s (reading jumps to 73 degC, +30 degC
 * offset, clears at 1590 s when the fan is restored); GW-01 GNSS loss at
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
 * driven BUC settles above the 70 degC alarm; muted, it settles well under.
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
  imageUrl: 'nats/16/card.png',
  number: 16,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario15'],
  title: 'Cascade',
  subtitle: 'Network Multi-Failure',
  duration: '40 min',
  missionType: 'Evaluation',
  description: `12:00 local. Densest window of the week, and the handover is a list of things that are wrong.<br><br>MERIDIAN-SAR-2 slipped 90 seconds overnight and now overlaps the SAR-1 command contact on Galway. Erik has collects on both. Fiona is on the Shetland roof with the BUC fan and the console is yours; nobody has checked the rack since the morning's uplink test. Anneke needs REC-PLAYBACK and a watchdog reset on SAR-1 inside the 12:18 window.<br><br>Order the work. Resolve the slip, ready Galway to command, cool the Shetland BUC the right way, arm Shetland to take SAR-2 on its own, fly the command contact through whatever happens to the reference, check Shetland's pass before it sets, and write the report Erik and maintenance both need. This is the qualification for the network.`,
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
        params: { startTemperatureC: 73, deltaC: 30 },
        label: 'SH-02 BUC cooling fan alarm',
      },
      { id: 'gw-gnss-outage', groundStationId: 'GW-01', target: 'gpsdo-gnss-loss', startTime: 1120, duration: 500 },
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
      description: 'Open the handover: a slipped pass, a command request, a fan alarm coming, and eighteen minutes. Decide the order before you touch anything.',
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
            question: 'Slipped pass, command contact at 12:18, Shetland BUC alarm, SAR-2 collect. What is the order of work?',
            options: [
              'The plan first, because it decides which site needs which hardware; then Galway ready to command, because the window has a time; then Shetland, whose contact is receive-only and does not need the BUC at all; then fly, and report last',
              'Shetland first: an alarm is an alarm',
              'The command contact first: Anneke is waiting',
              'The report first, so nothing is forgotten',
            ],
            correctIndex: 0,
            explanation:
              'Triage is ordered by what each problem gates, not by how loud it is. A hot BUC on a receive-only site gates nothing today. Eighteen minutes to AOS. Shift clock started.',
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
        'SAR-2 now overlaps SAR-1 on Galway. The command contact stays on GW-01; the SAR-2 collect goes to SH-02; the slipped Galway half is dropped. The plan must read DECONFLICTED.',
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
            question: 'Why is the slipped Galway SAR-2 half dropped rather than moved?',
            options: [
              'It overlaps the command contact on the only site that can command, and Shetland already has the same bird at 28 degrees against Galway’s 15: the collect is covered better from the site that is free. Dropping a window is a decision the plan records',
              'Because a slipped pass is unflyable by definition',
              'Because the plan will not validate with a P2 contact assigned',
              'It should be moved to Shetland: two windows on one site is a backup',
            ],
            correctIndex: 0,
            explanation:
              'Shetland cannot take two windows on the same bird at the same time either. The slip removed one window from the network; the plan says which one, and why.',
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
      description: 'GPSDO locked and out of holdover. Read it now so you know what it looked like before the window.',
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
      description: 'Both keys Valid before a command goes up: command key on the TX chain, traffic key on RX analysis.',
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
        'The SAR-3 shift left TX modem 1 on 1465 MHz: retune to the 1405 MHz SAR-1 telecommand IF and engage uplink Doppler compensation on the TT&C console. RX modem 1 stays on 1414 MHz; analyzer centred on the 1389 MHz beacon, 2 MHz span.',
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
      description: 'Park the tracker on the 12:18 AOS azimuth: 21 degrees at 5 degrees elevation.',
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
      description: 'Select SH-02 and read its board. The fan alarm on the BUC is real; what matters is why the temperature is still climbing.',
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
            question: 'SH-02 BUC over-temperature, fan alarm, and the TX modem is still on air into the BUC from the morning’s uplink check. What is keeping it hot?',
            options: [
              'The drive. A BUC dissipates heat in proportion to its output; with the fan gone it settles above the alarm as long as a carrier is going in. Remove the drive and it settles under, fan or no fan',
              'The ambient temperature on the roof',
              'The GPSDO reference: an unlocked reference makes the BUC work harder',
              'The HPA: it is off, so its heat has nowhere to go but the BUC',
            ],
            correctIndex: 0,
            explanation: 'The fix is on the transmit chain, not in the rack cabinet. Carrier off, BUC muted, keep it powered, let it come down.',
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
      description: 'SH-02 TX chain: carrier off, BUC muted, BUC still powered. Shetland is receive-only today and needs none of it.',
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
      description: 'Watch it on the SH-02 TX chain: with the drive gone the BUC comes down under 70 degrees inside a couple of minutes. Do not power it off.',
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
              'Twice wrong: an unpowered BUC cools five times slower than a muted one because its own regulation stops, and the alarm clears on a powered reading - an off BUC never reads normal, it reads off. Mute removes the heat source; power-off removes the thermometer',
              'You should: off is always cooler than on',
              'Because it would need a reference re-lock, which takes an hour',
              'Because the HPA would trip without a BUC',
            ],
            correctIndex: 0,
            explanation: 'Every equipment fault on this network has a right action and a louder wrong one. The louder one is usually the power switch.',
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
        'Shetland acquires on its own at 12:21. Modem 1 from 1414 MHz to the 1370 MHz SAR-2 carrier, program-track with MERIDIAN-SAR-2 as the target. Then back to Galway.',
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
            question: 'Shetland takes SAR-2 with a BUC alarm in the log and nobody at its console. What makes that acceptable?',
            options: [
              'The contact is receive-only: the BUC is the transmit chain and plays no part in it, the receive path is healthy, and a station armed on program-track acquires without an operator. What it needs is one to check the number before LOS',
              'Nothing: a site with an active alarm should not fly',
              'Fiona is on the roof and can see the dish move',
              'The plan assigned it, which configures the station',
            ],
            correctIndex: 0,
            explanation: 'Assigned is a plan; armed is a station; a number read before LOS is a contact.',
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
      description: 'Select GW-01. AOS 12:18 from azimuth 21. Program-track MERIDIAN-SAR-1 and confirm the beacon on RX analysis.',
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
      description: 'Window open at 12:18:20. Carrier into the muted BUC, unmute, HPA. In that order.',
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
      description: 'Send REC-PLAYBACK and confirm the acknowledgement.',
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
        'The GPS Timing panel is not what you read at noon. Read it, decide whether the second command goes up on it, and send OBC-WDT-RESET before the window closes at 12:27:20.',
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
            question: 'GW-01 GPSDO: HOLDOVER active, GNSS switch up, zero satellites, since 12:18. The command window is open for eight more minutes. Does OBC-WDT-RESET go up?',
            options: [
              'Yes. A GNSS outage with the switch up is an outage, not an operator error; the oscillator holds the reference to microseconds for tens of minutes and the uplink Doppler pre-compensation does not care. Send it, leave the switch alone, confirm re-lock when the signal returns',
              'No: nothing goes up on a reference in holdover',
              'Yes, after cycling the GNSS switch to force a re-lock',
              'Yes, after power-cycling the GPSDO to clear the holdover flag',
            ],
            correctIndex: 0,
            explanation:
              'Holdover is what the disciplined oscillator is for. Cycling the switch cannot conjure a satellite; a power cycle is a ten-minute warm-up and the window is gone. The command goes up.',
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
        'Select SH-02 while SAR-2 is still up (until 12:30:51). The pedestal should be program-track locked on it and the modem locked with C/N above 8 dB around culmination at 12:26.',
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
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: 'Back to GW-01. Both commands acknowledged: chain down in the mirror order, HPA off, BUC muted, carrier off.',
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
      description: 'The GNSS signal returns at 12:27. Confirm on the GW-01 GPS Timing panel that the receiver has re-locked and left holdover, then log the contacts.',
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
            question: 'What does the report need for the two contacts?',
            options: [
              'SAR-1: both commands acknowledged inside the window, the second on a reference in holdover from 12:18 to 12:27, no action at the switch, re-locked on return. SAR-2: taken by Shetland unattended on a muted BUC, locked and decoded with margin, checked before LOS. With the numbers',
              'Both contacts worked',
              'REC-PLAYBACK and OBC-WDT-RESET acknowledged',
              'SAR-1 worked; SAR-2 was Shetland’s and is on Fiona’s log',
            ],
            correctIndex: 0,
            explanation: 'A fault that cleared is still a fault, and a contact nobody watched is still a contact. Both go in with the numbers or they did not happen.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '12:18Z MERIDIAN-SAR-1 GW-01: REC-PLAYBACK ACK; GW-01 GNSS outage 12:18:40-12:27:00Z, reference in holdover (switch up, zero satellites), OBC-WDT-RESET ACK on holdover, no action at the switch, re-locked on return; chain secured HPA-BUC-modem. 12:21Z MERIDIAN-SAR-2 SH-02 (unattended acquisition, BUC muted): locked, C/N >= 8 dB at 28 deg, checked 12:26Z. Dropped: C-SAR2-GW (slipped, overlapped command contact).',
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
      description: 'Select SH-02 once more: the fan is back, the BUC is normal, and the alarm closes with a cause.',
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
              'The contact was receive-only and the BUC is the transmit chain: mute, cool, keep the receive path working. The alarm closes as a cooling-fan fault with a carrier left driving the BUC - a ticket for the fan and a note for whoever left the carrier up',
              'Because the alarm cleared itself once the fan came back',
              'Because Fiona was on site',
              'It should not have: a site with an open alarm is a site off the board',
            ],
            correctIndex: 0,
            explanation: 'A transmit-chain fault on a receive-only day gates nothing. Knowing which faults gate which work is what lets one operator run two sites.',
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
      description: 'Two lines for Erik: what he got, and what it cost him.',
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
              'None he can see: both collects captured, both commands acknowledged on time, zero missed tasking. The slip cost the network one redundant window, not the customer a collect',
              'One collect lost to the slip',
              'Both collects degraded by the faults',
              'Unknown until Rotterdam processes the frames',
            ],
            correctIndex: 0,
            explanation: 'Qualified means nobody notices. The impact line says so, and the actions line says what it took.',
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
      description: 'One line for maintenance and one for Rotterdam: the tickets, and the question about the slip.',
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
              'Maintenance: GW-01 GNSS antenna fault ticket (outage 12:18-12:27, holdover flown), SH-02 BUC fan ticket. Rotterdam: root cause of the SAR-2 slip, because a 90 second slip that removes a window from the plan is theirs to explain. Station: a carrier was left driving the SH-02 BUC after the morning test',
              'Nothing open: every fault cleared itself',
              'Maintenance: replace the GW-01 GPSDO and the SH-02 BUC',
              'Rotterdam: request that SAR-2 be moved back to its old orbit',
            ],
            correctIndex: 0,
            explanation: 'Three problems, three owners, and none of them is the customer. Qualified for NATS Europe network operations. Both sites are yours to run.',
            pointPenalty: 5,
            documentSection: 'Actions',
            documentLine:
              'Actions: (1) Maintenance - GW-01 GNSS antenna fault, outage 12:18:40-12:27:00Z, reference held on oscillator. (2) Maintenance - SH-02 BUC cooling fan; carrier found driving the BUC after the morning uplink check, removed before the 12:18Z window. (3) Rotterdam - root cause of MERIDIAN-SAR-2 90 s slip requested. Both sites cold, references locked, plan DECONFLICTED.',
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
        <em>[Text message from Fiona MacLeod at 11:58]</em>
      </p>
      <p>
        "Fan alarm on my BUC and I'm going up to look at it, so the console's yours. Nobody's touched the rack since the uplink check this morning. SAR-2 moved overnight and Rotterdam hasn't said why. Your GPSDO's been fine. Enjoy."
      </p>
      `,
      character: Character.FIONA_MACLEOD,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'resolve-the-slipped-pass': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at 12:02]</em>
        </p>
        <p>
          "SAR-2 slipped ninety seconds overnight - ours, we are looking at it. Your SAR-1 command contact stands: REC-PLAYBACK and an OBC watchdog reset inside the 12:18 window, please. Erik still wants both collects. Sort the board first."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'remove-the-drive': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 12:09]</em>
        </p>
        <p>
          "Fan's dead, that's confirmed. Saw the temperature stop climbing on the panel the moment you muted it - that was the carrier, then, not the roof. Leave her powered; she'll come down. I'll be up here a while."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'command-the-playback': {
        text: `
        <p>
          Playback acknowledged. One more: the watchdog reset, before the window closes. Whatever your reference is doing, the bird does not know about it.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'check-the-shetland-pass': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 12:27]</em>
        </p>
        <p>
          "Watched the dish take SAR-2 from the roof, on a hot BUC and a cold tea. Nobody at the console and it flew itself. That's the network."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'customer-impact': {
        text: `
        <p>
          Both collects. Both on time. I heard afterwards there were three things wrong at once. I never noticed, which I understand is the point.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'actions-and-open-items': {
        text: `
        <p>
          <em>[Text message from Charlie Brooks at 12:44]</em>
        </p>
        <p>
          "Heard it was a busy lunch. A slipped pass, a hot BUC, a reference that went walkabout, and a customer who noticed none of it. Qualified means nobody notices. The network's yours."
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
