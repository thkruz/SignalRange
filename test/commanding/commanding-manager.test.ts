import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CommandingManager - the uplink-jammed rejection (nats-eu M7 coupling).
 *
 * A transponder-path interference event on the target bird that overlaps the
 * configured command carrier denies fixed-mode commands until TRANSEC is
 * hopping with sync locked. Everything else the manager does is proven by the
 * campaign specs.
 */
const commandingConfig: Record<string, unknown> = {};
vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: { commanding: commandingConfig } }) },
}));

vi.mock('../../src/simulation/mission-clock', () => ({
  missionNowMs: () => 0,
}));

const interference = { initialized: false, events: [] as Array<Record<string, unknown>>, inEnvelope: new Set<string>() };
vi.mock('../../src/interference/interference-manager', () => ({
  InterferenceManager: {
    isInitialized: () => interference.initialized,
    getInstance: () => ({
      getEvents: () => interference.events,
      isEventInEnvelope: (id: string) => interference.inEnvelope.has(id),
    }),
  },
}));

const transec = { initialized: false, synced: false };
vi.mock('../../src/transec/transec-manager', () => ({
  TransecManager: {
    isInitialized: () => transec.initialized,
    getInstance: () => ({ isSyncLocked: () => transec.synced }),
  },
}));

const { CommandingManager, UPLINK_JAM_GUARD_HZ } = await import('../../src/commanding/commanding-manager');

const jam = (overrides: Record<string, unknown> = {}) => ({
  id: 'jam',
  satelliteNoradId: 61702,
  frequency: 14035e6,
  bandwidth: 2e6,
  power: 5,
  polarization: 'H',
  startTime: 0,
  duration: 600,
  periodSeconds: 600,
  onSeconds: 600,
  ...overrides,
});

describe('CommandingManager - uplink jamming', () => {
  beforeEach(() => {
    CommandingManager.destroy();
    for (const k of Object.keys(commandingConfig)) delete commandingConfig[k];
    Object.assign(commandingConfig, { targetNoradId: 61702, uplinkFrequencyHz: 14035e6, requireDopplerComp: false, requireValidKey: false });
    interference.initialized = true;
    interference.events = [jam()];
    interference.inEnvelope = new Set(['jam']);
    transec.initialized = false;
    transec.synced = false;
  });

  it('rejects a command as uplink-jammed while a transponder event overlaps the carrier', () => {
    const manager = CommandingManager.getInstance();
    expect(manager.isUplinkJammed()).toBe(true);
    const record = manager.sendCommand('PLD-STATUS', 10);
    expect(record.status).toBe('rejected');
    expect(record.reason).toBe('uplink-jammed');
    expect(manager.isCommandAcknowledged('PLD-STATUS')).toBe(false);
  });

  it('acks again once TRANSEC is hopping with sync locked', () => {
    transec.initialized = true;
    transec.synced = true;
    const manager = CommandingManager.getInstance();
    expect(manager.isUplinkJammed()).toBe(false);
    expect(manager.sendCommand('PLD-STATUS', 10).status).toBe('acked');
  });

  it('is not jammed outside the event envelope, by another bird, by a terrestrial event, or off-frequency', () => {
    const manager = CommandingManager.getInstance();

    interference.inEnvelope = new Set();
    expect(manager.isUplinkJammed()).toBe(false);

    interference.inEnvelope = new Set(['jam']);
    interference.events = [jam({ satelliteNoradId: 61701 })];
    expect(manager.isUplinkJammed()).toBe(false);

    interference.events = [jam({ path: 'terrestrial' })];
    expect(manager.isUplinkJammed()).toBe(false);

    interference.events = [jam({ frequency: 14035e6 + 1e6 + UPLINK_JAM_GUARD_HZ + 1 })];
    expect(manager.isUplinkJammed()).toBe(false);

    interference.events = [jam({ frequency: 14035e6 + 1e6 + UPLINK_JAM_GUARD_HZ - 1 })];
    expect(manager.isUplinkJammed()).toBe(true);
  });

  it('never jams when the scenario declares no command carrier frequency or no interference', () => {
    delete commandingConfig.uplinkFrequencyHz;
    expect(CommandingManager.getInstance().isUplinkJammed()).toBe(false);

    CommandingManager.destroy();
    commandingConfig.uplinkFrequencyHz = 14035e6;
    interference.initialized = false;
    expect(CommandingManager.getInstance().isUplinkJammed()).toBe(false);
  });
});
