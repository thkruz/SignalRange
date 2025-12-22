import type { AppState } from '../../src/sync/sync-manager';

const mockObjectivesManager = {
  getObjectiveStates: jest.fn(),
  restoreState: jest.fn(),
};
const mockSimulationManagerInstance = {
  objectivesManager: mockObjectivesManager,
};
const mockSimulationManager = {
  getInstance: jest.fn(() => mockSimulationManagerInstance),
};

jest.mock('../../src/simulation/simulation-manager', () => ({
  __esModule: true,
  SimulationManager: mockSimulationManager,
}));

type MockProvider = ReturnType<typeof createMockProvider>;

const createMockProvider = () => {
  const unsubscribe = jest.fn();
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(() => unsubscribe),
    isConnected: jest.fn(() => true),
    dispose: jest.fn().mockResolvedValue(undefined),
    unsubscribe,
  };
};

const createMockEquipment = () => ({
  spectrumAnalyzers: [{ state: { id: 'sa1' }, sync: jest.fn() }],
  antennas: [{ state: { id: 'ant1' }, sync: jest.fn() }],
  rfFrontEnds: [{ state: { id: 'rf1' }, sync: jest.fn() }],
  transmitters: [{ state: { id: 'tx1' }, sync: jest.fn() }],
  receivers: [{ state: { id: 'rx1' }, sync: jest.fn() }],
});

let SyncManagerClass: typeof import('../../src/sync/sync-manager').SyncManager;

describe('SyncManager', () => {
  let provider: MockProvider;
  let manager: import('../../src/sync/sync-manager').SyncManager;
  let equipment: ReturnType<typeof createMockEquipment>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    ({ SyncManager: SyncManagerClass } = require('../../src/sync/sync-manager'));
    provider = createMockProvider();
    equipment = createMockEquipment();
    manager = new SyncManagerClass(provider as any);
  });

  it('initializes provider once and subscribes to updates', async () => {
    await manager.initialize();

    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.subscribe).toHaveBeenCalledTimes(1);

    await manager.initialize();
    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(provider.subscribe).toHaveBeenCalledTimes(1);
  });

  it('throws when loading or saving without equipment', async () => {
    await expect(manager.loadFromStorage()).rejects.toThrow('Equipment not set');
    await expect(manager.saveToStorage()).rejects.toThrow('Equipment not set');
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
    const syncSpy = jest.spyOn(manager as any, 'syncFromStorage');

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
    expect(mockSimulationManager.getInstance).toHaveBeenCalledTimes(1);
    expect(mockObjectivesManager.restoreState).toHaveBeenCalledWith(state.objectiveStates);
  });

  it('reports connectivity from the underlying provider', () => {
    expect(manager.isConnected()).toBe(true);
    provider.isConnected.mockReturnValue(false);
    expect(manager.isConnected()).toBe(false);
  });
});
