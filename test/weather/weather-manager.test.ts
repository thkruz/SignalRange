import { vi } from 'vitest';
import { Events, WeatherEventData } from '../../src/events/events';
import { IceAccumulationConfig, WeatherEventRuntime, WeatherManager } from '../../src/weather/weather-manager';

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
  },
  updateIceAccumulation: vi.fn((value: number) => {
    // Update the mock state when called
    mockAntennas.find(a => a.state.uuid === uuid)!.state.iceAccumulation_dB = value;
  }),
  updateSkyNoiseDegradation: vi.fn((value: number) => {
    // Update the mock state when called (sun-transit sky-noise path)
    mockAntennas.find(a => a.state.uuid === uuid)!.state.skyNoiseDegradation_dB = value;
  }),
});

let mockAntennas: ReturnType<typeof createMockAntenna>[] = [];
const mockGroundStations: { state: { id: string }; antennas: typeof mockAntennas }[] = [];

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: mockGroundStations,
    })),
  },
}));

describe('WeatherManager', () => {
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

      expect(mockEventBusInstance.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });

    it('should unregister UPDATE event listener on destroy', () => {
      WeatherManager.getInstance();
      WeatherManager.destroy();

      expect(mockEventBusInstance.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
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
      vi.setSystemTime(startTime + 5000);

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
      vi.setSystemTime(startTime + 15000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.objectContaining({ id: 'event-1', isActive: true })
      );
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
      vi.setSystemTime(startTime + 8000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.objectContaining({ id: 'event-1' })
      );

      // Deactivate the event
      vi.setSystemTime(startTime + 20000); // Past 5 + 10 = 15 seconds
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_ENDED,
        expect.objectContaining({ id: 'event-1', isActive: false })
      );
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
      vi.setSystemTime(startTime + 10000);
      updateHandler(1000);

      // Clear emit mock
      mockEventBusInstance.emit.mockClear();

      // Call update again without state change
      vi.setSystemTime(startTime + 11000);
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
      vi.setSystemTime(startTime + 15000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.objectContaining({ id: 'event-1' })
      );

      // First event ends, second not started yet
      vi.setSystemTime(startTime + 45000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_ENDED,
        expect.objectContaining({ id: 'event-1' })
      );

      // Activate second event
      vi.setSystemTime(startTime + 55000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.objectContaining({ id: 'event-2' })
      );
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
      vi.setSystemTime(startTime + 5000);
      updateHandler(5000); // 5 second dt

      // Check that updateIceAccumulation was called
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalled();

      // Verify exponential formula: ice = maxIce * (1 - e^(-t/tau))
      // For moderate: maxIce = 5dB, tau = 1200s
      // After 5s: ice = 5 * (1 - e^(-5/1200)) ≈ 0.0208 dB
      const config = WeatherManager.SEVERITY_CONFIG['moderate'];
      const expectedIce = config.maxDegradation_dB * (1 - Math.exp(-5 / config.timeConstant_s));

      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(
        expect.closeTo(expectedIce, 4)
      );
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

      vi.setSystemTime(startTime + 60000);
      updateHandler(60000);

      // updateIceAccumulation should NOT be called when heater is ON and no existing ice
      expect(mockAntennas[0].updateIceAccumulation).not.toHaveBeenCalled();
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

      vi.setSystemTime(startTime + 60000);
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

      vi.setSystemTime(startTime + 10000);
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

      vi.setSystemTime(startTime + 10000);
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
      vi.setSystemTime(startTime + 10000);
      updateHandler(10000);

      expect(manager.getIceAccumulationTime('antenna-1')).toBe(10);

      // Second update
      vi.setSystemTime(startTime + 25000);
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
      vi.setSystemTime(startTime + 60000);
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
      vi.setSystemTime(startTime + 60000);
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
      vi.setSystemTime(startTime + 60000);
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
      vi.setSystemTime(startTime + 30000);
      updateHandler(30000);

      // Ice should be melted by 0.5 dB (30s * 1/60 dB/s)
      expect(mockAntennas[0].updateIceAccumulation).toHaveBeenCalledWith(2.5);

      // Since ratio = 2.5/2 = 1.25 >= 1, the accumulation time recalculation
      // should be skipped (we can't take log of non-positive number)
      // The accumulation time should not be updated (remains at 0 from creation)
      expect(manager.getIceAccumulationTime('antenna-1')).toBe(0);
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

        mockGroundStations.push(
          { state: { id: 'gs-1' }, antennas: [] },
          { state: { id: 'gs-2' }, antennas: [] }
        );

        const manager = WeatherManager.getInstance();

        // Activate events
        vi.setSystemTime(startTime + 50000);
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

        vi.setSystemTime(startTime + 10000);
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

        vi.setSystemTime(startTime + 10000);
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

        vi.setSystemTime(startTime + 10000);
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

        vi.setSystemTime(startTime + 10000);
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

        vi.setSystemTime(startTime + 10000);
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

        vi.setSystemTime(startTime + 10000);
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

      vi.setSystemTime(startTime + 60000);
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

      mockGroundStations.push(
        { state: { id: 'gs-1' }, antennas: [antenna1] },
        { state: { id: 'gs-2' }, antennas: [antenna2] }
      );

      WeatherManager.getInstance();

      vi.setSystemTime(startTime + 60000);
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

      vi.setSystemTime(startTime + 60000);
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
      vi.setSystemTime(startTime + 10000);
      updateHandler(1000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.objectContaining({ id: 'event-1' })
      );
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
      vi.setSystemTime(startTime + 5000);
      updateHandler(5000);

      // Exactly at end time (startTime + duration = 10)
      vi.setSystemTime(startTime + 10000);
      updateHandler(5000);

      expect(mockEventBusInstance.emit).toHaveBeenCalledWith(
        Events.WEATHER_EVENT_ENDED,
        expect.objectContaining({ id: 'event-1' })
      );
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
      vi.setSystemTime(startTime + 5000);
      updateHandler(5000);

      // Should not emit started event
      expect(mockEventBusInstance.emit).not.toHaveBeenCalledWith(
        Events.WEATHER_EVENT_STARTED,
        expect.anything()
      );
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
