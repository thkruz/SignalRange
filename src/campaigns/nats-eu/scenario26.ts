import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { MHz } from '@app/types';
import { DRILL_BRIEF, DRILL_EQUIPMENT, drillGalway, drillSatellites } from './drills';

/**
 * nats-eu Scenario 26: "Baseline Check" (Drill 2/4, phase 18 G)
 *
 * The pre-pass configuration check against the recorded baseline (4.6 the
 * baseline as a control, 4.7 detecting drift, 8.4 the check itself) and the
 * access confirmation that gates the first transmit (7.4).
 *
 * Staged state: overnight the vendor maintenance account set RX modem 1 to
 * 1410 MHz. The daybook baseline says 1414 (the SAR-1 video IF). The audit
 * log has the change, flagged as a config anomaly, between routine entries.
 * The operator reads the modem, reads the log, and calls it: the decision is
 * graded on the config-drifted fact, which is true while a config-category
 * anomaly is unacknowledged - so the call comes before the flags, and the
 * restore comes before the flags too. Then the access request for the
 * morning pass is confirmed before anything is armed.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1567: Implement system security configurations
 *   - S0838: Skill in identifying anomalous activities
 *   - K0645: Knowledge of standard operating procedures
 * Supporting Codes:
 *   - T0431: Verify configuration against the baseline
 *   - S0648: Skill in detecting anomalies
 *   - S0842: Skill in recording operational events
 */
const galwayDrifted = drillGalway();
galwayDrifted.receivers![0].modems![0] = {
  ...galwayDrifted.receivers![0].modems![0],
  frequency: 1410 as MHz, // Baseline is 1414: the SAR-1 video IF
};

export const natsEuScenario26Data: ScenarioData = {
  id: 'nats-eu-scenario26',
  url: 'nats-eu/scenarios/nats-eu-scenario26',
  imageUrl: 'nats-eu/26/card.png',
  number: 26,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario25'],
  title: 'Baseline Check',
  subtitle: 'Security Drill 2/4',
  duration: '15 min',
  missionType: 'Security Drill',
  description: `05:30, Galway, Thursday. SAR-1 is on the board at 06:10, and the pre-pass sweep starts where it always starts now: the recorded baseline in one hand, the live configuration in the other, and the audit log between them.<br><br>Something doesn’t match, and the log says who changed it and when. The drill is the check itself: what a baseline is for, how drift shows, what you do with it, and what you confirm before the first transmit of the morning.`,
  equipment: DRILL_EQUIPMENT,
  settings: {
    isSync: true,
    groundStations: [galwayDrifted],
    satellites: drillSatellites(),
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-29',
    scenarioStartWallTime: '05:30:00',
    missionBriefUrl: DRILL_BRIEF(26),
    workingDocument: {
      title: 'Pre-pass Sweep GW-01 / 29 April',
      description: 'Baseline check, drift found, action taken, access confirmed.',
    },
    security: {
      accounts: [
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'svc-vendor', name: 'Vendor maintenance (ACU/modem)', role: 'Maintenance', status: 'active' },
      ],
      events: [
        { id: 'evt-login-night', timeS: 0, timestampLabel: '22:04 UTC', actor: 'op-charlie', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-logout-night', timeS: 0, timestampLabel: '22:41 UTC', actor: 'op-charlie', action: 'Console logout', category: 'auth', severity: 'info' },
        {
          id: 'evt-vendor-login',
          timeS: 0,
          timestampLabel: '03:09 UTC',
          actor: 'svc-vendor',
          action: 'Console login (maintenance account)',
          category: 'auth',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-cfg-freq',
          timeS: 0,
          timestampLabel: '03:12 UTC',
          actor: 'svc-vendor',
          action: 'Set receiver 1 frequency: 1414 -> 1410 MHz (no change ticket)',
          category: 'config',
          severity: 'warning',
          isAnomaly: true,
        },
        { id: 'evt-vendor-logout', timeS: 0, timestampLabel: '03:14 UTC', actor: 'svc-vendor', action: 'Console logout', category: 'auth', severity: 'info' },
        { id: 'evt-login-day', timeS: 0, timestampLabel: '05:28 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Read the Sweep Sheet',
      description:
        'Open the sheet. It holds the recorded baseline for GW-01 (RX modem 1 at 1414 MHz / 36 MHz / QPSK 3/4), the change-control rule, and the access request for the 06:10 pass.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [{ type: 'mission-brief-opened', description: 'Sweep Sheet Opened', params: { boxId: 'mission-brief' }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'the-baseline',
      nice: ['T1567', 'K0645'],
      title: 'What the Baseline Is For',
      description: 'Before you touch anything, say what the recorded baseline is and why it’s a security control rather than a convenience.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'status-check',
          description: 'Baseline Purpose Stated',
          params: {
            character: Character.SYSTEM,
            question: 'The daybook holds a recorded configuration for every unit on the station. What is it for?',
            options: [
              'It is the known-good state: what the station looks like untouched. Any difference is an authorised, logged change, or drift',
              'It is a convenience for restoring settings after a power cut, and nobody has to check the live station against it from day to day',
              'It is the vendor’s factory default, kept for warranty purposes, so the live station is allowed to differ from it whenever it needs to',
              'It is the customer’s frequency plan, and the station is allowed to differ from it as operations need, without anyone recording why',
            ],
            correctIndex: 0,
            explanation:
              'A baseline is only a control if somebody checks it. Every difference between it and the live station is either a change with a ticket behind it or drift, and drift is how a compromise shows up before anything else does. The sweep makes that comparison every shift.',
            pointPenalty: 5,
            documentLine: 'Baseline: the recorded known-good configuration; every difference is an authorised change or drift.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'check-against-baseline',
      nice: ['T0431', 'S0838'],
      title: 'Check the Receiver',
      description: 'Read RX modem 1 on RX Analysis and compare it with the baseline on the sheet. Then open the audit log, find out who last touched it, and sign the review off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-baseline'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Modem 1 Frequency Read',
          params: { frequency: 1410e6, frequencyTolerance: 0.5e6, modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        { type: 'audit-log-reviewed', description: 'Audit Log Signed Off', params: {}, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Drift Identified',
          params: {
            character: Character.SYSTEM,
            question: 'What differs from the baseline, and what does the audit log say about it?',
            options: [
              'RX modem 1 is at 1410 MHz; the baseline says 1414. The vendor account logged in at 03:09 and changed it at 03:12 with no change ticket',
              'Nothing differs; 1410 is within the modem’s tuning tolerance of 1414, so the live station matches the baseline and needs no further check',
              'RX modem 1 is at 1410 MHz and the log shows the site lead changed it at 22:04, so the change is authorised and needs no ticket',
              'The bandwidth is wrong; the frequency is fine, so the finding is a width setting on the modem and not a retune of the receiver',
            ],
            correctIndex: 0,
            explanation:
              'Four megahertz isn’t tolerance. It’s the difference between locking the SAR-1 video and not. The log gives the who, the when and the missing ticket, and that’s the whole finding. The site lead’s evening session only logged in and out.',
            pointPenalty: 5,
            documentLine: 'Drift: RX modem 1 at 1410 MHz vs baseline 1414; changed 03:12 by svc-vendor, no change ticket.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'call-the-drift',
      nice: ['S0838', 'S0648', 'K0645'],
      title: 'Call the Drift',
      description:
        'With the modem read on the console and the log entry in front of you, make the call. Don’t flag anything yet, because the call is graded on the state of the log as it stands.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['check-against-baseline'],
      conditions: [
        {
          id: 'modem-read',
          type: 'rx-modem-frequency-set',
          description: 'RX modem 1 reading 1410 MHz on the console',
          params: { frequency: 1410e6, frequencyTolerance: 0.5e6, modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Drift or Change',
          params: {
            character: Character.SYSTEM,
            prompt: 'Charlie, by text: "Is the modem 1 change drift or an authorised change, and what are you doing about it before 06:10?"',
            evidence: ['modem-read'],
            decisionOptions: [
              {
                label:
                  'Drift, unauthorised: no ticket, wrong account, wrong hour. Restore 1414 from the baseline, flag the entries, disable the vendor account and refer it to Group Security',
                correctWhen: { fact: 'config-drifted', is: true },
                consequence: { log: 'RX modem 1 drift called as unauthorised change by svc-vendor; restore and hold ordered' },
              },
              {
                label: 'No drift: the log has nothing unacknowledged against the configuration, so carry on with the sweep and the pass',
                correctWhen: { fact: 'config-drifted', is: false },
                feedback: 'There’s a config entry with no ticket sitting unflagged in the log, and the modem is four megahertz off the baseline. That’s drift by definition.',
              },
              {
                label: 'Accept it as the new baseline: a vendor account made the change, so there must have been a reason. Update the daybook to 1410',
                feedback:
                  'A baseline that updates itself to whatever the station currently says isn’t a baseline. The vendor account isn’t authorised to retune a receiver, there’s no ticket, and 1410 doesn’t lock the video. The reason has to come from a person with a name.',
                consequence: { pointDelta: -5, log: 'Baseline overwritten to 1410 without authorisation' },
              },
              {
                label: 'Reset the modem to factory defaults and reconfigure it from scratch, so nothing from the overnight change is left on it',
                feedback: 'Factory defaults aren’t the baseline either, and a reset wipes the modem’s own record of the change. Restore the recorded value and keep the evidence.',
              },
            ],
            explanation:
              'The finding has three parts, so the answer does too: restore what the baseline says, keep the record of who changed it, and stop the account that did it until the change has an owner. Accepting drift is how a baseline stops being one.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'restore-the-baseline',
      nice: ['T1567', 'T0431'],
      title: 'Restore the Baseline',
      description: 'Set RX modem 1 back to 1414 MHz, using the value on the sheet rather than your memory.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-drift'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX modem 1 at 1414 MHz',
          params: { frequency: 1414e6, frequencyTolerance: 0.5e6, modemNumber: 1 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'flag-the-change',
      nice: ['S0838', 'S0842'],
      title: 'Flag the Entries',
      description: 'Flag the vendor login and the frequency change in the audit log so the sweep record carries both.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['restore-the-baseline'],
      conditions: [
        { type: 'security-event-acknowledged', description: 'Vendor Login Flagged', params: { eventId: 'evt-vendor-login' }, mustMaintain: true },
        { type: 'security-event-acknowledged', description: 'Frequency Change Flagged', params: { eventId: 'evt-cfg-freq' }, mustMaintain: true },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hold-the-account',
      nice: ['T1567', 'K0645'],
      title: 'Hold the Vendor Account',
      description: 'Disable the vendor maintenance account on the Security console until the change has a name and a ticket behind it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-change'],
      conditions: [{ type: 'access-control-set', description: 'svc-vendor Disabled', params: { accountId: 'svc-vendor', accountStatus: 'disabled' }, mustMaintain: true }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'confirm-access',
      nice: ['K0645', 'K1032'],
      title: 'Confirm the Access Request',
      description: 'Before the first transmit of the morning, confirm what authorises GW-01 to take the 06:10 pass and who has confirmed it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hold-the-account'],
      conditions: [
        {
          type: 'status-check',
          description: 'Access Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'The sheet lists an access request for the 06:10 SAR-1 pass. What do you confirm before keying anything, and against what?',
            options: [
              'That the request (SAR-2027-0429-011) names GW-01, SAR-1, the 06:08-06:17 window and the planned frequencies, and that Rotterdam confirmed it for today',
              'That the pass is on the board, because the board is the authorisation and it shows everything the station is allowed to do, and nothing else is needed',
              'That the customer wants the imagery, because the station’s licence covers the rest of what is needed to take the pass, so no request has to be checked',
              'Nothing on a receive pass, because access requests only matter once the BUC is keyed up and the station is transmitting, which a receive pass never does',
            ],
            correctIndex: 0,
            explanation:
              'Access is requested and confirmed for a station, a satellite, a window and a set of frequencies, and the confirmation comes from whoever owns the satellite. The board shows what we plan to do, and the request is what we’re allowed to do. No confirmation means no transmit, and a copy of yesterday’s confirmation doesn’t count.',
            pointPenalty: 5,
            documentLine: 'Access: SAR-2027-0429-011 confirmed for GW-01 / SAR-1 / 06:08-06:17 by Rotterdam; frequencies per plan.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-the-sweep',
      nice: ['S0842', 'K0645'],
      title: 'Log the Sweep',
      description: 'Write one line for the daybook and one for Group Security. The sweep isn’t done until it’s written.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['confirm-access'],
      conditions: [
        {
          type: 'status-check',
          description: 'Sweep Logged',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry closes the sweep?',
            options: [
              '05:30 sweep: RX modem 1 found at 1410 vs baseline 1414 (03:12, svc-vendor, no ticket). Restored 1414 {{at:obj:restore-the-baseline|05:41}}, flagged, svc-vendor disabled, access confirmed, referred to Group',
              '05:30 sweep complete, no issues found. The baseline matches the live station, the vendor account is untouched, and nothing was referred to Group Security or the site lead',
              'Modem retuned to 1414. The vendor is to be asked about it, and no other action was taken: nothing flagged, no account held, nothing sent to Group Security',
              'Sweep done, and the baseline updated to reflect the current settings. The vendor account was left active, nothing was flagged, and access for the pass was not rechecked before the sweep was closed',
            ],
            correctIndex: 0,
            explanation:
              'The entry closes the sweep because it records what was found, what was done, who was told and when. It covers found, restored, flagged, held, confirmed and referred, so the next shift can read it and know exactly where the station stands.',
            pointPenalty: 5,
            documentLine: 'Sweep closed {{stationTime}}: drift restored, entries flagged, svc-vendor held, access confirmed, referred to Group Security.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
