import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { DRILL_BRIEF, DRILL_EQUIPMENT, drillGalway, drillSatellites } from './drills';

/**
 * nats-eu Scenario 28: "Vendor Session" (Drill 4/4, phase 18 G)
 *
 * A vendor remote-access session has opened on the M&C segment on a
 * Saturday evening with no ticket, and a flow the network has never carried
 * appears beside it. The drill is the flow baseline (6.7 - what normal
 * looks like, so that this is visibly not it), the boundary it crossed (6.3),
 * the path it could reach (6.1), and vendor access done properly (6.4).
 *
 * The decision is graded on audit-anomaly-present: three anomalies are in the
 * log, the evidence for the call is the session entry flagged, and the two
 * flow entries stay unflagged until after the call, so the fact reads true
 * when it is made. The wrong "let them finish" branch injects the config
 * change the session would have made.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1084: Identify anomalous network activity
 *   - T1228: Maintain baseline system security
 *   - K0689: Knowledge of network architecture
 *   - K0721: Knowledge of threats to information systems
 * Supporting Codes:
 *   - S0648: Skill in detecting anomalies
 *   - S0838: Skill in identifying anomalous activities
 *   - K0915: Knowledge of network architecture principles and practices
 *   - T1567: Implement system security configurations
 *   - S0842: Skill in recording operational events
 */
export const natsEuScenario28Data: ScenarioData = {
  id: 'nats-eu-scenario28',
  url: 'nats-eu/scenarios/nats-eu-scenario28',
  imageUrl: 'nats-eu/28/card.png',
  number: 28,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario27'],
  title: 'Vendor Session',
  subtitle: 'Security Drill 4/4',
  duration: '15 min',
  missionType: 'Security Drill',
  description: `21:30, Galway, Saturday. Nothing on the board until the 23:50 pass. The Security console has three new entries since 21:12: a vendor remote-access session on the maintenance account, an outbound flow from the M&C segment to a host the flow baseline has never seen, and a burst of ACU parameter reads from the session.<br><br>No ticket, no maintenance window, no phone call. The drill is the flow baseline that makes this visible, the boundary it should not have crossed, what a session on that segment can reach, and what a vendor session is supposed to look like when it is real.`,
  equipment: DRILL_EQUIPMENT,
  settings: {
    isSync: true,
    groundStations: [drillGalway()],
    satellites: drillSatellites(),
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-05-01',
    scenarioStartWallTime: '21:30:00',
    missionBriefUrl: DRILL_BRIEF(28),
    workingDocument: {
      title: 'Security Event GW-01 / 1 May',
      description: 'Vendor remote session, unticketed. What was seen, what was cut, what was preserved.',
    },
    security: {
      accounts: [
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'svc-vendor', name: 'Vendor remote support (ACU/modem)', role: 'Maintenance', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
      ],
      events: [
        {
          id: 'evt-poll-1',
          timeS: 0,
          timestampLabel: '21:00 UTC',
          actor: 'svc-monitor',
          action: 'M&C poll: ACU, RF front end, modems, GPSDO (baseline flow set)',
          category: 'command',
          severity: 'info',
        },
        {
          id: 'evt-ntp',
          timeS: 0,
          timestampLabel: '21:05 UTC',
          actor: 'svc-monitor',
          action: 'Reference sync check OK (NTP, baseline flow)',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-login', timeS: 0, timestampLabel: '21:10 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-vpn',
          timeS: 0,
          timestampLabel: '21:12 UTC',
          actor: 'svc-vendor',
          action: 'Remote-access session opened from 185.199.74.20 (no change ticket; outside maintenance window)',
          category: 'access',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-flow',
          timeS: 0,
          timestampLabel: '21:14 UTC',
          actor: 'svc-vendor',
          action: 'New outbound flow: M&C segment -> 185.199.74.20:8443 (not in flow baseline)',
          category: 'access',
          severity: 'critical',
          isAnomaly: true,
        },
        {
          id: 'evt-acu-burst',
          timeS: 0,
          timestampLabel: '21:15 UTC',
          actor: 'svc-vendor',
          action: 'ACU parameter read burst (212 reads in 40 s) from remote session',
          category: 'command',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-poll-2',
          timeS: 0,
          timestampLabel: '21:20 UTC',
          actor: 'svc-monitor',
          action: 'M&C poll: ACU, RF front end, modems, GPSDO (baseline flow set)',
          category: 'command',
          severity: 'info',
        },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Read the Flow Baseline',
      description: 'Open the sheet and read the M&C flow baseline (what talks to what, on which port, how often), the vendor access procedure and this week’s maintenance window.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [{ type: 'mission-brief-opened', description: 'Flow Baseline Opened', params: { boxId: 'mission-brief' }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'read-the-baseline',
      nice: ['T1228', 'S0648'],
      title: 'What Normal Looks Like',
      description: 'The flow baseline is a short list. Say what’s on it and why that makes tonight’s new flow stand out.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'status-check',
          description: 'Flow Baseline Stated',
          params: {
            character: Character.SYSTEM,
            question: 'What is on the M&C flow baseline for GW-01, and what does a baseline like that buy you?',
            options: [
              'Management flows to the ACU, RF front end, modems and GPSDO, plus NTP and the monitoring feed; any other flow is an event',
              'Every host the workstation has connected to so far, because the baseline grows as the network is used and learns what normal is',
              'The hosts the firewall blocks, because a block list shows at a glance which flows must never be allowed through the edge',
              'Nothing, because the M&C segment has no baseline and the corporate SOC watches it for the station and flags anything odd',
            ],
            correctIndex: 0,
            explanation:
              'Knowing what normal looks like makes abnormal cheap to see. An operational network has a short list of flows that doesn’t change between maintenance windows, so a new one is the finding before anyone reads what it carried. A baseline that grows with use would absorb tonight’s flow instead of flagging it.',
            pointPenalty: 5,
            documentLine: 'Flow baseline: M&C hosts -> ACU/RFFE/modems/GPSDO mgmt ports; NTP; monitoring out via firewall; no internet egress. Any other flow is an event.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'review-the-log',
      nice: ['S0838', 'T1084'],
      title: 'Read the Log Against the Baseline',
      description: 'Open the Security console. Three entries since 21:12 aren’t on the baseline; the two polls are.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-baseline'],
      conditions: [{ type: 'audit-log-reviewed', description: 'Audit Log Reviewed', params: {}, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'call-the-session',
      nice: ['K0721', 'K0689', 'S0838'],
      title: 'Call the Session',
      description: 'Flag the session entry so the record shows you saw it, leave the flow entries alone until you’ve made the call, then decide what happens to the session.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-the-log'],
      conditions: [
        { id: 'session-flagged', type: 'security-event-acknowledged', description: 'Remote session flagged', params: { eventId: 'evt-vpn' }, mustMaintain: true },
        {
          type: 'decision',
          description: 'What Happens to the Session',
          params: {
            character: Character.SYSTEM,
            prompt: 'Charlie, by phone: "Vendor says it is proactive support - they saw an alert on their side and jumped on. What are you doing with it?"',
            evidence: ['session-flagged'],
            decisionOptions: [
              {
                label: 'Cutting it. Disable the vendor account, which drops the session; flag both entries, keep the logs, tell Group Security',
                correctWhen: { fact: 'audit-anomaly-present', is: true },
                consequence: { log: 'Unticketed vendor remote session cut; svc-vendor disable ordered; flows flagged; Group Security notification requested' },
              },
              {
                label: 'Nothing is unflagged in the log, so there is no open anomaly. Let it run',
                correctWhen: { fact: 'audit-anomaly-present', is: false },
                feedback:
                  'Two anomalies are sitting unflagged in the log: a flow the baseline has never carried and a read burst from the session that made it. That’s an open event by any reading.',
              },
              {
                label: 'Let them finish. It’s the vendor, on the vendor account, doing vendor things; ask for the ticket number on Monday',
                feedback:
                  'A session with no ticket, outside the window, from an address the baseline has never seen, reading the ACU 212 times in 40 seconds, isn’t support. It’s either a vendor ignoring the procedure or someone using the vendor’s credentials, and from this console those look the same. The answer to both is the same too.',
                consequence: {
                  pointDelta: -10,
                  auditEvent: {
                    id: 'evt-acu-cfg',
                    timestampLabel: '21:41 UTC',
                    actor: 'svc-vendor',
                    action: 'ACU tracking parameters changed from remote session (no ticket)',
                    category: 'config',
                    severity: 'critical',
                    isAnomaly: true,
                  },
                  log: 'Vendor remote session allowed to continue; ACU configuration changed remotely',
                },
              },
              {
                label: 'Pull the site’s internet uplink at the edge router until Monday',
                feedback:
                  'That cuts the session, but it also cuts Rotterdam, the monitoring feed, Group Security’s path in and the 23:50 pass coordination. The account is the switch that removes exactly the thing that shouldn’t be there.',
                consequence: { pointDelta: -5, log: 'Site internet uplink pulled at the edge' },
              },
            ],
            explanation:
              'The procedure exists so that a vendor session is something the station starts, not something that happens to it. Cut the account, keep the evidence, tell CSIRT, and let the vendor come back the right way: on a ticket, through the jump host, in a window, with someone watching.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'cut-the-session',
      nice: ['T1567', 'K0645'],
      title: 'Disable the Vendor Account',
      description: 'On the Security console, set the vendor remote support account to disabled. The session drops with it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-session'],
      conditions: [{ type: 'access-control-set', description: 'svc-vendor Disabled', params: { accountId: 'svc-vendor', accountStatus: 'disabled' }, mustMaintain: true }],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'flag-the-flows',
      nice: ['S0838', 'S0842'],
      title: 'Flag the Flow and the Burst',
      description: 'Flag the outbound flow and the ACU read burst so the record carries all three entries.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['cut-the-session'],
      conditions: [
        { type: 'security-event-acknowledged', description: 'Outbound Flow Flagged', params: { eventId: 'evt-flow' }, mustMaintain: true },
        { type: 'security-event-acknowledged', description: 'ACU Read Burst Flagged', params: { eventId: 'evt-acu-burst' }, mustMaintain: true },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-boundary',
      nice: ['K0689', 'K0721'],
      title: 'The Boundary It Crossed',
      description: 'A session from the internet reached the M&C segment. Say where it should have been stopped and what a real vendor session looks like.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-flows'],
      conditions: [
        {
          type: 'status-check',
          description: 'Boundary and Procedure Stated',
          params: {
            character: Character.SYSTEM,
            question: 'Where should the session have been stopped, and how does vendor access work when it is done properly?',
            options: [
              'At the site edge: vendors use the corporate jump host, in a ticketed window, recorded, with an operator watching',
              'At the ACU itself, because the controller should refuse every remote login, whatever the vendor’s ticket says about it',
              'Nowhere, because vendor support has to be able to reach the equipment at any time to fix a fault quickly and cheaply',
              'At the operator’s console, which should have asked for permission before it let any session open at all on the segment today',
            ],
            correctIndex: 0,
            explanation:
              'The boundary is a place, and the procedure has a shape. Nothing inbound reaches the M&C segment, and a real session comes through the jump host on a ticket that names the window and the units, with the account enabled for that window only. Tonight’s session matched neither, and the account being enabled at all on a Saturday night is the finding for Monday.',
            pointPenalty: 5,
            documentLine: 'Boundary: no inbound to M&C; vendor access via corporate jump host, ticketed window, account enabled for the window only, recorded, operator present.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'what-it-could-reach',
      nice: ['K0915', 'K0689'],
      title: 'What It Could Reach',
      description: 'From where the session sat, work out what was within reach and what was not.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-boundary'],
      conditions: [
        {
          type: 'status-check',
          description: 'Reach Assessed',
          params: {
            character: Character.SYSTEM,
            question: 'A session on the M&C segment with the vendor account: what could it touch?',
            options: [
              'Everything on the monitor-and-control path (ACU, RF front end, modems, GPSDO, workstation) but not the crypto unit',
              'Only the ACU diagnostics page, because the vendor account is scoped to that page and nothing else on the segment today',
              'Nothing at all, because the vendor account is read-only and can’t change a single setting on any unit it reaches',
              'The whole site, including the crypto unit and the customer’s data, because the segment is one flat network',
            ],
            correctIndex: 0,
            explanation:
              'The M&C path is one segment, and a vendor account is rarely scoped as tightly as its ticket, so everything on that path was in reach. The crypto unit has its own path and its own keys, which keeps it out. The read burst suggests the session was mapping the ACU, so every unit on the path gets checked against its baseline before the next pass.',
            pointPenalty: 5,
            documentLine: 'Reach: full M&C path (ACU, RFFE, modems, GPSDO, workstation); not the crypto unit. Read burst consistent with mapping the ACU.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-the-event',
      nice: ['S0842', 'K0645'],
      title: 'Log and Notify',
      description: 'Write one entry for Group Security tonight, with the times, the cut and what is preserved.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['what-it-could-reach'],
      conditions: [
        {
          type: 'status-check',
          description: 'Event Logged',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry closes the event?',
            options: [
              '21:12 session, 21:14 new flow, 21:15 read burst; {{at:account:svc-vendor:disabled|21:38}} account disabled, logs kept, Group Security told',
              'Vendor session cut, and nothing else needs logging because the vendor is to be asked about it on Monday morning',
              'Vendor support session completed with no action needed, and the ticket number is to follow from them on Monday',
              'Internet uplink pulled and the site left offline until Monday, with no entries flagged and no logs preserved',
            ],
            correctIndex: 0,
            explanation:
              'A closing entry carries what was seen with times, what was done, what was preserved and who was told. It also names the next action, here checking every unit on the M&C path against its baseline before the 23:50 pass.',
            pointPenalty: 5,
            documentLine:
              'Closed {{stationTime}}: svc-vendor disabled, session dropped, entries flagged, logs preserved, Group Security notification requested; M&C baseline check before 23:50.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
