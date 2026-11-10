import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { RequirementCard } from '@app/physical/workload-types';
import { SKYLINK_SERVICE } from './camp-field-config';
import { applyForwardField, FORWARD_PROVIDER, FORWARD_SKYLINK_ACCOUNT, FORWARD_SKYLINK_UNIT } from './forward-field-config';
import { correctionApproved, correctionFiled, diagramSelection, eventFired, handoverValid, sampleAfterEvent, samplesCurrent, workloadVerified } from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * C6 S10: objective-anchored ground-service capacity restriction, with healthy local equipment.
 * No real provider performance claim, policy workaround, or aircraft operation is modeled.
 * The restriction remains active through completion and S11. This is distinct from the S13 remote mobility restriction.
 * Events are objective-anchored (restriction 20 s into the first objective, notice on the notice objective, the contact's
 * answer on the request objective), so a slow player or a checkpoint reload cannot miss or duplicate them. The restriction
 * leaves 25 percent of the allowance (20/3 Mbps): the status report task still runs and the camera feed task cannot.
 */
export const S10_EVENT_RESTRICTION = 's10-capacity-restriction';
export const S10_EVENT_NOTICE = 's10-notice-delivered';
export const S10_EVENT_ACK = 's10-request-acknowledged';
export const S10_NOTICE = 's10-capacity-notice';
export const S10_REQUEST = 's10-alternative-equipment';
export const S10_FEED_CARD: RequirementCard = {
  id: 'fwd-feed',
  version: 1,
  label: 'Camera feed task',
  minDownMbps: 25,
  minUpMbps: 5,
  maxRttMs: 150,
  windowS: 60,
  priority: 'mission',
};
export const S10_REPORT_CARD: RequirementCard = {
  id: 'fwd-report',
  version: 1,
  label: 'Status report task',
  minDownMbps: 5,
  minUpMbps: 1,
  maxRttMs: 200,
  windowS: 60,
  priority: 'routine',
};
/** Share of the healthy 80/12 Mbps allowance left after the restriction: 20/3 Mbps */
const RESTRICTED_FACTOR = 0.25;

const CARD_CHOICES = { [S10_FEED_CARD.id]: 'Camera feed task', [S10_REPORT_CARD.id]: 'Status report task' };
const ONSET_MARK: EvidenceGroup = { id: 'onset', label: 'the entry for the change in the service', match: { kind: 'result', eventId: S10_EVENT_RESTRICTION } };
const CHANGED_READING = reading('changed', 'an application reading, degraded, taken after the change', SKYLINK_SERVICE, 'application', ['degraded'], {
  afterEvent: S10_EVENT_RESTRICTION,
});
const LOCAL_UP = reading('local-up', 'a local network reading, up, taken after the change', SKYLINK_SERVICE, 'local', ['up'], { afterEvent: S10_EVENT_RESTRICTION });
const REGISTRATION_UP = reading('registration-up', 'a registration reading, up, taken after the change', SKYLINK_SERVICE, 'registration', ['up'], {
  afterEvent: S10_EVENT_RESTRICTION,
});
/** Where the service still matches: a local network or a registration reading, up, after the change */
const MATCHING_READING: EvidenceGroup = {
  ...LOCAL_UP,
  id: 'matching',
  label: 'a local network or registration reading, up, taken after the change',
  orMatch: [REGISTRATION_UP.match],
};

const symptomsForm: HandoverFormConfig = {
  id: 'symptoms',
  title: 'Changed symptoms',
  documentSection: 'Symptoms',
  fields: [
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    { key: 'onset', label: 'Onset in the service history', required: true, rule: { evidence: [ONSET_MARK] } },
    { key: 'evidence', label: 'Observations compared with the baseline', required: true, rule: { evidence: [CHANGED_READING, MATCHING_READING] } },
  ],
};

const healthForm: HandoverFormConfig = {
  id: 'health',
  title: 'Equipment and service comparison',
  documentSection: 'Health comparison',
  fields: [
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Terminal registration now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    {
      key: 'policy',
      label: 'What these readings establish about the cause',
      required: true,
      rule: pick(
        {
          'not-established': 'Not the cause. They show where the service still matches',
          'local-fault': 'A local fault, because the application result changed',
          'terminal-fault': 'A terminal fault, because the service is slower',
        },
        ['not-established']
      ),
    },
  ],
};

const noticeForm: HandoverFormConfig = {
  id: 'notice-scope',
  title: 'Provider notice scope',
  documentSection: 'Notice',
  fields: [
    {
      key: 'account',
      label: 'Account the notice affects',
      required: true,
      rule: pick({ [FORWARD_SKYLINK_ACCOUNT]: 'The forward SkyLink account', 'camp-account': 'The camp account', 'all-accounts': 'Every account on the post' }, [
        FORWARD_SKYLINK_ACCOUNT,
      ]),
    },
    {
      key: 'effect',
      label: 'What the notice limits',
      required: true,
      rule: pick({ 'ground-capacity': 'Ground-service capacity', 'terminal-power': 'Terminal power', 'local-network': 'The local network' }, ['ground-capacity']),
    },
    {
      key: 'registration',
      label: 'Registration according to the notice',
      required: true,
      rule: pick({ unchanged: 'Unchanged', down: 'Dropped', degraded: 'Degraded' }, ['unchanged']),
    },
    {
      key: 'local',
      label: 'Local equipment',
      required: true,
      rule: pick({ 'not-implicated': 'Not implicated by the notice', implicated: 'Implicated by the notice', 'to-replace': 'To be replaced under the notice' }, ['not-implicated']),
    },
    {
      key: 'effective',
      label: 'Effective event',
      required: true,
      rule: { evidence: [{ ...ONSET_MARK, label: 'the entry for the change in the service or the notice', orMatch: [{ kind: 'result', eventId: S10_EVENT_NOTICE }] }] },
    },
  ],
};

const assessmentForm: HandoverFormConfig = {
  id: 'assessment',
  title: 'Task assessment',
  documentSection: 'Task assessment',
  fields: [
    {
      key: 'feed',
      label: 'Camera feed task',
      required: true,
      rule: pick({ unsupported: 'Not supported at the restricted capacity', supported: 'Supported at the restricted capacity' }, ['unsupported']),
    },
    {
      key: 'report',
      label: 'Status report task',
      required: true,
      rule: pick({ unsupported: 'Not supported at the restricted capacity', supported: 'Supported at the restricted capacity' }, ['supported']),
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { evidence: [CHANGED_READING, MATCHING_READING] } },
  ],
};

const limitationForm: HandoverFormConfig = {
  id: 'limitation-report',
  title: 'Service limitation report',
  documentSection: 'Limitation',
  fields: [
    {
      key: 'limit',
      label: 'Limit in force',
      required: true,
      rule: pick({ 'ground-capacity': 'Provider ground-capacity restriction', 'terminal-fault': 'A terminal fault', 'local-congestion': 'Congestion on the local network' }, [
        'ground-capacity',
      ]),
    },
    { key: 'task', label: 'Task that can run', required: true, rule: pick(CARD_CHOICES, [S10_REPORT_CARD.id]) },
    { key: 'unavailable', label: 'Task that stays unavailable', required: true, rule: pick(CARD_CHOICES, [S10_FEED_CARD.id]) },
  ],
};

const outcomeForm: HandoverFormConfig = {
  id: 'reduced-outcome',
  title: 'Reduced-service outcome',
  documentSection: 'Reduced service',
  fields: [
    { key: 'verified', label: 'Task window you ran', required: true, rule: { workload: { cardId: S10_REPORT_CARD.id, is: ['supported'], serviceId: SKYLINK_SERVICE } } },
    { key: 'account', label: 'Account state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    {
      key: 'restriction',
      label: 'Restriction at the end of the window',
      required: true,
      rule: pick({ 'remains-active': 'Still in force', lifted: 'Lifted', unknown: 'Not known' }, ['remains-active']),
    },
  ],
};

const packageForm: HandoverFormConfig = {
  id: 'package',
  title: 'Evidence package',
  documentSection: 'Equipment request',
  fields: [
    { key: 'onset', label: 'Onset', required: true, rule: { evidence: [ONSET_MARK] } },
    { key: 'local', label: 'Local checks', required: true, rule: { evidence: [LOCAL_UP, REGISTRATION_UP] } },
    {
      key: 'notice',
      label: 'Provider notice',
      required: true,
      rule: pick({ [S10_NOTICE]: 'Ground-capacity notice', 'no-notice': 'No provider notice was received' }, [S10_NOTICE]),
    },
    { key: 'supported', label: 'Work still supported', required: true, rule: pick(CARD_CHOICES, [S10_REPORT_CARD.id]) },
    { key: 'gap', label: 'Unmet capability', required: true, rule: pick(CARD_CHOICES, [S10_FEED_CARD.id]) },
  ],
};

const scenarioSettings = createFrontlineSettings(10);
if (scenarioSettings.physicalPlant) {
  applyForwardField(
    scenarioSettings.physicalPlant,
    [S10_FEED_CARD, S10_REPORT_CARD],
    [symptomsForm, healthForm, noticeForm, assessmentForm, limitationForm, outcomeForm, packageForm]
  );
  scenarioSettings.physicalPlant.equipment = {
    units: [
      {
        unitId: FORWARD_SKYLINK_UNIT,
        label: 'Commissioned SkyLink terminal',
        record: { serial: 'SKY-7731', accountId: FORWARD_SKYLINK_ACCOUNT, configVersion: 'depot-v3' },
      },
    ],
    notices: [
      {
        id: S10_NOTICE,
        version: 1,
        providerId: FORWARD_PROVIDER,
        affects: { accountId: FORWARD_SKYLINK_ACCOUNT },
        kind: 'ground-capacity',
        issuedAtS: 0,
        issuedOnDelivery: true,
        text: 'SkyLink service notice. The ground-service capacity allowance for the forward post account has been reduced under provider policy, effective from the onset in the service history. Registration is unchanged. The notice reports no fault in customer equipment.',
      },
    ],
    requests: [{ id: S10_REQUEST, unitId: FORWARD_SKYLINK_UNIT, field: 'accountId', to: 'alternative-service', responseEventId: S10_EVENT_ACK }],
  };
  scenarioSettings.physicalPlant.events = [
    {
      id: S10_EVENT_RESTRICTION,
      startAfterObjectiveId: 's10-record-change',
      offsetS: 20,
      actions: [{ kind: 'set-account', patch: { id: FORWARD_SKYLINK_ACCOUNT, restriction: 'ground-capacity', capacityFactor: RESTRICTED_FACTOR } }],
      logLine: 'Application results change while the local equipment is unchanged.',
    },
    {
      id: S10_EVENT_NOTICE,
      startAfterObjectiveId: 's10-read-notice',
      actions: [{ kind: 'deliver-notice', noticeId: S10_NOTICE }],
      logLine: 'A provider notice arrives for the post account.',
    },
    {
      id: S10_EVENT_ACK,
      startAfterObjectiveId: 's10-file-request',
      actions: [{ kind: 'respond-request', requestId: S10_REQUEST, status: 'approved' }],
      logLine: 'The service contact acknowledges the equipment request.',
    },
  ];
}

export const frontlineScenario10Data: FrontlineScenarioData = {
  id: 'frontline-scenario10',
  url: 'frontline/scenarios/frontline-scenario10',
  imageUrl: 'frontline/physical/card-forward-evening.webp',
  number: 10,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario9'],
  title: 'Identify the Provider Restriction',
  subtitle: 'An External Service Limit',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Field Service Assessment',
  description:
    'The post begins with its commissioned SkyLink service. During the exercise, the provider changes the service allowance while the local equipment remains healthy.<br/><br/>Investigate the changed symptoms, compare them with the baseline, and read the provider’s notice. Determine which simulated tasks remain supportable. A useful limited-service report is the goal; replacing local hardware cannot remove an account-level restriction.',
  equipment: ['SkyLink terminal and router', 'Generator and battery power station', 'Provider notices and service history', 'Workload requirements and equipment request record'],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's10-record-change',
      title: 'Record the Changed Service',
      description: 'Capture the changed workload symptoms and their onset. Compare the current service readings with the post’s baseline before intervening.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        eventFired(S10_EVENT_RESTRICTION, 'Change in the service has occurred'),
        sampleAfterEvent(
          SKYLINK_SERVICE,
          'application',
          'degraded',
          S10_EVENT_RESTRICTION,
          'Changed application result read after the onset (Application Check in Service checks)'
        ),
        handoverValid('symptoms', 'Changed symptoms and onset recorded'),
      ],
    },
    {
      id: 's10-compare-health',
      title: 'Compare Equipment and Service Evidence',
      description: 'Check physical health and registration alongside the changed service performance. Record which parts still match the baseline and which do not.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s10-record-change'],
      points: 15,
      conditions: [
        {
          type: 'part-inspected',
          description: 'Router Inspection Recorded',
          mustMaintain: false,
          params: {
            partId: 'skylink-router',
          },
        },
        samplesCurrent(SKYLINK_SERVICE, ['local', 'registration', 'account', 'application'], 'Current readings taken after the change'),
        diagramSelection(
          {
            include: [`account:${FORWARD_SKYLINK_ACCOUNT}`],
            exclude: ['skylink-router', 'skylink-dish', 'skylink-cable', 'power-station', 'power-strip', 'laptop'],
            afterEvent: S10_EVENT_RESTRICTION,
          },
          'Changed segment marked without local equipment'
        ),
        handoverValid('health', 'Equipment health and service performance compared'),
      ],
    },
    {
      id: 's10-read-notice',
      title: 'Establish the Notice’s Scope',
      description:
        'Read the provider notice and identify the affected account, capacity limitation, and effective event. Separate the stated restriction from problems the notice does not establish.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s10-compare-health'],
      points: 15,
      conditions: [
        eventFired(S10_EVENT_NOTICE, 'Provider notice delivered'),
        handoverValid('notice-scope', 'Notice scope recorded without a local repair'),
        {
          type: 'status-check',
          description: 'Provider Restriction Distinguished from Local Repair',
          mustMaintain: false,
          params: {
            character: Character.SYSTEM,
            question: 'The notice limits account capacity while registration and local checks still pass. What would replacing the router establish?',
            options: [
              'It would remove the restriction because account policy follows the old router.',
              'It would not remove the provider limit.',
              'It would prove the service is unrestricted as soon as the replacement powers on.',
            ],
            correctIndex: 1,
            explanation:
              "The notice describes a provider policy applied to the account. A local router replacement doesn't change that policy. Use the remaining capacity for compatible work and report the unmet requirements.",
          },
        },
      ],
    },
    {
      id: 's10-assess-tasks',
      title: 'Assess Work Under the Limit',
      description:
        'Compare each pending workload with the restricted service readings and its requirements. Record the work still supported and the work that must remain unavailable.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s10-read-notice'],
      points: 20,
      conditions: [handoverValid('assessment', 'Each pending task assessed against the restricted service')],
    },
    {
      id: 's10-run-reduced-service',
      title: 'Deliver the Supported Service',
      description:
        'Communicate the limitation and complete the approved reduced-service workload. Verify its outcome while keeping the provider restriction visible in the report.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s10-assess-tasks'],
      points: 20,
      conditions: [
        handoverValid('limitation-report', 'Limitation reported before the task'),
        workloadVerified(
          { card: S10_REPORT_CARD.id, service: SKYLINK_SERVICE, afterEvent: S10_EVENT_RESTRICTION, afterHandover: 'limitation-report' },
          'Supported task window run after the report'
        ),
        handoverValid('reduced-outcome', 'Outcome recorded with the restriction still in force'),
      ],
    },
    {
      id: 's10-file-request',
      title: 'Request the Missing Capability',
      description: 'File the symptom history, local checks, provider notice, and remaining capability gap. Submit the alternative-equipment request and retain its acknowledgment.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s10-run-reduced-service'],
      points: 20,
      conditions: [
        handoverValid('package', 'Evidence package filed'),
        correctionFiled(S10_REQUEST, 'Alternative-equipment request filed'),
        correctionApproved(S10_REQUEST, 'Request acknowledged'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      audioUrl: '',
      emotion: Emotion.NEUTRAL,
      text: 'Start from the commissioned baseline and record any change before you replace equipment. I need to know what service we still have and which requests it can support.',
    },
    objectivesOnStart: {
      's10-record-change': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'll record the application's results as they change. Compare those with your service history so we can establish when the behavior changed.",
      },
      's10-compare-health': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: 'Keep the equipment checks separate from the service result. I need both in the assessment before we decide what action is justified.',
      },
      's10-read-notice': {
        character: Character.NOTICE,
        audioUrl: '',
        text: "SkyLink service notice: the ground account's capacity allowance has been reduced under provider policy. Registration remains active. The service record contains the effective time and current allowance.",
      },
      's10-assess-tasks': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: "Use the published requirements to identify the work we can still support. Leave a task unavailable if the measured service doesn't meet its requirement.",
      },
      's10-run-reduced-service': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'll use the approved reduced-service task. Tell me its limits before we start so I don't treat that result as proof every task is available.",
      },
      's10-file-request': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: "Include the capability we're missing and the evidence for it in the equipment request. We can make a useful request without pretending the local kit is broken.",
      },
    },
    objectives: {
      's10-read-notice': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: "The notice explains the account limit, and you've kept that separate from local equipment health. We can now assess the remaining service without promising a repair we can't perform.",
      },
      's10-file-request': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        emotion: Emotion.CONFIDENT,
        text: 'The request is acknowledged, and your report shows what remains usable. Keep the restriction in the handover until a fresh service assessment establishes a change.',
      },
    },
  },
};
