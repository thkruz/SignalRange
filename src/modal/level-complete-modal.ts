import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import { ScoreCalculator, type ScoreBreakdown } from '@app/scoring/score-calculator';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { clearPersistedStore } from '@app/sync/storage';
import { Auth } from '@app/user-account/auth';
import { ModalLogin } from '@app/user-account/modal-login';
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
  /**
   * Whether the player was signed in when the scenario completed. When false
   * the modal shows the sign-up funnel: progress only persists to an account,
   * so this is the moment to convert. Omitted (replay flow) = treated as
   * signed in, no funnel shown.
   */
  isAuthenticated?: boolean;
}

export class LevelCompleteModal extends DraggableModal {
  private static readonly id = 'level-complete-modal';
  private static instance_: LevelCompleteModal | null = null;

  private options_: CompletionModalOptions = {
    score: {
      basePoints: 0,
      timeBonus: 0,
      quizPenalties: 0,
      timePenalties: 0,
      hintPenalties: 0,
      totalScore: 0,
      objectiveBreakdown: [],
      timeRemainingSeconds: 0,
    },
    elapsedTimeSeconds: 0,
    campaignId: '',
    scenarioId: '',
  };

  private onContinueCallback_: (() => void | Promise<void>) | null = null;
  private isReplayMode_: boolean = false;
  private authSubscription_: { data: { subscription: { unsubscribe: () => void } } } | null = null;

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
            <div class="breakdown-detail">${this.formatObjectivesDetail_(score.objectiveBreakdown)}</div>
            ${score.timeBonus > 0 ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Time Bonus</span>
              <span class="breakdown-value positive">+${score.timeBonus}</span>
            </div>
            <div class="breakdown-detail">${score.timeRemainingSeconds} seconds remaining / ${ScoreCalculator.TIME_BONUS_DIVISOR}</div>
            ` : ''}
            ${score.quizPenalties > 0 ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Quiz Penalties</span>
              <span class="breakdown-value negative">-${score.quizPenalties}</span>
            </div>
            <div class="breakdown-detail">${score.quizPenalties} points deducted</div>
            ` : ''}
            ${score.timePenalties > 0 ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Time Penalties</span>
              <span class="breakdown-value negative">-${score.timePenalties}</span>
            </div>
            <div class="breakdown-detail">${score.timePenalties} points deducted</div>
            ` : ''}
            ${score.hintPenalties > 0 ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Hint Penalties</span>
              <span class="breakdown-value negative">-${score.hintPenalties}</span>
            </div>
            <div class="breakdown-detail">${score.hintPenalties} points deducted for hints used</div>
            ` : ''}
          </div>
        </div>

        <div class="complete-modal__time">
          ${this.isReplayMode_ ? 'Previously completed' : `Completed in ${elapsedFormatted}`}
        </div>

        ${this.renderSignUpSection_()}

        <div class="complete-modal__actions">
          ${this.isReplayMode_ ? '<button id="play-again-btn" class="btn btn-primary">Play Again</button>' : ''}
          <button id="continue-btn" class="btn btn-success">Continue</button>
        </div>
      </div>
    `;
  }

  /**
   * Sign-up funnel shown when the scenario was completed while signed out.
   * Progress only persists to an account, so this completion (and the unlock
   * it earns) is lost unless the player signs in before moving on.
   */
  private renderSignUpSection_(): string {
    if (this.isReplayMode_ || this.options_.isAuthenticated !== false) {
      return '';
    }

    return html`
      <div id="complete-signup-section" class="complete-modal__signup">
        <div class="complete-modal__signup-text">
          You're not signed in, so this completion won't be saved and the
          next scenario stays locked. Create a free account to keep your
          progress.
        </div>
        <button id="signup-save-btn" class="btn btn-primary">Sign Up / Log In</button>
      </div>
    `;
  }

  /** Swap the sign-up prompt for a confirmation once the player signs in */
  private handleSignedInWhileOpen_(): void {
    const section = this.boxEl?.querySelector('#complete-signup-section');

    if (section) {
      section.innerHTML = html`
        <div class="complete-modal__signup-text complete-modal__signup-text--saved">
          Signed in - your progress is being saved to your account.
        </div>
      `;
    }
    this.unsubscribeAuth_();
  }

  private unsubscribeAuth_(): void {
    this.authSubscription_?.data.subscription.unsubscribe();
    this.authSubscription_ = null;
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

    const signUpBtn = this.boxEl?.querySelector('#signup-save-btn');
    signUpBtn?.addEventListener('click', () => ModalLogin.getInstance().open());
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

    // Reset progress (preserves completedAt so prerequisites stay unlocked) and clear checkpoint
    try {
      const userDataService = getUserDataService();
      await Promise.all([
        userDataService.resetScenarioForReplay(scenarioId),
        userDataService.deleteCheckpoint(scenarioId),
      ]);
      Logger.info(`Reset progress and cleared checkpoint for Play Again: ${scenarioId}`);
    } catch (error) {
      Logger.error('Failed to reset progress for Play Again:', error);
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
    this.unsubscribeAuth_();
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
   * Format objectives breakdown for display
   * Shows "N objectives x +X each" if uniform, or count with total if varied
   */
  private formatObjectivesDetail_(breakdown: { points: number }[]): string {
    if (breakdown.length === 0) return 'No objectives';

    const count = breakdown.length;
    const plural = count === 1 ? '' : 's';
    const points = breakdown.map((o) => o.points);
    const allSame = points.every((p) => p === points[0]);

    if (allSame) {
      return `${count} objective${plural} x +${points[0]} each`;
    }
    return `${count} objective${plural} completed`;
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

    // While the sign-up funnel is showing, react to a sign-in immediately
    // (the actual save is handled by ScenarioCompletionHandler's auth flush)
    this.unsubscribeAuth_();
    if (!this.isReplayMode_ && options.isAuthenticated === false) {
      this.authSubscription_ = Auth.onAuthStateChange((_event, _user, _profile, accessToken) => {
        if (accessToken) {
          this.handleSignedInWhileOpen_();
        }
      });
    }

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
