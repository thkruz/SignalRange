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
import { TelemetryManager } from '../../src/telemetry/telemetry-manager';
import { TransecManager } from '../../src/transec/transec-manager';
import { WeatherManager } from '../../src/weather/weather-manager';

const roundTrip = (s: ManagerStates): ManagerStates => JSON.parse(JSON.stringify(s)) as ManagerStates;

const destroyAll = (): void => {
  CommandingManager.destroy();
  ContactScheduleManager.destroy();
  SpaceEventManager.destroy();
  SecurityConsoleCore.destroy();
  TransecManager.destroy();
  GnssThreatManager.destroy();
  CryptoModule.resetInstance();
  WeatherManager.destroy();
  TelemetryManager.destroy();
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
    security.injectEvent({ id: 'runtime-audit', actor: 'operator', action: 'Review', category: 'auth', severity: 'info', timeS: 0 });
    const removed = security.getConfig().events.find((event) => event.id !== 'evt-replay' && event.id !== 'runtime-audit');
    if (removed) security.removeEvent(removed.id);
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
    expect(
      SecurityConsoleCore.getInstance()
        .getVisibleLog(0)
        .some((event) => event.id === 'runtime-audit')
    ).toBe(true);
    if (removed)
      expect(
        SecurityConsoleCore.getInstance()
          .getConfig()
          .events.some((event) => event.id === removed.id)
      ).toBe(false);
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

describe('weather and telemetry collectors (#243, #246)', () => {
  it('captures a versioned WeatherSnapshot with pending, running and expired events and round-trips through JSON', () => {
    ScenarioManager.getInstance().settings = {
      ...natsEuSandboxData.settings,
      weatherEvents: [
        { id: 'w-expired', groundStationId: 'GW-01', type: 'rain', severity: 'minor', startTime: 10, duration: 20, linkMarginDegradation: 1 },
        { id: 'w-pending', groundStationId: 'GW-01', type: 'rain', severity: 'minor', startTime: 5000, duration: 60, linkMarginDegradation: 1 },
        {
          id: 'w-anchored',
          groundStationId: 'GW-01',
          type: 'rain',
          severity: 'minor',
          startTime: 30,
          duration: 60,
          linkMarginDegradation: 1,
          startAfterObjectiveId: 'some-objective',
        },
      ],
    } as typeof natsEuSandboxData.settings;
    WeatherManager.getInstance();

    const states = collectManagerStates();
    const weather = roundTrip(states).weather;

    expect(states.v).toBe(1);
    expect(weather).toBeDefined();
    expect(Number.isFinite(weather!.missionStartTimeMs)).toBe(true);
    expect(weather!.anchors).toBeDefined();
    expect(weather!.iceAccumulation).toEqual([]);
    expect(weather!.events.map((e) => e.id)).toEqual(['w-expired', 'w-pending', 'w-anchored']);
    expect(weather!.events.find((e) => e.id === 'w-anchored')).toMatchObject({ isActive: false, isAwaitingAnchor: true });
    expect(weather!.events.find((e) => e.id === 'w-pending')).toMatchObject({ startTime: 5000, isActive: false, isAwaitingAnchor: false });
    expect(weather).toEqual(states.weather);
  });

  it('omits the weather section when no WeatherManager exists', () => {
    expect(collectManagerStates().weather).toBeUndefined();
  });

  it('captures a TelemetrySnapshot with frame counts, freshness timers and channel values and round-trips through JSON', () => {
    ScenarioManager.getInstance().settings = {
      ...natsEuSandboxData.settings,
      telemetry: { groundStationId: 'GW-01', satelliteNoradId: 1, channels: [{ id: 'bus-v', nominal: 28 }] },
    } as unknown as typeof natsEuSandboxData.settings;
    TelemetryManager.getInstance();

    const states = collectManagerStates();
    const telemetry = roundTrip(states).telemetry;

    expect(telemetry).toBeDefined();
    expect(telemetry).toMatchObject({ frameCount: 0, frameAccumulatorS: 0, elapsedS: 0, lastFrameElapsedS: null });
    expect(Number.isFinite(telemetry!.missionStartTimeMs)).toBe(true);
    expect(telemetry!.values).toEqual([['bus-v', 28]]);
    expect(telemetry!.anchors).toBeDefined();
    // The type carries no explicit excursion or recovery fields: excursions are anchored, so they ride in `anchors`
    expect(Object.keys(telemetry!)).not.toContain('excursion');
    expect(telemetry).toEqual(states.telemetry);
  });
});
