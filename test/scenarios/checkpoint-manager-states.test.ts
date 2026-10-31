/**
 * Phase 35 rt-s24-F4: manager state survives "Restart from Checkpoint".
 * Each manager is built from the real nats-eu sandbox settings, driven through
 * operator actions, collected (JSON round trip, as the backend stores it),
 * destroyed, rebuilt and restored.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { natsEuSandboxData } from '../../src/campaigns/nats-eu/sandbox';
import { CommandingManager } from '../../src/commanding/commanding-manager';
import { ContactScheduleManager } from '../../src/contact-schedule/contact-schedule-manager';
import { CryptoModule } from '../../src/equipment/crypto/crypto-module-core';
import { EventBus } from '../../src/events/event-bus';
import { GnssThreatManager } from '../../src/gnss-threat/gnss-threat-manager';
import { ScenarioManager } from '../../src/scenario-manager';
import { CampaignDocumentStore } from '../../src/scenarios/campaign-document-store';
import { collectManagerStates, restoreLedgerAndDocument, restoreManagerStates } from '../../src/scenarios/checkpoint-manager-states';
import { EventTimeLedger } from '../../src/scenarios/event-time-ledger';
import { SecurityConsoleCore } from '../../src/security-console/security-console-core';
import { SpaceEventManager } from '../../src/space-events/space-event-manager';
import type { ManagerStates } from '../../src/sync/manager-state-types';
import { TransecManager } from '../../src/transec/transec-manager';

const roundTrip = (s: ManagerStates): ManagerStates => JSON.parse(JSON.stringify(s)) as ManagerStates;

const destroyAll = (): void => {
  CommandingManager.destroy();
  ContactScheduleManager.destroy();
  SpaceEventManager.destroy();
  SecurityConsoleCore.destroy();
  TransecManager.destroy();
  GnssThreatManager.destroy();
  CryptoModule.resetInstance();
  EventBus.destroy();
};

beforeEach(() => {
  ScenarioManager.getInstance().settings = natsEuSandboxData.settings;
  CampaignDocumentStore.beginRun();
});

afterEach(() => {
  destroyAll();
  EventTimeLedger.end();
});

describe('collectManagerStates', () => {
  it('collects only managers that exist', () => {
    const states = collectManagerStates();
    expect(states.v).toBe(1);
    expect(states.commanding).toBeUndefined();
    expect(states.crypto).toBeUndefined();
    expect(states.security).toBeUndefined();
    expect(states.transec).toBeUndefined();
    expect(states.contactSchedule).toBeUndefined();
    expect(states.gnssThreat).toBeUndefined();
    expect(states.spaceEvents).toBeUndefined();
  });
});

describe('restoreManagerStates', () => {
  it('is a no-op for an older checkpoint without managerStates', () => {
    TransecManager.getInstance();
    expect(() => restoreManagerStates(undefined)).not.toThrow();
    expect(() => restoreLedgerAndDocument(undefined)).not.toThrow();
    expect(TransecManager.getInstance().state.mode).toBe('fixed');
  });

  it('round-trips transec, contact plan, security and campaign run', () => {
    const transec = TransecManager.getInstance();
    transec.setMode('hopping');
    transec.loadKey();
    ContactScheduleManager.getInstance().assign('SAR1-P1', 'GW-01');
    const security = SecurityConsoleCore.getInstance();
    security.markReviewed();
    security.acknowledge('evt-replay', 0);
    security.setAccountStatus('op-guest', 'disabled');
    CampaignDocumentStore.noteDestroyedEvidence('evt-x');
    CampaignDocumentStore.markReviewed();

    const saved = roundTrip(collectManagerStates());
    destroyAll();
    CampaignDocumentStore.beginRun();

    expect(TransecManager.getInstance().isSyncLocked()).toBe(false);
    ContactScheduleManager.getInstance();
    SecurityConsoleCore.getInstance();
    restoreManagerStates(saved);

    expect(TransecManager.getInstance().state.mode).toBe('hopping');
    expect(TransecManager.getInstance().isSyncLocked()).toBe(true);
    expect(ContactScheduleManager.getInstance().isContactAssigned('SAR1-P1', 'GW-01')).toBe(true);
    expect(SecurityConsoleCore.getInstance().isReviewed).toBe(true);
    expect(SecurityConsoleCore.getInstance().isEventAcknowledged('evt-replay')).toBe(true);
    expect(SecurityConsoleCore.getInstance().getAccountStatus('op-guest')).toBe('disabled');
    expect(CampaignDocumentStore.destroyedThisRun).toEqual(['evt-x']);
    expect(CampaignDocumentStore.isReviewed).toBe(true);
  });

  it('round-trips commanding and the crypto unit without re-seeding it', () => {
    const cmd = CommandingManager.getInstance();
    cmd.setDopplerComp(true);
    cmd.beginKeyRotation();
    cmd.completeKeyRotation();
    const keyIdBefore = CryptoModule.getInstance().state.keyId;
    const saved = roundTrip(collectManagerStates());
    expect(saved.commanding?.dopplerCompEnabled).toBe(true);
    expect(saved.crypto).toBeDefined();

    destroyAll();
    CommandingManager.getInstance(); // constructor re-seeds the crypto unit from config
    restoreManagerStates(saved);

    expect(CommandingManager.getInstance().state.dopplerCompEnabled).toBe(true);
    expect(CommandingManager.getInstance().state.keyRotationCompleted).toBe(true);
    expect(CommandingManager.getInstance().state.keyStatus).toBe('Valid');
    expect(CryptoModule.getInstance().state.keyId).toBe(keyIdBefore);
    expect(CryptoModule.getInstance().state.keyStatus).toBe('Valid');
  });

  it('round-trips the GNSS threat offset and its last-change clock', () => {
    const gnss = GnssThreatManager.getInstance();
    gnss.setSpoofActive(true);
    gnss.advance(12);
    gnss.setReferenceMode('holdover');
    const before = gnss.getCheckpointState();
    expect(before.timeOffsetUs).toBeGreaterThan(0);

    const saved = roundTrip(collectManagerStates());
    destroyAll();
    GnssThreatManager.getInstance();
    restoreManagerStates(saved);

    expect(GnssThreatManager.getInstance().getCheckpointState()).toEqual(before);
  });

  it('a throwing section does not stop the sections after it', () => {
    const transec = TransecManager.getInstance();
    transec.setMode('hopping');
    SecurityConsoleCore.getInstance();
    ContactScheduleManager.getInstance().assign('SAR1-P1', 'GW-01');
    const saved = roundTrip(collectManagerStates());
    destroyAll();
    TransecManager.getInstance();
    ContactScheduleManager.getInstance();
    vi.spyOn(SecurityConsoleCore.getInstance(), 'restoreState').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => restoreManagerStates(saved)).not.toThrow();
    expect(TransecManager.getInstance().state.mode).toBe('hopping');
    expect(ContactScheduleManager.getInstance().isContactAssigned('SAR1-P1', 'GW-01')).toBe(true);
  });

  it('ignores snapshot parts for managers this scenario never built', () => {
    expect(() => restoreManagerStates({ v: 1, security: { acknowledged: ['x'], accountStatus: [], reviewed: true }, transec: { mode: 'hopping', keyed: true } })).not.toThrow();
    expect(SecurityConsoleCore.isInitialized()).toBe(false);
    expect(TransecManager.isInitialized()).toBe(false);
  });
});
