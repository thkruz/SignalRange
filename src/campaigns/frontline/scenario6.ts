import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { ServicePathConfig } from '@app/physical/service-types';
import type { RequirementCard } from '@app/physical/workload-types';
import { applyCampField, CAMP_VSAT_SERVICE, campServiceConfig, SKYLINK_SERVICE } from './camp-field-config';
import { handoverValid, workloadRunFinished } from './frontline-conditions';
import { pick, reading } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * C6 S6: controlled service comparisons at Kivilahti, not live aircraft operation.
 * Compare two workload requirements and two connection architectures independently.
 * Low-delay and GEO-like profiles are fictional authored exercise data, not real service promises.
 * The fiber and radio cases are two more paths on the SkyLink terminal that differ only in their remote leg.
 * VO direction: Eastern European accents; subtitles remain natural English.
 */
const settings = createFrontlineSettings(6);

const FIBER_SERVICE = 'skylink-fiber';
const RADIO_SERVICE = 'skylink-radio';
const PROMPT_CARD = 'prompt-response';
const QUEUED_CARD = 'queued-report';

type RunOutcome = 'supported' | 'degraded' | 'unsupported';
const MISSED: RunOutcome[] = ['degraded', 'unsupported'];

/** Fictional exercise requirement: needs a short round trip (SkyLink 45 ms passes, the GEO-like 620 ms does not) */
const PROMPT_RESPONSE_CARD: RequirementCard = {
  id: PROMPT_CARD,
  version: 1,
  label: 'Prompt-response task',
  minDownMbps: 5,
  minUpMbps: 2,
  maxRttMs: 150,
  windowS: 20,
  priority: 'mission',
};

/** Fictional exercise requirement: tolerates a long delay but still needs a steady rate */
const QUEUED_REPORT_CARD: RequirementCard = {
  id: QUEUED_CARD,
  version: 1,
  label: 'Queued-report task',
  minDownMbps: 2,
  minUpMbps: 1,
  maxRttMs: 1500,
  windowS: 20,
  priority: 'routine',
};

/** The SkyLink path with a remote leg: fiber adds 10 ms, the radio segment adds 180 ms and caps the rate at 30 Mbps */
function legPath(id: string, label: string, leg: NonNullable<ServicePathConfig['remoteLeg']>): ServicePathConfig {
  const base = campServiceConfig().paths.find((path) => path.id === SKYLINK_SERVICE);
  if (!base) {
    throw new Error('Camp service config lost the SkyLink path');
  }

  return { ...base, id, label, remoteLeg: leg };
}

const DEPENDS_FIBER = 'satellite-and-local';
const DEPENDS_RADIO = 'radio-and-satellite';
/** Every case form offers the same segment lists, so the list does not say which case it is */
const DEPENDS_OPTIONS = {
  [DEPENDS_FIBER]: 'The satellite link, provider and local network',
  [DEPENDS_RADIO]: 'The radio segment, the satellite link, provider and local network',
  'local-only': 'Only the local network',
  'satellite-only': 'Only the satellite link',
};

/** A form that binds one comparison case to the run that measured it */
function caseForm(id: string, title: string, rule: { cardId: string; is: RunOutcome[]; serviceId: string }, depends: string, finding: string): HandoverFormConfig {
  return {
    id,
    title,
    documentSection: 'Comparison cases',
    fields: [
      { key: 'run', label: 'Run for this case', required: true, rule: { workload: rule } },
      {
        key: 'depends',
        label: 'Segments still carrying the task',
        required: true,
        rule: pick(DEPENDS_OPTIONS, [depends]),
      },
      { key: 'finding', label: 'What the result establishes', required: true, rule: pick(FINDING_OPTIONS, [finding]) },
      {
        key: 'evidence',
        label: 'Observation behind the result',
        required: true,
        rule: { evidence: [reading('run-reading', 'a reading from the check run on this connection', rule.serviceId, 'application')] },
      },
    ],
  };
}

/** Parallel statements about one run, shared by all four case forms so no option names its case */
const FINDING_OPTIONS = {
  'requirement-met': 'The task met its requirement over this connection',
  'latency-missed': 'The task missed its latency limit over this connection',
  'rate-missed': 'The task missed its data-rate minimum over this connection',
  interference: 'The task was disrupted by interference on this connection',
  'terminal-fault': 'The task failed because of a terminal fault on this connection',
};
const MET = 'requirement-met';

const profileForm: HandoverFormConfig = {
  id: 'profile-comparison',
  title: 'Service profile comparison',
  documentSection: 'Profile comparison',
  fields: [
    {
      key: 'low-delay',
      label: 'Run on the low-delay profile (SkyLink)',
      required: true,
      rule: { workload: { cardId: PROMPT_CARD, is: ['supported'], serviceId: SKYLINK_SERVICE } },
    },
    {
      key: 'geo-like',
      label: 'Run on the GEO-like profile (Camp reference VSAT)',
      required: true,
      rule: { workload: { cardId: PROMPT_CARD, is: MISSED, serviceId: CAMP_VSAT_SERVICE } },
    },
    {
      key: 'changed',
      label: 'Requirement that changes from met to unmet',
      required: true,
      rule: pick({ delay: 'Round-trip delay', capacity: 'Available capacity', registration: 'Terminal link', loss: 'Packet loss' }, ['delay']),
    },
    {
      key: 'evidence',
      label: 'Observations behind the comparison',
      required: true,
      rule: {
        evidence: [
          reading('low-delay', 'a reading from the check run on the low-delay profile', SKYLINK_SERVICE, 'application'),
          reading('geo-like', 'a reading from the check run on the GEO-like profile', CAMP_VSAT_SERVICE, 'application'),
        ],
      },
    },
  ],
};

const suitabilityForm: HandoverFormConfig = {
  id: 'suitability',
  title: 'Suitability report',
  documentSection: 'Suitability',
  fields: [
    { key: 'prompt-fiber', label: 'Prompt-response over fiber', required: true, rule: { workload: { cardId: PROMPT_CARD, is: ['supported'], serviceId: FIBER_SERVICE } } },
    { key: 'prompt-radio', label: 'Prompt-response over radio', required: true, rule: { workload: { cardId: PROMPT_CARD, is: MISSED, serviceId: RADIO_SERVICE } } },
    { key: 'queued-fiber', label: 'Queued report over fiber', required: true, rule: { workload: { cardId: QUEUED_CARD, is: ['supported'], serviceId: FIBER_SERVICE } } },
    { key: 'queued-radio', label: 'Queued report over radio', required: true, rule: { workload: { cardId: QUEUED_CARD, is: ['supported'], serviceId: RADIO_SERVICE } } },
    {
      key: 'supported',
      label: 'Tasks the evidence supports',
      required: true,
      rule: pick(
        {
          'prompt-fiber-and-queued': 'Prompt-response over fiber, and the queued report over either connection',
          'everything-both': 'Both tasks over either connection',
          'fiber-only': 'Either task over fiber only',
          'queued-fiber-only': 'The queued report over fiber only',
        },
        ['prompt-fiber-and-queued']
      ),
    },
    {
      key: 'unmet',
      label: 'Requirement that was not met',
      required: true,
      rule: pick(
        {
          'prompt-radio-delay': 'Prompt-response over radio: round-trip delay',
          'prompt-radio-capacity': 'Prompt-response over radio: available capacity',
          'queued-radio-delay': 'Queued report over radio: round-trip delay',
          'none-unmet': 'Every requirement was met',
        },
        ['prompt-radio-delay']
      ),
    },
    {
      key: 'unresolved',
      label: 'Limit left unresolved',
      required: true,
      rule: pick(
        {
          'radio-segment-not-isolated': 'The radio segment was not measured on its own',
          'satellite-not-measured': 'The satellite link was not measured',
          'nothing-left': 'Nothing is left unresolved',
        },
        ['radio-segment-not-isolated']
      ),
    },
  ],
};

if (settings.physicalPlant) {
  applyCampField(
    settings.physicalPlant,
    [PROMPT_RESPONSE_CARD, QUEUED_REPORT_CARD],
    [
      profileForm,
      caseForm('case-prompt-fiber', 'Prompt-response, fiber case', { cardId: PROMPT_CARD, is: ['supported'], serviceId: FIBER_SERVICE }, DEPENDS_FIBER, MET),
      caseForm('case-prompt-radio', 'Prompt-response, radio case', { cardId: PROMPT_CARD, is: MISSED, serviceId: RADIO_SERVICE }, DEPENDS_RADIO, 'latency-missed'),
      caseForm('case-queued-fiber', 'Queued report, fiber case', { cardId: QUEUED_CARD, is: ['supported'], serviceId: FIBER_SERVICE }, DEPENDS_FIBER, MET),
      caseForm('case-queued-radio', 'Queued report, radio case', { cardId: QUEUED_CARD, is: ['supported'], serviceId: RADIO_SERVICE }, DEPENDS_RADIO, MET),
      suitabilityForm,
    ]
  );
  for (const path of settings.physicalPlant.service?.paths ?? []) {
    if (path.id === SKYLINK_SERVICE) path.label = 'SkyLink (low-delay profile)';
    if (path.id === CAMP_VSAT_SERVICE) path.label = 'Camp reference VSAT (GEO-like profile)';
  }
  settings.physicalPlant.service?.paths.push(
    legPath(FIBER_SERVICE, 'SkyLink, fiber connection', { kind: 'fiber', rttMs: 10, downMbps: 1000 }),
    legPath(RADIO_SERVICE, 'SkyLink, radio connection', { kind: 'radio', rttMs: 180, downMbps: 30 })
  );
}

export const frontlineScenario6Data: FrontlineScenarioData = {
  id: 'frontline-scenario6',
  url: 'frontline/scenarios/frontline-scenario6',
  imageUrl: 'frontline/physical/card-outside-evening.webp',
  number: 6,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario5'],
  title: 'Match the Connection to the Task',
  subtitle: 'Requirements and Connection Architecture',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Service Assessment',
  description: `Ola has two simulated tasks ready at Kivilahti. One needs prompt responses; the other tolerates longer delays. Marek will compare the same tasks over low-delay and GEO-like service profiles.<br/><br/>A fiber connection and a radio connection describe another segment of the path. Judge each task from its stated requirements and measured results. A task can be unsuitable even when every piece of equipment works.`,
  equipment: ['Camp satellite terminals', 'Router and laptop', 'Simulated workload library', 'Fiber and radio comparison diagrams'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's06-read-requirements',
      title: 'Separate the Two Questions',
      description:
        'The prompt-response task is sensitive to delay. The queued-report task tolerates delay. Explain why the fiber or radio connection must be assessed separately from those requirements.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 10,
      conditions: [
        {
          type: 'status-check',
          description: 'Requirements and Architecture Distinguished',
          mustMaintain: false,
          params: {
            character: Character.SYSTEM,
            question: 'What determines whether either task is supported across the complete connection?',
            options: [
              'The task requirements compared with measured path performance',
              'The presence of fiber, which makes every other connection segment irrelevant',
              'The terminal brand, which guarantees all applications will behave the same way',
            ],
            correctIndex: 0,
            explanation:
              'Requirements describe what the task needs. Architecture describes the segments carrying it. Fiber changes one segment, so the other segments and the application still need checking.',
            documentLine: 'Assessment method: compare task requirements with observed results for the complete path; record architecture separately.',
            documentSection: 'Comparison Method',
          },
        },
      ],
    },
    {
      id: 's06-compare-profiles',
      title: 'Compare the Service Profiles',
      description:
        'Run the same comparison workload under the camp’s low-delay profile (SkyLink) and GEO-like profile (Camp reference VSAT). Record the readings and identify which requirements change from met to unmet.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s06-read-requirements'],
      points: 15,
      conditions: [
        workloadRunFinished({ card: PROMPT_CARD, services: [SKYLINK_SERVICE, CAMP_VSAT_SERVICE] }, 'The same task run on both service profiles'),
        handoverValid('profile-comparison', 'Both profiles compared with the displayed requirement'),
      ],
    },
    {
      id: 's06-assess-fiber',
      title: 'Assess the Prompt-Response Fiber Case',
      description:
        'Choose the fiber connection in Workloads and press Inspect to read its configuration, then assess the prompt-response task against its requirement card. Identify the segments that still depend on the satellite service.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s06-compare-profiles'],
      points: 15,
      conditions: [
        workloadRunFinished({ card: PROMPT_CARD, services: [FIBER_SERVICE] }, 'Prompt-response task run over the fiber connection'),
        handoverValid('case-prompt-fiber', 'Fiber result assessed against the requirement'),
      ],
    },
    {
      id: 's06-assess-radio',
      title: 'Assess the Prompt-Response Radio Case',
      description:
        'Repeat the equivalent prompt-response comparison with the radio connection (press Inspect with it chosen to read its configuration). Identify the additional connection segment and state what the observations establish about it.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s06-assess-fiber'],
      points: 15,
      conditions: [
        workloadRunFinished({ card: PROMPT_CARD, services: [RADIO_SERVICE] }, 'Prompt-response task run over the radio connection'),
        handoverValid('case-prompt-radio', 'Radio result assessed against the requirement'),
      ],
    },
    {
      id: 's06-assess-tolerant',
      title: 'Assess Both Queued-Report Cases',
      description: 'Run the delay-tolerant task under both connection configurations. Record which requirements are met and explain any difference from the prompt-response task.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s06-assess-radio'],
      points: 20,
      conditions: [
        workloadRunFinished({ card: QUEUED_CARD, services: [FIBER_SERVICE, RADIO_SERVICE] }, 'Queued-report task run over both connections'),
        handoverValid('case-queued-fiber', 'Fiber queued-report result assessed'),
        handoverValid('case-queued-radio', 'Radio queued-report result assessed'),
      ],
    },
    {
      id: 's06-report-suitability',
      title: 'Record Supported Tasks and Limits',
      description: 'Submit the four-case comparison with supported tasks, unmet requirements, and unresolved limits. Keep an unsuitable result when the evidence supports it.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s06-assess-tolerant'],
      points: 25,
      conditions: [handoverValid('suitability', 'Suitability report matches the four recorded results')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "Today we're comparing requirements, not repairing a fault. Ola's two simulated tasks need different things from the connection. Keep the task and its path separate in your notes so you can explain each result.",
    },
    objectivesOnStart: {
      's06-compare-profiles': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: 'Use the same workload for both profiles so the comparison means something. A geostationary service can be useful even when its delay makes a particular task unsuitable.',
      },
      's06-assess-fiber': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'll use the prompt-response task first. Tell me which parts of the connection you've checked before we call the result ready.",
      },
      's06-assess-radio': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "The radio version adds another segment to assess. Its presence gives you another possible cause to investigate; it doesn't prove there's interference.",
      },
      's06-assess-tolerant': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "The queued report can wait longer for a response. I'll still need a complete result, so check the other requirements as well as delay.",
      },
      's06-report-suitability': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "Keep the results that didn't meet the requirement. They're useful evidence for deciding which task to offer, and they don't necessarily mean the equipment is faulty.",
      },
    },
    objectives: {
      's06-read-requirements': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "You've separated what the task needs from how it's connected. Now the measurements can tell you whether that particular combination is suitable.",
      },
      's06-report-suitability': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: "I can use that report to choose a supported task. You've also left the limits visible, so I won't mistake an available connection for a promise it can't meet.",
      },
    },
  },
};
