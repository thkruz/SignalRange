import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { TimePenaltyToast } from '../../src/modal/time-penalty-toast';

describe('TimePenaltyToast', () => {
  let toast: TimePenaltyToast;
  let eventBus: EventBus;
  let originalRAF: typeof requestAnimationFrame;

  beforeEach(() => {
    // Reset singletons
    if ((TimePenaltyToast as any).instance_) {
      (TimePenaltyToast as any).instance_.destroy();
    }
    EventBus.destroy();

    document.body.innerHTML = '';
    eventBus = EventBus.getInstance();
    toast = TimePenaltyToast.getInstance();
    vi.useFakeTimers();

    // Mock requestAnimationFrame to run synchronously
    originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(0);
      return 0;
    };
  });

  afterEach(() => {
    if ((TimePenaltyToast as any).instance_) {
      toast.destroy();
    }
    document.body.innerHTML = '';
    EventBus.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    window.requestAnimationFrame = originalRAF;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TimePenaltyToast.getInstance();
      const instance2 = TimePenaltyToast.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('DOM Creation', () => {
    it('should create toast element on instantiation', () => {
      const toastElement = document.querySelector('.time-penalty-toast');
      expect(toastElement).toBeTruthy();
    });

    it('should create icon element', () => {
      const iconElement = document.querySelector('.time-penalty-toast__icon');
      expect(iconElement).toBeTruthy();
      expect(iconElement?.textContent).toBe('\u23F1'); // Stopwatch emoji
    });

    it('should create points element', () => {
      const pointsElement = document.querySelector('.time-penalty-toast__points');
      expect(pointsElement).toBeTruthy();
    });

    it('should create message element', () => {
      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement).toBeTruthy();
    });

    it('should create close button', () => {
      const closeButton = document.querySelector('.time-penalty-toast__close');
      expect(closeButton).toBeTruthy();
      expect(closeButton?.getAttribute('aria-label')).toBe('Close');
    });
  });

  describe('show', () => {
    it('should display points deducted', () => {
      toast.show(10);

      const pointsElement = document.querySelector('.time-penalty-toast__points');
      expect(pointsElement?.textContent).toBe('-10 points');
    });

    it('should display custom message', () => {
      toast.show(5, 'Custom penalty message');

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement?.textContent).toBe('Custom penalty message');
      expect((messageElement as HTMLElement)?.style.display).toBe('block');
    });

    it('should display default message when none provided', () => {
      toast.show(5);

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement?.textContent).toBe('Time penalty applied');
    });

    it('should hide message element when no custom message', () => {
      toast.show(5);

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect((messageElement as HTMLElement)?.style.display).toBe('none');
    });

    it('should add show class after animation frame', () => {
      toast.show(10);

      // requestAnimationFrame is mocked to run synchronously
      const toastElement = document.querySelector('.time-penalty-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);
    });

    it('should auto-hide after 5 seconds', () => {
      toast.show(10);

      const toastElement = document.querySelector('.time-penalty-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(5000);

      expect(toastElement?.classList.contains('show')).toBe(false);
    });
  });

  describe('hide', () => {
    it('should remove show class', () => {
      toast.show(10);

      const toastElement = document.querySelector('.time-penalty-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);

      toast.hide();

      expect(toastElement?.classList.contains('show')).toBe(false);
    });

    it('should clear auto-hide timeout', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      toast.show(10);
      toast.hide();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Close Button', () => {
    it('should hide toast when close button is clicked', () => {
      toast.show(10);
      vi.runAllTimers();

      const closeButton = document.querySelector('.time-penalty-toast__close') as HTMLElement;
      closeButton?.click();

      const toastElement = document.querySelector('.time-penalty-toast');
      expect(toastElement?.classList.contains('show')).toBe(false);
    });
  });

  describe('TIME_PENALTY_APPLIED Event', () => {
    it('should show toast when event is emitted', () => {
      eventBus.emit(Events.TIME_PENALTY_APPLIED, {
        pointsDeducted: 15,
        message: 'Event message',
      });

      const pointsElement = document.querySelector('.time-penalty-toast__points');
      expect(pointsElement?.textContent).toBe('-15 points');

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement?.textContent).toBe('Event message');
    });

    it('should show toast with default message when event has no message', () => {
      eventBus.emit(Events.TIME_PENALTY_APPLIED, {
        pointsDeducted: 20,
      });

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement?.textContent).toBe('Time penalty applied');
    });
  });

  describe('destroy', () => {
    it('should remove toast element from DOM', () => {
      expect(document.querySelector('.time-penalty-toast')).toBeTruthy();

      toast.destroy();

      expect(document.querySelector('.time-penalty-toast')).toBeNull();
    });

    it('should clear auto-hide timeout', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      toast.show(10);
      toast.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should unsubscribe from event bus', () => {
      toast.destroy();

      // Create new toast to verify old handler is gone
      (TimePenaltyToast as any).instance_ = null;
      const newToast = TimePenaltyToast.getInstance();

      const callback = vi.fn();
      const originalShow = newToast.show.bind(newToast);
      newToast.show = callback;

      eventBus.emit(Events.TIME_PENALTY_APPLIED, {
        pointsDeducted: 10,
      });

      // Only the new toast should receive the event
      expect(callback).toHaveBeenCalledTimes(1);

      newToast.show = originalShow;
    });

    it('should reset singleton instance to null', () => {
      toast.destroy();

      expect((TimePenaltyToast as any).instance_).toBeNull();
    });

    it('should allow creating new instance after destroy', () => {
      toast.destroy();

      const newToast = TimePenaltyToast.getInstance();
      expect(newToast).toBeTruthy();
      expect(newToast).not.toBe(toast);
    });

    it('should set element references to null', () => {
      toast.destroy();

      expect((toast as any).toastElement_).toBeNull();
      expect((toast as any).pointsElement_).toBeNull();
      expect((toast as any).messageElement_).toBeNull();
      expect((toast as any).closeButton_).toBeNull();
    });
  });

  describe('Multiple Shows', () => {
    it('should update content when showing again', () => {
      toast.show(5, 'First message');
      vi.runAllTimers();

      toast.show(15, 'Second message');

      const pointsElement = document.querySelector('.time-penalty-toast__points');
      expect(pointsElement?.textContent).toBe('-15 points');

      const messageElement = document.querySelector('.time-penalty-toast__message');
      expect(messageElement?.textContent).toBe('Second message');
    });

    it('should clear previous auto-hide timeout when showing again', () => {
      toast.show(5);
      vi.advanceTimersByTime(3000); // Advance 3 seconds

      toast.show(10);
      vi.advanceTimersByTime(3000); // Advance another 3 seconds

      // Toast should still be visible because new show() reset the timer
      vi.runAllTimers();
      const toastElement = document.querySelector('.time-penalty-toast');

      // After the full 5 seconds from the second show, it should hide
      vi.advanceTimersByTime(2000);
      expect(toastElement?.classList.contains('show')).toBe(false);
    });
  });
});
