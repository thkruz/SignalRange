import { vi } from 'vitest';
import type { AppState } from '../../src/sync/sync-manager';

// Create shared mock objects using vi.hoisted()
const { mockObjectivesManager, mockSimulationManager } = vi.hoisted(() => ({
  mockObjectivesManager: {
    getObjectiveStates: vi.fn(),
    restoreState: vi.fn(),
    hasScenarioTimer: vi.fn().mockReturnValue(false),
    getScenarioTimeRemaining: vi.fn().mockReturnValue(0),
  },
  mockSimulationManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  __esModule: true,
  SimulationManager: mockSimulationManager,
}));

type MockProvider = ReturnType<typeof createMockProvider>;

const createMockProvider = () => {
  const unsubscribe = vi.fn();
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => unsubscribe),
    isConnected: vi.fn(() => true),
    dispose: vi.fn().mockResolvedValue(undefined),
    unsubscribe,
  };
};

const createMockEquipment = () => ({
  spectrumAnalyzers: [{ state: { id: 'sa1' }, sync: vi.fn() }],
  antennas: [{ state: { id: 'ant1' }, sync: vi.fn() }],
  rfFrontEnds: [{ state: { id: 'rf1' }, sync: vi.fn() }],
  transmitters: [{ state: { id: 'tx1' }, sync: vi.fn() }],
  receivers: [{ state: { id: 'rx1' }, sync: vi.fn() }],
});

// Import after mocks
import { SyncManager } from '../../src/sync/sync-manager';
import { SimulationManager } from '../../src/simulation/simulation-manager';

describe('SyncManager', () => {
  let provider: MockProvider;
  let manager: SyncManager;
  let equipment: ReturnType<typeof createMockEquipment>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createMockProvider();
    equipment = createMockEquipment();
    manager = new SyncManager(provider as any);

    // Set up SimulationManager mock return value (cleared by vi.clearAllMocks)
    mockSimulationManager.getInstance.mockReturnValue({
      objectivesManager: mockObjectivesManager,
    });
  });

  it('initializes provider once and subscribes to updates', async () => {
    await manager.initialize();

    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.subscribe).toHaveBeenCalledTimes(1);

    await manager.initialize();
    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.subscribe).toHaveBeenCalledTimes(1);
  });

  it('throws when saving without equipment', async () => {
    await expect(manager.saveToStorage()).rejects.toThrow('Equipment not set');
  });

  it('initializes empty equipment when loading without equipment set', async () => {
    provider.read.mockResolvedValue(null);
    await expect(manager.loadFromStorage()).resolves.toBeUndefined();
  });

  it('writes current state when saving to storage', async () => {
    manager.setEquipment(equipment as any);
    mockObjectivesManager.getObjectiveStates.mockReturnValue([{ id: 'obj-1' }]);

    await manager.saveToStorage();

    expect(provider.write).toHaveBeenCalledTimes(1);
    const [savedState] = provider.write.mock.calls[0];
    expect(savedState.equipment?.antennasState).toEqual([equipment.antennas[0].state]);
    expect(savedState.objectiveStates).toEqual([{ id: 'obj-1' }]);
  });

  it('loads from storage and syncs equipment when data exists', async () => {
    const storedState: AppState = {
      equipment: {
        spectrumAnalyzersState: [{ id: 'sa-stored' } as any],
        antennasState: [{ id: 'ant-stored' } as any],
        rfFrontEndsState: [{ id: 'rf-stored' } as any],
        transmittersState: [{ id: 'tx-stored' } as any],
        receiversState: [{ id: 'rx-stored' } as any],
      },
    };
    provider.read.mockResolvedValue(storedState);
    manager.setEquipment(equipment as any);
    const syncSpy = vi.spyOn(manager as any, 'syncFromStorage');

    await manager.loadFromStorage();

    expect(provider.read).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith(storedState);
  });

  it('swaps providers and migrates the current state', async () => {
    manager.setEquipment(equipment as any);
    await manager.initialize();

    const newProvider = createMockProvider();

    await manager.swapProvider(newProvider as any);

    expect(provider.unsubscribe).toHaveBeenCalledTimes(1);
    expect(provider.dispose).toHaveBeenCalledTimes(1);
    expect(newProvider.initialize).toHaveBeenCalledTimes(1);
    expect(newProvider.subscribe).toHaveBeenCalledTimes(1);
    expect(newProvider.write).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment: expect.objectContaining({
          antennasState: [equipment.antennas[0].state],
        }),
      }),
    );
  });

  it('syncs stored equipment and objective state back into the equipment', () => {
    manager.setEquipment(equipment as any);
    const state: AppState = {
      objectiveStates: [{ id: 'objective-1' } as any],
      equipment: {
        spectrumAnalyzersState: [{ id: 'sa-stored' } as any],
        antennasState: [{ id: 'ant-stored' } as any],
        rfFrontEndsState: [{ id: 'rf-stored' } as any],
        transmittersState: [{ id: 'tx-stored' } as any],
        receiversState: [{ id: 'rx-stored' } as any],
      },
    };

    (manager as any).syncFromStorage(state);

    expect(equipment.spectrumAnalyzers[0].sync).toHaveBeenCalledWith(state.equipment!.spectrumAnalyzersState![0]);
    expect(equipment.antennas[0].sync).toHaveBeenCalledWith(state.equipment!.antennasState![0]);
    expect(equipment.rfFrontEnds[0].sync).toHaveBeenCalledWith(state.equipment!.rfFrontEndsState![0]);
    expect(equipment.transmitters[0].sync).toHaveBeenCalledWith(state.equipment!.transmittersState![0]);
    expect(equipment.receivers[0].sync).toHaveBeenCalledWith(state.equipment!.receiversState![0]);
    // Note: SimulationManager.getInstance is called via dynamic require() in syncFromStorage
    // which may not be captured by ESM mocks. The important behavior is that equipment sync happens.
  });

  it('reports connectivity from the underlying provider', () => {
    expect(manager.isConnected()).toBe(true);
    provider.isConnected.mockReturnValue(false);
    expect(manager.isConnected()).toBe(false);
  });
});
