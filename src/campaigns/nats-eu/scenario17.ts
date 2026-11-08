import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 *                   northbound. C/N >= 8 dB roughly 02:22:30 .. 02:27:00 clean; the carrier
 *                   (below) dents it from about 02:25.
 *   MERIDIAN-SAR-2: AOS T+40.02 (02:40:01Z, az 137), max el 26.3 deg at T+44.76
 *                   (02:44:46Z, 809 km), LOS T+49.50 (02:49:30Z, az 354), 9.5 min,
 *                   northbound. C/N >= 8 dB roughly 02:42:30 .. 02:47:00.
 *
 * The carrier: settings.interferenceEvents 'gw-ku-carrier', terrestrial path,
 * emitter 22 km south-west of Galway, 11690 MHz (IF 1410, 4 MHz below the
 * SAR-1 video at 1414 and inside its 36 MHz occupied band), 1 MHz wide, on
 * for 510 s from 120 s after 'characterise-the-carrier' opens (about 02:25Z
 * for a player who decodes by 02:23, after the 02:24:46 culmination), so it runs through LOS (phase 19.0a anchor). Terrestrial
 * emissions reach the antenna directly, so it stays on the analyzer after the
 * bird has set, and it never drifts: two diagnostic tells the characterise
 * objective quizzes. Shetland never hears it.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on the 1370 MHz
 * SAR-2 carrier from the evening's last contact; analyzer still framed on that
 * carrier (1370 / 60 MHz); tracker parked where the evening left it. Receive only: no
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
// The analyzer is still framed on that SAR-2 job (1370 MHz, 60 MHz span):
// the SAR-1 framing is the player's to do (phase 27 B1)
galwayNight.spectrumAnalyzers![0] = { ...galwayNight.spectrumAnalyzers![0], centerFrequency: 1370e6 as Hertz };

export const natsEuScenario17Data: ScenarioData = {
  id: 'nats-eu-scenario17',
  url: 'nats-eu/scenarios/nats-eu-scenario17',
  imageUrl: 'nats-eu/17/card.png',
  number: 17,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario16'],
  title: 'Unusual Activity',
  subtitle: 'First Indicators (Gray Zone 1/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `02:00, Galway, night shift. Two routine receive passes are on the board, SAR-1 at 02:20 and SAR-2 at 02:40, and nothing else, except a text from Group Security that arrived at 01:52 and doesn't say much.<br><br>The overnight log holds three failed-login bursts, and the SAR-1 pass will have something odd in it too. None of it is attributed and none of it is loud. Priya Sharma's rule for the night is the whole lesson: look, flag, note the time, then act, in that order.`,
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
    // Phase 19.0a: it keys up 120 s after 'characterise-the-carrier' opens
    // instead of at a fixed 1530 s. At 1530 it dented C/N under the 8 dB
    // decode-sar1 needs, and anyone who reached the carrier objective after
    // it went off the air (2040 s) was stuck.
    interferenceEvents: [
      {
        id: 'gw-ku-carrier',
        frequency: 11690e6,
        bandwidth: 1e6,
        // EIRP dBm. ~140 dB of path loss over 24 km at 11.69 GHz through a far
        // sidelobe puts it near the video's level at the feed: a plain dent.
        power: 52,
        polarization: 'V',
        startAfterObjectiveId: 'characterise-the-carrier',
        startTime: 120,
        duration: 510,
        periodSeconds: 510,
        onSeconds: 510,
        path: 'terrestrial',
        emitter: { latitude: 53.12, longitude: -9.32 },
      },
    ],

    // M6 - the overnight log. Routine traffic, three failed-login bursts inside
    // an hour (01:12, 01:40, 01:58) against three different accounts (the spray; the third one
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
          // Phase 19.0a: logged 25 s into 'flag-the-config-export' (was a fixed
          // 1980 s, which timed out anyone who opened the objective before 1800)
          startAfterObjectiveId: 'flag-the-config-export',
          timeS: 25,
          timestampLabel: '{{at:obj:flag-the-config-export:start+25s|02:26}} UTC',
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
      description:
        "Open the shift brief. It covers two receive passes, a text from Group Security, and Priya's rule for anything that doesn't belong: look, flag, note the time, then act.",
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
            question: "Priya's rule is look, flag, note the time, then act. Why shouldn't you disable the account first, before anything else?",
            options: [
              'Acting first destroys the record of what was seen and when, so the flag and the time come before any action',
              'Disabling an account at night needs Group Security approval, so flagging comes first within the operator authority',
              "The console won't accept an access-control change until the audit log has been marked as reviewed for the shift",
              'Acting first is fine for a service account, because the rule only covers named user accounts, which need a witness',
            ],
            correctIndex: 0,
            explanation:
              "If you act before you flag, someone has to reconstruct what happened from memory later. The flag and the time you saw it are the start of the incident record, and the action is what that record justifies. SAR-1 is twenty minutes away, so there's time to do this properly.",
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
      description: "Check the dashboard for active alarms on GW-01 before you read anything into the night's events.",
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
              'RX AGC on noise only: no carrier on an empty sky, and no hardware alarm',
              'No active alarms: all systems nominal and the board clear for the night',
              'Security console alert: three failed logins have raised a station alarm',
              'LNB reference unlocked: a hardware alarm left by the evening shift',
            ],
            correctIndex: 0,
            explanation:
              "The AGC, the automatic gain control, shows a no-carrier warning because the sky is empty. That's a normal state, not a fault. The failed logins are in the audit log rather than on the alarm board, because the board watches hardware and the log watches people. You'll read both tonight.",
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
      description: 'Check that the GPSDO is locked and out of holdover. Every reading tonight is only as good as the reference behind it.',
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
        'Modem 1 is still on the 1370 MHz SAR-2 carrier from the 23:52 contact. Retune it to 1414 MHz, then center the analyzer on 1414 MHz with a 60 MHz span, wide enough to hold the video, the 1389 MHz beacon and the Doppler shift.',
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
          description: 'Analyzer Span 60 MHz',
          params: { span: 60e6, frequencyTolerance: 5e6 },
          // 60 MHz is the station's default span: the centre row is the action (phase 27 B1)
          requiresChange: false,
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
        'Open the Security console, read the trail from the evening handover to now, and sign off the review. There are three warning entries inside an hour, so read them as a set before you read them one at a time.',
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
              'The log shows three failed logins against C. Brooks at 01:12, three against F. MacLeod at 01:40 and three against the legacy telemetry bridge at 01:58, all from one remote source and each stopping at three. What is that?',
            options: [
              'A spray: one source trying a few passwords on many accounts, stopping under the lockout so each looks minor',
              'Three coincidences: a site lead, an operator and a service account each mistyped a password, and the events are unrelated',
              'A lockout test: the monitoring service probing three accounts on schedule to confirm the three-attempt policy',
              'A brute force: one account hit repeatedly until the lockout, and then the attacker moved on',
            ],
            correctIndex: 0,
            explanation:
              "A spray means a few attempts per account, many accounts, one source, and stopping just under the lockout. It's designed to look like three unrelated warnings, and the logger did record it as three entries. Seeing them as one pattern is the finding.",
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
      description: "Flag the 01:58 entry against svc-legacy, an account decommissioned in January that still answers, and note the time you saw it. Don't touch the account yet.",
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
            question: 'The account is decommissioned, still active and has just been tried. Why flag it and note the time before disabling it?',
            options: [
              'The flag and the time seen are the first lines of the incident record; disabling first leaves a change unexplained',
              'Disabling it might alert whoever is trying, so leaving it active for the night keeps them from noticing anything',
              "A decommissioned account can't be disabled from the console, so the request has to go through the monitoring service",
              'The flag is for Group Security to decide on the account, because the operator has no authority over service accounts',
            ],
            correctIndex: 0,
            explanation:
              'The order protects the record: the entry is seen and flagged first, with the time, and only then disabled with a reason attached. Disable it with no flag behind it, and nobody can explain the change at 09:00. Nobody is leaving a door open on purpose.',
            pointPenalty: 5,
            documentSection: 'Indicators',
            documentLine:
              'Overnight log: password spray from one remote source, 01:12 / 01:40 / 01:58, three accounts x three attempts, stopping under lockout. svc-legacy (decommissioned 14 Jan) still active and targeted. Flagged {{at:security:evt-spray-legacy:flagged|02:09}}.',
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
      description:
        'SAR-1 rises at 02:20:00 from azimuth 187. Park the tracker at azimuth 187 and 5 degrees elevation, so the slew is finished before the satellite is over the horizon.',
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
      description: 'Put SAR-1 on program-track before 02:20, then confirm the 1389 MHz beacon on RX Analysis.',
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
      description: 'Lock the 1414 MHz imagery carrier and hold C/N above 8 dB through the high-elevation part of the pass, roughly 02:22:30 to 02:25.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
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
        'About two minutes after this objective opens, a second carrier will key up at 1410 MHz, 4 MHz below the video and inside its band. It will dent the C/N by about 4 dB at onset, enough to take the decode under 8 dB. Set the analyzer to 1410 MHz with a 2 MHz span, then watch the new carrier against the video.',
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
              'Watch the carrier at 1410 MHz for a few seconds. It sits still on the analyzer, where a carrier from the bird would have shifted with the Doppler. What does that tell you about where it comes from?',
            options: [
              'It is not on the bird: a signal with no Doppler on a pass that has plenty comes from something fixed on the ground',
              'It is on the bird: the transponder locks the carrier to the beacon reference, so only the video shows the Doppler',
              'It is the LNB: a local oscillator spur sits still by definition, and 1410 MHz is a known product of the 13100 MHz LO',
              'It is Shetland: SH-02 is tracking the same bird, and its receive LO leaks back down the inter-site link',
            ],
            correctIndex: 0,
            explanation:
              "Doppler comes from a moving source, and everything from SAR-1 shifts together. A carrier that sits still on a pass with plenty of Doppler isn't coming from SAR-1. If it's still on the air after LOS, it isn't coming from any satellite, which puts it on the ground.",
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
      description:
        "Fiona has SAR-1 clean from Shetland, so the problem is on your side. Your C/N is down about 4 dB, below the 8 dB delivery line, and a carrier that doesn't move is sitting in the band. Read the carrier and the key status on RX Analysis, then make the call.",
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
            prompt: "I've got SAR-1 clean up here at eleven dB, with no second carrier, so whatever you're seeing is on your side. What is it?",
            evidence: ['carrier-seen', 'key-seen'],
            decisionOptions: [
              {
                label: 'Receive-chain fault - raise a ticket and wait for the next pass',
                correctWhen: { fact: 'equipment-fault-active', is: true },
                consequence: { log: 'Maintenance ticket raised against GW-01 RX chain (no fault found)' },
                feedback:
                  "A fault doesn't put a clean 1 MHz carrier at a frequency of its own choosing. The receive chain is doing exactly what its AGC does with a strong in-band signal, so there's nothing to repair.",
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
                  "Your key reads Valid, and every frame decodes when the carrier isn't there. Nothing suggests anyone is on the link except you and a ground transmitter. The escalation is in the log now, and someone will read it later.",
              },
              {
                label: 'Own uplink transponded back - secure the HPA before the decode',
                consequence: { log: 'HPA checked: receive-only shift, nothing on the air from GW-01' },
                feedback: "Nothing has left this station tonight. The HPA is cold, so there's no uplink to transpond back.",
              },
            ],
            explanation:
              "A carrier that appears mid-pass, doesn't shift with Doppler, outlives the satellite and is heard at one site only is a ground emitter in your band. It isn't a fault, an intruder on the link or your own uplink. It gets characterised and reported, and people with direction-finding equipment can then look for whoever is behind it.",
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
        "The carrier is still on the air and SAR-1 will be gone in minutes, so open the incident record now. Include the spray and the carrier, with times, what each one looks like on the console, and what hasn't been done about either yet.",
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
              'Both, as seen: the spray with its times and accounts, the carrier with its frequency and timing, and no cause claimed',
              'The carrier only: the spray stopped under the lockout and is closed, and an interference report is a different document',
              "The spray only: the carrier is an RF matter for the regulator, and a security record shouldn't be mixed with it",
              'Both, with the link made: a spray at 01:58 and a carrier at {{at:event:gw-ku-carrier:start|02:25}} from one actor probing two ways',
            ],
            correctIndex: 0,
            explanation:
              "An incident record holds what was seen, with times. Two things happened in one night, and whether they're related is a conclusion someone can reach later from this record. A record that already contains the conclusion is no use for reaching it.",
            pointPenalty: 5,
            documentSection: 'Incident',
            documentLine:
              'INC-2027-0412-GW01 opened {{at:obj:open-the-incident:start|02:25}}. (1) Password spray 01:12-01:58, one remote source, op-charlie / op-fiona / svc-legacy, 3 attempts each, stopped under lockout; svc-legacy decommissioned 14 Jan, still active. (2) Carrier 11690 MHz RF (1410 IF), ~1 MHz, from {{at:event:gw-ku-carrier:start:s|02:25:10}} still on the air as SAR-1 set toward LOS 02:29:34; no Doppler; not received at SH-02. C/N on SAR-1 video down about 4 dB at onset, below the 8 dB delivery line; lock lost a minute or two later. No cause claimed. Geolocation referred to specialist assets.',
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
        'Watch the Security console for a new entry from svc-legacy: a full station-configuration export covering the antenna, LNB LO, modem plan and contact schedule, with no change ticket. When it appears, flag it and note the time.',
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
            question: 'The export succeeded on an account that failed three logins at 01:58. What does whoever holds that export have?',
            options: [
              'Enough to plan against the station: which satellite is where, when, on what frequency and through which LO',
              "Nothing usable: a configuration file is only hardware settings, and without the crypto keys it can't be used for anything",
              'Only what the public pass predictors already give: satellite positions are open data, so the schedule adds nothing',
              'A copy of the audit log: the export includes the trail, so they now know what has been flagged tonight',
            ],
            correctIndex: 0,
            explanation:
              'A schedule lists where an antenna will point, when, and on what frequency, and a frequency plan says what to transmit on to be in band. The carrier at {{at:event:gw-ku-carrier:start|02:25}} was already in band. Whoever exported the configuration at {{at:obj:flag-the-config-export:start+25s|02:26}} could be in band on every pass from now on, which makes the export a map of the station.',
            pointPenalty: 5,
            documentSection: 'Indicators',
            documentLine:
              '{{at:obj:flag-the-config-export:start+25s|02:26}} svc-legacy: full station configuration exported, no change ticket, about half an hour after the failed logins on the same account. Flagged {{at:security:evt-config-export:flagged|02:34}}. Contents: antenna, LNB LO, modem plan, contact schedule.',
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
      description:
        "You've flagged it, timed it and recorded it, so now act: set svc-legacy to disabled. It was decommissioned in January, and tonight it was sprayed and then used.",
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
            question: 'The export has already happened. Why does disabling the account still matter?',
            options: [
              "Because the account is a way in that still works: the export is done, but the next use isn't",
              "It doesn't matter much: the damage is the export, so the account should be left active and as found for CSIRT",
              'Because disabling it revokes the exported configuration, since the file is tied to the account that read it',
              'Because the monitoring service needs it disabled to stop logging the account, as the log is filling with its polls',
            ],
            correctIndex: 0,
            explanation:
              "Disabling the account doesn't undo the export, but it ends the access. A door somebody has used is still a door. Because you flagged and timed it first, the disable also has a reason attached that'll make sense at 09:00 to someone who wasn't here.",
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
        'MERIDIAN-SAR-2 rises at 02:40:01 from azimuth 137. Retune modem 1 to its 1370 MHz carrier, set the analyzer to 1370 MHz with the 60 MHz span, and let the tracker follow the satellite up.',
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
        'Switch program-track to SAR-2, lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation part of the pass, roughly 02:42:30 to 02:47. The 1410 MHz carrier should be off the air by now, so note whether it comes back.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'interference-event-ended',
          description: '1410 MHz Carrier Off the Air',
          params: { interferenceEventId: 'gw-ku-carrier' },
          mustMaintain: false,
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
        "SAR-2 decoded clean and the carrier didn't return. Close the record with what is still open, what the day shift and Group Security get at 09:00, and the one thing you'd do differently.",
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
            question: 'What is the debrief line, the one thing tonight that changes tomorrow?',
            options: [
              'A decommissioned account stayed active for three months, so every decommission gets disabled on the day and checked monthly',
              "Both passes decoded above 8 dB and nothing was lost, so the procedure doesn't change and the incident record covers the rest",
              'The analyzer should stay on 2 MHz spans, because a narrow span would have shown the carrier earlier than the 60 MHz span did',
              "Night shifts shouldn't run receive passes alone, because the carrier and the export needed two people to handle at once",
            ],
            correctIndex: 0,
            explanation:
              "The spray found an account that shouldn't have existed, and the export used it. Nothing at this console could have prevented the carrier or the spray, but the account could have been closed in January. That makes it the line that changes something.",
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed for the night {{at:cond:close-the-shift.0|02:52}}. SAR-1 decoded to {{at:event:gw-ku-carrier:start|02:25}} then degraded by the carrier; SAR-2 decoded clean, carrier not observed. Open: interference source (referred), spray source, config export (Group Security 09:00). Action: svc-legacy disabled {{at:account:svc-legacy:disabled|02:36}}. Debrief: decommissioned accounts get disabled on the day; add to the monthly baseline.',
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
        "This is Group Security. Your station raised three failed-login warnings overnight, and the monitoring feed only shows me the count, not what's in them. Read the log before your first pass. If anything in it, or on the pass, doesn't belong, flag it, note the time you saw it, and then act. In that order. I'll be on this number."
      </p>
      `,
      character: Character.PRIYA_SHARMA,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/intro.mp3'),
    },
    objectives: {
      'flag-the-spray': {
        text: `
        <p>
          Good. Three accounts, three tries each and one source is someone being careful, not someone forgetting a password. Leave the account as it stands for now, because I want it in the record before anyone touches it. Your first pass is next, so get the antenna ready.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/obj-flag-the-spray.mp3'),
      },
      'call-the-carrier': {
        text: `
        <p>
          Good call. SAR-1 has stayed clean at Shetland, so whatever that carrier is, it's only hitting your site. Write down what it did to your C/N, because Rotterdam will want the before and after. My GNSS antenna's been flaky in the wind all week, so I'd half expected tonight's trouble to be at my end.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/obj-call-the-carrier.mp3'),
      },
      'open-the-incident': {
        text: `
        <p>
          That's an incident record, not a story: two things, two times, and no cause. Keep the console open, because I want to know if anything else moves. Do not clean anything up yet, because the record has to show it as you found it.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/obj-open-the-incident.mp3'),
      },
      'harden-the-service-account': {
        text: `
        <p>
          Disabled, with the flag behind it, so anyone reading that account's history will see why it was closed. SAR-2 is your next pass. I have what I need until morning.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/obj-harden-the-service-account.mp3'),
      },
      'close-the-shift': {
        text: `
        <p>
          Record received. The interference goes to people with direction-finding equipment, who can locate a transmitter. The account and the export stay with me. You looked before you touched anything, and that's the order I wanted. Sleep well.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/17/obj-close-the-shift.mp3'),
      },
    },
  },
};
