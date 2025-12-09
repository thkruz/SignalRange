import packageJson from '../../package.json';
import { Events } from '../../src/events/events';

const mockEventBus = {
  on: jest.fn(),
  emit: jest.fn(),
  off: jest.fn(),
};

const mockToast = {
  showSaving: jest.fn(),
  showSuccess: jest.fn(),
  showError: jest.fn(),
};

const mockScenarioManager = {
  data: { id: 'scenario-123' },
};

const mockSyncManager = {
  getCurrentState: jest.fn(),
};

const mockUserDataService = {
  getUserProgress: jest.fn(),
  updateUserProgress: jest.fn(),
};

jest.mock('@app/events/event-bus', () => ({
  __esModule: true,
  EventBus: { getInstance: jest.fn(() => mockEventBus) },
}));

jest.mock('@app/modal/save-progress-toast', () => ({
  __esModule: true,
  SaveProgressToast: { getInstance: jest.fn(() => mockToast) },
}));

jest.mock('@app/scenario-manager', () => ({
  __esModule: true,
  ScenarioManager: { getInstance: jest.fn(() => mockScenarioManager) },
}));

jest.mock('@app/sync/storage', () => ({
  __esModule: true,
  syncManager: mockSyncManager,
}));

jest.mock('@app/user-account/user-data-service', () => ({
  __esModule: true,
  getUserDataService: jest.fn(() => mockUserDataService),
}));

jest.mock('@app/logging/logger', () => ({
  __esModule: true,
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ProgressSaveManager', () => {
  let ProgressSaveManagerClass: typeof import('../../src/user-account/progress-save-manager').ProgressSaveManager;
  let manager: import('../../src/user-account/progress-save-manager').ProgressSaveManager;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ ProgressSaveManager: ProgressSaveManagerClass } = require('../../src/user-account/progress-save-manager'));
    mockScenarioManager.data = { id: 'scenario-123' };
    manager = new ProgressSaveManagerClass();
  });

  it('initializes once and registers the objective listener', () => {
    manager.initialize();
    manager.initialize();

    expect(mockEventBus.on).toHaveBeenCalledTimes(1);
    expect(mockEventBus.on).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });

  it('skips handling when a save is already in progress', async () => {
    const saveSpy = jest.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);
    (manager as any).isSaving = true;

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('saves when an objective completes and resets the guard flag', async () => {
    const saveSpy = jest.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((manager as any).isSaving).toBe(false);
  });

  it('saves a checkpoint and replaces any existing one for the scenario', async () => {
    mockSyncManager.getCurrentState.mockReturnValue({ equipment: { foo: 'bar' } });
    mockUserDataService.getUserProgress.mockResolvedValue({
      signalForge: [
        {
          scenarioId: 'scenario-123',
          version: '0.0.1',
          state: { stale: true },
          savedAt: 0,
        },
      ],
    });
    mockUserDataService.updateUserProgress.mockResolvedValue(undefined);

    await manager.saveCheckpoint();

    expect(mockToast.showSaving).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.PROGRESS_SAVE_START,
      expect.objectContaining({ timestamp: expect.any(Number) }),
    );
    const payload = mockUserDataService.updateUserProgress.mock.calls[0][0].signalForge;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(
      expect.objectContaining({
        scenarioId: 'scenario-123',
        version: packageJson.version,
        state: { equipment: { foo: 'bar' } },
        savedAt: expect.any(Number),
      }),
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.PROGRESS_SAVE_SUCCESS,
      expect.objectContaining({ checkpointId: 'scenario-123' }),
    );
  });

  it('emits an error event when saving a checkpoint fails', async () => {
    mockSyncManager.getCurrentState.mockReturnValue({});
    mockUserDataService.getUserProgress.mockResolvedValue({ signalForge: [] });
    mockUserDataService.updateUserProgress.mockRejectedValue(new Error('save failed'));

    await expect(manager.saveCheckpoint()).rejects.toThrow('save failed');
    expect(mockToast.showError).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.PROGRESS_SAVE_ERROR,
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('loads a checkpoint when one exists and logs the result', async () => {
    const checkpoint = { scenarioId: 'scenario-123', state: { data: true } };
    mockUserDataService.getUserProgress.mockResolvedValue({ signalForge: [checkpoint] });

    const result = await manager.loadCheckpoint('scenario-123');

    expect(result).toEqual(checkpoint);
  });

  it('returns null when no checkpoint is found', async () => {
    mockUserDataService.getUserProgress.mockResolvedValue({ signalForge: [] });

    const result = await manager.loadCheckpoint('missing');

    expect(result).toBeNull();
  });

  it('clears a checkpoint when it exists and avoids unnecessary writes', async () => {
    mockUserDataService.getUserProgress.mockResolvedValue({
      signalForge: [{ scenarioId: 'scenario-123' }, { scenarioId: 'other' }],
    });
    mockUserDataService.updateUserProgress.mockResolvedValue(undefined);

    await manager.clearCheckpoint('scenario-123');

    expect(mockUserDataService.updateUserProgress).toHaveBeenCalledWith({
      signalForge: [{ scenarioId: 'other' }],
    });

    mockUserDataService.updateUserProgress.mockClear();
    mockUserDataService.getUserProgress.mockResolvedValue({ signalForge: [{ scenarioId: 'other' }] });

    await manager.clearCheckpoint('scenario-123');

    expect(mockUserDataService.updateUserProgress).not.toHaveBeenCalled();
  });

  it('checks for checkpoint presence and handles errors gracefully', async () => {
    const loadSpy = jest.spyOn(manager, 'loadCheckpoint').mockResolvedValue({} as any);
    await expect(manager.hasCheckpoint('scenario-123')).resolves.toBe(true);

    loadSpy.mockRejectedValue(new Error('boom'));
    await expect(manager.hasCheckpoint('scenario-123')).resolves.toBe(false);
  });

  it('disposes listeners when initialized', () => {
    manager.initialize();
    manager.dispose();

    expect(mockEventBus.off).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });
});
