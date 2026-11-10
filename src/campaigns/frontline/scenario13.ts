import { Character, Emotion } from '@app/modal/character-enum';
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
      rule: { choice: [FORWARD_SKYLINK_ACCOUNT], labels: { [FORWARD_SKYLINK_ACCOUNT]: 'The forward post SkyLink account' } },
    },
    {
      key: 'remote',
      label: 'Remote endpoint',
      required: true,
      rule: { choice: [FORWARD_REMOTE_ENDPOINT], labels: { [FORWARD_REMOTE_ENDPOINT]: 'The simulated onboard terminal' } },
    },
    {
      key: 'link',
      label: 'How the two ends connect',
      required: true,
      rule: { choice: ['provider-network'], labels: { 'provider-network': 'Through the provider network, not a direct radio path' } },
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
      rule: { choice: ['before-policy-event'], labels: { 'before-policy-event': 'Before the next recorded phase' } },
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { cites: 'observation', min: 2 } },
  ],
};

const interruptionForm: HandoverFormConfig = {
  id: 'interruption',
  title: 'Interruption record',
  documentSection: 'Interruption',
  fields: [
    { key: 'remote', label: 'Remote value in the service record', required: true, rule: { freshnessIs: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    { key: 'onset', label: 'Onset in the service history', required: true, rule: { cites: 'result', min: 1 } },
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
      rule: { choice: [FORWARD_REMOTE_ENDPOINT], labels: { [FORWARD_REMOTE_ENDPOINT]: 'The simulated onboard terminal' } },
    },
    {
      key: 'scope',
      label: 'What the notice limits',
      required: true,
      rule: { choice: ['remote-mobility-policy'], labels: { 'remote-mobility-policy': 'Remote terminal mobility policy' } },
    },
    {
      key: 'ground',
      label: 'Ground account restriction',
      required: true,
      rule: { choice: ['separate-unchanged'], labels: { 'separate-unchanged': 'A separate restriction, not changed by this notice' } },
    },
    { key: 'local', label: 'Local equipment', required: true, rule: { choice: ['not-implicated'], labels: { 'not-implicated': 'Not implicated by the notice' } } },
    { key: 'timing', label: 'Notice and onset in the history', required: true, rule: { cites: 'result', min: 2 } },
  ],
};

const limitsForm: HandoverFormConfig = {
  id: 'local-limits',
  title: 'Local options',
  documentSection: 'Local options',
  fields: [
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    { key: 'restart', label: 'A local restart', required: true, rule: { choice: ['does-not-clear'], labels: { 'does-not-clear': 'Does not clear the remote policy' } } },
    { key: 'route', label: 'A change of ground route', required: true, rule: { choice: ['does-not-clear'], labels: { 'does-not-clear': 'Does not clear the remote policy' } } },
    { key: 'action', label: 'Supported response', required: true, rule: { choice: ['report-and-hold'], labels: { 'report-and-hold': 'Report the limit and hold the task' } } },
  ],
};

const holdForm: HandoverFormConfig = {
  id: 'hold-report',
  title: 'Hold and limitation report',
  documentSection: 'Hold',
  fields: [
    {
      key: 'run',
      label: 'Task window you ran and held for',
      required: true,
      rule: { workload: { cardId: S13_TASK_CARD.id, is: ['degraded', 'unsupported'], serviceId: FORWARD_REMOTE_SERVICE } },
    },
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    {
      key: 'limit',
      label: 'Limit in force',
      required: true,
      rule: { choice: ['remote-mobility-policy'], labels: { 'remote-mobility-policy': 'Remote terminal mobility policy' } },
    },
    {
      key: 'ground',
      label: 'Ground account restriction',
      required: true,
      rule: { choice: ['separate-still-in-force'], labels: { 'separate-still-in-force': 'Separate, and still in force' } },
    },
    { key: 'outcome', label: 'Task outcome', required: true, rule: { choice: ['hold-no-success'], labels: { 'hold-no-success': 'On hold, with no success recorded' } } },
    {
      key: 'reassess',
      label: 'Condition for reassessing',
      required: true,
      rule: { choice: ['provider-lifts-policy'], labels: { 'provider-lifts-policy': 'The provider lifts the policy and a fresh task window passes' } },
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
      logLine: 'The task stops updating at the remote end.',
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
      description: 'Trace the ground endpoint, provider network, and simulated onboard terminal in the task diagram. Confirm which service and account apply to each endpoint.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        diagramSelection(
          {
            include: ['skylink-dish', `account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, REMOTE_NODE],
            exclude: ['vsat-modem', `provider:${FORWARD_EUROSAT_PROVIDER}`],
          },
          'Ground terminal, provider network and remote endpoint marked'
        ),
        handoverValid('endpoints', 'Both endpoints and the provider link recorded'),
      ],
    },
    {
      id: 's13-capture-baseline',
      title: 'Establish Current Endpoint Status',
      description:
        "Capture current status for both endpoints and confirm the simulated task's requirement. Record the sample times so later last-known values can be identified correctly.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-map-endpoints'],
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
        "Observe the task and record any interruption when it occurs. Preserve the remote terminal's last-known state without treating that old reading as its present condition.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s13-capture-baseline'],
      points: 15,
      conditions: [
        eventFired(S13_EVENT_POLICY, 'Interruption has happened'),
        handoverValid('interruption', 'Interruption recorded with the remote value marked last known'),
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
