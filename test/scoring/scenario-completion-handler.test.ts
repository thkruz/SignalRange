import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';

// Mock all dependencies before imports
jest.mock('../../src/events/event-bus');

jest.mock('../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/modal/level-complete-modal', () => ({
  LevelCompleteModal: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/router', () => ({
  Router: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: jest.fn(),
}));

// Import after mocks
import { ScenarioCompletionHandler } from '../../src/scoring/scenario-completion-handler';
import { Logger } from '../../src/logging/logger';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { ScenarioManager } from '../../src/scenario-manager';
import { LevelCompleteModal } from '../../src/modal/level-complete-modal';
import { QuizManager } from '../../src/modal/quiz-manager';
import { Router } from '../../src/router';
import { getUserDataService } from '../../src/user-account/user-data-service';

describe('ScenarioCompletionHandler', () => {
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };
  let mockObjectivesManager: {
    getObjectiveStates: jest.Mock;
    getScenarioTimeRemaining: jest.Mock;
  };
  let mockScenarioManager: { data: { id: string; number: number } };
  let mockLevelCompleteModal: { showCompletion: jest.Mock };
  let mockQuizManager: { getPointsDeducted: jest.Mock };
  let mockRouter: { getCurrentPath: jest.Mock };
  let mockUserDataService: { updateScenarioProgress: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton between tests
    ScenarioCompletionHandler.destroy();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock ObjectivesManager
    mockObjectivesManager = {
      getObjectiveStates: jest.fn().mockReturnValue([]),
      getScenarioTimeRemaining: jest.fn().mockReturnValue(0),
    };
    (ObjectivesManager.getInstance as jest.Mock).mockReturnValue(mockObjectivesManager);

    // Setup mock ScenarioManager
    mockScenarioManager = {
      data: { id: 'test-scenario', number: 1 },
    };
    (ScenarioManager.getInstance as jest.Mock).mockReturnValue(mockScenarioManager);

    // Setup mock LevelCompleteModal
    mockLevelCompleteModal = {
      showCompletion: jest.fn(),
    };
    (LevelCompleteModal.getInstance as jest.Mock).mockReturnValue(mockLevelCompleteModal);

    // Setup mock QuizManager
    mockQuizManager = {
      getPointsDeducted: jest.fn().mockReturnValue(0),
    };
    (QuizManager.getInstance as jest.Mock).mockReturnValue(mockQuizManager);

    // Setup mock Router
    mockRouter = {
      getCurrentPath: jest.fn().mockReturnValue('/campaigns/nats/scenarios/test'),
    };
    (Router.getInstance as jest.Mock).mockReturnValue(mockRouter);

    // Setup mock UserDataService
    mockUserDataService = {
      updateScenarioProgress: jest.fn().mockResolvedValue(undefined),
    };
    (getUserDataService as jest.Mock).mockReturnValue(mockUserDataService);
  });

  afterEach(() => {
    ScenarioCompletionHandler.destroy();
  });

  describe('singleton pattern', () => {
    it('should return the same instance on multiple getInstance calls', () => {
      const instance1 = ScenarioCompletionHandler.getInstance();
      const instance2 = ScenarioCompletionHandler.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after destroy', () => {
      const instance1 = ScenarioCompletionHandler.getInstance();
      ScenarioCompletionHandler.destroy();
      const instance2 = ScenarioCompletionHandler.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should subscribe to OBJECTIVES_ALL_COMPLETED event', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.OBJECTIVES_ALL_COMPLETED,
        expect.any(Function)
      );
    });

    it('should log info message on successful initialization', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      expect(Logger.info).toHaveBeenCalledWith('ScenarioCompletionHandler initialized');
    });

    it('should warn if already initialized', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();
      handler.initialize();

      expect(Logger.warn).toHaveBeenCalledWith('ScenarioCompletionHandler already initialized');
    });

    it('should only subscribe to event once', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();
      handler.initialize();

      expect(mockEventBus.on).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('should unsubscribe from event when initialized', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();
      handler.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.OBJECTIVES_ALL_COMPLETED,
        expect.any(Function)
      );
    });

    it('should log info message on dispose', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();
      handler.dispose();

      expect(Logger.info).toHaveBeenCalledWith('ScenarioCompletionHandler disposed');
    });

    it('should not throw if not initialized', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      expect(() => handler.dispose()).not.toThrow();
    });

    it('should not call off if not initialized', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.dispose();

      expect(mockEventBus.off).not.toHaveBeenCalled();
    });

    it('should allow re-initialization after dispose', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();
      handler.dispose();
      handler.initialize();

      expect(mockEventBus.on).toHaveBeenCalledTimes(2);
    });
  });

  describe('destroy', () => {
    it('should dispose and nullify instance', () => {
      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      ScenarioCompletionHandler.destroy();

      // Clear mocks to check new instance behavior
      jest.clearAllMocks();

      // Getting instance should create a new one (not the same reference)
      const newHandler = ScenarioCompletionHandler.getInstance();
      expect(newHandler).not.toBe(handler);

      // The new instance should not be initialized automatically
      // (no event subscription until initialize() is called)
      expect(mockEventBus.on).not.toHaveBeenCalled();
    });

    it('should not throw if no instance exists', () => {
      expect(() => ScenarioCompletionHandler.destroy()).not.toThrow();
    });
  });

  describe('handleAllObjectivesCompleted_', () => {
    it('should calculate and show score when objectives complete', () => {
      const mockObjectiveStates = [
        {
          objective: { id: 'obj1', title: 'Test', conditions: [], points: 100 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
      ];
      mockObjectivesManager.getObjectiveStates.mockReturnValue(mockObjectiveStates);
      mockObjectivesManager.getScenarioTimeRemaining.mockReturnValue(60);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      // Get the callback and invoke it
      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: mockObjectiveStates, totalTime: 120 });

      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.objectContaining({
            basePoints: 100,
            timeBonus: 12, // 60 / 5 = 12
          }),
          elapsedTimeSeconds: 120,
          campaignId: 'nats',
          scenarioId: 'test-scenario',
        }),
        expect.any(Function)
      );
    });

    it('should aggregate quiz penalties from status-check conditions', () => {
      const mockObjectiveStates = [
        {
          objective: {
            id: 'obj1',
            title: 'Test',
            conditions: [
              { type: 'status-check', description: 'Quiz 1', mustMaintain: false },
              { type: 'antenna-locked', description: 'Lock', mustMaintain: false },
            ],
            points: 100,
          },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
        {
          objective: {
            id: 'obj2',
            title: 'Test 2',
            conditions: [
              { type: 'status-check', description: 'Quiz 2', mustMaintain: false },
            ],
            points: 50,
          },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
      ];
      mockObjectivesManager.getObjectiveStates.mockReturnValue(mockObjectiveStates);
      mockQuizManager.getPointsDeducted
        .mockReturnValueOnce(5)  // obj1, condition 0
        .mockReturnValueOnce(10); // obj2, condition 0

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: mockObjectiveStates, totalTime: 60 });

      // Should have queried quiz manager for status-check conditions only
      expect(mockQuizManager.getPointsDeducted).toHaveBeenCalledWith('obj1', 0);
      expect(mockQuizManager.getPointsDeducted).toHaveBeenCalledWith('obj2', 0);
      expect(mockQuizManager.getPointsDeducted).toHaveBeenCalledTimes(2);

      // Check that quiz penalties are included in score
      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.objectContaining({
            quizPenalties: 15,
          }),
        }),
        expect.any(Function)
      );
    });

    it('should aggregate time penalties from objectives', () => {
      const mockObjectiveStates = [
        {
          objective: { id: 'obj1', title: 'Test', conditions: [], points: 100 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
          timePenaltyApplied: true,
          timePenaltyPoints: 20,
        },
        {
          objective: { id: 'obj2', title: 'Test 2', conditions: [], points: 50 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
          timePenaltyPoints: 10,
        },
        {
          objective: { id: 'obj3', title: 'Test 3', conditions: [], points: 25 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
          // No time penalty
        },
      ];
      mockObjectivesManager.getObjectiveStates.mockReturnValue(mockObjectiveStates);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: mockObjectiveStates, totalTime: 60 });

      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.objectContaining({
            timePenalties: 30, // 20 + 10 + 0
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('extractCampaignId_', () => {
    it('should extract campaign ID from route path', () => {
      mockRouter.getCurrentPath.mockReturnValue('/campaigns/training/scenarios/intro');

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'training',
        }),
        expect.any(Function)
      );
    });

    it('should default to "nats" if campaign ID not found', () => {
      mockRouter.getCurrentPath.mockReturnValue('/unknown/path');

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'nats',
        }),
        expect.any(Function)
      );
    });

    it('should handle campaign ID with special characters', () => {
      mockRouter.getCurrentPath.mockReturnValue('/campaigns/camp-2024_v1/scenarios/test');

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'camp-2024_v1',
        }),
        expect.any(Function)
      );
    });
  });

  describe('saveScore_', () => {
    it('should call updateScenarioProgress on continue', async () => {
      mockObjectivesManager.getObjectiveStates.mockReturnValue([
        {
          objective: { id: 'obj1', title: 'Test', conditions: [], points: 100 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
      ]);
      mockObjectivesManager.getScenarioTimeRemaining.mockReturnValue(60);
      mockScenarioManager.data = { id: 'test-scenario', number: 3 };

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 180 });

      // Get the onContinue callback from showCompletion
      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];
      await onContinueCallback();

      expect(mockUserDataService.updateScenarioProgress).toHaveBeenCalledWith(
        'test-scenario',
        expect.objectContaining({
          score: expect.any(Number),
          basePoints: 100,
          timeBonus: 12,
          quizPenalties: 0,
          timePenalties: 0,
          completedAt: expect.any(String),
          lastPlayed: expect.any(String),
          scenarioNumber: 3,
        })
      );
    });

    it('should log success message after saving', async () => {
      mockObjectivesManager.getObjectiveStates.mockReturnValue([
        {
          objective: { id: 'obj1', title: 'Test', conditions: [], points: 50 },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
      ]);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 60 });

      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];
      await onContinueCallback();

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Score saved for scenario test-scenario')
      );
    });

    it('should handle errors gracefully when saving fails', async () => {
      mockUserDataService.updateScenarioProgress.mockRejectedValue(new Error('Network error'));

      mockObjectivesManager.getObjectiveStates.mockReturnValue([]);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];

      // Should not throw
      await expect(onContinueCallback()).resolves.toBeUndefined();

      expect(Logger.error).toHaveBeenCalledWith('Failed to save score:', expect.any(Error));
    });

    it('should use default scenario number when data is null', async () => {
      mockScenarioManager.data = null as any;

      mockObjectivesManager.getObjectiveStates.mockReturnValue([]);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];
      await onContinueCallback();

      expect(mockUserDataService.updateScenarioProgress).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          scenarioNumber: 0,
        })
      );
    });

    it('should include ISO date strings for completedAt and lastPlayed', async () => {
      const beforeTime = new Date().toISOString();

      mockObjectivesManager.getObjectiveStates.mockReturnValue([]);

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: [], totalTime: 0 });

      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];
      await onContinueCallback();

      const afterTime = new Date().toISOString();

      const savedProgress = mockUserDataService.updateScenarioProgress.mock.calls[0][1];

      // Check that dates are valid ISO strings and within range
      expect(new Date(savedProgress.completedAt).toISOString()).toBe(savedProgress.completedAt);
      expect(new Date(savedProgress.lastPlayed).toISOString()).toBe(savedProgress.lastPlayed);
      expect(savedProgress.completedAt >= beforeTime).toBe(true);
      expect(savedProgress.completedAt <= afterTime).toBe(true);
    });
  });

  describe('full completion flow', () => {
    it('should handle complete flow from event to score save', async () => {
      const mockObjectiveStates = [
        {
          objective: {
            id: 'obj1',
            title: 'First Task',
            conditions: [{ type: 'status-check', description: 'Quiz', mustMaintain: false }],
            points: 100,
          },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
          timePenaltyPoints: 10,
        },
        {
          objective: {
            id: 'obj2',
            title: 'Second Task',
            conditions: [],
            points: 50,
          },
          isActive: true,
          isCompleted: true,
          conditionStates: [],
          isFailed: false,
          isTimerRunning: false,
        },
      ];

      mockObjectivesManager.getObjectiveStates.mockReturnValue(mockObjectiveStates);
      mockObjectivesManager.getScenarioTimeRemaining.mockReturnValue(100);
      mockQuizManager.getPointsDeducted.mockReturnValue(5);
      mockRouter.getCurrentPath.mockReturnValue('/campaigns/advanced/scenarios/final');
      mockScenarioManager.data = { id: 'final-scenario', number: 10 };

      const handler = ScenarioCompletionHandler.getInstance();
      handler.initialize();

      // Trigger completion event
      const callback = mockEventBus.on.mock.calls[0][1];
      callback({ completedObjectives: mockObjectiveStates, totalTime: 300 });

      // Verify modal was shown with correct data
      expect(mockLevelCompleteModal.showCompletion).toHaveBeenCalledWith(
        {
          score: {
            basePoints: 150,
            timeBonus: 20, // 100 / 5 = 20
            quizPenalties: 5,
            timePenalties: 10,
            totalScore: 155, // 150 + 20 - 5 - 10 = 155
            objectiveBreakdown: [{ points: 100 }, { points: 50 }],
            timeRemainingSeconds: 100,
          },
          elapsedTimeSeconds: 300,
          campaignId: 'advanced',
          scenarioId: 'final-scenario',
        },
        expect.any(Function)
      );

      // Simulate continue button click
      const onContinueCallback = mockLevelCompleteModal.showCompletion.mock.calls[0][1];
      await onContinueCallback();

      // Verify score was saved
      expect(mockUserDataService.updateScenarioProgress).toHaveBeenCalledWith(
        'final-scenario',
        expect.objectContaining({
          score: 155,
          basePoints: 150,
          timeBonus: 20,
          quizPenalties: 5,
          timePenalties: 10,
          scenarioNumber: 10,
        })
      );
    });
  });
});
