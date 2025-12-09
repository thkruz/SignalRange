import { SaveProgressToast } from '../../src/modal/save-progress-toast';

describe('SaveProgressToast.destroy', () => {
  let toast: SaveProgressToast;

  beforeEach(() => {
    document.body.innerHTML = '';
    toast = SaveProgressToast.getInstance();
  });

  afterEach(() => {
    // Clean up any remaining instance
    if ((SaveProgressToast as any).instance_) {
      toast.destroy();
    }
    document.body.innerHTML = '';
  });

  it('should clear auto-hide timeout when destroyed', () => {
    jest.useFakeTimers();
    toast.showSuccess('Test', 3000);

    const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
    toast.destroy();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    jest.useRealTimers();
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