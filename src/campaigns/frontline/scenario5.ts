import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { RequirementCard } from '@app/physical/workload-types';
import { applyCampField, SKYLINK_SERVICE } from './camp-field-config';
import { handoverValid, hypothesisFiled, priorityDeferred, samplesCurrent, workloadRunFinished, workloadVerified } from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * S5: healthy physical plant and online terminal; one nonessential simulated
 * transfer consumes the shared local service. No connector, weather, or provider fault.
 * The intended resolution is the exercise's approved priority setting, followed
 * by a new workload check. No real network configuration instructions are taught.
 * The transfer is a standing workload that starts at high priority, so it is already
 * running before the first symptom observation and cannot be stopped from the panel.
 */
const settings = createFrontlineSettings(5);

const APP_CARD = 'ola-app';
const TRANSFER_CARD = 'sync-transfer';

/** Needs 70 Mbps down: met alone (120) or at a two-thirds share (80), missed at a one-third share (40) */
const OLA_APP_CARD: RequirementCard = {
  id: APP_CARD,
  version: 1,
  label: 'Ola application update',
  minDownMbps: 70,
  minUpMbps: 4,
  maxRttMs: 150,
  windowS: 30,
  priority: 'routine',
};

/** Nonessential file sync, running since before the shift at the highest share weight (4) */
const SYNC_TRANSFER_CARD: RequirementCard = {
  id: TRANSFER_CARD,
  version: 1,
  label: 'Nonessential file sync',
  minDownMbps: 20,
  windowS: 86_400,
  priority: 'background',
  startWeight: 4,
  standing: true,
};

const CAUSE_OPTIONS = [
  { id: 'shared-capacity', label: 'Another workload using the shared local service' },
  { id: 'terminal-fault', label: 'Terminal or cable fault' },
  { id: 'local-network', label: 'Router or laptop problem' },
  { id: 'provider-limit', label: 'Provider restriction' },
];

const comparisonForm: HandoverFormConfig = {
  id: 'service-comparison',
  title: 'Service readings against the requirement',
  documentSection: 'Service readings',
  fields: [
    {
      key: 'run',
      label: 'Application check that missed the requirement',
      required: true,
      rule: { workload: { cardId: APP_CARD, is: ['degraded', 'unsupported'], serviceId: SKYLINK_SERVICE } },
    },
    {
      key: 'short',
      label: 'Reading that fell short',
      required: true,
      rule: { choice: ['capacity'], labels: { capacity: 'Available capacity' } },
    },
    {
      key: 'met',
      label: 'Readings that met the requirement',
      required: true,
      rule: { choice: ['delay-and-registration'], labels: { 'delay-and-registration': 'Delay and terminal registration' } },
    },
    { key: 'evidence', label: 'Observations behind the comparison', required: true, rule: { cites: 'observation', min: 2 } },
  ],
};

const scopeForm: HandoverFormConfig = {
  id: 'scope',
  title: 'Affected part of the service',
  documentSection: 'Service scope',
  fields: [
    {
      key: 'scope',
      label: 'Part of the service your evidence implicates',
      required: true,
      rule: { choice: ['local-shared-service'], labels: { 'local-shared-service': 'The shared local service' } },
    },
    {
      key: 'ruled-out',
      label: 'What the readings rule out',
      required: true,
      rule: { choice: ['terminal-and-power'], labels: { 'terminal-and-power': 'Terminal registration and power' } },
    },
    { key: 'evidence', label: 'Observations that separate it from the alternatives', required: true, rule: { cites: 'observation', min: 2 } },
  ],
};

const attributionForm: HandoverFormConfig = {
  id: 'attribution',
  title: 'Shared demand',
  documentSection: 'Shared demand',
  fields: [
    {
      key: 'workload',
      label: 'Workload using the shared capacity',
      required: true,
      rule: { choice: [TRANSFER_CARD], labels: { [TRANSFER_CARD]: 'Nonessential file sync' } },
    },
    {
      key: 'keep',
      label: 'Work that must keep its capacity',
      required: true,
      rule: { choice: [APP_CARD], labels: { [APP_CARD]: 'Ola application update' } },
    },
    { key: 'basis', label: 'Observation behind the attribution', required: true, rule: { cites: 'observation', min: 1 } },
  ],
};

const recordForm: HandoverFormConfig = {
  id: 'service-record',
  title: 'Service record',
  documentSection: 'Service record',
  fields: [
    {
      key: 'before',
      label: 'Application check before the change',
      required: true,
      rule: { workload: { cardId: APP_CARD, is: ['degraded', 'unsupported'], serviceId: SKYLINK_SERVICE } },
    },
    {
      key: 'after',
      label: 'Application check after the change',
      required: true,
      rule: { workload: { cardId: APP_CARD, is: ['supported'], serviceId: SKYLINK_SERVICE } },
    },
    {
      key: 'cause',
      label: 'Supported cause',
      required: true,
      rule: { choice: ['shared-capacity'], labels: { 'shared-capacity': 'Shared local capacity' } },
    },
    {
      key: 'deferred',
      label: 'Work that was deferred',
      required: true,
      rule: { choice: [TRANSFER_CARD], labels: { [TRANSFER_CARD]: 'Nonessential file sync' } },
    },
    {
      key: 'terminal',
      label: 'Terminal equipment',
      required: true,
      rule: { choice: ['unchanged'], labels: { unchanged: 'Left as it was; it was not the cause' } },
    },
  ],
};

if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_APP_CARD, SYNC_TRANSFER_CARD], [comparisonForm, scopeForm, attributionForm, recordForm]);
  settings.physicalPlant.causeOptions = CAUSE_OPTIONS;
  if (settings.physicalPlant.workloads) {
    settings.physicalPlant.workloads.autoStart = [{ cardId: TRANSFER_CARD, serviceId: SKYLINK_SERVICE }];
  }
}

export const frontlineScenario5Data: FrontlineScenarioData = {
  id: 'frontline-scenario5',
  url: 'frontline/scenarios/frontline-scenario5',
  imageUrl: 'frontline/sandbox/card.png',
  number: 5,
  isDisabled: true,
  prerequisiteScenarioIds: ['frontline-scenario4'],
  difficulty: 'intermediate',
  title: 'Check the Service Beyond the Dish',
  subtitle: 'Terminal Status, Shared Capacity, and Application Results',
  duration: '25-35 min',
  missionType: 'Service Diagnosis',
  description:
    "The terminal reports online, but Ola's application isn't meeting its exercise requirement. Compare the terminal, local network, and application evidence. Identify what is using the shared service, apply the permitted priority setting, and verify whether the application becomes usable.",
  equipment: ['SkyLink terminal and router', 'Local service panel', 'Simulated workload list', 'Pilot workstation'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's5-compare-endpoints',
      title: 'Compare Terminal and Application',
      description: "Observe the terminal's state and the application's current behavior. Record both results instead of treating an online indicator as proof of usable service.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        samplesCurrent(SKYLINK_SERVICE, ['registration'], 'Current terminal registration reading taken'),
        workloadRunFinished({ card: APP_CARD, services: [SKYLINK_SERVICE], statuses: ['degraded', 'unsupported'] }, 'Application check run and finished'),
        {
          type: 'status-check',
          description: 'Meaning of terminal status understood',
          params: {
            character: Character.SYSTEM,
            question: 'A terminal is registered, but an application is missing its service requirement. What can registration alone establish?',
            options: [
              'It establishes that every local device and application meets its current service requirement.',
              'It establishes the terminal state, while application usability still needs separate evidence.',
              'It establishes that the application fault must be outside the local network equipment.',
            ],
            correctIndex: 1,
            explanation: "Registration describes the terminal's connection state. It doesn't measure the whole path or prove that the application's requirement is being met.",
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's5-read-service-quality',
      title: 'Read the Service Indicators',
      description:
        'Read available capacity, delay, variation in delay, and interruptions in the service panel. Compare the readings with the stated application requirement and healthy reference.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s5-compare-endpoints'],
      conditions: [handoverValid('service-comparison', 'Readings compared with the application requirement')],
    },
    {
      id: 's5-assess-service-scope',
      title: 'Assess the Affected Service',
      description:
        'Use the observed evidence to distinguish satellite service, local networking, and application behavior. State what your evidence supports and what remains uncertain.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s5-read-service-quality'],
      conditions: [
        hypothesisFiled(['shared-capacity'], { minCited: 2 }, 'Suspected cause chosen and tied to observations'),
        handoverValid('scope', 'Affected part of the service recorded with its evidence'),
      ],
    },
    {
      id: 's5-identify-shared-use',
      title: 'Identify the Shared Workload',
      description:
        'Inspect the workloads using the connection. Identify which activity explains the observed demand and distinguish essential work from the exercise transfer that can wait.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s5-assess-service-scope'],
      conditions: [handoverValid('attribution', 'Shared demand attributed to an observed workload')],
    },
    {
      id: 's5-apply-priority',
      title: 'Apply the Approved Priority',
      description:
        'Review the effect of the permitted service-priority setting on both workloads. Apply the setting that meets the required application need while recording what work is deferred.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s5-identify-shared-use'],
      conditions: [priorityDeferred({ defer: TRANSFER_CARD, keep: APP_CARD }, 'Approved allocation change applied')],
    },
    {
      id: 's5-verify-service-change',
      title: 'Verify the Local Change',
      description:
        'Run a new application check and compare it with the earlier result. Record the local change, the deferred work, and why terminal replacement was not justified by the evidence.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s5-apply-priority'],
      conditions: [
        workloadVerified({ card: APP_CARD, service: SKYLINK_SERVICE }, 'Fresh application check meets the requirement'),
        handoverValid('service-record', 'Before and after results recorded with the deferred work'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.ALEKSANDRA_WYSOCKA,
      emotion: Emotion.CONCERNED,
      audioUrl: '',
      text: "<p>The terminal shows online, but my application updates are arriving too slowly for this exercise. I can describe what I'm seeing; I can't tell you yet which part of the service explains it.</p>",
    },
    objectivesOnStart: {
      's5-compare-endpoints': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Keep the terminal status and Ola's result separate. They describe different parts of the path, and both observations belong in your assessment.</p>",
      },
      's5-read-service-quality': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Capacity is how much traffic the service can carry. Delay is how long a response takes, and delay variation describes how that timing changes. Compare those readings with the exercise requirement.</p>',
      },
      's5-assess-service-scope': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Which part of the service do your observations implicate? Explain the evidence that distinguishes it from the alternatives, and leave any uncertainty visible.</p>',
      },
      's5-identify-shared-use': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Look at the work sharing this connection. Find out what each activity needs before deciding which demand can be deferred.</p>',
      },
      's5-apply-priority': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Use the exercise's approved priority setting. Check what happens to the other workload before committing; its unfinished work still needs a record.</p>",
      },
      's5-verify-service-change': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'll run the same application check again. Compare the new result with the earlier one so we can judge what the local change achieved.</p>",
      },
    },
    objectives: {
      's5-read-service-quality': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>You've collected service readings as well as a terminal status. Use those observations to narrow the problem before changing equipment.</p>",
      },
      's5-apply-priority': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>The local priority setting has changed. Its application result still needs checking, and the deferred work remains part of your handover.</p>',
      },
      's5-verify-service-change': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: "<p>The new result meets this exercise's requirement. Your record also shows what work is waiting, so the next operator can see the consequence of the change.</p>",
      },
    },
  },
};
