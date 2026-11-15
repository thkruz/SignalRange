import { Character, Emotion } from '@app/modal/character-enum';
import type { Condition } from '@app/objectives/objective-types';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { applyCampField, CAMP_VSAT_SERVICE, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { handoverValid, layerObserved, siteChecked, workloadVerified } from './frontline-conditions';
import { pick, reading } from './report-choices';
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
    {
      key: 'service',
      label: 'Service checked',
      required: true,
      rule: pick({ [SKYLINK_SERVICE]: 'SkyLink', [CAMP_VSAT_SERVICE]: 'Camp reference VSAT', both: 'Both connections' }, [SKYLINK_SERVICE]),
    },
    { key: 'energy', label: 'Stored energy (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 25, partId: 'power-station' } } },
    { key: 'power', label: 'Terminal power', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'power' } } },
    { key: 'local', label: 'Local network', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'local' } } },
    { key: 'registration', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    { key: 'application', label: 'Application check run', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
    {
      key: 'evidence',
      label: 'Observations behind this baseline',
      required: true,
      rule: {
        evidence: [
          reading('power', 'a SkyLink terminal power reading, up', SKYLINK_SERVICE, 'power', ['up']),
          reading('local', 'a SkyLink local network reading, up', SKYLINK_SERVICE, 'local', ['up']),
          reading('registration', 'a SkyLink registration reading, up', SKYLINK_SERVICE, 'registration', ['up']),
        ],
      },
    },
  ],
};

/** The first handover: verified service versus untested equipment. */
const handoverForm: HandoverFormConfig = {
  id: 'handover',
  title: 'First handover',
  documentSection: 'Handover',
  fields: [
    {
      key: 'verified',
      label: 'Service verified',
      required: true,
      rule: pick({ [SKYLINK_SERVICE]: 'SkyLink', [CAMP_VSAT_SERVICE]: 'Camp reference VSAT', both: 'Both connections' }, [SKYLINK_SERVICE]),
    },
    {
      key: 'untested',
      label: 'Equipment left untested',
      required: true,
      rule: pick({ [SKYLINK_SERVICE]: 'SkyLink', [CAMP_VSAT_SERVICE]: 'Camp reference VSAT', none: 'Nothing was left untested' }, [CAMP_VSAT_SERVICE]),
    },
    { key: 'run', label: 'Verified application run', required: true, rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'] } } },
    {
      key: 'readiness',
      label: 'Readiness statement',
      required: true,
      rule: pick(
        {
          'skylink-only': 'SkyLink verified, VSAT not tested',
          'both-verified': 'SkyLink and VSAT both verified',
          'vsat-only': 'VSAT verified, SkyLink not tested',
          'none-verified': 'Neither connection verified',
        },
        ['skylink-only']
      ),
    },
  ],
};

/** Add the free "what to do next" line to a checklist row */
const withNext = (condition: Condition, next: string): Condition => ({ ...condition, next });

const S1_WELCOME_NOTICE = 's1-welcome-notice';

const settings = createFrontlineSettings(1);
if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_CHECK_CARD], [baselineForm, handoverForm]);
  // One provider notice, so the Equipment log has a memo and its clipboard tab carries an unread badge from the first shift.
  settings.physicalPlant.equipment = {
    units: [],
    notices: [
      {
        id: S1_WELCOME_NOTICE,
        version: 1,
        providerId: 'skylink-net',
        affects: { accountId: 'camp-skylink' },
        kind: 'maintenance',
        issuedAtS: 0,
        issuedOnDelivery: true,
        text: 'Routine maintenance on the SkyLink ground network is complete. Service to your camp account was not interrupted, and no action is needed.',
      },
    ],
  };
  settings.physicalPlant.events = [
    ...(settings.physicalPlant.events ?? []),
    {
      id: 's1-welcome-notice-event',
      startAfterObjectiveId: 's1-identify-equipment',
      actions: [{ kind: 'deliver-notice', noticeId: S1_WELCOME_NOTICE }],
      logLine: 'A provider notice arrives for the post account.',
    },
  ];
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
      points: 10,
      nice: ['S0421', 'T0431'],
      conditions: [
        {
          type: 'part-inspected',
          description: 'Power station inspected (power source)',
          params: { partId: 'power-station' },
          mustMaintain: false,
          next: 'click the power station in the Site view and press Inspect.',
        },
        {
          type: 'part-inspected',
          description: 'SkyLink router inspected (local network)',
          params: { partId: 'skylink-router' },
          mustMaintain: false,
          next: 'click the router in the Site view and press Inspect.',
        },
        {
          type: 'part-inspected',
          description: 'SkyLink dish inspected (satellite terminal, outside)',
          params: { partId: 'skylink-dish' },
          mustMaintain: false,
          next: 'step outside (the door, or Step outside in the tent control), click the dish and press Inspect.',
        },
        {
          type: 'part-inspected',
          description: 'Laptop inspected (workstation)',
          params: { partId: 'laptop' },
          mustMaintain: false,
          next: 'click the laptop in the Site view and press Inspect.',
        },
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
          next: 'once the four items are inspected, press the ? on this row and pick the answer that matches what you saw.',
        },
      ],
    },
    {
      id: 's1-check-condition',
      title: 'Assess the Post Condition',
      description: 'Complete the camp checklist before starting the application exercise. Record any condition that needs attention, including a check whose result is uncertain.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-identify-equipment'],
      points: 15,
      nice: ['T0431', 'K0741'],
      conditions: [
        withNext(siteChecked(['generator'], 'Generator fuel and housing checked'), 'go outside, open the generator and press Inspect.'),
        withNext(siteChecked(['power-station'], 'Power station checked'), 'open the power station and press Inspect or Feel.'),
        withNext(siteChecked(['power-strip'], 'Power strip checked'), 'open the power strip inside the tent and press Inspect.'),
        withNext(siteChecked(['skylink-cable'], 'SkyLink cable checked'), 'go outside, click the SkyLink cable run and press Inspect.'),
        withNext(
          siteChecked(['skylink-cable:dish', 'skylink-cable:router'], 'SkyLink cable plugs checked'),
          'in the cable run close-up, select the plug at each end and press Inspect or Wiggle.'
        ),
      ],
    },
    {
      id: 's1-establish-connection',
      title: 'Establish Local Service',
      description:
        'Confirm the workstation can reach the local network and that the satellite terminal is registered. Keep those checks separate from the application test that follows.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-check-condition'],
      points: 15,
      nice: ['T1567', 'K0773'],
      conditions: [
        withNext(
          layerObserved(SKYLINK_SERVICE, 'local', { status: 'up' }, 'Local network reachability observed'),
          'press Use laptop in the laptop close-up, open NetProbe, pick Local network and run Ping.'
        ),
        withNext(
          layerObserved(SKYLINK_SERVICE, 'registration', { status: 'up' }, 'Terminal link observed'),
          'look at the Terminal link light on the router, or in NetProbe on the laptop pick Through the terminal and run Link status.'
        ),
      ],
    },
    {
      id: 's1-test-application',
      title: 'Run the Application Check',
      description:
        'Start a new simulated application check with Ola on the SkyLink connection. Confirm the completed result at both ends before calling the service usable. Take the endpoint-report reading after the run finishes; one taken earlier does not count.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-establish-connection'],
      points: 15,
      nice: ['T0153', 'K0740'],
      conditions: [
        withNext(
          workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE }, 'Application check completed on the SkyLink connection'),
          'open the laptop (Use laptop), open MissionRunner, choose the application card and press Start run.'
        ),
        withNext(
          layerObserved(SKYLINK_SERVICE, 'application', { status: 'up' }, 'Result confirmed at the remote end (endpoint-report reading taken after the run finishes)'),
          'when the run has finished, pick up the Radio from the tray, call the remote operator and ask for the report.'
        ),
      ],
    },
    {
      id: 's1-record-baseline',
      title: 'Capture the Healthy Baseline',
      description:
        'Record the active equipment, power use, terminal state, and application readings from this check. Include when each reading was taken so later changes can be compared fairly.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-test-application'],
      points: 20,
      nice: ['T0153', 'K0740'],
      conditions: [handoverValid('baseline', 'Baseline readings filed')],
    },
    {
      id: 's1-hand-over-post',
      title: 'Submit the First Handover',
      description:
        'Describe the service you checked, the equipment it uses, and the equipment you left untested, which is the camp VSAT this shift. Submit your readiness statement against the baseline.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s1-record-baseline'],
      points: 25,
      nice: ['K0645'],
      conditions: [handoverValid('handover', 'Handover filed against the baseline')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>Welcome to Kivilahti. I'm Marek Domański, your communications instructor. We'll start with healthy equipment so you have something useful to compare against later.</p><p>Ola runs the simulated application at the other end. Your job is to establish what the service can do and leave a record someone else can trust.</p><p>One rule is mine, not the service's. At this camp you may go outside to the equipment three times. A fourth trip gets you spotted. It's a training rule for this post, and it won't follow you to a forward site.</p><p>Your task sheet is on the clipboard in the tray along the bottom of the Site view. Under most lines I've pencilled where to go next.</p>",
    },
    objectivesOnStart: {
      's1-identify-equipment': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>The Site view lets you inspect the kit. Start by identifying which item supplies power, which connects our local devices, and which reaches the satellite service.</p><p>Click any item to open it up close, then press Inspect. The dish is outside, so use the tent control or the door to step out, and step back in when you are done. Every trip counts toward the three.</p>',
      },
      's1-check-condition': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Work through the camp checks before we start the exercise. If you can't establish a condition, record that uncertainty instead of marking it satisfactory.</p><p>The cable run is a thin line from the dish to the tent. Open it up close to check the cable and each plug separately.</p>",
      },
      's1-establish-connection': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Check the local connection and the terminal's registration separately. Both matter, but neither tells us yet whether Ola's application works.</p><p>The laptop is where you take those readings: open it up close and press Use laptop.</p>",
      },
      's1-test-application': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'm Aleksandra Wysocka, but you can call me Ola. I'll report what happens at my end when you start the check, including anything that doesn't update.</p><p>Start the check from the laptop. When it finishes, the Radio in the tray gets you the remote operator's report. Take that report after the run, because an earlier one doesn't count.</p>",
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
