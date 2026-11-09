import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { applyCampField, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { eventFired, handoverValid, recoveryObserved, sampleAfterEvent, workloadVerified } from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * S4: normal terminal recovery, then one authored net obstruction.
 * The net MUST be introduced after the normal-recovery observation. It is not
 * seeded at load because that would merge the transient and persistent problem.
 * Event s4-recovery-start (anchored to the first objective) stages a normal 90 s terminal boot with
 * no fault. Event s4-obstruction (anchored to s4-recognize-persistence, so it only fires once the
 * recovery was observed) injects the named net fault exactly once.
 * Net inspection and removal are the plant's own verbs.
 */
const settings = createFrontlineSettings(4);
const faultId = 'c6-s4-terminal-obstruction';
const RECOVERY_EVENT = 's4-recovery-start';
const OBSTRUCTION_EVENT = 's4-obstruction';

const environmentForm: HandoverFormConfig = {
  id: 'environment-report',
  title: 'Environment report',
  documentSection: 'Environment',
  fields: [
    { key: 'recovery', label: 'Normal recovery you waited through', required: true, rule: { cites: 'observation', min: 2 } },
    {
      key: 'condition',
      label: 'Condition found at the terminal',
      required: true,
      rule: { choice: ['obstruction'], labels: { obstruction: 'Something blocking the terminal view of the sky' } },
    },
    { key: 'correction', label: 'Correction you made', required: true, rule: { cites: 'action', min: 1 } },
    { key: 'verified', label: 'Fresh application check after the correction', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
  ],
};

if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_CHECK_CARD], [environmentForm]);
  settings.physicalPlant.events = [
    {
      id: RECOVERY_EVENT,
      startAfterObjectiveId: 's4-identify-recovery',
      actions: [{ kind: 'reboot-part', partId: 'skylink-dish' }],
      logLine: 'The terminal restarts after a brief power dip.',
    },
    {
      id: OBSTRUCTION_EVENT,
      startAfterObjectiveId: 's4-recognize-persistence',
      actions: [{ kind: 'inject-fault', fault: { id: faultId, target: 'skylink-dish', kind: 'net' } }],
      logLine: 'Wind moves something over the terminal.',
    },
  ];
}

export const frontlineScenario4Data: FrontlineScenarioData = {
  id: 'frontline-scenario4',
  url: 'frontline/scenarios/frontline-scenario4',
  imageUrl: 'frontline/sandbox/card.png',
  number: 4,
  isDisabled: true,
  prerequisiteScenarioIds: ['frontline-scenario3'],
  difficulty: 'beginner',
  title: 'Recognize an Environmental Problem',
  subtitle: 'Normal Recovery and Persistent Obstruction',
  duration: '25-35 min',
  missionType: 'Field Fault Diagnosis',
  description:
    'A terminal recovering normally can look unavailable before it is ready. Learn to observe that transition without repeatedly restarting it, then investigate a persistent environmental problem. Finish by verifying service through a fresh check and recording what the environment changed.',
  equipment: ['SkyLink terminal and router', 'Terminal status display', 'Outdoor site inspection', 'Pilot workstation'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's4-identify-recovery',
      title: 'Identify the Recovery State',
      description: "Read the terminal's current state and expected recovery interval. Establish what normal progress should look like before judging it as a fault.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        { type: 'part-inspected', description: 'Terminal inspected', params: { partId: 'skylink-dish' }, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Normal start time identified',
          params: {
            character: Character.SYSTEM,
            question: 'The terminal reads as starting up and the application is unavailable. About how long does a normal terminal start take before it can carry traffic?',
            options: [
              'Under ten seconds, so anything longer is a fault.',
              'About a minute and a half, so waiting is the right first step.',
              'Until someone restarts it, because it will not finish by itself.',
            ],
            correctIndex: 1,
            explanation:
              'This terminal takes about 90 seconds to start. During that time the application is unavailable even though nothing is broken, so you wait before deciding it needs work.',
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's4-observe-recovery',
      title: 'Observe Normal Recovery',
      description: 'Watch the terminal through the stated recovery interval. Avoid restarting a device that is still making the expected progress.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s4-identify-recovery'],
      conditions: [recoveryObserved(SKYLINK_SERVICE, RECOVERY_EVENT, 'skylink-dish', 'Registration came back without another restart')],
    },
    {
      id: 's4-recognize-persistence',
      title: 'Recognize the Persistent Problem',
      description:
        'Compare the new service symptoms with the completed recovery period and the healthy reference. Decide whether more waiting still explains the current limitation.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s4-observe-recovery'],
      conditions: [
        eventFired(OBSTRUCTION_EVENT, 'New symptoms appeared after the recovery'),
        sampleAfterEvent(SKYLINK_SERVICE, 'registration', 'down', OBSTRUCTION_EVENT, 'Registration read down after the recovery had finished'),
        sampleAfterEvent(SKYLINK_SERVICE, 'application', 'down', OBSTRUCTION_EVENT, 'Application read down after the recovery had finished'),
        {
          type: 'status-check',
          description: 'Waiting ruled out as the explanation',
          params: {
            character: Character.SYSTEM,
            question: 'The terminal finished its normal start, yet registration and the application are still down. What does that tell you?',
            options: [
              'Waiting will not explain it, because the normal start is over.',
              'The start time was wrong, so wait for another minute and a half to pass.',
              'The router must be broken, because it is the only other part in the kit.',
            ],
            correctIndex: 0,
            explanation:
              "The start period has ended and the service hasn't returned, so another cause is at work. That's why you now inspect the site instead of waiting or restarting.",
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's4-inspect-environment',
      title: 'Inspect the Terminal Environment',
      description: 'Inspect the terminal and its immediate surroundings. Identify an observable environmental condition that could explain the remaining symptom.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s4-recognize-persistence'],
      conditions: [
        {
          id: 's4-observed-environment-evidence',
          type: 'custom',
          description: 'Environmental fault evidence observed',
          params: { evaluator: () => PhysicalPlantService.plantOrNull()?.isFactRevealed('skylink-dish', 'net') === true },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's4-correct-environment',
      title: 'Correct the Observed Condition',
      description: 'Use the permitted corrective action for the condition you observed. Record the work before testing whether it restored the required service.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s4-inspect-environment'],
      conditions: [
        { type: 'plant-fault-cleared', description: 'Observed environmental defect cleared', params: { faultId }, mustMaintain: true },
        {
          id: 's4-evidence-before-correction',
          type: 'custom',
          description: 'Correction followed the environmental observation',
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
      id: 's4-verify-environment-result',
      title: 'Verify the Environmental Correction',
      description: 'Complete a fresh service observation window and record its result. Distinguish the earlier normal recovery from the environmental fault you later corrected.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s4-correct-environment'],
      conditions: [
        workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE, afterFaultCleared: faultId }, 'Fresh application check passed after the correction'),
        handoverValid('environment-report', 'Environment report submitted'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      audioUrl: '',
      text: "<p>This exercise starts with a normal recovery period. Find out what the terminal is doing before deciding that it needs intervention. Later, you'll have a separate service problem to assess.</p>",
    },
    objectivesOnStart: {
      's4-identify-recovery': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Read the terminal's recovery state and expected interval. An unavailable application during that interval doesn't by itself establish a hardware fault.</p>",
      },
      's4-observe-recovery': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'll wait while you watch the recovery. Tell me when it's ready for a check rather than giving me a result before you've seen it.</p>",
      },
      's4-recognize-persistence': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Now compare the new observations with the recovery you just watched. Decide whether the current evidence still fits normal startup behavior.</p>',
      },
      's4-inspect-environment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Check the terminal's surroundings as well as the equipment. Describe what you can actually observe before choosing corrective work.</p>",
      },
      's4-correct-environment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Your inspection has identified an environmental condition. Use the supported correction and keep a record of what changed.</p>',
      },
      's4-verify-environment-result': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>Let's run a new check after the correction. I'll report that run's result so it doesn't get mixed up with the earlier recovery.</p>",
      },
    },
    objectives: {
      's4-observe-recovery': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>You've observed the normal recovery interval. Keep that result as a reference for the next stage of the exercise.</p>",
      },
      's4-correct-environment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>The observed obstruction has been removed. That establishes what changed at the site; the service check will establish its result.</p>',
      },
      's4-verify-environment-result': {
        character: Character.MAREK_DOMANSKI,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: "<p>Your record separates normal recovery from the later obstruction and includes a fresh verification. That's enough evidence to explain why waiting was appropriate first and intervention was appropriate later.</p>",
      },
    },
  },
};
