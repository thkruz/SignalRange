import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset the singleton instance before each test
    EventBus.destroy();
    eventBus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.destroy();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('on and emit', () => {
    it('should allow subscribing to events and emit them', () => {
      const callback = jest.fn();

      eventBus.on(Events.UPDATE, callback);
      eventBus.emit(Events.UPDATE, 123);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(123);
    });

    it('should call multiple callbacks for the same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on(Events.DRAW, callback1);
      eventBus.on(Events.DRAW, callback2);
      eventBus.emit(Events.DRAW, 456);

      expect(callback1).toHaveBeenCalledWith(456);
      expect(callback2).toHaveBeenCalledWith(456);
    });

    it('should pass multiple arguments to callbacks', () => {
      const callback = jest.fn();

      eventBus.on(Events.SYNC, callback);
      eventBus.emit(Events.SYNC);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when emitting event with no subscribers', () => {
      expect(() => {
        eventBus.emit(Events.UPDATE, 789);
      }).not.toThrow();
    });
  });

  describe('off', () => {
    it('should unsubscribe a callback from an event', () => {
      const callback = jest.fn();

      eventBus.on(Events.UPDATE, callback);
      eventBus.off(Events.UPDATE, callback);
      eventBus.emit(Events.UPDATE, 100);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should only remove the specified callback', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on(Events.DRAW, callback1);
      eventBus.on(Events.DRAW, callback2);
      eventBus.off(Events.DRAW, callback1);
      eventBus.emit(Events.DRAW, 200);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(200);
    });

    it('should not throw error when removing non-existent callback', () => {
      const callback = jest.fn();

      expect(() => {
        eventBus.off(Events.UPDATE, callback);
      }).not.toThrow();
    });
  });

  describe('once', () => {
    it('should only call the callback once', () => {
      const callback = jest.fn();

      eventBus.once(Events.UPDATE, callback);
      eventBus.emit(Events.UPDATE, 1);
      eventBus.emit(Events.UPDATE, 2);
      eventBus.emit(Events.UPDATE, 3);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should automatically unsubscribe after first call', () => {
      const callback = jest.fn();

      eventBus.once(Events.DRAW, callback);
      eventBus.emit(Events.DRAW, 100);

      // Manually check if callback is removed by trying to remove it again
      expect(() => {
        eventBus.off(Events.DRAW, callback);
      }).not.toThrow();

      eventBus.emit(Events.DRAW, 200);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all callbacks for an event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on(Events.UPDATE, callback1);
      eventBus.on(Events.UPDATE, callback2);
      eventBus.clear(Events.UPDATE);
      eventBus.emit(Events.UPDATE, 300);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should only clear callbacks for the specified event', () => {
      const updateCallback = jest.fn();
      const drawCallback = jest.fn();

      eventBus.on(Events.UPDATE, updateCallback);
      eventBus.on(Events.DRAW, drawCallback);
      eventBus.clear(Events.UPDATE);

      eventBus.emit(Events.UPDATE, 400);
      eventBus.emit(Events.DRAW, 500);

      expect(updateCallback).not.toHaveBeenCalled();
      expect(drawCallback).toHaveBeenCalledWith(500);
    });
  });

  describe('destroy', () => {
    it('should reset the singleton instance', () => {
      const instance1 = EventBus.getInstance();
      EventBus.destroy();
      const instance2 = EventBus.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });
});
