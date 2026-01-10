import { Degrees } from 'ootk';
import { StepTrackController } from '../../../src/equipment/antenna/step-track-controller';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';

// Mock SimulationManager
jest.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      update: jest.fn(),
      draw: jest.fn(),
      sync: jest.fn(),
      getSatByNoradId: jest.fn((id: number) => ({
        noradId: id,
        ephemerisErrorAz: 0.15 as Degrees,
        ephemerisErrorEl: 0.10 as Degrees,
      })),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: jest.fn(),
  },
}));

// Mock EventBus
jest.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: jest.fn(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    })),
  },
}));

/**
 * Concrete implementation of AntennaCore for testing StepTrackController
 */
class MockAntennaCore extends AntennaCore {
  private mockRfFrontEnd_: any = null;

  constructor(
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {}
  ) {
    super(configId, initialState, 1, 1);
  }

  protected override addListeners_(): void {}
  syncDomWithState(): void {}
  draw(): void {}

  // Override rfFrontEnd getter to return mock
  override get rfFrontEnd() {
    return this.mockRfFrontEnd_;
  }

  setMockRfFrontEnd(mock: any): void {
    this.mockRfFrontEnd_ = mock;
  }
}

describe('StepTrackController', () => {
  let antenna: MockAntennaCore;
  let controller: StepTrackController;

  beforeEach(() => {
    antenna = new MockAntennaCore(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, {
      isPowered: true,
      isOperational: true,
      trackingMode: 'program-track',
      isStepTrackEnabled: true,
      stepTrackAzOffset: 0 as Degrees,
      stepTrackElOffset: 0 as Degrees,
      beaconFrequencyHz: 3_948_000_000,
      beaconSearchBwHz: 500_000,
      beaconTrackingBwHz: 1_000,
      targetAzimuth: 100 as Degrees,
      targetElevation: 45 as Degrees,
      targetSatelliteId: 12345,
    });

    controller = (antenna as any).stepTrackController_;
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(controller).toBeInstanceOf(StepTrackController);
    });

    it('should not be active by default', () => {
      expect(controller.isActive).toBe(false);
    });
  });

  describe('start', () => {
    it('should set isActive to true', () => {
      controller.start();
      expect(controller.isActive).toBe(true);
    });

    it('should set target offsets from satellite ephemeris error', () => {
      controller.start();
      const state = controller.getState();
      // Target should be negative of ephemeris error
      expect(state.targetAzOffset).toBe(-0.15);
      expect(state.targetElOffset).toBe(-0.10);
    });

    it('should reset convergence state on start', () => {
      controller.start();
      expect(controller.isConverged).toBe(false);
    });
  });

  describe('stop', () => {
    it('should set isActive to false', () => {
      controller.start();
      controller.stop();
      expect(controller.isActive).toBe(false);
    });
  });

  describe('isActive getter', () => {
    it('should return false when stopped', () => {
      expect(controller.isActive).toBe(false);
    });

    it('should return true when started', () => {
      controller.start();
      expect(controller.isActive).toBe(true);
    });
  });

  describe('update', () => {
    it('should not do anything when not active', () => {
      const initialAzOffset = antenna.state.stepTrackAzOffset;
      const initialElOffset = antenna.state.stepTrackElOffset;

      controller.update();

      expect(antenna.state.stepTrackAzOffset).toBe(initialAzOffset);
      expect(antenna.state.stepTrackElOffset).toBe(initialElOffset);
    });

    it('should update offsets when active', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      try {
        controller.start();

        // Advance time a bit (5 seconds)
        mockTime += 5000;
        controller.update();

        // Offsets should have started moving toward target
        const azOffset = antenna.state.stepTrackAzOffset as number;
        const elOffset = antenna.state.stepTrackElOffset as number;

        // Should be non-zero and in the right direction
        expect(azOffset).toBeLessThan(0); // Moving toward -0.15
        expect(elOffset).toBeLessThan(0); // Moving toward -0.10
      } finally {
        Date.now = originalDateNow;
      }
    });

    describe('with mock RF front-end', () => {
      let mockRfFrontEnd: any;

      beforeEach(() => {
        mockRfFrontEnd = {
          lnbModule: {
            state: {
              loFrequency: 5150, // 5150 MHz LO
            },
          },
          agcModule: {
            outputSignals: [],
          },
          couplerModule: {
            signalPathManager: {
              getNoiseFloorAt: jest.fn(() => ({
                noiseFloorNoGain: -120,
                shouldApplyGain: false,
              })),
            },
          },
        };
        antenna.setMockRfFrontEnd(mockRfFrontEnd);
      });

      it('should measure beacon power when signals are present', () => {
        const beaconIfFreq = 5150e6 - 3_948_000_000;
        mockRfFrontEnd.agcModule.outputSignals = [
          {
            frequency: beaconIfFreq,
            power: -60,
            bandwidth: 25000,
          },
        ];

        controller.start();

        // Run updates to get past rate limiting (60 updates per cycle)
        for (let i = 0; i < 65; i++) {
          controller.update();
        }

        expect(antenna.state.beaconPower).toBe(-60);
      });

      it('should calculate C/N ratio', () => {
        const beaconIfFreq = 5150e6 - 3_948_000_000;
        mockRfFrontEnd.agcModule.outputSignals = [
          {
            frequency: beaconIfFreq,
            power: -60,
            bandwidth: 25000,
          },
        ];

        controller.start();

        for (let i = 0; i < 65; i++) {
          controller.update();
        }

        // C/N = signal power (-60) - noise floor (-120) = 60 dB
        expect(antenna.state.beaconCN).toBeGreaterThan(50);
      });

      it('should acquire lock when C/N exceeds threshold', () => {
        const beaconIfFreq = 5150e6 - 3_948_000_000;
        mockRfFrontEnd.agcModule.outputSignals = [
          {
            frequency: beaconIfFreq,
            power: -50,
            bandwidth: 25000,
          },
        ];

        controller.start();

        for (let i = 0; i < 65; i++) {
          controller.update();
        }

        expect(antenna.state.isBeaconLocked).toBe(true);
      });

      it('should auto-disable when C/N is too low', () => {
        const beaconIfFreq = 5150e6 - 3_948_000_000;
        mockRfFrontEnd.agcModule.outputSignals = [
          {
            frequency: beaconIfFreq,
            power: -125, // Very weak signal
            bandwidth: 25000,
          },
        ];

        controller.start();

        for (let i = 0; i < 65; i++) {
          controller.update();
        }

        expect(controller.isActive).toBe(false);
        expect(antenna.state.isAutoTrackEnabled).toBe(false);
      });
    });
  });

  describe('convergence', () => {
    it('should converge over time', () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      try {
        controller.start();
        expect(controller.isConverged).toBe(false);

        // Advance time past convergence duration (25 seconds)
        mockTime += 30000;
        controller.update();

        expect(controller.isConverged).toBe(true);
        expect(controller.getState().progress).toBe(1);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('should reach target offsets when converged', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      try {
        controller.start();

        // Advance time past convergence duration
        mockTime += 30000;
        controller.update();

        // Should have reached target offsets
        expect(antenna.state.stepTrackAzOffset).toBeCloseTo(-0.15, 2);
        expect(antenna.state.stepTrackElOffset).toBeCloseTo(-0.10, 2);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('should use easing for smooth convergence', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      try {
        controller.start();

        // At 50% time, should be more than 50% of the way due to easeOutQuad
        mockTime += 12500; // Half of 25 seconds
        controller.update();

        const progress = controller.getState().progress;
        expect(progress).toBe(0.5);

        // With easeOutQuad, 50% time = 75% progress toward target
        const azOffset = antenna.state.stepTrackAzOffset as number;
        // easeOutQuad(0.5) = 1 - (1-0.5)^2 = 1 - 0.25 = 0.75
        expect(azOffset).toBeCloseTo(-0.15 * 0.75, 2);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('getState', () => {
    it('should return current controller state', () => {
      const state = controller.getState();

      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('isConverged');
      expect(state).toHaveProperty('targetAzOffset');
      expect(state).toHaveProperty('targetElOffset');
      expect(state).toHaveProperty('progress');
      expect(state).toHaveProperty('isLocked');
      expect(state).toHaveProperty('isLockStable');
    });

    it('should reflect current active state', () => {
      expect(controller.getState().isActive).toBe(false);

      controller.start();
      expect(controller.getState().isActive).toBe(true);

      controller.stop();
      expect(controller.getState().isActive).toBe(false);
    });

    it('should return zero progress when not active', () => {
      const state = controller.getState();
      expect(state.progress).toBe(0);
    });
  });

  describe('isLockStable', () => {
    it('should return false when C/N is null', () => {
      antenna.state.beaconCN = null;
      expect(controller.isLockStable()).toBe(false);
    });

    it('should return false when C/N is below threshold', () => {
      antenna.state.beaconCN = 6;
      expect(controller.isLockStable()).toBe(false);
    });

    it('should return true when C/N exceeds stable threshold', () => {
      antenna.state.beaconCN = 10;
      expect(controller.isLockStable()).toBe(true);
    });
  });

  describe('isConverged getter', () => {
    it('should return false initially', () => {
      controller.start();
      expect(controller.isConverged).toBe(false);
    });
  });
});
