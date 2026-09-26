import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 17 - "Unusual Activity" / First Indicators (Gray Zone arc 1/8)
 *
 * Phase 3 opens quietly. A night shift with two routine receive passes, and
 * three things that do not belong: three accounts each hit with three failed
 * logins inside an hour (a spray, not a forgotten password), a Ku carrier that
 * appears on the SAR-1 downlink just after culmination and does not Doppler
 * (a ground emitter, not a satellite), and, while the operator is writing up
 * the carrier, a full station-configuration export by a service account that
 * was decommissioned in January. Nothing is attributed. Priya Sharma, NATS
 * Group CSIRT, debuts: flag, note the time, then act - the order matters.
 *
 * Phase 18 (decision conditions): `call-the-carrier` is the first Gray Zone
 * decision. It is graded on live evidence facts - a scripted interference
 * event is radiating, no fault is injected, the RX key reads Valid - so
 * "interference: characterise and report" is the only correct call. The
 * intrusion option fires an escalation entry into the audit log; that entry is
 * still there in S22.
 *
 * Clock starts 2027-04-12 02:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 02:00:00Z):
 *
 *   MERIDIAN-SAR-1: AOS T+20.01 (02:20:00Z, az 187), max el 30.0 deg at T+24.77
 *                   (02:24:46Z, 717 km), LOS T+29.57 (02:29:34Z, az 339), 9.6 min,
 *                   northbound. C/N >= 8 dB roughly 02:22:30 .. 02:27:00.
 *   MERIDIAN-SAR-2: AOS T+40.02 (02:40:01Z, az 137), max el 26.3 deg at T+44.76
 *                   (02:44:46Z, 809 km), LOS T+49.50 (02:49:30Z, az 354), 9.5 min,
 *                   northbound. C/N >= 8 dB roughly 02:42:30 .. 02:47:00.
 *
 * The carrier: settings.interferenceEvents 'gw-ku-carrier', terrestrial path,
 * emitter 22 km south-west of Galway, 11690 MHz (IF 1410, 4 MHz below the
 * SAR-1 video at 1414 and inside its 36 MHz occupied band), 1 MHz wide, on
 * from T+1530 s (02:25:30Z) for 510 s - through LOS to 02:34:00Z. Terrestrial
 * emissions reach the antenna directly, so it stays on the analyzer after the
 * bird has set, and it never drifts: two diagnostic tells the characterise
 * objective quizzes. Shetland never hears it.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on the 1370 MHz
 * SAR-2 carrier from the evening's last contact; analyzer at its 1414 / 60 MHz
 * default; tracker parked where the evening left it. Receive only: no
 * commanding, no HPA work.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0682: Knowledge of cyber attack stages and their indicators
 *   - K0935: Knowledge of incident categories and response procedures
 *   - S0648: Skill in detecting anomalies
 *
 * Supporting Codes:
 *   - K0946: Knowledge of incident reporting requirements
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - K0686: Knowledge of account management
 *   - S0844: Skill in reviewing logs to identify evidence
 *   - T1569: Perform account management
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-1 (61701) at the S17 epoch: the 30 deg pass, northbound from az 187. */
const SAR1_S17_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27102.08333333  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61701  97.2000 228.0000 0010000  90.0000 226.2500 15.61320000123457' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S17 epoch: the 26 deg pass twenty minutes later. */
const SAR2_S17_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27102.08333333  .00001000  00000-0  10000-3 0  9994' as TleLine1,
  tle2: '2 61702  98.0000 253.7500 0010000  90.0000 152.0000 15.58070000123456' as TleLine2,
};

const meridianSar1S17 = createMeridianSar1(SAR1_S17_TLE);
const meridianSar2S17 = createMeridianSar2(SAR2_S17_TLE);

/** GW-01 as the evening left it: modem 1 on the SAR-2 carrier. Deep clone, never spread. */
const galwayNight: GroundStationConfig = structuredClone(galwayGroundStation);
galwayNight.receivers![0].modems![0] = {
  ...galwayNight.receivers![0].modems![0],
  frequency: 1370 as MHz,
};

export const natsEuScenario17Data: ScenarioData = {
  id: 'nats-eu-scenario17',
  url: 'nats-eu/scenarios/nats-eu-scenario17',
  imageUrl: 'nats/17/card.png',
  number: 17,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario16'],
  title: 'Unusual Activity',
  subtitle: 'First Indicators (Gray Zone 1/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `02:00, Galway, night shift. Two routine receive passes on the board, SAR-1 at 02:20 and SAR-2 at 02:40, and nothing else - except a text from Group Security that arrived at 01:52 and does not say much.<br><br>The overnight log has three failed-login bursts in it. The SAR-1 pass will have something in it too. None of it is attributed and none of it is loud. Priya Sharma's rule for the night is the whole lesson: look, flag, note the time, then act. In that order.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO)',
    'Security Console (audit log + access control)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayNight, shetlandGroundStation],
    satellites: [meridianSar1S17, meridianSar2S17],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-12',
    scenarioStartWallTime: '02:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-17?content-only=true&dark=true',

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
      title: 'Incident Record INC-2027-0412-GW01',
      description: 'Opened on the night of 11/12 April. What was seen, when it was seen, what was done. In that order.',
    },

    // The carrier: a ground emitter south-west of the station on 11690 MHz,
    // inside the SAR-1 video band, on from just after culmination through LOS.
    // Terrestrial path: received directly, no Doppler, still there after the
    // bird sets, never heard at Shetland.
    interferenceEvents: [
      {
        id: 'gw-ku-carrier',
        frequency: 11690e6,
        bandwidth: 1e6,
        // EIRP dBm. ~140 dB of path loss over 24 km at 11.69 GHz through a far
        // sidelobe puts it near the video's level at the feed: a plain dent.
        power: 60,
        polarization: 'V',
        startTime: 1530,
        duration: 510,
        periodSeconds: 510,
        onSeconds: 510,
        path: 'terrestrial',
        emitter: { latitude: 53.12, longitude: -9.32 },
      },
    ],

    // M6 - the overnight log. Routine traffic, three failed-login bursts an
    // hour apart against three different accounts (the spray; the third one
    // is against a service account decommissioned in January and is the entry
    // to flag), and one live entry that arrives during the shift: a full
    // configuration export by that same account.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-evening', name: 'R. Byrne', role: 'Operator (evening)', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'svc-legacy', name: 'Telemetry bridge (legacy, decommissioned 14 Jan)', role: 'Service Account', status: 'active' },
      ],
      events: [
        { id: 'evt-evening-login', timeS: 0, timestampLabel: '17:58 UTC', actor: 'op-evening', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-cfg-rx-1370',
          timeS: 0,
          timestampLabel: '23:41 UTC',
          actor: 'op-evening',
          action: 'Set receiver 1 frequency 1370 MHz (SAR-2 23:52 contact)',
          category: 'config',
          severity: 'info',
        },
        { id: 'evt-svc-poll-0000', timeS: 0, timestampLabel: '00:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        {
          id: 'evt-evening-logout',
          timeS: 0,
          timestampLabel: '00:06 UTC',
          actor: 'op-evening',
          action: 'Console logout (end of shift, station unattended)',
          category: 'auth',
          severity: 'info',
        },
        {
          id: 'evt-spray-charlie',
          timeS: 0,
          timestampLabel: '01:12 UTC',
          actor: 'op-charlie',
          action: 'Failed login (3 attempts, remote source, then stopped)',
          category: 'auth',
          severity: 'warning',
        },
        {
          id: 'evt-spray-fiona',
          timeS: 0,
          timestampLabel: '01:40 UTC',
          actor: 'op-fiona',
          action: 'Failed login (3 attempts, same remote source, then stopped)',
          category: 'auth',
          severity: 'warning',
        },
        {
          id: 'evt-spray-legacy',
          timeS: 0,
          timestampLabel: '01:58 UTC',
          actor: 'svc-legacy',
          action: 'Failed login (3 attempts, same remote source, then stopped) - account decommissioned 14 Jan, still active',
          category: 'auth',
          severity: 'warning',
          isAnomaly: true,
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '01:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-0200', timeS: 0, timestampLabel: '02:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        {
          id: 'evt-config-export',
          timeS: 1980,
          timestampLabel: '02:33 UTC',
          actor: 'svc-legacy',
          action: 'Configuration read: full station configuration exported (antenna, LNB LO, modem plan, contact schedule) - no change ticket',
          category: 'config',
          severity: 'critical',
          isAnomaly: true,
        },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0935'],
      title: 'Read the Night Brief',
      description: "Open the shift brief. Two receive passes, a text from Group Security, and Priya's rule for anything that does not belong: look, flag, note the time, then act.",
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Night Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'The Order Understood',
          params: {
            character: Character.SYSTEM,
            question: "Priya's rule is look, flag, note the time, then act. Why is the account not disabled first, before anything else?",
            options: [
              'Acting first destroys the record of what was seen and when; the flag and the time are the evidence, the action comes after',
              'Disabling an account needs Group Security approval at night; flagging is within the operator authority, so it goes first',
              'The console will not accept an access-control change until the audit log has been marked reviewed for the shift',
              'Acting first is fine for a service account; the rule only applies to named user accounts, which need a witness',
            ],
            correctIndex: 0,
            explanation:
              'An entry acted on before it is flagged is an entry someone has to reconstruct later from memory. The flag and the time you saw it are the incident record; the action is what the record justifies. Twenty minutes to AOS.',
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
      description: 'Night board. Confirm the active alarm state on GW-01 before anything is read into it.',
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
            question: 'What is the active alarm state on GW-01 at 02:00?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the night',
              'Security console alert - three failed logins have raised a station alarm',
              'LNB reference unlocked - hardware alarm left by the evening shift',
            ],
            correctIndex: 0,
            explanation:
              'The AGC rail is empty sky, not a fault. The failed logins are in the audit log, not on the alarm board; the board watches hardware, the log watches people. Both get read tonight.',
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
      description: 'GPSDO locked and out of holdover. Every reading tonight is only worth what the reference is worth.',
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
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-1',
      description:
        'Modem 1 is still on the 1370 MHz SAR-2 carrier from the 23:52 contact. Retune it to 1414 MHz and frame the analyzer on 1414 with a 40 MHz span, wide enough to hold the video, the 1389 beacon and the Doppler.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1414 MHz',
          params: { centerFrequency: 1414e6, centerFrequencyTolerance: 100e3 },
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
      id: 'read-the-overnight-log',
      nice: ['S0844', 'K0682'],
      title: 'Read the Overnight Log',
      description:
        'Open the Security console and read the trail from the evening handover to now, then sign off the review. Three warning entries an hour apart. Read them as a set before you read them one at a time.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Security Console Open',
          params: { tab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'audit-log-reviewed',
          description: 'Overnight Log Reviewed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Pattern Recognised',
          params: {
            character: Character.SYSTEM,
            question:
              'Three failed logins against C. Brooks at 01:12, three against F. MacLeod at 01:40, three against the legacy telemetry bridge at 01:58, all from one remote source, each stopping at three. What is that?',
            options: [
              'A spray: one source trying a few passwords on many accounts and stopping under the lockout, which reads as three small warnings',
              'Three people mistyping: a site lead, an operator and a service, each locked out on the third try and each unrelated',
              'A lockout test by the monitoring service: three accounts probed on schedule to confirm the three-attempt policy',
              'A brute force against the station: one account hit repeatedly until the lockout, then the attacker moved on',
            ],
            correctIndex: 0,
            explanation:
              'Few attempts per account, many accounts, one source, stopping just under the lockout: that is a spray, and a spray is designed to look like three unrelated warnings. The logger gave you three entries. The pattern is the finding.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'flag-the-spray',
      nice: ['S0844', 'K0946'],
      title: 'Flag the Spray',
      description:
        'Flag the 01:58 entry against svc-legacy - an account decommissioned in January that still answers. Flag it, note the time you saw it. Do not touch the account yet.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-overnight-log'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Spray Entry Flagged',
          params: { eventId: 'evt-spray-legacy' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Time Noted',
          params: {
            character: Character.SYSTEM,
            question: 'The account is decommissioned, still active, and was just tried. Why flag and note the time before disabling it?',
            options: [
              'The flag and the time seen are the first lines of the incident record; disabling first leaves a change with no reason attached',
              'Because disabling it might alert whoever is trying; leaving it active for the night keeps them from noticing',
              'Because a decommissioned account cannot be disabled from the console; it has to go through the monitoring service',
              'The flag is for Group Security to decide on the account; the operator has no authority over service accounts',
            ],
            correctIndex: 0,
            explanation:
              'Nobody is being left a door open on purpose. The order is about the record: seen at 02:09, flagged at 02:09, disabled at 02:35 with a reason. A disabled account with no flag behind it is a change nobody can explain at 09:00.',
            pointPenalty: 5,
            documentSection: 'Indicators',
            documentLine:
              'Overnight log: password spray from one remote source, 01:12 / 01:40 / 01:58, three accounts x three attempts, stopping under lockout. svc-legacy (decommissioned 14 Jan) still active and targeted. Flagged 02:09.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS 02:20:00 from azimuth 187. Park the tracker on the rise azimuth at 5 degrees so the slew is done before she is over the horizon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-spray'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 187 / El 5',
          params: { azimuth: 187, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Program-track SAR-1 before 02:20 and confirm the 1389 MHz beacon on RX analysis.',
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
      points: 15,
    },
    {
      id: 'decode-sar1',
      nice: ['T0153', 'K0740'],
      title: 'Decode the Routine Downlink',
      description: 'Lock the 1414 MHz imagery carrier and hold C/N above 8 dB through the high-elevation segment, roughly 02:22:30 to 02:27.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'characterise-the-carrier',
      nice: ['S0648', 'K0926', 'K0773'],
      title: 'Characterise the Carrier',
      description:
        'From about 02:25:30 there is a second carrier at 1410 MHz, 4 MHz below the video and inside its band, and the C/N has gone with it. Frame it on the analyzer: 1410 MHz, 2 MHz span. Watch it for a minute against the video.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar1'],
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1410 MHz',
          params: { centerFrequency: 1410e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Carrier Seen at 1410 MHz',
          params: {
            signalId: 'INTERFERER-gw-ku-carrier',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Tell Read',
          params: {
            character: Character.SYSTEM,
            question:
              'Over a minute the SAR-1 video walked 200 kHz down the span with the Doppler. The carrier at 1410 did not move. What does that tell you about where it comes from?',
            options: [
              'It is not on the bird: a signal with no Doppler on a pass that has plenty is coming from something that is not moving relative to you - the ground',
              'It is on the bird: the transponder locks the carrier to the beacon reference, so only the video shows the Doppler',
              'It is the LNB: a local oscillator spur sits still by definition, and 1410 is a known product of the 13100 LO',
              'It is Shetland: SH-02 is tracking the same bird and its receive LO leaks back down the inter-site link',
            ],
            correctIndex: 0,
            explanation:
              'Doppler is the signature of a moving source. Everything from SAR-1 walks together; a carrier that sits still while the video moves is not coming from SAR-1, and if it is still there after LOS it is not coming from any satellite. The spectrum told you the geometry before anyone told you the frequency.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'call-the-carrier',
      nice: ['S0648', 'K0682', 'K0926'],
      title: 'Call the Carrier',
      description: 'Fiona has SAR-1 clean from Shetland. Your C/N is down 6 dB with a still carrier in the band. Look at the key status, look at the carrier, then call it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['characterise-the-carrier'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'carrier-seen',
          type: 'signal-detected',
          description: 'Carrier read on RX Analysis',
          params: {
            signalId: 'INTERFERER-gw-ku-carrier',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          id: 'key-seen',
          type: 'rx-key-status',
          description: 'RX key status read on RX Analysis',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Fault, interference, intrusion, or your own uplink',
          params: {
            character: Character.FIONA_MACLEOD,
            prompt: "I've got SAR-1 clean up here, eleven dB, no second carrier. Whatever you're seeing is yours. What is it?",
            evidence: ['carrier-seen', 'key-seen'],
            decisionOptions: [
              {
                label: 'Receive-chain fault - raise a ticket and wait for the next pass',
                correctWhen: { fact: 'equipment-fault-active', is: true },
                consequence: { log: 'Maintenance ticket raised against GW-01 RX chain (no fault found)' },
                feedback:
                  'A fault does not put a clean 1 MHz carrier at a frequency of its own choosing. The chain is doing exactly what an AGC does with a strong in-band signal.',
              },
              {
                label: 'External interference - characterise it and report it',
                correctWhen: {
                  all: [
                    { fact: 'interference-active', is: true },
                    { fact: 'equipment-fault-active', is: false },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Interference report opened: 1410 MHz IF (11690 MHz RF), 1 MHz, no Doppler, Galway only' },
              },
              {
                label: 'Intrusion on the link - escalate to CSIRT and hold the receiver',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: {
                  auditEvent: {
                    id: 'evt-op-escalation-sar1',
                    actor: 'op-duty',
                    action: 'Escalated to CSIRT: suspected intrusion on SAR-1 link (no crypto indication)',
                    category: 'access',
                    severity: 'warning',
                  },
                  log: 'CSIRT escalation raised on the SAR-1 downlink',
                },
                feedback:
                  'Your key reads Valid and every frame decodes when the carrier is not there. There is no sign of anyone on the link but you and a ground transmitter. The escalation is in the log now; it will be read later.',
              },
              {
                label: 'Own uplink transponded back - secure the HPA before the decode',
                consequence: { log: 'HPA checked: receive-only shift, nothing on the air from GW-01' },
                feedback: 'Nothing has left this station tonight. The HPA is cold and there is no uplink to transpond.',
              },
            ],
            explanation:
              'A carrier that appears mid-pass, does not Doppler, outlives the bird and is heard at one site only is a ground emitter in your band. Not a fault, not an intruder on the link, not you. It gets characterised and reported, and whoever it is gets found by people with the equipment to find them.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'open-the-incident',
      nice: ['K0946', 'K0935', 'T1580'],
      title: 'Open the Incident',
      description:
        'LOS 02:29:34 and the carrier is still there. Open the incident record: the spray and the carrier, times, what each one looks like on the console, and what has not been done to either yet.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-carrier'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Incident Opened',
          params: {
            character: Character.SYSTEM,
            question: 'Two indicators in one night, unrelated on their face. What goes in the incident record?',
            options: [
              'Both, as seen: the spray with its times and accounts, the carrier with its frequency, timing and the no-Doppler tell; no cause claimed for either',
              'The carrier only: the spray stopped under lockout and is closed; an interference report and an incident are different documents',
              'The spray only: the carrier is an RF matter for the regulator, and putting it in a security record confuses the two',
              'Both, with the link made: a spray at 01:58 and a carrier at 02:25 from the same actor probing the station two ways',
            ],
            correctIndex: 0,
            explanation:
              'An incident record is what was seen, with times. Two things happened in one night; whether they are related is a conclusion someone reaches later, from this record, and the record is worth nothing if it already contains the conclusion.',
            pointPenalty: 5,
            documentSection: 'Incident',
            documentLine:
              'INC-2027-0412-GW01 opened 02:31. (1) Password spray 01:12-01:58, one remote source, op-charlie / op-fiona / svc-legacy, 3 attempts each, stopped under lockout; svc-legacy decommissioned 14 Jan, still active. (2) Carrier 11690 MHz RF (1410 IF), ~1 MHz, from 02:25:30 through SAR-1 LOS 02:29:34 and after; no Doppler; not received at SH-02. C/N on SAR-1 video -6 dB while present. No cause claimed. Geolocation referred to specialist assets.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'flag-the-config-export',
      nice: ['S0844', 'K0682', 'K0683'],
      title: 'Flag the Configuration Export',
      description:
        'While you were writing, the log moved. 02:33: a full station-configuration export by svc-legacy - antenna, LNB LO, modem plan, contact schedule. No change ticket. Flag it and note the time.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['open-the-incident'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Configuration Export Flagged',
          params: { eventId: 'evt-config-export' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'What Was Taken',
          params: {
            character: Character.SYSTEM,
            question: 'The export succeeded on an account that failed three logins at 01:58. What has whoever holds that export got?',
            options: [
              'Enough to plan against the station: which bird is where and when, on what frequency, through which LO - the contact schedule is targeting data',
              'Nothing usable: a configuration file is hardware settings, and without the crypto keys it cannot be used for anything',
              'Only what the public pass predictors already give: satellite positions are open data, so the schedule adds nothing',
              'A copy of the audit log: the export includes the trail, so they now know what has been flagged tonight',
            ],
            correctIndex: 0,
            explanation:
              'A schedule is a list of where an antenna will point, when, and on what frequency. A frequency plan says what to transmit on to be in band. The carrier at 02:25 was already in band; whoever exported the configuration at 02:33 can be in band on every pass from now on. The station is a target, and the export is the map.',
            pointPenalty: 5,
            documentSection: 'Indicators',
            documentLine:
              '02:33 svc-legacy: full station configuration exported, no change ticket, 35 min after the failed logins on the same account. Flagged 02:34. Contents: antenna, LNB LO, modem plan, contact schedule.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'harden-the-service-account',
      nice: ['T1569', 'K0686'],
      title: 'Disable the Legacy Account',
      description: 'Flagged, timed, recorded. Now act: set svc-legacy to disabled. It was decommissioned in January; tonight it was sprayed and then used.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-config-export'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'access-control-set',
          description: 'svc-legacy Disabled',
          params: { accountId: 'svc-legacy', accountStatus: 'disabled' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why Now',
          params: {
            character: Character.SYSTEM,
            question: 'The export already happened. Why does disabling the account still matter?',
            options: [
              'Because the account is a way in that still works: the export is done, the next use is not, and the record now shows who closed it and why',
              'It does not much; the damage is the export and the account is evidence now, so it should be left as found for CSIRT',
              'Because disabling it revokes the exported configuration; the file is tied to the account that read it',
              'Because the monitoring service needs it disabled to stop logging the account; the log is filling with its polls',
            ],
            correctIndex: 0,
            explanation:
              'A door somebody has used is still a door. Disabling it does not undo the export; it ends the access. And because it was flagged and timed first, the disable has a reason attached that will still make sense at 09:00 to someone who was not here.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'retune-for-sar2',
      nice: ['S0421', 'K0773'],
      title: 'Retune for SAR-2',
      description:
        'MERIDIAN-SAR-2 rises at 02:40:01 from azimuth 137. Retune modem 1 to its 1370 MHz carrier and the analyzer to 1370 with the 40 MHz span, and let the tracker take it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['harden-the-service-account'],
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
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'decode-sar2',
      nice: ['T0153', 'K0740', 'S0421'],
      title: 'Decode the Second Downlink',
      description:
        'Retarget program-track to SAR-2, lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation segment, roughly 02:42:30 to 02:47. The carrier has gone; note whether it comes back.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-for-sar2'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'close-the-shift',
      nice: ['T1580', 'K0946', 'K0645'],
      title: 'Close the Record for the Night',
      description:
        'SAR-2 decoded clean, the carrier did not return. Close the record: what is open, what the day shift and Group Security get at 09:00, and the one thing you would do differently.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Record Closed for the Night',
          params: {
            character: Character.SYSTEM,
            question: 'What is the debrief line - the one thing tonight that changes tomorrow?',
            options: [
              'A decommissioned account was still active for three months: every decommission gets a disable on the day, checked at the monthly baseline',
              'Both passes decoded above 8 dB and nothing was lost: no change to the procedure, the incident record covers the rest',
              'The analyzer should stay on 2 MHz spans: the carrier would have been seen earlier on a narrow span than on 40 MHz',
              'Night shifts should not run receive passes alone: the carrier and the export needed two people to handle at once',
            ],
            correctIndex: 0,
            explanation:
              'The spray found an account that should not have existed; the export used it. Neither the carrier nor the spray was preventable from this console. The account was. That is the line that changes something.',
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed for the night 02:52. SAR-1 decoded to 02:25:30 then degraded by the carrier; SAR-2 decoded clean, carrier not observed. Open: interference source (referred), spray source, config export (Group Security 09:00). Action: svc-legacy disabled 02:36. Debrief: decommissioned accounts get disabled on the day; add to the monthly baseline.',
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
        <em>[Text message from Priya Sharma at 01:52]</em>
      </p>
      <p>
        "Group Security here. Your station raised three auth warnings overnight; the monitoring feed shows me the count and not the content. Read the log before your first pass. If anything on it or on the pass does not belong: flag it, note the time you saw it, then act. In that order. I will be on this number."
      </p>
      `,
      character: Character.PRIYA_SHARMA,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'flag-the-spray': {
        text: `
        <p>
          Good. Three accounts, three tries each, one source - that is somebody being careful, not somebody forgetting. Leave the account as it is for now; I want it in the record before it is touched. Fly your pass.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'call-the-carrier': {
        text: `
        <p>
          Clean up here the whole pass. If it is still there after she sets, it was never on her. Log what it did to your number - Rotterdam will want the before and after.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'open-the-incident': {
        text: `
        <p>
          That is an incident record, not a story. Two things, two times, no cause. Keep writing it that way. Do not clean anything up yet.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'harden-the-service-account': {
        text: `
        <p>
          Disabled at 02:36 with the flag behind it. Now that account tells a story someone else can read. Take your second pass; I have what I need until morning.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'close-the-shift': {
        text: `
        <p>
          Record received. The interference goes to people with direction-finding kit; the account and the export stay with me. You looked before you touched. Sleep well.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
