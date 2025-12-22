import { html } from '@app/engine/utils/development/formatter';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { Router } from '@app/router';
import type { ScoreBreakdown } from '@app/scoring/score-calculator';
import { DialogManager } from './dialog-manager';
import { PendingQuizIndicator } from './pending-quiz-indicator';
import { QuizModal } from './quiz-modal';
import './level-complete-modal.css';

interface CompletionModalOptions {
  score: ScoreBreakdown;
  elapsedTimeSeconds: number;
  campaignId: string;
  scenarioId: string;
}

export class LevelCompleteModal extends DraggableModal {
  private static readonly id = 'level-complete-modal';
  private static instance_: LevelCompleteModal | null = null;

  private options_: CompletionModalOptions = {
    score: { basePoints: 0, timeBonus: 0, quizPenalties: 0, totalScore: 0 },
    elapsedTimeSeconds: 0,
    campaignId: '',
    scenarioId: '',
  };

  private onContinueCallback_: (() => void) | null = null;

  private constructor() {
    if (LevelCompleteModal.instance_) {
      throw new Error('Use getInstance() instead of new.');
    }

    super(LevelCompleteModal.id, {
      title: 'Mission Complete!',
      width: '400px',
    });
  }

  static getInstance(): LevelCompleteModal {
    LevelCompleteModal.instance_ ??= new LevelCompleteModal();
    return LevelCompleteModal.instance_;
  }

  protected getModalContentHtml(): string {
    const { score, elapsedTimeSeconds } = this.options_;
    const elapsedFormatted = this.formatTime_(elapsedTimeSeconds);

    return html`
      <div class="complete-modal">
        <div class="complete-modal__icon">&#127942;</div>
        <div class="complete-modal__title">Mission Complete!</div>

        <div class="complete-modal__score-section">
          <div class="complete-modal__total">
            <span class="total-label">Total Score</span>
            <span class="total-value">${score.totalScore}</span>
          </div>

          <div class="complete-modal__breakdown">
            <div class="breakdown-row">
              <span class="breakdown-label">Objectives</span>
              <span class="breakdown-value positive">+${score.basePoints}</span>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label">Time Bonus</span>
              <span class="breakdown-value positive">+${score.timeBonus}</span>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label">Quiz Penalties</span>
              <span class="breakdown-value negative">-${score.quizPenalties}</span>
            </div>
          </div>
        </div>

        <div class="complete-modal__time">
          Completed in ${elapsedFormatted}
        </div>

        <div class="complete-modal__actions">
          <button id="continue-btn" class="btn btn-success">Continue</button>
        </div>
      </div>
    `;
  }

  protected override onOpen(): void {
    super.onOpen();

    // Hide the close button - user must use Continue
    const closeBtn = this.boxEl?.querySelector(`#${LevelCompleteModal.id}-close`);
    if (closeBtn) {
      (closeBtn as HTMLElement).style.display = 'none';
    }

    this.initializeEventListeners_();
  }

  private initializeEventListeners_(): void {
    const continueBtn = this.boxEl?.querySelector('#continue-btn');
    continueBtn?.addEventListener('click', () => this.handleContinue_());
  }

  private handleContinue_(): void {
    // Call the callback first (to save score)
    if (this.onContinueCallback_) {
      this.onContinueCallback_();
    }

    // Close this modal and all other popups
    this.forceClose_();

    // Navigate back to campaign scenarios
    const { campaignId } = this.options_;
    Router.getInstance().navigate(`/campaigns/${campaignId}`);
  }

  /**
   * Actually close the modal (bypasses the override that prevents X/backdrop close)
   */
  private forceClose_(): void {
    super.close();
  }

  /**
   * Format seconds into MM:SS or HH:MM:SS
   */
  private formatTime_(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Show the completion modal with score breakdown
   */
  showCompletion(options: CompletionModalOptions, onContinue?: () => void): void {
    this.options_ = options;
    this.onContinueCallback_ = onContinue ?? null;

    // Close any open popups before showing completion modal
    this.closeAllPopups_();

    // Force regeneration of modal content with new options
    if (this.boxEl) {
      const contentEl = this.boxEl.querySelector('.draggable-box__content');
      if (contentEl) {
        contentEl.innerHTML = this.getModalContentHtml();
        this.initializeEventListeners_();
      }
    }

    this.open();
  }

  private closeAllPopups_(): void {
    // Hide pending quiz indicator
    PendingQuizIndicator.getInstance().hideAndCancel();

    // Close quiz modal if open
    QuizModal.getInstance().close();

    // Close dialog if showing
    DialogManager.getInstance().hide();
  }

  override close(): void {
    // Do nothing - modal cannot be closed by X button or background click
    // User must use Continue button
  }
}
