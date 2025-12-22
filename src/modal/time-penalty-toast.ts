import { EventBus } from '@app/events/event-bus';
import { Events, TimePenaltyAppliedData } from '@app/events/events';
import './time-penalty-toast.css';

/**
 * Toast notification for time-based point penalties
 * Singleton pattern for global access
 */
export class TimePenaltyToast {
  private static instance_: TimePenaltyToast | null = null;
  private toastElement_: HTMLDivElement | null = null;
  private pointsElement_: HTMLSpanElement | null = null;
  private messageElement_: HTMLDivElement | null = null;
  private closeButton_: HTMLButtonElement | null = null;
  private autoHideTimeout_: number | null = null;
  private readonly boundHandler_: (data: TimePenaltyAppliedData) => void;

  private constructor() {
    this.boundHandler_ = this.handleTimePenalty_.bind(this);
    this.createToastElement_();
    EventBus.getInstance().on(Events.TIME_PENALTY_APPLIED, this.boundHandler_);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): TimePenaltyToast {
    TimePenaltyToast.instance_ ??= new TimePenaltyToast();
    return TimePenaltyToast.instance_;
  }

  /**
   * Creates the toast DOM element and appends it to the body
   */
  private createToastElement_(): void {
    this.toastElement_ = document.createElement('div');
    this.toastElement_.className = 'time-penalty-toast';

    // Create icon container
    const iconEl = document.createElement('div');
    iconEl.className = 'time-penalty-toast__icon';
    iconEl.textContent = '⏱';
    this.toastElement_.appendChild(iconEl);

    // Create content container
    const contentEl = document.createElement('div');
    contentEl.className = 'time-penalty-toast__content';

    // Points deducted header
    this.pointsElement_ = document.createElement('span');
    this.pointsElement_.className = 'time-penalty-toast__points';
    contentEl.appendChild(this.pointsElement_);

    // Optional message
    this.messageElement_ = document.createElement('div');
    this.messageElement_.className = 'time-penalty-toast__message';
    contentEl.appendChild(this.messageElement_);

    this.toastElement_.appendChild(contentEl);

    // Create close button
    this.closeButton_ = document.createElement('button');
    this.closeButton_.className = 'time-penalty-toast__close';
    this.closeButton_.innerHTML = '&times;';
    this.closeButton_.setAttribute('aria-label', 'Close');
    this.closeButton_.addEventListener('click', () => this.hide());
    this.toastElement_.appendChild(this.closeButton_);

    document.body.appendChild(this.toastElement_);
  }

  /**
   * Handle the time penalty applied event
   */
  private handleTimePenalty_(data: TimePenaltyAppliedData): void {
    this.show(data.pointsDeducted, data.message);
  }

  /**
   * Show the toast with penalty information
   */
  show(points: number, message?: string): void {
    if (!this.toastElement_ || !this.pointsElement_ || !this.messageElement_) {
      return;
    }

    this.clearAutoHideTimeout_();

    this.pointsElement_.textContent = `-${points} points`;
    this.messageElement_.textContent = message ?? 'Time penalty applied';
    this.messageElement_.style.display = message ? 'block' : 'none';

    requestAnimationFrame(() => {
      this.toastElement_?.classList.add('show');
    });

    this.autoHideTimeout_ = window.setTimeout(() => {
      this.hide();
    }, 5000);
  }

  /**
   * Hide the toast with animation
   */
  hide(): void {
    this.clearAutoHideTimeout_();
    this.toastElement_?.classList.remove('show');
  }

  /**
   * Clears the auto-hide timeout
   */
  private clearAutoHideTimeout_(): void {
    if (this.autoHideTimeout_ !== null) {
      clearTimeout(this.autoHideTimeout_);
      this.autoHideTimeout_ = null;
    }
  }

  /**
   * Cleanup method for destroying the toast
   */
  destroy(): void {
    this.clearAutoHideTimeout_();
    EventBus.getInstance().off(Events.TIME_PENALTY_APPLIED, this.boundHandler_);

    if (this.toastElement_) {
      this.toastElement_.remove();
      this.toastElement_ = null;
    }

    this.pointsElement_ = null;
    this.messageElement_ = null;
    this.closeButton_ = null;
    TimePenaltyToast.instance_ = null;
  }
}
