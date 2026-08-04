import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 6 - "Watch the Watchers" / Station Security Baseline
 *
 * New mechanic: M6 SOC-lite security console. Deliberately NOT a SOC: the
 * console does log review, event acknowledgement, and account state. No IDS, no
 * packet capture, no firewall - a ground-station operator's security hygiene,
 * which is what the NICE work roles this scenario claims actually describe.
 *
 * The audit log mixes routine traffic with one benign-but-wrong finding: a
 * maintenance contractor account left active after the install window closed,
 * with off-hours authentication failures against it. Nothing was breached. The
 * lesson is that "nothing happened" is a conclusion you reach by looking, and
 * that a dormant over-privileged account is a finding whether or not it was used.
 *
 * The 'evt-replay' critical event is intentionally NOT in this scenario - the
 * replayed-command thread belongs to the Phase 3 adversary arc (S17, S21), and
 * pulling it forward would spend it.
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
 */
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
  duration: '15-20 min',
  missionType: 'Security Operations',
  description: `Quiet shift. One pass on the plan and a monthly item nobody enjoys: the station security baseline.<br><br>Every console action at GW-01 is logged - logins, configuration changes, command traffic. Once a month somebody actually reads it. Group Security in London reads it too, eventually, but they read it a fortnight later and from four hundred miles away.<br><br>Charlie's guidance is characteristically brief: "You'll find nothing. Find it properly."`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Security Console (audit log + access control)',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-6?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // M6 - routine traffic plus one real finding: the contractor account is
    // still active after the install window and has off-hours auth failures.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'op-guest', name: 'Kilbride Antenna Services (contractor)', role: 'Maintenance', status: 'active' },
      ],
      events: [
        { id: 'evt-login-charlie', timeS: 0, timestampLabel: '06:02 UTC', actor: 'op-charlie', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-cfg-rx', timeS: 0, timestampLabel: '06:14 UTC', actor: 'op-charlie', action: 'Set receiver 1 frequency 1414 MHz', category: 'config', severity: 'info' },
        { id: 'evt-login-fiona', timeS: 0, timestampLabel: '06:30 UTC', actor: 'op-fiona', action: 'Console login (SH-02 remote)', category: 'auth', severity: 'info' },
        { id: 'evt-cmd-playback', timeS: 0, timestampLabel: '07:11 UTC', actor: 'op-charlie', action: 'TT&C command REC-PLAYBACK acknowledged', category: 'command', severity: 'info' },
        { id: 'evt-svc-poll', timeS: 0, timestampLabel: '07:30 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        { id: 'evt-authfail', timeS: 0, timestampLabel: '02:47 UTC', actor: 'op-guest', action: 'Repeated failed logins (off-hours, 6 attempts)', category: 'auth', severity: 'warning', isAnomaly: true },
        { id: 'evt-keyrotate', timeS: 0, timestampLabel: '08:05 UTC', actor: 'op-charlie', action: 'COMSEC key rotation completed', category: 'command', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Baseline Task',
      description: 'Open the shift brief and confirm what the monthly baseline actually requires.',
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
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'review-audit-log',
      nice: ['S0844', 'K0685'],
      title: 'Review the Station Audit Log',
      description: 'Open the Security console and read the audit log end to end. Routine traffic is most of it; that is what makes the exceptions worth finding.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
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
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'flag-the-anomaly',
      nice: ['S0844', 'K0686'],
      title: 'Flag the Off-Hours Failures',
      description: 'One entry does not belong: six failed logins at 02:47 against the antenna contractor\'s account, hours after any maintenance window. Flag it so Group Security sees it in this month\'s return.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-audit-log'],
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Off-Hours Auth Failures Flagged',
          params: { eventId: 'evt-authfail' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'disable-contractor-account',
      nice: ['K0686', 'T1569'],
      title: 'Close the Contractor Account',
      description: 'Kilbride Antenna Services finished the feed work three weeks ago and their account is still active. Set it to disabled in the access-control panel. Nothing was breached - and that is not a reason to leave it open.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-anomaly'],
      conditions: [
        {
          type: 'access-control-set',
          description: 'Contractor Account Disabled',
          params: { accountId: 'op-guest', accountStatus: 'disabled' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'close-the-baseline',
      nice: ['S0844', 'K0685'],
      title: 'Close the Baseline',
      description: 'Record the month\'s finding and its disposition.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['disable-contractor-account'],
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
            ],
            correctIndex: 0,
            explanation: 'Correct. You report the exposure and the attempt, not just the damage. Baseline closed - the account is shut and the entry is flagged.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
