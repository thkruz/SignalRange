import { Character, Emotion } from '@app/modal/character-enum';
import type { HandoverFormConfig } from '@app/physical/field-records';
import { applyCampField, OLA_CHECK_CARD, SKYLINK_SERVICE } from './camp-field-config';
import { correctionApproved, correctionFiled, handoverValid, recordAccepted, samplesCurrent, workloadVerified } from './frontline-conditions';
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

const inventoryForm: HandoverFormConfig = {
  id: 'inventory',
  title: 'Delivery reconciliation',
  documentSection: 'Delivery',
  fields: [
    { key: 'serial', label: 'Serial on the unit against the inventory', required: true, rule: { choice: ['matches'], labels: { matches: 'Matches the inventory entry' } } },
    { key: 'account', label: 'Account assignment', required: true, rule: { choice: ['matches'], labels: { matches: 'Matches the authorized account' } } },
    {
      key: 'configuration',
      label: 'Configuration version',
      required: true,
      rule: { choice: ['unconfirmed'], labels: { unconfirmed: 'Differs from the record and is not confirmed' } },
    },
    {
      key: 'depot',
      label: 'What the depot test record shows',
      required: true,
      rule: { choice: ['earlier-test-only'], labels: { 'earlier-test-only': 'Only the earlier hardware test' } },
    },
  ],
};

const readinessForm: HandoverFormConfig = {
  id: 'readiness',
  title: 'Readiness assessment',
  documentSection: 'Readiness',
  fields: [
    { key: 'hardware', label: 'Hardware checks you made', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'registration', label: 'Registration reading', required: true, rule: { matchesCurrent: { serviceId: SKYLINK_SERVICE, layer: 'registration' } } },
    {
      key: 'authorization',
      label: 'Authorization state',
      required: true,
      rule: { choice: ['unresolved'], labels: { unresolved: 'Unresolved until the configuration is confirmed' } },
    },
    { key: 'workload', label: 'Workload readiness', required: true, rule: { choice: ['not-ready'], labels: { 'not-ready': 'Not ready for service' } } },
  ],
};

const configReviewForm: HandoverFormConfig = {
  id: 'config-review',
  title: 'Configuration review',
  documentSection: 'Configuration history',
  fields: [
    { key: 'entry', label: 'Record that differs', required: true, rule: { choice: ['configVersion'], labels: { configVersion: 'Configuration version' } } },
    { key: 'original', label: 'Version in the approved handover', required: true, rule: { choice: ['handover-v2'], labels: { 'handover-v2': 'handover-v2' } } },
    { key: 'unexplained', label: 'Version on the unit', required: true, rule: { choice: ['depot-v3'], labels: { 'depot-v3': 'depot-v3' } } },
    { key: 'reference', label: 'Approval reference for the unit version', required: true, rule: { choice: ['none'], labels: { none: 'None in the record' } } },
  ],
};

const acceptanceForm: HandoverFormConfig = {
  id: 'acceptance',
  title: 'Equipment acceptance',
  documentSection: 'Acceptance',
  fields: [
    {
      key: 'mismatch',
      label: 'Mismatch you found',
      required: true,
      rule: { choice: ['config-version'], labels: { 'config-version': 'Configuration version without an approval reference' } },
    },
    {
      key: 'cause',
      label: 'What is known about its cause',
      required: true,
      rule: { choice: ['not-established'], labels: { 'not-established': 'Not established by the records' } },
    },
    { key: 'observations', label: 'Observations kept', required: true, rule: { cites: 'observation', min: 1 } },
    {
      key: 'verified',
      label: 'Fresh service check after the correction',
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
        label: 'Replacement router',
        record: { serial: 'RT-4471', accountId: 'camp-skylink', configVersion: 'handover-v2' },
        installed: { serial: 'RT-4471', accountId: 'camp-skylink', configVersion: 'depot-v3' },
      },
    ],
    requests: [{ id: REQUEST, unitId: UNIT, field: 'configVersion', to: 'depot-v3', responseEventId: APPROVAL_EVENT }],
  };
  settings.physicalPlant.events = [
    {
      id: APPROVAL_EVENT,
      startAfterObjectiveId: 's07-assess-discrepancy',
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
      points: 15,
      conditions: [handoverValid('inventory', 'Delivered equipment and assignment compared')],
    },
    {
      id: 's07-separate-readiness',
      title: 'Separate Hardware from Service Readiness',
      description: 'Inspect the replacement router and compare the hardware checks with its registration and authorization state. Keep incomplete checks visible.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-reconcile-delivery'],
      points: 15,
      conditions: [
        {
          type: 'part-inspected',
          description: 'Replacement Router Inspected',
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
      description: 'Review the access and configuration records against the approved handover. Preserve the entry whose authorization cannot be established.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-separate-readiness'],
      points: 15,
      conditions: [handoverValid('config-review', 'Unexplained configuration entry preserved')],
    },
    {
      id: 's07-assess-discrepancy',
      title: 'State What the Evidence Supports',
      description: 'The reviewed configuration record contains an entry without an approval reference. Assess what that omission establishes before requesting a correction.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-review-records'],
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
        'Send the preserved record and equipment identifiers to the authorized service contact. Retain the response and approved configuration before accepting service.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-assess-discrepancy'],
      points: 15,
      conditions: [correctionFiled(REQUEST, 'Correction request filed with the service contact'), correctionApproved(REQUEST, 'Approved configuration received')],
    },
    {
      id: 's07-verify-acceptance',
      title: 'Verify and Hand Over the Unit',
      description: 'Run a fresh service check after the approved correction. Submit the accepted configuration, its evidence, and any unresolved concerns for the next operator.',
      groundStation: 'FL-01',
      prerequisiteObjectiveIds: ['s07-request-correction'],
      points: 25,
      conditions: [
        recordAccepted(UNIT, 'Replacement router accepted on a matching record'),
        workloadVerified({ card: OLA_CHECK_CARD.id, service: SKYLINK_SERVICE, afterRequestApproved: REQUEST }, 'Service checked after the approved correction'),
        handoverValid('acceptance', 'Authorized service verified and handover submitted'),
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
