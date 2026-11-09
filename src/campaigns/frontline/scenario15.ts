import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { PlantEventConfig } from '@app/physical/physical-plant-types';
import { SKYLINK_SERVICE } from './camp-field-config';
import { applyForwardEurosat, applyForwardField, FORWARD_EUROSAT_SERVICE, FORWARD_EUROSAT_UNIT, FORWARD_FIRST_CARD, FORWARD_SKYLINK_ACCOUNT } from './forward-field-config';
import {
  correctionApproved,
  correctionFiled,
  eventFired,
  forecastMeetsReserve,
  handoverValid,
  hypothesisFiled,
  interruptionPattern,
  layerObserved,
  modeIs,
  negativeChecksKept,
  siteChecked,
  workloadVerified,
} from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';
import { S11_TRANSFER_CARD } from './scenario11';

/**
 * Frontline Signals — Scenario 15: Report the EuroSat Incident.
 * Initial state: both terminals run on the battery at the forward post (Skylink unrestricted, EuroSat registered). Resources
 * are reduced: 300 Wh against a 150 Wh reserve, so both terminals running misses the reserve and the modem in standby keeps it.
 * The anomaly is a run of EuroSat registration drops (the modem keeps restarting) while the local network, the power chain and
 * the Skylink service stay up. The engine has no interference primitive, so the pattern is the only evidence: it supports
 * "suspected interference" and never a source, a location or an actor. Nothing freezes the clock; the drops are staged on
 * objective activation, with later recurrences so a player who misses a down window gets another.
 * The incident form (id 'incident') is the record Campaign 5 may enrich from (see continuity-fallbacks.ts). Filing it is
 * optional continuity: nothing here reads the campaign store or requires a completed C6 record, and Campaign 5 is unchanged.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S15_EVENT_ONSET = 's15-eurosat-onset';
export const S15_EVENT_REPEAT_A = 's15-eurosat-repeat-a';
export const S15_EVENT_REPEAT_B = 's15-eurosat-repeat-b';
export const S15_EVENT_REPEAT_C = 's15-eurosat-repeat-c';
export const S15_EVENT_ACK = 's15-referral-acknowledged';
export const S15_REFERRAL = 's15-investigation-referral';
export const S15_START_WH = 300;
export const S15_RESERVE_WH = 150;

const EUS = FORWARD_EUROSAT_SERVICE;
const TRANSFER = S11_TRANSFER_CARD.id;
const choice = (id: string, label: string) => ({ choice: [id], labels: { [id]: label } });

const anomalyForm: HandoverFormConfig = {
  id: 'anomaly',
  title: 'Anomaly record',
  documentSection: 'Anomaly',
  fields: [
    { key: 'service', label: 'Affected service', required: true, rule: choice('eurosat', 'EuroSat') },
    { key: 'onset', label: 'Onset event', required: true, rule: { cites: 'result', min: 1 } },
    { key: 'local', label: 'Local network at the same time', required: true, rule: { matchesCurrent: { serviceId: EUS, layer: 'local' } } },
    { key: 'skylink', label: 'Skylink application now', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    { key: 'symptoms', label: 'Readings that show the symptoms', required: true, rule: { cites: 'observation', min: 1 } },
  ],
};

const evidenceForm: HandoverFormConfig = {
  id: 'evidence',
  title: 'Evidence comparison',
  documentSection: 'Evidence',
  fields: [
    { key: 'pattern', label: 'Readings across the interruptions', required: true, rule: { cites: 'observation', min: 3 } },
    { key: 'provider', label: 'EuroSat provider status now', required: true, rule: { matchesCurrent: { serviceId: EUS, layer: 'provider' } } },
    { key: 'local', label: 'Local equipment explanation', required: true, rule: choice('ruled-out', 'Checked and not supported by the readings') },
    { key: 'limits', label: 'What the quiet provider status shows', required: true, rule: choice('not-proof', 'A missing notice does not prove interference') },
  ],
};

const assessmentForm: HandoverFormConfig = {
  id: 'assessment',
  title: 'Incident assessment',
  documentSection: 'Assessment',
  fields: [
    { key: 'classification', label: 'Classification', required: true, rule: choice('suspected-interference', 'Suspected interference') },
    { key: 'confidence', label: 'Confidence', required: true, rule: choice('moderate', 'Moderate: the pattern fits, nothing measured the cause') },
    { key: 'source', label: 'Source', required: true, rule: choice('not-established', 'Not established') },
    { key: 'basis', label: 'Observations behind it', required: true, rule: { cites: 'observation', min: 3 } },
  ],
};

const packageForm: HandoverFormConfig = {
  id: 'package',
  title: 'Incident package',
  documentSection: 'Package',
  fields: [
    { key: 'observations', label: 'Original observations', required: true, rule: { cites: 'observation', min: 3 } },
    { key: 'events', label: 'Staged events', required: true, rule: { cites: 'result', min: 1 } },
    { key: 'terminal', label: 'EuroSat modem configuration', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'gap', label: 'Missing observation', required: true, rule: choice('no-source-measurement', 'No measurement of the source or where it is') },
  ],
};

const alternativeForm: HandoverFormConfig = {
  id: 'alternative',
  title: 'Alternative service',
  documentSection: 'Alternative service',
  fields: [
    { key: 'verified', label: 'Task run on Skylink', required: true, rule: { workload: { cardId: FORWARD_FIRST_CARD.id, is: ['supported'], serviceId: SKYLINK_SERVICE } } },
    { key: 'modem', label: 'EuroSat modem mode', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
    { key: 'unavailable', label: 'Work that is not available', required: true, rule: choice(TRANSFER, 'Transfer task over EuroSat') },
  ],
};

const incidentForm: HandoverFormConfig = {
  id: 'incident',
  title: 'Investigation handover',
  documentSection: 'Incident',
  fields: [
    { key: 'classification', label: 'Classification', required: true, rule: choice('suspected-interference', 'Suspected interference') },
    { key: 'source', label: 'Source', required: true, rule: choice('not-established', 'Not established') },
    { key: 'available', label: 'Service still available', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'application' } } },
    { key: 'unavailable', label: 'Work still unavailable', required: true, rule: choice(TRANSFER, 'Transfer task over EuroSat') },
    { key: 'open', label: 'Questions this post cannot answer', required: true, rule: choice('source-and-cause', 'Where it comes from and what causes it') },
    { key: 'evidence', label: 'Readings in the package', required: true, rule: { cites: 'observation', min: 3 } },
  ],
};

const drop = (id: string, anchor: string, offsetS: number, requiresFired?: string[]): PlantEventConfig => ({
  id,
  startAfterObjectiveId: anchor,
  offsetS,
  ...(requiresFired ? { requiresFired } : {}),
  actions: [{ kind: 'reboot-part', partId: 'vsat-modem' }],
  logLine: 'The EuroSat modem loses registration; the local network and Skylink are unchanged.',
});

const settings = createFrontlineSettings(15);
if (settings.physicalPlant) {
  const plant = settings.physicalPlant;
  applyForwardField(plant, [FORWARD_FIRST_CARD, S11_TRANSFER_CARD], [anomalyForm, evidenceForm, assessmentForm, packageForm, alternativeForm, incidentForm]);
  applyForwardEurosat(plant, { modemRunning: true });
  // The S10 restriction is over by S15; the reduced resources are the battery and its reserve
  const skylink = plant.service?.accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT);
  if (skylink) {
    skylink.restriction = undefined;
    skylink.capacityFactor = 1;
  }
  const battery = plant.parts.find((p) => p.id === 'power-station');
  if (battery) {
    battery.socWh = S15_START_WH;
  }
  plant.power = { reserveWh: S15_RESERVE_WH, planningHorizonS: 3600, basis: 'battery-only' };
  plant.causeOptions = [
    { id: 'suspected-interference', label: 'Suspected interference' },
    { id: 'unexplained-outage', label: 'Unexplained outage' },
    { id: 'terminal-fault', label: 'Terminal fault' },
    { id: 'provider-fault', label: 'Provider fault' },
    { id: 'named-source', label: 'A named source or location' },
  ];
  plant.equipment = {
    units: [
      {
        unitId: FORWARD_EUROSAT_UNIT,
        label: 'Commissioned EuroSat terminal',
        record: { serial: 'EUS-2208', accountId: 'forward-eurosat', configVersion: 'depot-v2' },
      },
    ],
    requests: [{ id: S15_REFERRAL, unitId: FORWARD_EUROSAT_UNIT, field: 'accountId', to: 'investigation-review', responseEventId: S15_EVENT_ACK, referral: true }],
  };
  plant.events = [
    drop(S15_EVENT_ONSET, 's15-record-anomaly', 15),
    drop(S15_EVENT_REPEAT_A, 's15-record-anomaly', 240, [S15_EVENT_ONSET]),
    drop(S15_EVENT_REPEAT_B, 's15-review-evidence', 50, [S15_EVENT_ONSET]),
    drop(S15_EVENT_REPEAT_C, 's15-review-evidence', 150, [S15_EVENT_ONSET]),
    {
      id: S15_EVENT_ACK,
      startAfterObjectiveId: 's15-submit-referral',
      actions: [{ kind: 'respond-request', requestId: S15_REFERRAL, status: 'approved' }],
      logLine: 'The investigation team accepts the referral.',
    },
  ];
}

export const frontlineScenario15Data: FrontlineScenarioData = {
  id: 'frontline-scenario15',
  url: 'frontline/scenarios/frontline-scenario15',
  imageUrl: 'frontline/sandbox/card.png',
  number: 15,
  isDisabled: true,
  prerequisiteScenarioIds: ['frontline-scenario14'],
  difficulty: 'intermediate',
  title: 'Report the EuroSat Incident',
  subtitle: 'Evidence Before Attribution',
  duration: '25-35 min',
  missionType: 'Field Communications',
  description:
    "EuroSat develops an unexplained service anomaly. Preserve the observations, judge what they support, and keep the service report accurate while compatible work continues on the alternative connection. A separate investigation will assess the incident's source.",
  equipment: ['EuroSat and Skylink terminals', 'Physical inspection kit', 'Provider and service histories', 'Synthetic workload monitor', 'Incident evidence package'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's15-record-anomaly',
      title: 'Record the Service Anomaly',
      description:
        "Capture the affected EuroSat service, the observed onset, and Ola's workload symptoms. Keep the first report and sample times so later evidence can be compared with the same event.",
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [eventFired(S15_EVENT_ONSET, 'EuroSat anomaly has begun'), handoverValid('anomaly', 'Affected service, onset and symptoms recorded')],
    },
    {
      id: 's15-review-evidence',
      title: 'Review the Available Evidence',
      description:
        'Compare the physical checks, provider status, and service observations around the anomaly. Record checks that rule out a local explanation as well as evidence that remains inconclusive.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s15-record-anomaly'],
      points: 15,
      conditions: [
        interruptionPattern(EUS, 2, 'Repeated EuroSat interruptions read, with the local network up'),
        siteChecked(['vsat-feed', 'vsat-ifl:lnb', 'vsat-ifl:modem', 'power-station'], 'Antenna feed, cables and power checked'),
        negativeChecksKept(2, 'Checks that found nothing kept as evidence'),
        layerObserved(EUS, 'provider', { status: 'up' }, 'EuroSat provider status read with no notice'),
        handoverValid('evidence', 'Evidence comparison recorded'),
      ],
    },
    {
      id: 's15-assess-confidence',
      title: 'State the Incident Confidence',
      description:
        'Decide whether the collected evidence supports suspected interference or an unexplained outage. Name the observations supporting that assessment and keep source attribution unresolved.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s15-review-evidence'],
      points: 15,
      conditions: [
        hypothesisFiled(['suspected-interference'], { minCited: 3 }, 'Suspected interference filed with three observations'),
        handoverValid('assessment', 'Classification, confidence and unresolved source recorded'),
        {
          type: 'status-check',
          description: 'Attribution Limit Understood',
          params: {
            character: Character.SYSTEM,
            question: 'A service record supports suspected interference but contains no source-location evidence. Which statement belongs in the incident report?',
            options: [
              'The interference source is confirmed because the service changed.',
              'The nearest known transmitter caused the observed interruption.',
              'The provider is responsible because its terminal was affected.',
              'Interference is suspected; the source remains unestablished.',
            ],
            correctIndex: 3,
            explanation:
              'Evidence of a service anomaly can support a suspected mechanism without locating its source. The report should preserve that distinction so the later investigation starts from observations rather than an unsupported attribution.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
    },
    {
      id: 's15-preserve-package',
      title: 'Preserve the Incident Record',
      description: 'Save the relevant observations, configuration history, and confidence statement together. Retain original timestamps and identify any gaps in the record.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s15-assess-confidence'],
      points: 15,
      conditions: [handoverValid('package', 'Incident package preserved with its gaps')],
    },
    {
      id: 's15-maintain-supported-work',
      title: 'Verify the Remaining Service',
      description:
        'Choose only a workload supported by the remaining connection and resource allowance. Apply the permitted configuration, then verify the task with a fresh end-to-end result.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s15-preserve-package'],
      points: 15,
      conditions: [
        modeIs('vsat-modem', 'standby', 'EuroSat modem in standby'),
        forecastMeetsReserve({}, 'Forecast keeps the 150 Wh reserve with the modem in standby'),
        workloadVerified({ card: FORWARD_FIRST_CARD.id, service: SKYLINK_SERVICE, afterEvent: S15_EVENT_ONSET }, 'First task verified on Skylink after the onset'),
        layerObserved(SKYLINK_SERVICE, 'application', { status: 'up' }, 'Skylink application observed up'),
        handoverValid('alternative', 'Alternative service and unavailable work recorded'),
      ],
    },
    {
      id: 's15-submit-referral',
      title: 'Submit the Investigation Handover',
      description:
        'Refer the preserved incident package for the separate investigation. Include the service still available, the work still unavailable, and the questions that this post has not answered.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s15-maintain-supported-work'],
      points: 15,
      conditions: [
        handoverValid('incident', 'Investigation handover filed'),
        correctionFiled(S15_REFERRAL, 'Referral sent for the separate investigation'),
        correctionApproved(S15_REFERRAL, 'Investigation team accepted the referral'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: "<p>This shift needs a clear incident record if the service changes. Preserve the observations before you decide what caused them. We can refer a suspected problem without pretending we've already identified its source.</p>",
    },
    objectivesOnStart: {
      's15-review-evidence': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The EuroSat test stopped updating, and I've kept the last result with its time. I can't tell you the cause from the application. The local checks and service records need comparing.</p>",
      },
      's15-assess-confidence': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: '<p>State how far the evidence takes us. A suspected cause is useful if you explain why you suspect it; a source claim needs evidence we may not have.</p>',
      },
      's15-maintain-supported-work': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>I'll run the task you select on the remaining connection. Keep the unavailable work in the report as well, so one successful test doesn't hide what we've lost.</p>",
      },
    },
    objectives: {
      's15-preserve-package': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: '<p>The observations and your assessment are preserved separately. That gives the investigators something they can review without treating every conclusion as a measured fact.</p>',
      },
      's15-submit-referral': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The referral includes the evidence, the service we're still providing, and the questions we couldn't answer. The source investigation can begin from that record.</p>",
      },
    },
  },
};
