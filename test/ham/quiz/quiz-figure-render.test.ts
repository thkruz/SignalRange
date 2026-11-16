/**
 * Renders the real quiz modal for every C3 question that carries an official figure (T-1, T-2, T-3)
 * and checks the image and its alt text; the local file check runs only where the R2 assets are present.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/engine/ui/draggable-box', () => ({
  DraggableBox: class {
    protected boxId: string;
    protected title: string;
    protected boxEl: HTMLElement | null = null;
    constructor(id: string, options: { title: string }) {
      this.boxId = id;
      this.title = options.title;
    }
    static increaseMaxZIndex(): number {
      return 101;
    }
    static getMaxZIndex(): number {
      return 100;
    }
    protected onOpen(): void {
      this.boxEl = document.getElementById(this.boxId);
    }
    open(cb?: () => void): void {
      cb?.();
    }
    close(cb?: () => void): void {
      cb?.();
    }
  },
}));
vi.mock('../../../src/modal/quiz-modal.css', () => ({}));

import { EventBus } from '../../../src/events/event-bus';
import { Events, type QuizShowData } from '../../../src/events/events';
import { allOfficialQuestions, buildQuizCondition, figureParams } from '../../../src/ham/quiz/technician-quiz';
import { Character } from '../../../src/modal/character-enum';
import { QuizManager } from '../../../src/modal/quiz-manager';
import { QuizModal } from '../../../src/modal/quiz-modal';

const figureItems = allOfficialQuestions().filter((q) => q.figure);
const FIGURE_DIR = resolve(__dirname, '../../../public/assets/campaigns/home-sdr/figures');

describe('quiz modal figures', () => {
  beforeEach(() => {
    (QuizModal as unknown as { instance_: unknown }).instance_ = null;
    EventBus.destroy();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    QuizModal.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('a scenario item carries its figure through buildQuizCondition', () => {
    const params = buildQuizCondition('S02-Q2').params;
    expect(params?.figureUrl).toContain('figure-T1.jpg');
    expect(params?.figureAlt).toMatch(/Figure T-1/u);
  });

  it('has official questions that use T-1, T-2 and T-3', () => {
    const files = new Set(figureItems.map((i) => i.figure));
    expect([...files].sort()).toEqual(['figure-T1.jpg', 'figure-T2.jpg', 'figure-T3.jpg']);
  });

  // Campaign JPGs are gitignored and ship through r2:sync, so a clean checkout (CI) has no local copy
  it.skipIf(!existsSync(FIGURE_DIR)).each(['figure-T1.jpg', 'figure-T2.jpg', 'figure-T3.jpg'])('local asset %s exists', (file) => {
    expect(existsSync(resolve(FIGURE_DIR, file))).toBe(true);
  });

  it.each(['figure-T1.jpg', 'figure-T2.jpg', 'figure-T3.jpg'])('renders %s with alt text through the manager and modal', (file) => {
    const item = figureItems.find((i) => i.figure === file);
    if (!item) throw new Error(`no official question for ${file}`);
    const p = { question: item.stem, options: item.options, correctIndex: item.correctIndex, explanation: 'x', quizSource: undefined, ...figureParams(file) };

    QuizModal.getInstance();
    const qm = QuizManager.getInstance();
    qm.registerQuiz(`o-${file}`, 0, p.question, p.options, p.correctIndex, p.explanation, 5, Character.RILEY_BROOKS, true, {
      figureUrl: p.figureUrl,
      figureAlt: p.figureAlt,
    });
    let shown: QuizShowData | null = null;
    EventBus.getInstance().on(Events.QUIZ_SHOW, (d: QuizShowData) => {
      shown = d;
    });
    qm.showQuiz(`o-${file}`, 0);
    expect(shown).not.toBeNull();

    const img = document.querySelector<HTMLImageElement>('#quiz-figure img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain(file);
    expect(img?.alt).toMatch(/Figure T-\d from the official NCVEC/u);
    expect(document.querySelector('#quiz-figure figcaption')?.textContent).toBe(img?.alt);
  });
});
