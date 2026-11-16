import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { RequirementCard } from '@app/physical/workload-types';
import { SKYLINK_SERVICE } from './camp-field-config';
import {
  applyForwardEurosat,
  applyForwardField,
  applyForwardRemote,
  FORWARD_EUROSAT_PROVIDER,
  FORWARD_FIRST_CARD,
  FORWARD_PROVIDER,
  FORWARD_REMOTE_ENDPOINT,
  FORWARD_REMOTE_SERVICE,
  FORWARD_SKYLINK_ACCOUNT,
  FORWARD_SKYLINK_UNIT,
} from './forward-field-config';
import { diagramSelection, eventFired, handoverValid, layerObserved, samplesCurrent, workloadRunFinished } from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * Frontline Signals — Scenario 13: Recognize a Remote-Terminal Restriction.
 * Initial state: a synthetic task uses an onboard SkyLink terminal through the provider network.
 * A fictional remote-endpoint mobility policy activates during an authored task phase after baseline capture.
 * The separate ground-service restriction remains distinct; changing the ground route does not clear remote policy.
 * No real speed threshold, flight action, policy bypass, or direct terminal-to-terminal radio path is modeled.
 * The remote task is its own service path (same ground terminal, account and provider, its own remote endpoint), so
 * the ground account restriction and the remote policy are separate states. The policy event is objective-anchored; the
 * hold is a task run held for its result (Hold for result), never a success claim.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S13_EVENT_POLICY = 's13-remote-policy';
export const S13_EVENT_NOTICE = 's13-policy-notice';
export const S13_NOTICE = 's13-remote-mobility-notice';
export const S13_TASK_CARD: RequirementCard = {
  id: 'fwd-remote-task',
  version: 1,
  label: 'Remote terminal task',
  minDownMbps: 5,
  minUpMbps: 1,
  maxRttMs: 150,
  windowS: 30,
  priority: 'mission',
};

const GROUND_ACCOUNT = reading('ground', 'a ground account reading for the SkyLink service', SKYLINK_SERVICE, 'account');
const REMOTE_READING = reading('remote', 'a reading of the remote endpoint', FORWARD_REMOTE_SERVICE, 'application');
const POLICY_MARK: EvidenceGroup = { id: 'policy', label: 'the entry that shows the change at the remote end', match: { kind: 'result', eventId: S13_EVENT_POLICY } };
const NOTICE_MARK: EvidenceGroup = { id: 'notice', label: 'the entry for the provider notice', match: { kind: 'result', eventId: S13_EVENT_NOTICE } };

const REMOTE_NODE = `endpoint:${FORWARD_REMOTE_ENDPOINT}`;

const endpointsForm: HandoverFormConfig = {
  id: 'endpoints',
  title: 'Service endpoints',
  documentSection: 'Endpoints',
  fields: [
    {
      key: 'ground',
      label: 'Ground endpoint account',
      required: true,
      rule: pick({ [FORWARD_SKYLINK_ACCOUNT]: 'The forward post SkyLink account', 'camp-account': 'The camp account', 'all-accounts': 'Every account on the post' }, [
        FORWARD_SKYLINK_ACCOUNT,
      ]),
    },
    {
      key: 'remote',
      label: 'Remote endpoint',
      required: true,
      rule: pick({ [FORWARD_REMOTE_ENDPOINT]: 'The simulated onboard terminal', 'forward-terminal': 'The forward post terminal', 'provider-gateway': 'The provider gateway' }, [
        FORWARD_REMOTE_ENDPOINT,
      ]),
    },
    {
      key: 'link',
      label: 'How the two ends connect',
      required: true,
      rule: pick(
        { 'provider-network': 'Through the provider network, not a direct radio path', 'direct-radio': 'Through a direct radio path', 'shared-local': 'Over the local network' },
        ['provider-network']
      ),
    },
  ],
};

const baselineForm: HandoverFormConfig = {
  id: 'baseline',
  title: 'Endpoint baseline',
  documentSection: 'Baseline',
  fields: [
    { key: 'ground', label: 'Ground account state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    {
      key: 'phase',
      label: 'Task phase at capture',
      required: true,
      rule: pick({ 'before-policy-event': 'Before the next recorded phase', 'after-policy-event': 'After the policy event', 'not-ordered': 'No order is established' }, [
        'before-policy-event',
      ]),
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { evidence: [GROUND_ACCOUNT, REMOTE_READING] } },
  ],
};

const interruptionForm: HandoverFormConfig = {
  id: 'interruption',
  title: 'Interruption record',
  documentSection: 'Interruption',
  eventNote: { eventId: S13_EVENT_POLICY, text: 'Interruption: the task stopped updating at the remote end' },
  fields: [
    { key: 'remote', label: 'Remote value in the service record', required: true, rule: { freshnessIs: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    { key: 'onset', label: 'Onset in the service history', required: true, rule: { evidence: [POLICY_MARK] } },
  ],
};

const noticeForm: HandoverFormConfig = {
  id: 'notice-correlation',
  title: 'Notice and task history',
  documentSection: 'Provider notice',
  fields: [
    {
      key: 'endpoint',
      label: 'Endpoint the notice names',
      required: true,
      rule: pick({ [FORWARD_REMOTE_ENDPOINT]: 'The simulated onboard terminal', 'forward-terminal': 'The forward post terminal', 'provider-gateway': 'The provider gateway' }, [
        FORWARD_REMOTE_ENDPOINT,
      ]),
    },
    {
      key: 'scope',
      label: 'What the notice limits',
      required: true,
      rule: pick({ 'remote-mobility-policy': 'Remote terminal mobility policy', 'local-capacity': 'Local capacity limit', 'account-suspension': 'Account suspension' }, [
        'remote-mobility-policy',
      ]),
    },
    {
      key: 'ground',
      label: 'Ground account restriction',
      required: true,
      rule: pick({ 'separate-unchanged': 'A separate restriction, not changed by this notice', lifted: 'Lifted by this notice', replaced: 'Replaced by this notice' }, [
        'separate-unchanged',
      ]),
    },
    {
      key: 'local',
      label: 'Local equipment',
      required: true,
      rule: pick({ 'not-implicated': 'Not implicated by the notice', implicated: 'Implicated by the notice', 'to-replace': 'To be replaced under the notice' }, ['not-implicated']),
    },
    { key: 'timing', label: 'Notice and onset in the history', required: true, rule: { evidence: [POLICY_MARK, NOTICE_MARK] } },
  ],
};

const limitsForm: HandoverFormConfig = {
  id: 'local-limits',
  title: 'Local options',
  documentSection: 'Local options',
  fields: [
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    {
      key: 'restart',
      label: 'A local restart',
      required: true,
      rule: pick({ 'does-not-clear': 'Does not clear the remote policy', clears: 'Clears the remote policy', unknown: 'Not known' }, ['does-not-clear']),
    },
    {
      key: 'route',
      label: 'A change of ground route',
      required: true,
      rule: pick({ 'does-not-clear': 'Does not clear the remote policy', clears: 'Clears the remote policy', unknown: 'Not known' }, ['does-not-clear']),
    },
    {
      key: 'action',
      label: 'Supported response',
      required: true,
      rule: pick({ 'report-and-hold': 'Report the limit and hold the task', 'keep-retrying': 'Keep retrying the task', 'swap-route': 'Switch route and retry' }, [
        'report-and-hold',
      ]),
    },
  ],
};

const holdForm: HandoverFormConfig = {
  id: 'hold-report',
  title: 'Hold and limitation report',
  documentSection: 'Hold',
  fields: [
    {
      key: 'run',
      label: 'Task window you ran and held for (a run that ended degraded or unsupported counts)',
      required: true,
      rule: { workload: { cardId: S13_TASK_CARD.id, is: ['degraded', 'unsupported'], serviceId: FORWARD_REMOTE_SERVICE } },
    },
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    {
      key: 'limit',
      label: 'Limit in force',
      required: true,
      rule: pick({ 'remote-mobility-policy': 'Remote terminal mobility policy', 'local-capacity': 'Local capacity limit', 'account-suspension': 'Account suspension' }, [
        'remote-mobility-policy',
      ]),
    },
    {
      key: 'ground',
      label: 'Ground account restriction',
      required: true,
      rule: pick({ 'separate-still-in-force': 'Separate, and still in force', lifted: 'Lifted', merged: 'Merged with the other restriction' }, ['separate-still-in-force']),
    },
    {
      key: 'outcome',
      label: 'Task outcome',
      required: true,
      rule: pick({ 'hold-no-success': 'On hold, with no success recorded', success: 'Completed successfully', failed: 'Failed' }, ['hold-no-success']),
    },
    {
      key: 'reassess',
      label: 'Condition for reassessing',
      required: true,
      rule: pick(
        {
          'provider-lifts-policy': 'The provider lifts the policy and a fresh task window passes',
          'local-restart': 'A local restart and a fresh task window',
          reroute: 'A change of ground route',
        },
        ['provider-lifts-policy']
      ),
    },
  ],
};

const scenarioSettings = createFrontlineSettings(13);
if (scenarioSettings.physicalPlant) {
  const plant = scenarioSettings.physicalPlant;
  applyForwardField(plant, [FORWARD_FIRST_CARD, S13_TASK_CARD], [endpointsForm, baselineForm, interruptionForm, noticeForm, limitsForm, holdForm]);
  applyForwardEurosat(plant, { modemRunning: true });
  applyForwardRemote(plant);
  plant.equipment = {
    units: [
      {
        unitId: FORWARD_SKYLINK_UNIT,
        label: 'Commissioned SkyLink terminal',
        record: { serial: 'SKY-7731', accountId: FORWARD_SKYLINK_ACCOUNT, configVersion: 'depot-v3' },
      },
    ],
    notices: [
      {
        id: S13_NOTICE,
        version: 1,
        providerId: FORWARD_PROVIDER,
        affects: { endpointId: FORWARD_REMOTE_ENDPOINT },
        kind: 'remote-mobility',
        issuedAtS: 0,
        issuedOnDelivery: true,
        text: 'SkyLink service notice. The remote terminal named in this task is under a mobility service policy, effective from the onset in the service history. The ground account restriction is unrelated to this policy. The notice reports no fault in customer equipment.',
      },
    ],
    requests: [],
  };
  plant.events = [
    {
      id: S13_EVENT_POLICY,
      startAfterObjectiveId: 's13-record-interruption',
      offsetS: 15,
      actions: [{ kind: 'set-endpoint', patch: { id: FORWARD_REMOTE_ENDPOINT, reachable: false, policy: 'mobility-restricted' } }],
      invalidationLabel: 'remote interruption',
      logLine: 'Interruption: the task stops updating at the remote end. Earlier remote readings no longer describe it.',
    },
    {
      id: S13_EVENT_NOTICE,
      startAfterObjectiveId: 's13-review-provider-evidence',
      actions: [{ kind: 'deliver-notice', noticeId: S13_NOTICE }],
      logLine: 'A provider notice arrives for the remote terminal.',
    },
  ];
}

export const frontlineScenario13Data: FrontlineScenarioData = {
  id: 'frontline-scenario13',
  url: 'frontline/scenarios/frontline-scenario13',
  imageUrl: 'frontline/physical/card-forward-eurosat-scene-morning.webp',
  number: 13,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario12'],
  difficulty: 'intermediate',
  title: 'Recognize a Remote-Terminal Restriction',
  subtitle: 'Policy at the Other Endpoint',
  duration: '25-35 min',
  missionType: 'Field Communications',
  description:
    'A synthetic task includes a SkyLink terminal at the remote endpoint. Establish the path and current status, then interpret an interruption using provider evidence. Your outcome may be a justified hold rather than restored service.',
  equipment: [
    'Ground SkyLink and EuroSat terminals',
    'Local router and workstation',
    'Simulated remote SkyLink endpoint',
    'Provider status notices',
    'Task phase and endpoint history',
  ],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's13-map-endpoints',
      title: 'Identify Both Service Endpoints',
      description:
        'Trace the ground endpoint, provider network, and simulated onboard terminal in the task diagram. Confirm which service and account apply to each endpoint, then file them on the Service endpoints handover form.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      nice: ['K0689', 'K0792'],
      points: 15,
      conditions: [
        diagramSelection(
          {
            include: ['skylink-dish', `account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, REMOTE_NODE],
            exclude: ['vsat-modem', `provider:${FORWARD_EUROSAT_PROVIDER}`],
          },
          'Ground terminal, provider network and remote endpoint marked'
        ),
        handoverValid('endpoints', 'Both endpoints and the provider link filed on the Service endpoints form'),
      ],
    },
    {
      id: 's13-capture-baseline',
      title: 'Establish Current Endpoint Status',
      description:
        "Capture current status for both endpoints and confirm the simulated task's requirement. Record the sample times so later last-known values can be identified correctly.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-map-endpoints'],
      nice: ['T0153', 'K0741'],
      points: 15,
      conditions: [
        samplesCurrent(SKYLINK_SERVICE, ['registration', 'account'], 'Ground endpoint readings taken'),
        samplesCurrent(FORWARD_REMOTE_SERVICE, ['application'], 'Remote endpoint reading taken, not a local-only sample'),
        handoverValid('baseline', 'Baseline recorded for both endpoints'),
      ],
    },
    {
      id: 's13-record-interruption',
      title: 'Preserve the Interruption Evidence',
      description:
        "Observe the task and take a fresh reading of the remote endpoint when the interruption occurs, then file the Interruption record. Classify the remote value by the age of your latest reading: a fresh reading is current, an older one is last-known and is never the terminal's present condition.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-capture-baseline'],
      nice: ['T0081', 'K0645'],
      points: 15,
      conditions: [
        eventFired(S13_EVENT_POLICY, 'Interruption has happened'),
        handoverValid('interruption', 'Interruption filed with the remote value classified by its reading age'),
        layerObserved(FORWARD_REMOTE_SERVICE, 'application', { status: 'down' }, 'Remote endpoint observed down in a fresh reading'),
      ],
    },
    {
      id: 's13-review-provider-evidence',
      title: 'Correlate the Provider Notice',
      description:
        'Read the provider notice and compare its scope and timing with the task history. Determine which endpoint is restricted and which conclusions remain unsupported.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-record-interruption'],
      nice: ['T0081', 'K0773'],
      points: 15,
      conditions: [eventFired(S13_EVENT_NOTICE, 'Provider notice delivered'), handoverValid('notice-correlation', 'Notice scope compared with the event timing')],
    },
    {
      id: 's13-assess-local-options',
      title: 'Assess the Local Repair Options',
      description:
        'Explain what a local restart or ground-route change would affect. Record why those actions alone cannot remove the remote restriction established by the provider evidence.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-review-provider-evidence'],
      nice: ['T0531', 'K0645'],
      points: 15,
      conditions: [
        layerObserved(FORWARD_REMOTE_SERVICE, 'application', { status: 'down' }, 'Remote policy still in force after the local options'),
        handoverValid('local-limits', 'Local action limits recorded'),
        {
          type: 'status-check',
          description: 'Endpoint Policy Distinguished',
          params: {
            character: Character.SYSTEM,
            question: 'The notice names the remote terminal as restricted, while the ground equipment is healthy. What would changing only the ground provider establish?',
            options: [
              'It would remove the restriction from both endpoints automatically.',
              'It would change the ground path without clearing remote policy.',
              'It would prove that the remote terminal has a damaged connector.',
              'It would reset the remote account and authorize the task again.',
            ],
            correctIndex: 1,
            explanation:
              "The notice applies to the remote endpoint. Changing the ground path doesn't remove that endpoint's provider restriction, so local repairs alone can't establish recovered service.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's13-record-hold',
      title: 'Report the Approved Hold',
      description:
        'Submit the endpoint evidence and service limitation, then place the simulated task in the approved hold state. Record the unavailable service and conditions needed for a future reassessment.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-assess-local-options'],
      nice: ['K0645'],
      points: 15,
      conditions: [
        workloadRunFinished(
          { card: S13_TASK_CARD.id, services: [FORWARD_REMOTE_SERVICE], statuses: ['degraded', 'unsupported'] },
          'Task window held for its result, with no success'
        ),
        handoverValid('hold-report', 'Hold and limitation report saved'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: '<p>This task includes a terminal at the remote end as well as our connection here. I need both ends assessed before I accept a service report. Keep provider limits separate from faults in our own equipment.</p>',
    },
    objectivesOnStart: {
      's13-record-interruption': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The test is entering its next recorded phase. I'll keep the last result available if the status stops updating, but that older result won't tell us whether the connection is still working.</p>",
      },
      's13-review-provider-evidence': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The task has stopped updating at my end. I have a last successful result, but no current confirmation. There's a provider notice to compare with the interruption.</p>",
      },
      's13-record-hold': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>If the remote restriction prevents the task, report that limit and use the approved hold. I don't need a success claim that the evidence can't support.</p>",
      },
    },
    objectives: {
      's13-review-provider-evidence': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The notice identifies the remote endpoint, and you've kept it with the event history. That gives us a specific service limitation to report.</p>",
      },
      's13-record-hold': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The task is on hold, and the report explains the remote limitation. You've preserved the evidence we'll need when the service can be reassessed.</p>",
      },
    },
  },
};
