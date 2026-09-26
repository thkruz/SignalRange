import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 22 - "Connecting the Dots" / Incident Attribution Report (Gray Zone arc 6/8)
 *
 * Five events in ten days, each on a different input, each written up as it
 * happened and closed. Thursday afternoon Priya sits the operator down with
 * the campaign record and the station audit log and asks for the one document
 * nobody has written yet: the report that reads them together. The operator
 * opens the record, reads the chain of carried-forward entries, flags the
 * origin (the 13 April configuration export - every later event used a
 * parameter in it), builds the timeline, flies a routine SAR-1 pass in the
 * middle of it because the station is still a station, and then makes the
 * attribution call. Then the parts of a report that leave the building: the
 * geolocation referral (Charlie knows someone), continuity recommendations,
 * the board summary, who is notified of what, and the close.
 *
 * Phase 18: the first scenario built on the campaign document store. The
 * Campaign Record panel (sidebar) shows S17-S21's Working Documents - the
 * player's own where they were completed in this browser, otherwise as filed
 * - and `campaign-document-reviewed` latches on opening it. The audit log
 * carries the arc's evidence forward as entries; the KG-01 unit log from S21
 * carries `requiresCampaignEvidence`, so if the player zeroized it there it is
 * missing here, the `evidence-chain-intact` fact reads false, and the
 * attribution decision has a different right answer: the report records the
 * gap. Q5 storyline bridge: the referral beat is where Charlie mentions a
 * friend who does geolocation for the military - the on-ramp to Campaign 4.
 *
 * Clock starts 2027-04-22 14:00:00 UTC. Pass (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 14:00:00Z):
 *
 *   MERIDIAN-SAR-1: AOS T+30.02 (14:30:00Z, az 025), max el 23.8 deg at T+34.82
 *                   (14:34:49Z, 880 km), LOS T+39.57 (14:39:34Z, az 168), 9.6 min,
 *                   southbound. Receive only; C/N >= 8 dB roughly 14:32:30 .. 14:37.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on 1370 MHz from
 * yesterday's SAR-2 window - to be retuned to 1414. BUC muted; no uplink.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0852: Skill in analyzing incident data / reporting (attribution)
 *   - T1405: Correlate incident data
 *   - T1606: Report incidents to stakeholders
 *
 * Supporting Codes:
 *   - T1427: Coordinate incident response with external parties
 *   - S0648: Skill in detecting anomalies
 *   - K0946: Knowledge of logging and audit practices
 *   - K0721: Knowledge of the ground segment as a target
 *   - S0593: Skill in handling incidents
 *   - S0421: Skill in operating communications equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 *   - K0741: Knowledge of alarm states and their meaning
 */

/** MERIDIAN-SAR-1 (61701) at the S22 epoch: the 24 deg receive pass, southbound from az 025. */
const SAR1_S22_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27112.58333333  .00001000  00000-0  10000-3 0  9999' as TleLine1,
  tle2: '2 61701  98.4000 240.2500 0010000  90.0000 262.0000 15.55840000123454' as TleLine2,
};

const meridianSar1S22 = createMeridianSar1(SAR1_S22_TLE);

/** GW-01 as yesterday left it: RX on SAR-2's video IF, BUC muted. Deep clone, never spread. */
const galwayDots: GroundStationConfig = structuredClone(galwayGroundStation);
galwayDots.receivers![0].modems![0] = {
  ...galwayDots.receivers![0].modems![0],
  frequency: 1370 as MHz,
};
galwayDots.rfFrontEnds[0].buc = { ...galwayDots.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario22Data: ScenarioData = {
  id: 'nats-eu-scenario22',
  url: 'nats-eu/scenarios/nats-eu-scenario22',
  imageUrl: 'nats/22/card.png',
  number: 22,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario21'],
  title: 'Connecting the Dots',
  subtitle: 'Incident Attribution Report (Gray Zone 6/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `14:00, Galway, Thursday. One receive pass at 14:30 and a report to write. Five incidents in ten days, each closed on its own record: a carrier and a spray, a persistent interferer, an uplink denial, a spoofed clock, a replayed command. Priya wants the document that reads them together - what links them, what it cost, who needs to know, and what changes.<br><br>The campaign record and the audit log have everything you need. Whether the last link is in them depends on what you kept on Wednesday.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO)',
    'Campaign Record (Working Documents, S17-S21)',
    "Security Console (audit log with the arc's entries carried forward)",
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayDots, shetlandGroundStation],
    satellites: [meridianSar1S22],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-22',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-22?content-only=true&dark=true',

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
      title: 'Incident Attribution Report IAR-2027-0422-GW01',
      description: 'Five incidents, one report: timeline, attribution, referral, continuity, board summary, notifications.',
    },

    // M6 - the log, with the arc's evidence carried forward as entries. The
    // KG-01 unit log from S21 is conditional on what the player kept there.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'kg-01', name: 'KG-01 command crypto unit', role: 'Equipment', status: 'active' },
        { id: 'svc-legacy', name: 'Telemetry bridge (legacy, decommissioned 14 Jan, disabled 13 Apr)', role: 'Service Account', status: 'disabled' },
      ],
      events: [
        {
          id: 'evt-s17-spray',
          timeS: 0,
          timestampLabel: '13 Apr 01:58 UTC',
          actor: 'svc-legacy',
          action: 'Failed login (3 attempts, remote source) against a decommissioned account still active; account disabled 02:40',
          category: 'auth',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-s17-export',
          timeS: 0,
          timestampLabel: '13 Apr 02:33 UTC',
          actor: 'svc-legacy',
          action: 'Configuration read: full station configuration exported (antenna, LNB LO, modem plan, contact schedule) - no change ticket',
          category: 'config',
          severity: 'critical',
          isAnomaly: true,
        },
        {
          id: 'evt-s18-report',
          timeS: 0,
          timestampLabel: '14 Apr 11:05 UTC',
          actor: 'op-duty',
          action: 'Interference report IR-2027-0414-GW01 filed to ComReg: terrestrial carrier 11726 then 11690 MHz, 60 s on / 30 s off, following the station frequency plan',
          category: 'config',
          severity: 'info',
        },
        {
          id: 'evt-s19-denial',
          timeS: 0,
          timestampLabel: '16 Apr 13:23 UTC',
          actor: 'svc-monitor',
          action: "SAR-2 command NAK: uplink denied - carrier jammed at 14035 MHz (the reissued plan's TT&C uplink); hop set HOP-SAR2-04 activated 13:25, retired",
          category: 'command',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-s20-skew',
          timeS: 0,
          timestampLabel: '19 Apr 05:10 UTC',
          actor: 'svc-monitor',
          action: 'GW-01 frame timestamps +240 us ahead of Rotterdam reference and increasing; GNSS spoof local to Galway 05:08-05:36, SH-02 clean',
          category: 'config',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-s21-kg-log',
          timeS: 0,
          timestampLabel: '21 Apr 09:27 UTC',
          actor: 'kg-01',
          action: 'KG-01 unit log (sealed 21 Apr): 3 frames matching HK-DUMP re-sent from off-station source, counter 0x2F13 stale, rejected at SAR-2',
          category: 'command',
          severity: 'warning',
          isAnomaly: true,
          requiresCampaignEvidence: { scenarioId: 'nats-eu-scenario21', eventId: 'evt-kg-replay-log' },
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '13:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-1400', timeS: 0, timestampLabel: '14:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'T1606'],
      title: 'Read the Brief',
      description: 'Open the brief: what an attribution report is for, what it may say, what it may not, and the one pass that has to be flown in the middle of writing it.',
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
          description: 'Report Scope Understood',
          params: {
            character: Character.SYSTEM,
            question: 'What is an attribution report allowed to conclude?',
            options: [
              'What was observed, when, on which input, what each event needed to know, and what links them - a pattern is a finding; a name is a claim the station cannot make',
              'Who did it: the point of correlating five incidents is to put a name on the actor so the board can act',
              'Nothing: the station reports facts, and drawing a line between five separate records is speculation',
              'That the station was at fault: every event exploited a weakness, and the report exists to list them',
            ],
            correctIndex: 0,
            explanation:
              'Five closed records say five things happened. The report says whether they are one thing. It can say "the same source, the same method, the same shopping list" if the evidence says so, and it must say where the evidence stops. Thirty minutes to AOS.',
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
      description: 'Board read before the desk work. Confirm the active alarm state on GW-01 at 14:00.',
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
            question: 'What is the active alarm state on GW-01 at 14:00?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the pass',
              'Security alarm - five unacknowledged anomalies carried forward in the audit log',
              'COMSEC alarm - KEY-2027-Q2 retired under seal and flagged until destroyed',
            ],
            correctIndex: 0,
            explanation:
              'Empty sky, not a fault. Carried-forward log entries are history, not alarms; a sealed key is a record, not a warning. The station is quiet. The report is about why it was not.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'open-the-record',
      nice: ['K0721', 'K0946'],
      title: 'Open the Campaign Record',
      description: 'Sidebar: Campaign Record. Every Working Document from the 13th to yesterday, as filed. Read them in order before you read anything else.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'campaign-document-reviewed',
          description: 'Campaign Record Opened',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Record Counted',
          params: {
            character: Character.SYSTEM,
            question: 'How many incidents does the record hold since the 12th, and on which inputs?',
            options: [
              'Five: a downlink carrier and a login spray (13th), persistent downlink interference (14th), an uplink denial (16th), a spoofed timing reference (19th), a replayed command (21st) - downlink, downlink, uplink, time, key',
              'Four: the two interference events are one incident, and the spray was a routine credential scan closed without action',
              "Three: interference, spoofing and the replay; the spray and the export were an IT matter outside the station's record",
              'Six: the hop-set retirement on the 16th is its own incident because it cost a key',
            ],
            correctIndex: 0,
            explanation:
              'Five records, five inputs, in order: what the station receives, what it transmits, what it keeps time by, what it commands with. Each one needed more access than the last, and each one was possible with what was exported on the 13th.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-chain',
      nice: ['K0946', 'S0648'],
      title: 'Read the Chain',
      description:
        "Security console: the arc's entries are carried forward in the log, in date order. Sign it off as read, and say what every entry after the 13th has in common with the export.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['open-the-record'],
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
          description: 'Carried-Forward Log Reviewed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Common Thread',
          params: {
            character: Character.SYSTEM,
            question: 'What does every entry after 13 April have in common with the configuration export at 02:33 that morning?',
            options: [
              'Each used something in it: the receive frequencies (14th), the reissued command carrier (16th), the timing dependency (19th), the command plan and window (21st). The export was the shopping list',
              'Nothing - the export was a read, not a change, and reads do not cause incidents',
              'The same account: svc-legacy is the actor on every later entry',
              'The same time of day: every event happened during the night shift when the station was unattended',
            ],
            correctIndex: 0,
            explanation:
              'A configuration export tells someone what to jam, what to spoof, when to command and on which carrier. None of the later events guessed. That is the line that turns five records into one report - and it is why the export, not the carrier, is the origin.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'flag-the-origin',
      nice: ['S0648', 'T1405'],
      title: 'Flag the Origin',
      description: 'Flag the 13 April export entry. It goes at the top of the timeline: everything after it was done with what it contained.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Configuration Export Flagged',
          params: { eventId: 'evt-s17-export' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Origin Written',
          params: {
            character: Character.SYSTEM,
            question: 'What is the first line of the timeline?',
            options: [
              '13 Apr 01:58 password spray on svc-legacy (decommissioned, still active); 02:33 full station configuration exported, no change ticket - every later event used a parameter in that export',
              '13 Apr 02:25 terrestrial carrier on the SAR-1 downlink - the first attack, and the reason the station started keeping a record',
              '12 Apr: incident INC-2027-0412-GW01 opened by Group CSIRT on a general warning',
              '14 Jan: svc-legacy decommissioned but left active - the root cause, and where the report begins',
            ],
            correctIndex: 0,
            explanation:
              'The carrier was the first thing they did to the station. The export was the first thing they took from it, and it is why the rest was possible. The January decommissioning is a finding, not an event; it goes in continuity, not the timeline.',
            pointPenalty: 5,
            documentSection: 'Timeline',
            documentLine:
              '13 Apr 01:58Z password spray on svc-legacy (decommissioned 14 Jan, still active; disabled 02:40Z). 02:33Z full station configuration exported by svc-legacy, no change ticket. Every subsequent event used a parameter contained in that export.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'build-the-timeline',
      nice: ['T1405', 'K0946'],
      title: 'Build the Timeline',
      description:
        'Flag the uplink denial and the timing skew entries, then write the rest of the timeline in one line: four events, four inputs, each with its date, its parameter, and what it cost.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-origin'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Uplink Denial Entry Flagged',
          params: { eventId: 'evt-s19-denial' },
          mustMaintain: true,
        },
        {
          type: 'security-event-acknowledged',
          description: 'Timing Skew Entry Flagged',
          params: { eventId: 'evt-s20-skew' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Timeline Written',
          params: {
            character: Character.SYSTEM,
            question: 'Which line completes the timeline?',
            options: [
              '14 Apr terrestrial interference 11726/11690 MHz following the plan (IR to ComReg); 16 Apr uplink denial on 14035 MHz, hop set spent; 19 Apr GNSS spoof local to Galway, 05:08-05:36, +2 us/s; 21 Apr replay of HK-DUMP at SAR-2, key intact, rotated out of cycle',
              'Four attacks defeated: notch filter, TRANSEC, holdover, key rotation - the station held every time and nothing was lost',
              '14-21 Apr: escalating hostile activity by a state actor against NATS Europe, culminating in an attempted seizure of the command link',
              '14 Apr interference; 16 Apr jamming; 19 Apr GPS outage; 21 Apr counter fault - four unrelated events in a bad week',
            ],
            correctIndex: 0,
            explanation:
              'Dates, inputs, parameters, cost. "Defeated" is a mood, "state actor" is a claim, and "unrelated" is what the export line already disproved. The timeline carries the numbers; the attribution section carries the argument.',
            pointPenalty: 5,
            documentSection: 'Timeline',
            documentLine:
              '14 Apr terrestrial interference 11726 then 11690 MHz, 60 s on / 30 s off, following the station frequency plan (IR-2027-0414-GW01 to ComReg). 16 Apr uplink denial on the reissued 14035 MHz TT&C carrier; HOP-SAR2-04 spent. 19 Apr GNSS spoof local to GW-01 05:08-05:36Z, +2 us/s, SH-02 clean; SAR-1 flown in holdover. 21 Apr replay of HK-DUMP at SAR-2 09:26Z, counter stale, key intact; Q2 rotated to Q2b out of cycle.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-1',
      description: 'The desk waits for the sky. Retune RX modem 1 to 1414 MHz and frame the analyzer on 1414 with a 40 MHz span for the 14:30 pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['build-the-timeline'],
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
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS 14:30:00 from azimuth 025, southbound. Park the tracker on the rise azimuth at 5 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 025 / El 5',
          params: { azimuth: 25, elevation: 5, tolerance: 3 },
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
      description: 'Program-track SAR-1 before 14:30 and confirm the beacon on RX analysis.',
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
      nice: ['T0153', 'K0645'],
      title: 'Operations Continue',
      description: 'Lock the SAR-1 carrier and hold C/N above 8 dB through the high segment. A routine pass, flown clean, in the middle of the report - which is the point.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
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
          description: 'Continuity Read',
          params: {
            character: Character.SYSTEM,
            question: 'Why fly a routine pass in the middle of writing the report?',
            options: [
              'Because the report is about a station that is still operating: continuity is the finding, and a pass flown clean today is a line in it',
              'To bait the adversary: a pass during the report may draw another event that can be recorded',
              'It should not be flown: the station is under investigation and every pass adds exposure until the report is out',
              'Because Rotterdam scheduled it and the schedule cannot be changed inside twenty-four hours',
            ],
            correctIndex: 0,
            explanation: 'Ten days of pressure and the station has not missed a pass. That sentence is what the board reads first. Fly it, log it, go back to the desk.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'attribute-the-actor',
      nice: ['S0852', 'T1405', 'S0648'],
      title: 'Attribute the Pattern',
      description:
        'Back at the desk. With the record open and the log signed off, make the call the report turns on: are these five events one thing, and how far does the evidence let you say so?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar1'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'record-read',
          type: 'campaign-document-reviewed',
          description: 'Campaign record open',
          params: {},
          mustMaintain: true,
        },
        {
          id: 'chain-read',
          type: 'audit-log-reviewed',
          description: 'Audit chain read on the Security console',
          params: { requiresObservation: true, observationTab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Attribution',
          params: {
            character: Character.PRIYA_SHARMA,
            prompt:
              'Five events, five inputs, ten days. I can write "one actor" if the evidence carries it, and I can write "we cannot say" if it does not. Which is it, and what makes it so?',
            evidence: ['record-read', 'chain-read'],
            decisionOptions: [
              {
                label:
                  'One actor, one method: five inputs probed in order of the access each needs, every one inside the parameters exported on the 13th - and the KG-01 log ties the command-link probe to the same off-station source',
                correctWhen: { fact: 'evidence-chain-intact', is: true },
                consequence: { log: 'Attribution: single actor, single method, origin the 13 April configuration export; command-link probe tied by the KG-01 unit log' },
              },
              {
                label:
                  'One actor for the first four; the command-link event cannot be tied to them - the KG-01 unit log was destroyed with the key, so the report records the gap and why',
                correctWhen: { fact: 'evidence-chain-intact', is: false },
                consequence: {
                  pointDelta: 5,
                  log: 'Attribution: single actor for four events; command-link probe unattributable - KG-01 unit log destroyed 21 Apr',
                },
                feedback: 'That is the right call for the record you have. It is also the cost of Wednesday: the one line that named the source is the one that was zeroized.',
              },
              {
                label: 'Unrelated events: interference is common on the west coast, sprays are constant, the spoof was a GNSS anomaly and the replay a counter glitch',
                feedback:
                  'Each of those explanations was ruled out on its own day, in its own record: the carrier followed the plan, the spoof was local, the replay matched your own frame. Five coincidences inside one exported parameter set is not the simpler story.',
              },
              {
                label: 'An insider: only someone on the station could have known the frequency plan, the command carrier and the key schedule',
                feedback:
                  'The export gave the plan, the carrier and the schedule to whoever pulled it - from a remote source, through an account that should not have existed. Nobody on the station needed to know anything.',
              },
            ],
            explanation:
              'The chain is: export, then every input in turn using what the export contained. The command-link probe is the only event the station itself can tie to an off-station source, and only through the KG-01 log. With it, the report says one actor. Without it, the report says one actor for four events and an unattributable fifth - and says why.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'the-referral',
      nice: ['T1427', 'K0721'],
      title: 'Refer the Location',
      description:
        "The report can say where the interferer was not - not a spacecraft, not this station - and cannot say where it was. Write the referral, and take Charlie's call.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['attribute-the-actor'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Referral Written',
          params: {
            character: Character.SYSTEM,
            question: 'Who can locate a terrestrial emitter that a single dish can only characterise, and what does the report say about it?',
            options: [
              'A geolocation team with two or more receivers and time- and frequency-difference processing - not a single dish. The report refers it to specialist assets and says so',
              'ComReg: the regulator locates interferers as part of every IR, so the report waits for their finding',
              'The station, given time: a 4 m dish scanning in azimuth at the next event will bearing-fix the source',
              "Nobody: an emitter that follows the plan is under the adversary's control and moves; location is not a useful finding",
            ],
            correctIndex: 0,
            explanation:
              'One receiver gives a bearing and a signature. A fix needs two or more, the time and frequency differences between them, and someone whose job that is. The report names the limit and the referral; it does not pretend to a capability the station lacks.',
            pointPenalty: 5,
            documentSection: 'Referral',
            documentLine:
              'Geolocation of the terrestrial emitter(s) of 13-14 Apr referred to specialist assets (TDOA/FDOA); NATS Europe holds no such capability. Contact route via C. Brooks (site lead). Bearing, signature and duty cycle from IR-2027-0414-GW01 provided as the starting data.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'continuity-plan',
      nice: ['S0593', 'K0645'],
      title: 'Continuity of Operations',
      description: 'Ten days of events produced ten days of changes to how the station runs. Write them down as recommendations, in the order they would have mattered.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-referral'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Recommendations Written',
          params: {
            character: Character.SYSTEM,
            question: 'Which set of recommendations goes in the continuity section?',
            options: [
              'Decommissioned accounts disabled on the day, change tickets for any configuration export; spare key and hop set staged before every commanding pass; delta-T on every sweep with SH-02 as the cross-check; unit logs exported to the record on any anomaly',
              'Move commanding to Shetland, run the reference on holdover permanently, and stop exporting configuration altogether',
              'Replace the GPSDO, the KG-01 unit and the legacy telemetry bridge; the events exploited equipment, and new equipment closes them',
              'Suspend commercial passes until the emitter is located; the station cannot be defended while the source is unknown',
            ],
            correctIndex: 0,
            explanation:
              'Each recommendation is one of the ten days, stated as a habit. None of them is new equipment and none of them stops the station working. That is what continuity means: the same station, run differently.',
            pointPenalty: 5,
            documentSection: 'Continuity',
            documentLine:
              'Continuity: (1) decommissioned accounts disabled on the day; configuration exports require a change ticket. (2) Spare command key and hop set staged before every commanding pass; key rotated after any contested window. (3) GNSS vs REF delta-T on every dashboard sweep; SH-02 delta-T is the cross-check before any reference action. (4) Unit and monitoring logs exported to the incident record on any anomaly, never cleared. No change to the pass plan.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'board-summary',
      nice: ['T1606', 'T1580'],
      title: 'Brief the Board',
      description: 'One paragraph for people who will not read the timeline: impact, exposure, cost, and the ask.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['continuity-plan'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Board Line Written',
          params: {
            character: Character.SYSTEM,
            question: 'What does the board paragraph say?',
            options: [
              'Five deliberate events over ten days against every input the station has, enabled by one configuration export; no pass lost, one hop set and one key rotation spent, customer collects delivered; source unlocated and referred; four procedural changes already in force',
              'The station has been under sustained attack by a hostile state and requires immediate investment in hardened equipment and additional staff',
              'Several technical anomalies occurred during April; all were resolved by the operator on duty and no further action is required',
              'A security breach on 13 April exposed the station configuration; the full extent of the compromise is still unknown',
            ],
            correctIndex: 0,
            explanation:
              'What happened, what it cost, what was delivered anyway, what is open, what has changed. Nothing the board cannot check against the timeline, nothing that asks them to take a guess on trust.',
            pointPenalty: 5,
            documentSection: 'Board',
            documentLine:
              "Board summary: five deliberate events 13-21 Apr against GW-01's downlink, uplink, timing reference and command link, enabled by an unauthorised configuration export on 13 Apr. No pass lost; all NMW collects delivered. Cost: one TRANSEC hop set, one out-of-cycle key rotation, two operator-hours per event. Source unlocated, referred to specialist assets. Four procedural changes in force from 22 Apr; no capital ask.",
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'notifications',
      nice: ['T1427', 'S0593'],
      title: 'Notify',
      description: 'Who is told what, by whom. The regulator, the customer, Rotterdam, Group CSIRT - and who is not told by this station.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['board-summary'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Notifications Set',
          params: {
            character: Character.SYSTEM,
            question: 'Who is notified, and of what?',
            options: [
              'ComReg: IR-2027-0414 extended with the 16 Apr denial. NMW (customer): impact statement, no collects lost. Rotterdam: the full report. Group CSIRT: the report plus the sealed KG-01 log and Q2. Law enforcement: by CSIRT, not by the station',
              'Everyone gets the full report: the regulator, the customer, Rotterdam, CSIRT and the police, at the same time, from the station',
              'Only Group CSIRT: the report is an internal security document and nothing leaves the company until CSIRT decides',
              'The customer and the regulator are not told: no collect was lost and no rule was broken, so there is nothing to report',
            ],
            correctIndex: 0,
            explanation:
              'Each party gets what it needs and can act on. The regulator has an open IR to extend; the customer has a service to be told about; Rotterdam runs the constellation; CSIRT owns the case and the evidence, and the referral to the police is theirs to make. The station reports up and out, not sideways.',
            pointPenalty: 5,
            documentSection: 'Notifications',
            documentLine:
              'Notifications 22 Apr: ComReg - IR-2027-0414-GW01 extended (16 Apr uplink denial, 14035 MHz). Nordic Maritime Watch - customer impact statement (no collects lost, one re-tasked to SH-02). Rotterdam constellation ops - full report. Group CSIRT - full report, sealed KG-01 log and KEY-2027-Q2, geolocation referral. Law-enforcement referral: Group CSIRT.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'close-the-record',
      nice: ['T1606', 'K0946'],
      title: 'Close the Record',
      description: 'The report header: title, period, scope, finding, in one line that anyone opening the file reads first.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['notifications'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Header Written',
          params: {
            character: Character.SYSTEM,
            question: 'Which line heads the report?',
            options: [
              'IAR-2027-0422-GW01: five events 13-21 Apr against GW-01 Galway (downlink x2, uplink, timing, command link), assessed as one actor and one method enabled by the 13 Apr configuration export; attribution to a named party not made; source referred for geolocation',
              'IAR-2027-0422-GW01: sustained hostile campaign by a state-level adversary against NATS Europe, April 2027',
              'IAR-2027-0422-GW01: summary of April anomalies at GW-01 Galway, all resolved',
              'IAR-2027-0422-GW01: security incident - station configuration compromised 13 Apr; consequences ongoing',
            ],
            correctIndex: 0,
            explanation:
              'The header says what the report is, what it covers, what it found and where it stopped. "State-level" is a claim, "resolved" is a wish, and "compromised" without the rest is a headline. This one is a finding.',
            pointPenalty: 5,
            documentSection: 'Report',
            documentLine:
              'IAR-2027-0422-GW01. Period 13-21 Apr 2027. Scope: GW-01 Galway, SH-02 Shetland, MERIDIAN-SAR-1/2 links. Finding: five deliberate events against every input of the station, assessed as a single actor using a single method - parameters obtained by the unauthorised configuration export of 13 Apr 02:33Z. Attribution to a named party not made. Terrestrial source referred for geolocation.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'close-and-debrief',
      nice: ['T1580', 'K0645', 'K0946'],
      title: 'Debrief',
      description: 'The report is out. The line that goes in the record about the record: what this station learned about reading its own history.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['close-the-record'],
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
              'Five records closed on their own days were one incident that nobody read until the sixth day: the campaign record is reviewed at every shift change from now on, and any two anomalies inside a week are correlated before either is closed',
              'The station handled every event correctly and the report proves it; the procedures need no change',
              'The report should have been written on the 13th: a configuration export is an incident on its own and everything after it was avoidable',
              'The records should be kept by CSIRT, not the station: operators close incidents too early because they want to fly the next pass',
            ],
            correctIndex: 0,
            explanation:
              "Each day's call was right and each day's record was good. What was missing was the reading of them together, and that is a habit, not a procedure. The record is opened at every handover; two anomalies in a week are one question until proven otherwise.",
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed 15:40Z. Open: geolocation referral (specialist assets via C. Brooks); law-enforcement referral (Group CSIRT). Debrief: campaign record reviewed at every shift change; any two anomalies within seven days are correlated before either record is closed; this report is the template for the next one.',
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
        <em>[Text message from Priya Sharma at 13:40]</em>
      </p>
      <p>
        "I am on the desk with you at 14:00. Bring nothing; the campaign record and the audit log are the whole brief. We write the report that reads the five together, you fly SAR-1 at 14:30 in the middle of it because that is what the report is about, and by 15:30 it leaves the building. Whether the last line is in it depends on what you kept yesterday."
      </p>
      `,
      character: Character.PRIYA_SHARMA,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'open-the-record': {
        text: `
        <p>
          Five records. Read them as one document and tell me the first thing you notice is not the carrier on the 13th. It is what was taken at 02:33 that morning.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'decode-sar1': {
        text: `
        <p>
          SAR-1 frames clean, timestamps true, C/N where it should be. That is the eleventh consecutive pass since the 13th with nothing lost. Put it in the report; I would.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'attribute-the-actor': {
        text: `
        <p>
          That is the finding, and it is exactly as far as the evidence goes and no further. I will write it as you said it. Now the parts of a report that leave the building.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'the-referral': {
        text: `
        <p>
          The referral is right; we cannot fix an emitter from one dish. For what it is worth, I know someone who does exactly that for the military - two receivers, time differences, the whole thing. I will make a call. If they want a contractor who has seen this from the receiving end, I know one of those too.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'close-and-debrief': {
        text: `
        <p>
          It is out. Regulator, customer, Rotterdam, my desk. Five days of right calls and one document that made them one thing. The next station on their list will get this report before they get the carrier. Well kept - all of it.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
    },
  },
};
