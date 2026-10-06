import { Degrees } from 'ootk';
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { StepTrackController } from '../../../src/equipment/antenna/step-track-controller';
import { FIXED_STEP_MS, SimClock } from '../../../src/simulation/sim-clock';

// Mock SimulationManager
vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(() => undefined),
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: vi.fn(),
  },
}));

// Mock EventBus
vi.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    })),
  },
}));

/**
 * Antenna whose beacon receiver reads a synthetic beam: peak C/N at a hidden
 * az/el offset, falling off as 12 (theta/theta3)^2 with the true
 * (cross-elevation) angle between the step-track offsets and the peak. The
 * controller sees only the measured C/N, never the peak.
 */
class BeamAntenna extends AntennaCore {
  peak = { az: -0.15, el: -0.1, cn: 30 };
  /** Return null (no beacon in the window) */
  noBeacon = false;

  constructor(initialState: Partial<AntennaState> = {}) {
    super(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, initialState, 1, 1);
  }

  protected override addListeners_(): void {}
  syncDomWithState(): void {}
  draw(): void {}

  override measureBeaconMetrics(): { power: number | null; cn: number | null } {
    if (this.noBeacon) {
      return { power: null, cn: null };
    }
    return { power: -60, cn: this.peak.cn - this.lossFromPeak() };
  }

  /** Pattern loss between the commanded offsets and the hidden peak, dB */
  lossFromPeak(): number {
    const cosEl = Math.cos(((this.state.elevation as number) * Math.PI) / 180);
    const dAz = ((this.state.stepTrackAzOffset as number) - this.peak.az) * cosEl;
    const dEl = (this.state.stepTrackElOffset as number) - this.peak.el;
    return 12 * (Math.hypot(dAz, dEl) / this.beamwidthAtTrackingDeg()) ** 2;
  }
}

describe('StepTrackController (phase 19.4 hill-climb)', () => {
  let antenna: BeamAntenna;
  let controller: StepTrackController;

  /** Run the controller for `ms` of SimClock run time */
  const run = (ms: number) => {
    const steps = Math.round(ms / FIXED_STEP_MS);
    for (let i = 0; i < steps; i++) {
      SimClock.step();
      controller.update();
    }
  };

  beforeEach(() => {
    SimClock.reset();
    antenna = new BeamAntenna({
      isPowered: true,
      isOperational: true,
      trackingMode: 'program-track',
      isStepTrackEnabled: true,
      stepTrackAzOffset: 0 as Degrees,
      stepTrackElOffset: 0 as Degrees,
      beaconFrequencyHz: 4_175_500_000,
      azimuth: 161.8 as Degrees,
      elevation: 34.2 as Degrees,
      targetAzimuth: 161.8 as Degrees,
      targetElevation: 34.2 as Degrees,
      targetSatelliteId: 12345,
    });

    controller = (antenna as unknown as { stepTrackController_: StepTrackController }).stepTrackController_;
  });

  describe('lifecycle', () => {
    it('is created idle', () => {
      expect(controller).toBeInstanceOf(StepTrackController);
      expect(controller.isActive).toBe(false);
      expect(controller.isConverged).toBe(false);
    });

    it('start activates and stop deactivates', () => {
      controller.start();
      expect(controller.isActive).toBe(true);
      controller.stop();
      expect(controller.isActive).toBe(false);
    });

    it('does nothing while stopped', () => {
      run(10_000);
      expect(antenna.state.stepTrackAzOffset).toBe(0);
      expect(antenna.state.stepTrackElOffset).toBe(0);
    });

    it('starts from the offsets the antenna already holds', () => {
      antenna.state.stepTrackAzOffset = 0.05 as Degrees;
      controller.start();
      expect(controller.getState().heldAzOffset).toBeCloseTo(0.05, 9);
    });
  });

  describe('step size', () => {
    it('steps a tenth of the beamwidth in elevation and the same angle on the sky in azimuth', () => {
      const step = antenna.beamwidthAtTrackingDeg() * StepTrackController.STEP_FRACTION;
      expect(controller.stepDeg('el')).toBeCloseTo(step, 9);
      expect(controller.stepDeg('az')).toBeCloseTo(step / Math.cos((34.2 * Math.PI) / 180), 9);
    });
  });

  describe('hill-climb', () => {
    it('finds the beacon peak from the measured C/N alone', () => {
      controller.start();
      run(120_000);
      // Within half a step on each axis of the hidden peak
      expect(Math.abs((antenna.state.stepTrackElOffset as number) - antenna.peak.el)).toBeLessThan(controller.stepDeg('el') * 0.75);
      expect(antenna.lossFromPeak()).toBeLessThan(0.2);
      expect(controller.isConverged).toBe(true);
    });

    it('takes real time: settle and dwell per measurement on SimClock', () => {
      controller.start();
      run(5_000);
      // 0.5 s settle + 1 s dwell per reading: a few readings in 5 s, so at most a step or two
      expect(antenna.lossFromPeak()).toBeGreaterThan(0.5);
      run(115_000);
      const convergedAfter = controller.getState().convergedAfterMs!;
      expect(convergedAfter).toBeGreaterThan(10_000);
      expect(convergedAfter).toBeLessThan(120_000);
    });

    it('keeps dithering after convergence and follows a peak that moves', () => {
      controller.start();
      run(120_000);
      antenna.peak.el += 0.1;
      run(60_000);
      expect(antenna.lossFromPeak()).toBeLessThan(0.2);
    });
  });

  describe('beacon lock', () => {
    it('locks when the measured C/N clears 6.5 dB', () => {
      controller.start();
      run(3_000);
      expect(antenna.state.isBeaconLocked).toBe(true);
      expect(antenna.state.isLocked).toBe(true);
    });

    it('does not lock on a weak beacon (3-6.5 dB) but keeps climbing', () => {
      antenna.peak.cn = 6;
      controller.start();
      run(3_000);
      expect(antenna.state.isBeaconLocked).toBe(false);
      expect(controller.isActive).toBe(true);
    });

    it('gives up when the beacon is not trackable (< 3 dB)', () => {
      antenna.peak.cn = 2;
      antenna.state.isAutoTrackEnabled = true;
      controller.start();
      run(3_000);
      expect(controller.isActive).toBe(false);
      expect(antenna.state.isBeaconLocked).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });

    it('gives up when there is no beacon in the search window', () => {
      antenna.noBeacon = true;
      controller.start();
      run(3_000);
      expect(controller.isActive).toBe(false);
    });
  });

  describe('getState', () => {
    it('reports the climb for debugging', () => {
      controller.start();
      run(3_000);
      const state = controller.getState();
      expect(state.isActive).toBe(true);
      expect(state.lastMeasuredCn).not.toBeNull();
      expect(state.elapsedMs).toBeGreaterThan(0);
      expect(['az', 'el']).toContain(state.axis);
    });

    it('reports zero elapsed time when idle', () => {
      expect(controller.getState().elapsedMs).toBe(0);
      expect(controller.getState().isLockStable).toBe(false);
    });
  });
});
