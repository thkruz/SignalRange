import { vi, Mock } from 'vitest';
import packageJson from '../../package.json';
import { Events } from '../../src/events/events';

// Create shared mock objects using vi.hoisted()
const { mockEventBus, mockToast, mockUserDataService, mockSyncManager } = vi.hoisted(() => ({
  mockEventBus: {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
  },
  mockToast: {
    showSaving: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
  },
  mockUserDataService: {
    getUserProgress: vi.fn(),
    updateUserProgress: vi.fn(),
    saveCheckpoint: vi.fn(),
    getCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
    checkpointExists: vi.fn(),
    updateScenarioProgress: vi.fn(),
  },
  mockSyncManager: {
    getCurrentState: vi.fn(),
  },
}));

vi.mock('@app/events/event-bus', () => ({
  __esModule: true,
  EventBus: {
    getInstance: vi.fn(() => mockEventBus),
  },
}));

vi.mock('@app/modal/save-progress-toast', () => ({
  __esModule: true,
  SaveProgressToast: {
    getInstance: vi.fn(() => mockToast),
  },
}));

vi.mock('@app/scenario-manager', () => ({
  __esModule: true,
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      data: { id: 'scenario-123' },
    })),
  },
}));

vi.mock('@app/sync/storage', () => ({
  __esModule: true,
  syncManager: mockSyncManager,
}));

vi.mock('@app/user-account/user-data-service', () => ({
  __esModule: true,
  getUserDataService: vi.fn(() => mockUserDataService),
}));

vi.mock('@app/logging/logger', () => ({
  __esModule: true,
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/user-account/auth', () => ({
  __esModule: true,
  Auth: {
    getSession: vi.fn(),
  },
}));

// Import after mocks are defined
import { Auth } from '../../src/user-account/auth';
import { ProgressSaveManager } from '../../src/user-account/progress-save-manager';

describe('ProgressSaveManager', () => {
  let manager: ProgressSaveManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Signed in by default; remote saves are skipped entirely when signed out
    (Auth.getSession as Mock).mockResolvedValue({ access_token: 'test-token' });
    manager = new ProgressSaveManager();
  });

  it('initializes once and registers the objective listener', () => {
    manager.initialize();
    manager.initialize();

    // Should only register once (2 calls for first initialize: OBJECTIVE_COMPLETED + OBJECTIVES_ALL_COMPLETED)
    expect(mockEventBus.on).toHaveBeenCalledTimes(2);
    expect(mockEventBus.on).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });

  it('skips handling when a save is already in progress', async () => {
    const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);
    (manager as any).isSaving = true;

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('saves when an objective completes and resets the guard flag', async () => {
    const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((manager as any).isSaving).toBe(false);
  });

  it('skips the checkpoint save entirely when signed out (no error toast spam)', async () => {
    (Auth.getSession as Mock).mockResolvedValue(null);
    const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(mockToast.showError).not.toHaveBeenCalled();
  });

  it('skips the completion mark when signed out (funnel handles it)', async () => {
    (Auth.getSession as Mock).mockResolvedValue(null);

    await (manager as any).handleAllObjectiveCompleted();

    expect(mockUserDataService.updateScenarioProgress).not.toHaveBeenCalled();
  });

  it('saves a checkpoint and replaces any existing one for the scenario', async () => {
    mockSyncManager.getCurrentState.mockReturnValue({ equipment: { foo: 'bar' } });
    mockUserDataService.saveCheckpoint.mockResolvedValue(undefined);

    await manager.saveCheckpoint();

    expect(mockToast.showSaving).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.PROGRESS_SAVE_START,
      expect.objectContaining({ timestamp: expect.any(Number) }),
    );
    expect(mockUserDataService.saveCheckpoint).toHaveBeenCalledWith(
      'scenario-123',
      expect.objectContaining({
        version: packageJson.version,
        state: { equipment: { foo: 'bar' } },
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
    mockUserDataService.saveCheckpoint.mockRejectedValue(new Error('save failed'));

    await expect(manager.saveCheckpoint()).rejects.toThrow('save failed');
    expect(mockToast.showError).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.PROGRESS_SAVE_ERROR,
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('loads a checkpoint when one exists and logs the result', async () => {
    const checkpoint = { scenarioId: 'scenario-123', state: { data: true } };
    mockUserDataService.getCheckpoint.mockResolvedValue(checkpoint);

    const result = await manager.loadCheckpoint('scenario-123');

    expect(result).toEqual(checkpoint);
  });

  it('returns null when no checkpoint is found', async () => {
    mockUserDataService.getCheckpoint.mockResolvedValue(null);

    const result = await manager.loadCheckpoint('missing');

    expect(result).toBeNull();
  });

  it('clears a checkpoint when it exists', async () => {
    mockUserDataService.deleteCheckpoint.mockResolvedValue(undefined);

    await manager.clearCheckpoint('scenario-123');

    expect(mockUserDataService.deleteCheckpoint).toHaveBeenCalledWith('scenario-123');
  });

  it('checks for checkpoint presence and handles errors gracefully', async () => {
    mockUserDataService.checkpointExists.mockResolvedValue(true);
    await expect(manager.hasCheckpoint('scenario-123')).resolves.toBe(true);

    mockUserDataService.checkpointExists.mockRejectedValue(new Error('boom'));
    await expect(manager.hasCheckpoint('scenario-123')).resolves.toBe(false);
  });

  it('disposes listeners when initialized', () => {
    manager.initialize();
    manager.dispose();

    expect(mockEventBus.off).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });
});
