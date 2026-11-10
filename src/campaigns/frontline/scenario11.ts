import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { RequirementCard } from '@app/physical/workload-types';
import { SKYLINK_SERVICE } from './camp-field-config';
import { S10_PACKAGE_LINK } from './continuity-fallbacks';
import {
  applyForwardEurosat,
  applyForwardField,
  FORWARD_EUROSAT_ACCOUNT,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_EUROSAT_UNIT,
  FORWARD_FIRST_CARD,
  FORWARD_SKYLINK_ACCOUNT,
  FORWARD_SKYLINK_UNIT,
} from './forward-field-config';
import { forecastMeetsReserve, handoverValid, layerObserved, modeIs, recordAccepted, samplesCurrent, workloadRunFinished, workloadVerified } from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * Frontline Signals — Scenario 11: Bring EuroSat Into Service.
 * Initial state: EuroSat equipment arrives at Rautala; SkyLink remains capacity-restricted.
 * The delivery and account record are available on entry; commissioning precedes every service measurement.
 * The intended workload is a delay-tolerant synthetic transfer. A separate interactive workload remains unsupported.
 * GEO propagation and test thresholds must come from the future service model, not the sandbox modem lock alone.
 * Authoring draft: missing mechanics are fail-closed, never quiz substitutes.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S11_TRANSFER_CARD: RequirementCard = {
  id: 'fwd-transfer',
  version: 1,
  label: 'Delay-tolerant transfer',
  minDownMbps: 10,
  minUpMbps: 2,
  maxRttMs: 1000,
  windowS: 60,
  priority: 'routine',
};
export const S11_INTERACTIVE_CARD: RequirementCard = {
  id: 'fwd-interactive',
  version: 1,
  label: 'Interactive session',
  minDownMbps: 10,
  minUpMbps: 4,
  maxRttMs: 150,
  windowS: 60,
  priority: 'mission',
};

const deliveryForm: HandoverFormConfig = {
  id: 'delivery',
  title: 'EuroSat delivery reconciliation',
  documentSection: 'Delivery',
  fields: [
    {
      key: 'serial',
      label: 'Terminal serial against the delivery record',
      required: true,
      rule: pick({ matches: 'Matches the record', mismatch: 'Does not match', unchecked: 'Not compared' }, ['matches']),
    },
    {
      key: 'account',
      label: 'Account assignment',
      required: true,
      rule: pick({ matches: 'Matches the authorized account', mismatch: 'Does not match', unchecked: 'Not compared' }, ['matches']),
    },
    {
      key: 'accessories',
      label: 'Accessories against the list',
      required: true,
      rule: pick({ complete: 'Complete', 'missing-items': 'Items missing', 'not-checked': 'Not checked' }, ['complete']),
    },
    {
      key: 'depot',
      label: 'What the depot test covered',
      required: true,
      rule: pick({ 'hardware-only': 'The hardware only, with no service tested', 'service-tested': 'The service was tested end to end', 'nothing-tested': 'Nothing was tested' }, [
        'hardware-only',
      ]),
    },
  ],
};

const commissioningForm: HandoverFormConfig = {
  id: 'commissioning',
  title: 'EuroSat commissioning checks',
  documentSection: 'Commissioning',
  fields: [
    {
      key: 'unit',
      label: 'Unit commissioned',
      required: true,
      rule: pick({ [FORWARD_EUROSAT_UNIT]: 'The accepted EuroSat terminal', 'camp-vsat': 'The camp VSAT terminal', 'skylink-unit': 'The SkyLink terminal' }, [
        FORWARD_EUROSAT_UNIT,
      ]),
    },
    { key: 'mode', label: 'Terminal mode now', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'registration', label: 'Terminal registration now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'registration' } } },
    { key: 'account', label: 'Account authorization now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'account' } } },
    {
      key: 'service',
      label: 'What these checks establish',
      required: true,
      rule: pick(
        {
          'ready-not-proven': 'The terminal is ready; end-to-end service is not yet measured',
          proven: 'The terminal is ready and service is proven end to end',
          'not-ready': 'The terminal is not ready',
        },
        ['ready-not-proven']
      ),
    },
  ],
};

/** A numeric reading: the terminal app or local probe reads it at the registration layer, a workload run at the application layer */
const numeric = (id: string, label: string, metric: string): EvidenceGroup => ({
  ...reading(id, label, FORWARD_EUROSAT_SERVICE, 'registration', undefined, { metric }),
  orMatch: [{ kind: 'observation', serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application', metric }],
});
const EUS_DELAY = numeric('delay', 'a delay reading from the EuroSat service', 'rttMs');
const EUS_RATE = numeric('rate', 'a download rate reading from the EuroSat service', 'downMbps');
const EUS_LOSS = numeric('loss', 'a loss reading from the EuroSat service', 'lossPct');

const measurementForm: HandoverFormConfig = {
  id: 'measurement',
  title: 'EuroSat service measurement',
  documentSection: 'Measurement',
  fields: [
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'local' } } },
    { key: 'application', label: 'Application service now', required: true, rule: { matchesCurrent: { serviceId: FORWARD_EUROSAT_SERVICE, layer: 'application' } } },
    { key: 'samples', label: 'Delay, rate and loss readings kept', required: true, rule: { evidence: [EUS_DELAY, EUS_RATE, EUS_LOSS] } },
    {
      key: 'delay',
      label: 'Delay against the SkyLink reference',
      required: true,
      rule: pick({ 'much-higher': 'Much higher, as expected for a GEO path', similar: 'About the same', lower: 'Lower' }, ['much-higher']),
    },
  ],
};

const suitabilityForm: HandoverFormConfig = {
  id: 'suitability',
  title: 'Workload suitability',
  documentSection: 'Suitability',
  fields: [
    {
      key: 'transfer',
      label: 'Delay-tolerant transfer',
      required: true,
      rule: pick({ supported: 'Supported by the measurements', unsupported: 'Not supported', marginal: 'Marginal, depends on conditions' }, ['supported']),
    },
    {
      key: 'interactive',
      label: 'Interactive session',
      required: true,
      rule: pick({ unsupported: 'Not supported', supported: 'Supported', marginal: 'Marginal, depends on conditions' }, ['unsupported']),
    },
    {
      key: 'unmet',
      label: 'Requirement the interactive session misses',
      required: true,
      rule: pick({ delay: 'Round-trip delay above its limit', rate: 'Download rate below its limit', loss: 'Packet loss above its limit' }, ['delay']),
    },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { evidence: [EUS_DELAY, EUS_RATE] } },
  ],
};

const capabilityForm: HandoverFormConfig = {
  id: 'capability',
  title: 'Restored capability report',
  documentSection: 'Capability',
  fields: [
    { key: 'verified', label: 'Task window you ran', required: true, rule: { workload: { cardId: S11_TRANSFER_CARD.id, is: ['supported'], serviceId: FORWARD_EUROSAT_SERVICE } } },
    { key: 'energy', label: 'Battery energy left (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
    { key: 'skylink', label: 'SkyLink account state now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'account' } } },
    {
      key: 'restored',
      label: 'Capability EuroSat restored',
      required: true,
      rule: pick({ [S11_TRANSFER_CARD.id]: 'Delay-tolerant transfer', [S11_INTERACTIVE_CARD.id]: 'Interactive session', neither: 'Neither task' }, [S11_TRANSFER_CARD.id]),
    },
    {
      key: 'unavailable',
      label: 'Task that stays unavailable',
      required: true,
      rule: pick({ [S11_INTERACTIVE_CARD.id]: 'Interactive session, because of its delay limit', [S11_TRANSFER_CARD.id]: 'Delay-tolerant transfer', neither: 'Neither task' }, [
        S11_INTERACTIVE_CARD.id,
      ]),
    },
    {
      key: 'restriction',
      label: 'SkyLink restriction',
      required: true,
      rule: pick({ 'remains-active': 'Still in force', lifted: 'Lifted', unknown: 'Not known' }, ['remains-active']),
    },
  ],
};

const scenarioSettings = createFrontlineSettings(11);
if (scenarioSettings.physicalPlant) {
  scenarioSettings.physicalPlant.incoming = [S10_PACKAGE_LINK.spec];
  applyForwardField(
    scenarioSettings.physicalPlant,
    [FORWARD_FIRST_CARD, S11_TRANSFER_CARD, S11_INTERACTIVE_CARD],
    [deliveryForm, commissioningForm, measurementForm, suitabilityForm, capabilityForm]
  );
  applyForwardEurosat(scenarioSettings.physicalPlant);
  scenarioSettings.physicalPlant.equipment = {
    units: [
      {
        unitId: FORWARD_SKYLINK_UNIT,
        label: 'Commissioned SkyLink terminal',
        record: { serial: 'SKY-7731', accountId: FORWARD_SKYLINK_ACCOUNT, configVersion: 'depot-v3' },
      },
      {
        unitId: FORWARD_EUROSAT_UNIT,
        label: 'Delivered EuroSat terminal',
        record: { serial: 'EUS-2208', accountId: FORWARD_EUROSAT_ACCOUNT, configVersion: 'depot-v2' },
      },
    ],
  };
}

export const frontlineScenario11Data: FrontlineScenarioData = {
  id: 'frontline-scenario11',
  url: 'frontline/scenarios/frontline-scenario11',
  imageUrl: 'frontline/physical/site-forward-eurosat-scene.webp',
  number: 11,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario10'],
  difficulty: 'intermediate',
  title: 'Bring EuroSat Into Service',
  subtitle: 'Useful Service With Known Limits',
  duration: '25-35 min',
  missionType: 'Field Communications',
  description:
    'Tomek has brought the EuroSat kit from Saarikoski depot. Commission the new connection, establish what it can support, and give Irena a service report that includes the tasks still unavailable. Ola will run the simulated workload checks once the connection is ready.',
  equipment: [
    'EuroSat GEO terminal and modem',
    'SkyLink terminal with restricted service',
    'Router and pilot workstation',
    'Generator and battery power station',
    'Service records and commissioning checklist',
  ],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's11-receive-equipment',
      title: 'Accept the EuroSat Delivery',
      description:
        'Compare the delivered terminal, accessories, and account assignment with the authorized delivery record. Record any discrepancy before commissioning the connection.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [
        {
          type: 'part-inspected',
          description: 'Delivered Modem Inspected',
          params: {
            partId: 'vsat-modem',
          },
          mustMaintain: false,
        },
        handoverValid('delivery', 'Delivery and account reconciled with the record'),
        recordAccepted(FORWARD_EUROSAT_UNIT, 'Authorized EuroSat configuration accepted'),
      ],
    },
    {
      id: 's11-commission-terminal',
      title: 'Commission the New Connection',
      description: 'Use the approved setup procedure for the accepted EuroSat unit. Confirm readiness through its own commissioning checks before asking Ola to run a workload.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s11-receive-equipment'],
      points: 15,
      conditions: [
        modeIs('vsat-modem', 'run', 'Terminal switched to run after acceptance'),
        layerObserved(FORWARD_EUROSAT_SERVICE, 'registration', { status: 'up' }, 'Registration observed up after startup'),
        forecastMeetsReserve({}, 'Battery forecast keeps the reserve with both terminals'),
        handoverValid('commissioning', 'Commissioning checks recorded without claiming service'),
      ],
    },
    {
      id: 's11-measure-service',
      title: 'Measure the Available Service',
      description: 'Collect a fresh EuroSat service sample after commissioning. Compare delay, delay variation, usable capacity, and interruptions with the camp GEO reference.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s11-commission-terminal'],
      points: 15,
      conditions: [
        samplesCurrent(FORWARD_EUROSAT_SERVICE, ['power', 'local', 'registration', 'account', 'application'], 'Current readings taken for every layer'),
        handoverValid('measurement', 'Measurements compared with the SkyLink reference'),
      ],
    },
    {
      id: 's11-select-workload',
      title: 'Assess the Pending Workloads',
      description:
        'Compare the measured connection with the displayed requirements of both pending tasks. Select the supported workload and record why the other task remains unavailable.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s11-measure-service'],
      points: 15,
      conditions: [
        workloadRunFinished({ card: S11_INTERACTIVE_CARD.id, services: [FORWARD_EUROSAT_SERVICE], statuses: ['unsupported'] }, 'Interactive session tried and missing its limit'),
        handoverValid('suitability', 'Each task assessed against the measurements'),
        {
          type: 'status-check',
          description: 'GEO Limitation Understood',
          params: {
            character: Character.SYSTEM,
            question: "A GEO service meets a transfer's capacity requirement but exceeds an interactive task's delay limit. Which assessment follows?",
            options: [
              'Both tasks are ready because the terminal is registered.',
              'The transfer may qualify; the interactive task does not.',
              'Neither task can run because every service needs low delay.',
              'Both tasks qualify after the local modem is restarted.',
            ],
            correctIndex: 1,
            explanation:
              "Suitability depends on the requirements of each task. Meeting the transfer's requirements doesn't remove the interactive task's delay limit, and restarting the modem doesn't change that assessment.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's11-verify-workload',
      title: 'Verify the Supported Task',
      description:
        "Run the selected workload through the commissioned EuroSat connection. Observe the whole test window and confirm that the application's result meets the displayed requirement.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s11-select-workload'],
      points: 15,
      conditions: [
        workloadVerified({ card: S11_TRANSFER_CARD.id, service: FORWARD_EUROSAT_SERVICE, afterHandover: 'suitability' }, 'Supported task window run after the assessment'),
        samplesCurrent(FORWARD_EUROSAT_SERVICE, ['application'], 'Endpoint confirmation current'),
      ],
    },
    {
      id: 's11-handover-capability',
      title: 'Report the Restored Capability',
      description:
        "Record the available workload, observed power demand, and remaining SkyLink restriction. State the interactive task's limitation separately from the capability restored by EuroSat.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s11-verify-workload'],
      points: 15,
      conditions: [
        {
          type: 'part-inspected',
          description: 'Power Station Read for the Load Report',
          mustMaintain: false,
          params: { partId: 'power-station' },
        },
        handoverValid('capability', 'Restored and unavailable work reported with the SkyLink restriction'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.TOMASZ_WRONA,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>The EuroSat kit is here with its service record. The depot check passed, but you'll need to confirm the account and the service here. I've brought the delivery sheet inside; the van's become a filing cabinet again.</p>",
    },
    objectivesOnStart: {
      's11-commission-terminal': {
        character: Character.TOMASZ_WRONA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The delivery record tells us which unit belongs here. It doesn't tell us whether the connection is ready. Keep the commissioning result with this unit so the next check refers to the same equipment.</p>",
      },
      's11-select-workload': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I need a task we can actually support. If the other request still exceeds the connection's limits, leave it unavailable and include the reason in your report.</p>",
      },
      's11-verify-workload': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I'll run the selected test at my end. Let the full check finish before we call the service ready; a moving picture alone won't tell us enough.</p>",
      },
    },
    objectives: {
      's11-verify-workload': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: '<p>The selected check completed at my end, and its result is current. We have a useful connection for that task. The separate interactive request still needs its own requirement met.</p>',
      },
      's11-handover-capability': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>Your report states what EuroSat restored and what remains unavailable. I can use that without promising a service we haven't verified.</p>",
      },
    },
  },
};
