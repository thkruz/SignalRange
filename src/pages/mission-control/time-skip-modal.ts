/**
 * @file TimeSkipModal - Confirm a fast-forward to the next contact
 * @description Skipping consumes mission time that counts toward the operator's
 * shift and can age COMSEC key material, so it is never a single click. The
 * dialog states exactly where the clock lands, how much time that costs, and
 * what the skip will not do for them - the bird still has to be acquired.
 */

import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { getEl } from '@app/engine/utils/get-el';
import { SkipTarget, TimeSkipController } from '@app/simulation/time-skip-controller';
import { formatDuration, formatUtcClock } from './time-skip-format';
import './time-skip.css';

export class TimeSkipModal extends DraggableModal {
  private static readonly MODAL_ID = 'time-skip-modal';
  private static instance_: TimeSkipModal | null = null;

  private target_: SkipTarget | null = null;

  private constructor() {
    super(TimeSkipModal.MODAL_ID, {
      title: 'Skip Ahead',
      width: '440px',
    });
  }

  static getInstance(): TimeSkipModal {
    TimeSkipModal.instance_ ??= new TimeSkipModal();

    return TimeSkipModal.instance_;
  }

  static destroy(): void {
    // The modal renders itself into document.body under a fixed id. Dropping
    // only the instance would leave that node behind, and the next scenario's
    // modal would insert a duplicate id next to it.
    document.getElementById(`${TimeSkipModal.MODAL_ID}-container`)?.remove();
    TimeSkipModal.instance_ = null;
  }

  /** Open the confirmation for a resolved skip target. */
  showConfirmation(target: SkipTarget): void {
    this.target_ = target;

    this.open(() => {
      this.render_();
      this.attachEventListeners_();
    });
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="time-skip-modal-content">
        <p class="time-skip-lead" id="time-skip-lead"></p>
        <dl class="time-skip-summary">
          <dt>Contact</dt>
          <dd id="time-skip-contact"></dd>
          <dt>AOS</dt>
          <dd id="time-skip-aos"></dd>
          <dt>Clock to</dt>
          <dd id="time-skip-target"></dd>
          <dt>Skipping</dt>
          <dd id="time-skip-delta"></dd>
        </dl>
        <p class="time-skip-warning" id="time-skip-crypto-warning" style="display: none;"></p>
        <p class="time-skip-note" id="time-skip-note"></p>
        <div class="time-skip-buttons">
          <button id="time-skip-cancel-btn" class="time-skip-btn-modal time-skip-btn-cancel">Cancel</button>
          <button id="time-skip-confirm-btn" class="time-skip-btn-modal time-skip-btn-confirm">Skip Ahead</button>
        </div>
      </div>
    `;
  }

  private render_(): void {
    if (!this.target_) {
      return;
    }

    const target = this.target_;
    const controller = TimeSkipController.getInstance();
    const leadEl = getEl('time-skip-lead');
    const contactEl = getEl('time-skip-contact');
    const aosEl = getEl('time-skip-aos');
    const targetEl = getEl('time-skip-target');
    const deltaEl = getEl('time-skip-delta');
    const warningEl = getEl('time-skip-crypto-warning');
    const noteEl = getEl('time-skip-note');

    if (leadEl) {
      leadEl.textContent = 'Nothing is in view. Run the scenario clock forward to the next contact?';
    }
    if (contactEl) {
      contactEl.textContent = `${target.satelliteName} (max el ${target.maxEl.toFixed(1)}°)`;
    }
    if (aosEl) {
      aosEl.textContent = formatUtcClock(target.aosMs);
    }
    if (targetEl) {
      targetEl.textContent = `${formatUtcClock(target.targetMs)} (AOS -${formatDuration(target.aosMs - target.targetMs)})`;
    }
    if (deltaEl) {
      deltaEl.textContent = formatDuration(target.deltaMs);
    }

    if (warningEl) {
      warningEl.style.display = target.willExpireCryptoKey ? 'block' : 'none';
      if (target.willExpireCryptoKey) {
        warningEl.textContent = 'The loaded COMSEC key expires during this skip. Rotate it before you command.';
      }
    }

    if (noteEl) {
      noteEl.textContent = `The clock stops ${formatDuration(target.aosMs - target.targetMs)} short of AOS - `
        + `you still point the antenna and configure the chain yourself. Skipped time counts toward your `
        + `shift, and everything scheduled during it still happens.`;
    }

    // Keep the operator's default action the safe one.
    getEl('time-skip-cancel-btn')?.focus();

    // A stale reason from before the dialog opened would be misleading, so the
    // confirm button re-checks at render time too.
    const blockedReason = controller.getBlockedReason();
    const confirmBtn = getEl('time-skip-confirm-btn') as HTMLButtonElement | null;

    if (confirmBtn && blockedReason) {
      confirmBtn.disabled = true;
      confirmBtn.title = blockedReason;
    }
  }

  private attachEventListeners_(): void {
    getEl('time-skip-cancel-btn')?.addEventListener('click', () => this.handleCancel_());
    getEl('time-skip-confirm-btn')?.addEventListener('click', () => this.handleConfirm_());
  }

  private handleCancel_(): void {
    this.close();
    this.target_ = null;
  }

  private handleConfirm_(): void {
    if (!this.target_) {
      return;
    }

    // Re-resolve rather than trusting the target captured when the dialog
    // opened: the scenario clock has been running underneath it, so the wait is
    // shorter now and may have vanished entirely.
    const controller = TimeSkipController.getInstance();
    const target = controller.findTarget();

    this.close();
    this.target_ = null;

    if (target) {
      controller.start(target);
    }
  }
}
