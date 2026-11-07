import { animateSelection } from './selection-browser';

/** Keep preliminary account state out of view and out of the keyboard focus order. */
export class SelectionLoadingScreen {
  private readonly element_ = document.createElement('div');
  private readonly title_ = document.createElement('h2');
  private readonly status_ = document.createElement('p');
  private readonly retry_ = document.createElement('button');

  constructor(
    private readonly page_: HTMLElement,
    onRetry: () => void
  ) {
    this.element_.className = 'selection-loading-screen';
    this.element_.hidden = true;
    this.element_.tabIndex = -1;
    this.element_.setAttribute('role', 'status');
    this.element_.setAttribute('aria-live', 'polite');
    const indicator = document.createElement('div');
    indicator.className = 'selection-loading-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    this.retry_.type = 'button';
    this.retry_.className = 'selection-primary';
    this.retry_.textContent = 'Retry';
    this.retry_.hidden = true;
    this.retry_.addEventListener('click', onRetry);
    this.element_.append(indicator, this.title_, this.status_, this.retry_);
    page_.append(this.element_);
  }

  begin(): void {
    this.title_.textContent = 'Loading your progress';
    this.status_.textContent = 'Connecting to your account…';
    this.retry_.hidden = true;
    this.element_.classList.remove('has-error');
    this.element_.hidden = false;
    this.page_.classList.add('is-loading');
    this.page_.setAttribute('aria-busy', 'true');
    this.setContentInert_(true);
    if (this.page_.style.display === 'flex') this.element_.focus({ preventScroll: true });
  }

  update(message: string): void {
    this.status_.textContent = message;
  }

  finish(): void {
    const restoreFocus = this.element_.contains(document.activeElement);
    this.cancel();
    if (this.page_.style.display !== 'flex') return;
    if (restoreFocus) this.page_.querySelector<HTMLButtonElement>('.selection-item[aria-pressed="true"]')?.focus({ preventScroll: true });
    animateSelection(this.page_);
  }

  fail(): void {
    this.title_.textContent = 'Progress unavailable';
    this.status_.textContent = 'Your saved progress could not be downloaded. Retry to load your missions.';
    this.page_.setAttribute('aria-busy', 'false');
    this.element_.classList.add('has-error');
    this.retry_.hidden = false;
    if (this.element_.contains(document.activeElement)) this.retry_.focus({ preventScroll: true });
  }

  cancel(): void {
    this.element_.hidden = true;
    this.page_.classList.remove('is-loading');
    this.page_.setAttribute('aria-busy', 'false');
    this.setContentInert_(false);
  }

  private setContentInert_(inert: boolean): void {
    for (const child of Array.from(this.page_.children)) {
      if (child instanceof HTMLElement && !child.isSameNode(this.element_)) child.inert = inert;
    }
  }
}
