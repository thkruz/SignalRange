import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import type { PlantEventConfig } from '@app/physical/physical-plant-types';
import { SKYLINK_SERVICE } from './camp-field-config';
import { S15_INCIDENT_LINK } from './continuity-fallbacks';
import {
  applyForwardDualReadiness,
  applyForwardEurosat,
  applyForwardField,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_EUROSAT_UNIT,
  FORWARD_FIRST_CARD,
  FORWARD_PROVIDER,
  FORWARD_SKYLINK_ACCOUNT,
} from './forward-field-config';
import {
  anyServiceSupports,
  eventFired,
  faultClearedWithEvidence,
  forecastMeetsReserve,
  handoverValid,
  layerObserved,
  modeIs,
  reserveHeld,
  samplesCurrent,
  workloadVerified,
} from './frontline-conditions';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';
import { S11_TRANSFER_CARD } from './scenario11';

/**
 * Frontline Signals — Scenario 16: Complete the Independent Shift.
 * Initial state: both terminals are installed at the forward post (SkyLink unrestricted, EuroSat registered) on a 360 Wh battery
 * with a 200 Wh reserve. Both terminals running misses the reserve, so the player picks the arrangement. The prior EuroSat
 * incident arrives through the S15 continuity link (S15_INCIDENT_LINK, canonical fallback when no record exists) and never
 * claims a source.
 * Staged events are objective-anchored and ordered: the local fault c6-s16-local-supply (partial-seat at ps:ac-out, not named
 * in player prompts) is injected when s16-investigate-local-change activates. The external event (a SkyLink provider outage
 * with a maintenance notice for the post account) is anchored on s16-assess-external-change, which can only activate after the
 * local objective completed (repair, evidence and a fresh post-repair run recorded), and also requires the local event fired.
 * S2 teaches this seating mechanism and evidence-before-reseat method at generator:out; no new repair verb is introduced.
 * The mission task (fwd-first) needs SkyLink; during the outage only the delay-tolerant transfer is supportable on EuroSat,
 * so limited service is the valid final outcome and fwd-first is reported as unavailable.
 * Every threshold and window below is an implementer default flagged for Ted in art-review/c6/m27-result.md.
 * Eastern European accents belong to VO performance; audio is not recorded yet.
 */
export const S16_FAULT = 'c6-s16-local-supply';
export const S16_EVENT_LOCAL = 's16-local-supply-loss';
export const S16_EVENT_NOTICE = 's16-provider-notice';
export const S16_EVENT_OUTAGE = 's16-skylink-outage';
export const S16_NOTICE = 's16-skylink-maintenance-notice';
export const S16_START_WH = 360;
export const S16_RESERVE_WH = 200;
export const S16_FINAL_WINDOW_S = 120;
/** The outage starts this long after the external objective activates, so the first reading can be a clean one */
export const S16_OUTAGE_OFFSET_S = 15;

const SKY = SKYLINK_SERVICE;
const EUS = FORWARD_EUROSAT_SERVICE;
const FIRST = FORWARD_FIRST_CARD.id;
const TRANSFER = S11_TRANSFER_CARD.id;
const choice = (id: string, label: string) => ({ choice: [id], labels: { [id]: label } });

const briefForm: HandoverFormConfig = {
  id: 'brief',
  title: 'Shift commitments',
  documentSection: 'Commitments',
  fields: [
    { key: 'task', label: 'Mission task to demonstrate', required: true, rule: choice(FIRST, 'First forward task over SkyLink') },
    { key: 'reserve', label: 'Battery reserve to keep', required: true, rule: choice('reserve-200', 'Keep 200 Wh of stored energy') },
    { key: 'equipment', label: 'Equipment available', required: true, rule: choice('both-terminals', 'SkyLink and EuroSat terminals, router, workstation, battery and generator') },
    { key: 'prior', label: 'Prior EuroSat incident', required: true, rule: choice('source-not-established', 'Suspected interference, source not established') },
    { key: 'unknowns', label: 'Claims that need current evidence', required: true, rule: choice('service-and-power', 'Service state and power state this shift') },
  ],
};

const baselineForm: HandoverFormConfig = {
  id: 'baseline',
  title: 'Baseline',
  documentSection: 'Baseline',
  fields: [
    { key: 'dish', label: 'SkyLink dish mode', required: true, rule: { modeIs: { partId: 'skylink-dish' } } },
    { key: 'modem', label: 'EuroSat modem mode', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'local', label: 'Local network now', required: true, rule: { matchesCurrent: { serviceId: SKY, layer: 'local' } } },
    { key: 'application', label: 'SkyLink application now', required: true, rule: { matchesCurrent: { serviceId: SKY, layer: 'application' } } },
    { key: 'verified', label: 'First task run on SkyLink', required: true, rule: { workload: { cardId: FIRST, is: ['supported'], serviceId: SKY } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
  ],
};

const localForm: HandoverFormConfig = {
  id: 'local',
  title: 'First service change',
  documentSection: 'Local incident',
  fields: [
    { key: 'seating', label: 'Readings that located the cause', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'action', label: 'Intervention applied', required: true, rule: { cites: 'action', min: 1 } },
    { key: 'verified', label: 'First task run after the repair', required: true, rule: { workload: { cardId: FIRST, is: ['supported'], serviceId: SKY } } },
    { key: 'application', label: 'SkyLink application now', required: true, rule: { matchesCurrent: { serviceId: SKY, layer: 'application' } } },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
  ],
};

const externalForm: HandoverFormConfig = {
  id: 'external',
  title: 'Next service change',
  documentSection: 'External incident',
  fields: [
    { key: 'scope', label: 'What the notice covers', required: true, rule: choice('skylink-provider', 'SkyLink provider service for the post account') },
    { key: 'local', label: 'Relation to the repaired supply fault', required: true, rule: choice('separate', 'Separate from the repaired supply fault') },
    { key: 'provider', label: 'SkyLink provider status now', required: true, rule: { matchesCurrent: { serviceId: SKY, layer: 'provider' } } },
    { key: 'evidence', label: 'Readings behind it', required: true, rule: { cites: 'observation', min: 3 } },
    { key: 'fix', label: 'Local restart', required: true, rule: choice('does-not-clear', 'A local restart does not clear a provider outage') },
  ],
};

const outcomeForm: HandoverFormConfig = {
  id: 'outcome',
  title: 'Shift outcome',
  documentSection: 'Outcome',
  fields: [
    { key: 'modem', label: 'EuroSat modem mode', required: true, rule: { modeIs: { partId: 'vsat-modem' } } },
    { key: 'dish', label: 'SkyLink dish mode', required: true, rule: { modeIs: { partId: 'skylink-dish' } } },
    { key: 'verified', label: 'Transfer task run on EuroSat', required: true, rule: { workload: { cardId: TRANSFER, is: ['supported'], serviceId: EUS } } },
    { key: 'unavailable', label: 'Mission task not available', required: true, rule: choice(FIRST, 'First forward task over SkyLink') },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
  ],
};

const finalForm: HandoverFormConfig = {
  id: 'final',
  title: 'Independent handover',
  documentSection: 'Final handover',
  fields: [
    { key: 'localEvidence', label: 'Local fault readings', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'localAction', label: 'Local fault intervention', required: true, rule: { cites: 'action', min: 1 } },
    { key: 'externalEvidence', label: 'External event readings', required: true, rule: { cites: 'observation', min: 3 } },
    { key: 'incidents', label: 'The two incidents', required: true, rule: choice('separate', 'Two separate incidents with different causes') },
    { key: 'service', label: 'Service available', required: true, rule: choice('limited', 'Limited: transfer over EuroSat only') },
    { key: 'unavailable', label: 'Task not available', required: true, rule: choice(FIRST, 'First forward task over SkyLink') },
    { key: 'prior', label: 'Prior EuroSat incident', required: true, rule: choice('source-not-established', 'Suspected interference, source not established') },
    { key: 'energy', label: 'Battery energy now (Wh)', required: true, rule: { powerWithin: { metric: 'socWh', tol: 40, partId: 'power-station' } } },
  ],
};

const settings = createFrontlineSettings(16);
if (settings.physicalPlant) {
  const plant = settings.physicalPlant;
  applyForwardField(plant, [FORWARD_FIRST_CARD, S11_TRANSFER_CARD], [briefForm, baselineForm, localForm, externalForm, outcomeForm, finalForm]);
  applyForwardEurosat(plant, { modemRunning: true });
  // Both terminals become switchable units; the battery and reserve below replace the S14 numbers
  applyForwardDualReadiness(plant);
  // SkyLink is unrestricted at the start of the shift (the S10 restriction ended in S14)
  const skylink = plant.service?.accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT);
  if (skylink) {
    skylink.restriction = undefined;
    skylink.capacityFactor = 1;
  }
  const battery = plant.parts.find((p) => p.id === 'power-station');
  if (battery) {
    battery.socWh = S16_START_WH;
  }
  plant.power = { reserveWh: S16_RESERVE_WH, planningHorizonS: 3600, basis: 'battery-only' };
  // A blind reseat clears the fault without evidence, so the objective cannot lock on missing evidence: the debrief scores it
  plant.causeOptions = [
    { id: 'connector-seating', label: 'A connector is not fully seated' },
    { id: 'supply-exhausted', label: 'The supply is exhausted' },
    { id: 'terminal-fault', label: 'Terminal fault' },
    { id: 'provider-outage', label: 'Provider outage' },
  ];
  plant.equipment = {
    units: [
      {
        unitId: FORWARD_EUROSAT_UNIT,
        label: 'Commissioned EuroSat terminal',
        record: { serial: 'EUS-2208', accountId: 'forward-eurosat', configVersion: 'depot-v2' },
      },
    ],
    notices: [
      {
        id: S16_NOTICE,
        version: 1,
        providerId: FORWARD_PROVIDER,
        affects: { accountId: FORWARD_SKYLINK_ACCOUNT },
        kind: 'maintenance',
        issuedAtS: 0,
        text: 'SkyLink service notice. Unplanned provider maintenance has stopped SkyLink service for the forward post account. This notice covers the provider service only. It does not describe any equipment at the post.',
      },
    ],
    requests: [],
  };
  const events: PlantEventConfig[] = [
    {
      id: S16_EVENT_LOCAL,
      startAfterObjectiveId: 's16-investigate-local-change',
      actions: [{ kind: 'inject-fault', fault: { id: S16_FAULT, target: 'ps:ac-out', kind: 'partial-seat' } }],
      logLine: 'The supply to the equipment drops out at the power station output.',
    },
    {
      id: S16_EVENT_NOTICE,
      startAfterObjectiveId: 's16-assess-external-change',
      requiresFired: [S16_EVENT_LOCAL],
      actions: [{ kind: 'deliver-notice', noticeId: S16_NOTICE }],
      logLine: 'A provider notice arrives for the post account.',
    },
    {
      id: S16_EVENT_OUTAGE,
      startAfterObjectiveId: 's16-assess-external-change',
      offsetS: S16_OUTAGE_OFFSET_S,
      requiresFired: [S16_EVENT_LOCAL],
      actions: [{ kind: 'set-provider', patch: { id: FORWARD_PROVIDER, status: 'outage' } }],
      logLine: 'SkyLink service stops while the local equipment is unchanged.',
    },
  ];
  plant.events = events;
}

// The prior incident record: the S15 handover when it exists, otherwise the canonical fallback (no source established)
export const S16_PRIOR_INCIDENT_LINK = S15_INCIDENT_LINK;

export const frontlineScenario16Data: FrontlineScenarioData = {
  id: 'frontline-scenario16',
  url: 'frontline/scenarios/frontline-scenario16',
  imageUrl: 'frontline/sandbox/card.png',
  number: 16,
  isDisabled: true,
  prerequisiteScenarioIds: ['frontline-scenario15'],
  difficulty: 'advanced',
  title: 'Complete the Independent Shift',
  subtitle: 'Evidence, Service, and Handover',
  duration: '35-45 min',
  missionType: 'Field Communications',
  description:
    'Take responsibility for an independent shift at Rautala. Use the handover and current evidence to manage the service, investigate changes, and account for the resources left behind. Irena needs a defensible final report, including any task that remains unavailable.',
  equipment: [
    'SkyLink and EuroSat terminals',
    'Router and pilot workstation',
    'Generator, battery, and shared power distribution',
    'Inspection and measurement tools',
    'Limited spares and shift handover',
  ],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's16-review-handover',
      title: 'Review the Shift Commitments',
      description:
        'Read the handover, task requirements, available resources, and unresolved incident questions. Identify the outcomes you must demonstrate and the claims that still need current evidence.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      points: 15,
      conditions: [handoverValid('brief', 'Commitments, reserve, equipment and the prior incident recorded')],
    },
    {
      id: 's16-establish-configuration',
      title: 'Establish the Current Service',
      description:
        'Collect current service and power evidence, then select an operating configuration that meets the task and reserve requirements. Record the baseline before starting the shift workload.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s16-review-handover'],
      points: 15,
      conditions: [
        forecastMeetsReserve({}, 'Forecast keeps the 200 Wh reserve in the chosen arrangement'),
        anyServiceSupports(FIRST, [SKY], 'A configured service supports the first task'),
        samplesCurrent(SKY, ['local', 'application'], 'Current local and application readings taken'),
        workloadVerified({ card: FIRST, service: SKY }, 'First task verified on SkyLink'),
        handoverValid('baseline', 'Baseline recorded'),
      ],
    },
    {
      id: 's16-investigate-local-change',
      title: 'Resolve the First Service Change',
      description:
        'Investigate the reported change using observations you judge relevant. Record the evidence, apply a justified intervention, and verify its local result while accounting for disruption and resources.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s16-establish-configuration'],
      points: 15,
      conditions: [
        {
          type: 'plant-fault-cleared',
          description: 'Local Fault Cleared',
          params: {
            faultId: 'c6-s16-local-supply',
          },
          mustMaintain: false,
        },
        eventFired(S16_EVENT_LOCAL, 'Supply change has begun'),
        faultClearedWithEvidence(S16_FAULT, 'Repair supported by recorded evidence'),
        workloadVerified({ card: FIRST, service: SKY, afterFaultCleared: S16_FAULT }, 'First task verified on SkyLink after the repair'),
        handoverValid('local', 'First service change recorded'),
      ],
    },
    {
      id: 's16-assess-external-change',
      title: 'Assess the Next Service Change',
      description:
        'Collect new evidence for the later interruption instead of reusing the first diagnosis. Assess the available service and select a supported response without confusing an external limit with the repaired local problem.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s16-investigate-local-change'],
      points: 15,
      conditions: [
        eventFired(S16_EVENT_NOTICE, 'Provider notice delivered'),
        eventFired(S16_EVENT_OUTAGE, 'SkyLink service has stopped'),
        samplesCurrent(SKY, ['local', 'provider', 'application'], 'Current local, provider and application readings taken'),
        layerObserved(SKY, 'provider', { status: 'down' }, 'Provider outage observed'),
        layerObserved(SKY, 'local', { status: 'up' }, 'Local network observed up'),
        handoverValid('external', 'Separate external limitation recorded'),
      ],
    },
    {
      id: 's16-verify-final-service',
      title: 'Verify the Shift Outcome',
      description:
        'Run the supported workload through the final assessment window. Confirm the service and remaining reserve from current evidence, and record any required task that cannot be supported.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s16-assess-external-change'],
      points: 15,
      conditions: [
        modeIs('vsat-modem', 'run', 'EuroSat modem running'),
        forecastMeetsReserve({}, 'Forecast keeps the 200 Wh reserve with the final arrangement'),
        workloadVerified({ card: TRANSFER, service: EUS, afterEvent: S16_EVENT_OUTAGE }, 'Transfer task verified on EuroSat after the outage began'),
        layerObserved(EUS, 'application', { status: 'up' }, 'EuroSat application observed up'),
        reserveHeld({ windowS: S16_FINAL_WINDOW_S }, 'Reserve held through the final window'),
        handoverValid('outcome', 'Final outcome recorded with the unavailable task'),
      ],
    },
    {
      id: 's16-submit-final-handover',
      title: 'Submit the Independent Handover',
      description:
        'Complete the shift record with observations, diagnoses, decisions, corrective actions, and verified outcomes. Separate the two incidents and leave the next operator an accurate account of the configuration, resources, and unresolved limits.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s16-verify-final-service'],
      points: 15,
      conditions: [handoverValid('final', 'Independent handover accepted')],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.IRENA_MAZUR,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
      text: '<p>This shift is yours to assess. The handover includes the available equipment, the task requirements, and the unresolved incident. Give me verified service and a clear account of anything that remains limited.</p>',
    },
    objectivesOnStart: {
      's16-investigate-local-change': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The application has stopped giving me a current result. I've recorded what changed at my end. Let me know when you need another check.</p>",
      },
      's16-assess-external-change': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>There's a new interruption after the earlier check. I've kept the two reports separate because I don't know whether they have the same cause.</p>",
      },
      's16-submit-final-handover': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>Leave the next operator enough evidence to understand your decisions. Include the tasks we couldn't support and the resources still available.</p>",
      },
    },
    objectives: {
      's16-verify-final-service': {
        character: Character.ALEKSANDRA_WYSOCKA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
        text: "<p>The final check has a current result, and I've saved it with this shift. The record shows which task we tested and which requests remain unavailable.</p>",
      },
      's16-submit-final-handover': {
        character: Character.IRENA_MAZUR,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
        text: "<p>You've kept the incidents separate, verified the outcome, and left an accurate handover. I can assign the next shift from that record. You're ready to take responsibility for the post.</p>",
      },
    },
  },
};
