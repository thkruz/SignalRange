import { MOCK_EXAM_PASS, scoreMockExam, selectMockExam, selectReview } from '../../../src/ham/quiz/mock-exam';
import type { QuizHistoryEntry } from '../../../src/ham/quiz/quiz-history';
import { getOfficialQuestion, groups } from '../../../src/ham/quiz/technician-quiz';

describe('mock exam', () => {
  it('picks one per group, deterministically', () => {
    const a = selectMockExam(7);
    expect(a).toHaveLength(35);
    expect(new Set(a.map((q) => q.group)).size).toBe(35);
    expect(selectMockExam(7).map((q) => q.id)).toEqual(a.map((q) => q.id));
    expect(selectMockExam(8).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('passes at 26 of 35', () => {
    const exam = selectMockExam(1);
    const answers = (right: number): Record<string, number> => Object.fromEntries(exam.map((q, i) => [q.id, i < right ? q.correctIndex : (q.correctIndex + 1) % 4]));
    expect(MOCK_EXAM_PASS).toBe(26);
    expect(scoreMockExam(answers(26), exam)).toMatchObject({ correct: 26, passed: true });
    const fail = scoreMockExam(answers(25), exam);
    expect(fail.passed).toBe(false);
    expect(fail.missedIds).toHaveLength(10);
  });

  it('review prioritizes missed groups', () => {
    const t3 = (groups().get('T3B') ?? []).map((q) => q.id);
    const other = (groups().get('T1A') ?? []).map((q) => q.id);
    const history: QuizHistoryEntry[] = [{ id: t3[0], group: 'T3B', firstAttemptCorrect: false, attempts: 2 }];
    const review = selectReview([...other, ...t3], history, 3, 5);
    expect(review).toHaveLength(5);
    expect(review.slice(0, t3.length).every((q) => q.group === 'T3B')).toBe(true);
    expect(selectReview([...other, ...t3], history, 3, 5).map((q) => q.id)).toEqual(review.map((q) => q.id));
    expect(getOfficialQuestion(review[0].id)).toBeDefined();
  });
});
