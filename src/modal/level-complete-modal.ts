import { CampaignManager } from '@app/campaigns/campaign-manager';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { Logger } from '@app/logging/logger';
import { OpsLogModal } from '@app/ops-log/ops-log-modal';
import { selectionText } from '@app/pages/selection-browser';
import niceTasks from '@app/presentation/nice-task-descriptions.json';
import { Router } from '@app/router';
import { WorkingDocumentManager } from '@app/scenarios/working-document-manager';
import { type ScoreBreakdown, ScoreCalculator } from '@app/scoring/score-calculator';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { SoundEvents } from '@app/sound/sound-events';
import { clearPersistedStore } from '@app/sync/storage';
import { Auth } from '@app/user-account/auth';
import { ModalLogin } from '@app/user-account/modal-login';
import { getUserDataService } from '@app/user-account/user-data-service';
import type { DecisionRecord } from './decision-manager';
import { DialogManager } from './dialog-manager';
import './level-complete-modal.css';
import { SceneModal } from '@app/presentation/scene-modal';
import { preloadArtwork } from '@app/presentation/transitions';
import type { FieldDiagnosis } from '@app/scoring/field-diagnosis';
import type { MissionDebrief } from '@app/scoring/mission-debrief';
import { achievementBadge } from '@app/user-account/profile-record';
import { getAssetUrl } from '@app/utils/asset-url';
import { PendingQuizIndicator } from './pending-quiz-indicator';
import { QuizModal } from './quiz-modal';

interface CompletionModalOptions {
  niceTaskCodes?: string[];
  debrief?: MissionDebrief;
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
  /** Frontline only: the field diagnosis section. Absent in every other campaign. */
  fieldDiagnosis?: FieldDiagnosis;
  /** Decisions made during the scenario, listed under the score breakdown */
  decisions?: DecisionRecord[];
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
      decisionPenalties: 0,
      totalScore: 0,
      objectiveBreakdown: [],
      timeRemainingSeconds: 0,
    },
    elapsedTimeSeconds: 0,
    campaignId: '',
    scenarioId: '',
  };

  private onContinueCallback_: (() => void | Promise<void>) | null = null;
  private actionPending_ = false;
  private resultSaved_ = false;
  private isReplayMode_: boolean = false;
  private authSubscription_: { data: { subscription: { unsubscribe: () => void } } } | null = null;

  private constructor() {
    if (LevelCompleteModal.instance_) {
      throw new Error('Use getInstance() instead of new.');
    }

    super(LevelCompleteModal.id, {
      title: 'Mission results',
      width: 'min(560px, calc(var(--mc-viewport-width, 100vw) - 32px))',
    });
  }

  static getInstance(): LevelCompleteModal {
    LevelCompleteModal.instance_ ??= new LevelCompleteModal();
    return LevelCompleteModal.instance_;
  }

  protected getModalContentHtml(): string {
    const { score, elapsedTimeSeconds } = this.options_;
    const elapsedFormatted = this.formatTime_(elapsedTimeSeconds);
    const mission = CampaignManager.getInstance()
      .getScenariosForCampaign(this.options_.campaignId)
      .find((scenario) => scenario.id === this.options_.scenarioId);

    return html`
      <div class="complete-modal">
        <div class="complete-modal__body">
        <div class="complete-modal__heading">
          <div class="complete-modal__icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="24" r="20" /><path d="m14 24 7 7 13-15" /></svg></div>
          <div><h1 class="complete-modal__title">Mission Complete!</h1>
            ${mission ? `<p class="complete-modal__mission">${selectionText(`${String(mission.number).padStart(2, '0')} · ${mission.title}`)}</p>` : ''}</div>
        </div>
        ${this.isCampaignFinale_() ? `<div class="complete-modal__finale">${this.renderFinaleText_()}</div>` : ''}

        <div class="complete-modal__score-section">
          <div class="complete-modal__total">
            <div>
            <span class="total-label">Total Score</span>
            <span class="total-value">${score.totalScore.toLocaleString()}</span>
            </div>
            <div class="complete-modal__time"><span class="total-label">${this.isReplayMode_ ? 'Record' : 'Mission time'}</span>
              <span>${this.isReplayMode_ ? 'Previously completed' : elapsedFormatted}</span></div>
          </div>

          <div class="complete-modal__breakdown">
            <div class="breakdown-row">
              <span class="breakdown-label">Objectives</span>
              <span class="breakdown-value positive">+${score.basePoints}</span>
            </div>
            <div class="breakdown-detail">${this.formatObjectivesDetail_(score.objectiveBreakdown)}</div>
            ${
              score.timeBonus > 0
                ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Time Bonus</span>
              <span class="breakdown-value positive">+${score.timeBonus}</span>
            </div>
            <div class="breakdown-detail">${this.formatTime_(score.timeRemainingSeconds)} to spare (1 point per ${ScoreCalculator.TIME_BONUS_DIVISOR} s)</div>
            `
                : ''
            }
            ${
              score.quizPenalties > 0
                ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Quiz Penalties</span>
              <span class="breakdown-value negative">-${score.quizPenalties}</span>
            </div>
            <div class="breakdown-detail">${score.quizPenalties} points deducted</div>
            `
                : ''
            }
            ${
              score.timePenalties > 0
                ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Time Penalties</span>
              <span class="breakdown-value negative">-${score.timePenalties}</span>
            </div>
            <div class="breakdown-detail">${score.timePenalties} points deducted</div>
            `
                : ''
            }
            ${
              score.hintPenalties > 0
                ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Hint Penalties</span>
              <span class="breakdown-value negative">-${score.hintPenalties}</span>
            </div>
            <div class="breakdown-detail">${score.hintPenalties} points deducted for hints used</div>
            `
                : ''
            }
            ${
              score.decisionPenalties > 0
                ? `
            <div class="breakdown-row">
              <span class="breakdown-label">Decision Penalties</span>
              <span class="breakdown-value negative">-${score.decisionPenalties}</span>
            </div>
            <div class="breakdown-detail">${score.decisionPenalties} points deducted for wrong or unevidenced calls</div>
            `
                : ''
            }
            ${this.renderDiagnosticRows_()}
          </div>
          ${this.renderDecisions_()}
        </div>

        ${this.renderFieldDiagnosis_()}
        ${this.renderDebrief_()}
        ${this.renderNiceTasks_()}
        ${this.renderSignUpSection_()}
        <p id="debrief-save-status" role="status"></p>
        </div>
        <div class="complete-modal__actions">
          ${this.options_.debrief?.nextMission && this.options_.isAuthenticated !== false ? '<button id="next-mission-btn" class="btn btn-primary">Next Mission</button>' : ''}
          <button id="play-again-btn" class="btn btn-secondary">Replay</button>
          <button id="continue-btn" class="btn ${this.options_.debrief?.epilogue ? 'btn-primary' : 'btn-secondary'}">${this.options_.debrief?.epilogue ? 'View Epilogue' : 'Mission Selection'}</button>
        </div>
      </div>
    `;
  }

  /** Score rows for the capped diagnosis effect. Empty unless a field diagnosis exists. */
  private renderDiagnosticRows_(): string {
    const { score, fieldDiagnosis } = this.options_;
    if (!fieldDiagnosis) return '';
    const bonus = score.diagnosticBonus ?? 0;
    const penalty = score.diagnosticPenalty ?? 0;
    const bonusRow =
      bonus > 0
        ? `<div class="breakdown-row"><span class="breakdown-label">Diagnosis Bonus</span><span class="breakdown-value positive">+${bonus}</span></div>
            <div class="breakdown-detail">Capped credit for tests that ruled a suspect out</div>`
        : '';
    const penaltyRow =
      penalty > 0
        ? `<div class="breakdown-row"><span class="breakdown-label">Diagnosis Penalty</span><span class="breakdown-value negative">-${penalty}</span></div>
            <div class="breakdown-detail">Capped deduction for fixes made without earlier evidence</div>`
        : '';

    return bonusRow + penaltyRow;
  }

  /** The "Field diagnosis" debrief section, rendered only when a field report exists */
  private renderFieldDiagnosis_(): string {
    const diagnosis = this.options_.fieldDiagnosis;
    if (!diagnosis) return '';
    const lines = diagnosis.lines.map((line) => `<li>${selectionText(line)}</li>`).join('');
    const notes = diagnosis.scoreNotes.map((note) => `<p class="debrief-note">${selectionText(note)}</p>`).join('');

    return `<section class="mission-debrief field-diagnosis" aria-label="Field diagnosis">
      <h2>Field diagnosis</h2><ul class="debrief-awards field-diagnosis__lines">${lines}</ul>${notes}</section>`;
  }

  private renderDebrief_(): string {
    const debrief = this.options_.debrief;
    if (!debrief) return '';
    const previous = debrief.previousScore;
    const delta = previous === undefined ? null : this.options_.score.totalScore - previous;
    const awards = debrief.achievements.map((award) => `<li><span class="debrief-badge">${achievementBadge(award)}</span><span>${selectionText(award.title)}</span></li>`).join('');
    return `<section class="mission-debrief" aria-label="Mission debrief">
      <div class="debrief-comparison"><div><span>Previous score</span><strong>${previous?.toLocaleString() ?? 'First recorded result'}</strong></div>
      <div><span title="Best of results recorded on this device and the available account result">Recorded best</span><strong>${debrief.bestScore.toLocaleString()}${debrief.personalBest && previous !== undefined ? ' · New best' : ''}</strong></div>
      ${delta === null ? '' : `<div><span>Change</span><strong>${delta > 0 ? '+' : ''}${delta.toLocaleString()}</strong></div>`}</div>
      ${awards ? `<h2>Awards this run</h2><ul class="debrief-awards">${awards}</ul><p class="debrief-note">Awards are added to your service record when this result is saved.</p>` : ''}
      ${debrief.nextMission ? `<p class="debrief-next">${debrief.newlyUnlocked ? 'Next unlock' : 'Next mission'}: <strong>${selectionText(debrief.nextMission.title)}</strong></p>` : ''}
    </section>`;
  }

  private renderNiceTasks_(): string {
    if (!this.options_.niceTaskCodes) return '';
    const codes = [...new Set(this.options_.niceTaskCodes)].filter((code) => /^T\d{4}$/u.test(code)).sort();
    const rows = codes
      .map(
        (code) => `<li><span>${selectionText((niceTasks.tasks as Record<string, string>)[code] ?? 'Task description unavailable')}</span><code>${selectionText(code)}</code></li>`
      )
      .join('');
    return `<section class="mission-nice-tasks" aria-label="NICE tasks practiced">
      <h2>NICE tasks practiced · ${codes.length}</h2>
      <p>Mapped to objectives you completed in this mission. This records practice within the NIST NICE workforce framework, not certification.</p>
      ${rows ? `<ul>${rows}</ul>` : '<p>No NICE task codes are mapped to the objectives completed in this mission.</p>'}
    </section>`;
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
          ${
            this.isCampaignFinale_()
              ? "You're not signed in, so this completion won't be saved. Create a free account to keep your progress."
              : "You're not signed in, so this completion won't be saved and the next scenario stays locked. Create a free account to keep your progress."
          }
        </div>
        <button id="signup-save-btn" class="btn btn-primary">Sign Up / Log In</button>
      </div>
    `;
  }

  /** The last non-sandbox scenario of its campaign: the modal says so instead of pointing at a next scenario */
  private isCampaignFinale_(): boolean {
    const { campaignId, scenarioId } = this.options_;
    if (!campaignId || !scenarioId) return false;
    const scenarios = CampaignManager.getInstance()
      .getScenariosForCampaign(campaignId)
      .filter((s) => s.missionType !== 'Sandbox');
    return scenarios.length > 0 && scenarios[scenarios.length - 1].id === scenarioId;
  }

  private renderFinaleText_(): string {
    const campaign = CampaignManager.getInstance().getCampaign(this.options_.campaignId);
    return `<strong>Campaign complete.</strong> You've finished every scenario in ${campaign?.title ?? 'this campaign'}.`;
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
    this.draggie?.disable();
    const dialog = this.boxEl?.querySelector(`#${LevelCompleteModal.id}`);
    dialog?.setAttribute('role', 'dialog');
    dialog?.setAttribute('aria-modal', 'true');
    dialog?.setAttribute('aria-label', 'Mission complete');

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
    this.boxEl?.querySelector('#next-mission-btn')?.addEventListener('click', () => this.runAction_('next'));

    const playAgainBtn = this.boxEl?.querySelector('#play-again-btn');
    playAgainBtn?.addEventListener('click', () => this.handlePlayAgain_());

    const signUpBtn = this.boxEl?.querySelector('#signup-save-btn');
    signUpBtn?.addEventListener('click', () => ModalLogin.getInstance().open());
  }

  private async handleContinue_(): Promise<void> {
    await this.runAction_('selection');
  }

  private async handlePlayAgain_(): Promise<void> {
    await this.runAction_('replay');
  }

  private async runAction_(action: 'selection' | 'next' | 'replay'): Promise<void> {
    if (this.actionPending_) return;
    this.actionPending_ = true;
    const buttons = this.boxEl?.querySelectorAll<HTMLButtonElement>('.complete-modal__actions button');
    buttons?.forEach((button) => {
      button.disabled = true;
    });
    const status = this.boxEl?.querySelector<HTMLElement>('#debrief-save-status');
    if (status) status.textContent = 'Saving result…';
    try {
      if (!this.resultSaved_ && this.onContinueCallback_) await this.onContinueCallback_();
      this.resultSaved_ = true;
      const { campaignId, scenarioId, debrief } = this.options_;
      if (action === 'replay') {
        await SimulationManager.getInstance().progressSaveManager?.waitForPendingSave();
        if (await Auth.getSession()) {
          const service = getUserDataService();
          await service.deleteCheckpoint(scenarioId);
          await service.resetScenarioForReplay(scenarioId);
        }
        await clearPersistedStore();
      }
      this.forceClose_();
      const path = `/campaigns/${campaignId}`;
      if (action === 'selection' && debrief?.epilogue) {
        const scene = new SceneModal(debrief.epilogue, () => {});
        const accepted = await scene.result;
        Router.getInstance().navigate(accepted ? '/' : path);
        return;
      }
      if (action === 'replay') Router.getInstance().navigate(`${path}/scenarios/${scenarioId}`, { forceReplay: true });
      else if (action === 'next' && debrief?.nextMission) Router.getInstance().navigate(`${path}/scenarios/${debrief.nextMission.id}`);
      else Router.getInstance().navigate(path);
    } catch (error) {
      Logger.error('Could not finish mission action:', error);
      if (status) status.textContent = 'Could not save or prepare the next mission. Your result is still here. Check your connection and choose an action to retry.';
    } finally {
      this.actionPending_ = false;
      buttons?.forEach((button) => {
        button.disabled = false;
      });
    }
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
  /** The judgements the player made, when the scenario had any decisions */
  private renderDecisions_(): string {
    const decisions = this.options_.decisions ?? [];
    if (decisions.length === 0) return '';

    const rows = decisions
      .map((d) => {
        let mark = '&#10007;';
        if (d.resolution.correct) mark = d.resolution.evidenced ? '&#10003;' : '&#10003;&#8202;?';
        const note = d.resolution.evidenced ? '' : ` <span class="decision-summary-note">(decided before checking: ${d.resolution.missingEvidence.join(', ')})</span>`;
        const tries = d.attempts > 1 ? ` <span class="decision-summary-note">(${d.attempts} attempts)</span>` : '';
        return `<li class="decision-summary-item"><span class="decision-summary-mark">${mark}</span>${d.prompt} &rarr; <em>${d.resolution.label}</em>${tries}${note}</li>`;
      })
      .join('');

    return `
      <div class="complete-modal__decisions">
        <div class="breakdown-label">Judgements</div>
        <ul class="decision-summary-list">${rows}</ul>
      </div>
    `;
  }

  showCompletion(options: CompletionModalOptions, onContinue?: () => void | Promise<void>, isReplay?: boolean): void {
    this.options_ = options;
    this.resultSaved_ = false;
    this.actionPending_ = false;
    if (options.debrief?.nextMission) preloadArtwork(getAssetUrl('/assets/campaigns/' + options.debrief.nextMission.imageUrl));
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
    SoundEvents.finish();

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
    // The working document box draws above modals (nats-s24-F9)
    WorkingDocumentManager.getInstance().close();
    // The last step is often a typed log entry; the log must not sit over the result
    OpsLogModal.closeIfOpen();
  }

  override close(): void {
    // Do nothing - modal cannot be closed by X button or background click
    // User must use Continue button
  }
}
