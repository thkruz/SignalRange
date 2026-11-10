import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup, HypothesisSpec } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { applyCampField, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { handoverValid, hypothesisFiled, interruptionPattern, negativeChecksKept, samplesCurrent, workloadVerified } from './frontline-conditions';
import { checked, pick, reading, repaired } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * S3: one moisture-affected terminal-side connector; no second hidden cause.
 * Current plant supports moisture evidence and repair, but moisture is NOT one of
 * its intermittent fault kinds. C6-S3-MOISTURE-SERVICE must supply the scenario's
 * interruption behavior and history before this scenario can be enabled.
 * The active instructions intentionally do not reveal the target or fault kind.
 */
const settings = createFrontlineSettings(3);
const faultId = 'c6-s3-terminal-moisture';
const connectorId = 'skylink-cable:dish';
const CAUSE_OPTIONS = [
  { id: 'connector-moisture', label: 'Moisture at a connector' },
  { id: 'cable-damage', label: 'Damaged cable' },
  { id: 'power-supply', label: 'Power supply problem' },
  { id: 'router', label: 'Router problem' },
];
const CAUSE_IDS = CAUSE_OPTIONS.map((c) => c.id);
/** Parts and connectors on the SkyLink chain a hands-on check can fairly look at */
const CHAIN = ['skylink-cable:dish', 'skylink-cable:router', 'skylink-dish', 'skylink-router', 'router:dc', 'strip:router', 'power-strip', 'power-station'];
const SYMPTOM = reading('symptom', 'a SkyLink registration reading that is not up', SKYLINK_SERVICE, 'registration', ['down', 'degraded']);
/** Either the changed reading or a hands-on look at the chain led to the plan */
const PLAN_BASIS: EvidenceGroup = {
  ...SYMPTOM,
  id: 'basis',
  label: 'a SkyLink registration reading that is not up, or a hands-on look at the chain',
  orMatch: [{ kind: 'observation', subjectIn: CHAIN }],
};
const POWER_UP = reading('power-up', 'a SkyLink terminal power reading, up', SKYLINK_SERVICE, 'power', ['up']);
const LOCAL_UP = reading('local-up', 'a SkyLink local network reading, up', SKYLINK_SERVICE, 'local', ['up']);

const HYPOTHESIS_OPTS: Omit<HypothesisSpec, 'causes'> = { minCited: 1, routes: [[PLAN_BASIS]] };

const comparisonForm: HandoverFormConfig = {
  id: 'comparison',
  title: 'Reading comparison',
  documentSection: 'Comparison',
  fields: [
    {
      key: 'changed',
      label: 'Reading that changed from the healthy record',
      required: true,
      rule: pick({ registration: 'Terminal registration', 'power-and-local': 'Terminal power and local network', all: 'Every reading' }, ['registration']),
    },
    {
      key: 'unchanged',
      label: 'Readings that still match the healthy record',
      required: true,
      rule: pick({ registration: 'Terminal registration', 'power-and-local': 'Terminal power and local network', none: 'None of them' }, ['power-and-local']),
    },
    { key: 'evidence', label: 'Observations behind the comparison', required: true, rule: { evidence: [SYMPTOM, POWER_UP, LOCAL_UP] } },
  ],
};

const checkPlanForm: HandoverFormConfig = {
  id: 'check-plan',
  title: 'Check plan',
  documentSection: 'Check plan',
  fields: [
    {
      key: 'check',
      label: 'Check you will make',
      required: true,
      rule: {
        choice: ['inspect-connector', 'test-cable', 'read-power', 'swap-terminal', 'restart-router'],
        accept: ['inspect-connector', 'test-cable', 'read-power'],
        labels: {
          'inspect-connector': 'Inspect the connector',
          'test-cable': 'Test the cable',
          'read-power': 'Read the supply voltage',
          'swap-terminal': 'Swap the terminal for a spare',
          'restart-router': 'Restart the router and see',
        },
      },
    },
    {
      key: 'expected',
      label: 'Result you expect from that check',
      required: true,
      rule: {
        choice: ['sign-of-moisture', 'leak-or-open', 'normal-reading', 'no-supply'],
        accept: ['sign-of-moisture', 'leak-or-open', 'normal-reading'],
        labels: {
          'sign-of-moisture': 'Water, residue or corrosion at the part',
          'leak-or-open': 'A leakage, open or short reading',
          'normal-reading': 'A normal reading, ruling that part out',
          'no-supply': 'No supply voltage at the part',
        },
      },
    },
    { key: 'basis', label: 'Observations that led to it', required: true, rule: { evidence: [PLAN_BASIS] } },
  ],
};

const diagnosisForm: HandoverFormConfig = {
  id: 'diagnosis',
  title: 'Diagnostic record',
  documentSection: 'Diagnosis',
  fields: [
    {
      key: 'cause',
      label: 'Cause you found',
      required: true,
      rule: pick(
        {
          'connector-moisture': 'Moisture at the terminal connector',
          'cable-damage': 'Damaged cable',
          'power-supply': 'Power supply problem',
          router: 'Router problem',
        },
        ['connector-moisture']
      ),
    },
    {
      key: 'observations',
      label: 'Observations, including checks that found nothing',
      required: true,
      rule: {
        evidence: [
          SYMPTOM,
          checked('connector', 'a hands-on look or test at the terminal cable connector', [connectorId]),
          checked('ruled-out', 'a check on the chain that found nothing wrong', CHAIN, { negative: true }),
        ],
      },
    },
    { key: 'repair', label: 'Repair you made', required: true, rule: { evidence: [repaired('fix', 'a repair that changed the terminal cable connector', [connectorId])] } },
    { key: 'verified', label: 'Fresh application check after the repair', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
  ],
};

if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_CHECK_CARD], [comparisonForm, checkPlanForm, diagnosisForm]);
  settings.physicalPlant.causeOptions = CAUSE_OPTIONS;
  settings.physicalPlant.hypothesisSpecs = [{ causes: CAUSE_IDS, ...HYPOTHESIS_OPTS }];
  settings.physicalPlant.faults = [{ id: faultId, target: connectorId, kind: 'moisture', severity: 0.8 }];
  settings.physicalPlant.spares = { 'connector-kit': 1, 'cable:power-data': 1, 'cable:coax': 0, 'power-brick': 1, 'fuel-can': 1 };
}

export const frontlineScenario3Data: FrontlineScenarioData = {
  id: 'frontline-scenario3',
  url: 'frontline/scenarios/frontline-scenario3',
  imageUrl: 'frontline/physical/site-outside.webp',
  number: 3,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario2'],
  difficulty: 'beginner',
  title: 'Find the Intermittent Fault',
  subtitle: 'Observation Before Replacement',
  duration: '25-35 min',
  missionType: 'Field Fault Diagnosis',
  description:
    'Ola reports recurring interruptions during a camp application exercise. Compare the new evidence with the healthy baseline, choose checks that distinguish plausible local causes, and justify an intervention. A repair is only complete when a fresh check verifies the result.',
  equipment: ['SkyLink terminal and router', 'Power and data cable', 'Multimeter and cable tester', 'Connector kit and replacement cable', 'Pilot workstation'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's3-establish-pattern',
      title: 'Establish the Interruption Pattern',
      description: "Compare the service history with Ola's symptom report. Record when interruptions occurred and what continued to work, without assigning a cause yet.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        interruptionPattern(SKYLINK_SERVICE, 2, 'Interruptions found in the service history and both sides read'),
        {
          type: 'status-check',
          description: 'Pattern described without a cause',
          params: {
            character: Character.SYSTEM,
            question: 'The registration reading drops out and recovers while the local network stays up. What does that pattern tell you so far?',
            options: [
              'The terminal link comes and goes while the local network holds, so the cause is open.',
              'The router has failed, because the local network and the terminal link both depend on it.',
              'Nothing yet, because an intermittent fault cannot be seen in any reading you take.',
            ],
            correctIndex: 0,
            explanation:
              'Two readings differ over time and one stays steady, so you can narrow where to look without naming a part. A repeated pattern in the history is evidence, even before you know why it happens.',
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's3-compare-baseline',
      title: 'Compare the Current Readings',
      description: 'Use the healthy reference to identify changed readings and checks that still look normal. Keep the evidence separate from your proposed explanation.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-establish-pattern'],
      conditions: [
        samplesCurrent(SKYLINK_SERVICE, ['power', 'local', 'registration'], 'Current power, local and registration readings taken'),
        handoverValid('comparison', 'Changed and unchanged readings recorded'),
      ],
    },
    {
      id: 's3-select-check',
      title: 'Choose a Distinguishing Check',
      description: 'Choose an inspection or measurement that can separate plausible local causes. State the outcome you expect before spending time or using a spare.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-compare-baseline'],
      conditions: [
        hypothesisFiled(CAUSE_IDS, HYPOTHESIS_OPTS, 'Suspected cause chosen and tied to an observation'),
        handoverValid('check-plan', 'Chosen check and expected result recorded'),
      ],
    },
    {
      id: 's3-collect-local-evidence',
      title: 'Collect the Local Evidence',
      description: 'Carry out your chosen check and follow the observations to the affected item. Keep useful negative results so you can explain what your evidence rules out.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-select-check'],
      conditions: [
        {
          id: 's3-observed-connector-evidence',
          type: 'custom',
          description: 'Physical fault evidence observed',
          params: { evaluator: () => PhysicalPlantService.plantOrNull()?.isFactRevealed(connectorId, 'moisture') === true },
          mustMaintain: false,
        },
        negativeChecksKept(1, 'A check that found nothing wrong kept as evidence', { subjects: CHAIN }),
      ],
    },
    {
      id: 's3-assess-local-cause',
      title: 'Assess the Observed Cause',
      description: 'Use the connector observation to choose a justified intervention. Explain what the observation supports and what still needs verification after the work.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-collect-local-evidence'],
      conditions: [
        {
          type: 'status-check',
          description: 'Intervention justified by the observation',
          params: {
            character: Character.SYSTEM,
            question: "The connector check revealed moisture. Which conclusion is supported before you've completed a repair and a fresh service test?",
            options: [
              'The observation proves the application will recover as soon as the router is restarted.',
              'The observation makes every earlier normal result irrelevant, so replace all local equipment.',
              'The observation justifies connector work, with service recovery still unverified.',
            ],
            correctIndex: 2,
            explanation:
              "The moisture is an observed local defect, so you have a reason to address it. You still need a new service check because finding a defect doesn't establish that every required function has recovered.",
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's3-repair-local-fault',
      title: 'Complete the Supported Repair',
      description: 'Apply a supported intervention to the item identified by your evidence. Check the displayed time, disruption, and spare cost before committing.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-assess-local-cause'],
      conditions: [
        { type: 'plant-fault-cleared', description: 'Observed local defect cleared', params: { faultId }, mustMaintain: true },
        {
          id: 's3-evidence-before-intervention',
          type: 'custom',
          description: 'Effective intervention followed fault evidence',
          params: {
            evaluator: () => {
              const log = PhysicalPlantService.plantOrNull()?.getLog() ?? [];
              const observed = log.findIndex((entry) => entry.revealed.includes(faultId));
              return observed >= 0 && log.some((entry, index) => index > observed && entry.cleared.includes(faultId) && entry.effective === true);
            },
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's3-verify-and-record',
      title: 'Verify and Document Recovery',
      description:
        'Repeat the relevant service check after the intervention. Submit the evidence, repair, resources used, and new result, keeping unresolved limitations explicit.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s3-repair-local-fault'],
      conditions: [
        workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE, afterFaultCleared: faultId }, 'Fresh application check passed after the repair'),
        handoverValid('diagnosis', 'Diagnostic record submitted'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.ALEKSANDRA_WYSOCKA,
      emotion: Emotion.CONCERNED,
      audioUrl: '',
      text: "<p>The application has stopped updating more than once during this exercise. It resumes between interruptions, but I can't tell you which part of the connection caused them.</p>",
    },
    objectivesOnStart: {
      's3-establish-pattern': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Start with the history and Ola's report. Find out what happened before choosing which part of the kit to investigate.</p>",
      },
      's3-compare-baseline': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Compare like readings with like readings. A normal result is useful if it helps you distinguish one possible cause from another.</p>',
      },
      's3-select-check': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Tell me what your next check could establish. If both possible results leave your explanation unchanged, consider whether another check would teach you more.</p>',
      },
      's3-collect-local-evidence': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Use the observations to decide where to look next. You don't need to replace a part just because you've inspected it.</p>",
      },
      's3-assess-local-cause': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>You've observed a local defect. Explain the intervention it supports, then keep service recovery as a separate question.</p>",
      },
      's3-repair-local-fault': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Choose the supported work that addresses your observation. Read its cost before you commit so the interruption and any spare use are deliberate.</p>',
      },
      's3-verify-and-record': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'm ready for a new application check. Keep this result separate from the earlier runs so we can see what changed after the work.</p>",
      },
    },
    objectives: {
      's3-collect-local-evidence': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Your observation gives you a reason to intervene. Keep the earlier checks too; they explain how you reached this item.</p>',
      },
      's3-repair-local-fault': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>The recorded intervention cleared the observed defect. We still need the application result before calling the service recovered.</p>',
      },
      's3-verify-and-record': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: '<p>The new check completed, and its result is attached to the repair record. Now I can see which run verifies the work.</p>',
      },
    },
  },
};
