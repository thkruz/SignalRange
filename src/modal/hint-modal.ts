/**
 * @file Hint Modal - Shows hint with 50% point penalty confirmation
 * @description Modal that displays condition hints with penalty warning
 */

import { EventBus } from '@app/events/event-bus';
import { Events, HintShownData } from '@app/events/events';
import { DraggableModal } from '@engine/ui/draggable-modal';
import { html } from '@engine/utils/development/formatter';
import { getEl } from '@engine/utils/get-el';
import bulbPng from '../assets/icons/bulb.png';
import { HintManager } from './hint-manager';
import './hint-modal.css';

interface HintModalState {
  objectiveId: string;
  conditionIndex: number;
  hint: string;
  penaltyPoints: number;
  objectiveTitle: string;
}

/**
 * Modal for confirming hint requests with penalty warning
 */
export class HintModal extends DraggableModal {
  private static readonly MODAL_ID = 'hint-modal';
  private static instance_: HintModal | null = null;

  private currentState_: HintModalState | null = null;
  private readonly boundHintShownHandler_: (data: HintShownData) => void;

  private constructor() {
    super(HintModal.MODAL_ID, {
      title: 'Request Hint',
      width: '420px',
    });

    this.boundHintShownHandler_ = this.handleHintShown_.bind(this);
    EventBus.getInstance().on(Events.HINT_SHOWN, this.boundHintShownHandler_);
  }

  static getInstance(): HintModal {
    HintModal.instance_ ??= new HintModal();
    return HintModal.instance_;
  }

  /**
   * Show the hint confirmation modal
   */
  showConfirmation(
    objectiveId: string,
    conditionIndex: number,
    hint: string,
    penaltyPoints: number,
    objectiveTitle: string
  ): void {
    this.currentState_ = {
      objectiveId,
      conditionIndex,
      hint,
      penaltyPoints,
      objectiveTitle,
    };

    this.open(() => {
      this.renderConfirmation_();
      this.attachEventListeners_();
    });
  }

  /**
   * Show the hint directly without confirmation (for already-revealed hints)
   */
  showHintDirectly(
    objectiveId: string,
    conditionIndex: number,
    hint: string
  ): void {
    this.currentState_ = {
      objectiveId,
      conditionIndex,
      hint,
      penaltyPoints: 0,
      objectiveTitle: '',
    };

    this.open(() => {
      this.renderHint_();
      this.attachEventListeners_();
    });
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="hint-modal-content">
        <div id="hint-confirmation" class="hint-confirmation">
          <div class="hint-warning-icon"><img src="${bulbPng}" alt="Hint Icon" /></div>
          <p class="hint-warning-text">
            Viewing this hint will reduce your score for the objective
            <strong id="hint-objective-title"></strong> by <strong>50%</strong>.
          </p>
          <p class="hint-penalty-amount" id="hint-penalty-amount"></p>
          <div class="hint-buttons">
            <button id="hint-cancel-btn" class="hint-btn hint-btn-cancel">Cancel</button>
            <button id="hint-confirm-btn" class="hint-btn hint-btn-confirm">Reveal Hint (-50%)</button>
          </div>
        </div>
        <div id="hint-display" class="hint-display" style="display: none;">
          <div class="hint-label">Hint:</div>
          <p id="hint-text" class="hint-text"></p>
          <div class="hint-buttons">
            <button id="hint-close-btn" class="hint-btn hint-btn-confirm">Got it</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderConfirmation_(): void {
    if (!this.currentState_) return;

    const confirmationEl = getEl('hint-confirmation');
    const displayEl = getEl('hint-display');
    const objectiveTitleEl = getEl('hint-objective-title');
    const penaltyAmountEl = getEl('hint-penalty-amount');

    if (confirmationEl) confirmationEl.style.display = 'block';
    if (displayEl) displayEl.style.display = 'none';

    if (objectiveTitleEl) {
      objectiveTitleEl.textContent = `"${this.currentState_.objectiveTitle}"`;
    }

    if (penaltyAmountEl) {
      penaltyAmountEl.textContent = `-${this.currentState_.penaltyPoints} points`;
    }
  }

  private renderHint_(): void {
    if (!this.currentState_) return;

    const confirmationEl = getEl('hint-confirmation');
    const displayEl = getEl('hint-display');
    const hintTextEl = getEl('hint-text');

    if (confirmationEl) confirmationEl.style.display = 'none';
    if (displayEl) displayEl.style.display = 'block';

    if (hintTextEl) {
      hintTextEl.textContent = this.currentState_.hint;
    }
  }

  private attachEventListeners_(): void {
    const cancelBtn = getEl('hint-cancel-btn');
    const confirmBtn = getEl('hint-confirm-btn');
    const closeBtn = getEl('hint-close-btn');

    cancelBtn?.addEventListener('click', () => this.handleCancel_());
    confirmBtn?.addEventListener('click', () => this.handleConfirm_());
    closeBtn?.addEventListener('click', () => this.handleClose_());
  }

  private handleCancel_(): void {
    this.close();
    this.currentState_ = null;
  }

  private handleConfirm_(): void {
    if (!this.currentState_) return;

    // Request the hint through HintManager (this emits HINT_REQUESTED and HINT_SHOWN)
    HintManager.getInstance().requestHint(
      this.currentState_.objectiveId,
      this.currentState_.conditionIndex
    );
  }

  private handleHintShown_(data: HintShownData): void {
    // Update state with revealed hint and show it
    if (this.currentState_ &&
      this.currentState_.objectiveId === data.objectiveId &&
      this.currentState_.conditionIndex === data.conditionIndex) {
      this.renderHint_();
    }
  }

  private handleClose_(): void {
    this.close();
    this.currentState_ = null;
  }

  /**
   * Destroy the singleton instance and clean up event listeners
   */
  static destroy(): void {
    if (HintModal.instance_) {
      EventBus.getInstance().off(Events.HINT_SHOWN, HintModal.instance_.boundHintShownHandler_);
      HintModal.instance_ = null;
    }
  }
}
