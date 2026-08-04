import { vi } from 'vitest';
import { GroundStation } from '../../../src/assets/ground-station/ground-station';
import { createGroundStation } from '../../../src/assets/ground-station/ground-station-factory';
import type { GroundStationConfig } from '../../../src/assets/ground-station/ground-station-state';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { SimulationManager } from '../../../src/simulation/simulation-manager';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Mock equipment modules to avoid complex DOM setup
vi.mock('../../../src/equipment/antenna/antenna-ui-headless', () => ({
  AntennaUIHeadless: vi.fn(function (containerId, configId, initialState, teamId) {
    return {
      containerId,
      configId,
      teamId,
      state: { uuid: 'mock-antenna-uuid', isPowered: true, ...initialState },
      transmitters: [],
      attachRfFrontEnd: vi.fn(),
      attachStationLocation: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/equipment/rf-front-end/rf-front-end-factory', () => ({
  createRFFrontEnd: vi.fn(function (containerId, config, type) {
    return {
      containerId,
      type,
      state: { uuid: 'mock-rf-uuid', isPowered: true, ...config },
      connectAntenna: vi.fn(),
      connectTransmitter: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer', () => ({
  RealTimeSpectrumAnalyzer: vi.fn(function (containerId, _rfFrontEnd, config, teamId) {
    return {
      containerId,
      teamId,
      state: { uuid: 'mock-spec-uuid', ...config },
      sync: vi.fn(),
      destroy: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/equipment/transmitter/transmitter', () => {
  const mockTransmitter = vi.fn(function (containerId: string, config: any, teamId: number) {
    return {
      containerId,
      teamId,
      state: { uuid: 'mock-tx-uuid', isPowered: true, ...config },
      sync: vi.fn(),
      destroy: vi.fn(),
    };
  });
  (mockTransmitter as any).getDefaultState = vi.fn().mockReturnValue({
    uuid: 'default-tx-uuid',
    isPowered: true,
    modems: [],
  });
  return { Transmitter: mockTransmitter };
});

vi.mock('../../../src/equipment/receiver/receiver', () => {
  const mockReceiver = vi.fn(function (containerId: string, antennas: any[], config: any, teamId: number) {
    return {
      containerId,
      teamId,
      antennas,
      state: { uuid: 'mock-rx-uuid', isPowered: true, ...config },
      connectRfFrontEnd: vi.fn(),
      sync: vi.fn(),
      destroy: vi.fn(),
    };
  });
  (mockReceiver as any).getDefaultState = vi.fn().mockReturnValue({
    uuid: 'default-rx-uuid',
    isPowered: true,
    modems: [],
  });
  return { Receiver: mockReceiver };
});

describe('GroundStation', () => {
  let groundStation: GroundStation;
  let mockConfig: GroundStationConfig;

  beforeEach(() => {
    vi.resetModules();

    // Create a clean DOM root
    document.body.innerHTML = '<div id="test-root"></div>';

    // Set up window.signalRange for SimulationManager
    (window as any).signalRange = (window as any).signalRange || {};

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    // Clear simulation manager ground stations
    SimulationManager.getInstance().groundStations = [];

    // Create mock config
    mockConfig = {
      id: 'TEST-01',
      name: 'Test Ground Station',
      location: {
        latitude: 25.7617,
        longitude: -80.1918,
        elevation: 5,
      },
      antennas: ['STANDARD_9M', 'STANDARD_9M'],
      rfFrontEnds: [
        {},
        {},
      ],
      spectrumAnalyzers: [
        {},
        {},
      ],
      transmitters: [
        {},
        {},
      ],
      receivers: [
        {},
        {},
      ],
      teamId: 1,
      serverId: 1,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Constructor', () => {
    it('should create a ground station with a unique uuid', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.uuid).toBeDefined();
      expect(groundStation.uuid.length).toBeGreaterThan(0);
    });

    it('should initialize state from config', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.state.id).toBe('TEST-01');
      expect(groundStation.state.name).toBe('Test Ground Station');
      expect(groundStation.state.location.latitude).toBe(25.7617);
      expect(groundStation.state.location.longitude).toBe(-80.1918);
      expect(groundStation.state.location.elevation).toBe(5);
    });

    it('should default isOperational to true when not specified', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.state.isOperational).toBe(true);
    });

    it('should respect explicit isOperational value', () => {
      mockConfig.isOperational = false;
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.state.isOperational).toBe(false);
    });

    it('should initialize empty equipment arrays in state', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.state.equipment.antennas).toEqual([]);
      expect(groundStation.state.equipment.rfFrontEnds).toEqual([]);
      expect(groundStation.state.equipment.spectrumAnalyzers).toEqual([]);
      expect(groundStation.state.equipment.transmitters).toEqual([]);
      expect(groundStation.state.equipment.receivers).toEqual([]);
    });

    it('should register UPDATE event listener', () => {
      const onSpy = vi.spyOn(EventBus.getInstance(), 'on');

      groundStation = new GroundStation(mockConfig);

      expect(onSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));

      onSpy.mockRestore();
    });

    it('should register with SimulationManager', () => {
      groundStation = new GroundStation(mockConfig);

      expect(SimulationManager.getInstance().groundStations).toContain(groundStation);
    });

    it('should not create equipment in constructor (deferred)', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.antennas).toHaveLength(0);
      expect(groundStation.rfFrontEnds).toHaveLength(0);
      expect(groundStation.spectrumAnalyzers).toHaveLength(0);
      expect(groundStation.transmitters).toHaveLength(0);
      expect(groundStation.receivers).toHaveLength(0);
    });

    it('should set uuid in state to match uuid property', () => {
      groundStation = new GroundStation(mockConfig);

      expect(groundStation.state.uuid).toBe(groundStation.uuid);
    });
  });

  describe('initializeEquipment', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
    });

    it('should create antennas from config', () => {
      groundStation.initializeEquipment();

      expect(groundStation.antennas).toHaveLength(2);
    });

    it('should create RF front-ends from config', () => {
      groundStation.initializeEquipment();

      expect(groundStation.rfFrontEnds).toHaveLength(2);
    });

    it('should create spectrum analyzers', () => {
      groundStation.initializeEquipment();

      // Default creates 4 spectrum analyzers (2 per RF front-end)
      expect(groundStation.spectrumAnalyzers.length).toBeGreaterThan(0);
    });

    it('should create transmitters from config', () => {
      groundStation.initializeEquipment();

      expect(groundStation.transmitters).toHaveLength(2);
    });

    it('should create receivers from config', () => {
      groundStation.initializeEquipment();

      expect(groundStation.receivers).toHaveLength(2);
    });

    it('should prevent double initialization', () => {
      groundStation.initializeEquipment();
      const initialAntennaCount = groundStation.antennas.length;

      groundStation.initializeEquipment();

      expect(groundStation.antennas.length).toBe(initialAntennaCount);
    });

    it('should wire antenna to RF front-end', () => {
      groundStation.initializeEquipment();

      const rfFrontEnd = groundStation.rfFrontEnds[0];
      expect(rfFrontEnd.connectAntenna).toHaveBeenCalled();
    });

    it('should attach RF front-end to antenna', () => {
      groundStation.initializeEquipment();

      const antenna = groundStation.antennas[0];
      expect(antenna.attachRfFrontEnd).toHaveBeenCalled();
    });

    it('should connect transmitters to RF front-ends', () => {
      groundStation.initializeEquipment();

      const rfFrontEnd = groundStation.rfFrontEnds[0];
      expect(rfFrontEnd.connectTransmitter).toHaveBeenCalled();
    });

    it('should add transmitters to antennas', () => {
      groundStation.initializeEquipment();

      const antenna = groundStation.antennas[0];
      expect(antenna.transmitters.length).toBeGreaterThan(0);
    });

    it('should connect receivers to RF front-ends', () => {
      groundStation.initializeEquipment();

      const receiver = groundStation.receivers[0];
      expect(receiver.connectRfFrontEnd).toHaveBeenCalled();
    });

    it('should use teamId from config', () => {
      mockConfig.teamId = 5;
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      const antenna = groundStation.antennas[0] as any;
      expect(antenna.teamId).toBe(5);
    });

    it('should default teamId to 1 when not specified', () => {
      delete mockConfig.teamId;
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      const antenna = groundStation.antennas[0] as any;
      expect(antenna.teamId).toBe(1);
    });

    it('should apply initial antenna states if provided', () => {
      mockConfig.antennasState = [
        { isPowered: false },
        { isPowered: true },
      ];
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      const antenna = groundStation.antennas[0];
      expect(antenna.state.isPowered).toBe(false);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();
    });

    it('should aggregate antenna states', () => {
      groundStation.update();

      expect(groundStation.state.equipment.antennas).toHaveLength(2);
    });

    it('should aggregate RF front-end states', () => {
      groundStation.update();

      expect(groundStation.state.equipment.rfFrontEnds).toHaveLength(2);
    });

    it('should aggregate spectrum analyzer states', () => {
      groundStation.update();

      expect(groundStation.state.equipment.spectrumAnalyzers).toBeDefined();
    });

    it('should aggregate transmitter states', () => {
      groundStation.update();

      expect(groundStation.state.equipment.transmitters).toHaveLength(2);
    });

    it('should aggregate receiver states', () => {
      groundStation.update();

      expect(groundStation.state.equipment.receivers).toHaveLength(2);
    });

    it('should update lastStateString when state changes', () => {
      const initialStateString = groundStation.lastStateString;

      groundStation.update();

      expect(groundStation.lastStateString).not.toBe(initialStateString);
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();
    });

    it('should ignore sync with different uuid', () => {
      const originalState = { ...groundStation.state };

      groundStation.sync({
        uuid: 'different-uuid',
        name: 'Changed Name',
      });

      expect(groundStation.state.name).toBe(originalState.name);
    });

    it('should sync state with matching uuid', () => {
      groundStation.sync({
        uuid: groundStation.uuid,
        name: 'Updated Ground Station',
      });

      expect(groundStation.state.name).toBe('Updated Ground Station');
    });

    it('should sync antenna states', () => {
      const antennaState = { isPowered: false };

      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          antennas: [antennaState],
        },
      });

      expect(groundStation.antennas[0].sync).toHaveBeenCalledWith(antennaState);
    });

    it('should sync RF front-end states', () => {
      const rfState = { teamId: 2 };

      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          rfFrontEnds: [rfState],
        },
      });

      expect(groundStation.rfFrontEnds[0].sync).toHaveBeenCalledWith(rfState);
    });

    it('should sync spectrum analyzer states', () => {
      const specState = { isPaused: true };

      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          spectrumAnalyzers: [specState],
        },
      });

      expect(groundStation.spectrumAnalyzers[0].sync).toHaveBeenCalledWith(specState);
    });

    it('should sync transmitter states', () => {
      const txState = { activeModem: 2 };

      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          transmitters: [txState],
        },
      });

      expect(groundStation.transmitters[0].sync).toHaveBeenCalledWith(txState);
    });

    it('should sync receiver states', () => {
      const rxState = { activeModem: 2 };

      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          receivers: [rxState],
        },
      });

      expect(groundStation.receivers[0].sync).toHaveBeenCalledWith(rxState);
    });

    it('should handle partial equipment sync', () => {
      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          antennas: [{ isPowered: false }],
          // Other equipment arrays not provided
        },
      });

      expect(groundStation.antennas[0].sync).toHaveBeenCalled();
      // Other equipment should not have sync called
    });

    it('should handle sync with more equipment states than instances', () => {
      groundStation.sync({
        uuid: groundStation.uuid,
        equipment: {
          antennas: [
            { isPowered: false },
            { isPowered: true },
            { isPowered: true }, // Extra state - no antenna for this
          ],
        },
      });

      // Should not throw, just sync existing equipment
      expect(groundStation.antennas[0].sync).toHaveBeenCalled();
      expect(groundStation.antennas[1].sync).toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
    });

    it('should emit events through EventBus', () => {
      const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');

      groundStation.emit(Events.UPDATE, 16 as any);

      expect(emitSpy).toHaveBeenCalledWith(Events.UPDATE, 16);

      emitSpy.mockRestore();
    });

    it('should pass arguments to emit', () => {
      const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');

      groundStation.emit(Events.SYNC);

      expect(emitSpy).toHaveBeenCalledWith(Events.SYNC);

      emitSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
    });

    it('should unsubscribe from UPDATE event', () => {
      const offSpy = vi.spyOn(EventBus.getInstance(), 'off');

      groundStation.destroy();

      expect(offSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));

      offSpy.mockRestore();
    });
  });

  describe('Equipment creation with defaults', () => {
    it('should create 4 transmitters by default when not specified', () => {
      delete mockConfig.transmitters;
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      expect(groundStation.transmitters).toHaveLength(4);
    });

    it('should create 4 receivers by default when not specified', () => {
      delete mockConfig.receivers;
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      expect(groundStation.receivers).toHaveLength(4);
    });

    it('should create spectrum analyzers with null config fallback', () => {
      delete mockConfig.spectrumAnalyzers;
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();

      // Should still create spectrum analyzers with empty config
      expect(groundStation.spectrumAnalyzers.length).toBeGreaterThan(0);
    });
  });

  describe('update state change detection', () => {
    beforeEach(() => {
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();
    });

    it('should not update lastStateString when state has not changed', () => {
      // First update
      groundStation.update();
      const firstStateString = groundStation.lastStateString;

      // Simulate no state change by keeping same equipment states
      groundStation.update();
      const secondStateString = groundStation.lastStateString;

      // State strings should be equal since nothing changed
      expect(secondStateString).toBe(firstStateString);
    });
  });

  describe('Equipment wiring with missing RF front-ends', () => {
    it('should handle more antennas than RF front-ends gracefully', () => {
      // Create config with more antennas than RF front-ends
      const configWithMismatch: GroundStationConfig = {
        ...mockConfig,
        antennas: ['STANDARD_9M', 'STANDARD_9M', 'STANDARD_9M'],
        rfFrontEnds: [{}],
      };

      groundStation = new GroundStation(configWithMismatch);

      // Should not throw
      expect(() => groundStation.initializeEquipment()).not.toThrow();

      // Third antenna should not have RF front-end wired
      expect(groundStation.antennas).toHaveLength(3);
      expect(groundStation.rfFrontEnds).toHaveLength(1);
    });

    it('should skip spectrum analyzer creation when RF front-end is missing', () => {
      // Create config with 4 spectrum analyzers but only 1 RF front-end
      const configWithMismatch: GroundStationConfig = {
        ...mockConfig,
        antennas: ['STANDARD_9M'],
        rfFrontEnds: [{}],
        spectrumAnalyzers: [
          {},
          {},
          {}, // Would need rfFrontEnd[1]
          {}, // Would need rfFrontEnd[1]
        ],
      };

      groundStation = new GroundStation(configWithMismatch);
      groundStation.initializeEquipment();

      // Only 2 spectrum analyzers should be created (for rfFrontEnd[0])
      expect(groundStation.spectrumAnalyzers).toHaveLength(2);
    });
  });

  describe('Equipment wiring logic', () => {
    beforeEach(() => {
      mockConfig.transmitters = [
        {},
        {},
        {},
        {},
      ];
      mockConfig.receivers = [
        {},
        {},
        {},
        {},
      ];
      groundStation = new GroundStation(mockConfig);
      groundStation.initializeEquipment();
    });

    it('should wire first two transmitters to first RF front-end', () => {
      const rfFrontEnd1 = groundStation.rfFrontEnds[0];

      // connectTransmitter should have been called for TX 1 and 2
      expect(rfFrontEnd1.connectTransmitter).toHaveBeenCalledTimes(2);
    });

    it('should wire transmitters 3 and 4 to second RF front-end', () => {
      const rfFrontEnd2 = groundStation.rfFrontEnds[1];

      // connectTransmitter should have been called for TX 3 and 4
      expect(rfFrontEnd2.connectTransmitter).toHaveBeenCalledTimes(2);
    });

    it('should wire first two receivers to first RF front-end', () => {
      const receiver1 = groundStation.receivers[0];
      const receiver2 = groundStation.receivers[1];

      expect(receiver1.connectRfFrontEnd).toHaveBeenCalled();
      expect(receiver2.connectRfFrontEnd).toHaveBeenCalled();
    });

    it('should add all transmitters to all antennas', () => {
      const antenna1 = groundStation.antennas[0];
      const antenna2 = groundStation.antennas[1];

      expect(antenna1.transmitters).toHaveLength(4);
      expect(antenna2.transmitters).toHaveLength(4);
    });
  });
});

describe('createGroundStation factory', () => {
  let mockConfig: GroundStationConfig;

  beforeEach(() => {
    // Set up window.signalRange for SimulationManager
    (window as any).signalRange = (window as any).signalRange || {};

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    // Clear simulation manager ground stations
    SimulationManager.getInstance().groundStations = [];

    mockConfig = {
      id: 'FACTORY-01',
      name: 'Factory Test Station',
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        elevation: 10,
      },
      antennas: ['STANDARD_9M'],
      rfFrontEnds: [{}],
      teamId: 1,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a GroundStation instance', () => {
    const groundStation = createGroundStation(mockConfig);

    expect(groundStation).toBeInstanceOf(GroundStation);
  });

  it('should pass config to GroundStation constructor', () => {
    const groundStation = createGroundStation(mockConfig);

    expect(groundStation.state.id).toBe('FACTORY-01');
    expect(groundStation.state.name).toBe('Factory Test Station');
  });

  it('should create ground station with correct location', () => {
    const groundStation = createGroundStation(mockConfig);

    expect(groundStation.state.location.latitude).toBe(40.7128);
    expect(groundStation.state.location.longitude).toBe(-74.006);
    expect(groundStation.state.location.elevation).toBe(10);
  });
});
