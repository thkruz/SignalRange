import { DevMenuService } from '@app/dev-menu/dev-menu-service';
import { setMenuPause } from '@app/game-menu/menu-pause';
import { Auth } from '@app/user-account/auth';
import { captureFeedbackScreen, captureFeedbackState } from './feedback-capture';
import { describeCaptureFailure } from './feedback-capture-error';
import { type FeedbackSubmission, submitFeedback } from './feedback-service';
import './feedback.css';

/** App-lifetime UI; independent of the per-scenario EventBus. */
export class Feedback {
  private readonly tab_ = document.createElement('button');
  private readonly dialog_ = document.createElement('dialog');
  private readonly notice_ = document.createElement('div');
  private noticeTimeout_: ReturnType<typeof setTimeout> | null = null;
  private readonly observer_: MutationObserver;
  private draft_: FeedbackSubmission | null = null;
  private generation_ = 0;
  private busy_ = false;
  private capturedScreenshot_: string | null = null;
  private captureFailed_ = false;
  private owner_: string | null = null;
  private readonly unsubscribeDev_: () => void;
  private readonly authSubscription_: ReturnType<typeof Auth.onAuthStateChange>;

  constructor() {
    this.tab_.type = 'button';
    this.tab_.className = 'qa-feedback-tab';
    this.tab_.textContent = 'Feedback';
    this.tab_.setAttribute('data-feedback-ui', '');
    this.tab_.setAttribute('aria-haspopup', 'dialog');
    this.tab_.addEventListener('click', () => this.open());
    this.dialog_.className = 'qa-feedback-dialog';
    this.dialog_.setAttribute('data-feedback-ui', '');
    this.dialog_.setAttribute('aria-labelledby', 'qa-feedback-title');
    this.dialog_.innerHTML = `
      <form class="qa-feedback-form">
        <div class="qa-feedback-heading"><h2 id="qa-feedback-title">Feedback</h2><span>DEV QA</span></div>
        <p class="qa-feedback-help">Describe what you noticed. Game state is attached automatically; include the screenshot when it helps explain your feedback.</p>
        <label for="qa-feedback-message">Observation or issue</label>
        <textarea id="qa-feedback-message" class="form-control" maxlength="10000" rows="5" required placeholder="What happened? What did you expect?"></textarea>
        <label class="form-check form-switch qa-feedback-screenshot-toggle">
          <input type="checkbox" class="form-check-input" id="qa-feedback-include-screenshot" checked />
          <span class="form-check-label">Include screenshot</span>
        </label>
        <img class="qa-feedback-preview" alt="Game screen captured before opening feedback" hidden />
        <p class="qa-feedback-status" role="status" aria-live="polite"></p>
        <div class="qa-feedback-actions"><button type="button" class="btn qa-feedback-cancel">Cancel</button><button type="submit" class="btn btn-primary qa-feedback-send" disabled>Send feedback</button></div>
      </form>`;
    document.body.append(this.tab_, this.dialog_);
    this.notice_.className = 'qa-feedback-notice';
    this.notice_.hidden = true;
    this.notice_.setAttribute('role', 'status');
    this.notice_.setAttribute('aria-live', 'polite');
    this.notice_.setAttribute('data-feedback-ui', '');
    document.body.append(this.notice_);
    this.dialog_.addEventListener('keydown', (event) => event.stopPropagation());
    this.dialog_.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!this.busy_) this.close_();
    });
    this.dialog_.querySelector('.qa-feedback-cancel')!.addEventListener('click', () => this.close_());
    this.dialog_.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send_();
    });
    this.input_.addEventListener('input', () => this.updateSend_());
    this.screenshotToggle_.addEventListener('change', () => this.updateScreenshot_());
    this.unsubscribeDev_ = DevMenuService.getInstance().onChange(() => this.updateVisibility_());
    this.authSubscription_ = Auth.onAuthStateChange((_event, user) => {
      if (this.owner_ && this.owner_ !== user?.id) this.close_();
      this.owner_ = user?.id ?? null;
      this.updateVisibility_();
    });
    void Auth.getCurrentUser()
      .then((user) => {
        this.owner_ ??= user?.id ?? null;
      })
      .catch(() => {});
    // Native modal dialogs make the body inert. Move the tab into the active
    // dialog so feedback remains clickable from pause/loadout and other menus.
    this.observer_ = new MutationObserver(() => this.positionTab_());
    this.observer_.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'disabled'] });
    this.updateVisibility_();
  }

  private get input_(): HTMLTextAreaElement {
    return this.dialog_.querySelector('textarea')!;
  }
  private get status_(): HTMLElement {
    return this.dialog_.querySelector('.qa-feedback-status')!;
  }

  private get screenshotToggle_(): HTMLInputElement {
    return this.dialog_.querySelector('#qa-feedback-include-screenshot')!;
  }

  private updateScreenshot_(): void {
    if (!this.draft_ || this.input_.readOnly) return;
    this.draft_.screenshot = this.screenshotToggle_.checked ? this.capturedScreenshot_ : null;
    const preview = this.dialog_.querySelector<HTMLImageElement>('img')!;
    preview.hidden = !this.draft_.screenshot;
    if (this.draft_.screenshot) preview.src = this.draft_.screenshot;
    else preview.removeAttribute('src');
    this.status_.textContent = this.captureFailed_
      ? 'Screenshot unavailable. You can still send feedback; capture failure details and game state are attached.'
      : !this.screenshotToggle_.checked
        ? 'Game state attached. Screenshot will not be uploaded.'
        : this.capturedScreenshot_
          ? 'Screen and game state attached. Visible only to the QA team.'
          : 'Capturing screen. Game state attached.';
    this.updateSend_();
  }

  private positionTab_(): void {
    // Some menus disable all descendant buttons during navigation. The QA tab
    // belongs to the app and must remain usable after that menu is removed.
    if (this.tab_.disabled) this.tab_.disabled = false;
    const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter((dialog) => dialog !== this.dialog_);
    const parent = dialogs.at(-1) ?? document.body;
    if (this.tab_.parentElement !== parent) parent.append(this.tab_);
    if (this.notice_.parentElement !== parent) parent.append(this.notice_);
  }

  private updateVisibility_(): void {
    this.tab_.hidden = !DevMenuService.getInstance().isDev();
    if (this.tab_.hidden && this.dialog_.open) this.close_();
    this.positionTab_();
  }

  open(): void {
    if (!DevMenuService.getInstance().isDev() || this.dialog_.open) return;
    this.clearNotice_();
    const generation = ++this.generation_;
    this.busy_ = false;
    this.capturedScreenshot_ = null;
    this.captureFailed_ = false;
    this.screenshotToggle_.checked = true;
    this.screenshotToggle_.disabled = false;
    this.input_.value = '';
    this.input_.disabled = false;
    this.input_.readOnly = false;
    const cancel = this.dialog_.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!;
    cancel.disabled = false;
    cancel.textContent = 'Cancel';
    const preview = this.dialog_.querySelector<HTMLImageElement>('img')!;
    preview.hidden = true;
    preview.removeAttribute('src');
    this.status_.textContent = 'Capturing screen and game state…';
    setMenuPause('feedback', true);
    try {
      this.draft_ = { id: crypto.randomUUID(), message: '', screenshot: null, snapshot: captureFeedbackState() };
      const capture = captureFeedbackScreen();
      this.dialog_.showModal();
      this.input_.focus();
      void capture
        .then((screenshot) => {
          if (generation !== this.generation_ || !this.draft_ || this.input_.readOnly) return;
          this.capturedScreenshot_ = screenshot;
          this.updateScreenshot_();
        })
        .catch((error: unknown) => {
          if (generation !== this.generation_ || !this.draft_ || this.input_.readOnly) return;
          this.captureFailed_ = true;
          this.draft_.snapshot.screenshotCapture = describeCaptureFailure(error);
          this.screenshotToggle_.checked = false;
          this.screenshotToggle_.disabled = true;
          this.updateScreenshot_();
        });
    } catch {
      this.draft_ = null;
      this.dialog_.showModal();
      this.status_.textContent = 'Game state could not be captured. Close feedback and try again.';
    }
    this.updateSend_();
  }

  private updateSend_(): void {
    this.dialog_.querySelector<HTMLButtonElement>('.qa-feedback-send')!.disabled =
      this.busy_ || !this.draft_ || (this.screenshotToggle_.checked && !this.draft_.screenshot) || !this.input_.value.trim();
  }

  private async send_(): Promise<void> {
    if (this.busy_ || !this.draft_ || (this.screenshotToggle_.checked && !this.draft_.screenshot) || !this.input_.value.trim() || !DevMenuService.getInstance().isDev()) return;
    this.busy_ = true;
    const generation = this.generation_;
    this.draft_.message = this.input_.value;
    // A failed response may already have committed. Keep the original payload
    // immutable so retrying its receipt cannot silently discard later edits.
    this.input_.readOnly = true;
    this.screenshotToggle_.disabled = true;
    if (!this.screenshotToggle_.checked) {
      this.draft_.screenshot = null;
      this.capturedScreenshot_ = null;
    }
    this.dialog_.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!.disabled = true;
    this.status_.textContent = 'Saving feedback…';
    this.updateSend_();
    try {
      await submitFeedback(this.draft_);
      if (generation !== this.generation_) return;
      this.close_();
      this.notice_.hidden = false;
      this.notice_.innerHTML = `<span class="qa-feedback-notice-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 3h13l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8M14 4v3"/></svg></span><span><strong>Feedback saved</strong><span class="qa-feedback-notice-detail">Thank you for helping improve SignalRange.</span></span>`;
      this.noticeTimeout_ = setTimeout(() => this.clearNotice_(), 4000);
    } catch (error) {
      if (generation !== this.generation_) return;
      this.status_.textContent = error instanceof Error ? error.message : 'Could not save. Please retry.';
      this.input_.disabled = false;
    } finally {
      if (generation === this.generation_) {
        this.busy_ = false;
        this.dialog_.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!.disabled = false;
        this.updateSend_();
      }
    }
  }

  private close_(): void {
    this.clearNotice_();
    ++this.generation_;
    if (this.dialog_.open) this.dialog_.close();
    this.draft_ = null;
    this.capturedScreenshot_ = null;
    this.dialog_.querySelector<HTMLImageElement>('img')!.removeAttribute('src');
    this.input_.value = '';
    this.busy_ = false;
    this.updateSend_();
    setMenuPause('feedback', false);
    if (!this.tab_.hidden) this.tab_.focus();
  }

  private clearNotice_(): void {
    if (this.noticeTimeout_ !== null) clearTimeout(this.noticeTimeout_);
    this.noticeTimeout_ = null;
    this.notice_.hidden = true;
    this.notice_.textContent = '';
  }

  dispose(): void {
    this.close_();
    this.observer_.disconnect();
    this.unsubscribeDev_();
    this.authSubscription_?.data.subscription.unsubscribe();
    this.tab_.remove();
    this.dialog_.remove();
    this.notice_.remove();
  }
}
