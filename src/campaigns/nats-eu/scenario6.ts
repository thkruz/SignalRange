import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
  imageUrl: 'nats-eu/6/card.png',
  number: 6,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario5'],
  title: 'Watch the Watchers',
  subtitle: 'Station Security Baseline',
  duration: '35-40 min',
  missionType: 'Security Operations',
  description: `It's a quiet shift, with two routine downlinks on the plan and one monthly job nobody enjoys: the station security baseline.<br><br>Every console action at GW-01 is logged, including logins, configuration changes and command traffic. Once a month somebody has to read all of it. Group Security in London reads it too, but they get to it a fortnight later and from four hundred miles away.<br><br>Charlie's advice is short: "You'll find nothing. Find it properly, and don't miss the pass while you're doing it."`,
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
        'Monthly security baseline for Group Security (ref GS-BASELINE-GW01-03). Every warning-severity entry is dispositioned, and every account is reconciled against current authorisation.',
    },

    // M6 - routine traffic plus three warning-severity entries to disposition:
    // two benign (Fiona's first login from the new SH-02 address, the
    // monitoring service's scheduled poll-interval change) and one finding
    // (off-hours auth failures against the contractor account, still active
    // three weeks after the install window). One live entry arrives during the
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
      description: 'Open the shift brief and confirm what the monthly baseline requires and when the passes are.',
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
              'The whole trail read, every warning-severity entry dispositioned, and every account reconciled',
              'A search of the log for failed logins, every hit dispositioned, and the affected accounts locked',
              'A list of active accounts, every one confirmed by its owner, and the log kept for London to read',
              'Nothing unless something happened, every incident reported at the time, and the return left blank',
            ],
            correctIndex: 0,
            explanation:
              'The baseline covers the whole trail, every warning and every account, because "nothing happened" is a conclusion you reach by looking, not an assumption. Each wrong answer shrinks or skips the review: a search for failed logins misses the other warnings, and a blank return can\'t show you looked. The first pass is at 14:03, and the log will keep but the pass won\'t.',
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
      description: 'Check the GW-01 dashboard and confirm which alarms are active before you start the baseline.',
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
            question: 'What is the active alarm state on the GW-01 dashboard?',
            options: [
              'RX AGC on noise only (no carrier) - empty sky, not a fault; no hardware alarms',
              'No active alarms (all nominal) - board clear, sweep complete; nothing to carry over',
              'Security console (unacknowledged anomaly) - flagged to the board, not yet read; one alarm',
              'GPSDO in holdover (reference alarm) - timing at risk, not a fault; one hardware alarm',
            ],
            correctIndex: 0,
            explanation:
              "The only entry on the board is the receive AGC sitting on noise with no carrier, which is an empty sky and not a fault. The AGC is the receiver's automatic gain control, and it has no carrier to settle on until a satellite rises. So the board isn't completely clear, but it has no hardware alarm either. The security console doesn't raise dashboard alarms, which is exactly why somebody has to read it.",
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
      description: "Confirm on the GPS Timing tab that the GPSDO is locked and not in holdover before the pass. Holdover means it's coasting on its own oscillator without GPS.",
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
        'Charlie left modem 1 on the 1370 MHz SAR-2 carrier this morning, and the log says so. Retune modem 1 to 1414 MHz, then put the analyzer on the 1389 MHz beacon with a 2 MHz span.',
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
        "Open the Security console, read the audit log end to end, and sign off the review once you've finished. Most of it is routine traffic, which is what makes the exceptions easy to spot.",
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
          description: 'Audit Log Signed Off',
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
              "You don't know yet - severity is a hint from the logger, and each entry still has to be dispositioned",
              'All three - warning is the logger flagging a finding, and each one goes straight into the return',
              'None - nothing was breached, and a finding needs a loss or an intrusion, not just an odd entry',
              'One - only the six failed authentications count, and the new-address login and the config change are routine by definition',
            ],
            correctIndex: 0,
            explanation:
              "The logger scores how unusual an entry is, but you score what it means by checking who did it, what they did and when. Fiona logging in from a new address, a service account changing its own poll interval and six failed logins at 02:47 are three different things, so you can't judge them as one batch. Severity is only a hint about where to look first.",
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
      description: "Fiona's 06:30 login from SH-02 tripped the new-source-address rule. Flag the entry for the return, then decide whether it's benign or a finding.",
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
            question: "Fiona's account (op-fiona) logged in at 06:30 from a source address the station has never seen. Is it a finding?",
            options: [
              'Benign: SH-02 is new to the rule and the account, hour and site register agree - note it, no action',
              'Finding: any unknown source address is an intrusion attempt until proven otherwise - lock op-fiona, escalate',
              'Finding: operators must not log in remotely, whatever the site register says - report it, revoke remote access',
              'Ignore it: successful logins are never findings, whatever the address - skip it, nothing in the return',
            ],
            correctIndex: 0,
            explanation:
              "SH-02 went operational this week, so its address is new to the rule, and the account, the hour and the site register all agree. That makes the login expected and explained, and you can check it against the site register. Locking op-fiona or revoking remote access would punish a legitimate login. A rule that fires once for a new site is doing its job, so the disposition says so, and the rule won't fire for Shetland again.",
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
      description: "The monitoring service changed its own telemetry poll interval at 03:00. Flag the entry for the return, then decide whether it's benign or a finding.",
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
            question: 'The monitoring service account (svc-monitor) changed its own poll interval at 03:00 and referenced change ticket CHG-0412. Is it a finding?',
            options: [
              'Benign: a service account changing its own config on schedule, with a ticket - verify the ticket, note it',
              'Finding: service accounts must never change configuration, ticket or not - revoke its config rights, report',
              'Finding: 03:00 is off-hours for any actor, scheduled or not - report it, hold the change until reviewed',
              'Benign: config entries are never findings, whatever the actor - skip it, no need to check the ticket',
            ],
            correctIndex: 0,
            explanation:
              'Check who, what and when: the right actor did the thing it exists to do, at the time the ticket said. Off-hours is a warning sign for a person, but a scheduler runs at any hour by design. The ticket is the evidence, so the return cites it.',
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
      description: 'The baseline pauses for the pass. Set the antenna to program-track SAR-1 before 14:03, then confirm the beacon on the RX Analysis tab.',
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
      description: 'Lock modem 1 on the 1414 MHz imagery carrier and hold C/N above 8 dB through the high-elevation part of the pass, roughly 14:05 to 14:08.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
        "With SAR-1 decoded, it's back to the audit log. At 02:47 there were six failed logins against the antenna contractor's account, hours outside any maintenance window and three weeks after the install closed. Flag the entry so Group Security sees it in this month's return.",
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
            question: 'The contractor account (op-guest) had six failed logins at 02:47 and none succeeded. Is it a finding?',
            options: [
              'Finding: an account that should not exist, tried at an hour nobody authorised - report exposure and attempt',
              'Benign: unsuccessful attempts are noise, and the lockout did its job - note the count, nothing to report',
              'Benign: the contractor probably forgot their password on a late call-out - ring Kilbride, nothing to report',
              'Finding only if it repeats: one burst of failures is not a pattern - watch the account, report next month',
            ],
            correctIndex: 0,
            explanation:
              "The account shouldn't exist any more, the failures look like password guessing, and they happened when nobody was on site. You report the exposure and the attempt, not just the damage, so a failed burst counts even if nothing got in and you don't have to wait for it to repeat. Flag it first, note the time you saw it, then act on the account.",
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
        "Kilbride Antenna Services finished the feed work three weeks ago, but their account is still active. Set it to disabled in the access-control panel. Nothing was breached, and that's not a reason to leave it open.",
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
              'An account that exists can be attacked; one needed again is re-enabled in a minute - privilege follows current need',
              'Because the contractor was caught attempting access; a live attempt is grounds - the account is now evidence',
              'Because maintenance accounts expire automatically after 30 days; this one is overdue - the panel is just catching up',
              'It should not be disabled; the return only requires it be noted - Kilbride will need it for the next feed job',
            ],
            correctIndex: 0,
            explanation:
              "Least privilege means an account holds only the access it needs right now, not what it might need at the next feed job. An unused account is still something an attacker can aim at, and re-enabling one later takes a minute. Disabling it isn't a punishment for the contractor, because the same reason applies if nothing had been attempted. The install phase leaves things behind, and the baseline is where they get picked up.",
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
        "T. Nakamura's Vermont secondment ended on 28 February, and the last entry under op-relief is a logout the day before. The account is still active. Set it to expired, so that any return visit has to be re-authorised through London.",
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
              'Expired records that authorisation lapsed and forces re-authorisation; disabled is a deliberate shut-off',
              'Expired keeps the login working in case they come back; disabled would lock T. Nakamura out of the site for good',
              'Disabled is only for contractors and outside firms; expired is the status for NATS staff who move on',
              'There is no difference in what the panel enforces; either is fine, and expired just reads better',
            ],
            correctIndex: 0,
            explanation:
              "Either status blocks the account from logging in, so expired doesn't leave the door open. The difference is the story the return tells: expired says the authorisation ran out, disabled says someone shut the account on purpose. Somebody reading the roster in six months should be able to tell a lapsed secondment from a closed contractor without asking you.",
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
      description: 'MERIDIAN-SAR-2 rises at 14:18 at azimuth 130 degrees. Retune modem 1 to its 1370 MHz carrier and move the analyzer to its 1397 MHz beacon.',
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
      description:
        'Point program-track at SAR-2, lock modem 1 on the 1370 MHz carrier, and hold C/N above 8 dB through the high-elevation part of the pass, roughly 14:20:30 to 14:24.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: "Record the month's findings and what you did about each one for the return. Both passes were decoded while you worked.",
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
              'A dormant maintenance account is exposure whatever the outcome, and somebody was trying it',
              'It is not, because unsuccessful attempts are noise and should be filtered out before the return goes to London',
              'Because the contractor breached their contract by attempting access, so the report is a contractual step',
              'Only because Group Security requires at least one finding per return, and a blank return gets sent back',
            ],
            correctIndex: 0,
            explanation:
              'A dormant account with maintenance privileges is exposure whether or not anyone used it, and the failed logins at 02:47 show someone was trying it. Filtering out unsuccessful attempts would hide the very thing Group Security needs to see, and a return only needs the findings that are really there. That closes the baseline: the trail is read, three warnings are dispositioned, two accounts are reconciled and two passes are decoded.',
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
        <em>[Text message from Charlie Brooks at {{stationTime}}]</em>
      </p>
      <p>
        "Quiet one today. SAR-1 comes up at 14:03 and SAR-2 at 14:18, and both are routine downlinks that just need doing properly. The job that actually needs you is the monthly security baseline, which nobody enjoys. Every console action at this site is logged, and once a month somebody reads all of it. This month that's you. You'll find nothing, but find it properly. And don't miss the pass while you're looking."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/intro.mp3'),
    },
    objectives: {
      'read-the-audit-log': {
        text: `
        <p>
          <em>[Memo from Priya Sharma, NATS Group Security, ref GS-BASELINE-GW01-03]</em>
        </p>
        <p>
          "The monthly return for GW-01 is due by close of business Friday. The scope is standard: review the whole audit trail since the last return, disposition every warning-severity event, and reconcile the account roster against current authorisation. Dispositioning an event means telling us what it was and what you did about it. If you don't flag something, we assume you looked. One note for new sites: the install phase leaves things behind."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-read-the-audit-log.mp3'),
      },
      'disposition-new-address': {
        text: `
        <p>
          That one was Fiona's. The rule had never seen Shetland's address, because Shetland didn't exist last month. You wrote down why it's fine, which is the part people skip, because "it's fine" on its own is what they write when they haven't looked. The poll-interval change is next.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-disposition-new-address.mp3'),
      },
      'disposition-poll-change': {
        text: `
        <p>
          The monitoring service changed its own poll interval at three in the morning, and the change has a ticket. A poll is just the service asking the equipment for telemetry, so that was a scheduler doing what schedulers do, and citing the ticket was all it needed. The pass comes before the rest of the log, so SAR-1 is next.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-disposition-poll-change.mp3'),
      },
      'acquire-sar1': {
        text: `
        <p>
          You've got SAR-1, so the pass comes first. The log has been sitting there since this morning and it'll keep until the pass is over, and the satellite won't wait for you.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-acquire-sar1.mp3'),
      },
      'decode-sar1': {
        text: `
        <p>
          Routine was the point of that one. Every action you took on that pass went into the same trail you're auditing. Next month somebody reads those entries and decides whether they were you. Back to the log now.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-decode-sar1.mp3'),
      },
      'flag-the-off-hours-failures': {
        text: `
        <p>
          <em>[Text message from Priya Sharma at {{stationTime}}]</em>
        </p>
        <p>
          "Charlie says you've got something on the contractor account, and you've flagged the entry with the time you saw it. That's the order I wanted, because I'll be reading the record later. Now you can disable the account."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-flag-the-off-hours-failures.mp3'),
      },
      'close-the-contractor-account': {
        text: `
        <p>
          Good, that's closed. Kilbride did a good job on the feed, and I'd have them back tomorrow. That's a reason to re-enable the account tomorrow, not a reason to have left it open tonight. There's one more account on the roster to look at.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-close-the-contractor-account.mp3'),
      },
      'expire-the-relief-account': {
        text: `
        <p>
          Nakamura covered for me in February and went home on the twenty-eighth. Nobody closed the account, because nobody's job was to close the account, and that's what the roster reconciliation is for. You set it to expired rather than disabled, which is right, because the story is different and the return should say so. SAR-2 is up next.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-expire-the-relief-account.mp3'),
      },
      'decode-sar2': {
        text: `
        <p>
          That's SAR-2 decoded, so the baseline didn't cost us a pass. A baseline that costs the station a pass isn't a baseline, it's an outage with paperwork. Now write it up.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-decode-sar2.mp3'),
      },
      'close-the-baseline': {
        text: `
        <p>
          "Thanks. That's a record, not a story: what you saw, when you saw it, and what you did. Send it as written."
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/6/obj-close-the-baseline.mp3'),
      },
    },
  },
};
