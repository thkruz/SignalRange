import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import {
  applyForwardEurosat,
  applyForwardField,
  FORWARD_ENDPOINT,
  FORWARD_EUROSAT_ENDPOINT,
  FORWARD_EUROSAT_PROVIDER,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_EUROSAT_UNIT,
  FORWARD_FIRST_CARD,
  FORWARD_PROVIDER,
  FORWARD_SKYLINK_ACCOUNT,
} from './forward-field-config';
import {
  correctionApproved,
  correctionFiled,
  diagramSelection,
  eventFired,
  handoverCurrent,
  handoverValid,
  layerObserved,
  samplesCurrent,
  workloadVerified,
} from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';
import { S11_TRANSFER_CARD } from './scenario11';

/**
 * Frontline Signals — Scenario 12: Locate the Affected Connection Segment.
 * Initial state: the local EuroSat service is usable; a radio-connected synthetic workload reports intermittent remote symptoms.
 * The endpoint interruption begins when s12-record-symptoms activates, after the player reviews the path.
 * A specialist response follows an evidence-bounded referral; there are no aircraft or radio-intervention controls.
 * Verification must use fresh samples after that response, not earlier healthy local readings.
 * Authoring draft: missing mechanics are fail-closed, never quiz substitutes.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S12_EVENT_INTERRUPTION = 's12-endpoint-interruption';
export const S12_EVENT_RECOVERED = 's12-endpoint-recovered';
export const S12_EVENT_RESPONSE = 's12-specialist-response';
export const S12_REFERRAL = 's12-specialist-referral';

const architectureForm: HandoverFormConfig = {
  id: 'architecture',
  title: 'Service path segments',
  documentSection: 'Path',
  fields: [
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'local' } } },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application' } } },
    {
      key: 'shared',
      label: 'Dependencies both services share',
      required: true,
      rule: pick({ 'workstation-and-power': 'The local workstation and the power chain', 'terminal-only': 'The terminal only', 'whole-site': 'Everything on the site' }, [
        'workstation-and-power',
      ]),
    },
    {
      key: 'independent',
      label: 'Parts that belong to one service only',
      required: true,
      rule: pick(
        {
          'terminal-account-provider-endpoint': 'Terminal, account, provider and remote endpoint',
          'terminal-only': 'The terminal only',
          'terminal-account': 'Terminal and account only',
        },
        ['terminal-account-provider-endpoint']
      ),
    },
  ],
};

const INTERRUPTED = reading('interrupted', 'an application reading taken after the interruption', FORWARD_EUROSAT_SERVICE, 'application', undefined, {
  afterEvent: S12_EVENT_INTERRUPTION,
});
const LOCAL_AFTER = reading('local', 'a local network reading taken after the interruption', FORWARD_EUROSAT_SERVICE, 'local', undefined, { afterEvent: S12_EVENT_INTERRUPTION });
const PATH_AFTER: EvidenceGroup = {
  ...reading('path', 'a terminal registration or account reading taken after the interruption', FORWARD_EUROSAT_SERVICE, 'registration', undefined, {
    afterEvent: S12_EVENT_INTERRUPTION,
  }),
  orMatch: [
    { kind: 'observation', serviceId: FORWARD_EUROSAT_SERVICE, layer: 'account', afterEvent: S12_EVENT_INTERRUPTION },
    { kind: 'observation', serviceId: FORWARD_EUROSAT_SERVICE, layer: 'provider', afterEvent: S12_EVENT_INTERRUPTION },
  ],
};
const ONSET_MARK: EvidenceGroup = { id: 'onset', label: 'the entry for the interruption', match: { kind: 'result', eventId: S12_EVENT_INTERRUPTION } };

const symptomsForm: HandoverFormConfig = {
  id: 'symptoms',
  title: 'Reported interruption',
  documentSection: 'Symptoms',
  fields: [
    {
      key: 'remote',
      label: 'Remote endpoint value in the service record',
      required: true,
      rule: { freshnessIs: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application' } },
    },
    { key: 'onset', label: 'Onset in the service history', required: true, rule: { evidence: [ONSET_MARK] } },
  ],
};

const comparisonForm: HandoverFormConfig = {
  id: 'comparison',
  title: 'Observations along the path',
  documentSection: 'Comparison',
  fields: [
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Terminal registration now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'registration' } } },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application' } } },
    {
      key: 'limits',
      label: 'What the local checks cannot establish',
      required: true,
      rule: pick({ 'remote-condition': 'The condition of the remote endpoint', 'local-fault': 'A fault in the local equipment', 'provider-outage': 'A provider-wide outage' }, [
        'remote-condition',
      ]),
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { evidence: [INTERRUPTED, LOCAL_AFTER, PATH_AFTER] } },
  ],
};

const diagnosisForm: HandoverFormConfig = {
  id: 'diagnosis',
  title: 'Bounded diagnosis',
  documentSection: 'Diagnosis',
  fields: [
    {
      key: 'segment',
      label: 'Segment the evidence points to',
      required: true,
      rule: pick({ 'remote-endpoint': 'The remote endpoint segment', 'local-segment': 'The local equipment segment', 'provider-segment': 'The provider network segment' }, [
        'remote-endpoint',
      ]),
    },
    {
      key: 'confidence',
      label: 'Confidence',
      required: true,
      rule: pick({ 'likely-unconfirmed': 'Likely, not confirmed from this side', confirmed: 'Confirmed', unlikely: 'Unlikely' }, ['likely-unconfirmed']),
    },
    {
      key: 'cause',
      label: 'Physical cause',
      required: true,
      rule: pick(
        { 'not-established': 'Not established by the evidence', 'established-local': 'Established as a local fault', 'established-remote': 'Established as a remote fault' },
        ['not-established']
      ),
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { evidence: [INTERRUPTED, LOCAL_AFTER, PATH_AFTER] } },
  ],
};

const referralForm: HandoverFormConfig = {
  id: 'referral-package',
  title: 'Incident package',
  documentSection: 'Referral',
  fields: [
    {
      key: 'segment',
      label: 'Affected segment',
      required: true,
      rule: pick({ 'remote-endpoint': 'The remote endpoint segment', 'local-segment': 'The local equipment segment', 'provider-segment': 'The provider network segment' }, [
        'remote-endpoint',
      ]),
    },
    {
      key: 'confidence',
      label: 'Confidence',
      required: true,
      rule: pick({ 'likely-unconfirmed': 'Likely, not confirmed from this side', confirmed: 'Confirmed', unlikely: 'Unlikely' }, ['likely-unconfirmed']),
    },
    {
      key: 'local',
      label: 'Local configuration while waiting',
      required: true,
      rule: pick({ unchanged: 'Left as it is', restarted: 'Restarted', reconfigured: 'Reconfigured' }, ['unchanged']),
    },
    { key: 'evidence', label: 'Observations attached', required: true, rule: { evidence: [INTERRUPTED, LOCAL_AFTER, PATH_AFTER] } },
  ],
};

const updateForm: HandoverFormConfig = {
  certification: { events: [S12_EVENT_INTERRUPTION, S12_EVENT_RECOVERED, S12_EVENT_RESPONSE] },
  id: 'incident-update',
  title: 'Incident update',
  documentSection: 'Resolution',
  fields: [
    {
      key: 'verified',
      label: 'Task window you ran after the response',
      required: true,
      rule: { workload: { cardId: S11_TRANSFER_CARD.id, is: ['supported'], serviceId: FORWARD_EUROSAT_SERVICE } },
    },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application' } } },
    {
      key: 'recovery',
      label: 'How recovery is established',
      required: true,
      rule: pick(
        { 'fresh-test': 'By the new end-to-end test, not by the specialist report', 'specialist-report': 'By the specialist report alone', 'local-reading': 'By a local reading' },
        ['fresh-test']
      ),
    },
    {
      key: 'cause',
      label: 'Physical cause',
      required: true,
      rule: pick(
        { 'not-established': 'Still not established by this side', 'established-local': 'Established as a local fault', 'established-remote': 'Established as a remote fault' },
        ['not-established']
      ),
    },
  ],
};

const scenarioSettings = createFrontlineSettings(12);
if (scenarioSettings.physicalPlant) {
  const plant = scenarioSettings.physicalPlant;
  applyForwardField(plant, [FORWARD_FIRST_CARD, S11_TRANSFER_CARD], [architectureForm, symptomsForm, comparisonForm, diagnosisForm, referralForm, updateForm]);
  applyForwardEurosat(plant, { modemRunning: true });
  plant.equipment = {
    units: [
      {
        unitId: FORWARD_EUROSAT_UNIT,
        label: 'Commissioned EuroSat terminal',
        record: { serial: 'EUS-2208', accountId: 'forward-eurosat', configVersion: 'depot-v2' },
      },
    ],
    requests: [{ id: S12_REFERRAL, unitId: FORWARD_EUROSAT_UNIT, field: 'accountId', to: 'specialist-review', responseEventId: S12_EVENT_RESPONSE, referral: true }],
  };
  plant.events = [
    {
      id: S12_EVENT_INTERRUPTION,
      startAfterObjectiveId: 's12-record-symptoms',
      actions: [{ kind: 'set-endpoint', patch: { id: FORWARD_EUROSAT_ENDPOINT, reachable: false } }],
      logLine: 'The pilot application reports interruptions at the remote end.',
    },
    {
      id: S12_EVENT_RESPONSE,
      startAfterObjectiveId: 's12-refer-incident',
      actions: [{ kind: 'respond-request', requestId: S12_REFERRAL, status: 'approved' }],
      logLine: 'The specialist accepts the incident package.',
    },
    {
      id: S12_EVENT_RECOVERED,
      startAfterObjectiveId: 's12-verify-resolution',
      actions: [{ kind: 'set-endpoint', patch: { id: FORWARD_EUROSAT_ENDPOINT, reachable: true } }],
      logLine: 'The specialist reports the remote endpoint is back.',
    },
  ];
}

export const frontlineScenario12Data: FrontlineScenarioData = {
  id: 'frontline-scenario12',
  url: 'frontline/scenarios/frontline-scenario12',
  imageUrl: 'frontline/physical/card-forward-eurosat-scene-rain.webp',
  number: 12,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario11'],
  difficulty: 'intermediate',
  title: 'Locate the Affected Connection Segment',
  subtitle: 'A Symptom Is Not a Diagnosis',
  duration: '25-35 min',
  missionType: 'Field Communications',
  description:
    'Ola reports interruptions during a simulated task, but a local connection indicator cannot locate the problem. Compare current observations along the service path, refer the issue with appropriate confidence, and verify the result after the responsible specialist responds.',
  equipment: [
    'EuroSat service and restricted SkyLink terminal',
    'Local router and workstation',
    'Synthetic radio-connected workload',
    'Local and remote status records',
    'Incident handover record',
  ],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's12-review-path',
      title: 'Identify the Complete Service Path',
      description:
        "Read the task's connection diagram and service requirement. Identify the local network, satellite service, and separate remote connection segment before interpreting a symptom.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        diagramSelection(
          {
            include: ['laptop', 'vsat-modem', `provider:${FORWARD_EUROSAT_PROVIDER}`, `endpoint:${FORWARD_EUROSAT_ENDPOINT}`],
            exclude: [`account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, `endpoint:${FORWARD_ENDPOINT}`],
          },
          'EuroSat path marked without the SkyLink-only parts'
        ),
        samplesCurrent(FORWARD_EUROSAT_SERVICE, ['local', 'registration', 'application'], 'Baseline readings taken before the report'),
        handoverValid('architecture', 'Shared and independent parts of the path recorded'),
      ],
    },
    {
      id: 's12-record-symptoms',
      title: 'Record the Reported Interruption',
      description:
        "Capture Ola's symptom report and the timestamps of the related readings. Mark stale remote values as last known rather than evidence that the task is currently healthy.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s12-review-path'],
      points: 15,
      conditions: [eventFired(S12_EVENT_INTERRUPTION, 'Interruption has been reported'), handoverValid('symptoms', 'Symptoms recorded with the remote value marked last known')],
    },
    {
      id: 's12-compare-observations',
      title: 'Compare the Available Observations',
      description:
        "Collect current local service measurements and compare them with the remote endpoint's available evidence. Record what each check establishes and what it cannot establish.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s12-record-symptoms'],
      points: 15,
      conditions: [
        samplesCurrent(FORWARD_EUROSAT_SERVICE, ['local', 'registration', 'application'], 'Current readings taken along the path'),
        layerObserved(FORWARD_EUROSAT_SERVICE, 'local', { status: 'up' }, 'Local network observed healthy'),
        layerObserved(FORWARD_EUROSAT_SERVICE, 'application', { status: 'down' }, 'Application observed down'),
        handoverValid('comparison', 'Local and remote evidence compared with its limits'),
      ],
    },
    {
      id: 's12-bound-conclusion',
      title: "State the Evidence's Limits",
      description: 'Identify the segment supported by the collected evidence and state what remains unconfirmed. Distinguish a likely scope from proof of the physical cause.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s12-compare-observations'],
      points: 15,
      conditions: [
        diagramSelection(
          { include: [`endpoint:${FORWARD_EUROSAT_ENDPOINT}`], exclude: ['laptop', 'vsat-modem', 'power-station'], afterEvent: S12_EVENT_INTERRUPTION },
          'Remote segment marked after the interruption'
        ),
        handoverValid('diagnosis', 'Scope and confidence recorded without a physical cause'),
        {
          type: 'status-check',
          description: 'Local Evidence Interpreted',
          params: {
            character: Character.SYSTEM,
            question: 'A current local service test passes while the remote status is stale. What can you conclude from those facts alone?',
            options: [
              'The local check passed, but the remote path remains unverified.',
              'The full path is healthy because one current test passed.',
              'The satellite service failed because the remote status stopped.',
              'The remote equipment must be replaced before any more checks.',
            ],
            correctIndex: 0,
            explanation:
              "The local test supports a limited claim about the part it checked. Stale remote status can't confirm the remote path's present condition or identify a physical cause.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's12-refer-incident',
      title: 'Refer the Bounded Incident',
      description:
        'Send the observations, affected segment, and confidence statement to the responsible specialist. Retain the local configuration while awaiting their response unless new evidence justifies a change.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s12-bound-conclusion'],
      points: 15,
      conditions: [
        handoverValid('referral-package', 'Evidence package assembled with its confidence'),
        correctionFiled(S12_REFERRAL, 'Referral sent to the specialist'),
        correctionApproved(S12_REFERRAL, 'Specialist response received'),
      ],
    },
    {
      id: 's12-verify-resolution',
      title: 'Verify the Reported Resolution',
      description:
        "Run a new end-to-end check after the specialist responds. Update the incident record with the application's current result and distinguish confirmed recovery from the specialist's report.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s12-refer-incident'],
      points: 15,
      conditions: [
        workloadVerified(
          { card: S11_TRANSFER_CARD.id, service: FORWARD_EUROSAT_SERVICE, afterEvent: S12_EVENT_RECOVERED, afterRequestApproved: S12_REFERRAL },
          'New task window supported after the response'
        ),
        layerObserved(FORWARD_EUROSAT_SERVICE, 'application', { status: 'up' }, 'Application observed up in a fresh sample'),
        handoverCurrent('incident-update', 'Incident updated with the fresh result'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.ALEKSANDRA_WYSOCKA,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>I've got the radio-connected test ready. When it starts, I'll describe what I see at my end. If my report doesn't tell you which part of the connection is affected, ask for the evidence you need.</p>",
    },
    objectivesOnStart: {
      's12-record-symptoms': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The test is pausing at my end, and the last status update hasn't changed. I can describe the interruption, but I can't tell you which connection caused it.</p>",
      },
      's12-bound-conclusion': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>Give me the narrowest conclusion the observations support. If a cause remains uncertain, say so. The next person needs to know which checks you've completed.</p>",
      },
      's12-verify-resolution': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I've received the specialist's update. I'll run a new check now so we can compare the report with what the application actually does.</p>",
      },
    },
    objectives: {
      's12-refer-incident': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The specialist has your evidence and has responded. Keep that response with the incident record; the application's new result will tell us whether the task has recovered.</p>",
      },
      's12-verify-resolution': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>Your final update separates the specialist's report from the result you've verified. That's enough for me to close this incident without inventing a cause we never established.</p>",
      },
    },
  },
};
