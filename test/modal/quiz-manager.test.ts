import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { QuizManager } from '../../src/modal/quiz-manager';

describe('QuizManager', () => {
  let quizManager: QuizManager;
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singletons
    QuizManager.destroy();
    EventBus.destroy();

    eventBus = EventBus.getInstance();
    quizManager = QuizManager.getInstance();
  });

  afterEach(() => {
    QuizManager.destroy();
    EventBus.destroy();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = QuizManager.getInstance();
      const instance2 = QuizManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('registerQuiz', () => {
    it('should register a new quiz', () => {
      quizManager.registerQuiz(
        'objective-1',
        0,
        'What is the correct answer?',
        ['A', 'B', 'C', 'D'],
        2,
        'Explanation text',
        5
      );

      expect(quizManager.hasQuiz('objective-1', 0)).toBe(true);
    });

    it('should emit QUIZ_PENDING event when registering', () => {
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_PENDING, callback);

      quizManager.registerQuiz(
        'objective-1',
        0,
        'Question?',
        ['A', 'B'],
        0
      );

      expect(callback).toHaveBeenCalledWith({
        objectiveId: 'objective-1',
        conditionIndex: 0,
      });
    });

    it('should not re-register an existing quiz', () => {
      const callback = jest.fn();

      quizManager.registerQuiz('objective-1', 0, 'First question', ['A', 'B'], 0);

      eventBus.on(Events.QUIZ_PENDING, callback);

      quizManager.registerQuiz('objective-1', 0, 'Second question', ['X', 'Y'], 1);

      // Should not emit again for the same quiz
      expect(callback).not.toHaveBeenCalled();
    });

    it('should use default point penalty of 5', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      // Show the quiz to verify point penalty is used
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_SHOW, callback);

      quizManager.showQuiz('objective-1', 0);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          pointPenalty: 5,
        })
      );
    });
  });

  describe('hasQuiz', () => {
    it('should return false for non-existent quiz', () => {
      expect(quizManager.hasQuiz('non-existent', 0)).toBe(false);
    });

    it('should return true for registered quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.hasQuiz('objective-1', 0)).toBe(true);
    });

    it('should distinguish between different condition indices', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question 1?', ['A', 'B'], 0);

      expect(quizManager.hasQuiz('objective-1', 0)).toBe(true);
      expect(quizManager.hasQuiz('objective-1', 1)).toBe(false);
    });
  });

  describe('isQuizComplete', () => {
    it('should return false for non-existent quiz', () => {
      expect(quizManager.isQuizComplete('non-existent', 0)).toBe(false);
    });

    it('should return false for new quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.isQuizComplete('objective-1', 0)).toBe(false);
    });

    it('should return true after quiz is completed', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      // Simulate quiz completion
      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      });

      expect(quizManager.isQuizComplete('objective-1', 0)).toBe(true);
    });
  });

  describe('hasPendingQuiz', () => {
    it('should return false initially', () => {
      expect(quizManager.hasPendingQuiz()).toBe(false);
    });

    it('should return true after registering a quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.hasPendingQuiz()).toBe(true);
    });

    it('should return false after quiz is passed', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      expect(quizManager.hasPendingQuiz()).toBe(false);
    });
  });

  describe('getPendingQuizKey', () => {
    it('should return null initially', () => {
      expect(quizManager.getPendingQuizKey()).toBeNull();
    });

    it('should return the key of the pending quiz', () => {
      quizManager.registerQuiz('objective-1', 2, 'Question?', ['A', 'B'], 0);

      expect(quizManager.getPendingQuizKey()).toBe('objective-1:2');
    });
  });

  describe('showQuiz', () => {
    it('should emit QUIZ_SHOW event with quiz data', () => {
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_SHOW, callback);

      quizManager.registerQuiz(
        'objective-1',
        0,
        'What is 2+2?',
        ['3', '4', '5', '6'],
        1,
        'Basic math',
        10
      );

      quizManager.showQuiz('objective-1', 0);

      expect(callback).toHaveBeenCalledWith({
        objectiveId: 'objective-1',
        conditionIndex: 0,
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        explanation: 'Basic math',
        pointPenalty: 10,
      });
    });

    it('should log error for non-existent quiz', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      quizManager.showQuiz('non-existent', 0);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No quiz registered for')
      );

      consoleSpy.mockRestore();
    });

    it('should not show already completed quiz', () => {
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_SHOW, callback);

      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      });

      callback.mockClear();
      quizManager.showQuiz('objective-1', 0);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should set pending quiz key when showing', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      // Manually set pending key to something else
      (quizManager as any).pendingQuizKey_ = null;

      quizManager.showQuiz('objective-1', 0);

      expect(quizManager.getPendingQuizKey()).toBe('objective-1:0');
    });
  });

  describe('reopenPendingQuiz', () => {
    it('should do nothing if no pending quiz', () => {
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_SHOW, callback);

      quizManager.reopenPendingQuiz();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should show the pending quiz', () => {
      const callback = jest.fn();
      eventBus.on(Events.QUIZ_SHOW, callback);

      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);
      callback.mockClear();

      quizManager.reopenPendingQuiz();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'objective-1',
          conditionIndex: 0,
        })
      );
    });
  });

  describe('getAttempts', () => {
    it('should return 0 for non-existent quiz', () => {
      expect(quizManager.getAttempts('non-existent', 0)).toBe(0);
    });

    it('should return 0 for new quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.getAttempts('objective-1', 0)).toBe(0);
    });

    it('should track incorrect attempts', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 1);

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: false,
        selectedIndex: 0,
        attempts: 1,
        pointsDeducted: 5,
      });

      expect(quizManager.getAttempts('objective-1', 0)).toBe(1);
    });

    it('should not increment attempts for correct answers via QUIZ_ANSWERED', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: true,
        selectedIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      // Correct answers are handled by QUIZ_PASSED, not QUIZ_ANSWERED
      expect(quizManager.getAttempts('objective-1', 0)).toBe(0);
    });
  });

  describe('getPointsDeducted', () => {
    it('should return 0 for non-existent quiz', () => {
      expect(quizManager.getPointsDeducted('non-existent', 0)).toBe(0);
    });

    it('should return 0 for new quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.getPointsDeducted('objective-1', 0)).toBe(0);
    });

    it('should track points deducted from incorrect answers', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 1, undefined, 5);

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: false,
        selectedIndex: 0,
        attempts: 1,
        pointsDeducted: 5,
      });

      expect(quizManager.getPointsDeducted('objective-1', 0)).toBe(5);
    });
  });

  describe('reset', () => {
    it('should clear all quiz states', () => {
      quizManager.registerQuiz('objective-1', 0, 'Q1?', ['A', 'B'], 0);
      quizManager.registerQuiz('objective-2', 0, 'Q2?', ['X', 'Y'], 1);

      quizManager.reset();

      expect(quizManager.hasQuiz('objective-1', 0)).toBe(false);
      expect(quizManager.hasQuiz('objective-2', 0)).toBe(false);
    });

    it('should clear pending quiz', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.hasPendingQuiz()).toBe(true);

      quizManager.reset();

      expect(quizManager.hasPendingQuiz()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should reset singleton instance', () => {
      const instance1 = QuizManager.getInstance();

      QuizManager.destroy();

      const instance2 = QuizManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should remove event listeners', () => {
      const quizManager1 = QuizManager.getInstance();
      quizManager1.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      QuizManager.destroy();

      // Create new event bus and quiz manager
      EventBus.destroy();
      const newEventBus = EventBus.getInstance();
      const quizManager2 = QuizManager.getInstance();

      // Old event handlers should not be triggered
      const callback = jest.fn();
      newEventBus.on(Events.QUIZ_PENDING, callback);

      quizManager2.registerQuiz('objective-2', 0, 'New Question?', ['X', 'Y'], 0);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event: QUIZ_ANSWERED (incorrect)', () => {
    it('should increment attempts for incorrect answers', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 1);

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: false,
        selectedIndex: 0,
        attempts: 1,
        pointsDeducted: 5,
      });

      expect(quizManager.getAttempts('objective-1', 0)).toBe(1);
    });

    it('should track total points deducted', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 1);

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: false,
        selectedIndex: 0,
        attempts: 1,
        pointsDeducted: 5,
      });

      eventBus.emit(Events.QUIZ_ANSWERED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        isCorrect: false,
        selectedIndex: 0,
        attempts: 2,
        pointsDeducted: 10,
      });

      expect(quizManager.getPointsDeducted('objective-1', 0)).toBe(10);
    });
  });

  describe('Event: QUIZ_PASSED', () => {
    it('should clear pending quiz key', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      expect(quizManager.hasPendingQuiz()).toBe(true);

      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      expect(quizManager.hasPendingQuiz()).toBe(false);
    });

    it('should not mark quiz as complete yet', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      // isComplete should still be false - only QUIZ_COMPLETED sets it to true
      expect(quizManager.isQuizComplete('objective-1', 0)).toBe(false);
    });

    it('should update attempts and points from passed data', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        attempts: 3,
        pointsDeducted: 10,
      });

      expect(quizManager.getAttempts('objective-1', 0)).toBe(3);
      expect(quizManager.getPointsDeducted('objective-1', 0)).toBe(10);
    });
  });

  describe('Event: QUIZ_COMPLETED', () => {
    it('should mark quiz as complete', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        totalAttempts: 2,
        totalPointsDeducted: 5,
      });

      expect(quizManager.isQuizComplete('objective-1', 0)).toBe(true);
    });

    it('should update final attempts and points', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
        totalAttempts: 4,
        totalPointsDeducted: 15,
      });

      expect(quizManager.getAttempts('objective-1', 0)).toBe(4);
      expect(quizManager.getPointsDeducted('objective-1', 0)).toBe(15);
    });
  });

  describe('Event: QUIZ_DISMISSED', () => {
    it('should keep quiz as pending after dismissal', () => {
      quizManager.registerQuiz('objective-1', 0, 'Question?', ['A', 'B'], 0);

      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'objective-1',
        conditionIndex: 0,
      });

      // Quiz should still be pending - user can reopen it
      expect(quizManager.hasPendingQuiz()).toBe(true);
    });
  });
});
