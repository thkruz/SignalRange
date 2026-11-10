import { Character, Emotion } from '@app/modal/character-enum';
import type { EvidenceGroup, HypothesisSpec } from '@app/physical/evidence-predicates';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { RequirementCard } from '@app/physical/workload-types';
import { applyCampField, SKYLINK_SERVICE } from './camp-field-config';
import {
  faultClearedWithEvidence,
  faultEvidenceRecorded,
  handoverCurrent,
  handoverValid,
  hypothesisFiled,
  negativeChecksKept,
  samplesCurrent,
  serviceReserveVerified,
} from './frontline-conditions';
import { checked, pick, reading, repaired } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData, recordRunPower } from './scenario-support';

/**
 * C6 S8: independent camp assessment using concepts introduced in S1–S7.
 * Authored truth: moisture at the router-side terminal cable connector, one repairable local fault.
 * Do not expose the target through an active instruction or add hints to completion dialogue.
 * Assessment: the brief form states requirement, limits, reserve and trip allowance; the diagnostic route is free. Any
 * discriminating check is credited and the diagnosis is graded as an authored cause option. Verification is a fresh
 * 60 s workload window after the repair plus a held battery reserve.
 */
const ASSESS_CARD: RequirementCard = {
  id: 'ola-assess',
  version: 1,
  label: 'Ola assessment requirement',
  minDownMbps: 5,
  minUpMbps: 2,
  maxRttMs: 150,
  windowS: 60,
  priority: 'mission',
};
const FAULT_ID = 's08-local-fault';
const RESERVE_WH = 150;
const RESERVE_WINDOW_S = 60;

const CAUSES = {
  'connector-moisture': 'Moisture at a cable connector',
  'cable-damage': 'Damaged cable',
  'power-supply': 'Power supply',
  router: 'Router',
  terminal: 'Terminal',
};
/** Parts and connectors a fair diagnostic route can look at */
const CHAIN = ['skylink-cable:dish', 'skylink-cable:router', 'skylink-cable', 'skylink-dish', 'skylink-router', 'router:dc', 'strip:router', 'power-strip', 'power-station'];
const FAULT_SITE = ['skylink-cable:router', 'skylink-cable'];
const SYMPTOM: EvidenceGroup = reading('symptom', 'an application reading that is not up', SKYLINK_SERVICE, 'application', ['down', 'degraded']);
/** The local cause was located by a hands-on look at the cable or its connectors */
const LOCATED: EvidenceGroup = checked('located', 'a hands-on look or test at the cable or its connectors', FAULT_SITE);
const RULED_OUT: EvidenceGroup = checked('ruled-out', 'a check on the chain that found nothing wrong', CHAIN, { negative: true });
const REPAIR: EvidenceGroup = repaired('fix', 'a repair that changed the cable or its connectors', FAULT_SITE);
/** An operator who repaired first can still file: the repair, then the service reading up afterwards (the diagnosis is scored as unsupported) */
const RECOVERY_ROUTE: EvidenceGroup[] = [
  REPAIR,
  reading('recovered', 'an application reading, up, taken after the repair', SKYLINK_SERVICE, 'application', ['up'], { afterFirstFix: true }),
];

const HYPOTHESIS_OPTS: Omit<HypothesisSpec, 'causes'> = { minCited: 2, routes: [[SYMPTOM, LOCATED], RECOVERY_ROUTE] };

const assignmentForm: HandoverFormConfig = {
  id: 'assignment',
  title: 'Assessment brief',
  documentSection: 'Assignment',
  fields: [
    {
      key: 'requirement',
      label: 'Workload requirement',
      required: true,
      rule: pick(
        {
          '5-2-150': 'At least 5 Mbps down, 2 Mbps up and a round trip within 150 ms',
          '2-5-150': 'At least 2 Mbps down, 5 Mbps up and a round trip within 150 ms',
          '5-2-1500': 'At least 5 Mbps down, 2 Mbps up and a round trip within 1500 ms',
        },
        ['5-2-150']
      ),
    },
    {
      key: 'limits',
      label: 'Resource limits',
      required: true,
      rule: pick(
        {
          'one-kit-one-cable': 'One connector kit and one power and data cable',
          'two-kits': 'Two connector kits',
          'unlimited-spares': 'Any spares the store holds',
        },
        ['one-kit-one-cable']
      ),
    },
    {
      key: 'reserve',
      label: 'Battery reserve to keep',
      required: true,
      rule: pick({ '150wh': 'At least 150 Wh', '300wh': 'At least 300 Wh', '50wh': 'At least 50 Wh' }, ['150wh']),
    },
    { key: 'trips', label: 'Trips outside allowed', required: true, rule: pick({ one: 'One', three: 'Three', unlimited: 'As many as needed' }, ['three']) },
  ],
};

const planForm: HandoverFormConfig = {
  id: 'plan',
  title: 'Diagnostic plan',
  documentSection: 'Plan',
  fields: [
    { key: 'symptom', label: 'Application reading now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    {
      key: 'check',
      label: 'Check that would tell causes apart',
      required: true,
      rule: {
        choice: ['inspect-connectors', 'test-cable', 'compare-reference-service', 'read-indicators', 'swap-everything'],
        accept: ['inspect-connectors', 'test-cable', 'compare-reference-service', 'read-indicators'],
        labels: {
          'swap-everything': 'Replace parts until it works',
          'inspect-connectors': 'Inspect the connectors',
          'test-cable': 'Test the cable',
          'compare-reference-service': 'Compare with the reference service',
          'read-indicators': 'Read the device indicators',
        },
      },
    },
    { key: 'basis', label: 'Observation behind it', required: true, rule: { evidence: [{ ...SYMPTOM, orMatch: [{ kind: 'observation', subjectIn: CHAIN }] }] } },
  ],
};

const diagnosisForm: HandoverFormConfig = {
  id: 'diagnosis',
  title: 'Diagnosis',
  documentSection: 'Diagnosis',
  fields: [
    {
      key: 'cause',
      label: 'Cause your observations support',
      required: true,
      rule: pick(CAUSES, ['connector-moisture']),
    },
    { key: 'observations', label: 'Observations, including checks that found nothing', required: true, rule: { evidence: [SYMPTOM, LOCATED, RULED_OUT] } },
  ],
};

const interventionForm: HandoverFormConfig = {
  id: 'intervention',
  title: 'Intervention',
  documentSection: 'Intervention',
  fields: [
    { key: 'basis', label: 'Observations that justified it', required: true, rule: { evidence: [SYMPTOM, LOCATED] } },
    { key: 'action', label: 'Action you took', required: true, rule: { evidence: [REPAIR] } },
    {
      key: 'spare',
      label: 'Spare used',
      required: true,
      rule: {
        ...pick({ 'connector-kit': 'Connector kit', 'cable:power-data': 'Power and data cable', 'power-brick': 'Power brick', 'fuel-can': 'Fuel can' }, [
          'connector-kit',
          'cable:power-data',
        ]),
      },
    },
  ],
};

const outcomeForm: HandoverFormConfig = {
  certification: {},
  id: 'outcome',
  title: 'Assessment outcome',
  documentSection: 'Outcome',
  fields: [
    {
      key: 'verified',
      label: 'Fresh workload check after the repair',
      required: true,
      rule: { workload: { cardId: ASSESS_CARD.id, is: ['supported'], serviceId: SKYLINK_SERVICE } },
    },
    { key: 'rate', label: 'Average battery draw over the run (W)', required: true, rule: { runRate: { cardId: ASSESS_CARD.id, serviceId: SKYLINK_SERVICE } } },
    { key: 'reserve', label: 'Battery energy left (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40 } } },
  ],
};

const qualificationForm: HandoverFormConfig = {
  id: 'qualification',
  title: 'Qualification handover',
  documentSection: 'Qualification handover',
  fields: [
    { key: 'observations', label: 'Observations', required: true, rule: { evidence: [SYMPTOM, LOCATED, RULED_OUT] } },
    { key: 'diagnosis', label: 'Diagnosis', required: true, rule: pick(CAUSES, ['connector-moisture']) },
    { key: 'action', label: 'Corrective action', required: true, rule: { evidence: [REPAIR] } },
    { key: 'verification', label: 'Verification run', required: true, rule: { workload: { cardId: ASSESS_CARD.id, is: ['supported'], serviceId: SKYLINK_SERVICE } } },
    {
      key: 'limitation',
      label: 'Limitation left for the next operator',
      required: true,
      rule: pick({ 'single-window': 'Checked over one 60 second window only', 'long-term': 'Proven over a long period', 'no-limit': 'No limitation' }, ['single-window']),
    },
  ],
};

const scenarioSettings = createFrontlineSettings(8);
// Authored truth is confined to configuration; the learner must discover it.
if (scenarioSettings.physicalPlant) {
  applyCampField(scenarioSettings.physicalPlant, [ASSESS_CARD], [assignmentForm, planForm, diagnosisForm, interventionForm, outcomeForm, qualificationForm]);
  recordRunPower(scenarioSettings.physicalPlant);
  scenarioSettings.physicalPlant.causeOptions = [
    { id: 'connector-moisture', label: 'Moisture at a cable connector' },
    { id: 'cable-damage', label: 'Damaged cable' },
    { id: 'power-supply', label: 'Power supply' },
    { id: 'router', label: 'Router' },
    { id: 'terminal', label: 'Terminal' },
  ];
  scenarioSettings.physicalPlant.hypothesisSpecs = [{ causes: ['connector-moisture'], ...HYPOTHESIS_OPTS }];
  scenarioSettings.physicalPlant.power = { reserveWh: RESERVE_WH, planningHorizonS: 3600, basis: 'battery-only' };
  scenarioSettings.physicalPlant.faults = [{ id: FAULT_ID, target: 'skylink-cable:router', kind: 'moisture', severity: 0.8 }];
  scenarioSettings.physicalPlant.spares = { 'cable:power-data': 1, 'cable:coax': 0, 'power-brick': 0, 'connector-kit': 1, 'fuel-can': 0 };
  scenarioSettings.physicalPlant.tripLimit = 3;
  const battery = scenarioSettings.physicalPlant.parts.find((part) => part.id === 'power-station');
  if (battery) {
    battery.socWh = 400;
  }
}

export const frontlineScenario8Data: FrontlineScenarioData = {
  id: 'frontline-scenario8',
  url: 'frontline/scenarios/frontline-scenario8',
  imageUrl: 'frontline/physical/site-outside-snow.webp',
  number: 8,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario7'],
  title: 'Qualify for Independent Operation',
  subtitle: 'Camp Assessment',
  duration: '35-45 min',
  difficulty: 'advanced',
  missionType: 'Field Service Assessment',
  description:
    'This is the final Kivilahti camp assessment. Ola has a simulated workload requirement, the post has limited resources, and the service has a familiar local fault.<br/><br/>Choose your own diagnostic route, justify the intervention, and verify the outcome. Useful checks that rule out a cause count as evidence. Marek will assess the record and result without prescribing the order of your work.',
  equipment: ['Camp field kit', 'Physical inspection and measurement tools', 'Limited spare stock', 'Workload requirement and assessment record'],
  settings: scenarioSettings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's08-interpret-assignment',
      title: 'Interpret the Assignment',
      description: 'Read the workload requirement and resource limits. State the outcome you need to establish and the constraints that apply to this assessment.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 10,
      conditions: [handoverValid('assignment', 'Assessment requirements and limits recorded')],
    },
    {
      id: 's08-establish-state',
      title: 'Establish the Available Service',
      description: 'Record the current service symptoms and choose evidence that will distinguish the plausible causes. Use the equipment and records you judge relevant.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s08-interpret-assignment'],
      points: 15,
      conditions: [
        samplesCurrent(SKYLINK_SERVICE, ['registration', 'application'], 'Current service readings taken'),
        handoverValid('plan', 'Current state and diagnostic plan recorded'),
      ],
    },
    {
      id: 's08-diagnose-fault',
      title: 'Support a Diagnosis',
      description: 'Gather observations and record the conclusion they support. Include useful negative results and any uncertainty that remains.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s08-establish-state'],
      points: 20,
      conditions: [
        faultEvidenceRecorded(FAULT_ID, 'Observation that shows the local cause'),
        negativeChecksKept(1, 'A check that ruled something out kept', { subjects: CHAIN }),
        hypothesisFiled(['connector-moisture'], HYPOTHESIS_OPTS, 'Cause filed with its observations'),
        handoverValid('diagnosis', 'Diagnosis supported by this run'),
      ],
    },
    {
      id: 's08-repair-service',
      title: 'Complete the Justified Intervention',
      description: 'Carry out the repair supported by your observations. Account for the parts used, time taken, and disruption introduced by the intervention.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s08-diagnose-fault'],
      points: 15,
      conditions: [
        {
          type: 'plant-fault-cleared',
          description: 'Local Fault Cleared',
          mustMaintain: false,
          params: {
            faultId: FAULT_ID,
          },
        },
        faultClearedWithEvidence(FAULT_ID, 'Repair made on a supported cause'),
        handoverValid('intervention', 'Intervention justified and resource use recorded'),
      ],
    },
    {
      id: 's08-verify-outcome',
      title: 'Verify the Assessment Outcome',
      description: 'Run the required service check after your intervention and observe it across the assessment window. Record the remaining reserve against the brief.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s08-repair-service'],
      points: 20,
      conditions: [
        serviceReserveVerified(
          { card: ASSESS_CARD.id, service: SKYLINK_SERVICE, afterFaultCleared: FAULT_ID, windowS: RESERVE_WINDOW_S },
          'Fresh workload check after the repair passed with the battery reserve held through the same window'
        ),
        handoverCurrent('outcome', 'Outcome recorded against the brief'),
      ],
    },
    {
      id: 's08-submit-handover',
      title: 'Submit the Qualification Handover',
      description:
        'Separate observations, conclusions, corrective actions, and limitations in the final report. Reference the checks that establish the state left for the next operator.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s08-verify-outcome'],
      points: 20,
      conditions: [handoverValid('qualification', 'Qualification handover accepted')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      audioUrl: '',
      emotion: Emotion.NEUTRAL,
      text: "This is your assessment shift. The brief gives you the task and resource limits; the sequence of checks is yours. I'll review the evidence and the outcome when you've finished.",
    },
    objectivesOnStart: {
      's08-establish-state': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'm ready to provide the workload's reports when you need them. Tell me which observation you're checking so I can keep the results clear.",
      },
      's08-verify-outcome': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "I'll run the assessment check with you. Please keep the earlier result separate so we can tell what changed after your work.",
      },
      's08-submit-handover': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "Submit the record you'd want to receive at the start of a shift. It needs to show what you've established and what remains uncertain.",
      },
    },
    objectives: {
      's08-submit-handover': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        emotion: Emotion.HAPPY,
        text: "You've chosen your checks, justified the intervention, and verified the result without my help. Your record explains the remaining limits. You're ready to take responsibility for the next shift.",
      },
    },
  },
};
