import { vi } from 'vitest';

vi.mock('draggabilly', () => ({
  default: vi.fn(function () {
    return { on: vi.fn() };
  }),
}));

import { DraggableBox } from '../../src/engine/ui/draggable-box';
import { EventBus } from '../../src/events/event-bus';

class TestBox extends DraggableBox {
  constructor() {
    super('test-box', { title: 'Test' });
    this.onOpen();
  }

  protected getBoxContentHtml(): string {
    return '<p>content</p>';
  }
}

/**
 * Phase 27 (nats-r2 s14-F2, s24-F5): a box re-centred on every open, so the
 * checklist came back over the console wherever the player had dragged it.
 */
describe('DraggableBox placement', () => {
  beforeEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '<div id="root"></div>';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    EventBus.destroy();
  });

  it('centres on the first open', () => {
    const box = new TestBox();
    box.open();
    const el = document.getElementById('test-box')!;

    expect(el.style.left).toBe('800px');
    expect(el.style.top).toBe('450px');
  });

  it('reopens where the player dragged it', () => {
    const box = new TestBox();
    box.open();
    const el = document.getElementById('test-box')!;

    // Draggabilly writes left/top when a drag ends
    el.style.left = '1200px';
    el.style.top = '120px';
    box.close();
    box.open();

    expect(el.style.left).toBe('1200px');
    expect(el.style.top).toBe('120px');
  });

  it('centres again if the remembered position is now off-screen', () => {
    const box = new TestBox();
    box.open();
    const el = document.getElementById('test-box')!;
    el.style.left = '3000px';
    box.close();
    box.open();

    expect(el.style.left).toBe('800px');
  });
});
