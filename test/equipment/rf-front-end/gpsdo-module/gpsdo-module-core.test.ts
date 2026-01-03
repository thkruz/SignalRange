import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { GPSDOModuleCore } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-core';
import { GPSDOState, defaultGpsdoState } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-state';
import { SimulationManager } from '../../../../src/simulation/simulation-manager';

// Mock SimulationManager
jest.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      isDeveloperMode: false,
    })),
  },
}));

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});

// Concrete test implementation of abstract GPSDOModuleCore
class TestGPSDOModule extends GPSDOModuleCore {
  public warmupTickCount = 0;
  public stabilityTickCount = 0;
  public holdoverTickCount = 0;

  constructor(state: GPSDOState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
    super(state, rfFrontEnd, unit);
  }

  protected initializeDom(parentId: string): HTMLElement {
    const el = document.createElement('div');
    el.id = this.uniqueId;
    document.getElementById(parentId)?.appendChild(el);
    return el;
  }

  addEventListeners(): void {
    // No-op for test
  }

  protected syncDomWithState_(): void {
    // No-op for test
  }

  // Override hooks to track calls
  protected onWarmupTick(): void {
    this.warmupTickCount++;
  }

  protected onStabilityTick(): void {
    this.stabilityTickCount++;
  }

  protected onHoldoverTick(): void {
    this.holdoverTickCount++;
  }

  // Expose protected methods for testing
  public testStartWarmupTimer(): void {
    this.startWarmupTimer_();
  }

  public testStopWarmupTimer(): void {
    this.stopWarmupTimer_();
  }

  public testStartStabilityMonitor(): void {
    this.startStabilityMonitor_();
  }

  public testStopStabilityMonitor(): void {
    this.stopStabilityMonitor_();
  }

  public testStartHoldoverMonitor(): void {
    this.startHoldoverMonitor_();
  }

  public testStopHoldoverMonitor(): void {
    this.stopHoldoverMonitor_();
  }

  public getWarmupInterval(): number | null {
    return this.warmupInterval_;
  }

  public getStabilityInterval(): number | null {
    return this.stabilityInterval_;
  }

  public getHoldoverInterval(): number | null {
    return this.holdoverInterval_;
  }
}

// Mock RFFrontEndCore
function createMockRfFrontEnd(): RFFrontEndCore {
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }),
    },
    state: {
      teamId: 1,
      serverId: 1,
    },
  } as unknown as RFFrontEndCore;
}

describe('GPSDOModuleCore', () => {
  let gpsdoModule: TestGPSDOModule;
  let mockRfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    if (gpsdoModule) {
      gpsdoModule.testStopWarmupTimer();
      gpsdoModule.testStopStabilityMonitor();
      gpsdoModule.testStopHoldoverMonitor();
    }
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);

      expect(gpsdoModule).toBeInstanceOf(GPSDOModuleCore);
      expect(gpsdoModule.state.isPowered).toBe(true);
      expect(gpsdoModule.state.isLocked).toBe(true);
    });

    it('should merge provided state with defaults', () => {
      const customState: Partial<GPSDOState> = {
        isPowered: false,
        temperature: 50,
        satelliteCount: 5,
      };

      gpsdoModule = new TestGPSDOModule(
        { ...defaultGpsdoState, ...customState } as GPSDOState,
        mockRfFrontEnd,
        1
      );

      expect(gpsdoModule.state.isPowered).toBe(false);
      expect(gpsdoModule.state.temperature).toBe(50);
      expect(gpsdoModule.state.satelliteCount).toBe(5);
      expect(gpsdoModule.state.constellation).toBe('GPS'); // from defaults
    });

    it('should start warmup timer if powered with warmup remaining', () => {
      gpsdoModule = new TestGPSDOModule(
        { ...defaultGpsdoState, isPowered: true, warmupTimeRemaining: 100 },
        mockRfFrontEnd,
        1
      );

      expect(gpsdoModule.getWarmupInterval()).not.toBeNull();
    });

    it('should start holdover monitor if powered, warmed up, and not locked', () => {
      gpsdoModule = new TestGPSDOModule(
        { ...defaultGpsdoState, isPowered: true, warmupTimeRemaining: 0, isLocked: false },
        mockRfFrontEnd,
        1
      );

      expect(gpsdoModule.getHoldoverInterval()).not.toBeNull();
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should update lock status when can lock', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isGnssSwitchUp = true;
      gpsdoModule.state.warmupTimeRemaining = 0;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.isLocked = false;

      gpsdoModule.update();

      expect(gpsdoModule.state.isLocked).toBe(true);
    });

    it('should reset lock when powered off', () => {
      gpsdoModule.state.isPowered = false;
      gpsdoModule.state.isLocked = true;

      gpsdoModule.update();

      expect(gpsdoModule.state.isLocked).toBe(false);
      expect(gpsdoModule.state.lockDuration).toBe(0);
    });

    it('should reset lock when GNSS switch is down', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isGnssSwitchUp = false;
      gpsdoModule.state.isLocked = true;

      gpsdoModule.update();

      expect(gpsdoModule.state.isLocked).toBe(false);
    });

    it('should reset lock when still warming up', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isGnssSwitchUp = true;
      gpsdoModule.state.warmupTimeRemaining = 100;
      gpsdoModule.state.isLocked = true;

      gpsdoModule.update();

      expect(gpsdoModule.state.isLocked).toBe(false);
    });
  });

  describe('signal quality updates', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should set poor quality when powered off', () => {
      gpsdoModule.state.isPowered = false;

      gpsdoModule.update();

      expect(gpsdoModule.state.phaseNoise).toBe(0);
      expect(gpsdoModule.state.frequencyAccuracy).toBe(999);
      expect(gpsdoModule.state.allanDeviation).toBe(99);
    });

    it('should set poor quality when not locked and not in holdover', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = false;
      gpsdoModule.state.isInHoldover = false;
      gpsdoModule.state.gnssSignalPresent = false; // Prevent auto-lock
      gpsdoModule.state.isGnssSwitchUp = false; // Prevent auto-lock

      gpsdoModule.update();

      expect(gpsdoModule.state.frequencyAccuracy).toBe(999);
      expect(gpsdoModule.state.allanDeviation).toBe(99);
    });

    it('should maintain quality during holdover with degradation', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.isInHoldover = true;
      gpsdoModule.state.holdoverError = 10;

      gpsdoModule.update();

      expect(gpsdoModule.state.phaseNoise).toBeLessThanOrEqual(-115);
      expect(gpsdoModule.state.utcAccuracy).toBe(0); // No GPS timing in holdover
    });

    it('should have excellent quality when locked with GNSS', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.isInHoldover = false;

      gpsdoModule.update();

      expect(gpsdoModule.state.phaseNoise).toBeLessThanOrEqual(-125);
      expect(gpsdoModule.state.frequencyAccuracy).toBeLessThanOrEqual(5);
      expect(gpsdoModule.state.utcAccuracy).toBeGreaterThan(0);
    });

    it('should set UTC accuracy to 0 when locked but no GNSS signal', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = false;
      gpsdoModule.state.isInHoldover = false;

      gpsdoModule.update();

      expect(gpsdoModule.state.utcAccuracy).toBe(0);
    });
  });

  describe('thermal state updates', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule(
        { ...defaultGpsdoState, temperature: 50 },
        mockRfFrontEnd,
        1
      );
    });

    it('should cool down when powered off', () => {
      gpsdoModule.state.isPowered = false;
      const initialTemp = gpsdoModule.state.temperature;

      gpsdoModule.update();

      // Temperature should move toward ambient (25°C)
      expect(gpsdoModule.state.temperature).toBeLessThan(initialTemp);
    });

    it('should heat up when powered on', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.temperature = 40;
      const initialTemp = gpsdoModule.state.temperature;

      gpsdoModule.update();

      // Temperature should move toward target (70°C)
      expect(gpsdoModule.state.temperature).toBeGreaterThan(initialTemp);
    });
  });

  describe('handlePowerToggle()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should reset to warmup state when powered on', () => {
      gpsdoModule.state.isPowered = false;
      gpsdoModule.state.temperature = 25;

      gpsdoModule.handlePowerToggle(true);

      expect(gpsdoModule.state.isPowered).toBe(true);
      expect(gpsdoModule.state.isLocked).toBe(false);
      expect(gpsdoModule.state.lockDuration).toBe(0);
      expect(gpsdoModule.state.isInHoldover).toBe(false);
      expect(gpsdoModule.state.warmupTimeRemaining).toBeGreaterThan(0);
    });

    it('should start timers when powered on', () => {
      gpsdoModule.state.isPowered = false;

      gpsdoModule.handlePowerToggle(true);

      expect(gpsdoModule.getWarmupInterval()).not.toBeNull();
      expect(gpsdoModule.getStabilityInterval()).not.toBeNull();
    });

    it('should reset state when powered off', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.satelliteCount = 8;
      gpsdoModule.state.lockDuration = 1000;

      gpsdoModule.handlePowerToggle(false);

      expect(gpsdoModule.state.isPowered).toBe(false);
      expect(gpsdoModule.state.isLocked).toBe(false);
      expect(gpsdoModule.state.isInHoldover).toBe(false);
      expect(gpsdoModule.state.gnssSignalPresent).toBe(false);
      expect(gpsdoModule.state.satelliteCount).toBe(0);
      expect(gpsdoModule.state.lockDuration).toBe(0);
    });

    it('should stop all timers when powered off', () => {
      gpsdoModule.testStartWarmupTimer();
      gpsdoModule.testStartStabilityMonitor();
      gpsdoModule.testStartHoldoverMonitor();

      gpsdoModule.handlePowerToggle(false);

      expect(gpsdoModule.getWarmupInterval()).toBeNull();
      expect(gpsdoModule.getStabilityInterval()).toBeNull();
      expect(gpsdoModule.getHoldoverInterval()).toBeNull();
    });
  });

  describe('handleGnssToggle()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule(
        { ...defaultGpsdoState, isPowered: true, warmupTimeRemaining: 0 },
        mockRfFrontEnd,
        1
      );
    });

    it('should set acquiring state when enabling GNSS', () => {
      gpsdoModule.state.isGnssSwitchUp = false;

      const callback = jest.fn();
      gpsdoModule.handleGnssToggle(true, callback);

      expect(gpsdoModule.state.isGnssSwitchUp).toBe(true);
      expect(gpsdoModule.state.isGnssAcquiringLock).toBe(true);
      expect(gpsdoModule.state.gnssSignalPresent).toBe(false);
    });

    it('should acquire lock after delay when GNSS enabled', () => {
      gpsdoModule.state.isGnssSwitchUp = false;
      gpsdoModule.state.isLocked = false;

      const callback = jest.fn();
      gpsdoModule.handleGnssToggle(true, callback);

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      expect(gpsdoModule.state.gnssSignalPresent).toBe(true);
      expect(gpsdoModule.state.isGnssAcquiringLock).toBe(false);
      expect(gpsdoModule.state.satelliteCount).toBeGreaterThanOrEqual(4);
      expect(gpsdoModule.state.isInHoldover).toBe(false);
      expect(callback).toHaveBeenCalledWith(gpsdoModule.state);
    });

    it('should enter holdover when GNSS disabled while locked', () => {
      gpsdoModule.state.isGnssSwitchUp = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.satelliteCount = 8;

      const callback = jest.fn();
      gpsdoModule.handleGnssToggle(false, callback);

      expect(gpsdoModule.state.isGnssSwitchUp).toBe(false);
      expect(gpsdoModule.state.gnssSignalPresent).toBe(false);
      expect(gpsdoModule.state.isInHoldover).toBe(true);
      expect(gpsdoModule.state.satelliteCount).toBe(0);
    });

    it('should start holdover monitor when entering holdover', () => {
      gpsdoModule.state.isGnssSwitchUp = true;
      gpsdoModule.state.isLocked = true;

      const callback = jest.fn();
      gpsdoModule.handleGnssToggle(false, callback);

      expect(gpsdoModule.getHoldoverInterval()).not.toBeNull();
    });
  });

  describe('warmup timer', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule(
        {
          ...defaultGpsdoState,
          isPowered: true,
          warmupTimeRemaining: 10,
          temperature: 40,
          isLocked: false,
        },
        mockRfFrontEnd,
        1
      );
    });

    it('should decrement warmup time each second', () => {
      gpsdoModule.testStartWarmupTimer();

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.state.warmupTimeRemaining).toBe(9);
    });

    it('should increase temperature during warmup', () => {
      gpsdoModule.testStartWarmupTimer();
      const initialTemp = gpsdoModule.state.temperature;

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.state.temperature).toBeGreaterThan(initialTemp);
    });

    it('should improve specs during warmup', () => {
      gpsdoModule.state.frequencyAccuracy = 1000;
      gpsdoModule.testStartWarmupTimer();

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.state.frequencyAccuracy).toBeLessThan(1000);
    });

    it('should call onWarmupTick each second', () => {
      gpsdoModule.testStartWarmupTimer();

      jest.advanceTimersByTime(3000);

      expect(gpsdoModule.warmupTickCount).toBe(3);
    });

    it('should achieve lock when warmup completes with GNSS present', () => {
      gpsdoModule.state.warmupTimeRemaining = 1;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.isGnssSwitchUp = true; // Required for lock
      gpsdoModule.testStartWarmupTimer();

      // First tick: decrements warmupTimeRemaining from 1 to 0
      jest.advanceTimersByTime(1000);
      expect(gpsdoModule.state.warmupTimeRemaining).toBe(0);

      // Second tick: enters else branch and achieves lock
      jest.advanceTimersByTime(1000);
      expect(gpsdoModule.state.isLocked).toBe(true);
    });

    it('should stop when powered off', () => {
      gpsdoModule.testStartWarmupTimer();
      gpsdoModule.state.isPowered = false;

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.getWarmupInterval()).toBeNull();
    });

    it('should not start multiple intervals', () => {
      gpsdoModule.testStartWarmupTimer();
      const firstInterval = gpsdoModule.getWarmupInterval();

      gpsdoModule.testStartWarmupTimer();

      expect(gpsdoModule.getWarmupInterval()).toBe(firstInterval);
    });
  });

  describe('stability monitor', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule(
        {
          ...defaultGpsdoState,
          isPowered: true,
          isLocked: true,
          gnssSignalPresent: true,
          warmupTimeRemaining: 0,
          lockDuration: 0,
          operatingHours: 100,
          satelliteCount: 8,
        },
        mockRfFrontEnd,
        1
      );
    });

    it('should increment lock duration every 5 seconds', () => {
      gpsdoModule.testStartStabilityMonitor();

      jest.advanceTimersByTime(5000);

      expect(gpsdoModule.state.lockDuration).toBe(5);
    });

    it('should increment operating hours', () => {
      const initialHours = gpsdoModule.state.operatingHours;
      gpsdoModule.testStartStabilityMonitor();

      jest.advanceTimersByTime(5000);

      expect(gpsdoModule.state.operatingHours).toBeCloseTo(initialHours + 5 / 3600, 6);
    });

    it('should call onStabilityTick every 5 seconds', () => {
      gpsdoModule.testStartStabilityMonitor();

      jest.advanceTimersByTime(15000);

      expect(gpsdoModule.stabilityTickCount).toBe(3);
    });

    it('should vary satellite count slightly over time', () => {
      gpsdoModule.testStartStabilityMonitor();
      const initialSatCount = gpsdoModule.state.satelliteCount;

      // Run multiple times to increase chance of satellite count change
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(5000);
      }

      // Satellite count should stay within bounds
      expect(gpsdoModule.state.satelliteCount).toBeGreaterThanOrEqual(4);
      expect(gpsdoModule.state.satelliteCount).toBeLessThanOrEqual(12);
    });

    it('should not update when not locked', () => {
      gpsdoModule.state.isLocked = false;
      gpsdoModule.testStartStabilityMonitor();

      jest.advanceTimersByTime(5000);

      expect(gpsdoModule.state.lockDuration).toBe(0);
    });

    it('should not start multiple intervals', () => {
      gpsdoModule.testStartStabilityMonitor();
      const firstInterval = gpsdoModule.getStabilityInterval();

      gpsdoModule.testStartStabilityMonitor();

      expect(gpsdoModule.getStabilityInterval()).toBe(firstInterval);
    });
  });

  describe('holdover monitor', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule(
        {
          ...defaultGpsdoState,
          isPowered: true,
          isInHoldover: true,
          holdoverDuration: 0,
          holdoverError: 0,
          agingRate: 0.05,
        },
        mockRfFrontEnd,
        1
      );
    });

    it('should increment holdover duration every second', () => {
      gpsdoModule.testStartHoldoverMonitor();

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.state.holdoverDuration).toBe(1);
    });

    it('should calculate holdover error based on elapsed time', () => {
      gpsdoModule.testStartHoldoverMonitor();

      // 3600 seconds = 1 hour, should have ~1.67 μs error
      jest.advanceTimersByTime(3600 * 1000);

      expect(gpsdoModule.state.holdoverError).toBeCloseTo(1.67, 1);
    });

    it('should degrade frequency accuracy with aging rate', () => {
      const initialAccuracy = gpsdoModule.state.frequencyAccuracy;
      gpsdoModule.testStartHoldoverMonitor();

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.state.frequencyAccuracy).toBeGreaterThan(initialAccuracy);
    });

    it('should call onHoldoverTick every second', () => {
      gpsdoModule.testStartHoldoverMonitor();

      jest.advanceTimersByTime(5000);

      expect(gpsdoModule.holdoverTickCount).toBe(5);
    });

    it('should stop when no longer in holdover', () => {
      gpsdoModule.testStartHoldoverMonitor();
      gpsdoModule.state.isInHoldover = false;

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.getHoldoverInterval()).toBeNull();
    });

    it('should stop when powered off', () => {
      gpsdoModule.testStartHoldoverMonitor();
      gpsdoModule.state.isPowered = false;

      jest.advanceTimersByTime(1000);

      expect(gpsdoModule.getHoldoverInterval()).toBeNull();
    });

    it('should not start multiple intervals', () => {
      gpsdoModule.testStartHoldoverMonitor();
      const firstInterval = gpsdoModule.getHoldoverInterval();

      gpsdoModule.testStartHoldoverMonitor();

      expect(gpsdoModule.getHoldoverInterval()).toBe(firstInterval);
    });
  });

  describe('getAlarms()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return empty array when powered off', () => {
      gpsdoModule.state.isPowered = false;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms).toEqual([]);
    });

    it('should alarm when not locked after warmup', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = false;
      gpsdoModule.state.warmupTimeRemaining = 0;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms).toContain('GPSDO not locked');
    });

    it('should not alarm when still warming up', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = false;
      gpsdoModule.state.warmupTimeRemaining = 100;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms).not.toContain('GPSDO not locked');
    });

    it('should alarm when GNSS signal lost', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.gnssSignalPresent = false;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms).toContain('GNSS signal lost');
    });

    it('should alarm when in holdover', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isInHoldover = true;
      gpsdoModule.state.holdoverError = 5;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms.some(a => a.includes('GPSDO in holdover'))).toBe(true);
    });

    it('should alarm when holdover error approaches limit', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.holdoverError = 35;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms.some(a => a.includes('approaching limit'))).toBe(true);
    });

    it('should alarm when temperature out of range (high)', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.temperature = 80;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms.some(a => a.includes('oven temperature out of range'))).toBe(true);
    });

    it('should alarm when temperature out of range (low)', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.temperature = 60;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms.some(a => a.includes('oven temperature out of range'))).toBe(true);
    });

    it('should alarm when self-test failed', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.selfTestPassed = false;

      const alarms = gpsdoModule.getAlarms();

      expect(alarms).toContain('GPSDO self-test failed');
    });
  });

  describe('isOutputStable()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return true when powered, locked, and warmed up', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.warmupTimeRemaining = 0;

      expect(gpsdoModule.isOutputStable()).toBe(true);
    });

    it('should return false when not powered', () => {
      gpsdoModule.state.isPowered = false;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.warmupTimeRemaining = 0;

      expect(gpsdoModule.isOutputStable()).toBe(false);
    });

    it('should return false when not locked', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = false;
      gpsdoModule.state.warmupTimeRemaining = 0;

      expect(gpsdoModule.isOutputStable()).toBe(false);
    });

    it('should return false when still warming up', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.warmupTimeRemaining = 100;

      expect(gpsdoModule.isOutputStable()).toBe(false);
    });
  });

  describe('getFrequencyAccuracy()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return accuracy as fraction (×10⁻¹¹)', () => {
      gpsdoModule.state.frequencyAccuracy = 2; // 2×10⁻¹¹

      const result = gpsdoModule.getFrequencyAccuracy();

      expect(result).toBeCloseTo(2e-11, 15);
    });
  });

  describe('get10MhzOutput()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return present when powered', () => {
      gpsdoModule.state.isPowered = true;

      const result = gpsdoModule.get10MhzOutput();

      expect(result.isPresent).toBe(true);
    });

    it('should return not present when powered off', () => {
      gpsdoModule.state.isPowered = false;

      const result = gpsdoModule.get10MhzOutput();

      expect(result.isPresent).toBe(false);
    });

    it('should return warmed up when no warmup remaining', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.warmupTimeRemaining = 0;

      const result = gpsdoModule.get10MhzOutput();

      expect(result.isWarmedUp).toBe(true);
    });

    it('should return not warmed up when warmup remaining', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.warmupTimeRemaining = 100;

      const result = gpsdoModule.get10MhzOutput();

      expect(result.isWarmedUp).toBe(false);
    });
  });

  describe('getReferenceStatus()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return complete reference status', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.warmupTimeRemaining = 0;
      gpsdoModule.state.frequencyAccuracy = 2;
      gpsdoModule.state.phaseNoise = -127;

      const result = gpsdoModule.getReferenceStatus();

      expect(result.isPresent).toBe(true);
      expect(result.isLocked).toBe(true);
      expect(result.accuracy).toBeCloseTo(2e-11, 15);
      expect(result.phaseNoise).toBe(-127);
    });
  });

  describe('LED status methods', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    describe('getLockLedStatus_()', () => {
      it('should return led-off when not powered', () => {
        gpsdoModule.state.isPowered = false;

        expect(gpsdoModule.getLockLedStatus_()).toBe('led-off');
      });

      it('should return led-red when not locked and not acquiring', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.isLocked = false;
        gpsdoModule.state.isGnssAcquiringLock = false;

        expect(gpsdoModule.getLockLedStatus_()).toBe('led-red');
      });

      it('should return led-amber when acquiring lock', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.isGnssAcquiringLock = true;

        expect(gpsdoModule.getLockLedStatus_()).toBe('led-amber');
      });

      it('should return led-green when locked', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.isLocked = true;
        gpsdoModule.state.isGnssAcquiringLock = false;

        expect(gpsdoModule.getLockLedStatus_()).toBe('led-green');
      });
    });

    describe('getGnssLedStatus_()', () => {
      it('should return led-off when not powered', () => {
        gpsdoModule.state.isPowered = false;

        expect(gpsdoModule.getGnssLedStatus_()).toBe('led-off');
      });

      it('should return led-red when no GNSS signal', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.gnssSignalPresent = false;

        expect(gpsdoModule.getGnssLedStatus_()).toBe('led-red');
      });

      it('should return led-amber when satellite count < 4', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.gnssSignalPresent = true;
        gpsdoModule.state.satelliteCount = 3;

        expect(gpsdoModule.getGnssLedStatus_()).toBe('led-amber');
      });

      it('should return led-green when satellite count >= 4', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.gnssSignalPresent = true;
        gpsdoModule.state.satelliteCount = 8;

        expect(gpsdoModule.getGnssLedStatus_()).toBe('led-green');
      });
    });

    describe('getWarmupLedStatus_()', () => {
      it('should return led-off when not powered', () => {
        gpsdoModule.state.isPowered = false;

        expect(gpsdoModule.getWarmupLedStatus_()).toBe('led-off');
      });

      it('should return led-amber when warming up', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.warmupTimeRemaining = 100;

        expect(gpsdoModule.getWarmupLedStatus_()).toBe('led-amber');
      });

      it('should return led-green when warmed up', () => {
        gpsdoModule.state.isPowered = true;
        gpsdoModule.state.warmupTimeRemaining = 0;

        expect(gpsdoModule.getWarmupLedStatus_()).toBe('led-green');
      });
    });
  });

  describe('formatWarmupTime_()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should return READY when no warmup remaining', () => {
      gpsdoModule.state.warmupTimeRemaining = 0;

      expect(gpsdoModule.formatWarmupTime_()).toBe('READY');
    });

    it('should format minutes and seconds', () => {
      gpsdoModule.state.warmupTimeRemaining = 125; // 2:05

      expect(gpsdoModule.formatWarmupTime_()).toBe('2:05');
    });

    it('should pad seconds with leading zero', () => {
      gpsdoModule.state.warmupTimeRemaining = 65; // 1:05

      expect(gpsdoModule.formatWarmupTime_()).toBe('1:05');
    });

    it('should handle just seconds', () => {
      gpsdoModule.state.warmupTimeRemaining = 45; // 0:45

      expect(gpsdoModule.formatWarmupTime_()).toBe('0:45');
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      gpsdoModule = new TestGPSDOModule({ ...defaultGpsdoState }, mockRfFrontEnd, 1);
    });

    it('should merge partial state', () => {
      const newState: Partial<GPSDOState> = {
        temperature: 65,
        satelliteCount: 10,
      };

      gpsdoModule.sync(newState);

      expect(gpsdoModule.state.temperature).toBe(65);
      expect(gpsdoModule.state.satelliteCount).toBe(10);
      // Other properties should remain unchanged
      expect(gpsdoModule.state.isPowered).toBe(true);
    });
  });
});
