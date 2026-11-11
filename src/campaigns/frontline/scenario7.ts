import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { applyCampField, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { correctionApproved, correctionFiled, handoverCurrent, handoverValid, recordAccepted, samplesCurrent, workloadVerified } from './frontline-conditions';
import { checked, pick } from './report-choices';
import { createFrontlineSettings, type FrontlineScenarioData } from './scenario-support';

/**
 * C6 S7: equipment acceptance at Kivilahti. A configuration discrepancy is not proof of compromise.
 * The replacement router's record differs from the unit in one field: the configuration version on the unit
 * (depot-v3) has no approval reference, while the record carries handover-v2. The player files the authored
 * correction request; the authorized contact's answer is the plant event s7-config-approved (anchored to the
 * assessment objective, so a slow player never misses it; the ledger holds the answer until the request is filed).
 * Acceptance is refused while anything differs, and the fresh service check must start after the approval.
 * VO uses the C6 Eastern European casting direction. No audio has been generated.
 */

const settings = createFrontlineSettings(7);
const UNIT = 'kivilahti-router';
const REQUEST = 's7-config-approval';
const APPROVAL_EVENT = 's7-config-approved';
const REPLY_NOTICE = 's7-config-reply';

/** The terminal hardware a delivery check can fairly look at */
const HARDWARE = ['skylink-router', 'skylink-dish', 'skylink-cable', 'skylink-cable:dish', 'skylink-cable:router'];
const HARDWARE_CHECKED = checked('hardware', 'a hands-on look at the terminal hardware', HARDWARE);

const inventoryForm: HandoverFormConfig = {
  id: 'inventory',
  title: 'Delivery reconciliation',
  documentSection: 'Delivery',
  fields: [
    {
      key: 'serial',
      label: 'Serial on the unit against the inventory',
      required: true,
      rule: pick({ matches: 'Matches the inventory entry', differs: 'Differs from the inventory entry', 'not-checked': 'Not checked' }, ['matches']),
    },
    {
      key: 'account',
      label: 'Account assignment',
      required: true,
      rule: pick({ matches: 'Matches the authorized account', differs: 'Differs from the authorized account', 'not-checked': 'Not checked' }, ['matches']),
    },
    {
      key: 'configuration',
      label: 'Configuration version',
      required: true,
      rule: pick({ unconfirmed: 'Differs from the record and is not confirmed', matches: 'Matches the record', 'approved-later': 'Differs from the record but was approved' }, [
        'unconfirmed',
      ]),
    },
    {
      key: 'depot',
      label: 'What the depot test record shows',
      required: true,
      rule: pick({ 'earlier-test-only': 'Only the earlier hardware test', 'service-test': 'A full service test after the last change', 'no-record': 'No test record at all' }, [
        'earlier-test-only',
      ]),
    },
  ],
};

const readinessForm: HandoverFormConfig = {
  id: 'readiness',
  title: 'Readiness assessment',
  documentSection: 'Readiness',
  fields: [
    { key: 'hardware', label: 'Hardware checks you made', required: true, rule: { evidence: [HARDWARE_CHECKED] } },
    {
      key: 'registration',
      label: 'Terminal link reading (take it just before you fill this form; an old reading is refused as out of date)',
      required: true,
      rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } },
    },
    {
      key: 'authorization',
      label: 'Authorization state',
      required: true,
      rule: pick({ unresolved: 'Unresolved until the configuration is confirmed', authorized: 'Authorized, the hardware checks passed', denied: 'Denied for service' }, [
        'unresolved',
      ]),
    },
    {
      key: 'workload',
      label: 'Workload readiness',
      required: true,
      rule: pick({ 'not-ready': 'Not ready for service', ready: 'Ready for service', 'ready-with-limits': 'Ready, with the unconfirmed version noted' }, ['not-ready']),
    },
  ],
};

const configReviewForm: HandoverFormConfig = {
  id: 'config-review',
  title: 'Configuration review',
  documentSection: 'Configuration history',
  fields: [
    {
      key: 'entry',
      label: 'Record that differs',
      required: true,
      rule: pick({ configVersion: 'Configuration version', serial: 'Serial number', account: 'Account assignment' }, ['configVersion']),
    },
    {
      key: 'original',
      label: 'Version in the approved handover',
      required: true,
      rule: pick({ 'handover-v2': 'handover-v2', 'handover-v1': 'handover-v1', 'depot-v3': 'depot-v3' }, ['handover-v2']),
    },
    {
      key: 'unexplained',
      label: 'Version on the unit',
      required: true,
      rule: pick({ 'depot-v3': 'depot-v3', 'depot-v2': 'depot-v2', 'handover-v2': 'handover-v2' }, ['depot-v3']),
    },
    {
      key: 'reference',
      label: 'Approval reference for the unit version',
      required: true,
      rule: pick({ none: 'None in the record', 'handover-ref': 'The handover reference', 'depot-ref': 'The depot test reference' }, ['none']),
    },
  ],
};

const acceptanceForm: HandoverFormConfig = {
  certification: { events: [APPROVAL_EVENT] },
  id: 'acceptance',
  title: 'Equipment acceptance',
  documentSection: 'Acceptance',
  fields: [
    {
      key: 'mismatch',
      label: 'Mismatch you found',
      required: true,
      rule: pick(
        { 'config-version': 'Configuration version without an approval reference', 'serial-mismatch': 'Serial number does not match', 'wrong-account': 'Account does not match' },
        ['config-version']
      ),
    },
    {
      key: 'cause',
      label: 'What is known about its cause',
      required: true,
      rule: pick({ 'not-established': 'Not established by the records', 'depot-error': 'A depot error', tampering: 'Tampering in transit' }, ['not-established']),
    },
    {
      key: 'observations',
      label: 'Observations kept',
      required: true,
      rule: { evidence: [{ ...HARDWARE_CHECKED, orMatch: [{ kind: 'observation', serviceId: SKYLINK_SERVICE }] }] },
    },
    {
      key: 'verified',
      label: 'Fresh service check after the correction (needs a Workload run started after the reply)',
      required: true,
      rule: { workload: { cardId: OLA_CHECK_CARD.id, is: ['supported'], serviceId: SKYLINK_SERVICE } },
    },
  ],
};

if (settings.physicalPlant) {
  applyCampField(settings.physicalPlant, [OLA_CHECK_CARD], [inventoryForm, readinessForm, configReviewForm, acceptanceForm]);
  settings.physicalPlant.equipment = {
    units: [
      {
        unitId: UNIT,
        label: 'SkyLink router (replacement unit)',
        record: { serial: 'RT-4471', accountId: 'camp-skylink', configVersion: 'handover-v2' },
        installed: { serial: 'RT-4471', accountId: 'camp-skylink', configVersion: 'depot-v3' },
        history: [
          { at: 'Depot, before dispatch', text: 'Serial RT-4471 assigned to the Kivilahti camp account. Approval reference HO-2291.' },
          { at: 'Depot, before dispatch', text: 'Configuration set to handover-v2. Approval reference HO-2291 (the approved handover).' },
          { at: 'Depot, after the hardware test', text: 'Configuration changed to depot-v3. Approval reference: none recorded.' },
        ],
        depotRecord: 'Hardware test passed (power, radio, port loop). No service test is recorded after the configuration was changed.',
      },
    ],
    notices: [
      {
        id: REPLY_NOTICE,
        version: 1,
        providerId: 'service-contact',
        affects: { accountId: 'camp-skylink' },
        kind: 'maintenance',
        issuedAtS: 0,
        issuedOnDelivery: true,
        text: 'Correction approved. Configuration version depot-v3 is authorized for router RT-4471 under change reference CH-2231. The record now reads depot-v3. Run a fresh service check before you accept the unit.',
      },
    ],
    requests: [
      {
        id: REQUEST,
        unitId: UNIT,
        field: 'configVersion',
        to: 'depot-v3',
        responseEventId: APPROVAL_EVENT,
        replyNotice: REPLY_NOTICE,
        note: 'depot-v3 is the version the unit is running now; the handover record lists handover-v2. The service contact decides whether depot-v3 is authorized. The answer arrives in the Notice inbox below after a short wait.',
      },
    ],
  };
  settings.physicalPlant.events = [
    {
      id: APPROVAL_EVENT,
      startAfterObjectiveId: 's07-assess-discrepancy',
      offsetS: 45,
      actions: [{ kind: 'respond-request', requestId: REQUEST, status: 'approved' }],
      logLine: 'The service contact answers the correction request.',
    },
  ];
}

export const frontlineScenario7Data: FrontlineScenarioData = {
  id: 'frontline-scenario7',
  url: 'frontline/scenarios/frontline-scenario7',
  imageUrl: 'frontline/physical/card-inside-night.webp',
  number: 7,
  isDisabled: false,
  prerequisiteScenarioIds: ['frontline-scenario6'],
  title: 'Accept Equipment Securely',
  subtitle: 'Hardware Health and Authorized Service',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Field Service Assessment',
  description:
    'Tomek has delivered a replacement router with a depot test record, but its service handover is incomplete. Compare the unit, authorized inventory, and configuration history before accepting it.<br/><br/>Working hardware does not establish that the correct account and configuration are in use. Preserve discrepancies, request the approved correction, and verify the result without bypassing access controls.',
  equipment: ['Replacement router', 'SkyLink terminal', 'Authorized inventory and service record', 'Laptop and physical inspection tools'],
  settings,
  mechanicTodos: [],
  objectives: [
    {
      id: 's07-reconcile-delivery',
      title: 'Reconcile the Delivery',
      description: 'Compare the delivered unit with the authorized inventory and account assignment. Record what matches and what still lacks confirmation.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: [],
      nice: ['T0431', 'K0645'],
      points: 15,
      conditions: [handoverValid('inventory', 'Delivered equipment and assignment compared')],
    },
    {
      id: 's07-separate-readiness',
      title: 'Separate Hardware from Service Readiness',
      description: 'Inspect the replacement router and compare the hardware checks with its registration and authorization state. Keep incomplete checks visible.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-reconcile-delivery'],
      nice: ['T0431', 'K0741'],
      points: 15,
      conditions: [
        {
          type: 'part-inspected',
          description: 'SkyLink router inspected',
          mustMaintain: false,
          params: {
            partId: 'skylink-router',
          },
        },
        samplesCurrent(SKYLINK_SERVICE, ['power', 'local', 'registration'], 'Current service readings taken'),
        handoverValid('readiness', 'Hardware and service readiness recorded separately'),
      ],
    },
    {
      id: 's07-review-records',
      title: 'Review the Configuration History',
      description:
        'Read the configuration and access history under Records and notices (Site tab) and compare it with the approved handover. Then fill in the Configuration review form: submitting it preserves the entry whose authorization cannot be established.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-separate-readiness'],
      nice: ['K0645', 'K0792'],
      points: 15,
      conditions: [handoverValid('config-review', 'Configuration review submitted, unexplained entry preserved')],
    },
    {
      id: 's07-assess-discrepancy',
      title: 'State What the Evidence Supports',
      description:
        'The reviewed configuration record contains an entry without an approval reference. Assess what that omission establishes before requesting a correction. A Knowledge Check opens for this step (Open Quiz banner, or the ? in this list); answering it completes the step.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-review-records'],
      nice: ['T0081', 'K0792'],
      points: 10,
      conditions: [
        {
          type: 'status-check',
          description: 'Discrepancy Assessed Without Unsupported Attribution',
          mustMaintain: false,
          params: {
            character: Character.SYSTEM,
            question: 'What can you conclude from a configuration entry with no matching approval reference?',
            options: [
              'The unit is compromised and every other record must be discarded.',
              'The entry is unexplained and needs authorized review.',
              'The missing reference is harmless because the depot hardware test passed.',
            ],
            correctIndex: 1,
            explanation:
              "The record establishes an unexplained discrepancy, not its cause. Preserve it and request authorized review. A depot hardware test can't validate a later configuration change.",
          },
        },
      ],
    },
    {
      id: 's07-request-correction',
      title: 'Request the Authorized Correction',
      description:
        'File the correction request under Records and notices. The service contact answers in the Notice inbox after a short wait. Retain the response and approved configuration before accepting service.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-assess-discrepancy'],
      nice: ['T1567', 'K0645'],
      points: 15,
      conditions: [correctionFiled(REQUEST, 'Correction request filed with the service contact'), correctionApproved(REQUEST, 'Approved configuration received')],
    },
    {
      id: 's07-verify-acceptance',
      title: 'Verify and Hand Over the Unit',
      description:
        'Start an Ola application check from MissionRunner after the approved correction (the form needs a run that began after the reply). Accept the unit once every record row reads Matches, then submit the accepted configuration, its evidence, and any unresolved concerns for the next operator.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-request-correction'],
      nice: ['T0431', 'K0645'],
      points: 25,
      conditions: [
        recordAccepted(UNIT, 'SkyLink router accepted on a matching record'),
        workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE, afterRequestApproved: REQUEST }, 'Service checked after the approved correction'),
        handoverCurrent('acceptance', 'Authorized service verified and handover submitted'),
      ],
    },
  ],
  dialogClips: {
    intro: {
      character: Character.TOMASZ_WRONA,
      audioUrl: '',
      emotion: Emotion.NEUTRAL,
      text: "The replacement router passed its depot test, but the account handover hasn't been confirmed. I've brought the records with the unit. Check them together before you count it as ready.",
    },
    objectivesOnStart: {
      's07-reconcile-delivery': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        text: 'The label tells you which unit arrived. The service record tells you what was tested. I keep them together because neither one answers every acceptance question.',
      },
      's07-separate-readiness': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "A healthy device can still have the wrong service assignment. Keep those checks separate so a passed hardware test doesn't hide unfinished work.",
      },
      's07-review-records': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: 'Use the approved handover as your reference. If a change has no explanation, keep the record intact so the service contact can review the same evidence.',
      },
      's07-request-correction': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        text: "I'll pass the discrepancy to the authorized service contact with the unit's record. We need a confirmed correction, not another assumption about what the depot checked.",
      },
      's07-verify-acceptance': {
        character: Character.ALEKSANDRA_WYSOCKA,
        audioUrl: '',
        text: "Let me know when the corrected service is ready for a fresh check. I won't count an earlier result as proof of the new configuration.",
      },
    },
    objectives: {
      's07-assess-discrepancy': {
        character: Character.MAREK_DOMANSKI,
        audioUrl: '',
        text: "You've kept the discrepancy separate from a claim about its cause. That gives the reviewer a useful question without losing the original evidence.",
      },
      's07-verify-acceptance': {
        character: Character.TOMASZ_WRONA,
        audioUrl: '',
        emotion: Emotion.HAPPY,
        text: "The accepted configuration now has a current check and a clear record. I'll attach that handover to this unit so the next delivery doesn't start with the same uncertainty.",
      },
    },
  },
};
