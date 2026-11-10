import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { QUIZ_HISTORY_KEY, QuizHistory } from '../../../src/ham/quiz/quiz-history';

describe('QuizHistory', () => {
  beforeEach(() => localStorage.clear());

  it('first attempt decides firstAttemptCorrect; attempts accumulate and persist', () => {
    const h = new QuizHistory();
    h.record('T1A01', false, { group: 'T1A', scenario: 2 });
    h.record('T1A01', true, { group: 'T1A', scenario: 3 });
    h.record('T1B01', true, { group: 'T1B' });
    expect(h.get('T1A01')).toMatchObject({ firstAttemptCorrect: false, attempts: 2, lastScenario: 3 });
    expect(h.missedGroups()).toEqual(['T1A']);
    h.markForReview('T1B01', 'T1B');
    expect(h.missedGroups()).toEqual(['T1A', 'T1B']);
    expect(new QuizHistory().get('T1A01')?.attempts).toBe(2);
    expect(localStorage.getItem(QUIZ_HISTORY_KEY)).toContain('T1A01');
  });

  it('records from quiz events (wrong via ANSWERED, correct via PASSED)', () => {
    const h = new QuizHistory();
    const off = h.install();
    const bus = EventBus.getInstance();
    const base = { objectiveId: 'o1', conditionIndex: 0 };
    bus.emit(Events.QUIZ_SHOW, {
      ...base,
      question: 'q',
      options: ['a', 'b'],
      correctIndex: 0,
      pointPenalty: 5,
      quizSource: { kind: 'official', questionId: 'T9Z01', group: 'T9Z' },
    });
    bus.emit(Events.QUIZ_ANSWERED, { ...base, isCorrect: false, selectedIndex: 1, attempts: 1, pointsDeducted: 5 });
    bus.emit(Events.QUIZ_PASSED, { ...base, attempts: 2, pointsDeducted: 5 });
    expect(h.get('T9Z01')).toMatchObject({ firstAttemptCorrect: false, attempts: 2, group: 'T9Z' });
    off();
    bus.emit(Events.QUIZ_PASSED, { ...base, attempts: 3, pointsDeducted: 5 });
    expect(h.get('T9Z01')?.attempts).toBe(2);
  });

  it('survives throwing storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const h = new QuizHistory();
    expect(() => h.record('X', true)).not.toThrow();
    expect(h.get('X')?.firstAttemptCorrect).toBe(true);
    spy.mockRestore();
  });
});
