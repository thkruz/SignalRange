import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { applyCampField, applyS2Power, CAMP_SERVICES, OLA_VOICE_CARD, SKYLINK_SERVICE } from './camp-field-config';
import {
  anyServiceSupports,
  eventFired,
  faultClearedWithEvidence,
  faultEvidenceRecorded,
  forecastMeetsReserve,
  handoverCurrent,
  layerObserved,
  powerRead,
  serviceReserveVerified,
} from './frontline-conditions';
import { checked, pick, repaired } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData, recordRunPower } from './scenario-support';

/**
 * S2: healthy camp service with 450 Wh initially available in the 1000 Wh battery.
 * Exercise reserve 200 Wh, planning horizon 5400 s on battery only, recovery window 120 scenario
 * seconds (Ted approved these values, 2026-11-09). These are authored exercise values, not
 * operational recommendations. Both terminals start running (175 W, projects 187.5 Wh, fails);
 * one terminal alone draws 120 W (270 Wh, passes); VSAT only also keeps the reserve but misses the
 * low-delay card, so only the SkyLink-only choice completes the configuration objective.
 * The supply loss is anchored to s2-respond-to-outage, so a slow reader is never penalised.
 * Guided fault: partial-seat at generator:out. Teach inspection before reseating here;
 * S16 later assesses this familiar mechanism at another point in the shared supply.
 */
const settings = createFrontlineSettings(2);
const SUPPLY_EVENT = 's2-supply-loss';
const SEAT_FAULT = 's2-generator-seat';

const resourcesForm: HandoverFormConfig = {
  id: 'resources',
  title: 'Resource handover',
  documentSection: 'Resources',
  // Package F: a later mode change or a lost run makes this filing out of date
  certification: {},
  fields: [
    { key: 'energy', label: 'Stored energy (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 20, partId: 'power-station' } } },
    { key: 'fuel', label: 'Generator fuel (L)', required: true, rule: { powerWithin: { metric: 'fuelL', tol: 0.5, partId: 'generator' } } },
    { key: 'rate', label: 'Average battery draw over the run (W)', required: true, rule: { runRate: { cardId: OLA_VOICE_CARD.id, serviceId: SKYLINK_SERVICE } } },
    { key: 'skylink', label: 'SkyLink terminal mode', required: true, rule: { modeIs: { partId: 'skylink-dish' } } },
    { key: 'vsat', label: 'VSAT terminal mode', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'verified', label: 'Verified low-delay run', required: true, rule: { workload: { cardId: OLA_VOICE_CARD.id, is: ['supported'] } } },
    {
      key: 'seating',
      label: 'Connector observations',
      required: true,
      rule: { evidence: [checked('plug', 'a hands-on look or test at the generator output plug', ['generator:out'])] },
    },
    { key: 'reseat', label: 'Reseat action', required: true, rule: { evidence: [repaired('fix', 'a repair that changed the generator output plug', ['generator:out'])] } },
    {
      key: 'limitation',
      label: 'Limitation for the next operator',
      required: true,
      rule: pick(
        {
          'skylink-only': 'Only the SkyLink path meets the low-delay card within the reserve',
          'both-paths': 'Both paths meet the low-delay card within the reserve',
          'vsat-only': 'Only the VSAT path meets the low-delay card within the reserve',
          'neither-path': 'Neither path meets the low-delay card within the reserve',
        },
        ['skylink-only']
      ),
    },
  ],
};

if (settings.physicalPlant) {
  applyS2Power(settings.physicalPlant);
  applyCampField(settings.physicalPlant, [OLA_VOICE_CARD], [resourcesForm]);
  recordRunPower(settings.physicalPlant);
  settings.physicalPlant.events = [
    {
      id: SUPPLY_EVENT,
      startAfterObjectiveId: 's2-respond-to-outage',
      actions: [{ kind: 'inject-fault', fault: { id: SEAT_FAULT, target: 'generator:out', kind: 'partial-seat' } }],
      logLine: 'The external supply drops out at the generator output.',
    },
  ];
}

export const frontlineScenario2Data: FrontlineScenarioData = {
  id: 'frontline-scenario2',
  url: 'frontline/scenarios/frontline-scenario2',
  imageUrl: 'frontline/physical/card-inside-morning.webp',
  number: 2,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario1'],
  difficulty: 'beginner',
  title: 'Work Within the Power Budget',
  subtitle: 'Energy, Shared Supplies, and Service Recovery',
  duration: '25-35 min',
  missionType: 'Field Communications Training',
  description:
    'The connection is healthy, but the exercise starts with a limited battery reserve. Read the equipment load, choose a configuration, and work through a guided external-supply interruption with Marek. Demonstrate the required service while retaining the stated reserve, then leave a useful resource record.',
  equipment: ['1000 Wh battery power station', 'Generator', 'Power strip', 'SkyLink terminal and router', 'Camp reference VSAT', 'Pilot workstation'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's2-read-resources',
      title: 'Read the Available Resources',
      description: 'Inspect the power station and read its current energy, equipment load, and the 200 Wh exercise reserve. Keep stored energy separate from the voltage reading.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        { type: 'part-inspected', description: 'Power station inspected', params: { partId: 'power-station' }, mustMaintain: false },
        powerRead('power-station', { socWh: { min: 400, max: 500 } }, 'Stored energy read from the power station'),
        {
          type: 'status-check',
          description: 'Usable energy above the reserve worked out',
          params: {
            character: Character.SYSTEM,
            question: 'The power station holds 450 Wh and the exercise reserve is 200 Wh. How much energy can the configuration use before it reaches the reserve?',
            options: [
              '250 Wh, the difference between stored energy and the reserve.',
              '450 Wh, because the reserve only applies after the battery is empty and recharged.',
              '200 Wh, because the reserve is the amount the exercise lets you spend now.',
            ],
            correctIndex: 0,
            explanation: 'The reserve stays untouched, so only the energy above the reserve can be used. Subtracting 200 Wh from 450 Wh leaves 250 Wh to plan with.',
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's2-trace-dependencies',
      title: 'Trace the Shared Supply',
      description: 'Inspect the power strip and identify which devices rely on the battery. Explain why two satellite terminals can still share one point of power failure.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s2-read-resources'],
      conditions: [
        { type: 'part-inspected', description: 'Power strip inspected', params: { partId: 'power-strip' }, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Shared power dependency recognized',
          params: {
            character: Character.SYSTEM,
            question: 'Both terminal paths draw from the same battery. What does a second terminal change about a failure of that battery?',
            options: [
              'It provides an independent power source because each terminal reaches a different satellite service.',
              'It leaves the shared supply dependency, even though the two satellite service paths differ.',
              'It prevents a battery interruption because both terminals can keep the router powered remotely.',
            ],
            correctIndex: 1,
            explanation: "Both paths still need the shared battery, so a battery failure can affect both. A second service path doesn't create a separate power source.",
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's2-select-configuration',
      title: 'Choose the Operating Configuration',
      description:
        'Select equipment states that support the exercise workload while preserving the 200 Wh reserve. Check the predicted load before committing to the configuration.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s2-trace-dependencies'],
      conditions: [
        forecastMeetsReserve({}, 'Forecast keeps the 200 Wh reserve over the planning horizon'),
        anyServiceSupports(OLA_VOICE_CARD.id, CAMP_SERVICES, 'A running terminal meets the low-delay requirement'),
      ],
    },
    {
      id: 's2-respond-to-outage',
      title: 'Respond to Supply Loss',
      description:
        "Inspect the generator's output connector when the simulated supply interruption begins. Record the seating evidence and use the permitted reseat action if it supports that repair. Check the restored input supply and record the response before assessing application recovery.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s2-select-configuration'],
      conditions: [
        eventFired(SUPPLY_EVENT, 'Supply interruption has begun'),
        faultEvidenceRecorded(SEAT_FAULT, 'Connector seating evidence recorded'),
        faultClearedWithEvidence(SEAT_FAULT, 'Seating fault cleared by the reseat action'),
      ],
    },
    {
      id: 's2-verify-service-reserve',
      title: 'Verify Service and Reserve',
      description:
        'Run the 120-second assessment after the response. Confirm usable application service with an endpoint-report reading taken after the run finishes, record recovery time, and retain at least 200 Wh at the end.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s2-respond-to-outage'],
      conditions: [
        forecastMeetsReserve({}, 'Configuration still keeps the reserve over the planning horizon'),
        serviceReserveVerified(
          { card: OLA_VOICE_CARD.id, service: SKYLINK_SERVICE, afterEvent: SUPPLY_EVENT, windowS: 120 },
          'Low-delay run completed after the interruption with the reserve held through the same 120 seconds'
        ),
        layerObserved(SKYLINK_SERVICE, 'application', { status: 'up' }, 'Result confirmed at the remote end (endpoint-report reading taken after the run finishes)'),
      ],
    },
    {
      id: 's2-record-resources',
      title: 'Record the Remaining Resources',
      description: 'Submit the remaining energy and fuel, the equipment left in use, and the recovery result. Explain any limitation the next operator needs to preserve.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s2-verify-service-reserve'],
      conditions: [handoverCurrent('resources', 'Resource handover filed with measured values')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.MAREK_DOMANSKI,
      audioUrl: '',
      text: '<p>Today the connection works, but we have less energy available. The exercise reserve is 200 watt-hours. Choose what needs to run, then show that the service remains useful when the external supply is interrupted.</p>',
    },
    objectivesOnStart: {
      's2-read-resources': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        text: "<p>The power station is rated for 1000 watt-hours, but its starting charge is 450. I've recorded both figures because the rating doesn't tell you what's left today.</p>",
      },
      's2-trace-dependencies': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Follow the power connections as well as the data connections. Which devices would you lose together if the shared supply failed?</p>',
      },
      's2-select-configuration': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>Choose a configuration that meets the stated workload requirement and leaves the reserve intact. You don't need every item running to justify the equipment you keep available.</p>",
      },
      's2-respond-to-outage': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>This exercise demonstrates a plug that isn't fully seated. Inspect the generator's output connector and record what you find. If the seating is wrong, use the permitted reseat action, then check the input supply again.</p>",
      },
      's2-verify-service-reserve': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "<p>I'll run the application check while you watch the reserve. Include any time I spend waiting for it to become usable.</p>",
      },
      's2-record-resources': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        text: '<p>Leave the actual readings with the equipment list. The next person needs what remains in the battery and tank, not what was delivered.</p>',
      },
    },
    objectives: {
      's2-trace-dependencies': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "<p>You've identified the shared supply. Keep that dependency in your assessment even when two different services are available.</p>",
      },
      's2-verify-service-reserve': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
        text: '<p>The application check has a completed result, including the recovery interval. We can use that result instead of guessing from the connection light.</p>',
      },
      's2-record-resources': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: '<p>Your record connects the chosen configuration to the measured outcome. That lets the next operator see why you left the equipment in those states.</p>',
      },
    },
  },
};
