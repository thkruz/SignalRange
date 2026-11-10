import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { applyCampField, CAMP_VSAT_SERVICE, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { handoverValid, layerObserved, siteChecked, workloadVerified } from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * S1: healthy Kivilahti camp kit; first baseline and application check.
 * No hidden fault. The exercise checks the whole service, not aircraft operation.
 * Every practical check reads plant, service, workload and record state (M20); nothing is a click or a fixed answer.
 * Spoken English uses the C6 cast voices; all four require Eastern European VO accents.
 */
/** The healthy baseline S3 compares against (continuity form id 'baseline'). */
const baselineForm: HandoverFormConfig = {
  id: 'baseline',
  title: 'Healthy baseline',
  documentSection: 'Baseline',
  fields: [
    { key: 'service', label: 'Service checked', required: true, rule: { choice: [SKYLINK_SERVICE], labels: { [SKYLINK_SERVICE]: 'SkyLink' } } },
    { key: 'energy', label: 'Stored energy (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 25, partId: 'power-station' } } },
    { key: 'power', label: 'Terminal power', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'power' } } },
    { key: 'local', label: 'Local network', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'application', label: 'Application check run', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
    { key: 'evidence', label: 'Observations behind this baseline', required: true, rule: { cites: 'observation', min: 2 } },
  ],
};

/** The first handover: verified service versus untested equipment. */
const handoverForm: HandoverFormConfig = {
  id: 'handover',
  title: 'First handover',
  documentSection: 'Handover',
  fields: [
    { key: 'verified', label: 'Service verified', required: true, rule: { choice: [SKYLINK_SERVICE], labels: { [SKYLINK_SERVICE]: 'SkyLink' } } },
    { key: 'untested', label: 'Equipment left untested', required: true, rule: { choice: [CAMP_VSAT_SERVICE], labels: { [CAMP_VSAT_SERVICE]: 'Camp reference VSAT' } } },
    { key: 'run', label: 'Verified application run', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
    {
      key: 'readiness',
      label: 'Readiness statement',
      required: true,
      rule: { choice: ['skylink-only'], labels: { 'skylink-only': 'SkyLink verified, VSAT not tested' } },
    },
  ],
};

const settings = createFrontlineSettings(1);
if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_CHECK_CARD], [baselineForm, handoverForm]);
}

export const frontlineScenario1Data: FrontlineScenarioData = {
  id: 'frontline-scenario1',
  url: 'frontline/scenarios/frontline-scenario1',
  imageUrl: 'frontline/physical/card-outside-morning.webp',
  number: 1,
  isDisabled: false,
  difficulty: 'beginner',
  title: 'Take Over the Training Post',
  subtitle: 'Equipment, Connections, and a Healthy Baseline',
  duration: '20-30 min',
  missionType: 'Field Communications Training',
  description:
    'Your first shift at Kivilahti starts with healthy equipment. Sergeant Marek Domański introduces the post, while pilot Aleksandra Wysocka prepares a simulated application check. Trace the equipment, complete the camp checks, and establish what usable service looks like before you have to diagnose a fault.',
  equipment: ['Battery power station and generator', 'SkyLink terminal and router', 'Power and data cable', 'Pilot workstation', 'Camp reference VSAT'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's1-identify-equipment',
      title: 'Identify the Field Equipment',
      description:
        'Inspect the power station, router, terminal, and workstation. Use their labels and connections to distinguish power supply, local networking, satellite access, and the application endpoint.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        { type: 'part-inspected', description: 'Power source inspected', params: { partId: 'power-station' }, mustMaintain: false },
        { type: 'part-inspected', description: 'Local router inspected', params: { partId: 'skylink-router' }, mustMaintain: false },
        { type: 'part-inspected', description: 'Satellite terminal inspected', params: { partId: 'skylink-dish' }, mustMaintain: false },
        { type: 'part-inspected', description: 'Workstation inspected', params: { partId: 'laptop' }, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Equipment roles distinguished',
          params: {
            character: Character.SYSTEM,
            question: 'Which description separates the roles of the equipment at this post?',
            options: [
              'The battery supplies power, the router connects local devices, and the terminal reaches the satellite service.',
              'The battery supplies power, the router reaches the satellite directly, and the terminal only stores application data.',
              'The battery supplies power, the workstation registers the satellite service, and the router only charges the terminal.',
            ],
            correctIndex: 0,
            explanation: "Each device serves a different part of the path. Identifying those roles helps you choose a useful check when the application doesn't work.",
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's1-check-condition',
      title: 'Assess the Post Condition',
      description: 'Complete the camp checklist before starting the application exercise. Record any condition that needs attention, including a check whose result is uncertain.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-identify-equipment'],
      conditions: [
        siteChecked(['generator'], 'Generator fuel and housing checked'),
        siteChecked(['power-station'], 'Power station checked'),
        siteChecked(['power-strip'], 'Power strip checked'),
        siteChecked(['skylink-cable'], 'SkyLink cable checked'),
        siteChecked(['skylink-cable:dish', 'skylink-cable:router'], 'SkyLink cable plugs checked'),
      ],
    },
    {
      id: 's1-establish-connection',
      title: 'Establish Local Service',
      description:
        'Confirm the workstation can reach the local network and that the satellite terminal is registered. Keep those checks separate from the application test that follows.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-check-condition'],
      conditions: [
        layerObserved(SKYLINK_SERVICE, 'local', { status: 'up' }, 'Local network reachability observed'),
        layerObserved(SKYLINK_SERVICE, 'registration', { status: 'up' }, 'Terminal registration observed'),
      ],
    },
    {
      id: 's1-test-application',
      title: 'Run the Application Check',
      description:
        'Start a new simulated application check with Ola on the SkyLink connection. Confirm the completed result at both ends before calling the service usable. Take the endpoint-report reading after the run finishes; one taken earlier does not count.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-establish-connection'],
      conditions: [
        workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE }, 'Application check completed on the SkyLink connection'),
        layerObserved(SKYLINK_SERVICE, 'application', { status: 'up' }, 'Result confirmed at the remote end (endpoint-report reading taken after the run finishes)'),
      ],
    },
    {
      id: 's1-record-baseline',
      title: 'Capture the Healthy Baseline',
      description:
        'Record the active equipment, power use, terminal state, and application readings from this check. Include when each reading was taken so later changes can be compared fairly.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-test-application'],
      conditions: [handoverValid('baseline', 'Baseline readings filed')],
    },
    {
      id: 's1-hand-over-post',
      title: 'Submit the First Handover',
      description:
        'Describe the service you checked, the equipment it uses, and the equipment you left untested, which is the camp VSAT this shift. Submit your readiness statement against the baseline.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-record-baseline'],
      conditions: [handoverValid('handover', 'Handover filed against the baseline')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>Welcome to Kivilahti. I'm Marek Domański, your communications instructor. We'll start with healthy equipment so you have something useful to compare against later.</p><p>Ola runs the simulated application at the other end. Your job is to establish what the service can do and leave a record someone else can trust.</p><p>One rule is mine, not the service's. At this camp you may go outside to the equipment three times. A fourth trip gets you spotted. It's a training rule for this post, and it won't follow you to a forward site.</p>",
    },
    objectivesOnStart: {
      's1-identify-equipment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>The Site view lets you inspect the kit. Start by identifying which item supplies power, which connects our local devices, and which reaches the satellite service.</p>',
      },
      's1-check-condition': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Work through the camp checks before we start the exercise. If you can't establish a condition, record that uncertainty instead of marking it satisfactory.</p>",
      },
      's1-establish-connection': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Check the local connection and the terminal's registration separately. Both matter, but neither tells us yet whether Ola's application works.</p>",
      },
      's1-test-application': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'm Aleksandra Wysocka, but you can call me Ola. I'll report what happens at my end when you start the check, including anything that doesn't update.</p>",
      },
      's1-record-baseline': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Keep the readings that describe this working configuration. A baseline needs the equipment and the time as well as the numbers.</p>',
      },
      's1-hand-over-post': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Your handover should tell the next operator what you've verified. Leave untested equipment marked that way so nobody mistakes an assumption for a result.</p>",
      },
    },
    objectives: {
      's1-identify-equipment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>You've identified the equipment's roles. That gives you a starting point for choosing checks when one part of the path stops working.</p>",
      },
      's1-test-application': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: "<p>The check completed at my end, and its result updated this time. I've recorded the same run so we can compare it later.</p>",
      },
      's1-hand-over-post': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I can see which service you've checked and which equipment is still untested. That's useful. I also photographed the new camp sign; they've repainted it without fixing the spelling.</p>",
      },
    },
  },
};
