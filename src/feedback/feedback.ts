import { FEEDBACK_CONTACT_URL } from '@app/campaigns/release-stage';
import { DevMenuService } from '@app/dev-menu/dev-menu-service';
import { setMenuPause } from '@app/game-menu/menu-pause';
import { Auth } from '@app/user-account/auth';
import { captureFeedbackScreen, captureFeedbackState } from './feedback-capture';
import { describeCaptureFailure } from './feedback-capture-error';
import {
  attachmentSummary,
  buildRequest,
  CATEGORY_LABELS,
  clampMessage,
  codePointCount,
  createDraft,
  describeRejection,
  describeSubmitError,
  type ErrorView,
  type FeedbackDraft,
  tierFor,
} from './feedback-form';
import { FEEDBACK_CATEGORIES, type FeedbackCategory, TIER_LIMITS } from './feedback-rules';
import { FeedbackSubmitError, submitFeedback } from './feedback-service';
import './feedback.css';

/**
 * Whether the feedback-submit Edge Function is live for everyone. Build-time flag `__FEEDBACK_EDGE_LIVE__`
 * (env `PUBLIC_FEEDBACK_EDGE_LIVE=true`), off by default. While it is off, only the developer tier sees the form
 * (it posts to the same function) and everyone else sees the contact link. After the production smoke test in
 * supabase/functions/feedback-submit/README.md passes, switching this on is that one env change; there is no RPC fallback.
 */
export interface FeedbackOptions {
  edgeLive?: boolean;
}

type CaptureState = 'pending' | 'ready' | 'failed';
type View = { kind: 'edit' } | { kind: 'sending' } | { kind: 'error'; error: ErrorView } | { kind: 'filed'; ticket: string };

const q = <T extends Element>(root: ParentNode, selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`feedback form is missing ${selector}`);
  return el;
};

/**
 * In-game field report. Signed-in players file it from a tab on the console; signed-out players get a
 * contact link instead. App-lifetime UI, independent of the per-scenario EventBus.
 */
export class Feedback {
  private readonly tab_ = document.createElement('button');
  private readonly contact_ = document.createElement('a');
  private readonly dialog_ = document.createElement('dialog');
  private readonly observer_: MutationObserver;
  private readonly unsubscribeDev_: () => void;
  private readonly authSubscription_: ReturnType<typeof Auth.onAuthStateChange>;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private readonly boundCancel_ = (event: Event): void => this.onCancel_(event);
  private readonly boundSubmit_ = (event: Event): void => {
    event.preventDefault();
    void this.send_();
  };

  private draft_: FeedbackDraft | null = null;
  private view_: View = { kind: 'edit' };
  private captureState_: CaptureState = 'pending';
  private captureNote_ = '';
  /** Bumped on open and close so a capture that resolves late is dropped. */
  private captureGeneration_ = 0;
  /** Bumped when the draft is discarded so a reply for a dead draft is dropped. */
  private sendGeneration_ = 0;
  private userId_: string | null = null;
  private signedIn_ = false;
  private previousFocus_: HTMLElement | null = null;
  private retryUntil_ = 0;
  private countdownTimer_: ReturnType<typeof setInterval> | null = null;
  private held_ = false;
  private readonly edgeLive_: boolean;
  private readonly boundClose_ = (): void => {
    // A stale close event from a form that was reopened in the same turn must not tear down the new session.
    if (!this.dialog_.open) this.teardown_();
  };

  constructor(options: FeedbackOptions = {}) {
    this.edgeLive_ = options.edgeLive ?? __FEEDBACK_EDGE_LIVE__;
    this.tab_.type = 'button';
    this.tab_.className = 'fr-tab';
    this.tab_.textContent = 'Feedback';
    this.tab_.setAttribute('data-feedback-ui', '');
    this.tab_.setAttribute('aria-haspopup', 'dialog');
    this.tab_.hidden = true;
    this.tab_.addEventListener('click', () => this.open());
    this.contact_.className = 'fr-tab fr-tab-contact';
    this.contact_.textContent = 'Contact';
    this.contact_.href = FEEDBACK_CONTACT_URL;
    this.contact_.target = '_blank';
    this.contact_.rel = 'noopener noreferrer';
    this.contact_.referrerPolicy = 'no-referrer';
    this.contact_.setAttribute('data-feedback-ui', '');
    this.contact_.hidden = true;

    this.dialog_.className = 'fr-dialog';
    this.dialog_.setAttribute('data-feedback-ui', '');
    this.dialog_.setAttribute('aria-labelledby', 'fr-title');
    this.dialog_.innerHTML = this.template_();
    document.body.append(this.tab_, this.contact_, this.dialog_);

    // Game hotkeys must not fire while the operator types.
    this.dialog_.addEventListener('keydown', (event) => event.stopPropagation());
    this.dialog_.addEventListener('cancel', this.boundCancel_);
    this.dialog_.addEventListener('close', this.boundClose_);
    this.form_.addEventListener('submit', this.boundSubmit_);
    this.el_('fr-discard').addEventListener('click', () => this.discard_());
    this.el_('fr-putaway').addEventListener('click', () => this.close_());
    this.el_('fr-done').addEventListener('click', () => this.close_());
    this.el_('fr-message').addEventListener('input', () => this.onMessageInput_());
    this.el_('fr-shot').addEventListener('change', () => this.onScreenshotToggle_());
    this.el_('fr-category').addEventListener('change', (event) => this.onCategory_(event));

    this.unsubscribeDev_ = DevMenuService.getInstance().onChange(() => {
      this.syncEntry_();
      this.render_();
    });
    this.authSubscription_ = Auth.onAuthStateChange((_event, user) => this.setUser_(user));
    void Auth.getCurrentUser()
      .then((user) => {
        if (this.userId_ === null) this.setUser_(user);
      })
      .catch(() => {});
    // The entry lives on the body and steps aside whenever another dialog, menu or in-world object view is open.
    this.observer_ = new MutationObserver(() => this.syncEntry_());
    this.observer_.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    this.syncEntry_();
  }

  private template_(): string {
    const stamps = FEEDBACK_CATEGORIES.map(
      (key, index) => `
        <label class="fr-stamp-option">
          <input type="radio" name="fr-category" value="${key}" ${index === 0 ? 'checked' : ''} />
          <span class="fr-stamp-face"><strong>${CATEGORY_LABELS[key].label}</strong><small>${CATEGORY_LABELS[key].hint}</small></span>
        </label>`
    ).join('');
    return `
      <form class="fr-form" novalidate>
        <div class="fr-clip" aria-hidden="true"></div>
        <header class="fr-head">
          <div>
            <p class="fr-formno">FORM SR-FR &middot; STATION FIELD REPORT <span id="fr-tier" hidden>&middot; DEV QA</span></p>
            <h2 id="fr-title">Field report</h2>
          </div>
          <div class="fr-ticket" aria-label="Report number"><span>REPORT NO.</span><b id="fr-ticket">--------</b></div>
          <button type="button" id="fr-putaway" class="fr-icon-btn" aria-label="Put the form away (Escape)">&times;</button>
        </header>
        <div id="fr-edit">
          <fieldset class="fr-category" id="fr-category">
            <legend>Report type</legend>
            <div class="fr-stamps">${stamps}</div>
          </fieldset>
          <label class="fr-label" for="fr-message">Report body</label>
          <textarea id="fr-message" class="fr-body" rows="7" placeholder="What did you see? What did you expect? What were you doing at the console?" autocomplete="off" spellcheck="true"></textarea>
          <p class="fr-count" id="fr-count" aria-live="polite"></p>
          <section class="fr-attach" aria-labelledby="fr-attach-title">
            <h3 id="fr-attach-title">Attachments</h3>
            <label class="fr-switch">
              <input type="checkbox" id="fr-shot" />
              <span class="fr-switch-track" aria-hidden="true"></span>
              <span class="fr-switch-text">Attach a screen capture</span>
            </label>
            <div id="fr-shot-panel" hidden>
              <p class="fr-consent">The capture shows what was on your screen when you opened this form. It is stored privately and read only by the team that triages reports. Nothing is sent until you file.</p>
              <img id="fr-preview" class="fr-preview" alt="Screen capture that will be attached to this report" hidden />
            </div>
            <p class="fr-note" id="fr-shot-note" hidden></p>
            <p class="fr-manifest-title">Filed with this report</p>
            <ul class="fr-manifest" id="fr-manifest"></ul>
          </section>
        </div>
        <section id="fr-filed" class="fr-filed" hidden>
          <div class="fr-filed-stamp" aria-hidden="true">FILED</div>
          <p class="fr-filed-line"><strong>Report filed.</strong> Number <b id="fr-filed-no">--------</b></p>
          <p class="fr-filed-sub">It went to the team that reads these. Thank you for the field note.</p>
        </section>
        <p class="fr-status" id="fr-status" role="status" aria-live="polite"></p>
        <footer class="fr-actions">
          <button type="button" id="fr-discard" class="fr-btn">Discard draft</button>
          <button type="submit" id="fr-send" class="fr-btn fr-btn-primary">File report</button>
          <button type="button" id="fr-done" class="fr-btn fr-btn-primary" hidden>Close</button>
        </footer>
      </form>`;
  }

  private get form_(): HTMLFormElement {
    return q<HTMLFormElement>(this.dialog_, 'form');
  }

  private el_<T extends HTMLElement = HTMLElement>(id: string): T {
    let el = this.domCache_.get(id);
    if (!el) {
      el = q<HTMLElement>(this.dialog_, `#${id}`);
      this.domCache_.set(id, el);
    }
    return el as T;
  }

  private get isDeveloper_(): boolean {
    return DevMenuService.getInstance().isDev();
  }

  // ------------------------------------------------------------------ entry point and auth

  private setUser_(user: { id: string; is_anonymous?: boolean } | null): void {
    const nextId = user?.id ?? null;
    if (this.userId_ !== nextId) {
      // Another account must not inherit a draft or a wait.
      this.discardDraft_();
      this.stopCountdown_();
      if (this.dialog_.open) this.close_();
    }
    this.userId_ = nextId;
    this.signedIn_ = user !== null && user.is_anonymous !== true;
    this.syncEntry_();
  }

  /** Signed-in players use the form once the Edge Function is live; developers always do. */
  private get formAvailable_(): boolean {
    return this.signedIn_ && (this.edgeLive_ || this.isDeveloper_);
  }

  private syncEntry_(): void {
    if (!this.formAvailable_ && this.dialog_.open) this.close_();
    // Menus, notebooks, part close-ups and every other held object own the screen: no entry over them.
    const covered = document.querySelector('dialog[open]:not(.fr-dialog), #part-closeup-modal') !== null;
    this.tab_.hidden = !this.formAvailable_ || covered;
    this.contact_.hidden = this.formAvailable_ || covered;
  }

  // ------------------------------------------------------------------ open and close

  open(): void {
    if (!this.formAvailable_ || this.dialog_.open) return;
    this.held_ = true;
    this.previousFocus_ = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const generation = ++this.captureGeneration_;
    setMenuPause('feedback', true);
    try {
      if (!this.draft_ || this.view_.kind === 'filed') {
        this.draft_ = createDraft(captureFeedbackState());
        this.view_ = { kind: 'edit' };
        this.el_<HTMLTextAreaElement>('fr-message').value = '';
      } else if (!this.draft_.locked) {
        this.draft_.snapshot = captureFeedbackState();
      }
    } catch {
      this.draft_ = null;
    }
    const draft = this.draft_;
    // A draft with an unconfirmed send keeps its original capture; a fresh draft captures the live screen
    // before the dialog covers it. The capture stays on this device until the operator files.
    if (draft && !draft.locked) {
      this.captureState_ = 'pending';
      this.captureNote_ = '';
      draft.screenshot = null;
      const capture = captureFeedbackScreen();
      void capture
        .then((screenshot) => {
          if (generation !== this.captureGeneration_ || !this.draft_ || this.draft_.locked) return;
          this.draft_.screenshot = screenshot;
          this.captureState_ = 'ready';
          this.render_();
        })
        .catch((error: unknown) => {
          if (generation !== this.captureGeneration_ || !this.draft_ || this.draft_.locked) return;
          const failure = describeCaptureFailure(error);
          this.draft_.snapshot.screenshotCapture = failure;
          this.captureState_ = 'failed';
          this.captureNote_ =
            failure.reason === 'too-large'
              ? 'The screen capture was too large to attach, even at low quality, so it was left off.'
              : 'The screen capture could not be made, so it was left off.';
          this.draft_.includeScreenshot = false;
          this.render_();
        });
    } else if (draft) {
      this.captureState_ = draft.screenshot ? 'ready' : 'failed';
    }
    this.dialog_.showModal();
    if (this.retryUntil_ > Date.now()) this.startCountdown_();
    this.render_();
    if (this.view_.kind === 'error' && this.view_.error.retryable) this.el_('fr-send').focus();
    else this.el_('fr-message').focus();
  }

  /** Put the form away. An unfinished or unconfirmed draft stays for the next time. */
  private close_(): void {
    if (this.dialog_.open) this.dialog_.close();
    this.teardown_();
  }

  /** Runs for every way the dialog can close, including a native close while a send is in flight. Idempotent. */
  private teardown_(): void {
    if (!this.held_) return;
    this.held_ = false;
    ++this.captureGeneration_;
    // The wait survives closing; open() restarts the countdown.
    this.stopCountdown_(false);
    if (this.view_.kind === 'filed') {
      this.draft_ = null;
      this.view_ = { kind: 'edit' };
    }
    // An unsent capture is dropped. Only a locked draft that will resend it keeps the data.
    if (this.draft_ && !(this.draft_.locked && this.draft_.includeScreenshot)) this.draft_.screenshot = null;
    this.captureState_ = 'pending';
    this.el_('fr-preview').removeAttribute('src');
    setMenuPause('feedback', false);
    const target = this.previousFocus_ && this.previousFocus_.isConnected ? this.previousFocus_ : this.signedIn_ ? this.tab_ : null;
    this.previousFocus_ = null;
    target?.focus();
  }

  private discard_(): void {
    this.discardDraft_();
    this.close_();
  }

  private discardDraft_(): void {
    ++this.sendGeneration_;
    this.draft_ = null;
    this.view_ = { kind: 'edit' };
    this.stopCountdown_(false);
    const input = this.dialog_.querySelector<HTMLTextAreaElement>('#fr-message');
    if (input) input.value = '';
  }

  private onCancel_(event: Event): void {
    event.preventDefault();
    if (this.view_.kind !== 'sending') this.close_();
  }

  // ------------------------------------------------------------------ field handlers

  private onMessageInput_(): void {
    if (!this.draft_ || this.draft_.locked) return;
    const input = this.el_<HTMLTextAreaElement>('fr-message');
    const clamped = clampMessage(input.value, tierFor(this.isDeveloper_));
    if (clamped !== input.value) input.value = clamped;
    this.draft_.message = clamped;
    if (this.view_.kind === 'error') this.view_ = { kind: 'edit' };
    this.render_();
  }

  private onCategory_(event: Event): void {
    if (!this.draft_ || this.draft_.locked) return;
    const target = event.target as HTMLInputElement;
    this.draft_.category = target.value as FeedbackCategory;
    this.render_();
  }

  private onScreenshotToggle_(): void {
    if (!this.draft_ || this.draft_.locked) return;
    this.draft_.includeScreenshot = this.el_<HTMLInputElement>('fr-shot').checked;
    this.render_();
  }

  // ------------------------------------------------------------------ send

  private async send_(): Promise<void> {
    const draft = this.draft_;
    if (!draft || this.view_.kind === 'sending' || this.view_.kind === 'filed' || Date.now() < this.retryUntil_) return;
    if (draft.includeScreenshot && !draft.screenshot) return;
    const built = buildRequest(draft, tierFor(this.isDeveloper_));
    if (built.ok === false) {
      this.view_ = { kind: 'error', error: { message: describeRejection(built.reason), retryable: false, retryAfterSec: null, editable: true } };
      this.render_();
      return;
    }
    // Retries resend this exact payload under the same id, so a lost response cannot file the report twice.
    draft.locked = true;
    this.view_ = { kind: 'sending' };
    const generation = this.sendGeneration_;
    this.render_();
    try {
      await submitFeedback(built.request);
      if (generation !== this.sendGeneration_) return;
      const ticket = draft.id.slice(0, 8).toUpperCase();
      this.draft_ = null;
      this.el_<HTMLTextAreaElement>('fr-message').value = '';
      this.view_ = { kind: 'filed', ticket };
      this.render_();
      this.el_('fr-done').focus();
    } catch (error) {
      if (generation !== this.sendGeneration_) return;
      const view = describeSubmitError(error);
      if (view.editable) {
        // Nothing was stored. Unlock for edits and use a fresh id for the corrected report.
        draft.locked = false;
        draft.id = crypto.randomUUID().toLowerCase();
        if (error instanceof FeedbackSubmitError && error.reasons.includes('unknown-scenario')) draft.snapshot.scenarioId = null;
      }
      this.view_ = { kind: 'error', error: view };
      this.retryUntil_ = view.retryAfterSec ? Date.now() + view.retryAfterSec * 1000 : 0;
      if (this.retryUntil_ && this.dialog_.open) this.startCountdown_();
      this.render_();
      this.el_(view.retryable ? 'fr-send' : 'fr-message').focus();
    }
  }

  private startCountdown_(): void {
    this.stopCountdown_(false);
    this.countdownTimer_ = setInterval(() => {
      if (Date.now() >= this.retryUntil_) this.stopCountdown_();
      this.render_();
    }, 1000);
  }

  private stopCountdown_(reset = true): void {
    if (this.countdownTimer_ !== null) clearInterval(this.countdownTimer_);
    this.countdownTimer_ = null;
    if (reset) this.retryUntil_ = 0;
  }

  // ------------------------------------------------------------------ render

  private render_(): void {
    const draft = this.draft_;
    const filed = this.view_.kind === 'filed';
    const sending = this.view_.kind === 'sending';
    const tier = tierFor(this.isDeveloper_);
    const max = TIER_LIMITS[tier].maxChars;
    this.el_('fr-tier').hidden = !this.isDeveloper_;
    this.el_('fr-edit').hidden = filed;
    this.el_('fr-filed').hidden = !filed;
    this.el_('fr-discard').hidden = filed;
    this.el_('fr-send').hidden = filed;
    this.el_('fr-done').hidden = !filed;
    this.el_('fr-ticket').textContent = this.view_.kind === 'filed' ? this.view_.ticket : (draft?.id.slice(0, 8).toUpperCase() ?? '--------');
    if (this.view_.kind === 'filed') this.el_('fr-filed-no').textContent = this.view_.ticket;

    const locked = !draft || draft.locked || sending;
    const input = this.el_<HTMLTextAreaElement>('fr-message');
    input.readOnly = locked;
    for (const radio of Array.from(this.dialog_.querySelectorAll<HTMLInputElement>('input[name="fr-category"]'))) {
      radio.disabled = locked;
      radio.checked = radio.value === (draft?.category ?? 'bug');
    }
    const used = codePointCount(input.value);
    const count = this.el_('fr-count');
    count.textContent = `${used.toLocaleString('en-US')} / ${max.toLocaleString('en-US')} characters`;
    count.classList.toggle('fr-count-warn', used >= max * 0.9);

    const toggle = this.el_<HTMLInputElement>('fr-shot');
    const shotOn = draft?.includeScreenshot ?? false;
    toggle.checked = shotOn;
    toggle.disabled = locked || this.captureState_ === 'failed';
    this.el_('fr-shot-panel').hidden = !shotOn;
    const preview = this.el_<HTMLImageElement>('fr-preview');
    const showPreview = shotOn && !!draft?.screenshot;
    preview.hidden = !showPreview;
    if (showPreview && preview.getAttribute('src') !== draft!.screenshot) preview.src = draft!.screenshot!;
    if (!showPreview) preview.removeAttribute('src');
    const note = this.el_('fr-shot-note');
    note.hidden = this.captureNote_ === '' && !(shotOn && this.captureState_ === 'pending');
    note.textContent = this.captureState_ === 'failed' ? this.captureNote_ : 'Preparing the screen capture…';

    const manifest = this.el_('fr-manifest');
    manifest.replaceChildren(
      ...(draft ? attachmentSummary(draft) : []).map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      })
    );

    const status = this.el_('fr-status');
    const send = this.el_<HTMLButtonElement>('fr-send');
    const waiting = Math.max(0, Math.ceil((this.retryUntil_ - Date.now()) / 1000));
    status.classList.toggle('fr-status-error', this.view_.kind === 'error');
    if (this.view_.kind === 'sending') status.textContent = 'Filing the report…';
    else if (this.view_.kind === 'error') status.textContent = this.view_.error.message;
    else if (draft === null && !filed) status.textContent = 'The game state could not be read. Close the form and try again.';
    else status.textContent = '';
    const retrying = this.view_.kind === 'error' && this.view_.error.retryable;
    send.textContent = sending ? 'Filing…' : waiting > 0 ? `Retry in ${waiting}s` : retrying ? 'Retry filing' : 'File report';
    send.disabled = sending || !draft || waiting > 0 || (shotOn && !draft.screenshot) || (!retrying && codePointCount(draft.message.trim()) === 0);
    this.el_<HTMLButtonElement>('fr-discard').disabled = sending;
    this.el_<HTMLButtonElement>('fr-putaway').disabled = sending;
  }

  dispose(): void {
    this.discardDraft_();
    this.stopCountdown_();
    if (this.dialog_.open) this.close_();
    this.dialog_.removeEventListener('cancel', this.boundCancel_);
    this.dialog_.removeEventListener('close', this.boundClose_);
    this.form_.removeEventListener('submit', this.boundSubmit_);
    this.observer_.disconnect();
    this.unsubscribeDev_();
    this.authSubscription_?.data.subscription.unsubscribe();
    this.tab_.remove();
    this.contact_.remove();
    this.dialog_.remove();
    this.domCache_.clear();
  }
}
