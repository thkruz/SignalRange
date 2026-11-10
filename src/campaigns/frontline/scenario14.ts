import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { SKYLINK_SERVICE } from './camp-field-config';
import {
  applyForwardDualReadiness,
  applyForwardEurosat,
  applyForwardField,
  applyForwardRemote,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_FIRST_CARD,
  FORWARD_PROVIDER,
  FORWARD_REMOTE_SERVICE,
  FORWARD_SKYLINK_ACCOUNT,
  FORWARD_SKYLINK_UNIT,
} from './forward-field-config';
import { diagramSelection, eventFired, forecastMeetsReserve, handoverValid, layerObserved, modeIs, workloadRunFinished, workloadVerified } from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';
import { S11_INTERACTIVE_CARD, S11_TRANSFER_CARD } from './scenario11';

/**
 * Frontline Signals — Scenario 14: Manage Two Available Terminals.
 * Initial state: the SkyLink ground-service restriction from S10 is still in force until a provider notice lifts it
 * during the scenario; EuroSat is running. The separate remote mobility policy from S13 stays in force throughout:
 * the lift event patches only the SkyLink account, never the remote endpoint.
 * The player compares both services, maps the shared dependencies, chooses an active/standby arrangement against a
 * 200 Wh reserve (both terminals running misses it), then a planned SkyLink outage exercises the standby terminal
 * (EuroSat registration takes its modeled startup). Nothing freezes the clock: restoration and the exercise run in time.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S14_EVENT_NOTICE = 's14-restoration-notice';
export const S14_EVENT_LIFT = 's14-ground-restriction-lifted';
export const S14_EVENT_EXERCISE = 's14-readiness-exercise';
export const S14_EVENT_RETURN = 's14-skylink-returns';
export const S14_NOTICE = 's14-ground-restoration-notice';

const EUS = FORWARD_EUROSAT_SERVICE;
const TRANSFER = S11_TRANSFER_CARD.id;
const INTERACTIVE = S11_INTERACTIVE_CARD.id;
const choice = (id: string, label: string) => ({ choice: [id], labels: { [id]: label } });

const restorationForm: HandoverFormConfig = {
  id: 'restoration',
  title: 'Restoration check',
  documentSection: 'Restoration',
  fields: [
    { key: 'notice', label: 'Provider notice and effective time', required: true, rule: { cites: 'result', min: 1 } },
    { key: 'account', label: 'SkyLink account state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    {
      key: 'verified',
      label: 'Interactive task window you ran after the change',
      required: true,
      rule: { workload: { cardId: INTERACTIVE, is: ['supported'], serviceId: SKYLINK_SERVICE } },
    },
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    { key: 'policy', label: 'Remote terminal policy', required: true, rule: choice('remains-in-force', 'Still in force; the notice does not cover it') },
  ],
};

const comparisonForm: HandoverFormConfig = {
  id: 'comparison',
  title: 'Service comparison',
  documentSection: 'Comparison',
  fields: [
    { key: 'skylink', label: 'Interactive task on SkyLink', required: true, rule: { workload: { cardId: INTERACTIVE, is: ['supported'], serviceId: SKYLINK_SERVICE } } },
    { key: 'eurosat', label: 'Interactive task on EuroSat', required: true, rule: { workload: { cardId: INTERACTIVE, is: ['unsupported'], serviceId: EUS } } },
    { key: 'transfer', label: 'Transfer task on EuroSat', required: true, rule: { workload: { cardId: TRANSFER, is: ['supported'], serviceId: EUS } } },
    { key: 'unmet', label: 'Requirement EuroSat misses for the interactive task', required: true, rule: choice('delay', 'Round-trip delay above its limit') },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { cites: 'observation', min: 2 } },
  ],
};

const dependenciesForm: HandoverFormConfig = {
  id: 'dependencies',
  title: 'Shared dependencies',
  documentSection: 'Dependencies',
  fields: [
    { key: 'shared', label: 'Dependencies both services share', required: true, rule: choice('workstation-and-power', 'The workstation and the power chain') },
    {
      key: 'separate',
      label: 'Parts that belong to one service only',
      required: true,
      rule: choice('terminal-account-provider-endpoint', 'Terminal, account, provider and remote endpoint'),
    },
    { key: 'covered', label: 'Failure the second path covers', required: true, rule: choice('terminal-or-service', 'A terminal, account or provider failure') },
    { key: 'uncovered', label: 'Failure the second path does not cover', required: true, rule: choice('power-or-workstation', 'A power or workstation failure') },
  ],
};

const readinessForm: HandoverFormConfig = {
  id: 'readiness',
  title: 'Operating configuration',
  documentSection: 'Configuration',
  fields: [
    { key: 'active', label: 'Active connection', required: true, rule: { modeIs: { partId: 'skylink-dish' } } },
    { key: 'standby', label: 'Standby terminal', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
    { key: 'recovery', label: 'Time the standby terminal needs to register', required: true, rule: choice('about-20-s', 'About 20 seconds') },
    {
      key: 'reason',
      label: 'Why this arrangement',
      required: true,
      rule: choice('interactive-needs-skylink', 'Only SkyLink supports the interactive task, and one terminal in standby keeps the reserve'),
    },
  ],
};

const transitionForm: HandoverFormConfig = {
  id: 'transition',
  title: 'Readiness exercise',
  documentSection: 'Exercise',
  fields: [
    { key: 'skylink', label: 'SkyLink provider state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'provider' } } },
    { key: 'registration', label: 'EuroSat registration now', required: true, rule: { matchesCurrent: { serviceId: EUS, layer: 'registration' } } },
    { key: 'verified', label: 'Transfer window you ran after the transition', required: true, rule: { workload: { cardId: TRANSFER, is: ['supported'], serviceId: EUS } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
    { key: 'interactive', label: 'Interactive task while SkyLink is out', required: true, rule: choice('unavailable', 'Not available on EuroSat') },
    { key: 'basis', label: 'Observations and events behind it', required: true, rule: { cites: 'observation', min: 3 } },
  ],
};

const handoverForm: HandoverFormConfig = {
  id: 'dual-handover',
  title: 'Dual-service handover',
  documentSection: 'Dual service',
  fields: [
    { key: 'active', label: 'Active terminal mode (EuroSat)', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'standby', label: 'Standby terminal mode (SkyLink)', required: true, rule: { modeIs: { partId: 'skylink-dish' } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
    { key: 'skylink', label: 'SkyLink account state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    { key: 'remote', label: 'Remote endpoint status now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_REMOTE_SERVICE, layer: 'application' } } },
    { key: 'policy', label: 'Remote terminal policy', required: true, rule: choice('remains-in-force', 'Still in force, separate from the restored ground service') },
    { key: 'shared', label: 'Dependencies still shared', required: true, rule: choice('workstation-and-power', 'The workstation and the power chain') },
    { key: 'unsupported', label: 'Task that needs SkyLink', required: true, rule: choice(INTERACTIVE, 'Interactive session, not supported on EuroSat') },
  ],
};

const settings = createFrontlineSettings(14);
if (settings.physicalPlant) {
  const plant = settings.physicalPlant;
  applyForwardField(
    plant,
    [FORWARD_FIRST_CARD, S11_TRANSFER_CARD, S11_INTERACTIVE_CARD],
    [restorationForm, comparisonForm, dependenciesForm, readinessForm, transitionForm, handoverForm]
  );
  applyForwardEurosat(plant, { modemRunning: true });
  applyForwardRemote(plant, { policyInForce: true });
  applyForwardDualReadiness(plant);
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
        id: S14_NOTICE,
        version: 1,
        providerId: FORWARD_PROVIDER,
        affects: { accountId: FORWARD_SKYLINK_ACCOUNT },
        kind: 'ground-capacity',
        issuedAtS: 0,
        text: 'SkyLink service notice. The ground-service capacity reduction on the forward post account is being lifted. This notice covers the ground-service allowance only. It does not change any remote terminal service policy.',
      },
    ],
    requests: [],
  };
  plant.events = [
    {
      id: S14_EVENT_NOTICE,
      startAfterObjectiveId: 's14-confirm-restoration',
      actions: [{ kind: 'deliver-notice', noticeId: S14_NOTICE }],
      logLine: 'A provider notice arrives for the post account.',
    },
    {
      id: S14_EVENT_LIFT,
      startAfterObjectiveId: 's14-confirm-restoration',
      offsetS: 20,
      actions: [{ kind: 'set-account', patch: { id: FORWARD_SKYLINK_ACCOUNT, restriction: undefined, capacityFactor: 1 } }],
      logLine: 'Application results change while the local equipment is unchanged.',
    },
    {
      id: S14_EVENT_EXERCISE,
      startAfterObjectiveId: 's14-test-readiness',
      actions: [{ kind: 'set-provider', patch: { id: FORWARD_PROVIDER, status: 'outage' } }],
      logLine: 'The planned readiness exercise begins: SkyLink service stops.',
    },
    {
      id: S14_EVENT_RETURN,
      startAfterObjectiveId: 's14-handover-dual-service',
      actions: [{ kind: 'set-provider', patch: { id: FORWARD_PROVIDER, status: 'normal' } }],
      logLine: 'The exercise ends and SkyLink service returns.',
    },
  ];
}

export const frontlineScenario14Data: FrontlineScenarioData = {
  id: 'frontline-scenario14',
  url: 'frontline/scenarios/frontline-scenario14',
  imageUrl: 'frontline/physical/site-forward-eurosat-scene.webp',
  number: 14,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario13'],
  difficulty: 'intermediate',
  title: 'Manage Two Available Terminals',
  subtitle: 'Readiness, Reserve, and Shared Dependencies',
  duration: '25-35 min',
  missionType: 'Field Communications',
  description:
    "SkyLink's ground service is available again, and EuroSat remains at the post. Verify the restoration, compare the two connections, and choose a configuration that supports the task without ignoring power use or shared dependencies.",
  equipment: [
    'Restored ground SkyLink service',
    'EuroSat GEO service',
    'Shared router and local network',
    'Generator and battery power station',
    'Synthetic workload and readiness checklist',
  ],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's14-confirm-restoration',
      title: 'Verify the Restored Ground Service',
      description:
        'Read the restoration notice and collect current SkyLink service measurements. Confirm the ground-service change without assuming it also removes the separate remote-terminal policy.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        eventFired(S14_EVENT_NOTICE, 'Provider notice delivered'),
        eventFired(S14_EVENT_LIFT, 'Ground restriction lifted'),
        workloadVerified({ card: INTERACTIVE, service: SKYLINK_SERVICE, afterEvent: S14_EVENT_LIFT }, 'Interactive task verified on SkyLink after the change'),
        layerObserved(SKYLINK_SERVICE, 'account', { status: 'up' }, 'SkyLink account observed unrestricted'),
        layerObserved(FORWARD_REMOTE_SERVICE, 'application', { status: 'down' }, 'Remote policy observed still in force'),
        handoverValid('restoration', 'Restoration recorded apart from the remote policy'),
      ],
    },
    {
      id: 's14-compare-services',
      title: 'Compare Both Service Profiles',
      description:
        'Measure each available connection and compare it with the current workload requirements. Record which tasks each connection supports before choosing an operating arrangement.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s14-confirm-restoration'],
      points: 15,
      conditions: [
        workloadVerified({ card: INTERACTIVE, service: SKYLINK_SERVICE }, 'Interactive task supported on SkyLink'),
        workloadRunFinished({ card: INTERACTIVE, services: [EUS], statuses: ['unsupported'] }, 'Interactive task tried on EuroSat and missing its limit'),
        workloadVerified({ card: TRANSFER, service: EUS }, 'Transfer task supported on EuroSat'),
        handoverValid('comparison', 'Each service compared with the task requirements'),
      ],
    },
    {
      id: 's14-check-dependencies',
      title: 'Identify Shared Failure Dependencies',
      description:
        'Trace the power and workstation resources used by both terminals. Record which dependencies would affect both services and which failures the alternate path could actually cover.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s14-compare-services'],
      points: 15,
      conditions: [
        diagramSelection(
          { include: ['power-station', 'power-strip', 'laptop'], exclude: ['skylink-dish', 'vsat-modem'] },
          'Shared power and workstation marked, terminals left out'
        ),
        handoverValid('dependencies', 'Shared and separate dependencies recorded'),
        {
          type: 'status-check',
          description: 'Shared Supply Risk Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Two working terminals depend on the same power station and workstation. What does the second terminal establish by itself?',
            options: [
              'Complete independence from every local power and network fault.',
              'Protection from any fault because the satellite services differ.',
              'Another service path, with common local dependencies remaining.',
              'Guaranteed reserve because either terminal can power the other.',
            ],
            correctIndex: 2,
            explanation:
              'A second service path can add options, but both paths still depend on the shared supply and workstation. Their common dependencies must be considered before describing the arrangement as independent.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's14-select-readiness',
      title: 'Choose the Operating Configuration',
      description:
        "Select the active connection and a supported standby state for the other terminal. Compare the resulting load, reserve, and recovery delay with the exercise's requirements before applying the arrangement.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s14-check-dependencies'],
      points: 15,
      conditions: [
        modeIs('skylink-dish', 'run', 'SkyLink dish active'),
        modeIs('vsat-modem', 'standby', 'EuroSat modem in standby'),
        forecastMeetsReserve({}, 'Forecast keeps the 200 Wh reserve with this arrangement'),
        handoverValid('readiness', 'Operating configuration recorded'),
      ],
    },
    {
      id: 's14-test-readiness',
      title: 'Complete the Readiness Exercise',
      description:
        'Run the approved readiness check for the selected arrangement. Measure the transition and recovery interval, then verify the workload after the service becomes ready.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s14-select-readiness'],
      points: 15,
      conditions: [
        eventFired(S14_EVENT_EXERCISE, 'Readiness exercise has begun'),
        layerObserved(SKYLINK_SERVICE, 'provider', { status: 'down' }, 'SkyLink outage observed'),
        layerObserved(EUS, 'registration', { status: 'up' }, 'EuroSat registration observed up after its startup'),
        workloadVerified({ card: TRANSFER, service: EUS, afterEvent: S14_EVENT_EXERCISE }, 'Transfer task verified on EuroSat during the exercise'),
        handoverValid('transition', 'Transition and recovery time recorded'),
      ],
    },
    {
      id: 's14-handover-dual-service',
      title: 'Hand Over Both Connections',
      description:
        'Record the active path, standby state, measured recovery time, remaining reserve, and shared dependencies. State the supported tasks and any policy restrictions that remain in force.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s14-test-readiness'],
      points: 15,
      conditions: [
        modeIs('vsat-modem', 'run', 'EuroSat modem active'),
        modeIs('skylink-dish', 'standby', 'SkyLink dish in standby'),
        forecastMeetsReserve({}, 'Forecast keeps the reserve with the final arrangement'),
        handoverValid('dual-handover', 'Dual-service handover submitted'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>The provider says SkyLink's ground-service restriction has ended. Verify the change before we count on it. With both terminals available, I need a clear account of the service, the reserve, and what they still share.</p>",
    },
    objectivesOnStart: {
      's14-compare-services': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I can compare the same test on either connection. Tell me which result belongs to which service so we don't mistake one successful check for two.</p>",
      },
      's14-select-readiness': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>Choose an arrangement we can sustain, and include the time the other terminal needs to become usable. I'll assess the plan against those limits.</p>",
      },
      's14-test-readiness': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I'm ready for the planned check. I'll record when the application stops and when its result becomes current again.</p>",
      },
    },
    objectives: {
      's14-test-readiness': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: '<p>The new check is complete, and its result belongs to the connection we just tested. The interruption and recovery are in the record too.</p>',
      },
      's14-handover-dual-service': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The handover tells me what's active, what's waiting, and what both paths depend on. I've finally finished my sketch of the station; your record is rather more useful to the next shift.</p>",
      },
    },
  },
};
