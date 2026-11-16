import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { QuizPrompt } from '../../../src/ham/ui/panels/quiz-prompt';
import { QuizManager } from '../../../src/modal/quiz-manager';

describe('QuizPrompt', () => {
  beforeEach(() => {
    QuizManager.destroy();
    EventBus.destroy();
  });
  afterEach(() => {
    QuizManager.destroy();
    EventBus.destroy();
    document.body.replaceChildren();
  });

  const q = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`);

  it('is hidden when no quiz is pending', () => {
    QuizManager.getInstance();
    const p = new QuizPrompt();
    document.body.append(p.el);
    expect(q('ham-hint-quiz-prompt')?.hidden).toBe(true);
    p.dispose();
  });

  it('appears when a quiz is registered and the button reopens the same quiz', async () => {
    const p = new QuizPrompt();
    document.body.append(p.el);
    const shown: unknown[] = [];
    EventBus.getInstance().on(Events.QUIZ_SHOW, (d) => shown.push(d));
    QuizManager.getInstance().registerQuiz('obj-1', 0, 'Question?', ['A', 'B'], 1, 'Because.', 5);
    await Promise.resolve();
    expect(q('ham-hint-quiz-prompt')?.hidden).toBe(false);
    expect(q('ham-hint-quiz-prompt')?.textContent).toContain('Riley: Quick check');
    q('ham-hint-take-quiz')?.click();
    expect(shown.length).toBeGreaterThan(0);
    expect(QuizManager.getInstance().getPendingQuizKey()).toBe('obj-1:0');
    expect(QuizManager.getInstance().hasQuiz('obj-1', 1)).toBe(false);
    p.dispose();
  });

  it('hides again once the quiz is passed', async () => {
    const p = new QuizPrompt();
    document.body.append(p.el);
    QuizManager.getInstance().registerQuiz('obj-1', 0, 'Question?', ['A', 'B'], 1, 'Because.', 5);
    await Promise.resolve();
    expect(p.el.hidden).toBe(false);
    EventBus.getInstance().emit(Events.QUIZ_PASSED, { objectiveId: 'obj-1', conditionIndex: 0 } as never);
    await Promise.resolve();
    expect(p.el.hidden).toBe(true);
    p.dispose();
  });
});
