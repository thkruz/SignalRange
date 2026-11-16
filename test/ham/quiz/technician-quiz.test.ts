import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allOfficialQuestions, buildQuizCondition, getOfficialQuestion, getScenarioItems, groups } from '../../../src/ham/quiz/technician-quiz';
import { Character } from '../../../src/modal/character-enum';

const privatePool = join(process.cwd(), 'src/private/course-material/technician-2026-2030/pool.json');
const allItems = Array.from({ length: 12 }, (_, i) => getScenarioItems(i + 1)).flat();

describe('technician quiz data', () => {
  it('has the expected counts', () => {
    expect(allOfficialQuestions()).toHaveLength(409);
    expect(groups().size).toBe(35);
    expect(allItems).toHaveLength(120);
    expect(new Set(allItems.filter((i) => i.kind === 'official').map((i) => i.officialId)).size).toBe(96);
    expect(getScenarioItems(1, 1).every((i) => i.checkpoint === 1)).toBe(true);
  });

  it.skipIf(!existsSync(privatePool))('matches the private pool wording exactly', () => {
    const pool = JSON.parse(readFileSync(privatePool, 'utf8')) as { questions: Array<{ id: string; question: string; options: string[]; answer: string }> };
    for (const q of pool.questions) {
      const mine = getOfficialQuestion(q.id);
      expect(mine?.stem).toBe(q.question);
      expect(mine?.options).toEqual(q.options);
      expect(mine?.correctIndex).toBe('ABCD'.indexOf(q.answer));
    }
  });

  it('builds official conditions with metadata and fixed option order', () => {
    const item = allItems.find((i) => i.kind === 'official');
    if (!item) throw new Error('no official item');
    const cond = buildQuizCondition(item.localId);
    expect(cond.type).toBe('status-check');
    expect(cond.params?.preserveOptionOrder).toBe(true);
    expect(cond.params?.character).toBe(Character.RILEY_BROOKS);
    expect(cond.params?.options).toEqual(getOfficialQuestion(item.officialId as string)?.options);
    expect(cond.params?.quizSource).toMatchObject({ kind: 'official', questionId: item.officialId, poolRevision: '2026-02-19' });
  });

  it('builds applied conditions and attaches figures', () => {
    const applied = allItems.find((i) => i.kind === 'applied');
    expect(buildQuizCondition(applied?.localId as string).params?.quizSource?.kind).toBe('applied');
    const fig = allItems.find((i) => i.figure);
    const params = buildQuizCondition(fig?.localId as string, { reviewHint: 'Review T6' }).params;
    expect(params?.figureUrl).toContain('figure-T');
    expect(params?.figureAlt).toBeTruthy();
    expect(params?.reviewHint).toBe('Review T6');
    expect(() => buildQuizCondition('nope')).toThrow();
  });
});
