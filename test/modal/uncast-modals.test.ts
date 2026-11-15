import { vi } from 'vitest';

vi.mock('../../src/utils/asset-url', () => ({
  getAssetUrl: vi.fn((path: string) => path),
}));
vi.mock('../../src/modal/quiz-modal.css', () => ({}));
vi.mock('../../src/modal/decision-modal.css', () => ({}));
vi.mock('../../src/modal/character-portrait.css', () => ({}));
vi.mock('../../src/engine/ui/draggable-box', () => ({
  DraggableBox: class MockDraggableBox {
    protected boxEl: HTMLElement | null = null;
    protected boxId: string;
    protected title: string;
    constructor(id: string, options: { width: string; title: string; skipDomCreation?: boolean }) {
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
      if (cb) cb();
    }
    close(cb?: () => void): void {
      if (cb) cb();
    }
  },
}));

import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { Character } from '../../src/modal/character-enum';
import { DecisionModal } from '../../src/modal/decision-modal';
import { QuizModal } from '../../src/modal/quiz-modal';

describe('modals with an uncast speaker (no avatar <img>)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    QuizModal.destroy();
    DecisionModal.destroy();
    EventBus.destroy();
  });

  afterEach(() => {
    QuizModal.destroy();
    DecisionModal.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('quiz: the plate carries the avatar id and a correct answer shows feedback and Continue', () => {
    vi.useFakeTimers();
    const modal = QuizModal.getInstance();
    EventBus.getInstance().emit(Events.QUIZ_SHOW, {
      objectiveId: 'o',
      conditionIndex: 0,
      question: 'Q?',
      options: ['A', 'B'],
      correctIndex: 1,
      pointPenalty: 5,
      explanation: 'Because B.',
      character: Character.MAREK_DOMANSKI,
      preserveOptionOrder: true,
    });
    const avatar = document.getElementById('quiz-avatar');
    expect(avatar?.tagName).toBe('SPAN');
    expect(() => (modal as unknown as { handleOptionClick_(i: number): void }).handleOptionClick_(1)).not.toThrow();
    expect(document.getElementById('quiz-feedback')?.textContent).toContain('Because B.');
    expect(document.getElementById('quiz-continue-btn')).not.toBeNull();
    // pending timers drain under fake time
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('quiz: a wrong answer from an uncast speaker does not throw', () => {
    vi.useFakeTimers();
    const modal = QuizModal.getInstance();
    EventBus.getInstance().emit(Events.QUIZ_SHOW, {
      objectiveId: 'o',
      conditionIndex: 0,
      question: 'Q?',
      options: ['A', 'B'],
      correctIndex: 1,
      pointPenalty: 5,
      character: Character.MAREK_DOMANSKI,
      preserveOptionOrder: true,
    });
    expect(() => (modal as unknown as { handleOptionClick_(i: number): void }).handleOptionClick_(0)).not.toThrow();
    expect(() => vi.runAllTimers()).not.toThrow();
    vi.useRealTimers();
  });

  it('decision: correct and incorrect grading render feedback and Continue without throwing', () => {
    vi.useFakeTimers();
    DecisionModal.getInstance();
    const bus = EventBus.getInstance();
    bus.emit(Events.DECISION_SHOW, {
      objectiveId: 'd',
      conditionIndex: 0,
      prompt: 'Decide.',
      options: ['A', 'B'],
      explanation: 'Why.',
      pointPenalty: 5,
      character: Character.MAREK_DOMANSKI,
      preserveOptionOrder: true,
      evidence: [],
    });
    expect(document.getElementById('decision-avatar')?.tagName).toBe('SPAN');
    const base = { objectiveId: 'd', conditionIndex: 0, optionIndex: 0, correct: false, evidenced: true, missingEvidence: [], attempts: 1, pointsDeducted: 0 };
    expect(() => bus.emit(Events.DECISION_GRADED, { ...base })).not.toThrow();
    expect(() => bus.emit(Events.DECISION_GRADED, { ...base, optionIndex: 1, correct: true })).not.toThrow();
    expect(document.getElementById('decision-continue-btn')).not.toBeNull();
    expect(() => vi.runAllTimers()).not.toThrow();
    vi.useRealTimers();
  });
});
