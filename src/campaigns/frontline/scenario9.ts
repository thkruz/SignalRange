import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { SKYLINK_SERVICE } from './camp-field-config';
import { applyForwardField, FORWARD_ENDPOINT, FORWARD_FIRST_CARD, FORWARD_PROVIDER, FORWARD_SKYLINK_ACCOUNT, FORWARD_SKYLINK_UNIT } from './forward-field-config';
import { diagramSelection, eventFired, forecastMeetsReserve, handoverCurrent, handoverValid, recordAccepted, samplesCurrent, serviceReserveVerified } from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData, recordRunPower } from './scenario-support';

/**
 * C6 S9: first forward-site commissioning, in the fictional Rautala district.
 * SkyLink is the only available service; the shared sandbox kit must not imply an available EuroSat path.
 * No new hidden fault. Current-versus-cached evidence is the additional lesson.
 * Forward site mode (no trips, nobody spotted), SkyLink only, generator off, laptop and terminal on batteries.
 * The only plant event is s09-link-interruption (anchored to the freshness objective): it invalidates every earlier
 * reading, so the player must classify each one as current or last-known instead of reusing it. Readiness and the
 * service window each need current samples; the window must start after the readiness record is filed.
 */
export const S9_EVENT_INTERRUPTION = 's09-link-interruption';
const CARD = FORWARD_FIRST_CARD.id;
const S9_LOCAL_PATH = ['skylink-dish', 'skylink-cable', 'skylink-router', 'laptop', 'power-strip', 'power-station'];
const S9_NOT_LOCAL = [`account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, `endpoint:${FORWARD_ENDPOINT}`];

const deliveryForm: HandoverFormConfig = {
  id: 'delivery',
  title: 'Delivery reconciliation',
  documentSection: 'Delivery',
  fields: [
    {
      key: 'serial',
      label: 'Terminal serial against the handover',
      required: true,
      rule: pick({ matches: 'Matches the handover', differs: 'Differs from the handover', 'not-checked': 'Not checked' }, ['matches']),
    },
    {
      key: 'account',
      label: 'Service account assignment',
      required: true,
      rule: pick({ matches: 'Matches the handover', differs: 'Differs from the handover', 'not-checked': 'Not checked' }, ['matches']),
    },
    {
      key: 'stock',
      label: 'Spare stock against the list',
      required: true,
      rule: pick({ 'matches-list': 'Matches the stock list', 'short-on-list': 'Short of the stock list', 'not-checked': 'Not checked' }, ['matches-list']),
    },
    {
      key: 'camp',
      label: 'What the camp checks establish here',
      required: true,
      rule: pick(
        {
          'not-certified': 'Nothing yet, because transport voids them',
          'still-valid': 'The camp checks still stand after transport',
          'partly-valid': 'Only the power checks still stand',
        },
        ['not-certified']
      ),
    },
  ],
};

const baselineForm: HandoverFormConfig = {
  id: 'baseline',
  title: 'Forward-site baseline',
  documentSection: 'Baseline',
  fields: [
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Terminal link now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'account', label: 'Account authorization now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    { key: 'energy', label: 'Battery energy left (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40 } } },
  ],
};

const freshnessForm: HandoverFormConfig = {
  id: 'freshness',
  title: 'Reading freshness',
  documentSection: 'Reading freshness',
  eventNote: { eventId: S9_EVENT_INTERRUPTION, text: 'Link interruption reported by the terminal' },
  fields: [
    { key: 'local', label: 'Local network reading', required: true, rule: { freshnessIs: { serviceId: SKYLINK_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Terminal link reading', required: true, rule: { freshnessIs: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'remote', label: 'Remote application reading', required: true, rule: { freshnessIs: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
  ],
};

const readinessForm: HandoverFormConfig = {
  id: 'readiness',
  title: 'First task readiness',
  documentSection: 'Readiness',
  fields: [
    { key: 'task', label: 'Task assessed', required: true, rule: pick({ [CARD]: 'First forward task', 'other-task': 'Another forward task' }, [CARD]) },
    { key: 'registration', label: 'Terminal link now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'account', label: 'Account authorization now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    { key: 'application', label: 'Remote application now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    {
      key: 'basis',
      label: 'Observations behind it',
      required: true,
      rule: {
        evidence: [
          reading('registration', 'a SkyLink registration reading, up', SKYLINK_SERVICE, 'registration', ['up']),
          reading('account', 'a SkyLink account reading, up', SKYLINK_SERVICE, 'account', ['up']),
          reading('application', 'a SkyLink application reading, up', SKYLINK_SERVICE, 'application', ['up']),
        ],
      },
    },
    {
      key: 'status',
      label: 'Readiness for the task',
      required: true,
      rule: pick(
        {
          ready: 'Ready, because current evidence meets every requirement',
          'ready-on-camp': 'Ready, because the camp checks passed before transport',
          'not-ready': 'Not ready, because no task has been run yet',
          'ready-on-power': 'Ready, because the battery is full',
        },
        ['ready']
      ),
    },
  ],
};

const shiftForm: HandoverFormConfig = {
  certification: {},
  id: 'shift',
  title: 'Initial shift handover',
  documentSection: 'Initial handover',
  fields: [
    { key: 'verified', label: 'Task window you ran', required: true, rule: { workload: { cardId: CARD, is: ['supported'], serviceId: SKYLINK_SERVICE } } },
    { key: 'rate', label: 'Average battery draw over the run (W)', required: true, rule: { runRate: { cardId: CARD, serviceId: SKYLINK_SERVICE } } },
    { key: 'energy', label: 'Battery energy left (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40 } } },
    {
      key: 'limitation',
      label: 'Limit left for the next shift',
      required: true,
      rule: pick({ 'single-window': 'Checked over one 60 second window only', 'long-term': 'Proven over a long period', 'no-limit': 'No limitation' }, ['single-window']),
    },
  ],
};

const scenarioSettings = createFrontlineSettings(9);
if (scenarioSettings.physicalPlant) {
  applyForwardField(scenarioSettings.physicalPlant, [FORWARD_FIRST_CARD], [deliveryForm, baselineForm, freshnessForm, readinessForm, shiftForm], { highlightShared: false });
  recordRunPower(scenarioSettings.physicalPlant);
  scenarioSettings.physicalPlant.diagram = { ...scenarioSettings.physicalPlant.diagram, expect: { include: S9_LOCAL_PATH, exclude: S9_NOT_LOCAL } };
  scenarioSettings.physicalPlant.equipment = {
    units: [
      {
        unitId: FORWARD_SKYLINK_UNIT,
        label: 'Delivered SkyLink terminal',
        record: { serial: 'SKY-7731', accountId: FORWARD_SKYLINK_ACCOUNT, configVersion: 'depot-v3' },
        historyTitle: 'Tomek’s handover, stock list and assignment record',
        history: [
          { at: 'Handover, terminal', text: 'SkyLink terminal serial SKY-7731, configuration depot-v3.' },
          { at: 'Handover, assignment', text: `Terminal assigned to service account ${FORWARD_SKYLINK_ACCOUNT}.` },
          {
            at: 'Handover, stock list',
            text: 'Spares delivered: 1 power and data cable, 0 coax cables, 1 power brick, 1 connector kit, 1 fuel can (4 in all). Compare the Spares count on the Site tab with this list.',
          },
          { at: 'Handover, camp checks', text: 'All camp checks passed at Kivilahti before transport. The equipment travelled by truck afterwards.' },
        ],
      },
    ],
  };
  scenarioSettings.physicalPlant.events = [
    {
      id: S9_EVENT_INTERRUPTION,
      startAfterObjectiveId: 's09-check-freshness',
      invalidationLabel: 'link interruption',
      actions: [{ kind: 'set-flag', key: S9_EVENT_INTERRUPTION, value: true }],
      logLine: 'The terminal reports a short interruption. Earlier readings no longer describe the link.',
    },
  ];
}

export const frontlineScenario9Data: FrontlineScenarioData = {
  id: 'frontline-scenario9',
  url: 'frontline/scenarios/frontline-scenario9',
  imageUrl: 'frontline/physical/card-forward-morning.webp',
  number: 9,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario8'],
  title: 'Commission the Forward Post',
  subtitle: 'Current Evidence at a New Site',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Field Service Assessment',
  description:
    'The team has arrived at a new post in Rautala district. Irena Mazur needs a reliable service assessment before she confirms the first simulated task. SkyLink is the only available satellite service; EuroSat has not been delivered.<br/><br/>Reconcile Tomek’s handover, establish the local dependencies, and collect a new baseline. Treat cached remote readings as last-known information until a current check confirms them.',
  equipment: ['SkyLink terminal and router', 'Battery power station and generator', 'Laptop', 'Delivered inventory and commissioning record'],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's09-reconcile-post',
      title: 'Reconcile the Post Handover',
      description:
        'Read Tomek’s handover, stock list and assignment record under Records and notices (Site tab) and compare them with the delivered terminal, the Spares count and the service account. Fill in the Delivery reconciliation form, then accept the terminal record.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        handoverValid('delivery', 'Delivery, stock and assignment compared with the handover'),
        recordAccepted(FORWARD_SKYLINK_UNIT, 'Delivered terminal record accepted'),
      ],
    },
    {
      id: 's09-map-service',
      title: 'Trace the Local Dependencies',
      description:
        'Identify the service path and the power and network components it depends on. Mark every local device on the path, including the laptop, and the power chain behind it (not the account, provider or remote endpoint), then Record selection. The note beside the button says if the set is short or includes a tile that is not local.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s09-reconcile-post'],
      points: 15,
      conditions: [diagramSelection({ include: S9_LOCAL_PATH, exclude: S9_NOT_LOCAL }, 'Local power and network dependencies marked on the diagram')],
    },
    {
      id: 's09-establish-baseline',
      title: 'Establish a Forward-Site Baseline',
      description: 'Inspect the delivered router and power station, then complete the approved commissioning checks. Capture current power and service readings for this site.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s09-map-service'],
      points: 20,
      conditions: [
        {
          type: 'part-inspected',
          description: 'Delivered Router Inspected',
          mustMaintain: false,
          params: {
            partId: 'skylink-router',
          },
        },
        {
          type: 'part-inspected',
          description: 'Delivered Power Station Inspected',
          mustMaintain: false,
          params: {
            partId: 'power-station',
          },
        },
        samplesCurrent(SKYLINK_SERVICE, ['power', 'local', 'registration', 'account', 'application'], 'Current readings taken for every layer'),
        forecastMeetsReserve({}, 'Battery forecast keeps the reserve'),
        handoverValid('baseline', 'Forward-site baseline recorded'),
      ],
    },
    {
      id: 's09-check-freshness',
      title: 'Separate Current and Last-Known Readings',
      description:
        'The terminal reports a short link interruption as this step opens: earlier readings are marked Invalidated with the time. Check the timestamps and freshness of the pilot and remote-endpoint readings. Request a fresh result where possible and retain any unresolved state.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s09-establish-baseline'],
      points: 15,
      conditions: [
        eventFired(S9_EVENT_INTERRUPTION, 'Interruption has occurred'),
        handoverValid('freshness', 'Each reading classified by its age'),
        samplesCurrent(SKYLINK_SERVICE, ['application'], 'Fresh remote check taken after the interruption'),
        {
          type: 'status-check',
          description: 'Cached-Reading Limitation Understood',
          mustMaintain: false,
          params: {
            character: Character.SYSTEM,
            question: 'A remote status was captured before the latest interruption and has not updated. How should you describe it?',
            options: [
              'Current, because the local terminal is connected again.',
              'Failed, because every old reading proves the endpoint is offline.',
              'Last-known, until a fresh observation establishes its state.',
            ],
            correctIndex: 2,
            explanation:
              "The timestamp limits what the observation proves. Local recovery doesn't refresh a remote result, and a stale result doesn't by itself prove remote failure.",
          },
        },
      ],
    },
    {
      id: 's09-confirm-readiness',
      title: 'Assess the First Task',
      description:
        'Compare the first simulated task’s requirements with the current commissioning results. State what is ready and what remains unverified before the task begins.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s09-check-freshness'],
      points: 15,
      conditions: [handoverValid('readiness', 'Readiness recorded against current evidence')],
    },
    {
      id: 's09-run-first-window',
      title: 'Verify and Record the Initial Shift',
      description: 'Complete the approved task’s service window. Record the operating configuration, measured outcome, remaining resources, and any limits for the next shift.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s09-confirm-readiness'],
      points: 20,
      conditions: [
        serviceReserveVerified(
          { card: CARD, service: SKYLINK_SERVICE, afterHandover: 'readiness', windowS: 60 },
          'Task window run after the readiness record with the battery reserve held through the same window'
        ),
        handoverCurrent('shift', 'Initial shift handover filed'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      audioUrl: '',
      emotion: Emotion.NEUTRAL,
      text: "I'm Lieutenant Irena Mazur, responsible for communications at this post. I need a current service assessment before I confirm our first task. Tomek's handover is the starting record; your checks will establish what we can use here. The camp instructor's rule about trips outside and being spotted no longer applies at this post.",
    },
    objectivesOnStart: {
      's09-reconcile-post': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        text: "SkyLink is the service in this delivery. I've included the stock list and assignment record, but the camp's successful checks don't certify the equipment after transport.",
      },
      's09-map-service': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: 'Include the shared dependencies in your assessment. I need to know which parts of the service rely on the same supply or local connection.',
      },
      's09-establish-baseline': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'll provide fresh application results when you're ready. Let's keep them with this site's record so we don't confuse them with the camp checks.",
      },
      's09-check-freshness': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "The terminal has just reported a short interruption (it is in the Ops Log), so every earlier reading is now marked Invalidated. Some of the application's values can stay on screen after the connection stops updating. Check when each result was captured before you treat it as current.",
      },
      's09-confirm-readiness': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: "Tell me which task is supported by the evidence you've collected. Anything still unverified belongs in the assessment, even if the equipment appears ready.",
      },
      's09-run-first-window': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        text: "Use the approved task for the service window, then leave the configuration and remaining limits in the handover. That'll be our starting point for the next shift.",
      },
    },
    objectives: {
      's09-check-freshness': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "You've kept the current results separate from the old ones. That makes the report much clearer when a display hasn't updated.",
      },
      's09-run-first-window': {
        character: Character.IRENA_MAZUR,
        audioUrl: '',
        emotion: Emotion.CONFIDENT,
        text: "The first task has a verified result, and the post has its own baseline. I'll use this handover when I confirm the next shift's work.",
      },
    },
  },
};
