import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { PendingQuizIndicator } from '../../src/modal/pending-quiz-indicator';
import { QuizManager } from '../../src/modal/quiz-manager';

// Real QuizManager and indicator together (the indicator test mocks the manager): issue 306
describe('Open Quiz with the real QuizManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    PendingQuizIndicator.destroy();
    QuizManager.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
    QuizManager.getInstance();
    PendingQuizIndicator.getInstance();
  });
  afterEach(() => {
    PendingQuizIndicator.destroy();
    QuizManager.destroy();
    EventBus.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const open = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.pending-quiz-indicator__open-btn')!;
  const shown = (): boolean => document.querySelector('.pending-quiz-indicator')!.classList.contains('show');
  const register = (obj: string, i: number): void => QuizManager.getInstance().registerQuiz(obj, i, `Q ${obj}${i}`, ['a', 'b'], 0);

  it('shows the toast for the second quiz after the first is completed, and its first click opens that quiz', () => {
    const bus = EventBus.getInstance();
    const seen: string[] = [];
    bus.on(Events.QUIZ_SHOW, (d) => seen.push(`${d.objectiveId}:${d.conditionIndex}`));
    register('o1', 0);
    register('o1', 1);
    vi.advanceTimersByTime(5000);
    expect(shown()).toBe(true);
    // The player answers the pending quiz and presses Continue
    const key = QuizManager.getInstance().getPendingQuizKey()!;
    const [obj, idx] = key.split(':');
    bus.emit(Events.QUIZ_SHOW, { objectiveId: obj, conditionIndex: Number(idx), question: 'q', options: ['a', 'b'], correctIndex: 0, pointPenalty: 5 });
    bus.emit(Events.QUIZ_PASSED, { objectiveId: obj, conditionIndex: Number(idx), attempts: 1, pointsDeducted: 0 });
    bus.emit(Events.QUIZ_COMPLETED, { objectiveId: obj, conditionIndex: Number(idx) });
    expect(shown()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(shown()).toBe(true);
    seen.length = 0;
    open().click();
    expect(seen).toHaveLength(1);
  });
});
