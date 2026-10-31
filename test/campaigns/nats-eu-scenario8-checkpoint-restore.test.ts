import { vi } from 'vitest';

/**
 * Phase 35 rt-s24-F4 follow-up: the timed hardware faults of nats-eu S8 (the
 * Shetland GNSS outage, ended by an objective anchor, and the 04:00 traffic-key
 * roll) used to trip again after "Restart from Checkpoint": the fresh
 * HardwareFaultManager had empty tripped/cleared sets, the ops-log clock jump
 * put every start time in the past, and the anchor re-stamped at the restore
 * moment. Real S8 settings, real managers, mocked clock and equipment.
 */

const clock = vi.hoisted(() => ({ nowMs: 0 }));
const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));
const station = vi.hoisted(() => ({ gpsdo: { setGnssSignalPresent: vi.fn() } }));
const crypto = vi.hoisted(() => ({ injectKeyMismatch: vi.fn() }));
const scenarioRef = vi.hoisted(() => ({ data: undefined as { settings: unknown } | undefined }));

vi.mock('../../src/simulation/mission-clock', () => ({
  missionNowMs: () => clock.nowMs,
  addSkippedTime: () => undefined,
  getSkippedMs: () => 0,
  resetMissionClock: () => undefined,
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    destroy: vi.fn(),
    getInstance: () => ({
      satellites: [],
      groundStations: [{ state: { id: 'SH-02' }, transmitters: [], rfFrontEnds: [{ gpsdoModule: station.gpsdo, bucModule: {} }] }],
      objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) },
    }),
  },
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: scenarioRef.data!.settings, data: scenarioRef.data }) },
}));

vi.mock('@app/equipment/crypto', () => ({ CryptoModule: { getInstance: () => crypto } }));

import type { Milliseconds } from 'ootk';
import { natsEuScenario8Data } from '../../src/campaigns/nats-eu/scenario8';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { HardwareFaultManager } from '../../src/faults/hardware-fault-manager';
import { collectManagerStates, restoreManagerStates } from '../../src/scenarios/checkpoint-manager-states';
import type { ManagerStates } from '../../src/sync/manager-state-types';

scenarioRef.data = natsEuScenario8Data as never;

const at = (seconds: number) => {
  clock.nowMs = seconds * 1000;
  EventBus.getInstance().emit(Events.UPDATE, 16 as Milliseconds);
};

function freshManager(): HardwareFaultManager {
  HardwareFaultManager.destroy();
  EventBus.destroy();
  clock.nowMs = 0; // a restarted page builds its managers at mission start
  return HardwareFaultManager.getInstance();
}

/** Play S8 up to 04:08 (14,880 s): outage tripped at 8,940 and ended 45 s after the anchor, key rolled at 14,400 */
function playToCheckpoint(): ManagerStates {
  objectives.states.clear();
  const manager = freshManager();
  at(8_940);
  expect(manager.isTripped('sh-gnss-outage')).toBe(true);
  objectives.states.set('confirm-reference-recovered', { isActive: true, isCompleted: false });
  at(9_200); // the anchor goes live here: the outage ends at 9,245
  at(9_300);
  expect(manager.isCleared('sh-gnss-outage')).toBe(true);
  at(14_400);
  expect(manager.isTripped('traffic-key-roll')).toBe(true);
  at(14_880);

  return JSON.parse(JSON.stringify(collectManagerStates())) as ManagerStates;
}

describe('nats-eu S8: Restart from Checkpoint with timed hardware faults', () => {
  beforeEach(() => {
    station.gpsdo.setGnssSignalPresent.mockClear();
    crypto.injectKeyMismatch.mockClear();
  });

  afterEach(() => {
    HardwareFaultManager.destroy();
    EventBus.destroy();
  });

  it('a cleared fault stays cleared, a past fault does not trip again, and the anchor keeps its time', () => {
    const states = playToCheckpoint();
    expect(states.hardwareFaults?.tripped).toEqual(expect.arrayContaining(['sh-gnss-outage', 'traffic-key-roll']));
    expect(states.hardwareFaults?.cleared).toEqual(['sh-gnss-outage']);

    const manager = freshManager();
    station.gpsdo.setGnssSignalPresent.mockClear();
    crypto.injectKeyMismatch.mockClear();
    restoreManagerStates(states); // synchronous, then the ops-log clock jump
    at(14_880);

    expect(station.gpsdo.setGnssSignalPresent).not.toHaveBeenCalled();
    expect(crypto.injectKeyMismatch).not.toHaveBeenCalled();
    expect(manager.isCleared('sh-gnss-outage')).toBe(true);
    expect(manager.getEventScheduleS('sh-gnss-outage')).toEqual({ startS: 8_940, endS: 9_245 });
  });

  it('control: without managerStates the outage and the key roll fire again and the anchor moves', () => {
    playToCheckpoint();

    const manager = freshManager();
    station.gpsdo.setGnssSignalPresent.mockClear();
    crypto.injectKeyMismatch.mockClear();
    restoreManagerStates(undefined);
    at(14_880);

    expect(station.gpsdo.setGnssSignalPresent).toHaveBeenCalledWith(false);
    expect(crypto.injectKeyMismatch).toHaveBeenCalledTimes(1);
    expect(manager.getEventScheduleS('sh-gnss-outage')?.endS).toBe(14_925);
  });
});
