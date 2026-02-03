import { Mock, Mocked, vi } from 'vitest';
import { RotaryKnob } from '../../../src/components/rotary-knob/rotary-knob';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Sfx } from '../../../src/sound/sfx-enum';
import SoundManager from '../../../src/sound/sound-manager';

vi.mock('../../../src/sound/sound-manager');

describe('RotaryKnob', () => {
  let mockSoundManager: Mocked<SoundManager>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    EventBus.destroy();

    mockSoundManager = {
      play: vi.fn(),
      stop: vi.fn(),
    } as unknown as Mocked<SoundManager>;
    (SoundManager.getInstance as Mock).mockReturnValue(mockSoundManager);

    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  const createKnobInDom = (
    id: string,
    initialValue = 50,
    min = 0,
    max = 100,
    step = 1,
    callback?: (value: number) => void,
    valueOverride?: string
  ): RotaryKnob => {
    const knob = new RotaryKnob(id, initialValue, min, max, step, callback, valueOverride);
    container.innerHTML = knob.html;
    return knob;
  };

  describe('constructor', () => {
    it('should create instance with provided parameters', () => {
      const callback = vi.fn();
      const knob = createKnobInDom('test-knob', 25, 0, 50, 5, callback);

      expect(knob.html).toContain('id="test-knob"');
      expect(knob.html).toContain('rotary-knob');
      expect(knob.getValue()).toBe(25);
    });

    it('should use default parameters when not provided', () => {
      const knob = new RotaryKnob('default-knob');
      container.innerHTML = knob.html;

      expect(knob.getValue()).toBe(0);
    });

    it('should display valueOverride when provided', () => {
      const knob = createKnobInDom('override-knob', 50, 0, 100, 1, undefined, 'CUSTOM');

      expect(knob.html).toContain('CUSTOM');
    });

    it('should display value.toFixed(1) when no valueOverride', () => {
      const knob = createKnobInDom('no-override-knob', 50.5, 0, 100, 0.1);

      expect(knob.html).toContain('50.5');
    });

    it('should register DOM_READY event listener', () => {
      const eventBus = EventBus.getInstance();
      const onSpy = vi.spyOn(eventBus, 'on');

      new RotaryKnob('event-knob');

      expect(onSpy).toHaveBeenCalledWith(Events.DOM_READY, expect.any(Function));
    });
  });

  describe('onDomReady_', () => {
    it('should attach mousedown listener to knob body', () => {
      const knob = createKnobInDom('ready-knob');
      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const addEventListenerSpy = vi.spyOn(knobBody, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });

    it('should attach mousemove listener to document', () => {
      const knob = createKnobInDom('mousemove-knob');
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    });

    it('should attach mouseup listener to document', () => {
      const knob = createKnobInDom('mouseup-knob');
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });

    it('should attach wheel listener to knob body', () => {
      const knob = createKnobInDom('wheel-knob');
      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const addEventListenerSpy = vi.spyOn(knobBody, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    });

    it('should call updateDisplay after setup', () => {
      const knob = createKnobInDom('display-knob', 75);
      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(knobBody.style.transform).toContain('rotate');
    });
  });

  describe('drag interaction', () => {
    it('should start dragging on mousedown', () => {
      const knob = createKnobInDom('drag-start-knob', 50);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(mousedownEvent);

      // Verify drag started by triggering mousemove and checking value change
      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 50, // Moving up by 50px
        clientX: 100,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      // Value should have changed due to drag
      expect(knob.getValue()).not.toBe(50);
    });

    it('should not change value on mousemove when not dragging', () => {
      const knob = createKnobInDom('no-drag-knob', 50);
      EventBus.getInstance().emit(Events.DOM_READY);

      const initialValue = knob.getValue();

      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 0,
        clientX: 200,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getValue()).toBe(initialValue);
    });

    it('should stop dragging on mouseup', () => {
      const knob = createKnobInDom('drag-end-knob', 50);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Start drag
      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(mousedownEvent);

      // End drag
      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseupEvent);

      // Record value after drag ended
      const valueAfterDragEnd = knob.getValue();

      // Further mousemove should not change value
      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 0,
        clientX: 300,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getValue()).toBe(valueAfterDragEnd);
    });

    it('should increase value when dragging up', () => {
      const knob = createKnobInDom('drag-up-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Mock getBoundingClientRect
      vi.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 50,
        height: 50,
        right: 50,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

      // Start drag at y=100
      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(mousedownEvent);

      // Move up to y=50 (delta of +50, which increases value)
      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 50,
        clientX: 25, // Center horizontally
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getValue()).toBeGreaterThan(50);
    });

    it('should decrease value when dragging down', () => {
      const knob = createKnobInDom('drag-down-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      vi.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 50,
        height: 50,
        right: 50,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

      // Start drag at y=100
      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(mousedownEvent);

      // Move down to y=150 (delta of -50, which decreases value)
      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 150,
        clientX: 25,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getValue()).toBeLessThan(50);
    });
  });

  describe('wheel interaction', () => {
    it('should increase value when scrolling up', () => {
      const knob = createKnobInDom('wheel-up-knob', 50, 0, 100, 5);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100, // Scroll up
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getValue()).toBe(55); // Increased by step (5)
    });

    it('should decrease value when scrolling down', () => {
      const knob = createKnobInDom('wheel-down-knob', 50, 0, 100, 5);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100, // Scroll down
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getValue()).toBe(45); // Decreased by step (5)
    });

    it('should prevent default on wheel event', () => {
      const knob = createKnobInDom('wheel-prevent-knob', 50);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

      knobBody.dispatchEvent(wheelEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('setValue_', () => {
    it('should clamp value to min', () => {
      const knob = createKnobInDom('clamp-min-knob', 10, 0, 100, 5);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Multiple scroll downs to go below min
      for (let i = 0; i < 10; i++) {
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: 100,
          bubbles: true,
          cancelable: true,
        });
        knobBody.dispatchEvent(wheelEvent);
      }

      expect(knob.getValue()).toBe(0); // Clamped to min
    });

    it('should clamp value to max', () => {
      const knob = createKnobInDom('clamp-max-knob', 90, 0, 100, 5);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Multiple scroll ups to go above max
      for (let i = 0; i < 10; i++) {
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: -100,
          bubbles: true,
          cancelable: true,
        });
        knobBody.dispatchEvent(wheelEvent);
      }

      expect(knob.getValue()).toBe(100); // Clamped to max
    });

    it('should round value to step', () => {
      const knob = createKnobInDom('step-round-knob', 50, 0, 100, 10);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      // Value should be rounded to nearest step (10)
      expect(knob.getValue() % 10).toBe(0);
    });

    it('should play sound when value changes', () => {
      const knob = createKnobInDom('sound-knob', 50);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(mockSoundManager.play).toHaveBeenCalledWith(Sfx.KNOB);
    });

    it('should not play sound when value does not change', () => {
      const knob = createKnobInDom('no-sound-knob', 100, 0, 100, 1); // At max
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100, // Try to go above max
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(mockSoundManager.play).not.toHaveBeenCalled();
    });

    it('should call callback when value changes', () => {
      const callback = vi.fn();
      const knob = createKnobInDom('callback-knob', 50, 0, 100, 1, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(callback).toHaveBeenCalledWith(51);
    });

    it('should not call callback when value does not change', () => {
      const callback = vi.fn();
      const knob = createKnobInDom('no-callback-knob', 100, 0, 100, 1, callback); // At max
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getValue', () => {
    it('should return current value', () => {
      const knob = createKnobInDom('get-value-knob', 42, 0, 100, 1);

      expect(knob.getValue()).toBe(42);
    });
  });

  describe('html getter', () => {
    it('should return HTML string', () => {
      const knob = createKnobInDom('html-getter-knob');

      expect(knob.html).toContain('rotary-knob');
      expect(knob.html).toContain('knob-body');
      expect(knob.html).toContain('knob-indicator');
      expect(knob.html).toContain('knob-value');
    });
  });

  describe('dom getter', () => {
    it('should return DOM element', () => {
      const knob = createKnobInDom('dom-getter-knob');

      expect(knob.dom).toBeInstanceOf(HTMLElement);
      expect(knob.dom.id).toBe('dom-getter-knob');
    });

    it('should cache DOM element', () => {
      const knob = createKnobInDom('dom-cache-knob');

      const dom1 = knob.dom;
      const dom2 = knob.dom;

      expect(dom1).toBe(dom2);
    });
  });

  describe('sync', () => {
    it('should update value without triggering callback', () => {
      const callback = vi.fn();
      const knob = createKnobInDom('sync-knob', 50, 0, 100, 1, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(75);

      expect(knob.getValue()).toBe(75);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update display when syncing', () => {
      const knob = createKnobInDom('sync-display-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(75);

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('75.0');
    });

    it('should clamp synced value to valid range', () => {
      const knob = createKnobInDom('sync-clamp-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(150);

      expect(knob.getValue()).toBe(100); // Clamped to max
    });

    it('should clamp synced value to min', () => {
      const knob = createKnobInDom('sync-clamp-min-knob', 50, 10, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(-5);

      expect(knob.getValue()).toBe(10); // Clamped to min
    });

    it('should not play sound when syncing', () => {
      const knob = createKnobInDom('sync-no-sound-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(75);

      expect(mockSoundManager.play).not.toHaveBeenCalled();
    });
  });

  describe('updateDisplay', () => {
    it('should update knob rotation based on value', () => {
      const knob = createKnobInDom('display-rotation-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // At value 50 (midpoint), angle should be 0deg (-135 + 0.5 * 270)
      expect(knobBody.style.transform).toContain('rotate(0deg)');
    });

    it('should show valueOverride in display', () => {
      const knob = createKnobInDom('display-override-knob', 50, 0, 100, 1, undefined, 'OVERRIDE');
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('OVERRIDE');
    });

    it('should update valueOverride dynamically', () => {
      const knob = createKnobInDom('dynamic-override-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.valueOverride = 'NEW OVERRIDE';
      knob.updateDisplay();

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('NEW OVERRIDE');
    });
  });

  describe('static create', () => {
    it('should create RotaryKnob instance', () => {
      const knob = RotaryKnob.create('static-knob', 25, 0, 50);
      container.innerHTML = knob.html;

      expect(knob).toBeInstanceOf(RotaryKnob);
      expect(knob.getValue()).toBe(25);
    });

    it('should create with callback', () => {
      const callback = vi.fn();
      const knob = RotaryKnob.create('static-callback-knob', 25, 0, 50, 5, callback);
      container.innerHTML = knob.html;

      expect(knob).toBeInstanceOf(RotaryKnob);
    });

    it('should create with valueOverride', () => {
      const knob = RotaryKnob.create('static-override-knob', 25, 0, 50, 5, undefined, 'STATIC');
      container.innerHTML = knob.html;

      expect(knob.html).toContain('STATIC');
    });

    it('should use default step value when not provided', () => {
      const knob = RotaryKnob.create('default-step-knob', 25, 0, 50);
      container.innerHTML = knob.html;
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Scroll should change by default step of 1
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getValue()).toBe(26); // Changed by 1
    });
  });

  describe('angle calculation', () => {
    it('should set angle to -135deg at min value', () => {
      const knob = createKnobInDom('angle-min-knob', 0, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(-135deg)');
    });

    it('should set angle to 135deg at max value', () => {
      const knob = createKnobInDom('angle-max-knob', 100, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(135deg)');
    });

    it('should set angle to 0deg at midpoint', () => {
      const knob = createKnobInDom('angle-mid-knob', 50, 0, 100, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(0deg)');
    });
  });

  describe('floating point precision', () => {
    it('should handle decimal step values', () => {
      const knob = createKnobInDom('decimal-step-knob', 0.5, 0, 1, 0.1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getValue()).toBeCloseTo(0.6, 3);
    });

    it('should round to 3 decimal places', () => {
      const knob = createKnobInDom('precision-knob', 0.1234567, 0, 1, 0.001);
      container.innerHTML = knob.html;

      // The sync method rounds to 3 decimal places
      knob.sync(0.1234567);

      expect(knob.getValue()).toBeCloseTo(0.123, 3);
    });
  });
});
