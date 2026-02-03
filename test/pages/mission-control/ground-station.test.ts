import { Mock, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

// Mock EventBus
vi.mock('../../../src/events/event-bus');

// Create mock equipment instances
const mockAntennaInstance = {
  state: { azimuth: 180, elevation: 45 },
  update: vi.fn(),
  sync: vi.fn(),
  syncDomWithState: vi.fn(),
};

const mockRfFrontEndInstance = {
  state: { isPowered: true },
  update: vi.fn(),
  sync: vi.fn(),
  syncDomWithState: vi.fn(),
  connectAntenna: vi.fn(),
  connectTransmitter: vi.fn(),
};

const mockSpectrumAnalyzerInstance = {
  state: { isEnabled: true },
  update: vi.fn(),
  sync: vi.fn(),
  syncDomWithState: vi.fn(),
};

const mockTransmitterInstance = {
  state: { isPowered: false },
  update: vi.fn(),
  sync: vi.fn(),
  syncDomWithState: vi.fn(),
};

const mockReceiverInstance = {
  state: { isLocked: false },
  update: vi.fn(),
  sync: vi.fn(),
  syncDomWithState: vi.fn(),
  connectRfFrontEnd: vi.fn(),
};

// Mock equipment factories and classes
vi.mock('../../../src/equipment/antenna/antenna-factory', () => ({
  createAntenna: vi.fn(() => mockAntennaInstance),
}));

vi.mock('../../../src/equipment/rf-front-end/rf-front-end-factory', () => ({
  createRFFrontEnd: vi.fn(() => mockRfFrontEndInstance),
}));

vi.mock('../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer', () => ({
  RealTimeSpectrumAnalyzer: vi.fn(function () { return mockSpectrumAnalyzerInstance; }),
}));

vi.mock('../../../src/equipment/transmitter/transmitter', () => ({
  Transmitter: vi.fn(function () { return mockTransmitterInstance; }),
}));

vi.mock('../../../src/equipment/receiver/receiver', () => ({
  Receiver: vi.fn(function () { return mockReceiverInstance; }),
}));

// Import after mocks
import { GroundStation } from '../../../src/pages/mission-control/ground-station';

describe('GroundStation (mission-control)', () => {
  let groundStation: GroundStation;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock; getInstance: Mock };

  const mockConfig = {
    id: 'GS-001',
    name: 'Miami Station',
    location: {
      lat: 25.7617,
      lon: -80.1918,
      alt: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock equipment instances
    mockAntennaInstance.update.mockClear();
    mockAntennaInstance.sync.mockClear();
    mockAntennaInstance.syncDomWithState.mockClear();
    mockRfFrontEndInstance.update.mockClear();
    mockRfFrontEndInstance.sync.mockClear();
    mockRfFrontEndInstance.syncDomWithState.mockClear();
    mockRfFrontEndInstance.connectAntenna.mockClear();
    mockRfFrontEndInstance.connectTransmitter.mockClear();
    mockSpectrumAnalyzerInstance.update.mockClear();
    mockSpectrumAnalyzerInstance.sync.mockClear();
    mockSpectrumAnalyzerInstance.syncDomWithState.mockClear();
    mockTransmitterInstance.update.mockClear();
    mockTransmitterInstance.sync.mockClear();
    mockTransmitterInstance.syncDomWithState.mockClear();
    mockReceiverInstance.update.mockClear();
    mockReceiverInstance.sync.mockClear();
    mockReceiverInstance.syncDomWithState.mockClear();
    mockReceiverInstance.connectRfFrontEnd.mockClear();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      getInstance: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    groundStation = new GroundStation(mockConfig);
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(groundStation).toBeInstanceOf(GroundStation);
    });

    it('should generate unique id', () => {
      expect(groundStation.id).toBe('ground-station-test-uuid-1234');
    });

    it('should generate unique containerId', () => {
      expect(groundStation.containerId).toBe('ground-station-container-test-uuid-1234');
    });

    it('should set state id from config', () => {
      expect(groundStation.state.id).toBe('GS-001');
    });

    it('should set state name from config', () => {
      expect(groundStation.state.name).toBe('Miami Station');
    });

    it('should set state location from config', () => {
      expect(groundStation.state.location).toEqual(mockConfig.location);
    });

    it('should set isOperational to true by default', () => {
      expect(groundStation.state.isOperational).toBe(true);
    });

    it('should generate UUID in state', () => {
      expect(groundStation.state.uuid).toBe('test-uuid-1234');
    });

    it('should initialize empty equipment object', () => {
      expect(groundStation.state.equipment).toEqual({});
    });
  });

  describe('equipment creation', () => {
    it('should create antenna', () => {
      expect(groundStation.antennas.length).toBe(1);
    });

    it('should create RF front end', () => {
      expect(groundStation.rfFrontEnds.length).toBe(1);
    });

    it('should create spectrum analyzer', () => {
      expect(groundStation.spectrumAnalyzers.length).toBe(1);
    });

    it('should create transmitter', () => {
      expect(groundStation.transmitters.length).toBe(1);
    });

    it('should create receiver', () => {
      expect(groundStation.receivers.length).toBe(1);
    });
  });

  describe('equipment wiring', () => {
    it('should connect antenna to RF front end', () => {
      expect(mockRfFrontEndInstance.connectAntenna).toHaveBeenCalledWith(mockAntennaInstance);
    });

    it('should connect transmitter to RF front end', () => {
      expect(mockRfFrontEndInstance.connectTransmitter).toHaveBeenCalledWith(mockTransmitterInstance);
    });

    it('should connect receiver to RF front end', () => {
      expect(mockReceiverInstance.connectRfFrontEnd).toHaveBeenCalledWith(mockRfFrontEndInstance);
    });
  });

  describe('EventBus registration', () => {
    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should register for SYNC events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
    });
  });

  describe('update', () => {
    it('should update all antennas', () => {
      groundStation.update();
      expect(mockAntennaInstance.update).toHaveBeenCalled();
    });

    it('should update all RF front ends', () => {
      groundStation.update();
      expect(mockRfFrontEndInstance.update).toHaveBeenCalled();
    });

    it('should update all spectrum analyzers', () => {
      groundStation.update();
      expect(mockSpectrumAnalyzerInstance.update).toHaveBeenCalled();
    });

    it('should update all transmitters', () => {
      groundStation.update();
      expect(mockTransmitterInstance.update).toHaveBeenCalled();
    });

    it('should update all receivers', () => {
      groundStation.update();
      expect(mockReceiverInstance.update).toHaveBeenCalled();
    });

    it('should aggregate antenna states', () => {
      groundStation.update();
      expect(groundStation.state.equipment.antennas).toEqual([mockAntennaInstance.state]);
    });

    it('should aggregate RF front end states', () => {
      groundStation.update();
      expect(groundStation.state.equipment.rfFrontEnds).toEqual([mockRfFrontEndInstance.state]);
    });

    it('should aggregate spectrum analyzer states', () => {
      groundStation.update();
      expect(groundStation.state.equipment.spectrumAnalyzers).toEqual([mockSpectrumAnalyzerInstance.state]);
    });

    it('should aggregate transmitter states', () => {
      groundStation.update();
      expect(groundStation.state.equipment.transmitters).toEqual([mockTransmitterInstance.state]);
    });

    it('should aggregate receiver states', () => {
      groundStation.update();
      expect(groundStation.state.equipment.receivers).toEqual([mockReceiverInstance.state]);
    });

    it('should emit GROUND_STATION_STATE_CHANGED event', () => {
      groundStation.update();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.GROUND_STATION_STATE_CHANGED,
        expect.objectContaining({ id: 'GS-001' })
      );
    });
  });

  describe('sync', () => {
    it('should sync isOperational state', () => {
      groundStation.sync({ isOperational: false });
      expect(groundStation.state.isOperational).toBe(false);
    });

    it('should not change isOperational if not provided', () => {
      groundStation.sync({});
      expect(groundStation.state.isOperational).toBe(true);
    });

    it('should sync antenna states', () => {
      const mockAntennaState = { azimuth: 90, elevation: 30 };
      groundStation.sync({ equipment: { antennas: [mockAntennaState] } });
      expect(mockAntennaInstance.sync).toHaveBeenCalledWith(mockAntennaState);
    });

    it('should sync RF front end states', () => {
      const mockRfState = { isPowered: false };
      groundStation.sync({ equipment: { rfFrontEnds: [mockRfState] } });
      expect(mockRfFrontEndInstance.sync).toHaveBeenCalledWith(mockRfState);
    });

    it('should sync spectrum analyzer states', () => {
      const mockSpecState = { isEnabled: false };
      groundStation.sync({ equipment: { spectrumAnalyzers: [mockSpecState] } });
      expect(mockSpectrumAnalyzerInstance.sync).toHaveBeenCalledWith(mockSpecState);
    });

    it('should sync transmitter states', () => {
      const mockTxState = { isPowered: true };
      groundStation.sync({ equipment: { transmitters: [mockTxState] } });
      expect(mockTransmitterInstance.sync).toHaveBeenCalledWith(mockTxState);
    });

    it('should sync receiver states', () => {
      const mockRxState = { isLocked: true };
      groundStation.sync({ equipment: { receivers: [mockRxState] } });
      expect(mockReceiverInstance.sync).toHaveBeenCalledWith(mockRxState);
    });

    it('should handle empty equipment object', () => {
      expect(() => groundStation.sync({ equipment: {} })).not.toThrow();
    });

    it('should handle undefined equipment', () => {
      expect(() => groundStation.sync({})).not.toThrow();
    });

    it('should handle out of bounds equipment indices gracefully', () => {
      // Should not throw when syncing more equipment than exists
      expect(() => groundStation.sync({
        equipment: {
          antennas: [{}, {}], // More than the 1 antenna that exists
        },
      })).not.toThrow();
    });
  });

  describe('syncDomWithState', () => {
    it('should sync DOM for all antennas', () => {
      groundStation.syncDomWithState();
      expect(mockAntennaInstance.syncDomWithState).toHaveBeenCalled();
    });

    it('should sync DOM for all RF front ends', () => {
      groundStation.syncDomWithState();
      expect(mockRfFrontEndInstance.syncDomWithState).toHaveBeenCalled();
    });

    it('should sync DOM for all spectrum analyzers', () => {
      groundStation.syncDomWithState();
      expect(mockSpectrumAnalyzerInstance.syncDomWithState).toHaveBeenCalled();
    });

    it('should sync DOM for all transmitters', () => {
      groundStation.syncDomWithState();
      expect(mockTransmitterInstance.syncDomWithState).toHaveBeenCalled();
    });

    it('should sync DOM for all receivers', () => {
      groundStation.syncDomWithState();
      expect(mockReceiverInstance.syncDomWithState).toHaveBeenCalled();
    });
  });

  describe('html template', () => {
    it('should include ground station id in html', () => {
      expect((groundStation as unknown as { html_: string }).html_).toContain(groundStation.id);
    });

    it('should include container id in html', () => {
      expect((groundStation as unknown as { html_: string }).html_).toContain(groundStation.containerId);
    });
  });
});
