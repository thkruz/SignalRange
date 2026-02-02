import { vi, Mock } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';

// Mock dependencies before imports
vi.mock('../../src/events/event-bus');
vi.mock('../../src/logging/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/router', () => ({
  Router: {
    getInstance: vi.fn(() => ({
      getCurrentPath: vi.fn(() => '/campaigns/nats/scenarios/test'),
      navigate: vi.fn(),
    })),
  },
  NavigationOptions: {},
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      data: {
        id: 'test-scenario',
        objectives: [],
        dialogClips: null,
        timeLimitSeconds: 300,
      },
      settings: {
        scenarioStartWallTime: Date.now(),
        scenarioStartDate: new Date().toISOString(),
        previousShiftLogs: [],
      },
    })),
  },
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      objectivesManager: null,
    })),
  },
}));

vi.mock('../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    initialize: vi.fn(),
    getInstance: vi.fn(() => ({
      areAllObjectivesCompleted: vi.fn(() => false),
      getObjectiveStates: vi.fn(() => []),
      getElapsedTime: vi.fn(() => 0),
      stopAllTimers: vi.fn(),
      restoreState: vi.fn(),
    })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: vi.fn(() => ({
      show: vi.fn(),
    })),
  },
}));

vi.mock('../../src/modal/dialog-history-manager', () => ({
  DialogHistoryManager: {
    getInstance: vi.fn(() => ({
      reconstructFromCompletedObjectives: vi.fn(),
    })),
  },
}));

vi.mock('../../src/modal/level-complete-modal', () => ({
  LevelCompleteModal: {
    getInstance: vi.fn(() => ({
      showCompletion: vi.fn(),
    })),
  },
}));

vi.mock('../../src/modal/objective-failed-modal', () => ({
  ObjectiveFailedModal: {
    getInstance: vi.fn(() => ({
      showFailure: vi.fn(),
    })),
  },
}));

vi.mock('../../src/modal/quiz-modal', () => ({
  QuizModal: {
    getInstance: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('../../src/modal/time-penalty-toast', () => ({
  TimePenaltyToast: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../src/scenarios/scenario-dialog-manager', () => ({
  ScenarioDialogManager: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
    })),
  },
}));

vi.mock('../../src/scoring/scenario-completion-handler', () => ({
  ScenarioCompletionHandler: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
    })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../src/scoring/score-calculator', () => ({
  ScoreCalculator: {
    TIME_BONUS_DIVISOR: 10,
  },
}));

vi.mock('../../src/user-account/progress-save-manager', () => ({
  ProgressSaveManager: vi.fn(function (this: any) {
    this.initialize = vi.fn();
    this.dispose = vi.fn();
    this.loadCheckpoint = vi.fn(() => Promise.resolve(null));
    return this;
  }),
}));

vi.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: vi.fn(() => ({
    getScenarioProgress: vi.fn(() => Promise.resolve(null)),
  })),
}));

vi.mock('../../src/sync/storage', () => ({
  AppState: {},
}));

vi.mock('../../src/ops-log/ops-log-manager', () => ({
  OpsLogManager: {
    initialize: vi.fn(),
    isInitialized: vi.fn(() => false),
  },
}));

// Import after mocks
import { BasePage } from '../../src/pages/base-page';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { DialogManager } from '../../src/modal/dialog-manager';
import { ObjectiveFailedModal } from '../../src/modal/objective-failed-modal';
import { ScenarioCompletionHandler } from '../../src/scoring/scenario-completion-handler';
import { ScenarioManager } from '../../src/scenario-manager';
import { ProgressSaveManager } from '../../src/user-account/progress-save-manager';
import { LevelCompleteModal } from '../../src/modal/level-complete-modal';
import { getUserDataService } from '../../src/user-account/user-data-service';

// Create a concrete implementation for testing
class TestPage extends BasePage {
  id = 'test-page';

  protected html_ = '<div id="test-page"></div>';

  constructor() {
    super();
  }

  protected addEventListeners_(): void {
    // No-op
  }

  // Expose protected methods for testing
  public testInitProgressSaveManager(): void {
    this.initProgressSaveManager_();
  }

  public async testInitializeObjectivesAndDialogs(): Promise<void> {
    await this.initializeObjectivesAndDialogs_();
  }

  public testDisposeProgressSaveManager(): void {
    this.disposeProgressSaveManager_();
  }

  public testSubscribeToFailureEvents(): void {
    this.subscribeToFailureEvents_();
  }

  public setNavigationOptions(options: any): void {
    this.navigationOptions_ = options;
  }

  public async testRestoreObjectiveStatesFromCheckpoint(): Promise<void> {
    await this.restoreObjectiveStatesFromCheckpoint_();
  }

  public getProgressSaveManager(): any {
    return this.progressSaveManager_;
  }

  // Create DOM for testing
  public createDom(): void {
    this.dom_ = document.createElement('div');
    this.dom_.id = this.id;
    document.body.appendChild(this.dom_);
  }
}

describe('BasePage', () => {
  let page: TestPage;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    page = new TestPage();
    page.createDom();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('show', () => {
    it('should set display to flex', () => {
      page.hide();
      page.show();
      expect(page['dom_'].style.display).toBe('flex');
    });

    it('should not throw if dom_ is null', () => {
      page['dom_'] = null as any;
      expect(() => page.show()).not.toThrow();
    });
  });

  describe('hide', () => {
    it('should set display to none', () => {
      page.hide();
      expect(page['dom_'].style.display).toBe('none');
    });

    it('should not throw if dom_ is null', () => {
      page['dom_'] = null as any;
      expect(() => page.hide()).not.toThrow();
    });
  });

  describe('initProgressSaveManager_', () => {
    it('should create ProgressSaveManager', () => {
      page.testInitProgressSaveManager();
      expect(page['progressSaveManager_']).not.toBeNull();
    });

    it('should initialize ProgressSaveManager', () => {
      page.testInitProgressSaveManager();
      expect(page['progressSaveManager_']?.initialize).toHaveBeenCalled();
    });

    it('should initialize ScenarioCompletionHandler', () => {
      page.testInitProgressSaveManager();
      expect(ScenarioCompletionHandler.getInstance).toHaveBeenCalled();
    });
  });

  describe('initializeObjectivesAndDialogs_', () => {
    it('should emit DOM_READY event', async () => {
      await page.testInitializeObjectivesAndDialogs();
      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.DOM_READY);
    });

    it('should initialize ObjectivesManager when scenario has objectives', async () => {
            ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [{ id: 'obj1', title: 'Test Objective' }],
          dialogClips: null,
          timeLimitSeconds: 300,
        },
        settings: {
          scenarioStartWallTime: Date.now(),
          scenarioStartDate: new Date().toISOString(),
          previousShiftLogs: [],
        },
      });

      await page.testInitializeObjectivesAndDialogs();

      expect(ObjectivesManager.initialize).toHaveBeenCalledWith(
        [{ id: 'obj1', title: 'Test Objective' }],
        300
      );
    });

    it('should show intro dialog if available and not continuing from checkpoint', async () => {
      const mockShow = vi.fn();
      (DialogManager.getInstance as Mock).mockReturnValue({ show: mockShow });

            ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [],
          dialogClips: {
            intro: {
              text: 'Welcome!',
              character: 'Charlie',
              audioUrl: '/audio/intro.mp3',
              emotion: 'happy',
            },
          },
          timeLimitSeconds: null,
        },
        settings: {
          scenarioStartWallTime: Date.now(),
          scenarioStartDate: new Date().toISOString(),
          previousShiftLogs: [],
        },
      });

      page.setNavigationOptions({ continueFromCheckpoint: false });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShow).toHaveBeenCalledWith(
        'Welcome!',
        'Charlie',
        '/audio/intro.mp3',
        'Introduction',
        'happy'
      );
    });

    it('should not show intro dialog when continuing from checkpoint', async () => {
      const mockShow = vi.fn();
      (DialogManager.getInstance as Mock).mockReturnValue({ show: mockShow });

            ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [],
          dialogClips: {
            intro: {
              text: 'Welcome!',
              character: 'Charlie',
            },
          },
          timeLimitSeconds: null,
        },
        settings: {
          scenarioStartWallTime: Date.now(),
          scenarioStartDate: new Date().toISOString(),
          previousShiftLogs: [],
        },
      });

      page.setNavigationOptions({ continueFromCheckpoint: true });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('should trigger completion flow if all objectives already completed', async () => {
      const mockObjManager = {
        areAllObjectivesCompleted: vi.fn(() => true),
        getObjectiveStates: vi.fn(() => [{ id: 'obj1', status: 'completed' }]),
        getElapsedTime: vi.fn(() => 120),
        stopAllTimers: vi.fn(),
        restoreState: vi.fn(),
      };
      (ObjectivesManager.getInstance as Mock).mockReturnValue(mockObjManager);

            ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [{ id: 'obj1', title: 'Test' }],
          dialogClips: null,
          timeLimitSeconds: 300,
        },
        settings: {
          scenarioStartWallTime: Date.now(),
          scenarioStartDate: new Date().toISOString(),
          previousShiftLogs: [],
        },
      });

      page.setNavigationOptions({ forceReplay: false });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockObjManager.stopAllTimers).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.OBJECTIVES_ALL_COMPLETED, {
        completedObjectives: [{ id: 'obj1', status: 'completed' }],
        totalTime: 120,
      });
    });
  });

  describe('subscribeToFailureEvents_', () => {
    it('should subscribe to OBJECTIVE_FAILED event', () => {
      page.testSubscribeToFailureEvents();

      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.OBJECTIVE_FAILED,
        expect.any(Function)
      );
    });

    it('should subscribe to SCENARIO_TIME_EXPIRED event', () => {
      page.testSubscribeToFailureEvents();

      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.SCENARIO_TIME_EXPIRED,
        expect.any(Function)
      );
    });

    it('should subscribe to DUAL_TRANSMISSION_VIOLATION event', () => {
      page.testSubscribeToFailureEvents();

      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.DUAL_TRANSMISSION_VIOLATION,
        expect.any(Function)
      );
    });

    it('should show failure modal on OBJECTIVE_FAILED', () => {
      const mockShowFailure = vi.fn();
      (ObjectiveFailedModal.getInstance as Mock).mockReturnValue({
        showFailure: mockShowFailure,
      });

      page.testSubscribeToFailureEvents();

      // Get the callback for OBJECTIVE_FAILED
      const callback = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.OBJECTIVE_FAILED
      )?.[1];

      callback?.({
        objectiveId: 'obj1',
        objective: { id: 'obj1', title: 'Test Objective' },
      });

      expect(mockShowFailure).toHaveBeenCalledWith({
        title: 'Objective Failed',
        message: 'Time expired for: Test Objective',
        objectiveId: 'obj1',
        isScenarioTimeout: false,
      });
    });

    it('should show failure modal on SCENARIO_TIME_EXPIRED', () => {
      const mockShowFailure = vi.fn();
      (ObjectiveFailedModal.getInstance as Mock).mockReturnValue({
        showFailure: mockShowFailure,
      });

      page.testSubscribeToFailureEvents();

      // Get the callback for SCENARIO_TIME_EXPIRED
      const callback = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.SCENARIO_TIME_EXPIRED
      )?.[1];

      callback?.({ timeLimit: 300 });

      expect(mockShowFailure).toHaveBeenCalledWith({
        title: 'Mission Failed',
        message: 'Scenario time limit of 5 minutes has expired.',
        isScenarioTimeout: true,
      });
    });

    it('should use singular minute for 1 minute time limit', () => {
      const mockShowFailure = vi.fn();
      (ObjectiveFailedModal.getInstance as Mock).mockReturnValue({
        showFailure: mockShowFailure,
      });

      page.testSubscribeToFailureEvents();

      const callback = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.SCENARIO_TIME_EXPIRED
      )?.[1];

      callback?.({ timeLimit: 60 });

      expect(mockShowFailure).toHaveBeenCalledWith({
        title: 'Mission Failed',
        message: 'Scenario time limit of 1 minute has expired.',
        isScenarioTimeout: true,
      });
    });

    it('should show failure modal on DUAL_TRANSMISSION_VIOLATION', () => {
      const mockShowFailure = vi.fn();
      (ObjectiveFailedModal.getInstance as Mock).mockReturnValue({
        showFailure: mockShowFailure,
      });

      page.testSubscribeToFailureEvents();

      // Get the callback for DUAL_TRANSMISSION_VIOLATION
      const callback = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.DUAL_TRANSMISSION_VIOLATION
      )?.[1];

      callback?.({
        groundStation1Id: 'GS-001',
        groundStation2Id: 'GS-002',
        satelliteNoradId: 12345,
      });

      expect(mockShowFailure).toHaveBeenCalledWith({
        title: 'Mission Failed',
        message: expect.stringContaining('GS-001'),
        isScenarioTimeout: false,
      });
    });
  });

  describe('restoreObjectiveStatesFromCheckpoint_', () => {
    it('should return early if progressSaveManager_ is null', async () => {
      await expect(page.testRestoreObjectiveStatesFromCheckpoint()).resolves.toBeUndefined();
    });

    it('should restore objective states from checkpoint', async () => {
      const mockRestoreState = vi.fn();
      (ObjectivesManager.getInstance as Mock).mockReturnValue({
        restoreState: mockRestoreState,
        areAllObjectivesCompleted: vi.fn(() => false),
        getObjectiveStates: vi.fn(() => []),
        getElapsedTime: vi.fn(() => 0),
        stopAllTimers: vi.fn(),
      });

      const mockLoadCheckpoint = vi.fn(() => Promise.resolve({
        state: {
          objectiveStates: [{ id: 'obj1', status: 'completed' }],
          scenarioTimeRemaining: 200,
        },
      }));

      (ProgressSaveManager as Mock).mockImplementation(function (this: any) {
        this.initialize = vi.fn();
        this.dispose = vi.fn();
        this.loadCheckpoint = mockLoadCheckpoint;
        return this;
      });

      page.testInitProgressSaveManager();
      await page.testRestoreObjectiveStatesFromCheckpoint();

      expect(mockLoadCheckpoint).toHaveBeenCalledWith('test-scenario');
      expect(mockRestoreState).toHaveBeenCalledWith(
        [{ id: 'obj1', status: 'completed' }],
        200
      );
    });

    it('should handle errors gracefully', async () => {
      const mockLoadCheckpoint = vi.fn(() => Promise.reject(new Error('Load failed')));

      (ProgressSaveManager as Mock).mockImplementation(function (this: any) {
        this.initialize = vi.fn();
        this.dispose = vi.fn();
        this.loadCheckpoint = mockLoadCheckpoint;
        return this;
      });

      page.testInitProgressSaveManager();

      // Should not throw
      await expect(page.testRestoreObjectiveStatesFromCheckpoint()).resolves.toBeUndefined();
    });

    it('should not restore if checkpoint has no objective states', async () => {
      const mockRestoreState = vi.fn();
      (ObjectivesManager.getInstance as Mock).mockReturnValue({
        restoreState: mockRestoreState,
        areAllObjectivesCompleted: vi.fn(() => false),
        getObjectiveStates: vi.fn(() => []),
        getElapsedTime: vi.fn(() => 0),
        stopAllTimers: vi.fn(),
      });

      const mockLoadCheckpoint = vi.fn(() => Promise.resolve({
        state: {},
      }));

      (ProgressSaveManager as Mock).mockImplementation(function (this: any) {
        this.initialize = vi.fn();
        this.dispose = vi.fn();
        this.loadCheckpoint = mockLoadCheckpoint;
        return this;
      });

      page.testInitProgressSaveManager();
      await page.testRestoreObjectiveStatesFromCheckpoint();

      expect(mockRestoreState).not.toHaveBeenCalled();
    });
  });

  describe('initializeObjectivesAndDialogs_ with already complete scenario', () => {
    it('should show completion modal when scenario is already complete', async () => {
      const mockShowCompletion = vi.fn();
            (LevelCompleteModal.getInstance as Mock).mockReturnValue({
        showCompletion: mockShowCompletion,
      });

            (getUserDataService as Mock).mockReturnValue({
        getScenarioProgress: vi.fn(() => Promise.resolve({
          completedAt: '2024-01-01T00:00:00Z',
          score: 1000,
          basePoints: 800,
          timeBonus: 200,
          quizPenalties: 0,
          completedObjectives: ['obj1'],
          lastPlayed: '2024-01-01T00:00:00Z',
        })),
      });

      page.setNavigationOptions({ continueFromCheckpoint: false, forceReplay: false });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShowCompletion).toHaveBeenCalled();
    });

    it('should not show completion modal when forceReplay is true', async () => {
      const mockShowCompletion = vi.fn();
            (LevelCompleteModal.getInstance as Mock).mockReturnValue({
        showCompletion: mockShowCompletion,
      });

            (getUserDataService as Mock).mockReturnValue({
        getScenarioProgress: vi.fn(() => Promise.resolve({
          completedAt: '2024-01-01T00:00:00Z',
          score: 1000,
        })),
      });

      page.setNavigationOptions({ forceReplay: true });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShowCompletion).not.toHaveBeenCalled();
    });

    it('should not show completion modal when continueFromCheckpoint is true', async () => {
      const mockShowCompletion = vi.fn();
            (LevelCompleteModal.getInstance as Mock).mockReturnValue({
        showCompletion: mockShowCompletion,
      });

      page.setNavigationOptions({ continueFromCheckpoint: true });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShowCompletion).not.toHaveBeenCalled();
    });
  });

  describe('disposeProgressSaveManager_', () => {
    it('should dispose ProgressSaveManager', () => {
      page.testInitProgressSaveManager();
      const disposeFn = page['progressSaveManager_']?.dispose;

      page.testDisposeProgressSaveManager();

      expect(disposeFn).toHaveBeenCalled();
    });

    it('should set progressSaveManager_ to null', () => {
      page.testInitProgressSaveManager();
      page.testDisposeProgressSaveManager();
      expect(page['progressSaveManager_']).toBeNull();
    });

    it('should destroy ScenarioCompletionHandler', () => {
      page.testInitProgressSaveManager();
      page.testDisposeProgressSaveManager();
      expect(ScenarioCompletionHandler.destroy).toHaveBeenCalled();
    });

    it('should not throw if progressSaveManager_ is null', () => {
      expect(() => page.testDisposeProgressSaveManager()).not.toThrow();
    });
  });
});
