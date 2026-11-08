import { Mock, vi } from 'vitest';
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
    offerRetry: vi.fn(),
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
import { checkpointRecovery } from '../../src/user-account/checkpoint-recovery';
import { ProgressSaveManager } from '../../src/user-account/progress-save-manager';
import { ReplaySession } from '../../src/user-account/replay-session';

describe('ProgressSaveManager', () => {
  let manager: ProgressSaveManager;

  it('serializes manual saves after autosaves so an older response cannot replace the latest checkpoint', async () => {
    let finish!: () => void;
    mockUserDataService.saveCheckpoint
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      )
      .mockResolvedValueOnce(undefined);
    mockSyncManager.getCurrentState.mockReturnValueOnce({ scenarioTimeRemaining: 100 }).mockReturnValueOnce({ scenarioTimeRemaining: 90 });
    const autosave = manager.saveCheckpoint();
    const manual = new ProgressSaveManager().saveCheckpoint();
    await vi.waitFor(() => expect(mockUserDataService.saveCheckpoint).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([autosave, manual]);
    expect(mockUserDataService.saveCheckpoint.mock.calls.map((call) => call[1].state.scenarioTimeRemaining)).toEqual([100, 90]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Signed in by default; remote saves are skipped entirely when signed out
    (Auth.getSession as Mock).mockResolvedValue({ access_token: 'test-token', user: { id: 'test-account' } });
    manager = new ProgressSaveManager();
  });

  afterEach(() => manager.dispose());

  it('keeps the latest captured state when authentication finishes out of order', async () => {
    let firstAuth!: (session: unknown) => void;
    let secondAuth!: (session: unknown) => void;
    (Auth.getSession as Mock)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          firstAuth = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          secondAuth = resolve;
        })
      );
    mockSyncManager.getCurrentState.mockReturnValueOnce({ scenarioTimeRemaining: 100 }).mockReturnValueOnce({ scenarioTimeRemaining: 90 });
    mockUserDataService.saveCheckpoint.mockResolvedValue(undefined);
    const first = manager.saveCheckpoint();
    const second = new ProgressSaveManager().saveCheckpoint();
    secondAuth({ user: { id: 'test-account' } });
    await Promise.resolve();
    firstAuth({ user: { id: 'test-account' } });
    await Promise.all([first, second]);
    expect(checkpointRecovery.read('test-account', 'scenario-123')?.checkpoint.state.scenarioTimeRemaining).toBe(90);
    expect(mockUserDataService.saveCheckpoint.mock.calls.map((call) => call[1].state.scenarioTimeRemaining)).toEqual([100, 90]);
  });

  it('navigation waits for a save even while its authentication check is pending', async () => {
    let authenticate!: (session: unknown) => void;
    (Auth.getSession as Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        authenticate = resolve;
      })
    );
    mockSyncManager.getCurrentState.mockReturnValue({ scenarioTimeRemaining: 85 });
    mockUserDataService.saveCheckpoint.mockResolvedValue(undefined);
    const saving = manager.saveCheckpoint();
    let finished = false;
    const waiting = manager.waitForPendingSave().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    authenticate({ user: { id: 'test-account' } });
    await Promise.all([saving, waiting]);
    expect(mockUserDataService.saveCheckpoint).toHaveBeenCalled();
    expect(finished).toBe(true);
  });

  it('initializes once and registers the objective listener', () => {
    manager.initialize();
    manager.initialize();

    // Should only register once (2 calls for first initialize: OBJECTIVE_COMPLETED + OBJECTIVES_ALL_COMPLETED)
    expect(mockEventBus.on).toHaveBeenCalledTimes(2);
    expect(mockEventBus.on).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });

  it('queues a new objective save even when another save is in progress', async () => {
    const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);
    (manager as any).isSaving = true;

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).toHaveBeenCalled();
  });

  it('keeps an immutable recovery copy on cloud failure and retries that copy', async () => {
    const state = { scenarioTimeRemaining: 85 };
    mockSyncManager.getCurrentState.mockReturnValue(state);
    mockUserDataService.saveCheckpoint.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const saving = manager.saveCheckpoint();
    state.scenarioTimeRemaining = 10;
    await expect(saving).rejects.toThrow('offline');
    expect(mockToast.offerRetry).toHaveBeenCalledWith(expect.any(Function));
    await manager.retrySave();
    expect(mockUserDataService.saveCheckpoint.mock.calls.at(-1)?.[1].state.scenarioTimeRemaining).toBe(85);
  });

  it('never uploads a queued save to a newly signed-in account', async () => {
    mockSyncManager.getCurrentState.mockReturnValue({});
    (Auth.getSession as Mock).mockResolvedValueOnce({ user: { id: 'test-account' } }).mockResolvedValue({ user: { id: 'another-account' } });
    await expect(manager.saveCheckpoint()).rejects.toThrow('original account');
    expect(mockUserDataService.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('saves when an objective completes and resets the guard flag', async () => {
    const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);

    await (manager as any).handleObjectiveCompleted();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((manager as any).isSaving).toBe(false);
  });

  it('skips the checkpoint save entirely when signed out (no error toast spam)', async () => {
    (Auth.getSession as Mock).mockResolvedValue(null);

    await (manager as any).handleObjectiveCompleted();

    expect(mockUserDataService.saveCheckpoint).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
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
    expect(mockEventBus.emit).toHaveBeenCalledWith(Events.PROGRESS_SAVE_START, expect.objectContaining({ timestamp: expect.any(Number) }));
    expect(mockUserDataService.saveCheckpoint).toHaveBeenCalledWith(
      'scenario-123',
      expect.objectContaining({
        version: packageJson.version,
        state: { equipment: { foo: 'bar' } },
      })
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(Events.PROGRESS_SAVE_SUCCESS, expect.objectContaining({ checkpointId: 'scenario-123' }));
  });

  it('emits an error event when saving a checkpoint fails', async () => {
    mockSyncManager.getCurrentState.mockReturnValue({});
    mockUserDataService.saveCheckpoint.mockRejectedValue(new Error('save failed'));

    await expect(manager.saveCheckpoint()).rejects.toThrow('save failed');
    expect(mockToast.showError).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(Events.PROGRESS_SAVE_ERROR, expect.objectContaining({ error: expect.any(Error) }));
  });

  it('loads a checkpoint when one exists and logs the result', async () => {
    const checkpoint = { scenarioId: 'scenario-123', state: { data: true } };
    mockUserDataService.getCheckpoint.mockResolvedValue(checkpoint);

    const result = await manager.loadCheckpoint('scenario-123');

    expect(result).toEqual(checkpoint);
  });

  describe('during a replay session', () => {
    const replay = { scenarioId: 'scenario-123', state: { objectiveStates: [] }, label: 'player abc' };

    beforeEach(() => ReplaySession.start(replay));
    afterEach(() => ReplaySession.end());

    it('serves the replayed checkpoint for its scenario without asking the backend', async () => {
      await expect(manager.loadCheckpoint('scenario-123')).resolves.toEqual({ state: replay.state });
      expect(mockUserDataService.getCheckpoint).not.toHaveBeenCalled();
    });

    it('still loads other scenarios from the backend', async () => {
      mockUserDataService.getCheckpoint.mockResolvedValue(null);
      await manager.loadCheckpoint('other-scenario');
      expect(mockUserDataService.getCheckpoint).toHaveBeenCalledWith('other-scenario');
    });

    it('never saves a checkpoint or marks completion, even when signed in', async () => {
      const saveSpy = vi.spyOn(manager as any, 'saveCheckpoint').mockResolvedValue(undefined);

      await (manager as any).handleObjectiveCompleted();
      await (manager as any).handleAllObjectiveCompleted();

      expect(saveSpy).not.toHaveBeenCalled();
      expect(mockUserDataService.updateScenarioProgress).not.toHaveBeenCalled();
    });
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

  it('does not touch the server for checkpoints when signed out (nats-s08-F12)', async () => {
    (Auth.getSession as Mock).mockResolvedValue(null);
    mockUserDataService.deleteCheckpoint.mockRejectedValue(new Error('User not authenticated'));
    mockUserDataService.checkpointExists.mockRejectedValue(new Error('User not authenticated'));

    await expect(manager.clearCheckpoint('scenario-123')).resolves.toBeUndefined();
    await expect(manager.hasCheckpoint('scenario-123')).resolves.toBe(false);
    expect(mockUserDataService.deleteCheckpoint).not.toHaveBeenCalled();
    expect(mockUserDataService.checkpointExists).not.toHaveBeenCalled();
  });

  it('disposes listeners when initialized', () => {
    manager.initialize();
    manager.dispose();

    expect(mockEventBus.off).toHaveBeenCalledWith(Events.OBJECTIVE_COMPLETED, expect.any(Function));
  });
});
