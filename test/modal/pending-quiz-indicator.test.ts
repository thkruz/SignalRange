import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { PendingQuizIndicator } from '../../src/modal/pending-quiz-indicator';
import { QuizManager } from '../../src/modal/quiz-manager';

// Mock QuizManager
jest.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: jest.fn(() => ({
      reopenPendingQuiz: jest.fn(),
    })),
  },
}));

describe('PendingQuizIndicator', () => {
  let indicator: PendingQuizIndicator;
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singletons
    PendingQuizIndicator.destroy();
    EventBus.destroy();

    document.body.innerHTML = '';
    eventBus = EventBus.getInstance();
    indicator = PendingQuizIndicator.getInstance();
    jest.useFakeTimers();
  });

  afterEach(() => {
    PendingQuizIndicator.destroy();
    document.body.innerHTML = '';
    EventBus.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PendingQuizIndicator.getInstance();
      const instance2 = PendingQuizIndicator.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('DOM Creation', () => {
    it('should create indicator element on instantiation', () => {
      const indicatorElement = document.querySelector('.pending-quiz-indicator');
      expect(indicatorElement).toBeTruthy();
    });

    it('should create icon element', () => {
      const iconElement = document.querySelector('.pending-quiz-indicator__icon');
      expect(iconElement).toBeTruthy();
      expect(iconElement?.innerHTML).toBe('?');
    });

    it('should create message element', () => {
      const messageElement = document.querySelector('.pending-quiz-indicator__message');
      expect(messageElement).toBeTruthy();
      expect(messageElement?.textContent).toBe('Quiz pending');
    });

    it('should create open button', () => {
      const openButton = document.querySelector('.pending-quiz-indicator__open-btn');
      expect(openButton).toBeTruthy();
      expect(openButton?.textContent).toBe('Open Quiz');
    });
  });

  describe('isVisible', () => {
    it('should return false initially', () => {
      expect(indicator.isVisible()).toBe(false);
    });

    it('should return true when indicator is showing', () => {
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);
    });
  });

  describe('Event: QUIZ_PENDING', () => {
    it('should show indicator after delay', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      // Should not be visible immediately
      expect(indicator.isVisible()).toBe(false);

      // Wait for the delay
      jest.advanceTimersByTime(5000);
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);
    });

    it('should update message to completion message', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(5000);

      const messageElement = document.querySelector('.pending-quiz-indicator__message');
      expect(messageElement?.textContent).toBe('Complete the quiz to continue');
    });

    it('should cancel previous pending timeout when new pending event occurs', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(3000);

      // New pending event
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-2',
        conditionIndex: 0,
      });

      // Wait only 3 more seconds (total 6 from first event, 3 from second)
      jest.advanceTimersByTime(3000);

      // Should not be visible yet (need 5 seconds from second event)
      expect(indicator.isVisible()).toBe(false);

      // Complete the remaining time
      jest.advanceTimersByTime(2000);
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);
    });
  });

  describe('Event: QUIZ_SHOW', () => {
    it('should hide indicator when quiz is shown', () => {
      // First, make indicator visible via dismissal
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);

      // Show the quiz
      eventBus.emit(Events.QUIZ_SHOW, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        question: 'Test?',
        options: ['A', 'B'],
        correctIndex: 0,
        pointPenalty: 5,
      });

      expect(indicator.isVisible()).toBe(false);
    });

    it('should cancel pending timeout when quiz is shown', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(3000);

      eventBus.emit(Events.QUIZ_SHOW, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        question: 'Test?',
        options: ['A', 'B'],
        correctIndex: 0,
        pointPenalty: 5,
      });

      // Wait for the remaining pending time
      jest.advanceTimersByTime(3000);
      jest.runAllTimers();

      // Should not show because timeout was cancelled
      expect(indicator.isVisible()).toBe(false);
    });
  });

  describe('Event: QUIZ_DISMISSED', () => {
    it('should show indicator when quiz is dismissed', () => {
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);
    });

    it('should update message when quiz is dismissed', () => {
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      const messageElement = document.querySelector('.pending-quiz-indicator__message');
      expect(messageElement?.textContent).toBe('Complete the quiz to continue');
    });
  });

  describe('Event: QUIZ_COMPLETED', () => {
    it('should hide indicator when quiz is completed', () => {
      // First, make indicator visible
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);

      // Complete the quiz
      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      });

      expect(indicator.isVisible()).toBe(false);
    });

    it('should cancel pending timeout when quiz is completed', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(3000);

      eventBus.emit(Events.QUIZ_COMPLETED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      });

      jest.advanceTimersByTime(3000);
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(false);
    });
  });

  describe('Event: QUIZ_PASSED', () => {
    it('should hide indicator when quiz is passed', () => {
      // First, make indicator visible
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);

      // Pass the quiz
      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      expect(indicator.isVisible()).toBe(false);
    });

    it('should cancel pending timeout when quiz is passed', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(3000);

      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      jest.advanceTimersByTime(3000);
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(false);
    });
  });

  describe('Open Button', () => {
    it('should call QuizManager.reopenPendingQuiz when clicked', () => {
      const mockReopenPendingQuiz = jest.fn();
      (QuizManager.getInstance as jest.Mock).mockReturnValue({
        reopenPendingQuiz: mockReopenPendingQuiz,
      });

      const openButton = document.querySelector('.pending-quiz-indicator__open-btn') as HTMLElement;
      openButton?.click();

      expect(mockReopenPendingQuiz).toHaveBeenCalled();
    });
  });

  describe('suppress', () => {
    it('should hide indicator when suppressed', () => {
      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(true);

      indicator.suppress();

      expect(indicator.isVisible()).toBe(false);
    });

    it('should prevent indicator from showing after suppression', () => {
      indicator.suppress();

      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(false);
    });

    it('should cancel pending timeout when suppressed', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      jest.advanceTimersByTime(3000);

      indicator.suppress();

      jest.advanceTimersByTime(3000);
      jest.runAllTimers();

      expect(indicator.isVisible()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should remove indicator element from DOM', () => {
      expect(document.querySelector('.pending-quiz-indicator')).toBeTruthy();

      indicator.dispose();

      expect(document.querySelector('.pending-quiz-indicator')).toBeNull();
    });

    it('should cancel pending timeout', () => {
      eventBus.emit(Events.QUIZ_PENDING, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });

      indicator.dispose();

      jest.advanceTimersByTime(6000);
      jest.runAllTimers();

      // Element is removed, so isVisible will return false
      expect((indicator as any).indicatorElement_).toBeNull();
    });

    it('should unsubscribe from all events', () => {
      indicator.dispose();

      // Reset instance to create new one
      (PendingQuizIndicator as any).instance_ = null;
      const newIndicator = PendingQuizIndicator.getInstance();

      eventBus.emit(Events.QUIZ_DISMISSED, {
        objectiveId: 'obj-1',
        conditionIndex: 0,
      });
      jest.runAllTimers();

      // Only new indicator should be visible
      expect(newIndicator.isVisible()).toBe(true);
    });

    it('should set element references to null', () => {
      indicator.dispose();

      expect((indicator as any).indicatorElement_).toBeNull();
      expect((indicator as any).iconElement_).toBeNull();
      expect((indicator as any).messageElement_).toBeNull();
      expect((indicator as any).openButton_).toBeNull();
    });

    it('should reset singleton instance to null', () => {
      indicator.dispose();

      expect((PendingQuizIndicator as any).instance_).toBeNull();
    });
  });

  describe('destroy (static)', () => {
    it('should call dispose on the instance', () => {
      const disposeSpy = jest.spyOn(indicator, 'dispose');

      PendingQuizIndicator.destroy();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle case when no instance exists', () => {
      PendingQuizIndicator.destroy();

      // Should not throw
      expect(() => PendingQuizIndicator.destroy()).not.toThrow();
    });
  });
});
