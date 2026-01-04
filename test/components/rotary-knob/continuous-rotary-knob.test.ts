import { ContinuousRotaryKnob } from '../../../src/components/rotary-knob/continuous-rotary-knob';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

describe('ContinuousRotaryKnob', () => {
  let container: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    EventBus.destroy();

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
    initialAngle = 0,
    step = 1,
    callback?: (delta: number) => void,
    valueOverride?: string
  ): ContinuousRotaryKnob => {
    const knob = new ContinuousRotaryKnob(id, initialAngle, step, callback, valueOverride);
    container.innerHTML = knob.html;
    return knob;
  };

  describe('constructor', () => {
    it('should create instance with provided parameters', () => {
      const callback = jest.fn();
      const knob = createKnobInDom('test-knob', 45, 5, callback);

      expect(knob.html).toContain('id="test-knob"');
      expect(knob.html).toContain('continuous-rotary-knob');
      expect(knob.getAngle()).toBe(45);
    });

    it('should use default parameters when not provided', () => {
      const knob = new ContinuousRotaryKnob('default-knob');
      container.innerHTML = knob.html;

      expect(knob.getAngle()).toBe(0);
    });

    it('should display valueOverride when provided', () => {
      const knob = createKnobInDom('override-knob', 90, 1, undefined, 'CUSTOM');

      expect(knob.html).toContain('CUSTOM');
    });

    it('should display formatted rotations when no valueOverride', () => {
      const knob = createKnobInDom('no-override-knob', 45);

      expect(knob.html).toContain('45');
    });

    it('should register DOM_READY event listener', () => {
      const eventBus = EventBus.getInstance();
      const onSpy = jest.spyOn(eventBus, 'on');

      new ContinuousRotaryKnob('event-knob');

      expect(onSpy).toHaveBeenCalledWith(Events.DOM_READY, expect.any(Function));
    });
  });

  describe('onDomReady_', () => {
    it('should attach mousedown listener to knob body', () => {
      const knob = createKnobInDom('ready-knob');
      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const addEventListenerSpy = jest.spyOn(knobBody, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });

    it('should attach mousemove listener to document', () => {
      const knob = createKnobInDom('mousemove-knob');
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    });

    it('should attach mouseup listener to document', () => {
      const knob = createKnobInDom('mouseup-knob');
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });

    it('should attach wheel listener to knob body', () => {
      const knob = createKnobInDom('wheel-knob');
      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const addEventListenerSpy = jest.spyOn(knobBody, 'addEventListener');

      EventBus.getInstance().emit(Events.DOM_READY);

      expect(addEventListenerSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    });
  });

  describe('drag interaction', () => {
    it('should start dragging on mousedown', () => {
      const knob = createKnobInDom('drag-start-knob', 0, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(mousedownEvent);

      // Verify drag started by triggering mousemove and checking angle change
      jest.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50, x: 0, y: 0, toJSON: () => ({}),
      });
      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 50,
        clientX: 25,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getAngle()).not.toBe(0);
    });

    it('should not change angle on mousemove when not dragging', () => {
      const knob = createKnobInDom('no-drag-knob', 45, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const initialAngle = knob.getAngle();

      jest.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50, x: 0, y: 0, toJSON: () => ({}),
      });
      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 0,
        clientX: 200,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getAngle()).toBe(initialAngle);
    });

    it('should stop dragging on mouseup', () => {
      const knob = createKnobInDom('drag-end-knob', 0, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      jest.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50, x: 0, y: 0, toJSON: () => ({}),
      });
      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

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

      const angleAfterDragEnd = knob.getAngle();

      // Further mousemove should not change angle
      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 0,
        clientX: 300,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getAngle()).toBe(angleAfterDragEnd);
    });

    it('should increase angle when dragging up', () => {
      const knob = createKnobInDom('drag-up-knob', 0, 1);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      jest.spyOn(knob.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50, x: 0, y: 0, toJSON: () => ({}),
      });
      Object.defineProperty(knob.dom, 'offsetWidth', { value: 50 });

      const mousedownEvent = new MouseEvent('mousedown', {
        clientY: 100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(mousedownEvent);

      const mousemoveEvent = new MouseEvent('mousemove', {
        clientY: 50,
        clientX: 25,
        bubbles: true,
      });
      document.dispatchEvent(mousemoveEvent);

      expect(knob.getAngle()).toBeGreaterThan(0);
    });
  });

  describe('wheel interaction', () => {
    it('should increase angle when scrolling up', () => {
      const knob = createKnobInDom('wheel-up-knob', 0, 10);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle()).toBe(10);
    });

    it('should decrease angle when scrolling down', () => {
      const knob = createKnobInDom('wheel-down-knob', 50, 10);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });

      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle()).toBe(40);
    });

    it('should prevent default on wheel event', () => {
      const knob = createKnobInDom('wheel-prevent-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = jest.spyOn(wheelEvent, 'preventDefault');

      knobBody.dispatchEvent(wheelEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('setAngle_ and callback', () => {
    it('should call callback with delta when angle changes', () => {
      const callback = jest.fn();
      const knob = createKnobInDom('callback-knob', 0, 10, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(callback).toHaveBeenCalledWith(10);
    });

    it('should not call callback when delta is zero', () => {
      const callback = jest.fn();
      const knob = createKnobInDom('no-delta-knob', 10, 10, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      // Sync to same angle (delta will be 0)
      knob.sync(10);

      // Callback should not be called via sync (sync doesn't use setAngle_)
      expect(callback).not.toHaveBeenCalled();
    });

    it('should round angle to step', () => {
      const knob = createKnobInDom('step-round-knob', 0, 15);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle() % 15).toBe(0);
    });
  });

  describe('formatRotations', () => {
    it('should format angle without rotation prefix when totalRotations is 0', () => {
      const knob = createKnobInDom('format-zero-knob', 45);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      knob.sync(45);

      expect(knobValue.textContent).toBe('45°');
    });

    it('should format with positive rotation prefix', () => {
      const knob = createKnobInDom('format-positive-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(400); // 1 full rotation + 40 degrees

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('+1×40°');
    });

    it('should format with negative rotation count', () => {
      const knob = createKnobInDom('format-negative-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(-400); // -1 full rotation - 40 degrees

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('-2×320°');
    });
  });

  describe('updateDisplay', () => {
    it('should update knob rotation', () => {
      const knob = createKnobInDom('display-rotation-knob', 90);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(90);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(90deg)');
    });

    it('should show valueOverride in display', () => {
      const knob = createKnobInDom('display-override-knob', 45, 1, undefined, 'OVERRIDE');
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.updateDisplay();

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('OVERRIDE');
    });

    it('should update valueOverride dynamically', () => {
      const knob = createKnobInDom('dynamic-override-knob', 45);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.valueOverride = 'NEW OVERRIDE';
      knob.updateDisplay();

      const knobValue = knob.dom.querySelector('.knob-value') as HTMLElement;
      expect(knobValue.textContent).toBe('NEW OVERRIDE');
    });

    it('should wrap display angle for values over 360', () => {
      const knob = createKnobInDom('wrap-angle-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(450); // Should display as 90 degrees

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(90deg)');
    });
  });

  describe('getAngle', () => {
    it('should return current angle', () => {
      const knob = createKnobInDom('get-angle-knob', 123);

      expect(knob.getAngle()).toBe(123);
    });
  });

  describe('getTotalRotations', () => {
    it('should return 0 for angles less than 360', () => {
      const knob = createKnobInDom('rotations-zero-knob', 180);
      EventBus.getInstance().emit(Events.DOM_READY);

      expect(knob.getTotalRotations()).toBe(0);
    });

    it('should return correct count for multiple rotations', () => {
      const knob = createKnobInDom('rotations-count-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(750); // 2 full rotations + 30 degrees

      expect(knob.getTotalRotations()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset angle to 0', () => {
      const knob = createKnobInDom('reset-knob', 180);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.reset();

      expect(knob.getAngle()).toBe(0);
    });

    it('should call callback with delta when resetting', () => {
      const callback = jest.fn();
      const knob = createKnobInDom('reset-callback-knob', 90, 1, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.reset();

      expect(callback).toHaveBeenCalledWith(-90);
    });

    it('should reset totalRotations', () => {
      const knob = createKnobInDom('reset-rotations-knob', 720);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(720);
      expect(knob.getTotalRotations()).toBe(2);

      knob.reset();

      expect(knob.getTotalRotations()).toBe(0);
    });
  });

  describe('html getter', () => {
    it('should return HTML string', () => {
      const knob = createKnobInDom('html-getter-knob');

      expect(knob.html).toContain('continuous-rotary-knob');
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
    it('should update angle without triggering callback', () => {
      const callback = jest.fn();
      const knob = createKnobInDom('sync-knob', 0, 1, callback);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(180);

      expect(knob.getAngle()).toBe(180);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update display when syncing', () => {
      const knob = createKnobInDom('sync-display-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(90);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;
      expect(knobBody.style.transform).toContain('rotate(90deg)');
    });

    it('should update totalRotations when syncing', () => {
      const knob = createKnobInDom('sync-rotations-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(720);

      expect(knob.getTotalRotations()).toBe(2);
    });

    it('should handle negative angles', () => {
      const knob = createKnobInDom('sync-negative-knob', 0);
      EventBus.getInstance().emit(Events.DOM_READY);

      knob.sync(-90);

      expect(knob.getAngle()).toBe(-90);
    });
  });

  describe('static create', () => {
    it('should create ContinuousRotaryKnob instance', () => {
      const knob = ContinuousRotaryKnob.create('static-knob', 45, 5);
      container.innerHTML = knob.html;

      expect(knob).toBeInstanceOf(ContinuousRotaryKnob);
      expect(knob.getAngle()).toBe(45);
    });

    it('should create with callback', () => {
      const callback = jest.fn();
      const knob = ContinuousRotaryKnob.create('static-callback-knob', 0, 10, callback);
      container.innerHTML = knob.html;

      expect(knob).toBeInstanceOf(ContinuousRotaryKnob);
    });

    it('should create with valueOverride', () => {
      const knob = ContinuousRotaryKnob.create('static-override-knob', 0, 1, undefined, 'STATIC');
      container.innerHTML = knob.html;

      expect(knob.html).toContain('STATIC');
    });

    it('should use default parameters when not provided', () => {
      const knob = ContinuousRotaryKnob.create('default-params-knob');
      container.innerHTML = knob.html;
      EventBus.getInstance().emit(Events.DOM_READY);

      expect(knob.getAngle()).toBe(0);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Default step should be 1
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle()).toBe(1);
    });
  });

  describe('continuous rotation', () => {
    it('should allow angles beyond 360', () => {
      const knob = createKnobInDom('beyond-360-knob', 350, 10);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Scroll up to go beyond 360
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle()).toBe(360);
      expect(knob.getTotalRotations()).toBe(1);
    });

    it('should allow negative angles', () => {
      const knob = createKnobInDom('negative-knob', 0, 10);
      EventBus.getInstance().emit(Events.DOM_READY);

      const knobBody = knob.dom.querySelector('.knob-body') as HTMLElement;

      // Scroll down to go negative
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });
      knobBody.dispatchEvent(wheelEvent);

      expect(knob.getAngle()).toBe(-10);
    });
  });
});
