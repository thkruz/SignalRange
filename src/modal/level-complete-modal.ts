import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import type { ScoreBreakdown } from '@app/scoring/score-calculator';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { clearPersistedStore } from '@app/sync/storage';
import { getUserDataService } from '@app/user-account/user-data-service';
import { DialogManager } from './dialog-manager';
import './level-complete-modal.css';
import { PendingQuizIndicator } from './pending-quiz-indicator';
import { QuizModal } from './quiz-modal';

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
    score: { basePoints: 0, timeBonus: 0, quizPenalties: 0, timePenalties: 0, totalScore: 0 },
    elapsedTimeSeconds: 0,
    campaignId: '',
    scenarioId: '',
  };

  private onContinueCallback_: (() => void | Promise<void>) | null = null;
  private isReplayMode_: boolean = false;

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
            ${score.timePenalties > 0 ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Time Penalties</span>
              <span class="breakdown-value negative">-${score.timePenalties}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="complete-modal__time">
          ${this.isReplayMode_ ? 'Previously completed' : `Completed in ${elapsedFormatted}`}
        </div>

        <div class="complete-modal__actions">
          ${this.isReplayMode_ ? '<button id="play-again-btn" class="btn btn-primary">Play Again</button>' : ''}
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

    const playAgainBtn = this.boxEl?.querySelector('#play-again-btn');
    playAgainBtn?.addEventListener('click', () => this.handlePlayAgain_());
  }

  private async handleContinue_(): Promise<void> {
    // Call the callback first (to save score) - must await to ensure save completes before navigation
    if (this.onContinueCallback_) {
      await this.onContinueCallback_();
    }

    // Close this modal and all other popups
    this.forceClose_();

    // Navigate back to campaign scenarios
    const { campaignId } = this.options_;
    Router.getInstance().navigate(`/campaigns/${campaignId}`);
  }

  private async handlePlayAgain_(): Promise<void> {
    // Close this modal
    this.forceClose_();

    const { campaignId, scenarioId } = this.options_;

    // Clear checkpoint and scenario progress so it starts fresh
    try {
      const userDataService = getUserDataService();
      await Promise.all([
        userDataService.deleteScenarioProgress(scenarioId),
        userDataService.deleteCheckpoint(scenarioId),
      ]);
      Logger.info(`Cleared progress and checkpoint for Play Again: ${scenarioId}`);
    } catch (error) {
      Logger.error('Failed to clear progress for Play Again:', error);
      // Continue anyway - user wants to play again
    }

    // Clear local equipment state so scenario starts with default equipment settings
    await clearPersistedStore();

    // Navigate to the same scenario to restart fresh (forceReplay skips the completion check)
    Router.getInstance().navigate(`/campaigns/${campaignId}/scenarios/${scenarioId}`, { forceReplay: true });
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
   * @param options Score and scenario information
   * @param onContinue Callback when Continue button is clicked
   * @param isReplay True if showing for an already-completed scenario (adds Play Again button)
   */
  showCompletion(options: CompletionModalOptions, onContinue?: () => void | Promise<void>, isReplay?: boolean): void {
    this.options_ = options;
    this.onContinueCallback_ = onContinue ?? null;
    this.isReplayMode_ = isReplay ?? false;

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
    PendingQuizIndicator.getInstance().suppress();

    // Close quiz modal if open
    QuizModal.getInstance().close();

    // Close dialog if showing
    DialogManager.getInstance().hide();

    // Close checklist and mission brief boxes if open
    const sim = SimulationManager.getInstance();
    sim.checklistBox?.close();
    sim.missionBriefBox?.close();
  }

  override close(): void {
    // Do nothing - modal cannot be closed by X button or background click
    // User must use Continue button
  }
}
