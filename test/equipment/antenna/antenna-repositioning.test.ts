/**
 * Phase 31 D5 (nats-r6-s03-F1, r6-s11-F1): a dish that is repositioning reads
 * UNLOCKED and does not re-acquire the beacon mid-slew; a commanded move
 * reports its arrival once, and the Ops Log writes the STOW sequence as
 * staged line, mode line, arrival line.
 */
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { antennaLockLabel } from '../../../src/equipment/antenna/tracking-mode-label';
import { EventBus } from '../../../src/events/event-bus';
import { type AntennaSlewCompleteData, Events } from '../../../src/events/events';
import { EventAutoLogger } from '../../../src/ops-log/event-auto-logger';
import { formatAntennaArrival } from '../../../src/ops-log/event-formatters';
import { OpsLogManager } from '../../../src/ops-log/ops-log-manager';
import { FIXED_STEP_MS, SimClock } from '../../../src/simulation/sim-clock';

/**
 * GEO birds the program-track tests point at: true position, the ephemeris
 * prediction program-track follows (step-track climbs the difference) and a
 * beacon. Any other id reads as a bare TIDEMARK-1 (arrival-line names).
 */
const sats = vi.hoisted(() => {
  const geo = (name: string, az: number, el: number, beaconHz: number) => ({
    name,
    az,
    el,
    predictedAz: az + 0.08,
    predictedEl: el - 0.04,
    rangeKm: 37_000,
    rotation: 0,
    txSignal: [],
    transponders: [{ beacon: { frequency: beaconHz } }],
  });

  return new Map<number, ReturnType<typeof geo>>([
    [12345, geo('TIDEMARK-1', 152, 35.5, 4_175_500_000)],
    [23456, geo('TIDEMARK-2', 143.4, 31.9, 4_180_000_000)],
  ]);
});

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn((id: number) => sats.get(id) ?? { name: 'TIDEMARK-1' }),
      getSatsByAzEl: () => [],
      satellites: [],
      groundStations: [],
      isDeveloperMode: false,
    })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ data: { difficulty: 'advanced' } }),
  },
}));

class HeadlessAntenna extends AntennaCore {
  constructor(initialState: Partial<AntennaState> = {}) {
    super(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, initialState, 1, 1);
  }

  protected override addListeners_(): void {
    // headless
  }

  syncDomWithState(): void {
    // headless
  }

  draw(): void {
    // headless
  }

  /**
   * A synthetic beam around the bird's TRUE position (12 (theta/theta3)^2 off
   * a 30 dB peak), from where the pedestal actually points: step-track has
   * the ephemeris error to climb.
   */
  override measureBeaconMetrics(): { power: number | null; cn: number | null } {
    const sat = sats.get(this.state.targetSatelliteId ?? -1);
    if (!sat) {
      return { power: null, cn: null };
    }
    const cosEl = Math.cos(((this.state.elevation as number) * Math.PI) / 180);
    const theta = Math.hypot(((this.state.azimuth as number) - sat.az) * cosEl, (this.state.elevation as number) - sat.el);

    return { power: -60, cn: 30 - 12 * (theta / this.beamwidthAtTrackingDeg()) ** 2 };
  }
}

/** Run `ms` of SimClock fixed steps, updating the antenna each step */
function runSim(antenna: AntennaCore, ms: number, onStep?: () => void): void {
  const steps = Math.max(1, Math.round(ms / FIXED_STEP_MS));
  for (let i = 0; i < steps; i++) {
    SimClock.step();
    antenna.update(FIXED_STEP_MS);
    onStep?.();
  }
}

/** Run updates (100 ms frames) until the pedestal stops, at most `maxFrames` */
function runUntilStopped(antenna: AntennaCore, maxFrames = 2_000): void {
  antenna.update(100);
  for (let i = 0; i < maxFrames && antenna.state.isSlewing; i++) {
    antenna.update(100);
  }
}

describe('Antenna repositioning (phase 31 D5)', () => {
  let arrivals: AntennaSlewCompleteData[];
  const onArrival = (data: AntennaSlewCompleteData) => arrivals.push(data);

  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    arrivals = [];
    EventBus.getInstance().on(Events.ANTENNA_SLEW_COMPLETE, onArrival);
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
  });

  it('holds the beacon unlocked while repositioning and re-acquires once there', () => {
    const antenna = new HeadlessAntenna({ trackingMode: 'maintenance', isBeaconLocked: true, isSlewing: true });
    (antenna as unknown as { rfFrontEnd_: unknown }).rfFrontEnd_ = {};
    vi.spyOn(antenna, 'measureBeaconMetrics').mockReturnValue({ power: -80, cn: 30 } as never);

    antenna.updateBeaconMetrics_();
    expect(antenna.state.isBeaconLocked).toBe(false);
    expect(antennaLockLabel(antenna.state)).toBe('UNLOCKED');

    antenna.state.isSlewing = false;
    antenna.updateBeaconMetrics_();
    expect(antenna.state.isBeaconLocked).toBe(true);
    expect(antennaLockLabel(antenna.state)).toBe('LOCKED');
  });

  it('reads UNLOCKED mid-slew even with a stale beacon flag, but not for a locked program track', () => {
    expect(antennaLockLabel({ trackingMode: 'manual', isSlewing: true, isLocked: false, isBeaconLocked: true })).toBe('UNLOCKED');
    expect(antennaLockLabel({ trackingMode: 'program-track', isSlewing: true, isLocked: true, isBeaconLocked: false })).toBe('LOCKED');
    expect(antennaLockLabel({ trackingMode: 'manual', isSlewing: false, isLocked: false, isBeaconLocked: true })).toBe('LOCKED');
  });

  it('reports one arrival for a manual move', () => {
    const antenna = new HeadlessAntenna({ trackingMode: 'manual', azimuth: 150 as never, elevation: 35 as never, targetAzimuth: 150 as never, targetElevation: 35 as never });
    antenna.update(100);

    antenna.state.targetAzimuth = 153.1 as never;
    antenna.state.targetElevation = 35.1 as never;
    runUntilStopped(antenna);
    antenna.update(100);

    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({ mode: 'manual', targetSatelliteId: null, targetSatelliteName: null });
    expect(arrivals[0].azimuth).toBeCloseTo(153.1, 3);
    expect(arrivals[0].elevation).toBeCloseTo(35.1, 3);
  });

  it('reports the arrival of a 0.01 deg manual nudge, two decimals on the line (Phase 33 D8, nats-r8-s23-F2)', () => {
    const antenna = new HeadlessAntenna({
      trackingMode: 'manual',
      azimuth: 153.1 as never,
      elevation: 35.1 as never,
      targetAzimuth: 153.1 as never,
      targetElevation: 35.1 as never,
    });
    antenna.update(100);

    antenna.state.targetAzimuth = 153.11 as never;
    runUntilStopped(antenna);
    antenna.update(100);

    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({ mode: 'manual' });
    expect(formatAntennaArrival(arrivals[0])).toBe('MANUAL: at Az 153.11, El 35.10');
  });

  it('reports no arrival for a tracker following its target (no command)', () => {
    const antenna = new HeadlessAntenna({
      trackingMode: 'program-track',
      azimuth: 150 as never,
      elevation: 35 as never,
      targetAzimuth: 150 as never,
      targetElevation: 35 as never,
    });
    antenna.update(100);
    for (let i = 0; i < 50; i++) {
      antenna.state.targetAzimuth = ((antenna.state.targetAzimuth as number) + 0.05) as never;
      antenna.update(100);
    }
    runUntilStopped(antenna);

    expect(arrivals).toEqual([]);
  });

  it('writes the STOW sequence: staged line, mode line, one arrival line (nats-r6-s11-F1)', () => {
    OpsLogManager.initialize();
    EventAutoLogger.getInstance().initialize();
    const antenna = new HeadlessAntenna({ trackingMode: 'program-track', elevation: 34 as never, targetElevation: 34 as never, isLocked: true });
    antenna.update(100);

    antenna.stageTrackingModeChange('stow');
    antenna.applyChanges();
    for (let i = 0; i < 2_000 && (antenna.state.isSlewing || i === 0); i++) {
      antenna.update(100);
      // A weather tick or sync re-emits the state mid-slew
      if (i % 50 === 0) EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...antenna.state, isBeaconLocked: true });
    }
    antenna.update(100);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...antenna.state });

    expect(arrivals).toHaveLength(1);
    expect(
      OpsLogManager.getInstance()
        .getEntries()
        .map((e) => e.message)
    ).toEqual(['Tracking mode: STOW staged (El 90.0 pending APPLY)', 'Tracking mode: STOW, Power ON, Antenna UNLOCKED', 'STOW: parked (El 90.0)']);
  });
});

describe('Antenna arrival and command-time lock (phase 32 D1, D2)', () => {
  let arrivals: AntennaSlewCompleteData[];
  const onArrival = (data: AntennaSlewCompleteData) => arrivals.push(data);

  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    SimClock.reset();
    arrivals = [];
    EventBus.getInstance().on(Events.ANTENNA_SLEW_COMPLETE, onArrival);
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
  });

  /** Copies of every ANTENNA_STATE_CHANGED from now on (the core emits its live state object) */
  function captureStateChanges(): AntennaState[] {
    const seen: AntennaState[] = [];
    EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, (state: AntennaState) => seen.push({ ...state }));
    return seen;
  }

  it('step-track dithers write no arrival line (nats-r7-s06-F1)', () => {
    const antenna = new HeadlessAntenna({ trackingMode: 'manual', azimuth: 140 as never, elevation: 35 as never });
    runSim(antenna, 100);

    // The commanded move: program-track onto TIDEMARK-1
    antenna.handleTrackingModeChange('program-track');
    antenna.handleTargetSatelliteChange(12345);
    antenna.moveToTargetSatellite();
    runSim(antenna, 60_000);
    expect(antenna.state.isSlewing).toBe(false);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({ mode: 'program-track', targetSatelliteId: 12345 });

    // Step-track on a dish already on target: no arrival for the engage, none
    // for 90 s of dither probes while the climb takes the ephemeris error out
    antenna.handleStepTrackToggle(true);
    let maxOffsetStep = 0;
    let lastOffset = antenna.state.stepTrackAzOffset as number;
    runSim(antenna, 90_000, () => {
      const offset = antenna.state.stepTrackAzOffset as number;
      maxOffsetStep = Math.max(maxOffsetStep, Math.abs(offset - lastOffset));
      lastOffset = offset;
    });

    // The dither really stepped the target faster than the pedestal follows
    expect(maxOffsetStep / (FIXED_STEP_MS / 1000)).toBeGreaterThan(3 * (antenna.config.maxRate_deg_s ?? 3));
    expect(antenna.state.isStepTrackEnabled).toBe(true);
    expect(arrivals).toHaveLength(1);

    // Stepping off again (offsets cleared) is not a commanded move either
    antenna.handleStepTrackToggle(false);
    runSim(antenna, 10_000);
    expect(arrivals).toHaveLength(1);
  });

  it('a Move to Target onto a new bird reads UNLOCKED and slewing on the command frame (nats-r7-s04-F1)', () => {
    const antenna = new HeadlessAntenna({
      trackingMode: 'program-track',
      azimuth: 152.08 as never,
      elevation: 35.46 as never,
      targetSatelliteId: 12345,
      isLocked: true,
      isBeaconLocked: true,
    });
    runSim(antenna, 2_000);
    expect(antennaLockLabel(antenna.state)).toBe('LOCKED');

    // The ACU card's Move to Target with a staged pick: target change, then move
    const seen = captureStateChanges();
    antenna.handleTargetSatelliteChange(23456);
    antenna.moveToTargetSatellite();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatchObject({ targetSatelliteId: 23456, beaconFrequencyHz: 4_180_000_000, isSlewing: true, isLocked: false, isBeaconLocked: false });
    for (const state of seen) {
      expect(antennaLockLabel(state)).toBe('UNLOCKED');
    }
  });

  it('a Move to Target from a stale lock reads UNLOCKED on its own emission', () => {
    const antenna = new HeadlessAntenna({ trackingMode: 'manual', azimuth: 140 as never, elevation: 35 as never });
    runSim(antenna, 100);
    antenna.handleTargetSatelliteChange(12345);
    antenna.state.isBeaconLocked = true; // the beacon receiver's last word on the old pointing

    const seen = captureStateChanges();
    antenna.moveToTargetSatellite();

    expect(seen[0]).toMatchObject({ isSlewing: true, isLocked: false, isBeaconLocked: false });
    expect(antennaLockLabel(seen[0])).toBe('UNLOCKED');
  });

  it('a Move to Target onto the bird it is already on changes no lock', () => {
    const antenna = new HeadlessAntenna({ trackingMode: 'manual', azimuth: 152 as never, elevation: 35.5 as never, isBeaconLocked: true });
    antenna.handleTargetSatelliteChange(12345);

    const seen = captureStateChanges();
    antenna.moveToTargetSatellite();

    expect(seen[0]).toMatchObject({ isSlewing: false, isBeaconLocked: true });
    expect(antennaLockLabel(seen[0])).toBe('LOCKED');
  });

  it('a program track authored locked snaps onto its target on the first update (S10 pull-in)', () => {
    // S10 authors Az 190 / El 32 locked while the bird is about 2 deg away
    const antenna = new HeadlessAntenna({
      trackingMode: 'program-track',
      azimuth: 150 as never,
      elevation: 34 as never,
      targetAzimuth: 150 as never,
      targetElevation: 34 as never,
      targetSatelliteId: 12345,
      isLocked: true,
      isBeaconLocked: true,
    });
    const seen = captureStateChanges();
    runSim(antenna, FIXED_STEP_MS);

    expect(antenna.state.azimuth).toBeCloseTo(152.08, 6);
    expect(antenna.state.elevation).toBeCloseTo(35.46, 6);
    expect(antenna.state.isSlewing).toBe(false);
    expect(antenna.state.isLocked).toBe(true);
    runSim(antenna, 5_000);
    expect(arrivals).toEqual([]);
    expect(seen.every((state) => antennaLockLabel(state) === 'LOCKED')).toBe(true);
  });

  it('an off-target program-track start without the lock flag still slews', () => {
    const antenna = new HeadlessAntenna({
      trackingMode: 'program-track',
      azimuth: 150 as never,
      elevation: 34 as never,
      targetSatelliteId: 12345,
    });
    runSim(antenna, FIXED_STEP_MS);

    expect(antenna.state.azimuth as number).toBeLessThan(150.1);
    expect(antenna.state.isSlewing).toBe(true);
    runSim(antenna, 30_000);
    expect(antenna.state.azimuth).toBeCloseTo(152.08, 2);
  });

  it('a restored pointing cancels the load snap', () => {
    const antenna = new HeadlessAntenna({
      trackingMode: 'program-track',
      azimuth: 150 as never,
      elevation: 34 as never,
      targetSatelliteId: 12345,
      isBeaconLocked: true,
    });
    antenna.sync({ azimuth: 148 as never, elevation: 33 as never });
    runSim(antenna, FIXED_STEP_MS);

    expect(antenna.state.azimuth as number).toBeLessThan(148.1);
    expect(antenna.state.isSlewing).toBe(true);
  });
});
