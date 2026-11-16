import { vi } from 'vitest';
import { Events, WeatherEventData } from '../../src/events/events';
import { FIXED_STEP_MS, SimClock } from '../../src/simulation/sim-clock';
import { IceAccumulationConfig, WeatherEventRuntime, WeatherManager } from '../../src/weather/weather-manager';
import { setScenarioElapsed } from '../helpers/sim-time';

// Mock EventBus
const mockEventBusInstance = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: vi.fn(() => mockEventBusInstance),
  },
}));

// Mock ScenarioManager
const mockScenarioSettings = {
  weatherEvents: [] as WeatherEventData[],
};

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      settings: mockScenarioSettings,
    })),
  },
}));

// Mock antennas for SimulationManager
const createMockAntenna = (uuid: string, isHeaterEnabled = false, iceAccumulation_dB = 0) => ({
  state: {
    uuid,
    isHeaterEnabled,
    iceAccumulation_dB,
    skyNoiseDegradation_dB: 0,
    rainRate_mmh: 0,
  },
  updateRainRate: vi.fn((value: number) => {
    mockAntennas.find((a) => a.state.uuid === uuid)!.state.rainRate_mmh = value;
  }),
  updateIceAccumulation: vi.fn((value: number) => {
    // Update the mock state when called
    mockAntennas.find((a) => a.state.uuid === uuid)!.state.iceAccumulation_dB = value;
  }),
  updateSkyNoiseDegradation: vi.fn((value: number) => {
    // Update the mock state when called (sun-transit sky-noise path)
    mockAntennas.find((a) => a.state.uuid === uuid)!.state.skyNoiseDegradation_dB = value;
  }),
});

let mockAntennas: ReturnType<typeof createMockAntenna>[] = [];
const mockGroundStations: { state: { id: string }; antennas: typeof mockAntennas }[] = [];

// Objective states the anchored-event path polls (keyed by objective id)
const mockObjectiveStates = new Map<string, { isActive: boolean; isCompleted: boolean }>();

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: mockGroundStations,
      objectivesManager: {
        getObjectiveState: (id: string) => mockObjectiveStates.get(id),
      },
    })),
  },
}));

describe('WeatherManager', () => {
  it.each([5, 25, 80])('preserves anchored weather at second %s through a JSON checkpoint', (savedSecond) => {
    SimClock.reset();
    mockObjectiveStates.clear();
    const event: WeatherEventData = {
      id: 'rain',
      groundStationId: 'gs-1',
      type: 'rain',
      severity: 'moderate',
      startTime: 10,
      startAfterObjectiveId: 'anchor',
      duration: 40,
      linkMarginDegradation: 2,
    };
    mockScenarioSettings.weatherEvents = [event];
    mockAntennas = [createMockAntenna('dish')];
    mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });
    let update!: (dt: number) => void;
    mockEventBusInstance.on.mockImplementation((name, handler) => {
      if (name === Events.UPDATE) update = handler;
    });
    const original = WeatherManager.getInstance();
    if (savedSecond > 5) {
      mockObjectiveStates.set('anchor', { isActive: true, isCompleted: false });
      setScenarioElapsed(10000);
      update(0);
    }
    setScenarioElapsed(savedSecond * 1000);
    update(0);
    const rain = mockAntennas[0].state.rainRate_mmh;
    const saved = JSON.parse(JSON.stringify(original.getCheckpointState()));
    WeatherManager.destroy();
    const restored = WeatherManager.getInstance();
    mockEventBusInstance.emit.mockClear();
    restored.restoreCheckpointState(saved);
    restored.restoreCheckpointState(saved);
    restored.refreshRestoredConditions();
    update(0);
    expect(restored.getCheckpointState()).toEqual(saved);
    expect(mockAntennas[0].state.rainRate_mmh).toBeCloseTo(rain);
    expect(restored.hasEventEnded('rain')).toBe(savedSecond === 80);
    expect(mockEventBusInstance.emit).not.toHaveBeenCalled();
    expect(event.startTime).toBe(10);
    if (savedSecond === 25) {
      setScenarioElapsed(60000);
      update(0);
      expect(restored.hasEventEnded('rain')).toBe(true);
      expect(mockEventBusInstance.emit).toHaveBeenCalledTimes(1);
    }
  });

  beforeEach(() => {
    // Reset singleton
    WeatherManager.destroy();

    // Reset mocks
    vi.clearAllMocks();
    mockScenarioSettings.weatherEvents = [];
    mockAntennas = [];
    mockGroundStations.length = 0;

    // Reset Date.now mock if any
    vi.useRealTimers();
  });

  afterEach(() => {
    WeatherManager.destroy();
    vi.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple getInstance calls', () => {
      const instance1 = WeatherManager.getInstance();
      const instance2 = WeatherManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create a new instance after destroy', () => {
      const instance1 = WeatherManager.getInstance();
      WeatherManager.destroy();
      const instance2 = WeatherManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should register UPDATE event listener on creation', () => {
      WeatherManager.getInstance();

      expect(mockEventBusInstance.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should unregister UPDATE event listener on destroy', () => {
      WeatherManager.getInstance();
      WeatherManager.destroy();

      expect(mockEventBusInstance.off).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should handle destroy when no instance exists', () => {
      // Should not throw
      expect(() => WeatherManager.destroy()).not.toThrow();
    });
  });

  describe('Weather Event Loading', () => {
    it('should load weather events from ScenarioManager', () => {
      const weatherEvents: WeatherEventData[] = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 60,
          duration: 300,
          linkMarginDegradation: 2,
        },
      ];
      mockScenarioSettings.weatherEvents = weatherEvents;

      const manager = WeatherManager.getInstance();
      const allEvents = manager.getAllWeatherEvents();

      expect(allEvents).toHaveLength(1);
      expect(allEvents[0].id).toBe('event-1');
      expect(allEvents[0].isActive).toBe(false);
    });

    it('should handle empty weather events array', () => {
      mockScenarioSettings.weatherEvents = [];

      const manager = WeatherManager.getInstance();
      const allEvents = manager.getAllWeatherEvents();

      expect(allEvents).toHaveLength(0);
    });

    it('should handle undefined weather events', () => {
      mockScenarioSettings.weatherEvents = undefined as any;

      const manager = WeatherManager.getInstance();
      const allEvents = manager.getAllWeatherEvents();

      expect(allEvents).toHaveLength(0);
    });

    it('should return a copy of events array to prevent external mutation', () => {
      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor',
          startTime: 0,
          duration: 100,
          linkMarginDegradation: 1,
        },
      ];

      const manager = WeatherManager.getInstance();
      const events1 = manager.getAllWeatherEvents();
      const events2 = manager.getAllWeatherEvents();

      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });
  });

  describe('Elapsed Mission Time', () => {
    it('should return elapsed time in seconds', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const manager = WeatherManager.getInstance();

      // Advance time by 5 seconds
      setScenarioElapsed(5000);

      expect(manager.getElapsedMissionTime()).toBeCloseTo(5, 1);
    });
  });

  describe('Weather Event State Transitions', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      // Capture the update handler when registered
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    it('should activate event when elapsed time reaches start time', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 10, // Start at 10 seconds
          duration: 60,
          linkMarginDegradation: 2,
        },
      ];

      // Setup empty ground stations to avoid errors
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      const manager = WeatherManager.getInstance();

      // Advance time to 15 seconds (past start time)
      setScenarioElapsed(15000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'event-1', isActive: true }));
    });

    it('should deactivate event when elapsed time exceeds start + duration', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 5,
          duration: 10,
          linkMarginDegradation: 2,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      const manager = WeatherManager.getInstance();

      // Activate the event first
      setScenarioElapsed(8000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'event-1' }));

      // Deactivate the event
      setScenarioElapsed(20000); // Past 5 + 10 = 15 seconds
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_ENDED, expect.objectContaining({ id: 'event-1', isActive: false }));
    });

    it('should not emit events when state does not change', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'rain',
          severity: 'minor',
          startTime: 5,
          duration: 100,
          linkMarginDegradation: 1,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      WeatherManager.getInstance();

      // Activate
      setScenarioElapsed(10000);
      updateHandler(1000);

      // Clear emit mock
      mockEventBusInstance.emit.mockClear();

      // Call update again without state change
      setScenarioElapsed(11000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).not.toHaveBeenCalled();
    });

    it('should handle multiple events with different timings', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor',
          startTime: 10,
          duration: 30,
          linkMarginDegradation: 1,
        },
        {
          id: 'event-2',
          groundStationId: 'gs-1',
          type: 'ice',
          severity: 'severe',
          startTime: 50,
          duration: 60,
          linkMarginDegradation: 5,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      WeatherManager.getInstance();

      // Activate first event
      setScenarioElapsed(15000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'event-1' }));

      // First event ends, second not started yet
      setScenarioElapsed(45000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_ENDED, expect.objectContaining({ id: 'event-1' }));

      // Activate second event
      setScenarioElapsed(55000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'event-2' }));
    });
  });

  describe('Ice Accumulation Physics', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    it('should accumulate ice exponentially when heater is OFF during ice-producing weather', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 2,
        },
      ];

      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      // Simulate 60 seconds of ice accumulation
      setScenarioElapsed(5000);
      updateHandler(5000); // 5 second dt

      // Check that updateIceAccumulation was called
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalled();

      // Verify exponential formula: ice = maxIce * (1 - e^(-t/tau))
      // For moderate: maxIce = 5dB, tau = 1200s
      // After 5s: ice = 5 * (1 - e^(-5/1200)) ≈ 0.0208 dB
      const config = WeatherManager.SEVERITY_CONFIG['moderate'];
      const expectedIce = config.maxDegradation_dB * (1 - Math.exp(-5 / config.timeConstant_s));

      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(expect.closeTo(expectedIce, 4));
    });

    it('resumes the buildup from ice already on the feed (a seeded start state, nats-s20-F7)', () => {
      mockScenarioSettings.weatherEvents = [{ id: 'event-1', groundStationId: 'gs-1', type: 'snow', severity: 'severe', startTime: 0, duration: 3600, linkMarginDegradation: 2 }];
      mockAntennas = [createMockAntenna('antenna-1', false, 6)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();
      setScenarioElapsed(5000);
      updateHandler(5000);

      // 6 dB of a 10 dB, 720 s buildup is t = -720 ln(0.4) = 660 s in; 5 s later
      const config = WeatherManager.SEVERITY_CONFIG['severe'];
      const t0 = -config.timeConstant_s * Math.log(1 - 6 / config.maxDegradation_dB);
      const expected = config.maxDegradation_dB * (1 - Math.exp(-(t0 + 5) / config.timeConstant_s));
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(expect.closeTo(expected, 4));
      expect(expected).toBeGreaterThan(6);
    });

    it('should NOT accumulate ice when heater is ON', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'severe',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 5,
        },
      ];

      // Heater is ON
      mockAntennas = [createMockAntenna('antenna-1', true, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      setScenarioElapsed(60000);
      updateHandler(60000);

      // updateIceAccumulation should NOT be called when heater is ON and no existing ice
      expect(mockAntennas[0].updateIceAccumulation).not.toHaveBeenCalled();
    });

    it('keeps building ice with the heater ON when the storm outpaces it (phase 27 Q5, heaterMeltDbPerMin)', () => {
      mockScenarioSettings.weatherEvents = [
        { id: 'event-1', groundStationId: 'gs-1', type: 'snow', severity: 'severe', startTime: 0, duration: 3600, linkMarginDegradation: 8, heaterMeltDbPerMin: 0.5 },
      ];
      mockAntennas = [createMockAntenna('antenna-1', true, 0.8)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();
      for (let s = 1; s <= 600; s++) {
        setScenarioElapsed(s * 1000);
        updateHandler(1000);
      }

      // dI/dt = (max - I) / tau - melt settles at E = max - melt x tau = 10 - (0.5/60) x 720 = 4 dB
      const config = WeatherManager.SEVERITY_CONFIG['severe'];
      const equilibrium = config.maxDegradation_dB - (0.5 / 60) * config.timeConstant_s;
      const expected = equilibrium - (equilibrium - 0.8) * Math.exp(-600 / config.timeConstant_s);
      expect(equilibrium).toBeCloseTo(4, 6);
      expect(mockAntennas[0].state.iceAccumulation_dB).toBeCloseTo(expected, 2);
      expect(mockAntennas[0].state.iceAccumulation_dB).toBeGreaterThan(0.8);
      expect(mockAntennas[0].state.iceAccumulation_dB).toBeLessThan(equilibrium);
    });

    it('should NOT accumulate ice for non-ice-producing weather types', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'rain', // Rain does not produce ice
          severity: 'moderate',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 2,
        },
      ];

      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      setScenarioElapsed(60000);
      updateHandler(60000);

      // updateIceAccumulation should NOT be called for rain
      expect(mockAntennas[0].updateIceAccumulation).not.toHaveBeenCalled();
    });

    it('should accumulate ice for hail weather', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'hail',
          severity: 'minor',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 1,
        },
      ];

      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      setScenarioElapsed(10000);
      updateHandler(10000);

      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalled();
    });

    it('should accumulate ice for ice weather', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'ice',
          severity: 'severe',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 5,
        },
      ];

      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      setScenarioElapsed(10000);
      updateHandler(10000);

      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalled();
    });

    it('should use correct severity configuration for each level', () => {
      // Verify the SEVERITY_CONFIG values
      expect(WeatherManager.SEVERITY_CONFIG).toEqual({
        minor: { maxDegradation_dB: 2, timeConstant_s: 2400 },
        moderate: { maxDegradation_dB: 5, timeConstant_s: 1200 },
        severe: { maxDegradation_dB: 10, timeConstant_s: 720 },
      });
    });

    it('should track ice accumulation time per antenna', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 2,
        },
      ];

      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      const manager = WeatherManager.getInstance();

      // First update
      setScenarioElapsed(10000);
      updateHandler(10000);

      expect(manager.getIceAccumulationTime('antenna-1')).toBe(10);

      // Second update
      setScenarioElapsed(25000);
      updateHandler(15000);

      expect(manager.getIceAccumulationTime('antenna-1')).toBe(25);
    });
  });

  describe('Ice Melting', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    it('should melt ice linearly when heater is ON', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [];

      // Antenna has existing ice and heater is ON
      mockAntennas = [createMockAntenna('antenna-1', true, 3.0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      // Simulate 60 seconds (should melt 1 dB)
      setScenarioElapsed(60000);
      updateHandler(60000);

      // Melt rate is 1 dB per minute
      // After 60s: 3.0 - 1.0 = 2.0 dB
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(2.0);
    });

    it('should not allow ice to go below 0', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [];

      // Antenna has small amount of ice
      mockAntennas = [createMockAntenna('antenna-1', true, 0.5)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      // Simulate 60 seconds (would melt 1 dB, but only 0.5 available)
      setScenarioElapsed(60000);
      updateHandler(60000);

      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(0);
    });

    it('should reset accumulation time to 0 when ice fully melts', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [];

      mockAntennas = [createMockAntenna('antenna-1', true, 0.5)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      const manager = WeatherManager.getInstance();

      // Melt all ice
      setScenarioElapsed(60000);
      updateHandler(60000);

      expect(manager.getIceAccumulationTime('antenna-1')).toBe(0);
    });

    it('should verify melt rate constant', () => {
      // 1 dB per minute = 1/60 dB per second
      expect(WeatherManager.MELT_RATE_DB_PER_SECOND).toBeCloseTo(1 / 60, 6);
    });

    it('should handle melting when ice ratio is at or above max (ratio >= 1)', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      // Use "minor" severity which has maxDegradation_dB of 2
      // But antenna has ice of 3 dB (more than minor's max) - could happen if
      // ice accumulated during severe weather then switched to minor
      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor', // max is 2 dB
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 1,
        },
      ];

      // Antenna has 3 dB ice (more than minor's 2 dB max), heater is ON and melting
      mockAntennas = [createMockAntenna('antenna-1', true, 3.0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      const manager = WeatherManager.getInstance();

      // Simulate 30 seconds (should melt 0.5 dB, leaving 2.5 dB)
      setScenarioElapsed(30000);
      updateHandler(30000);

      // Ice should be melted by 0.5 dB (30s * 1/60 dB/s)
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(2.5);

      // Since ratio = 2.5/2 = 1.25 >= 1, the accumulation time recalculation
      // should be skipped (we can't take log of non-positive number)
      // The accumulation time should not be updated (remains at 0 from creation)
      expect(manager.getIceAccumulationTime('antenna-1')).toBe(0);
    });
  });

  describe('ice runs on scenario time (Phase 34 D9, nats-r9-s20-F1)', () => {
    let updateHandler: (dt: number) => void;
    /** One fixed step with its UPDATE, as SimulationManager runs it (UPDATE fires paused or not) */
    const stepOnce = () => {
      SimClock.step();
      updateHandler(FIXED_STEP_MS);
    };

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    afterEach(() => {
      SimClock.resume('scenario');
    });

    it.each([
      ['builds with the heater off', false, undefined, 1.0, 'grows'],
      ['melts with the heater on', true, undefined, 3.0, 'shrinks'],
      ['balances load and melt with the heater on in a storm that outpaces it', true, 0.1, 1.0, 'grows'],
    ] as const)('holds while the scenario clock is paused, and %s once it runs', (_name, isHeaterEnabled, heaterMeltDbPerMin, startIce, direction) => {
      mockScenarioSettings.weatherEvents = [
        {
          id: 'snow-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 2,
          ...(heaterMeltDbPerMin === undefined ? {} : { heaterMeltDbPerMin }),
        },
      ];
      mockAntennas = [createMockAntenna('antenna-1', isHeaterEnabled, startIce)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });
      SimClock.resume('scenario');
      WeatherManager.getInstance();
      setScenarioElapsed(1000);
      stepOnce();
      const iceAtPause = mockAntennas[0].state.iceAccumulation_dB;

      // A brief, dialog or quiz holds the scenario clock for 10 s of run time
      SimClock.pause('scenario');
      for (let i = 0; i < 600; i++) {
        stepOnce();
      }
      expect(mockAntennas[0].state.iceAccumulation_dB).toBe(iceAtPause);

      SimClock.resume('scenario');
      for (let i = 0; i < 60; i++) {
        stepOnce();
      }
      const iceAfter = mockAntennas[0].state.iceAccumulation_dB;
      if (direction === 'grows') {
        expect(iceAfter).toBeGreaterThan(iceAtPause);
      } else {
        expect(iceAfter).toBeLessThan(iceAtPause);
      }
    });
  });

  describe('Query Methods', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    describe('getActiveWeatherEvents', () => {
      it('should return only active events for the specified ground station', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'snow',
            severity: 'minor',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 1,
          },
          {
            id: 'event-2',
            groundStationId: 'gs-2',
            type: 'rain',
            severity: 'moderate',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 2,
          },
          {
            id: 'event-3',
            groundStationId: 'gs-1',
            type: 'fog',
            severity: 'minor',
            startTime: 200, // Not active yet
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] }, { state: { id: 'gs-2' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        // Activate events
        setScenarioElapsed(50000);
        updateHandler(50000);

        const gs1Events = manager.getActiveWeatherEvents('gs-1');
        expect(gs1Events).toHaveLength(1);
        expect(gs1Events[0].id).toBe('event-1');
      });

      it('should return empty array when no events are active', () => {
        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'snow',
            severity: 'minor',
            startTime: 1000, // Far in the future
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        const manager = WeatherManager.getInstance();
        expect(manager.getActiveWeatherEvents('gs-1')).toHaveLength(0);
      });
    });

    describe('isPrecipitationActive', () => {
      it('should return true for snow precipitation', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'snow',
            severity: 'minor',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(true);
      });

      it('should return true for rain precipitation', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'rain',
            severity: 'moderate',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 2,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(true);
      });

      it('should return true for hail precipitation', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'hail',
            severity: 'severe',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 3,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(true);
      });

      it('should return true for ice precipitation', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'ice',
            severity: 'minor',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(true);
      });

      it('should return false for non-precipitation weather (fog)', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'fog',
            severity: 'minor',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(false);
      });

      it('should return false for non-precipitation weather (wind)', () => {
        vi.useFakeTimers();
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        mockScenarioSettings.weatherEvents = [
          {
            id: 'event-1',
            groundStationId: 'gs-1',
            type: 'wind',
            severity: 'moderate',
            startTime: 0,
            duration: 100,
            linkMarginDegradation: 1,
          },
        ];

        mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

        const manager = WeatherManager.getInstance();

        setScenarioElapsed(10000);
        updateHandler(10000);

        expect(manager.isPrecipitationActive('gs-1')).toBe(false);
      });

      it('should return false when no events are active', () => {
        mockScenarioSettings.weatherEvents = [];

        const manager = WeatherManager.getInstance();

        expect(manager.isPrecipitationActive('gs-1')).toBe(false);
      });
    });

    describe('getIceAccumulationTime', () => {
      it('should return 0 for unknown antenna', () => {
        const manager = WeatherManager.getInstance();
        expect(manager.getIceAccumulationTime('unknown-antenna')).toBe(0);
      });
    });
  });

  describe('Multiple Antennas', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    it('should handle multiple antennas with different heater states', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'moderate',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 2,
        },
      ];

      mockAntennas = [
        createMockAntenna('antenna-1', false, 0), // Heater OFF - will accumulate ice
        createMockAntenna('antenna-2', true, 2.0), // Heater ON with existing ice - will melt
      ];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      WeatherManager.getInstance();

      setScenarioElapsed(60000);
      updateHandler(60000);

      // Antenna 1: Should accumulate ice
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalled();
      const antenna1Call = mockAntennas[0].updateIceAccumulation.mock.calls[0][0];
      expect(antenna1Call).toBeGreaterThan(0);

      // Antenna 2: Should melt ice (from 2.0 to 1.0 after 60s)
      expect(mockAntennas[1].updateIceAccumulation).toHaveBeenCalledWith(1.0);
    });

    it('should handle multiple ground stations independently', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'severe',
          startTime: 0,
          duration: 3600,
          linkMarginDegradation: 5,
        },
        // gs-2 has no weather events
      ];

      const antenna1 = createMockAntenna('antenna-1', false, 0);
      const antenna2 = createMockAntenna('antenna-2', false, 0);

      // Add both antennas to mockAntennas so the find() in createMockAntenna works
      mockAntennas = [antenna1, antenna2];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [antenna1] }, { state: { id: 'gs-2' }, antennas: [antenna2] });

      WeatherManager.getInstance();

      setScenarioElapsed(60000);
      updateHandler(60000);

      // gs-1 antenna should accumulate ice
      expect(antenna1.updateIceAccumulation).toHaveBeenCalled();

      // gs-2 antenna should NOT accumulate ice (no weather)
      expect(antenna2.updateIceAccumulation).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    let updateHandler: (dt: number) => void;

    beforeEach(() => {
      mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === Events.UPDATE) {
          updateHandler = handler;
        }
      });
    });

    it('should reset accumulation time when no weather and no ice', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [];

      // Antenna with no ice and heater off
      mockAntennas = [createMockAntenna('antenna-1', false, 0)];
      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: mockAntennas });

      const manager = WeatherManager.getInstance();

      setScenarioElapsed(60000);
      updateHandler(60000);

      expect(manager.getIceAccumulationTime('antenna-1')).toBe(0);
    });

    it('should handle event at exactly start time boundary', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor',
          startTime: 10,
          duration: 50,
          linkMarginDegradation: 1,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      WeatherManager.getInstance();

      // Exactly at start time
      setScenarioElapsed(10000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'event-1' }));
    });

    it('should handle event at exactly end time boundary', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor',
          startTime: 0,
          duration: 10,
          linkMarginDegradation: 1,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      WeatherManager.getInstance();

      // Activate
      setScenarioElapsed(5000);
      updateHandler(5000);

      // Exactly at end time (startTime + duration = 10)
      setScenarioElapsed(10000);
      updateHandler(5000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_ENDED, expect.objectContaining({ id: 'event-1' }));
    });

    it('should handle zero duration event', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      mockScenarioSettings.weatherEvents = [
        {
          id: 'event-1',
          groundStationId: 'gs-1',
          type: 'snow',
          severity: 'minor',
          startTime: 5,
          duration: 0,
          linkMarginDegradation: 1,
        },
      ];

      mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [] });

      const manager = WeatherManager.getInstance();

      // Event should never be active due to zero duration
      setScenarioElapsed(5000);
      updateHandler(5000);

      // Should not emit started event
      expect(mockEventBusInstance.emit).not.toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.anything());
    });
  });

  describe('Type Exports', () => {
    it('should export IceAccumulationConfig interface', () => {
      const config: IceAccumulationConfig = {
        maxDegradation_dB: 5,
        timeConstant_s: 1200,
      };
      expect(config.maxDegradation_dB).toBe(5);
      expect(config.timeConstant_s).toBe(1200);
    });

    it('should export WeatherEventRuntime interface', () => {
      const event: WeatherEventRuntime = {
        id: 'test',
        groundStationId: 'gs-1',
        type: 'snow',
        severity: 'minor',
        startTime: 0,
        duration: 100,
        linkMarginDegradation: 1,
        isActive: true,
      };
      expect(event.isActive).toBe(true);
    });
  });
});

describe('WeatherManager rain rate (phase 16 E5)', () => {
  let updateHandler: (dt: number) => void;

  beforeEach(() => {
    WeatherManager.destroy();
    vi.clearAllMocks();
    mockScenarioSettings.weatherEvents = [];
    mockAntennas = [];
    mockGroundStations.length = 0;
    mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
      if (event === Events.UPDATE) {
        updateHandler = handler;
      }
    });
  });

  afterEach(() => {
    WeatherManager.destroy();
    vi.useRealTimers();
  });

  const rainEvent = (overrides: Partial<WeatherEventData> = {}): WeatherEventData => ({
    id: 'rain-1',
    groundStationId: 'gs-1',
    type: 'rain',
    severity: 'moderate',
    startTime: 0,
    duration: 1200,
    linkMarginDegradation: 3,
    ...overrides,
  });

  it('derives the peak rate from severity and ramps in over 15 % of the event', () => {
    const event = { ...rainEvent(), isActive: true };
    expect(WeatherManager.rainRateAt(event, 90)).toBeCloseTo(6, 6);
    expect(WeatherManager.rainRateAt(event, 600)).toBe(12);
    expect(WeatherManager.rainRateAt(event, 1200 - 90)).toBeCloseTo(6, 6);
    expect(WeatherManager.rainRateAt(event, 1200)).toBe(0);
    expect(WeatherManager.rainRateAt(event, -1)).toBe(0);
  });

  it('honours an authored rain rate, makes a storm one step heavier, and ignores non-rain types', () => {
    expect(WeatherManager.rainRateAt({ ...rainEvent({ rainRateMmPerHour: 20 }), isActive: true }, 600)).toBe(20);
    expect(WeatherManager.rainRateAt({ ...rainEvent({ type: 'storm', severity: 'severe' }), isActive: true }, 600)).toBe(50);
    expect(WeatherManager.rainRateAt({ ...rainEvent({ type: 'storm', severity: 'minor' }), isActive: true }, 600)).toBe(12);
    expect(WeatherManager.rainRateAt({ ...rainEvent({ type: 'snow' }), isActive: true }, 600)).toBe(0);
    expect(WeatherManager.rainRateAt({ ...rainEvent({ type: 'sun-transit' }), isActive: true }, 600)).toBe(0);
  });

  it('places the peak at the transit midpoint, the rain ramp-down and the end of anything else (Phase 29 D10)', () => {
    expect(WeatherManager.peakSeconds({ ...rainEvent({ type: 'sun-transit', startTime: 100, duration: 300 }), isActive: true })).toBe(250);
    expect(WeatherManager.peakSeconds({ ...rainEvent(), isActive: true })).toBe(1200 - 180);
    expect(WeatherManager.peakSeconds({ ...rainEvent({ type: 'ice' }), isActive: true })).toBe(1200);
  });

  it('reports a sun transit peaked only once the clock passes its midpoint (nats-r4-s17-F1)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    mockScenarioSettings.weatherEvents = [rainEvent({ id: 'sun', type: 'sun-transit', startTime: 0, duration: 300 })];
    const manager = WeatherManager.getInstance();

    setScenarioElapsed(100_000);
    expect(manager.hasEventPeaked('sun')).toBe(false);
    expect(manager.getSecondsUntilEventPeaks('sun')).toBeCloseTo(50, 3);
    expect(manager.hasEventPeaked('sun', 10)).toBe(false);

    setScenarioElapsed(151_000);
    expect(manager.hasEventPeaked('sun')).toBe(true);
    expect(manager.hasEventPeaked('sun', 10)).toBe(false);
    expect(manager.getSecondsUntilEventPeaks('unknown')).toBeNull();
  });

  it('pushes the rate to the affected station only and writes zero when the front has passed', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    mockScenarioSettings.weatherEvents = [rainEvent()];
    const wet = createMockAntenna('wet-1');
    const dry = createMockAntenna('dry-1');
    mockAntennas = [wet, dry];
    mockGroundStations.push({ state: { id: 'gs-1' }, antennas: [wet] }, { state: { id: 'gs-2' }, antennas: [dry] });

    WeatherManager.getInstance();

    setScenarioElapsed(600_000);
    updateHandler(1000);
    expect(wet.updateRainRate).toHaveBeenLastCalledWith(12);
    expect(dry.updateRainRate).not.toHaveBeenCalled();

    setScenarioElapsed(1_300_000);
    updateHandler(1000);
    expect(wet.updateRainRate).toHaveBeenLastCalledWith(0);
    expect(wet.state.rainRate_mmh).toBe(0);
  });
});

describe('WeatherManager objective-anchored events', () => {
  let updateHandler: (dt: number) => void;

  beforeEach(() => {
    WeatherManager.destroy();
    vi.clearAllMocks();
    mockScenarioSettings.weatherEvents = [];
    mockAntennas = [];
    mockGroundStations.length = 0;
    mockObjectiveStates.clear();
    mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
      if (event === Events.UPDATE) {
        updateHandler = handler;
      }
    });
  });

  afterEach(() => {
    WeatherManager.destroy();
  });

  // Scenario 17's transit: anchored to 'observe-onset', 20 s after it comes up
  const setupTransit = () => {
    mockScenarioSettings.weatherEvents = [
      {
        id: 'tm1-sun-transit',
        groundStationId: 'VT-01',
        type: 'sun-transit',
        severity: 'severe',
        startAfterObjectiveId: 'observe-onset',
        startTime: 20,
        duration: 300,
        linkMarginDegradation: 12,
      },
    ];
    const antenna = createMockAntenna('vt01-ant');
    mockAntennas = [antenna];
    mockGroundStations.push({ state: { id: 'VT-01' }, antennas: [antenna] });
    mockObjectiveStates.set('observe-onset', { isActive: false, isCompleted: false });
    const manager = WeatherManager.getInstance();
    return { antenna, manager };
  };

  const tickAt = (elapsedMs: number) => {
    setScenarioElapsed(elapsedMs);
    updateHandler(1000);
  };

  it('stays dormant however late the player is until the anchor objective activates', () => {
    const { antenna, manager } = setupTransit();

    // The old mission-start window (T+300..600) passes with the objective not yet up
    for (const s of [0, 300, 450, 600, 900, 1800]) {
      tickAt(s * 1000);
      expect(antenna.state.skyNoiseDegradation_dB).toBe(0);
    }
    expect(manager.getActiveWeatherEvents('VT-01')).toHaveLength(0);
    expect(mockEventBusInstance.emit).not.toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.anything());
  });

  it('starts startTime seconds after the anchor activates and runs its full profile', () => {
    const { antenna } = setupTransit();
    tickAt(1_800_000);

    // Player reaches the onset objective 30 minutes in
    mockObjectiveStates.set('observe-onset', { isActive: true, isCompleted: false });
    tickAt(1_800_000); // anchors at 1800 s: window 1820..2120
    tickAt(1_810_000);
    expect(antenna.state.skyNoiseDegradation_dB).toBe(0);

    tickAt(1_820_000 + 150_000); // mid-window: sin^2 peak
    expect(antenna.state.skyNoiseDegradation_dB).toBeCloseTo(12, 6);
    expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_STARTED, expect.objectContaining({ id: 'tm1-sun-transit', startTime: 1820 }));

    tickAt(2_130_000);
    expect(antenna.state.skyNoiseDegradation_dB).toBe(0);
    expect(mockEventBusInstance.emit).toHaveBeenCalledWith(Events.WEATHER_EVENT_ENDED, expect.objectContaining({ id: 'tm1-sun-transit' }));
  });

  it('anchors only once, even when the objective completes and deactivates', () => {
    const { antenna } = setupTransit();
    mockObjectiveStates.set('observe-onset', { isActive: true, isCompleted: false });
    tickAt(100_000); // window 120..420

    mockObjectiveStates.set('observe-onset', { isActive: false, isCompleted: true });
    tickAt(270_000);
    expect(antenna.state.skyNoiseDegradation_dB).toBeCloseTo(12, 6);
  });

  it('anchors on an objective restored as already complete (checkpoint after a refresh)', () => {
    const { antenna } = setupTransit();
    mockObjectiveStates.set('observe-onset', { isActive: false, isCompleted: true });
    tickAt(500_000); // window 520..820
    tickAt(670_000);
    expect(antenna.state.skyNoiseDegradation_dB).toBeCloseTo(12, 6);
  });

  it('leaves unanchored events on the mission-start schedule', () => {
    mockScenarioSettings.weatherEvents = [
      { id: 'plain', groundStationId: 'VT-01', type: 'sun-transit', severity: 'severe', startTime: 300, duration: 300, linkMarginDegradation: 12 },
    ];
    const antenna = createMockAntenna('vt01-ant');
    mockAntennas = [antenna];
    mockGroundStations.push({ state: { id: 'VT-01' }, antennas: [antenna] });
    WeatherManager.getInstance();

    tickAt(450_000);
    expect(antenna.state.skyNoiseDegradation_dB).toBeCloseTo(12, 6);
  });
});

describe('WeatherManager restore from checkpoint (#244)', () => {
  let updateHandler: (dt: number) => void;

  const tickAt = (elapsedMs: number) => {
    setScenarioElapsed(elapsedMs);
    updateHandler(1000);
  };

  beforeEach(() => {
    WeatherManager.destroy();
    vi.clearAllMocks();
    mockAntennas = [];
    mockGroundStations.length = 0;
    mockObjectiveStates.clear();
    mockEventBusInstance.on.mockImplementation((event: string, handler: any) => {
      if (event === Events.UPDATE) updateHandler = handler;
    });
    mockScenarioSettings.weatherEvents = [
      { id: 'w-expired', groundStationId: 'VT-01', type: 'rain', severity: 'minor', startTime: 10, duration: 20, linkMarginDegradation: 1 },
      { id: 'w-running', groundStationId: 'VT-01', type: 'rain', severity: 'minor', startTime: 100, duration: 200, linkMarginDegradation: 1 },
      { id: 'w-pending', groundStationId: 'VT-01', type: 'rain', severity: 'minor', startTime: 1000, duration: 60, linkMarginDegradation: 1 },
      { id: 'w-anchored', groundStationId: 'VT-01', type: 'rain', severity: 'minor', startTime: 30, duration: 60, linkMarginDegradation: 1, startAfterObjectiveId: 'gate' },
    ];
    mockGroundStations.push({ state: { id: 'VT-01' }, antennas: [] });
  });

  afterEach(() => {
    WeatherManager.destroy();
  });

  const startedIds = () =>
    mockEventBusInstance.emit.mock.calls.filter(([name]: [string]) => name === Events.WEATHER_EVENT_STARTED).map(([, event]: [string, { id: string }]) => event.id);

  it('restores pending, running and expired events; expired events do not replay, pending keep their anchors', () => {
    const original = WeatherManager.getInstance();
    tickAt(150_000); // w-expired ran and ended, w-running is live
    const saved = JSON.parse(JSON.stringify(original.getCheckpointState()));
    expect(saved.events.find((e: { id: string }) => e.id === 'w-running').isActive).toBe(true);

    WeatherManager.destroy();
    const restored = WeatherManager.getInstance();
    mockEventBusInstance.emit.mockClear();
    restored.restoreCheckpointState(saved);
    restored.refreshRestoredConditions();
    tickAt(160_000);

    expect(startedIds()).not.toContain('w-expired');
    // the running event was restored active, so it is not started a second time
    expect(startedIds()).not.toContain('w-running');
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).toEqual(['w-running']);
    const after = restored.getCheckpointState();
    expect(after.events.find((e) => e.id === 'w-pending')).toMatchObject({ startTime: 1000, isActive: false, isAwaitingAnchor: false });
    expect(after.events.find((e) => e.id === 'w-anchored')).toMatchObject({ isActive: false, isAwaitingAnchor: true });

    // the expired event stays quiet through the rest of its former window and long after
    tickAt(400_000);
    expect(startedIds()).not.toContain('w-expired');
    expect(restored.getActiveWeatherEvents('VT-01')).toHaveLength(0);
  });

  const saveAndRestore = (saveAtMs: number) => {
    const original = WeatherManager.getInstance();
    tickAt(saveAtMs);
    const saved = JSON.parse(JSON.stringify(original.getCheckpointState()));
    WeatherManager.destroy();
    const restored = WeatherManager.getInstance();
    mockEventBusInstance.emit.mockClear();
    restored.restoreCheckpointState(saved);
    restored.refreshRestoredConditions();
    return { restored, saved };
  };

  it('keeps the original end across restore: 299 s still active, 301 s ended (not restarted at the restore point)', () => {
    const { restored } = saveAndRestore(150_000); // w-running 100..300, 150 s elapsed, 150 s left
    tickAt(299_000);
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).toEqual(['w-running']);
    tickAt(301_000);
    expect(restored.getActiveWeatherEvents('VT-01')).toHaveLength(0);
    expect(startedIds()).not.toContain('w-running');
  });

  it('a save taken at 101 s resumes with 199 s left; one past the end (300 s) does not replay', () => {
    const { restored } = saveAndRestore(101_000);
    tickAt(299_000);
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).toEqual(['w-running']);
    tickAt(300_000);
    tickAt(301_000);
    expect(restored.getActiveWeatherEvents('VT-01')).toHaveLength(0);
    expect(startedIds()).not.toContain('w-running');
  });

  it('a live objective anchor survives restore: w-anchored starts at anchor + 30 s, not at the restore point', () => {
    mockObjectiveStates.set('gate', { isActive: true, isCompleted: false });
    const original = WeatherManager.getInstance();
    tickAt(120_000); // gate live at 120 s -> w-anchored start 150 s, end 210 s
    tickAt(130_000);
    const saved = JSON.parse(JSON.stringify(original.getCheckpointState()));
    expect(saved.anchors).not.toEqual({});
    expect(saved.events.find((e: { id: string }) => e.id === 'w-anchored')).toMatchObject({ startTime: 150, isActive: false, isAwaitingAnchor: false });

    WeatherManager.destroy();
    mockObjectiveStates.set('gate', { isActive: false, isCompleted: false });
    const restored = WeatherManager.getInstance();
    mockEventBusInstance.emit.mockClear();
    restored.restoreCheckpointState(saved);
    restored.refreshRestoredConditions();

    tickAt(145_000);
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).not.toContain('w-anchored');
    tickAt(160_000);
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).toContain('w-anchored');
    tickAt(215_000);
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).not.toContain('w-anchored');
  });

  it('a pending event still fires on its original schedule after restore', () => {
    const { restored } = saveAndRestore(150_000);
    tickAt(999_000);
    expect(startedIds()).not.toContain('w-pending');
    tickAt(1_001_000);
    expect(startedIds()).toContain('w-pending');
    expect(restored.getActiveWeatherEvents('VT-01').map((e) => e.id)).toEqual(['w-pending']);
  });
});
