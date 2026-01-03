import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { TrafficControlManager } from '../../src/traffic/traffic-control-manager';

// Mock SimulationManager
const mockGroundStations: any[] = [];
jest.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      groundStations: mockGroundStations,
      satellites: [],
    })),
  },
}));

// Mock ScenarioManager
jest.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      settings: {
        trafficOwnership: [],
      },
    })),
  },
}));

describe('TrafficControlManager', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singleton
    TrafficControlManager.destroy();
    EventBus.destroy();

    eventBus = EventBus.getInstance();
    mockGroundStations.length = 0;
  });

  afterEach(() => {
    TrafficControlManager.destroy();
    EventBus.destroy();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = TrafficControlManager.getInstance();
      const instance2 = TrafficControlManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should destroy instance properly', () => {
      const instance1 = TrafficControlManager.getInstance();
      TrafficControlManager.destroy();
      const instance2 = TrafficControlManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Traffic Ownership Initialization', () => {
    it('should initialize ownership for a satellite', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      expect(manager.getOwner(12345)).toBe('gs-1');
    });

    it('should return null for untracked satellite', () => {
      const manager = TrafficControlManager.getInstance();

      expect(manager.getOwner(99999)).toBeNull();
    });

    it('should get ownership state for tracked satellite', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      const state = manager.getOwnershipState(12345);

      expect(state).not.toBeNull();
      expect(state?.satelliteNoradId).toBe(12345);
      expect(state?.owningGroundStationId).toBe('gs-1');
      expect(state?.isHandoverInProgress).toBe(false);
    });

    it('should return null for untracked ownership state', () => {
      const manager = TrafficControlManager.getInstance();

      expect(manager.getOwnershipState(99999)).toBeNull();
    });
  });

  describe('Handover Initiation', () => {
    it('should initiate handover successfully', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_INITIATED, callback);

      const result = manager.initiateHandover(12345, 'gs-2');

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        satelliteId: 12345,
        sourceStationId: 'gs-1',
        targetStationId: 'gs-2',
      });

      const state = manager.getOwnershipState(12345);
      expect(state?.isHandoverInProgress).toBe(true);
      expect(state?.handoverTargetStationId).toBe('gs-2');
    });

    it('should return false for untracked satellite', () => {
      const manager = TrafficControlManager.getInstance();

      const result = manager.initiateHandover(99999, 'gs-2');

      expect(result).toBe(false);
    });

    it('should return false if handover already in progress', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initiateHandover(12345, 'gs-2');

      const result = manager.initiateHandover(12345, 'gs-3');

      expect(result).toBe(false);
    });

    it('should return false if trying to handover to current owner', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      const result = manager.initiateHandover(12345, 'gs-1');

      expect(result).toBe(false);
    });
  });

  describe('Station Readiness', () => {
    it('should set source station ready', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initiateHandover(12345, 'gs-2');

      manager.setStationReady(12345, 'gs-1', true);

      const state = manager.getOwnershipState(12345);
      expect(state?.sourceStationReady).toBe(true);
    });

    it('should set target station ready', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initiateHandover(12345, 'gs-2');

      manager.setStationReady(12345, 'gs-2', true);

      const state = manager.getOwnershipState(12345);
      expect(state?.targetStationReady).toBe(true);
    });

    it('should emit HANDOVER_READY when both stations ready', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initiateHandover(12345, 'gs-2');

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_READY, callback);

      // Source station is already ready by default
      manager.setStationReady(12345, 'gs-2', true);

      expect(callback).toHaveBeenCalledWith({
        satelliteId: 12345,
        sourceStationId: 'gs-1',
        targetStationId: 'gs-2',
      });
    });

    it('should not emit HANDOVER_READY if handover not in progress', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_READY, callback);

      manager.setStationReady(12345, 'gs-2', true);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Handover Execution', () => {
    let manager: TrafficControlManager;

    beforeEach(() => {
      manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      // Add mock ground stations for transmission control
      mockGroundStations.push({
        state: { id: 'gs-1' },
        antennas: [{ state: { azimuth: 180, elevation: 45 } }],
        rfFrontEnds: [{
          hpaModule: {
            state: { isHpaEnabled: true },
            handleHpaToggle: jest.fn(),
          },
          bucModule: {
            state: { isMuted: false },
            handleMuteToggle: jest.fn(),
          },
        }],
        receivers: [{
          state: { activeModem: 1, modems: [] },
          getSignalsInBandwidth: jest.fn(() => ({ hasLock: false })),
          getSnrForModem: jest.fn(() => null),
        }],
      });

      mockGroundStations.push({
        state: { id: 'gs-2' },
        antennas: [{ state: { azimuth: 180, elevation: 45 } }],
        rfFrontEnds: [{
          hpaModule: {
            state: { isHpaEnabled: false, isHpaSwitchEnabled: false },
            handleHpaToggle: jest.fn(),
          },
          bucModule: {
            state: { isMuted: true },
            handleMuteToggle: jest.fn(),
          },
        }],
        receivers: [{
          state: { activeModem: 1, modems: [{ modemNumber: 1, isPowered: true }] },
          getSignalsInBandwidth: jest.fn(() => ({ hasLock: true })),
          getSnrForModem: jest.fn(() => 15),
        }],
      });
    });

    it('should execute handover successfully when both stations ready', () => {
      manager.initiateHandover(12345, 'gs-2');
      manager.setStationReady(12345, 'gs-2', true);

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_COMPLETE, callback);

      const result = manager.executeHandover(12345);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        satelliteId: 12345,
        previousOwnerId: 'gs-1',
        newOwnerId: 'gs-2',
      });

      // Ownership should be transferred
      expect(manager.getOwner(12345)).toBe('gs-2');
    });

    it('should return false for untracked satellite', () => {
      const result = manager.executeHandover(99999);

      expect(result).toBe(false);
    });

    it('should return false if handover not in progress', () => {
      const result = manager.executeHandover(12345);

      expect(result).toBe(false);
    });

    it('should return false if stations not ready', () => {
      manager.initiateHandover(12345, 'gs-2');
      // Don't set target station ready

      const result = manager.executeHandover(12345);

      expect(result).toBe(false);
    });

    it('should reset handover state after execution', () => {
      manager.initiateHandover(12345, 'gs-2');
      manager.setStationReady(12345, 'gs-2', true);
      manager.executeHandover(12345);

      const state = manager.getOwnershipState(12345);
      expect(state?.isHandoverInProgress).toBe(false);
      expect(state?.handoverTargetStationId).toBeNull();
    });
  });

  describe('Handover Cancellation', () => {
    it('should cancel in-progress handover', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initiateHandover(12345, 'gs-2');

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_CANCELLED, callback);

      manager.cancelHandover(12345);

      expect(callback).toHaveBeenCalledWith({ satelliteId: 12345 });

      const state = manager.getOwnershipState(12345);
      expect(state?.isHandoverInProgress).toBe(false);
      expect(state?.handoverTargetStationId).toBeNull();
    });

    it('should do nothing if no handover in progress', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');

      const callback = jest.fn();
      eventBus.on(Events.HANDOVER_CANCELLED, callback);

      manager.cancelHandover(12345);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Station Readiness Check', () => {
    it('should return not ready for unknown ground station', () => {
      const manager = TrafficControlManager.getInstance();

      const readiness = manager.checkStationReadiness('unknown-gs', 12345);

      expect(readiness.isReady).toBe(false);
      expect(readiness.linkMargin_dB).toBe(-Infinity);
      expect(readiness.hasCarrierLock).toBe(false);
      expect(readiness.cnRatio_dB).toBeNull();
    });

    it('should check station with receiver', () => {
      const manager = TrafficControlManager.getInstance();

      mockGroundStations.push({
        state: { id: 'gs-test' },
        antennas: [],
        rfFrontEnds: [],
        receivers: [{
          state: {
            activeModem: 1,
            modems: [{ modemNumber: 1, isPowered: true }],
          },
          getSignalsInBandwidth: jest.fn(() => ({ hasLock: true })),
          getSnrForModem: jest.fn(() => 12),
        }],
      });

      const readiness = manager.checkStationReadiness('gs-test', 12345);

      expect(readiness.groundStationId).toBe('gs-test');
      expect(readiness.hasCarrierLock).toBe(true);
      expect(readiness.cnRatio_dB).toBe(12);
      expect(readiness.isReady).toBe(true); // 12 dB >= 8 dB threshold
    });

    it('should return not ready when C/N below threshold', () => {
      const manager = TrafficControlManager.getInstance();

      mockGroundStations.push({
        state: { id: 'gs-low-cn' },
        antennas: [],
        rfFrontEnds: [],
        receivers: [{
          state: {
            activeModem: 1,
            modems: [{ modemNumber: 1, isPowered: true }],
          },
          getSignalsInBandwidth: jest.fn(() => ({ hasLock: true })),
          getSnrForModem: jest.fn(() => 5), // Below 8 dB threshold
        }],
      });

      const readiness = manager.checkStationReadiness('gs-low-cn', 12345);

      expect(readiness.isReady).toBe(false);
      expect(readiness.linkMargin_dB).toBe(-3); // 5 - 8 = -3
    });

    it('should return not ready when no receiver', () => {
      const manager = TrafficControlManager.getInstance();

      mockGroundStations.push({
        state: { id: 'gs-no-rx' },
        antennas: [],
        rfFrontEnds: [],
        receivers: [],
      });

      const readiness = manager.checkStationReadiness('gs-no-rx', 12345);

      expect(readiness.isReady).toBe(false);
    });
  });

  describe('Tracked Satellites', () => {
    it('should return list of tracked satellite IDs', () => {
      const manager = TrafficControlManager.getInstance();
      manager.initializeOwnership(12345, 'gs-1');
      manager.initializeOwnership(67890, 'gs-2');

      const tracked = manager.getTrackedSatellites();

      expect(tracked).toContain(12345);
      expect(tracked).toContain(67890);
      expect(tracked).toHaveLength(2);
    });

    it('should return empty array when no satellites tracked', () => {
      const manager = TrafficControlManager.getInstance();

      const tracked = manager.getTrackedSatellites();

      expect(tracked).toEqual([]);
    });
  });

  describe('MIN_HANDOVER_CN_RATIO_DB constant', () => {
    it('should have minimum C/N ratio of 8 dB', () => {
      expect(TrafficControlManager.MIN_HANDOVER_CN_RATIO_DB).toBe(8);
    });
  });
});
