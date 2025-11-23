import './save-progress-toast.css';

/**
 * Toast states for the save progress indicator
 */
export enum ToastState {
  SAVING = 'saving',
  SUCCESS = 'success',
  ERROR = 'error',
}

/**
 * Manages the save progress toast notification
 * Singleton pattern for global access
 */
export class SaveProgressToast {
  private static instance_: SaveProgressToast | null = null;
  private toastElement_: HTMLDivElement | null = null;
  private iconElement_: HTMLDivElement | null = null;
  private messageElement_: HTMLDivElement | null = null;
  private closeButton_: HTMLButtonElement | null = null;
  private autoHideTimeout_: number | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.createToastElement_();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SaveProgressToast {
    if (!SaveProgressToast.instance_) {
      SaveProgressToast.instance_ = new SaveProgressToast();
    }
    return SaveProgressToast.instance_;
  }

  /**
   * Creates the toast DOM element and appends it to the body
   */
  private createToastElement_(): void {
    // Create main toast container
    this.toastElement_ = document.createElement('div');
    this.toastElement_.className = 'save-progress-toast';

    // Create icon container
    this.iconElement_ = document.createElement('div');
    this.iconElement_.className = 'save-progress-toast__icon';
    this.toastElement_.appendChild(this.iconElement_);

    // Create message container
    this.messageElement_ = document.createElement('div');
    this.messageElement_.className = 'save-progress-toast__message';
    this.toastElement_.appendChild(this.messageElement_);

    // Create close button
    this.closeButton_ = document.createElement('button');
    this.closeButton_.className = 'save-progress-toast__close';
    this.closeButton_.innerHTML = '&times;';
    this.closeButton_.setAttribute('aria-label', 'Close');
    this.closeButton_.addEventListener('click', () => this.hide());
    this.toastElement_.appendChild(this.closeButton_);

    // Append to body
    document.body.appendChild(this.toastElement_);
  }

  /**
   * Shows the toast with saving state
   */
  public showSaving(message: string = 'Saving progress to cloud...'): void {
    this.clearAutoHideTimeout_();
    this.updateContent_(ToastState.SAVING, message);
    this.show_();
  }

  /**
   * Shows the toast with success state
   */
  public showSuccess(message: string = 'Progress saved!', autoHideDuration: number = 3000): void {
    this.clearAutoHideTimeout_();
    this.updateContent_(ToastState.SUCCESS, message);
    this.show_();

    // Auto-hide after duration
    if (autoHideDuration > 0) {
      this.autoHideTimeout_ = window.setTimeout(() => {
        this.hide();
      }, autoHideDuration);
    }
  }

  /**
   * Shows the toast with error state
   */
  public showError(message: string = 'Failed to save progress', autoHideDuration: number = 5000): void {
    this.clearAutoHideTimeout_();
    this.updateContent_(ToastState.ERROR, message);
    this.show_();

    // Auto-hide after duration
    if (autoHideDuration > 0) {
      this.autoHideTimeout_ = window.setTimeout(() => {
        this.hide();
      }, autoHideDuration);
    }
  }

  /**
   * Updates the toast content based on state
   */
  private updateContent_(state: ToastState, message: string): void {
    if (!this.toastElement_ || !this.iconElement_ || !this.messageElement_) {
      return;
    }

    // Remove previous state classes
    this.toastElement_.classList.remove('success', 'error');

    // Update icon based on state
    switch (state) {
      case ToastState.SAVING:
        this.iconElement_.innerHTML = '<div class="save-progress-toast__spinner"></div>';
        break;
      case ToastState.SUCCESS:
        this.iconElement_.innerHTML = '<div class="save-progress-toast__checkmark">✓</div>';
        this.toastElement_.classList.add('success');
        break;
      case ToastState.ERROR:
        this.iconElement_.innerHTML = '<div class="save-progress-toast__error">✕</div>';
        this.toastElement_.classList.add('error');
        break;
    }

    // Update message
    this.messageElement_.textContent = message;
  }

  /**
   * Shows the toast with animation
   */
  private show_(): void {
    if (!this.toastElement_) {
      return;
    }

    // Use requestAnimationFrame to ensure CSS transition plays
    requestAnimationFrame(() => {
      if (this.toastElement_) {
        this.toastElement_.classList.add('show');
      }
    });
  }

  /**
   * Hides the toast with animation
   */
  public hide(): void {
    if (!this.toastElement_) {
      return;
    }

    this.clearAutoHideTimeout_();
    this.toastElement_.classList.remove('show');
  }

  /**
   * Checks if the toast is currently visible
   */
  public isVisible(): boolean {
    return this.toastElement_?.classList.contains('show') ?? false;
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
  public destroy(): void {
    this.clearAutoHideTimeout_();

    if (this.toastElement_) {
      this.toastElement_.remove();
      this.toastElement_ = null;
    }

    this.iconElement_ = null;
    this.messageElement_ = null;
    this.closeButton_ = null;
    SaveProgressToast.instance_ = null;
  }
}
