import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';

// Mock dependencies before imports
jest.mock('../../src/events/event-bus');
jest.mock('../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/router', () => ({
  Router: {
    getInstance: jest.fn(() => ({
      getCurrentPath: jest.fn(() => '/campaigns/nats/scenarios/test'),
      navigate: jest.fn(),
    })),
  },
  NavigationOptions: {},
}));

jest.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      data: {
        id: 'test-scenario',
        objectives: [],
        dialogClips: null,
        timeLimitSeconds: 300,
      },
    })),
  },
}));

jest.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      objectivesManager: null,
    })),
  },
}));

jest.mock('../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    initialize: jest.fn(),
    getInstance: jest.fn(() => ({
      areAllObjectivesCompleted: jest.fn(() => false),
      getObjectiveStates: jest.fn(() => []),
      getElapsedTime: jest.fn(() => 0),
      stopAllTimers: jest.fn(),
      restoreState: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
    })),
  },
}));

jest.mock('../../src/modal/dialog-history-manager', () => ({
  DialogHistoryManager: {
    getInstance: jest.fn(() => ({
      reconstructFromCompletedObjectives: jest.fn(),
    })),
  },
}));

jest.mock('../../src/modal/level-complete-modal', () => ({
  LevelCompleteModal: {
    getInstance: jest.fn(() => ({
      showCompletion: jest.fn(),
    })),
  },
}));

jest.mock('../../src/modal/objective-failed-modal', () => ({
  ObjectiveFailedModal: {
    getInstance: jest.fn(() => ({
      showFailure: jest.fn(),
    })),
  },
}));

jest.mock('../../src/modal/quiz-modal', () => ({
  QuizModal: {
    getInstance: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/modal/time-penalty-toast', () => ({
  TimePenaltyToast: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/scenarios/scenario-dialog-manager', () => ({
  ScenarioDialogManager: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(),
    })),
  },
}));

jest.mock('../../src/scoring/scenario-completion-handler', () => ({
  ScenarioCompletionHandler: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/scoring/score-calculator', () => ({
  ScoreCalculator: {
    TIME_BONUS_DIVISOR: 10,
  },
}));

jest.mock('../../src/user-account/progress-save-manager', () => ({
  ProgressSaveManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    dispose: jest.fn(),
    loadCheckpoint: jest.fn(() => Promise.resolve(null)),
  })),
}));

jest.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: jest.fn(() => ({
    getScenarioProgress: jest.fn(() => Promise.resolve(null)),
  })),
}));

jest.mock('../../src/sync/storage', () => ({
  AppState: {},
}));

// Import after mocks
import { BasePage } from '../../src/pages/base-page';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { DialogManager } from '../../src/modal/dialog-manager';
import { ObjectiveFailedModal } from '../../src/modal/objective-failed-modal';
import { ScenarioCompletionHandler } from '../../src/scoring/scenario-completion-handler';

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
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

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
      const { ScenarioManager } = require('../../src/scenario-manager');
      ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [{ id: 'obj1', title: 'Test Objective' }],
          dialogClips: null,
          timeLimitSeconds: 300,
        },
      });

      await page.testInitializeObjectivesAndDialogs();

      expect(ObjectivesManager.initialize).toHaveBeenCalledWith(
        [{ id: 'obj1', title: 'Test Objective' }],
        300
      );
    });

    it('should show intro dialog if available and not continuing from checkpoint', async () => {
      const mockShow = jest.fn();
      (DialogManager.getInstance as jest.Mock).mockReturnValue({ show: mockShow });

      const { ScenarioManager } = require('../../src/scenario-manager');
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
      const mockShow = jest.fn();
      (DialogManager.getInstance as jest.Mock).mockReturnValue({ show: mockShow });

      const { ScenarioManager } = require('../../src/scenario-manager');
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
      });

      page.setNavigationOptions({ continueFromCheckpoint: true });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShow).not.toHaveBeenCalled();
    });

    it('should trigger completion flow if all objectives already completed', async () => {
      const mockObjManager = {
        areAllObjectivesCompleted: jest.fn(() => true),
        getObjectiveStates: jest.fn(() => [{ id: 'obj1', status: 'completed' }]),
        getElapsedTime: jest.fn(() => 120),
        stopAllTimers: jest.fn(),
        restoreState: jest.fn(),
      };
      (ObjectivesManager.getInstance as jest.Mock).mockReturnValue(mockObjManager);

      const { ScenarioManager } = require('../../src/scenario-manager');
      ScenarioManager.getInstance.mockReturnValue({
        data: {
          id: 'test-scenario',
          objectives: [{ id: 'obj1', title: 'Test' }],
          dialogClips: null,
          timeLimitSeconds: 300,
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
      const mockShowFailure = jest.fn();
      (ObjectiveFailedModal.getInstance as jest.Mock).mockReturnValue({
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
      const mockShowFailure = jest.fn();
      (ObjectiveFailedModal.getInstance as jest.Mock).mockReturnValue({
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
      const mockShowFailure = jest.fn();
      (ObjectiveFailedModal.getInstance as jest.Mock).mockReturnValue({
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
      const mockShowFailure = jest.fn();
      (ObjectiveFailedModal.getInstance as jest.Mock).mockReturnValue({
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
      const mockRestoreState = jest.fn();
      (ObjectivesManager.getInstance as jest.Mock).mockReturnValue({
        restoreState: mockRestoreState,
        areAllObjectivesCompleted: jest.fn(() => false),
        getObjectiveStates: jest.fn(() => []),
        getElapsedTime: jest.fn(() => 0),
        stopAllTimers: jest.fn(),
      });

      const mockLoadCheckpoint = jest.fn(() => Promise.resolve({
        state: {
          objectiveStates: [{ id: 'obj1', status: 'completed' }],
          scenarioTimeRemaining: 200,
        },
      }));

      const { ProgressSaveManager } = require('../../src/user-account/progress-save-manager');
      ProgressSaveManager.mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
        loadCheckpoint: mockLoadCheckpoint,
      }));

      page.testInitProgressSaveManager();
      await page.testRestoreObjectiveStatesFromCheckpoint();

      expect(mockLoadCheckpoint).toHaveBeenCalledWith('test-scenario');
      expect(mockRestoreState).toHaveBeenCalledWith(
        [{ id: 'obj1', status: 'completed' }],
        200
      );
    });

    it('should handle errors gracefully', async () => {
      const mockLoadCheckpoint = jest.fn(() => Promise.reject(new Error('Load failed')));

      const { ProgressSaveManager } = require('../../src/user-account/progress-save-manager');
      ProgressSaveManager.mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
        loadCheckpoint: mockLoadCheckpoint,
      }));

      page.testInitProgressSaveManager();

      // Should not throw
      await expect(page.testRestoreObjectiveStatesFromCheckpoint()).resolves.toBeUndefined();
    });

    it('should not restore if checkpoint has no objective states', async () => {
      const mockRestoreState = jest.fn();
      (ObjectivesManager.getInstance as jest.Mock).mockReturnValue({
        restoreState: mockRestoreState,
        areAllObjectivesCompleted: jest.fn(() => false),
        getObjectiveStates: jest.fn(() => []),
        getElapsedTime: jest.fn(() => 0),
        stopAllTimers: jest.fn(),
      });

      const mockLoadCheckpoint = jest.fn(() => Promise.resolve({
        state: {},
      }));

      const { ProgressSaveManager } = require('../../src/user-account/progress-save-manager');
      ProgressSaveManager.mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
        loadCheckpoint: mockLoadCheckpoint,
      }));

      page.testInitProgressSaveManager();
      await page.testRestoreObjectiveStatesFromCheckpoint();

      expect(mockRestoreState).not.toHaveBeenCalled();
    });
  });

  describe('initializeObjectivesAndDialogs_ with already complete scenario', () => {
    it('should show completion modal when scenario is already complete', async () => {
      const mockShowCompletion = jest.fn();
      const { LevelCompleteModal } = require('../../src/modal/level-complete-modal');
      (LevelCompleteModal.getInstance as jest.Mock).mockReturnValue({
        showCompletion: mockShowCompletion,
      });

      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getScenarioProgress: jest.fn(() => Promise.resolve({
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
      const mockShowCompletion = jest.fn();
      const { LevelCompleteModal } = require('../../src/modal/level-complete-modal');
      (LevelCompleteModal.getInstance as jest.Mock).mockReturnValue({
        showCompletion: mockShowCompletion,
      });

      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getScenarioProgress: jest.fn(() => Promise.resolve({
          completedAt: '2024-01-01T00:00:00Z',
          score: 1000,
        })),
      });

      page.setNavigationOptions({ forceReplay: true });
      await page.testInitializeObjectivesAndDialogs();

      expect(mockShowCompletion).not.toHaveBeenCalled();
    });

    it('should not show completion modal when continueFromCheckpoint is true', async () => {
      const mockShowCompletion = jest.fn();
      const { LevelCompleteModal } = require('../../src/modal/level-complete-modal');
      (LevelCompleteModal.getInstance as jest.Mock).mockReturnValue({
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
