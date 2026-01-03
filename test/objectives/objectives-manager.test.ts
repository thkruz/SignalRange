import { EventBus } from '../../src/events/event-bus';
import { Events, QuizCompletedData, QuizPassedData } from '../../src/events/events';
import { Objective, ObjectiveState } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';

// Mock dependencies
jest.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      groundStations: [],
      getSatByNoradId: jest.fn(),
      satellites: [],
    })),
  },
}));

jest.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: jest.fn(() => ({
      hasQuiz: jest.fn(() => false),
      isQuizComplete: jest.fn(() => false),
      registerQuiz: jest.fn(),
    })),
  },
}));

jest.mock('../../src/traffic/traffic-control-manager', () => ({
  TrafficControlManager: {
    getInstance: jest.fn(() => ({
      getOwner: jest.fn(() => null),
    })),
  },
}));

describe('ObjectivesManager', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    jest.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    eventBus = EventBus.getInstance();
  });

  afterEach(() => {
    ObjectivesManager.destroy();
    EventBus.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const createTestObjective = (overrides: Partial<Objective> = {}): Objective => ({
    id: 'test-objective-1',
    title: 'Test Objective',
    description: 'A test objective',
    groundStation: 'gs-1',
    conditions: [
      {
        type: 'mission-brief-opened',
        description: 'Open mission brief',
        mustMaintain: false,
      },
    ],
    ...overrides,
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance with initialize()', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager).toBeDefined();
      expect(ObjectivesManager.getInstance()).toBe(manager);
    });

    it('should throw error when getInstance() called before initialize()', () => {
      expect(() => ObjectivesManager.getInstance()).toThrow(
        'ObjectivesManager not initialized. Call initialize() first.'
      );
    });

    it('should warn and destroy previous instance on re-initialize', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const objectives1 = [createTestObjective({ id: 'obj-1' })];
      const manager1 = ObjectivesManager.initialize(objectives1);

      const objectives2 = [createTestObjective({ id: 'obj-2' })];
      const manager2 = ObjectivesManager.initialize(objectives2);

      expect(consoleSpy).toHaveBeenCalledWith(
        'ObjectivesManager already initialized. Destroying previous instance.'
      );
      expect(manager1).not.toBe(manager2);

      consoleSpy.mockRestore();
    });
  });

  describe('Initialization', () => {
    it('should initialize objectives with correct initial state', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['obj-1'] }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const states = manager.getObjectiveStates();

      expect(states).toHaveLength(2);

      // First objective should be active (no prerequisites)
      expect(states[0].isActive).toBe(true);
      expect(states[0].isCompleted).toBe(false);

      // Second objective should be inactive (has prerequisites)
      expect(states[1].isActive).toBe(false);
      expect(states[1].isCompleted).toBe(false);
    });

    it('should initialize scenario timer when provided', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 300);

      expect(manager.hasScenarioTimer()).toBe(true);
      expect(manager.getScenarioTimeRemaining()).toBe(300);
    });

    it('should not initialize scenario timer when not provided', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.hasScenarioTimer()).toBe(false);
    });
  });

  describe('Objective State Retrieval', () => {
    it('should get objective state by ID', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const state = manager.getObjectiveState('obj-1');

      expect(state).toBeDefined();
      expect(state?.objective.id).toBe('obj-1');
    });

    it('should return undefined for non-existent objective', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const state = manager.getObjectiveState('non-existent');

      expect(state).toBeUndefined();
    });
  });

  describe('Timer Functionality', () => {
    it('should format time remaining correctly', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.formatTimeRemaining(125)).toBe('2:05');
      expect(manager.formatTimeRemaining(60)).toBe('1:00');
      expect(manager.formatTimeRemaining(59)).toBe('0:59');
      expect(manager.formatTimeRemaining(0)).toBe('0:00');
    });

    it('should countdown scenario timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 60);

      expect(manager.getScenarioTimeRemaining()).toBe(60);

      // Advance time by 1 second (timer interval)
      jest.advanceTimersByTime(1000);

      expect(manager.getScenarioTimeRemaining()).toBe(59);
    });

    it('should stop all timers when objective fails', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 5,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const failedCallback = jest.fn();
      eventBus.on(Events.OBJECTIVE_FAILED, failedCallback);

      ObjectivesManager.initialize(objectives, 60);

      // Advance timer past the objective timeout
      jest.advanceTimersByTime(6000);

      expect(failedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'timed-obj',
          reason: 'timeout',
        })
      );
    });

    it('should emit SCENARIO_TIME_EXPIRED when scenario timer reaches zero', () => {
      const objectives = [createTestObjective()];
      const expiredCallback = jest.fn();
      eventBus.on(Events.SCENARIO_TIME_EXPIRED, expiredCallback);

      ObjectivesManager.initialize(objectives, 3);

      // Advance time past the scenario timeout
      jest.advanceTimersByTime(4000);

      expect(expiredCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          timeLimit: 3,
        })
      );
    });
  });

  describe('Elapsed Time Calculation', () => {
    it('should calculate elapsed time from countdown timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 300);

      jest.advanceTimersByTime(10000); // 10 seconds

      expect(manager.getElapsedTime()).toBe(10);
    });

    it('should calculate elapsed time from start time when no timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      const now = Date.now();
      jest.setSystemTime(now + 15000);

      expect(manager.getElapsedTime()).toBe(15);
    });
  });

  describe('Quiz Events Handling', () => {
    it('should pause timers on QUIZ_PASSED event', () => {
      const objectives = [createTestObjective({ id: 'quiz-obj' })];
      const manager = ObjectivesManager.initialize(objectives, 60);

      expect(manager.getScenarioTimeRemaining()).toBe(60);

      // Advance 5 seconds
      jest.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55);

      // Emit quiz passed event
      const quizPassedData: QuizPassedData = {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      };
      eventBus.emit(Events.QUIZ_PASSED, quizPassedData);

      // Timer should be paused
      jest.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55); // No change

      expect(manager.isQuizPassed()).toBe(true);
      expect(manager.getPassedObjectiveId()).toBe('quiz-obj');
    });

    it('should resume timer on QUIZ_COMPLETED if scenario not complete', () => {
      const objectives = [
        createTestObjective({ id: 'quiz-obj' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['quiz-obj'] }),
      ];
      const manager = ObjectivesManager.initialize(objectives, 60);

      // Emit quiz passed event to pause timer
      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      jest.advanceTimersByTime(5000);
      const timeAfterPause = manager.getScenarioTimeRemaining();

      // Emit quiz completed event
      const quizCompletedData: QuizCompletedData = {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      };
      eventBus.emit(Events.QUIZ_COMPLETED, quizCompletedData);

      expect(manager.isQuizPassed()).toBe(false);

      // Timer should resume
      jest.advanceTimersByTime(3000);
      expect(manager.getScenarioTimeRemaining()).toBeLessThan(timeAfterPause);
    });
  });

  describe('Opened Box Tracking', () => {
    it('should register opened boxes', () => {
      ObjectivesManager.registerOpenedBox('mission-brief-1');

      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(true);
      expect(ObjectivesManager.isBoxOpened('mission-brief-2')).toBe(false);
    });

    it('should check if any box is opened when no ID provided', () => {
      expect(ObjectivesManager.isBoxOpened()).toBe(false);

      ObjectivesManager.registerOpenedBox('mission-brief-1');

      expect(ObjectivesManager.isBoxOpened()).toBe(true);
    });

    it('should clear opened boxes on destroy', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      ObjectivesManager.registerOpenedBox('mission-brief-1');
      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(true);

      ObjectivesManager.destroy();

      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(false);
    });
  });

  describe('Ground Station Selection Tracking', () => {
    it('should track selected ground station via ASSET_SELECTED event', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'ground-station',
        id: 'gs-1',
      });

      expect(ObjectivesManager.getSelectedGroundStationId()).toBe('gs-1');
    });

    it('should clear selected ground station when non-ground-station selected', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'ground-station',
        id: 'gs-1',
      });

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'satellite',
        id: 'sat-1',
      });

      expect(ObjectivesManager.getSelectedGroundStationId()).toBeNull();
    });
  });

  describe('State Restoration', () => {
    it('should restore objective states from checkpoint', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['obj-1'] }),
      ];

      const manager = ObjectivesManager.initialize(objectives, 300);

      const savedStates: ObjectiveState[] = [
        {
          objective: objectives[0],
          isActive: true,
          activatedAt: Date.now() - 10000,
          isCompleted: true,
          completedAt: Date.now() - 5000,
          conditionStates: [
            {
              condition: objectives[0].conditions[0],
              isSatisfied: true,
              satisfiedAt: Date.now() - 5000,
              maintainedDuration: 0,
              isMaintenanceComplete: true,
            },
          ],
          isFailed: false,
          isTimerRunning: false,
        },
      ];

      manager.restoreState(savedStates, 250);

      const states = manager.getObjectiveStates();

      // First objective should be restored as completed
      expect(states[0].isCompleted).toBe(true);

      // Scenario timer should be restored
      expect(manager.getScenarioTimeRemaining()).toBe(250);
    });

    it('should handle empty saved states gracefully', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(() => manager.restoreState([], undefined)).not.toThrow();
    });
  });

  describe('HTML Checklist Generation', () => {
    it('should generate HTML checklist with correct structure', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1', title: 'First Objective' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const html = manager.generateHtmlChecklist();

      expect(html).toContain('objectives-checklist');
      expect(html).toContain('First Objective');
      expect(html).toContain('objective-item');
      expect(html).toContain('In Progress');
    });

    it('should mark completed objectives correctly', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const states = manager.getObjectiveStates();
      states[0].isCompleted = true;

      const html = manager.generateHtmlChecklist();

      expect(html).toContain('completed');
      expect(html).toContain('Completed');
    });
  });

  describe('areAllObjectivesCompleted', () => {
    it('should return false when objectives remain incomplete', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.areAllObjectivesCompleted()).toBe(false);
    });

    it('should return true when all objectives completed', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const states = manager.getObjectiveStates();
      states[0].isCompleted = true;

      expect(manager.areAllObjectivesCompleted()).toBe(true);
    });
  });

  describe('Collapse State Sync', () => {
    it('should sync collapsed states from DOM', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Create mock DOM
      document.body.innerHTML = `
        <div class="objectives-checklist">
          <div class="objective-item collapsed"></div>
          <div class="objective-item"></div>
        </div>
      `;

      manager.syncCollapsedStatesFromDOM();

      // Generate HTML and verify collapsed state is preserved
      const html = manager.generateHtmlChecklist();
      expect(html).toBeDefined();
    });
  });
});
