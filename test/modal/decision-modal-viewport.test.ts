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
});
