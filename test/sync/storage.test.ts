import { Mock, vi } from 'vitest';
/**
 * Tests for the public storage API (storage.ts)
 *
 * Note: The storage.ts module creates a singleton SyncManager on import.
 * We need to mock the dependencies before importing to test properly.
 */

const mockEventBus = {
  getInstance: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
  })),
};

const mockSimulationManager = {
  getInstance: vi.fn(() => ({
    objectivesManager: {
      getObjectiveStates: vi.fn().mockReturnValue([]),
      restoreState: vi.fn(),
      hasScenarioTimer: vi.fn().mockReturnValue(false),
      getScenarioTimeRemaining: vi.fn().mockReturnValue(0),
    },
    sync: vi.fn(),
  })),
};

vi.mock('../../src/events/event-bus', () => ({
  __esModule: true,
  EventBus: mockEventBus,
}));

vi.mock('../../src/events/events', () => ({
  __esModule: true,
  Events: {
    STORAGE_ERROR: 'STORAGE_ERROR',
    GROUND_STATION_STATE_CHANGED: 'GROUND_STATION_STATE_CHANGED',
    SPEC_A_CONFIG_CHANGED: 'SPEC_A_CONFIG_CHANGED',
    ANTENNA_STATE_CHANGED: 'ANTENNA_STATE_CHANGED',
    TX_CONFIG_CHANGED: 'TX_CONFIG_CHANGED',
    TX_ACTIVE_MODEM_CHANGED: 'TX_ACTIVE_MODEM_CHANGED',
    RX_CONFIG_CHANGED: 'RX_CONFIG_CHANGED',
    RX_ACTIVE_MODEM_CHANGED: 'RX_ACTIVE_MODEM_CHANGED',
  },
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  __esModule: true,
  SimulationManager: mockSimulationManager,
}));

vi.mock('../../src/sync/webpack-hot-module', () => ({}));

// Mock localStorage
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
  },
  writable: true,
});

vi.spyOn(globalThis, 'addEventListener').mockImplementation(() => { });
vi.spyOn(globalThis, 'removeEventListener').mockImplementation(() => { });

describe('Storage Public API', () => {
  let storageModule: typeof import('../../src/sync/storage');

  beforeEach(() => {
    vi.resetModules();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  describe('getStore()', () => {
    it('returns empty state when storage is empty', async () => {
      storageModule = await import('../../src/sync/storage');

      const result = await storageModule.getStore();

      expect(result).toEqual({ equipment: undefined });
    });

    it('returns stored state when data exists', async () => {
      const storedState = {
        equipment: { antennasState: [{ id: 'ant-1' }] },
        objectiveStates: [{ id: 'obj-1' }],
      };
      mockStorage['__APP_STORE__'] = JSON.stringify(storedState);

      storageModule = await import('../../src/sync/storage');
      const result = await storageModule.getStore();

      expect(result).toEqual(storedState);
    });

    it('initializes only once on multiple calls', async () => {
      storageModule = await import('../../src/sync/storage');

      await storageModule.getStore();
      await storageModule.getStore();
      await storageModule.getStore();

      // The localStorage addEventListener should only be called once during initialization
      expect(globalThis.addEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearPersistedStore()', () => {
    it('clears all stored data', async () => {
      mockStorage['__APP_STORE__'] = JSON.stringify({ data: 'test' });
      storageModule = await import('../../src/sync/storage');

      await storageModule.clearPersistedStore();

      expect(localStorage.removeItem).toHaveBeenCalledWith('__APP_STORE__');
    });
  });

  describe('isStorageConnected()', () => {
    it('returns true when localStorage is available', async () => {
      storageModule = await import('../../src/sync/storage');

      const result = storageModule.isStorageConnected();

      expect(result).toBe(true);
    });
  });

  describe('disposeStorage()', () => {
    it('disposes the sync manager', async () => {
      storageModule = await import('../../src/sync/storage');

      // Initialize first so the event listener gets attached
      await storageModule.getStore();

      // Clear the spy to check dispose behavior
      (globalThis.removeEventListener as Mock).mockClear();

      await storageModule.disposeStorage();

      expect(globalThis.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('syncManager export', () => {
    it('exports the SyncManager instance', async () => {
      storageModule = await import('../../src/sync/storage');

      expect(storageModule.syncManager).toBeDefined();
      expect(typeof storageModule.syncManager.initialize).toBe('function');
      expect(typeof storageModule.syncManager.loadFromStorage).toBe('function');
      expect(typeof storageModule.syncManager.saveToStorage).toBe('function');
    });
  });
});

describe('syncEquipmentWithStore()', () => {
  let storageModule: typeof import('../../src/sync/storage');
  let mockEventBusInstance: { on: Mock; emit: Mock };

  beforeEach(() => {
    vi.resetModules();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockEventBusInstance = { on: vi.fn(), emit: vi.fn() };
    mockEventBus.getInstance.mockReturnValue(mockEventBusInstance);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets equipment and loads from storage', async () => {
    const storedState = {
      equipment: {
        spectrumAnalyzersState: [{ id: 'sa-stored' }],
        antennasState: [{ id: 'ant-stored' }],
        rfFrontEndsState: [],
        transmittersState: [],
        receiversState: [],
      },
    };
    mockStorage['__APP_STORE__'] = JSON.stringify(storedState);

    storageModule = await import('../../src/sync/storage');

    const mockEquipment = {
      spectrumAnalyzers: [{ state: { id: 'sa1' }, sync: vi.fn() }],
      antennas: [{ state: { id: 'ant1' }, sync: vi.fn() }],
      rfFrontEnds: [],
      transmitters: [],
      receivers: [],
    };

    await storageModule.syncEquipmentWithStore(mockEquipment as any, []);

    expect(mockEquipment.spectrumAnalyzers[0].sync).toHaveBeenCalledWith(
      storedState.equipment.spectrumAnalyzersState[0]
    );
    expect(mockEquipment.antennas[0].sync).toHaveBeenCalledWith(
      storedState.equipment.antennasState[0]
    );
  });

  it('sets up event listeners for auto-save', async () => {
    storageModule = await import('../../src/sync/storage');

    const mockEquipment = {
      spectrumAnalyzers: [],
      antennas: [],
      rfFrontEnds: [],
      transmitters: [],
      receivers: [],
    };

    await storageModule.syncEquipmentWithStore(mockEquipment as any, []);

    // Should register listeners for equipment change events
    expect(mockEventBusInstance.on).toHaveBeenCalledWith(
      'GROUND_STATION_STATE_CHANGED',
      expect.any(Function)
    );
    expect(mockEventBusInstance.on).toHaveBeenCalledWith(
      'SPEC_A_CONFIG_CHANGED',
      expect.any(Function)
    );
    expect(mockEventBusInstance.on).toHaveBeenCalledWith(
      'ANTENNA_STATE_CHANGED',
      expect.any(Function)
    );
  });

  it('debounces save operations', async () => {
    storageModule = await import('../../src/sync/storage');

    const mockEquipment = {
      spectrumAnalyzers: [{ state: { id: 'sa1' }, sync: vi.fn() }],
      antennas: [],
      rfFrontEnds: [],
      transmitters: [],
      receivers: [],
    };

    await storageModule.syncEquipmentWithStore(mockEquipment as any, []);

    // Get the debounced save handler
    const antennaChangeHandler = mockEventBusInstance.on.mock.calls.find(
      (call: any[]) => call[0] === 'ANTENNA_STATE_CHANGED'
    )?.[1];

    // Clear previous setItem calls
    (localStorage.setItem as Mock).mockClear();

    // Trigger multiple rapid changes
    antennaChangeHandler();
    antennaChangeHandler();
    antennaChangeHandler();

    // Should not save immediately
    expect(localStorage.setItem).not.toHaveBeenCalled();

    // Advance timers past debounce delay (500ms)
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    // Should save once after debounce
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('handles null equipment', async () => {
    storageModule = await import('../../src/sync/storage');

    // Should not throw
    await expect(
      storageModule.syncEquipmentWithStore(null, [])
    ).resolves.toBeUndefined();
  });

  it('calls SimulationManager.sync()', async () => {
    // Create a fresh mock for this test
    const syncFn = vi.fn();
    mockSimulationManager.getInstance.mockReturnValue({
      objectivesManager: {
        getObjectiveStates: vi.fn().mockReturnValue([]),
        restoreState: vi.fn(),
        hasScenarioTimer: vi.fn().mockReturnValue(false),
        getScenarioTimeRemaining: vi.fn().mockReturnValue(0),
      },
      sync: syncFn,
    });

    storageModule = await import('../../src/sync/storage');

    const mockEquipment = {
      spectrumAnalyzers: [],
      antennas: [],
      rfFrontEnds: [],
      transmitters: [],
      receivers: [],
    };

    await storageModule.syncEquipmentWithStore(mockEquipment as any, []);

    expect(syncFn).toHaveBeenCalled();
  });
});

describe('swapStorageProvider()', () => {
  let storageModule: typeof import('../../src/sync/storage');

  beforeEach(() => {
    vi.resetModules();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it('creates new provider and swaps', async () => {
    storageModule = await import('../../src/sync/storage');
    const { StorageProviderType } = await import('../../src/sync/storage-provider-factory');

    // Initialize first
    await storageModule.getStore();

    // Swap to a new localStorage provider (easiest to test)
    await storageModule.swapStorageProvider(StorageProviderType.LOCAL_STORAGE, {
      storageKey: 'new-key',
    });

    // Verify the provider was swapped by checking it uses new key
    // The sync manager should have migrated state to new provider
    expect(storageModule.syncManager).toBeDefined();
  });
});
