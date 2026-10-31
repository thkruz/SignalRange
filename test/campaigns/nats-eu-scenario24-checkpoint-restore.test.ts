import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { vi } from 'vitest';

/**
 * Phase 35 rt-s24-F4: "Restart from Checkpoint" in S24 used to rebuild every
 * operator manager from scratch. SpaceEventManager came back 'nominal' at
 * elapsed 0, the ops-log restore jumped the clock past maneuverAtS 900, and the
 * first tick fired the maneuver again: a stale-ephemeris alarm after the player
 * had already loaded the update. Doppler comp, working-document lines, audit
 * acknowledgements, TRANSEC and the contact plan were lost the same way.
 */

const simulationManager = {
  satellites: [] as unknown[],
  groundStations: [] as unknown[],
  objectivesManager: undefined as unknown,
};

const scenarioRef: { data?: { settings: unknown } } = {};

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: { hasInstance: () => true, getInstance: () => simulationManager, destroy: vi.fn() },
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ settings: (scenarioRef.data as { settings: unknown }).settings, data: scenarioRef.data }),
  },
}));

import { natsEuScenario24Data } from '../../src/campaigns/nats-eu/scenario24';
import { CommandingManager } from '../../src/commanding/commanding-manager';
import { ContactScheduleManager } from '../../src/contact-schedule/contact-schedule-manager';
import { CryptoModule } from '../../src/equipment/crypto/crypto-module-core';
import { OrbitalSatellite } from '../../src/equipment/satellite/orbital-satellite';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { GnssThreatManager } from '../../src/gnss-threat/gnss-threat-manager';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { CampaignDocumentStore } from '../../src/scenarios/campaign-document-store';
import { collectManagerStates, restoreLedgerAndDocument, restoreManagerStates } from '../../src/scenarios/checkpoint-manager-states';
import { EventTimeLedger } from '../../src/scenarios/event-time-ledger';
import { WorkingDocumentManager } from '../../src/scenarios/working-document-manager';
import { SecurityConsoleCore } from '../../src/security-console/security-console-core';
import { collectEphemerisAlarms } from '../../src/services/station-service-alarms';
import { resetMissionClock } from '../../src/simulation/mission-clock';
import { SimClock } from '../../src/simulation/sim-clock';
import { SpaceEventManager } from '../../src/space-events/space-event-manager';
import { setManagerStateCollector } from '../../src/sync/manager-state-types';
import { type AppState, SyncManager } from '../../src/sync/sync-manager';
import { TransecManager } from '../../src/transec/transec-manager';
import { advanceSimTime } from '../helpers/sim-time';

scenarioRef.data = natsEuScenario24Data as never;

const OBSERVER = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers };
const spaceEvent = (natsEuScenario24Data.settings.spaceEvents as Array<{ id: string; newTle: { tle1: string; tle2: string } }>)[0];
const documentObjective = natsEuScenario24Data.objectives.find((o) => o.conditions.some((c) => (c.params as { documentLine?: string } | undefined)?.documentLine))!;
const documentConditionIndex = documentObjective.conditions.findIndex((c) => (c.params as { documentLine?: string } | undefined)?.documentLine);

function buildManagers(): OrbitalSatellite {
  EventBus.destroy();
  resetMissionClock();
  const sat = new OrbitalSatellite('MERIDIAN-SAR-2', 61702, [], [], {
    tle1: spaceEvent.newTle.tle1 as TleLine1,
    tle2: spaceEvent.newTle.tle2 as TleLine2,
    observer: OBSERVER,
  });
  simulationManager.satellites = [sat];
  CampaignDocumentStore.beginRun();
  OpsLogManager.initialize();
  WorkingDocumentManager.getInstance().initialize();
  ContactScheduleManager.getInstance();
  SpaceEventManager.getInstance();
  CommandingManager.getInstance();
  SecurityConsoleCore.getInstance();
  TransecManager.getInstance();
  GnssThreatManager.getInstance();
  setManagerStateCollector(collectManagerStates);
  SimClock.resume('scenario');

  return sat;
}

function destroyAll(): void {
  setManagerStateCollector(null);
  CommandingManager.destroy();
  ContactScheduleManager.destroy();
  SpaceEventManager.destroy();
  SecurityConsoleCore.destroy();
  TransecManager.destroy();
  GnssThreatManager.destroy();
  CryptoModule.resetInstance();
  OpsLogManager.destroy();
  WorkingDocumentManager.reset();
  EventTimeLedger.end();
  EventBus.destroy();
  resetMissionClock();
}

function playToCheckpoint(): { auditEventId: string; ledgerTime: number | undefined } {
  const bus = EventBus.getInstance();
  advanceSimTime(905_000, { emitUpdate: true });
  expect(SpaceEventManager.getInstance().getPhase(spaceEvent.id)).toBe('stale');
  SpaceEventManager.getInstance().applyEphemerisUpdate(spaceEvent.id);
  bus.emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'load-the-ephemeris', objective: {} as never, completedAt: 0 } as never);
  CommandingManager.getInstance().setDopplerComp(true);
  bus.emit(Events.QUIZ_PASSED, { objectiveId: documentObjective.id, conditionIndex: documentConditionIndex, attempts: 1, pointsDeducted: 0 } as never);
  const security = SecurityConsoleCore.getInstance();
  const auditEventId = security.getVisibleLog(4000)[0].id;
  security.acknowledge(auditEventId, 4000);
  TransecManager.getInstance().setMode('hopping');
  TransecManager.getInstance().loadKey();
  ContactScheduleManager.getInstance().assign('C-SAR2-SH', 'SH-02');

  return { auditEventId, ledgerTime: EventTimeLedger.getTime('obj:load-the-ephemeris') };
}

/** Capture exactly as the progress-save path does, then JSON as the backend stores it */
function captureCheckpoint(): AppState {
  const provider = { initialize: vi.fn(), read: vi.fn(), write: vi.fn(), clear: vi.fn(), subscribe: vi.fn(() => vi.fn()), isConnected: vi.fn(() => true), dispose: vi.fn() };
  const sync = new SyncManager(provider as never);
  sync.setEquipment({ spectrumAnalyzers: [], antennas: [], rfFrontEnds: [], transmitters: [], receivers: [] } as never);
  const state = sync.getCurrentState();
  state.opsLogState = OpsLogManager.getInstance().getState();

  return JSON.parse(JSON.stringify(state)) as AppState;
}

/** BasePage.restoreObjectiveStatesFromCheckpoint_ minus the objectives, synchronous */
function restoreLikeBasePage(state: AppState): void {
  restoreManagerStates(state.managerStates);
  OpsLogManager.getInstance().restoreState(state.opsLogState!);
  restoreLedgerAndDocument(state.managerStates);
}

describe('nats-eu S24: Restart from Checkpoint after the ephemeris update', () => {
  beforeEach(() => {
    destroyAll();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    destroyAll();
  });

  it('keeps the update, Doppler comp, the document, the audit ack, TRANSEC and the contact plan', () => {
    buildManagers();
    const { auditEventId, ledgerTime } = playToCheckpoint();
    const entriesBefore = WorkingDocumentManager.getInstance().getEntryCount();
    expect(entriesBefore).toBeGreaterThan(0);
    const checkpoint = captureCheckpoint();
    expect(checkpoint.managerStates?.v).toBe(1);

    destroyAll();
    const sat = buildManagers();
    expect(SpaceEventManager.getInstance().getPhase(spaceEvent.id)).toBe('nominal');
    restoreLikeBasePage(checkpoint);
    advanceSimTime(5_000, { emitUpdate: true });

    expect(SpaceEventManager.getInstance().getPhase(spaceEvent.id)).toBe('updated');
    expect(sat.isPredictionStale).toBe(false);
    expect(collectEphemerisAlarms()).toEqual([]);
    expect(CommandingManager.getInstance().state.dopplerCompEnabled).toBe(true);
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(entriesBefore);
    expect(EventTimeLedger.getTime('obj:load-the-ephemeris')).toBe(ledgerTime);
    expect(SecurityConsoleCore.getInstance().isEventAcknowledged(auditEventId)).toBe(true);
    expect(TransecManager.getInstance().isSyncLocked()).toBe(true);
    expect(ContactScheduleManager.getInstance().getAssignment('C-SAR2-SH')).toBe('SH-02');
  });

  it('control: without managerStates the old behaviour reproduces (stale again, comp lost)', () => {
    buildManagers();
    playToCheckpoint();
    const checkpoint = captureCheckpoint();
    delete checkpoint.managerStates;

    destroyAll();
    const sat = buildManagers();
    restoreLikeBasePage(checkpoint);
    advanceSimTime(5_000, { emitUpdate: true });

    expect(SpaceEventManager.getInstance().getPhase(spaceEvent.id)).toBe('stale');
    expect(sat.isPredictionStale).toBe(true);
    expect(collectEphemerisAlarms()).toHaveLength(1);
    expect(CommandingManager.getInstance().state.dopplerCompEnabled).toBe(false);
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(0);
  });
});
