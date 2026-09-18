import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 19 - "Frequency Agility" / TRANSEC Ride-Through (Gray Zone arc 3/8)
 *
 * The adversary moves from the downlink to the uplink. Rotterdam reissued the
 * IF plan after S18 and loaded a hop-set key on MERIDIAN-SAR-2 this morning;
 * the station has the matching key in its COMSEC store, inactive. The SAR-2
 * pass is a commanding pass: chain up, one clean command, and then - two
 * minutes into the window - a jammer on the 14035 MHz command uplink at the
 * satellite. The next command NAKs with the key Valid, Doppler engaged and the
 * window open. The operator calls it (uplink denial, not a key problem), keys
 * the hop set with Anneke, takes the waveform to hopping, gets sync, and the
 * resend ACKs through the jamming. Then SAR-1 receive-only, untouched: a
 * jammer reaches what it can reach.
 *
 * Phase 18: `call-the-nak` is graded on the new `uplink-jammed` fact
 * (CommandingManager.isUplinkJammed: a transponder-path event on the target
 * bird overlapping settings.commanding.uplinkFrequencyHz, with no TRANSEC
 * sync). M7 TRANSEC (transec-mode-set / transec-sync-locked) debuts here as a
 * response mechanic; hop-sync is what clears the denial.
 *
 * Clock starts 2027-04-16 13:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 13:00:00Z):
 *
 *   MERIDIAN-SAR-2: AOS T+20.02 (13:20:01Z, az 138), max el 27.9 deg at T+24.72
 *                   (13:24:43Z, 765 km), LOS T+29.48 (13:29:29Z, az 353), 9.5 min,
 *                   northbound. The commanding pass; window 13:20:21 .. 13:29:09
 *                   (T+1221 .. T+1749).
 *   MERIDIAN-SAR-1: AOS T+42.02 (13:42:01Z, az 005), max el 25.2 deg at T+46.76
 *                   (13:46:46Z, 839 km), LOS T+51.49 (13:51:29Z, az 224), 9.5 min,
 *                   southbound. Receive only. C/N >= 8 dB roughly 13:44:30 .. 13:49.
 *
 * The jammer: settings.interferenceEvents 'sar2-uplink-jam', transponder
 * path at SAR-2's 14035 MHz telecommand uplink, 2 MHz, H-pol, from T+1350 s
 * (13:22:30Z) for 400 s to 13:29:10Z - the rest of the window. Relayed to the
 * downlink like any transponder event, so it is visible on the analyzer too.
 *
 * Staged state (scenario-local clone of GW-01): TX modem 1 on 1405 MHz (SAR-1
 * command IF) from yesterday, to be retuned to 1435 for SAR-2; RX modem 1 on
 * 1414. BUC muted. Hop-set key loaded but the waveform fixed.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0925: Knowledge of wireless technologies and their security
 *   - S0593: Skill in handling incidents
 *   - K0751: Knowledge of system threats
 *
 * Supporting Codes:
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0648: Skill in detecting anomalies
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K0874: Knowledge of cryptographic key management
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-2 (61702) at the S19 epoch: the 28 deg commanding pass, northbound from az 138. */
const SAR2_S19_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27106.54166667  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61702  98.4000  58.0000 0010000  90.0000 229.7500 15.59860000123456' as TleLine2,
};

/** MERIDIAN-SAR-1 (61701) at the S19 epoch: the 25 deg receive pass, southbound from az 005. */
const SAR1_S19_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27106.54166667  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61701  98.0000 200.0000 0010000  90.0000 211.7500 15.57020000123457' as TleLine2,
};

const meridianSar1S19 = createMeridianSar1(SAR1_S19_TLE);
const meridianSar2S19 = createMeridianSar2(SAR2_S19_TLE);

/** GW-01 as yesterday left it: TX on SAR-1's command IF, BUC muted. Deep clone, never spread. */
const galwayAgility: GroundStationConfig = structuredClone(galwayGroundStation);
galwayAgility.receivers![0].modems![0] = {
  ...galwayAgility.receivers![0].modems![0],
  frequency: 1414 as MHz,
};
galwayAgility.rfFrontEnds[0].buc = { ...galwayAgility.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario19Data: ScenarioData = {
  id: 'nats-eu-scenario19',
  url: 'nats-eu/scenarios/nats-eu-scenario19',
  imageUrl: 'nats/19/card.png',
  number: 19,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario18'],
  title: 'Frequency Agility',
  subtitle: 'TRANSEC Ride-Through (Gray Zone 3/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `13:00, Galway. Rotterdam reissued the IF plan overnight and loaded a hop-set key on SAR-2 this morning; yours is in the COMSEC store, inactive. SAR-2 at 13:20 is a commanding pass - a housekeeping dump and a payload status. SAR-1 at 13:42 is receive-only.<br><br>Whoever has been in your band has had two days to read the new plan. If the uplink is next, the command console will tell you in one word, and the key will still say Valid. Know what that means before it happens.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO, 12600 MHz BUC LO) + HPA',
    'TT&C Commanding Console with TRANSEC waveform (Security console)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayAgility, shetlandGroundStation],
    satellites: [meridianSar1S19, meridianSar2S19],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-16',
    scenarioStartWallTime: '13:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-19?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'Uplink Denial Record UD-2027-0416-GW01',
      description: 'The SAR-2 command window of 16 April: what was sent, what came back, what was done, and what the hop set cost.',
    },

    // M2/M5 - the commanding pass. The window is the SAR-2 pass with 20 s
    // guards. uplinkFrequencyHz couples the console to interference on the
    // command carrier: while the jammer below is in its envelope and TRANSEC
    // is not synced, commands NAK 'uplink-jammed'.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61702,
      windowStartS: 1221,
      windowEndS: 1749,
      requireDopplerComp: true,
      requireValidKey: true,
      uplinkFrequencyHz: 14035e6,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'PLD-STATUS', label: 'Payload status request' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },

    // M7 - the TRANSEC waveform on the command carrier. Hop set keyed at both
    // ends: Rotterdam loaded SAR-2's this morning; the station loads its own
    // from the COMSEC store on Anneke's call.
    transec: {
      groundStationId: 'GW-01',
      hopChannelsHz: [14031e6, 14033e6, 14035e6, 14037e6, 14039e6],
      requireKey: true,
    },

    // The jammer: on SAR-2's command uplink at the satellite, two minutes
    // into the window, for the rest of it. A fixed carrier is denied; a keyed
    // hop set is not something a jammer parked on one frequency can follow.
    interferenceEvents: [
      {
        id: 'sar2-uplink-jam',
        satelliteNoradId: 61702,
        frequency: 14035e6,
        bandwidth: 2e6,
        power: 5,
        polarization: 'H',
        startTime: 1350,
        duration: 400,
        periodSeconds: 400,
        onSeconds: 400,
      },
    ],

    // M6 - the log as it stands; the escalation option in call-the-nak writes here.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'svc-legacy', name: 'Telemetry bridge (legacy, decommissioned 14 Jan)', role: 'Service Account', status: 'disabled' },
      ],
      events: [
        {
          id: 'evt-plan-reissued',
          timeS: 0,
          timestampLabel: '15 Apr 21:10 UTC',
          actor: 'op-charlie',
          action: 'IF plan MER-IF-2027-04b applied (reissued by Rotterdam after IR-2027-0414)',
          category: 'config',
          severity: 'info',
        },
        {
          id: 'evt-hopkey-loaded',
          timeS: 0,
          timestampLabel: '08:20 UTC',
          actor: 'op-charlie',
          action: 'TRANSEC hop-set key HOP-SAR2-04 loaded to COMSEC store (inactive)',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '12:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-1300', timeS: 0, timestampLabel: '13:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0925'],
      title: 'Read the Brief',
      description:
        'Open the shift brief: the reissued plan, the hop set keyed at Rotterdam, the two commands SAR-2 needs inside its window, and what a NAK with a Valid key means.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Hop Set Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Rotterdam loaded a hop-set key on SAR-2 this morning and the station has the matching key in store. Why is the waveform still fixed at 13:00?',
            options: [
              'Hopping is a response, not a default: it costs command-link margin and burns a key that has to be replaced, so it is used when a fixed carrier is denied and not before',
              'The console cannot hop until the window opens: hop-sync needs the bird in view, so the mode switch is made at AOS every pass',
              'The key is loaded but not verified: Rotterdam has to send a hop-verify command before the station is allowed to enable the mode',
              'It is always fixed on the first command of a pass: the housekeeping dump must go on the known carrier so the bird can confirm the plan',
            ],
            correctIndex: 0,
            explanation:
              'A hop set is a consumable. Once it has been used on the air it is assumed observed and gets retired. You hop when a fixed carrier is being denied, on a call, with both ends keyed - and you say so in the record. Twenty minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Board read. Confirm the active alarm state on GW-01 before the uplink goes anywhere near the air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 90,
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
          description: 'Alarm State Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'What is the active alarm state on GW-01 at 13:00?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the pass',
              'TRANSEC alarm - hop-set key loaded but waveform fixed, flagged as a mismatch',
              'BUC muted alarm - the uplink is inhibited and the board wants it cleared',
            ],
            correctIndex: 0,
            explanation:
              'Empty sky, not a fault. A muted BUC is the correct state for a station with nothing to send, and a loaded-but-inactive hop key is exactly what the brief says it should be. The AGC rail clears at AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'reference-check',
      nice: ['T0431', 'K0740'],
      title: 'Reference Check',
      description: 'GPSDO locked and out of holdover, BUC on the external reference. Doppler compensation and a hopping waveform both key off it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'tune-the-uplink',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Tune the Uplink',
      description:
        "TX modem 1 is on SAR-1's 1405 MHz command IF from yesterday. Retune it for SAR-2's 14035 MHz TT&C uplink through the 12600 MHz BUC LO, and engage uplink Doppler compensation on the TT&C console before the window opens at 13:20:21.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX 1435 MHz',
          params: { modemNumber: 1, frequency: 1435e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Uplink IF Arithmetic',
          params: {
            character: Character.SYSTEM,
            question: 'BUC LO 12600 MHz, low-side. SAR-2 TT&C uplink 14035 MHz. Where does the modem go?',
            options: ['1435 MHz (RF minus LO, low-side)', '1405 MHz (leave it, same modem IF)', '1370 MHz (the SAR-2 receive IF)', '26635 MHz (LO plus RF, low-side)'],
            correctIndex: 0,
            explanation:
              'Low-side on the uplink: IF = RF - LO = 14035 - 12600 = 1435. 1405 is SAR-1 and 1370 is what you receive SAR-2 on, not what you send to it. Nothing about the reissued plan changed the arithmetic; only the numbers.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'key-check',
      nice: ['K0874', 'T0431'],
      title: 'Key Check',
      description: 'Command key Valid on the TX chain. Remember what it reads now; it will read the same later, and that will matter.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-the-uplink'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'Command Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-2',
      description: 'Retune RX modem 1 to 1370 MHz and frame the analyzer on 1370 with a 40 MHz span. The uplink is the story today, but the downlink is how you see it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['key-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 40 MHz',
          params: { span: 40e6, frequencyTolerance: 5e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS 13:20:01 from azimuth 138, northbound. Park the tracker on the rise azimuth at 5 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 138 / El 5',
          params: { azimuth: 138, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'Program-track SAR-2 before 13:20 and confirm the 1397 MHz beacon on RX analysis. The chain stays cold until she is locked.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-aos'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-Beacon',
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
      id: 'chain-up',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Chain Up in Order',
      description: 'Window open at 13:20:21. Carrier into the muted BUC, unmute, HPA. Two minutes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
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
      id: 'first-command',
      nice: ['T1567', 'K1032'],
      title: 'Housekeeping Dump',
      description: 'Send HK-DUMP and confirm the acknowledgement. A clean ACK on the fixed carrier is the baseline for everything that follows.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'HK-DUMP Acknowledged',
          params: { commandId: 'HK-DUMP' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'ACK Read',
          params: {
            character: Character.SYSTEM,
            question: 'HK-DUMP ACKed inside the window on the fixed carrier. What has that proven about the command link right now?',
            options: [
              'That the bird heard this command: key, Doppler, window and carrier were all good at that instant - and nothing more than that instant',
              'That the link is clear for the pass: an ACK is a link check, and the next command can go without re-reading the console',
              'That the hop set will not be needed today: a denied carrier would have shown on the first command, not a later one',
              'That the reissued plan is confirmed on the bird: an ACK on the new IF means SAR-2 has the same plan the station has',
            ],
            correctIndex: 0,
            explanation:
              'An ACK is receipt of one command at one moment. It says nothing about the next thirty seconds, which is why the console is read before every send and not once per pass.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-nak',
      nice: ['S0648', 'K0926', 'K0751'],
      title: 'Call the NAK',
      description:
        'From 13:22:30 PLD-STATUS comes back NAK: uplink denied. Key reads Valid, Doppler engaged, window open, and there is a new carrier on the analyzer where the transponder returns the uplink. Read the key and the console, then call it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-command'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'key-seen',
          type: 'tx-key-status',
          description: 'Command key read on TX Chain',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          id: 'console-seen',
          type: 'uplink-doppler-comp-enabled',
          description: 'TT&C console read',
          params: { requiresObservation: true, observationTab: 'commanding' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Why the NAK',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt: 'Your PLD-STATUS did not reach me and your key shows Valid at my end too. Window is open for six more minutes. What is it, and what do you want to do?',
            evidence: ['key-seen', 'console-seen'],
            decisionOptions: [
              {
                label: 'Uplink denial - key the hop set at both ends and take the waveform to hopping',
                correctWhen: {
                  all: [
                    { fact: 'uplink-jammed', is: true },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Uplink denial called on the SAR-2 command carrier; hop set requested at both ends' },
              },
              {
                label: 'Key problem - begin a command-key rotation and resend under the new key',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: { log: 'Command-key rotation begun on a Valid key (no key fault)' },
                feedback: 'Both ends read Valid, and a key rejection is its own reason on the console. Rotating a good key in an open window spends the window on nothing.',
              },
              {
                label: 'Doppler compensation dropped - re-engage it and resend on the fixed carrier',
                feedback: 'Compensation is engaged; the console would have said so if it were not. A resend on the same carrier is another NAK.',
              },
              {
                label: 'Window closed early - stand down and take the payload status on SAR-1',
                correctWhen: { fact: 'command-window-open', is: false },
                consequence: { log: 'Commanding stood down inside an open window' },
                feedback: 'The window badge reads OPEN and SAR-1 is a receive-only pass with no command uplink. Standing down here hands them the window.',
              },
            ],
            explanation:
              'Every reason the console can give for itself - key, Doppler, window - is clean, and the transponder is returning a carrier that is not yours. The uplink is being denied at the satellite. Nothing on this station is broken and no key is compromised; a fixed carrier is being sat on, and the answer to that is to stop being on one frequency.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'go-to-hopping',
      nice: ['K0925', 'S0593', 'T1567'],
      title: 'Go to Hopping',
      description:
        'Anneke keys SAR-2. On the Security console: load the hop-set key from the store, set the waveform to frequency hopping, and confirm SYNC LOCKED. Both ends, or it is nothing.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-nak'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'transec-mode-set',
          description: 'Waveform in Hopping Mode',
          params: { transecMode: 'hopping' },
          mustMaintain: true,
        },
        {
          type: 'transec-sync-locked',
          description: 'Hop-Sync Locked',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Both Ends',
          params: {
            character: Character.SYSTEM,
            question: 'Why does hop-sync need the key loaded at both ends before the mode does anything?',
            options: [
              'The hop set is the shared secret: the bird can only follow the carrier if it knows the same sequence, and a jammer parked on one frequency cannot',
              'Because the station key unlocks the mode switch: without it the console refuses to leave fixed mode, as a safety interlock',
              'Because the bird has to acknowledge the mode change on the fixed carrier first, which is why the first hop is always sent unkeyed',
              'It does not, strictly: the key only encrypts the command payload, and hopping would work unkeyed at a lower data rate',
            ],
            correctIndex: 0,
            explanation:
              'Frequency hopping is only agile to someone who does not have the sequence. The key is the sequence. With it at both ends the carrier moves and the bird moves with it; without it at one end, one of you is transmitting into nothing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'ride-through',
      nice: ['K0925', 'T1567', 'S0593'],
      title: 'Ride It Through',
      description: 'Sync locked. Resend PLD-STATUS and take the ACK through the jamming. The jammer is still there; it is just no longer where you are.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['go-to-hopping'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-STATUS Acknowledged Under TRANSEC',
          params: { commandId: 'PLD-STATUS' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'What Hopping Did',
          params: {
            character: Character.SYSTEM,
            question: 'The ACK came back with the jammer still on the analyzer. What did hopping change, and what did it not?',
            options: [
              'It moved your carrier out from under the jammer, at the cost of margin and a hop set that is now spent; it did not remove the jammer or tell you who it is',
              'It removed the jammer from the transponder: a hopping carrier captures the AGC and the fixed interferer is suppressed at the bird',
              'It proved the jammer was never on the uplink: the NAK was a console fault that the mode change happened to reset',
              'It made the link permanently agile: the hop set stays in use for the rest of the arc and the fixed carrier is retired',
            ],
            correctIndex: 0,
            explanation:
              'Agility is a way past a denial, not a cure for it. The carrier is spread over five channels a jammer on one frequency cannot cover; the bird follows because it has the sequence. The jammer is still transmitting, the set is now burned, and the report still has to say what was seen.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Uplink',
      description: 'LOS 13:29:29. Chain down in the mirror order: HPA output off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['ride-through'],
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
      id: 'log-the-denial',
      nice: ['K0946', 'T1580'],
      title: 'Log the Denial',
      description:
        'Put the window in the record: the clean ACK, the NAK and its reason, what the console showed, the call, the hop set and when sync locked, the ACK that followed.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Window Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Which line goes in the record for the SAR-2 window?',
            options: [
              '13:21 HK-DUMP ACK fixed; 13:23 PLD-STATUS NAK uplink denied, key Valid, Doppler on, window open; called denial 13:24; hop set keyed both ends, sync 13:25; PLD-STATUS ACK hopping 13:26',
              'SAR-2 window worked: two commands acknowledged, one on the second attempt after a transient uplink problem cleared',
              'Jamming attack on the SAR-2 command link defeated by TRANSEC; the adversary has moved from the downlink to the uplink and is escalating',
              'PLD-STATUS delayed three minutes by interference; the hop set was activated as a precaution and both commands completed',
            ],
            correctIndex: 0,
            explanation:
              'Times, what came back, what the console read, what was done, in order. "Transient" and "attack" are conclusions; the record has the NAK reason and the key state at the moment of the NAK, which is what anyone reading it later needs.',
            pointPenalty: 5,
            documentSection: 'Window',
            documentLine:
              'SAR-2 window 13:20:21-13:29:09Z: HK-DUMP ACK 13:21 (fixed carrier 14035 MHz). PLD-STATUS NAK 13:23 "uplink denied - carrier jammed"; key Valid both ends, Doppler comp on, window open; transponded return shows a 2 MHz carrier on the uplink. Called uplink denial 13:24. Hop set HOP-SAR2-04 keyed at Rotterdam and GW-01, mode hopping, SYNC LOCKED 13:25. PLD-STATUS resent, ACK 13:26 under TRANSEC. Jammer present through LOS.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'decode-sar1',
      nice: ['T0153', 'K0740', 'K0926'],
      title: 'Decode SAR-1 Untouched',
      description:
        'SAR-1 rises at 13:42:01 from azimuth 005. Retune RX modem 1 to 1414 MHz, retarget program-track, lock the carrier and hold C/N above 8 dB through the high-elevation segment. Nothing should touch it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-denial'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Reach Read',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-1 decoded clean with nothing in the band. Why was this pass untouched when SAR-2 was denied twenty minutes ago?',
            options: [
              'A jammer reaches what it can reach: the SAR-2 denial was an uplink at the satellite, and SAR-1 was a receive-only pass with nothing of yours on the air to sit on',
              'Because the hop set is still active: once the waveform is hopping, every carrier on the station is agile, downlinks included',
              'Because the adversary stood down after the ride-through: a defeated jammer stops for the day, and SAR-1 fell after that',
              'Because SAR-1 uses a different LNB LO: the reissued plan moved SAR-1 to a band the jammer does not cover',
            ],
            correctIndex: 0,
            explanation:
              'Uplink denial is aimed at the satellite; downlink interference is aimed at the station. They are different attacks on different ends of the link. A receive-only pass has no uplink to deny, and a jammer that was on 14035 MHz at SAR-2 has no reach into what SAR-1 sends you on 11686.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'close-and-debrief',
      nice: ['T1580', 'K0645', 'K0874'],
      title: 'Close the Record and Debrief',
      description: 'Both passes worked. Close the record: what is open, what Rotterdam does about the hop set, and the line that changes the next commanding pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar1'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Debrief Line',
          params: {
            character: Character.SYSTEM,
            question: 'What is the debrief line?',
            options: [
              'A hop set used on the air is a hop set observed: HOP-SAR2-04 is retired, the next set is staged before every commanding pass, and the mode switch is rehearsed in the pre-pass sweep',
              'Both commands completed and TRANSEC worked as designed; no change to the procedure beyond noting the jammer for the regulator',
              'Commanding passes should be flown from Shetland until the jammer is found: the uplink denial reaches Galway, not SH-02',
              'The first command of every pass should go out hopping: agility from AOS removes the NAK and the three minutes it cost',
            ],
            correctIndex: 0,
            explanation:
              'The set that saved the window is now spent, and the switch cost three minutes of a nine-minute window because it was done for the first time under pressure. Stage the next set, rehearse the switch, hop on a call. Hopping from AOS burns a set every pass for a denial that may not come, and the denial was aimed at the satellite - Shetland would have been denied too.',
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed 13:58Z. Open: uplink jammer (regulator package per IR-2027-0414 to be extended), attribution referred. Action: HOP-SAR2-04 retired as observed; Rotterdam to stage HOP-SAR2-05 before the next commanding pass. Debrief: hop set staged and mode switch rehearsed in every commanding pre-pass sweep; hop on a called denial, not from AOS.',
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
        <em>[Text message from Anneke Visser at 12:44]</em>
      </p>
      <p>
        "New IF plan is on your station as of last night. I loaded hop set HOP-SAR2-04 on SAR-2 at 08:20; your copy is in the store, inactive. SAR-2 at 13:20 is commanding: HK-DUMP, then PLD-STATUS. If your carrier is denied you call it and I key my end on the call - not before, the set is not free. SAR-1 after is receive only."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'first-command': {
        text: `
        <p>
          HK-DUMP on my screen, acknowledged 13:21. Send the payload status when you are ready.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'call-the-nak': {
        text: `
        <p>
          Denial it is. Keying SAR-2 now - HOP-SAR2-04 active at my end as of this moment. Load yours, go to hopping, tell me when you have sync.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'go-to-hopping': {
        text: `
        <p>
          Sync at my end too. Resend PLD-STATUS. Whoever is on 14035 is about to be on it alone.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'ride-through': {
        text: `
        <p>
          PLD-STATUS acknowledged, 13:26, under TRANSEC. Chain down at LOS. I will retire this set tonight and stage the next one; you did not spend it for nothing.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'close-and-debrief': {
        text: `
        <p>
          Downlink Monday, uplink today. That is somebody working through what your station does, one end at a time. The record you just closed is how the next station on their list gets warned. Well kept.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
