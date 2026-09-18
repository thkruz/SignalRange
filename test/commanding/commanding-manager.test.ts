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

const sim = { has: false, rangeKm: 38412.3 };
vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => sim.has,
    getInstance: () => ({
      getSatByNoradId: (id: number) => (id === 61702 ? { rangeKm: sim.rangeKm } : undefined),
      groundStations: [{ state: { id: 'GW-01', location: { latitude: 53.27, longitude: -9.05, elevation: 20 } } }],
    }),
  },
}));
vi.mock('../../src/equipment/satellite/orbital-satellite', () => ({
  OrbitalSatellite: class {},
  observerFromLocation: () => ({}),
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

describe('CommandingManager - ranging (phase 18 E)', () => {
  beforeEach(() => {
    for (const key of Object.keys(commandingConfig)) delete commandingConfig[key];
    Object.assign(commandingConfig, { targetNoradId: 61702, groundStationId: 'GW-01', requireDopplerComp: false, requireValidKey: false, ranging: { requiredMeasurements: 3 } });
    interference.initialized = false;
    transec.initialized = false;
    sim.has = true;
    sim.rangeKm = 38412.3;
    CommandingManager.destroy();
  });

  it('a ranging tone is gated like a command and records the slant range when it ACKs', () => {
    const mgr = CommandingManager.getInstance();
    const record = mgr.sendRangingTone(10);
    expect(record.id).toBe('RANGE');
    expect(record.status).toBe('acked');
    expect(record.rangeKm).toBeCloseTo(38412.3, 3);
    expect(mgr.state.rangingMeasurements).toEqual([{ elapsedS: 10, rangeKm: 38412.3 }]);
    expect(mgr.isRangingSolutionReady()).toBe(false);

    sim.rangeKm = 38410.9;
    mgr.sendRangingTone(70);
    mgr.sendRangingTone(130);
    // condition ranging-measurements reads state.rangingMeasurements.length against requiredMeasurements
    expect(mgr.state.rangingMeasurements.map((m) => m.rangeKm)).toEqual([38412.3, 38410.9, 38410.9]);
    expect(mgr.isRangingSolutionReady()).toBe(true);
  });

  it('a rejected tone records nothing', () => {
    commandingConfig.windowStartS = 100;
    const mgr = CommandingManager.getInstance();
    const record = mgr.sendRangingTone(10);
    expect(record.status).toBe('rejected');
    expect(record.reason).toBe('out-of-window');
    expect(record.rangeKm).toBeUndefined();
    expect(mgr.state.rangingMeasurements).toHaveLength(0);
  });

  it('uses the configured tone id and records nothing when the target is unknown to the simulation', () => {
    commandingConfig.ranging = { requiredMeasurements: 1, toneId: 'RNG-TONE' };
    commandingConfig.targetNoradId = 99999;
    const mgr = CommandingManager.getInstance();
    const record = mgr.sendRangingTone(5);
    expect(record.id).toBe('RNG-TONE');
    expect(record.status).toBe('acked');
    expect(record.rangeKm).toBeUndefined();
    expect(mgr.isRangingSolutionReady()).toBe(false);
  });
});
