import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 6 - "Watch the Watchers" / Station Security Baseline
 *
 * New mechanic: M6 SOC-lite security console. Deliberately NOT a SOC: the
 * console does log review, event disposition, and account state. No IDS, no
 * packet capture, no firewall - a ground-station operator's security hygiene,
 * which is what the NICE work roles this scenario claims actually describe.
 *
 * Phase 16 rewrite: the baseline is done around a routine shift, not instead
 * of one. The operator sweeps the station, sets up the receiver, reads the
 * audit trail end to end and dispositions two warning-severity entries that
 * turn out to be benign, works the SAR-1 downlink, then after LOS flags the
 * one entry that is a finding, closes the contractor account, expires a
 * lapsed relief account, retunes for SAR-2, decodes it, and files the return.
 *
 * The audit log mixes routine traffic with three warning-severity entries:
 * Fiona's first remote login from the new SH-02 address (benign), a scheduled
 * poll-interval change by the monitoring service (benign, change ticket), and
 * off-hours authentication failures against a maintenance contractor account
 * left active after the install window closed (the finding). Nothing was
 * breached. The lesson is that "nothing happened" is a conclusion you reach by
 * looking, that severity is a hint and not a verdict, and that a dormant
 * over-privileged account is a finding whether or not it was used.
 *
 * The 'evt-replay' critical event is intentionally NOT in this scenario - the
 * replayed-command thread belongs to the Phase 3 adversary arc (S17, S21), and
 * pulling it forward would spend it.
 *
 * Clock: sim starts 2027-03-15 13:45:00 UTC. MERIDIAN-SAR-1: AOS 14:03:10 az
 * 000, max el 28.0 at 14:06:45 (761 km), LOS 14:10:18; C/N >= 8 dB roughly
 * 14:05:00 .. 14:08:30. MERIDIAN-SAR-2: AOS 14:18:42 az 130, max el 25.0 at
 * 14:22:10, LOS 14:25:40; C/N >= 8 dB roughly 14:20:30 .. 14:24:00.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 left on the
 * 1370 MHz SAR-2 carrier from the morning's test, as the audit log records.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0685: Knowledge of system administration concepts
 *   - K0686: Knowledge of account management
 *   - T1569: Perform account management
 *
 * Supporting Codes:
 *   - S0844: Skill in auditing system activity
 *   - K0645: Knowledge of standard operating procedures
 *   - S0421: Skill in operating network equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T1580: Report service status to stakeholders
 */

/** GW-01 as the morning left it: modem 1 on the SAR-2 test carrier. Deep clone, never spread. */
const galwayBaseline: GroundStationConfig = structuredClone(galwayGroundStation);
galwayBaseline.receivers![0].modems![0] = {
  ...galwayBaseline.receivers![0].modems![0],
  frequency: 1370 as MHz,
};

export const natsEuScenario6Data: ScenarioData = {
  id: 'nats-eu-scenario6',
  url: 'nats-eu/scenarios/nats-eu-scenario6',
  imageUrl: 'nats/6/card.png',
  number: 6,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario5'],
  title: 'Watch the Watchers',
  subtitle: 'Station Security Baseline',
  duration: '35-40 min',
  missionType: 'Security Operations',
  description: `Quiet shift. Two routine downlinks on the plan and a monthly item nobody enjoys: the station security baseline.<br><br>Every console action at GW-01 is logged - logins, configuration changes, command traffic. Once a month somebody actually reads it. Group Security in London reads it too, eventually, but they read it a fortnight later and from four hundred miles away.<br><br>Charlie's guidance is characteristically brief: "You'll find nothing. Find it properly. And do not miss the pass while you are finding it."`,
  equipment: ['GW-01 Galway: 4m Ku-Band LEO Tracker', 'Security Console (audit log + access control)', 'Spectrum Analyzer', 'RX Modem with Video Decoder'],
  settings: {
    isSync: true,
    groundStations: [galwayBaseline, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-6?content-only=true&dark=true',

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
      title: 'GW-01 March Baseline Return',
      description:
        'Monthly security baseline for Group Security (ref GS-BASELINE-GW01-03). Every warning-severity entry dispositioned; every account reconciled against current authorisation.',
    },

    // M6 - routine traffic plus three warning-severity entries to disposition:
    // two benign (Fiona's first login from the new SH-02 address, the
    // monitoring service's scheduled poll-interval change) and one finding
    // (off-hours auth failures against the contractor account, still active
    // three weeks after the install window). One live entry lands during the
    // shift so the log is seen to be live.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'op-guest', name: 'Kilbride Antenna Services (contractor)', role: 'Maintenance', status: 'active' },
        { id: 'op-relief', name: 'T. Nakamura (Vermont secondment, ended 28 Feb)', role: 'Relief Operator', status: 'active' },
      ],
      events: [
        {
          id: 'evt-relief-logout',
          timeS: 0,
          timestampLabel: '27 Feb 16:40 UTC',
          actor: 'op-relief',
          action: 'Console logout (end of secondment)',
          category: 'auth',
          severity: 'info',
        },
        {
          id: 'evt-authfail',
          timeS: 0,
          timestampLabel: '02:47 UTC',
          actor: 'op-guest',
          action: 'Repeated failed logins (off-hours, 6 attempts)',
          category: 'auth',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-svc-interval',
          timeS: 0,
          timestampLabel: '03:00 UTC',
          actor: 'svc-monitor',
          action: 'Configuration change: telemetry poll interval 30 -> 15 min (change ticket CHG-0412)',
          category: 'config',
          severity: 'warning',
        },
        { id: 'evt-login-charlie', timeS: 0, timestampLabel: '06:02 UTC', actor: 'op-charlie', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-cfg-rx',
          timeS: 0,
          timestampLabel: '06:14 UTC',
          actor: 'op-charlie',
          action: 'Set receiver 1 frequency 1370 MHz (SAR-2 loopback test)',
          category: 'config',
          severity: 'info',
        },
        {
          id: 'evt-login-fiona',
          timeS: 0,
          timestampLabel: '06:30 UTC',
          actor: 'op-fiona',
          action: 'Console login (SH-02 remote) - first login from a new source address',
          category: 'auth',
          severity: 'warning',
        },
        {
          id: 'evt-cmd-playback',
          timeS: 0,
          timestampLabel: '07:11 UTC',
          actor: 'op-charlie',
          action: 'TT&C command REC-PLAYBACK acknowledged',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-svc-poll', timeS: 0, timestampLabel: '07:30 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        { id: 'evt-keyrotate', timeS: 0, timestampLabel: '08:05 UTC', actor: 'op-charlie', action: 'COMSEC key rotation completed', category: 'command', severity: 'info' },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '13:44 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-fiona-tune',
          timeS: 900,
          timestampLabel: '14:00 UTC',
          actor: 'op-fiona',
          action: 'Set receiver 1 frequency 1414 MHz (SH-02)',
          category: 'config',
          severity: 'info',
        },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'S0844'],
      title: 'Review the Baseline Task',
      description: 'Open the shift brief and confirm what the monthly baseline actually requires, and when the passes are.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Baseline Task Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Scope Understood',
          params: {
            character: Character.SYSTEM,
            question: 'What does the March return require from GW-01?',
            options: [
              'The whole audit trail read since the last return, every warning-severity entry dispositioned, and every account reconciled against current authorisation',
              'A search of the log for failed logins',
              'A list of active accounts',
              'Nothing unless something happened this month',
            ],
            correctIndex: 0,
            explanation:
              'Read everything, disposition every warning, reconcile every account. "Nothing happened" is a conclusion, not an assumption. First pass at 14:03; the log will keep, the pass will not.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: STATION SWEEP AND RECEIVER SET-UP
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Clear the board before the baseline: confirm the active alarm state on GW-01.',
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
            question: 'What is the active alarm state on GW-01 at turnover?',
            options: [
              'RX AGC at max gain (weak signal) - empty sky, not a fault; no hardware alarms',
              'No active alarms - all systems nominal',
              'Security console: unacknowledged anomaly',
              'GPSDO in holdover',
            ],
            correctIndex: 0,
            explanation:
              'The only entry is the receive AGC at its rail: empty sky, not a fault. The security console does not raise dashboard alarms; that is exactly why somebody has to read it.',
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
      description: 'GPSDO locked and out of holdover before the pass.',
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
        'Charlie left modem 1 on the 1370 MHz SAR-2 carrier this morning - the log says so. Retune it to 1414 MHz and put the analyzer on the 1389 MHz beacon with a 2 MHz span.',
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
          description: 'Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // THE BASELINE, PART 1: READ THE TRAIL, DISPOSITION THE BENIGN
    // ============================================================
    {
      id: 'read-the-audit-log',
      nice: ['S0844', 'K0685'],
      title: 'Read the Station Audit Log',
      description:
        'Open the Security console and read the audit log end to end, then sign off the review. Routine traffic is most of it; that is what makes the exceptions findable.',
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
          description: 'Audit Log Reviewed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Routine Recognised',
          params: {
            character: Character.SYSTEM,
            question: 'Three entries carry warning severity. How many of them are findings?',
            options: [
              'You do not know yet - severity is a hint from the logger, and each one has to be dispositioned on who, what and when',
              'All three - warning means finding',
              'None - nothing was breached',
              'One - only failed authentications count',
            ],
            correctIndex: 0,
            explanation:
              'The logger scores rarity; you score meaning. Fiona from a new address, a service account changing its own poll interval, and six failed logins at 02:47 are three different things.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'disposition-new-address',
      nice: ['S0844', 'K0686'],
      title: 'Disposition the New-Address Login',
      description: "Fiona's 06:30 login from SH-02 tripped the new-source-address rule. Flag it for the return with its disposition, then decide what it is.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-audit-log'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'New-Address Login Dispositioned',
          params: { eventId: 'evt-login-fiona' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Benign or Finding',
          params: {
            character: Character.SYSTEM,
            question: 'op-fiona, 06:30, console login from a source address the station has never seen. Finding?',
            options: [
              'Benign: SH-02 went operational this week and its address is new to the rule; the account, the hour and the site register all agree - note it, no action',
              'Finding: any unknown source address is an intrusion attempt',
              'Finding: operators must not log in remotely',
              'Ignore it: successful logins are never findings',
            ],
            correctIndex: 0,
            explanation:
              'Expected, explained, and checkable against the site register. A rule that fires once for a new site is doing its job; the disposition says so and the rule will not fire for Shetland again.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'disposition-poll-change',
      nice: ['S0844', 'K0685'],
      title: 'Disposition the Poll-Interval Change',
      description: 'The monitoring service changed its own telemetry poll interval at 03:00. Flag it for the return with its disposition.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['disposition-new-address'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Poll-Interval Change Dispositioned',
          params: { eventId: 'evt-svc-interval' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Benign or Finding',
          params: {
            character: Character.SYSTEM,
            question: 'svc-monitor, 03:00, configuration change to its own poll interval, referencing change ticket CHG-0412. Finding?',
            options: [
              'Benign: a service account making a scheduled change to its own configuration at its scheduled time, with a ticket - verify the ticket, note it',
              'Finding: service accounts must never change configuration',
              'Finding: 03:00 is off-hours for any actor',
              'Benign: config entries are never findings',
            ],
            correctIndex: 0,
            explanation:
              'Who, what, when: the right actor doing the thing it exists to do, when the ticket said. Off-hours is a property of people, not of a scheduler. The ticket is the evidence; the return cites it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: THE ROUTINE PASS
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'The baseline pauses for the pass. Program-track SAR-1 before 14:03 and confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['disposition-poll-change'],
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
      description: 'Lock the 1414 MHz imagery carrier and hold C/N above 8 dB through the high-elevation segment, roughly 14:05 to 14:08.',
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

    // ============================================================
    // BEAT 4 / THE BASELINE, PART 2: THE FINDING AND THE ROSTER
    // ============================================================
    {
      id: 'flag-the-off-hours-failures',
      nice: ['S0844', 'K0686'],
      title: 'Flag the Off-Hours Failures',
      description:
        "LOS. Back to the trail: six failed logins at 02:47 against the antenna contractor's account, hours after any maintenance window and three weeks after the install closed. Flag it so Group Security sees it in this month's return.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar1'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Off-Hours Auth Failures Flagged',
          params: { eventId: 'evt-authfail' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Finding Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'op-guest, 02:47, six failed logins, none succeeded. Finding?',
            options: [
              'Finding: an account that should no longer exist, at an hour nobody authorised should be trying it - the exposure and the attempt are both reportable, whether or not anything got in',
              'Benign: unsuccessful attempts are noise',
              'Benign: the contractor probably forgot their password',
              'Finding only if it happens again',
            ],
            correctIndex: 0,
            explanation:
              'Who should not have an account, what looks like a guess sequence, when nobody is on site. You report the exposure and the attempt, not just the damage. Flag first, note the time you saw it, then act on the account.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'close-the-contractor-account',
      nice: ['K0686', 'T1569'],
      title: 'Close the Contractor Account',
      description:
        'Kilbride Antenna Services finished the feed work three weeks ago and their account is still active. Set it to disabled in the access-control panel. Nothing was breached - and that is not a reason to leave it open.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-off-hours-failures'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'access-control-set',
          description: 'Contractor Account Disabled',
          params: { accountId: 'op-guest', accountStatus: 'disabled' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Least Privilege',
          params: {
            character: Character.SYSTEM,
            question: 'The account was never used after the install. Why disable it rather than leave it for the next feed job?',
            options: [
              'An account that exists can be attacked; one that is needed again can be re-enabled in a minute. Privilege should match current need, not future convenience.',
              'Because the contractor was caught attempting access',
              'Because maintenance accounts expire automatically after 30 days',
              'It should not be disabled; the return only requires it be noted',
            ],
            correctIndex: 0,
            explanation: 'Least privilege is a habit, not a response. The install phase leaves things behind; the baseline is where they get picked up.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'expire-the-relief-account',
      nice: ['K0686', 'T1569', 'K0685'],
      title: 'Expire the Relief Account',
      description:
        "T. Nakamura's Vermont secondment ended on 28 February and the last entry under op-relief is a logout the day before. The account is still active. Set it to expired, so a return visit has to be re-authorised through London rather than walking back in.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['close-the-contractor-account'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'access-control-set',
          description: 'Relief Account Expired',
          params: { accountId: 'op-relief', accountStatus: 'expired' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Expired vs Disabled',
          params: {
            character: Character.SYSTEM,
            question: 'Why expire the relief account rather than disable it like the contractor?',
            options: [
              'Expired records that the authorisation lapsed and forces re-authorisation before any use; disabled is a deliberate shut-off. Same effect today, different story in the return.',
              'Expired keeps the login working in case they come back',
              'Disabled is only for contractors',
              'There is no difference; either is fine',
            ],
            correctIndex: 0,
            explanation:
              'The status is part of the record. Somebody reading the roster in six months should be able to tell a lapsed secondment from a closed contractor without asking you.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 5 -> BEATS 2-3: THE SECOND DOWNLINK
    // ============================================================
    {
      id: 'retune-for-sar2',
      nice: ['S0421', 'K0773'],
      title: 'Retune for SAR-2',
      description: 'MERIDIAN-SAR-2 rises at 14:18 from azimuth 130. Retune modem 1 to its 1370 MHz carrier and the analyzer to its 1397 MHz beacon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['expire-the-relief-account'],
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
          description: 'Analyzer Centre 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
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
      description: 'Retarget program-track to SAR-2, lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation segment, roughly 14:20:30 to 14:24.',
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

    // ============================================================
    // BEAT 4: FILE THE RETURN
    // ============================================================
    {
      id: 'close-the-baseline',
      nice: ['S0844', 'T1580', 'K0685'],
      title: 'Close the Baseline',
      description: "Record the month's findings and their dispositions for the return. Two passes decoded while you did it.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Baseline Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'The failed logins never succeeded and nothing was taken. Why is this still a finding worth reporting?',
            options: [
              'A dormant account with maintenance privileges is exposure regardless of outcome - and somebody was trying it at 02:47.',
              'It is not; unsuccessful attempts are noise and should be filtered out.',
              'Because the contractor breached their contract by attempting access.',
              'Only because Group Security requires at least one finding per return.',
            ],
            correctIndex: 0,
            explanation:
              'You report the exposure and the attempt, not just the damage. Baseline closed: trail read, three warnings dispositioned, two accounts reconciled, two passes decoded.',
            pointPenalty: 5,
            documentSection: 'Findings',
            documentLine:
              'Audit trail read end to end and signed off. evt-login-fiona 06:30: benign, first SH-02 remote login. evt-svc-interval 03:00: benign, CHG-0412. evt-authfail 02:47: FINDING, six failed logins against op-guest (Kilbride, install closed 3 weeks); account disabled. op-relief: authorisation lapsed 28 Feb; account expired. Passes 14:03 SAR-1 and 14:18 SAR-2 decoded, no impact.',
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
        <em>[Text message from Charlie Brooks at 13:44]</em>
      </p>
      <p>
        "Quiet one. SAR-1 at 14:03 and SAR-2 at 14:18, both routine downlinks that need nothing from you beyond doing them properly. The item that actually needs you is the monthly security baseline, which nobody enjoys and which I want done properly too. Every console action at this site is logged. Once a month somebody reads all of it. This month that is you. You'll find nothing. Find it properly. And do not miss the pass while you are finding it."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'read-the-audit-log': {
        text: `
        <p>
          <em>[Memo from Priya Sharma, NATS Group Security, ref GS-BASELINE-GW01-03]</em>
        </p>
        <p>
          "Monthly return for GW-01 is due by close of business Friday. Standard scope: full audit-trail review since the last return, every warning-severity event dispositioned, and an account roster reconciled against current authorisation. Anything flagged, tell us what it was and what you did about it. Anything not flagged, we assume you looked. A note for new sites: the install phase leaves things behind."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'disposition-new-address': {
        text: `
        <p>
          That one is Fiona. The rule has never seen Shetland's address because Shetland did not exist last month. Write down why it is fine; "it is fine" on its own is what people write when they did not look.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'disposition-poll-change': {
        text: `
        <p>
          Service account changing its own poll interval at three in the morning with a change ticket on it. That is a scheduler doing what schedulers do. Cite the ticket and move on.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-sar1': {
        text: `
        <p>
          Pass first. The log has been sitting there since six this morning; it will keep for ten minutes. The bird will not.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'decode-sar1': {
        text: `
        <p>
          Routine is the point. Every action you just took went into the trail you are auditing - program-track, modem lock, the lot. Next month somebody reads those and decides whether they were you.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'flag-the-off-hours-failures': {
        text: `
        <p>
          <em>[Text message from Priya Sharma at 14:11]</em>
        </p>
        <p>
          "Charlie says you have something on the contractor account. Do not clean it up yet. Flag the entry, note the time you saw it, then disable the account. The order matters to me later."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'close-the-contractor-account': {
        text: `
        <p>
          Kilbride did a good job on the feed and I would have them back tomorrow. That is a reason to re-enable the account tomorrow, not a reason to leave it open tonight.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'expire-the-relief-account': {
        text: `
        <p>
          Nakamura covered for me in February and went home on the twenty-eighth. Nobody closed the account because nobody's job was to close the account. That is what the roster reconciliation is for. Expired, not disabled: the story is different and the return should say so.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'decode-sar2': {
        text: `
        <p>
          Second one decoding. A baseline that cost the station a pass would not be a baseline, it would be an outage with paperwork.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'close-the-baseline': {
        text: `
        <p>
          "Thank you. That is an incident record, not a story. Send it as it is."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
