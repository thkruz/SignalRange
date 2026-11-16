/** What closed a dialog, so the guard knows which input is still to come */
export type DismissCause = 'key' | 'click' | 'hold';

/**
 * Swallows the input that trails a dialog dismissal: the keyup of the Space or
 * Enter that closed it, the click that follows a click-to-continue release,
 * and the release (and click) of a hold-to-skip press that outlived the
 * dialog. Without it that input reaches whatever control sits under the
 * pointer or holds focus once the overlay is gone. One guard per document, so
 * a reset DialogManager singleton cannot leave a stale one behind.
 */
export class DismissInputGuard {
  private static readonly POINTER_EVENTS_ = ['pointerup', 'mouseup', 'click'] as const;

  private guardedType_: 'keyup' | 'pointer' | null = null;
  private windowMs_ = 0;
  private timeoutId_: number | null = null;
  private readonly boundHandler_ = this.handleEvent_.bind(this);

  /**
   * @param windowMs - how long the trailing input is waited for
   * @param holdCapMs - for a held press, how long its release is waited for
   */
  arm(cause: DismissCause, windowMs: number, holdCapMs: number): void {
    this.disarm();
    this.windowMs_ = windowMs;
    if (cause === 'key') {
      this.guardedType_ = 'keyup';
      window.addEventListener('keyup', this.boundHandler_, true);
    } else {
      this.guardedType_ = 'pointer';
      for (const type of DismissInputGuard.POINTER_EVENTS_) {
        window.addEventListener(type, this.boundHandler_, true);
      }
    }
    this.scheduleExpiry_(cause === 'hold' ? holdCapMs : windowMs);
  }

  disarm(): void {
    if (this.timeoutId_ !== null) {
      clearTimeout(this.timeoutId_);
      this.timeoutId_ = null;
    }
    if (this.guardedType_ === 'keyup') {
      window.removeEventListener('keyup', this.boundHandler_, true);
    } else if (this.guardedType_ === 'pointer') {
      for (const type of DismissInputGuard.POINTER_EVENTS_) {
        window.removeEventListener(type, this.boundHandler_, true);
      }
    }
    this.guardedType_ = null;
  }

  private scheduleExpiry_(delayMs: number): void {
    if (this.timeoutId_ !== null) {
      clearTimeout(this.timeoutId_);
    }
    this.timeoutId_ = window.setTimeout(() => {
      this.timeoutId_ = null;
      this.disarm();
    }, delayMs);
  }

  private handleEvent_(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'keyup' || e.type === 'click') {
      this.disarm();
    } else {
      // A release: its click follows at once, so keep the guard only briefly
      this.scheduleExpiry_(this.windowMs_);
    }
  }
}
