import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TelemetryManager (phase 18 E): frames flow only while linked, channels
 * read their nominal value with scripted excursions, limit bands classify
 * the reading, and a dropped link freezes the last values as STALE. Each
 * assertion is the exact predicate a telemetry-* condition or soh-* fact reads.
 */
const scenario = { settings: {} as Record<string, unknown> };
vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => scenario },
}));

const clock = { nowMs: 0 };
vi.mock('../../src/simulation/mission-clock', () => ({
  missionNowMs: () => clock.nowMs,
}));

const sim = {
  has: false,
  antennas: [] as Array<{ state: { isLocked: boolean; targetSatelliteId?: number | null; azimuth: number; elevation: number } }>,
  sat: { az: 166, el: 49.6 } as { az: number; el: number } | undefined,
};
vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => sim.has,
    getInstance: () => ({ groundStations: [{ state: { id: 'SS-01', location: {} }, antennas: sim.antennas }], getSatByNoradId: () => sim.sat }),
  },
}));
vi.mock('../../src/equipment/satellite/orbital-satellite', () => ({
  OrbitalSatellite: class {},
  observerFromLocation: () => ({}),
}));

const commanding = { initialized: false, acks: {} as Record<string, number> };
vi.mock('../../src/commanding/commanding-manager', () => ({
  CommandingManager: {
    isInitialized: () => commanding.initialized,
    getInstance: () => ({ acknowledgedAt: (id: string) => commanding.acks[id] }),
  },
}));

const { TelemetryManager } = await import('../../src/telemetry/telemetry-manager');

const CONFIG = {
  groundStationId: 'SS-01',
  satelliteNoradId: 90071,
  antennaIndex: 1,
  staleAfterS: 10,
  channels: [
    { id: 'bus-v', label: 'Bus voltage', unit: 'V', subsystem: 'EPS', nominal: 28, yellowLow: 26.5, yellowHigh: 29.5, redLow: 25.5, redHigh: 30.5 },
    { id: 'batt-t', label: 'Battery temperature', unit: 'degC', subsystem: 'TCS', nominal: 20, yellowHigh: 30, redHigh: 40 },
    { id: 'wheel', label: 'Wheel speed', unit: 'rpm', subsystem: 'ADCS', nominal: 3000, noise: 20 },
  ],
  excursions: [
    { id: 'batt-heat', channelId: 'batt-t', startTime: 100, duration: 200, rampToValue: 45, rampSeconds: 100 },
    { id: 'bus-sag', channelId: 'bus-v', startTime: 1000, rampToValue: 26, rampSeconds: 100, endsOnCommandId: 'EPS-LOAD-SHED', recoverySeconds: 50 },
  ],
};

beforeEach(() => {
  scenario.settings = { telemetry: CONFIG };
  clock.nowMs = 0;
  sim.has = true;
  sim.antennas = [{ state: { isLocked: false, azimuth: 90, elevation: 10 } }, { state: { isLocked: true, targetSatelliteId: 90071, azimuth: 90, elevation: 10 } }];
  sim.sat = { az: 166, el: 49.6 };
  commanding.initialized = false;
  commanding.acks = {};
});

afterEach(() => {
  TelemetryManager.destroy();
});

describe('TelemetryManager', () => {
  it('reads the link from the configured antenna: locked on the bird, or on nothing in particular', () => {
    const mgr = TelemetryManager.getInstance();
    expect(mgr.isLinked()).toBe(true);
    sim.antennas[1].state.targetSatelliteId = 90042; // locked on the other bird
    expect(mgr.isLinked()).toBe(false);
    sim.antennas[1].state.targetSatelliteId = null;
    expect(mgr.isLinked()).toBe(true);
    sim.antennas[1].state.isLocked = false;
    expect(mgr.isLinked()).toBe(false);
    sim.antennas[0].state.isLocked = true; // antenna 0 is not the telemetry aperture
    expect(mgr.isLinked()).toBe(false);
  });

  it('a manually pointed antenna counts as linked while the bird is inside the pointing tolerance', () => {
    const mgr = TelemetryManager.getInstance();
    sim.antennas[1].state.isLocked = false;
    sim.antennas[1].state.azimuth = 166.5;
    sim.antennas[1].state.elevation = 50;
    expect(mgr.isLinked()).toBe(true);
    sim.antennas[1].state.azimuth = 170; // 4 deg off in azimuth
    expect(mgr.isLinked()).toBe(false);
    sim.antennas[1].state.azimuth = -194; // 166 on the circle
    expect(mgr.isLinked()).toBe(true);
    sim.sat = undefined; // bird unknown to the simulation: only a lock counts
    expect(mgr.isLinked()).toBe(false);
  });

  it('delivers frames while linked (telemetry-frames-received) and none before', () => {
    const mgr = TelemetryManager.getInstance();
    expect(mgr.frameCount).toBe(0);
    expect(mgr.isStale).toBe(true);
    mgr.advance(1);
    expect(mgr.frameCount).toBe(1);
    expect(mgr.isStale).toBe(false);
    mgr.advance(5);
    expect(mgr.frameCount).toBe(6);
    // A time skip delivers at most a burst, not thousands of frames
    mgr.advance(600);
    expect(mgr.frameCount).toBeLessThanOrEqual(16);
    expect(mgr.secondsSinceFrame).toBe(0);
  });

  it('classifies channels into limit bands and reports state of health (telemetry-channel-in-band / -soh-nominal)', () => {
    const mgr = TelemetryManager.getInstance();
    mgr.advance(1);
    expect(mgr.bandOf('bus-v')).toBe('green');
    expect(mgr.bandOf('batt-t')).toBe('green');
    expect(mgr.isSohNominal()).toBe(true);
    expect(mgr.hasBand('yellow')).toBe(false);

    // The battery heater excursion: ramps 20 -> 45 over 100 s from T+100
    mgr.advance(149); // T+150: ~32.5 degC
    expect(mgr.getReading('batt-t')!.value).toBeCloseTo(32.5, 0);
    expect(mgr.bandOf('batt-t')).toBe('yellow');
    expect(mgr.hasBand('yellow')).toBe(true);
    expect(mgr.hasBand('red')).toBe(false);
    expect(mgr.isSohNominal()).toBe(false);

    mgr.advance(100); // T+250: 45 degC, red
    expect(mgr.bandOf('batt-t')).toBe('red');
    expect(mgr.hasBand('red')).toBe(true);

    mgr.advance(100); // T+350: excursion over
    expect(mgr.bandOf('batt-t')).toBe('green');
    expect(mgr.isSohNominal()).toBe(true);
  });

  it('freezes the last values and reads STALE when the link drops (telemetry-stale)', () => {
    const mgr = TelemetryManager.getInstance();
    mgr.advance(150); // into the excursion
    const frozen = mgr.getReading('batt-t')!.value;
    expect(mgr.bandOf('batt-t')).toBe('yellow');

    mgr.setLinkOverride(false);
    mgr.advance(5);
    expect(mgr.isStale).toBe(false); // within staleAfterS
    mgr.advance(10);
    expect(mgr.isStale).toBe(true);
    expect(mgr.getReading('batt-t')!.value).toBe(frozen);
    // A stale stream never claims a band for the facts or the SoH call
    expect(mgr.hasBand('yellow')).toBe(false);
    expect(mgr.isSohNominal()).toBe(false);

    mgr.setLinkOverride(true);
    mgr.advance(1);
    expect(mgr.isStale).toBe(false);
  });

  it('a commanded excursion holds until its command ACKs, then recovers over recoverySeconds (command verification)', () => {
    const mgr = TelemetryManager.getInstance();
    const ch = CONFIG.channels[0]; // bus-v, nominal 28, yellow below 26.5
    expect(mgr.valueAt(ch, 999)).toBe(28);
    expect(mgr.valueAt(ch, 1100)).toBe(26); // ramped down, holding
    expect(mgr.valueAt(ch, 5000)).toBe(26); // no scheduled end: holds until commanded
    expect(TelemetryManager.bandOf(ch, mgr.valueAt(ch, 5000))).toBe('yellow');

    commanding.initialized = true;
    commanding.acks = { 'EPS-LOAD-SHED': 1200 };
    expect(mgr.valueAt(ch, 1199)).toBe(26); // before the ACK, unchanged
    expect(mgr.valueAt(ch, 1225)).toBeCloseTo(27, 5); // halfway through recovery
    expect(mgr.valueAt(ch, 1300)).toBe(28); // recovered
    // An ACK before the excursion started does not end it
    commanding.acks = { 'EPS-LOAD-SHED': 500 };
    expect(mgr.valueAt(ch, 1100)).toBe(26);
  });

  it('noise is deterministic per second and bounded by the configured peak-to-peak', () => {
    const mgr = TelemetryManager.getInstance();
    const ch = CONFIG.channels[2];
    const a = mgr.valueAt(ch, 42);
    const b = mgr.valueAt(ch, 42);
    expect(a).toBe(b);
    expect(Math.abs(a - 3000)).toBeLessThanOrEqual(10);
  });
});
