import { vi } from 'vitest';
import { SaveProgressToast } from '../../src/modal/save-progress-toast';

describe('SaveProgressToast', () => {
  let toast: SaveProgressToast;
  let originalRAF: typeof requestAnimationFrame;

  beforeEach(() => {
    // Reset singleton
    if ((SaveProgressToast as any).instance_) {
      (SaveProgressToast as any).instance_.destroy();
    }
    document.body.innerHTML = '';
    toast = SaveProgressToast.getInstance();
    vi.useFakeTimers();

    // Mock requestAnimationFrame to run synchronously
    originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(0);
      return 0;
    };
  });

  afterEach(() => {
    // Clean up any remaining instance
    if ((SaveProgressToast as any).instance_) {
      toast.destroy();
    }
    document.body.innerHTML = '';
    vi.clearAllTimers();
    vi.useRealTimers();
    window.requestAnimationFrame = originalRAF;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = SaveProgressToast.getInstance();
      const instance2 = SaveProgressToast.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('DOM Creation', () => {
    it('should create toast element on instantiation', () => {
      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement).toBeTruthy();
    });

    it('should create icon element', () => {
      const iconElement = document.querySelector('.save-progress-toast__icon');
      expect(iconElement).toBeTruthy();
    });

    it('should create message element', () => {
      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement).toBeTruthy();
    });

    it('should create close button', () => {
      const closeButton = document.querySelector('.save-progress-toast__close');
      expect(closeButton).toBeTruthy();
      expect(closeButton?.getAttribute('aria-label')).toBe('Close');
    });
  });

  describe('showSaving', () => {
    it('should display spinner icon', () => {
      toast.showSaving();

      const spinner = document.querySelector('.save-progress-toast__spinner');
      expect(spinner).toBeTruthy();
    });

    it('should display default saving message', () => {
      toast.showSaving();

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Saving progress to cloud...');
    });

    it('should display custom message', () => {
      toast.showSaving('Custom saving message');

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Custom saving message');
    });

    it('should add show class after animation frame', () => {
      toast.showSaving();

      // requestAnimationFrame is mocked to run synchronously
      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);
    });

    it('should not add success or error class', () => {
      toast.showSaving();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('success')).toBe(false);
      expect(toastElement?.classList.contains('error')).toBe(false);
    });
  });

  describe('showSuccess', () => {
    it('should display checkmark icon', () => {
      toast.showSuccess();

      const checkmark = document.querySelector('.save-progress-toast__checkmark');
      expect(checkmark).toBeTruthy();
      expect(checkmark?.textContent).toBe('\u2713'); // Checkmark
    });

    it('should display default success message', () => {
      toast.showSuccess();

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Progress saved!');
    });

    it('should display custom message', () => {
      toast.showSuccess('Custom success message');

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Custom success message');
    });

    it('should add success class', () => {
      toast.showSuccess();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('success')).toBe(true);
    });

    it('should auto-hide after default duration', () => {
      toast.showSuccess();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(3000);

      expect(toastElement?.classList.contains('show')).toBe(false);
    });

    it('should auto-hide after custom duration', () => {
      toast.showSuccess('Test', 5000);

      const toastElement = document.querySelector('.save-progress-toast');

      vi.advanceTimersByTime(4000);
      expect(toastElement?.classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(toastElement?.classList.contains('show')).toBe(false);
    });

    it('should not auto-hide when duration is 0', () => {
      toast.showSuccess('Test', 0);

      const toastElement = document.querySelector('.save-progress-toast');

      vi.advanceTimersByTime(10000);
      expect(toastElement?.classList.contains('show')).toBe(true);
    });
  });

  describe('showError', () => {
    it('should display error icon', () => {
      toast.showError();

      const errorIcon = document.querySelector('.save-progress-toast__error');
      expect(errorIcon).toBeTruthy();
      expect(errorIcon?.textContent).toBe('\u2715'); // X mark
    });

    it('should display default error message', () => {
      toast.showError();

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Failed to save progress');
    });

    it('should display custom message', () => {
      toast.showError('Custom error message');

      const messageElement = document.querySelector('.save-progress-toast__message');
      expect(messageElement?.textContent).toBe('Custom error message');
    });

    it('should add error class', () => {
      toast.showError();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('error')).toBe(true);
    });

    it('should auto-hide after default duration (5 seconds)', () => {
      toast.showError();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(5000);

      expect(toastElement?.classList.contains('show')).toBe(false);
    });
  });

  describe('hide', () => {
    it('should remove show class', () => {
      toast.showSuccess();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('show')).toBe(true);

      toast.hide();

      expect(toastElement?.classList.contains('show')).toBe(false);
    });

    it('should clear auto-hide timeout', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      toast.showSuccess();
      toast.hide();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should do nothing when toast element is null', () => {
      (toast as any).toastElement_ = null;

      expect(() => toast.hide()).not.toThrow();
    });
  });

  describe('isVisible', () => {
    it('should return false initially', () => {
      expect(toast.isVisible()).toBe(false);
    });

    it('should return true when toast is showing', () => {
      toast.showSuccess();

      expect(toast.isVisible()).toBe(true);
    });

    it('should return false after hide', () => {
      toast.showSuccess();
      toast.hide();

      expect(toast.isVisible()).toBe(false);
    });

    it('should return false when toast element is null', () => {
      (toast as any).toastElement_ = null;

      expect(toast.isVisible()).toBe(false);
    });
  });

  describe('Close Button', () => {
    it('should hide toast when clicked', () => {
      toast.showSuccess();

      const closeButton = document.querySelector('.save-progress-toast__close') as HTMLElement;
      closeButton?.click();

      expect(toast.isVisible()).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should remove previous state classes when changing state', () => {
      toast.showSuccess();

      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement?.classList.contains('success')).toBe(true);

      toast.showError();

      expect(toastElement?.classList.contains('success')).toBe(false);
      expect(toastElement?.classList.contains('error')).toBe(true);
    });

    it('should clear previous timeout when showing new state', () => {
      toast.showSuccess('First', 5000);
      vi.advanceTimersByTime(2000);

      toast.showSuccess('Second', 5000);
      vi.advanceTimersByTime(4000);

      // Should still be visible because new show() reset the timer
      expect(toast.isVisible()).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(toast.isVisible()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clear auto-hide timeout when destroyed', () => {
      toast.showSuccess('Test', 3000);

      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      toast.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should remove toast element from DOM', () => {
      const toastElement = document.querySelector('.save-progress-toast');
      expect(toastElement).toBeTruthy();

      toast.destroy();

      const removedToastElement = document.querySelector('.save-progress-toast');
      expect(removedToastElement).toBeNull();
    });

    it('should set all element references to null', () => {
      toast.destroy();

      expect((toast as any).toastElement_).toBeNull();
      expect((toast as any).iconElement_).toBeNull();
      expect((toast as any).messageElement_).toBeNull();
      expect((toast as any).closeButton_).toBeNull();
    });

    it('should reset singleton instance to null', () => {
      toast.destroy();

      expect((SaveProgressToast as any).instance_).toBeNull();
    });

    it('should allow creating new instance after destroy', () => {
      toast.destroy();

      const newToast = SaveProgressToast.getInstance();
      expect(newToast).toBeTruthy();
      expect(newToast).not.toBe(toast);
    });

    it('should handle destroy when toast element is already null', () => {
      (toast as any).toastElement_ = null;

      expect(() => toast.destroy()).not.toThrow();
    });
  });
});
