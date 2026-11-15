import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';

vi.mock('../../src/game-menu/display-viewport', () => ({ displayViewport: () => ({ width: 1280, height: 720 }) }));
vi.mock('../../src/engine/ui/draggable-box', () => ({
  DraggableBox: class MockDraggableBox {
    protected boxId: string;
    protected width: string;
    protected title: string;
    protected boxEl: HTMLElement | null = null;
    constructor(id: string, options: { width: string; title: string }) {
      this.boxId = id;
      this.width = options.width;
      this.title = options.title;
    }
    static increaseMaxZIndex(): number {
      return 101;
    }
    protected onOpen(): void {
      this.boxEl = document.getElementById(this.boxId);
    }
    // Mirrors the real open(): centre on the height at open time, then run the callback
    open(cb?: () => void): void {
      if (!this.boxEl) return;
      this.boxEl.style.top = `${(720 - this.boxEl.offsetHeight) / 2}px`;
      cb?.();
    }
    close(): void {}
  },
}));
vi.mock('../../src/modal/decision-manager', () => ({ DecisionManager: { getInstance: () => ({ answer: vi.fn() }) } }));

const { DecisionModal } = await import('../../src/modal/decision-modal');

describe('DecisionModal viewport clamp', () => {
  beforeEach(() => {
    // An empty box is short; once the options render it is taller than the viewport
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.querySelectorAll('.quiz-option-btn').length > 0 ? 700 : 100;
      },
    });
  });

  it('keeps the box inside the viewport right after it opens, before any answer', () => {
    DecisionModal.getInstance();
    EventBus.getInstance().emit(Events.DECISION_SHOW, {
      objectiveId: 'o1',
      conditionIndex: 0,
      prompt: 'What is this?',
      options: ['A', 'B', 'C', 'D'],
      pointPenalty: 1,
      evidence: [],
    });
    const box = document.getElementById('decision-modal') as HTMLElement;
    const top = parseFloat(box.style.top);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 700).toBeLessThanOrEqual(720);
  });

  function show(): HTMLElement {
    DecisionModal.getInstance();
    EventBus.getInstance().emit(Events.DECISION_SHOW, {
      objectiveId: 'o1',
      conditionIndex: 0,
      prompt: 'What is this?',
      options: ['A', 'B', 'C', 'D'],
      pointPenalty: 1,
      evidence: [],
    });
    return document.getElementById('decision-modal') as HTMLElement;
  }

  const graded = (correct: boolean, pointsDeducted: number) => ({
    objectiveId: 'o1',
    conditionIndex: 0,
    optionIndex: 0,
    correct,
    evidenced: true,
    missingEvidence: [],
    attempts: 1,
    pointsDeducted,
  });

  it('scrolls the penalty notice into view (not just Continue) after a right answer following a wrong one', () => {
    const box = show();
    const scroller = box.querySelector('.draggable-box__content') as HTMLElement;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect;
    scroller.getBoundingClientRect = () => rect(100, 600);
    let st = 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => st, set: (v: number) => (st = v) });
    const penalty = document.getElementById('decision-penalty-notice') as HTMLElement;
    penalty.getBoundingClientRect = () => rect(560, 640);
    const bus = EventBus.getInstance();
    bus.emit(Events.DECISION_GRADED, graded(false, 2));
    scroller.scrollTop = 0;
    bus.emit(Events.DECISION_GRADED, graded(true, 2));
    expect(penalty.style.display).toBe('block');
    expect(penalty.textContent).toContain('-2 points so far');
    // Penalty bottom (640) exceeds scroller bottom (600): scrolled by 44
    expect(scroller.scrollTop).toBe(44);
  });

  it('resets the content scroller when a second decision opens', () => {
    const box = show();
    const scroller = box.querySelector('.draggable-box__content') as HTMLElement;
    let st = 250;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => st, set: (v: number) => (st = v) });
    show();
    expect(scroller.scrollTop).toBe(0);
  });
});
