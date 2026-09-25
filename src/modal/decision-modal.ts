import { Rng } from '@app/simulation/rng';
/**
 * @file Decision Modal - presents a decision condition to the operator
 * @description Same shell as QuizModal (draggable, non-blocking until answered
 * correctly) with two differences: an evidence checklist that updates while
 * the box is open, and grading that comes back from DecisionManager rather
 * than a correctIndex - the right answer depends on the simulation, and the
 * chosen option may change the simulation.
 */

import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { getEl, showEl } from '@app/engine/utils/get-el';
import { EventBus } from '@app/events/event-bus';
import { DecisionAnsweredData, DecisionDismissedData, DecisionEvidenceStatus, DecisionGradedData, DecisionResolvedData, DecisionShowData, Events } from '@app/events/events';
import { Character, CharacterNames, Emotion, getCharacterAvatarUrl } from './character-enum';
import { DecisionManager } from './decision-manager';
import './decision-modal.css';
import './quiz-modal.css';

/** Seeded draws for this module (see simulation/rng.ts). */
const random = (): number => Rng.stream('ui:decision').next();

export class DecisionModal extends DraggableBox {
  private static instance_: DecisionModal | null = null;
  private static readonly EVIDENCE_POLL_MS = 500;

  private current_: DecisionShowData | null = null;
  private currentCharacter_: Character = Character.CHARLIE_BROOKS;
  private isShowingFeedback_ = false;
  private domCreated_ = false;
  private shuffledIndices_: number[] = [];
  private overlayEl_: HTMLDivElement | null = null;
  private evidencePoll_: number | null = null;
  private lastGraded_: DecisionGradedData | null = null;

  private readonly boundShowHandler_: (data: DecisionShowData) => void;
  private readonly boundGradedHandler_: (data: DecisionGradedData) => void;

  private constructor() {
    super('decision-modal', { width: '520px', title: 'Decision', skipDomCreation: true });

    this.boundShowHandler_ = this.handleShow_.bind(this);
    this.boundGradedHandler_ = this.handleGraded_.bind(this);
    const bus = EventBus.getInstance();
    bus.on(Events.DECISION_SHOW, this.boundShowHandler_);
    bus.on(Events.DECISION_GRADED, this.boundGradedHandler_);
  }

  static getInstance(): DecisionModal {
    DecisionModal.instance_ ??= new DecisionModal();
    return DecisionModal.instance_;
  }

  static destroy(): void {
    if (DecisionModal.instance_) {
      DecisionModal.instance_.dispose();
      DecisionModal.instance_.close();
      DecisionModal.instance_ = null;
    }
  }

  protected getBoxContentHtml(): string {
    return html`
      <div class="quiz-modal-content decision-modal-content">
        <div class="quiz-header"></div>
        <div id="decision-prompt" class="quiz-question"></div>
        <div id="decision-evidence" class="decision-evidence"></div>
        <div id="decision-options" class="quiz-options"></div>
        <div id="decision-feedback" class="quiz-feedback" style="display: none;"></div>
        <div id="decision-penalty-notice" class="quiz-penalty-notice" style="display: none;"></div>
      </div>
    `;
  }

  override open(cb?: () => void): void {
    if (!this.boxEl) return;
    showEl(this.boxEl);
    if (this.width) this.boxEl.style.minWidth = this.width;
    this.boxEl.style.top = `${window.scrollY + (window.innerHeight - this.boxEl.offsetHeight) / 2}px`;
    this.boxEl.style.left = `${(window.innerWidth - this.boxEl.offsetWidth) / 2}px`;
    this.boxEl.style.zIndex = DraggableBox.increaseMaxZIndex().toString();
    cb?.();
  }

  override close(): void {
    this.stopEvidencePoll_();
    if (this.current_ && !this.isShowingFeedback_) {
      const dismissed: DecisionDismissedData = { objectiveId: this.current_.objectiveId, conditionIndex: this.current_.conditionIndex };
      EventBus.getInstance().emit(Events.DECISION_DISMISSED, dismissed);
    }
    this.hideOverlay_();
    // Drop the rendered options so no hidden .quiz-option-btn lingers for the
    // shared e2e locators once the box is closed.
    const optionsEl = getEl('decision-options');
    if (optionsEl) optionsEl.innerHTML = '';
    super.close();
  }

  dispose(): void {
    this.stopEvidencePoll_();
    const bus = EventBus.getInstance();
    bus.off(Events.DECISION_SHOW, this.boundShowHandler_);
    bus.off(Events.DECISION_GRADED, this.boundGradedHandler_);
  }

  private createDom_(): void {
    if (this.domCreated_) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      html`
        <div id="${this.boxId}" class="draggable-box decision-box" style="pointer-events:auto; display:none;">
          <div class="draggable-box__title-bar">
            <div class="draggable-box__title"><span>${this.title}</span></div>
            <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
          </div>
          <div class="draggable-box__content">${this.getBoxContentHtml()}</div>
        </div>
      `
    );
    this.domCreated_ = true;
    this.onOpen();
  }

  private handleShow_(data: DecisionShowData): void {
    this.current_ = data;
    this.currentCharacter_ = data.character ?? Character.CHARLIE_BROOKS;
    this.isShowingFeedback_ = false;
    this.lastGraded_ = null;
    if (!this.domCreated_) this.createDom_();
    this.open(() => {
      this.render_();
      this.startEvidencePoll_();
    });
  }

  private render_(): void {
    if (!this.current_) return;
    const promptEl = getEl('decision-prompt');
    const optionsEl = getEl('decision-options');
    const feedbackEl = getEl('decision-feedback');
    const penaltyEl = getEl('decision-penalty-notice');
    const headerEl = this.boxEl?.querySelector('.quiz-header') as HTMLElement | null;
    if (!promptEl || !optionsEl || !feedbackEl || !penaltyEl || !headerEl) return;

    const closeBtn = getEl(`${this.boxId}-close`);
    if (closeBtn) closeBtn.style.display = '';

    headerEl.innerHTML =
      this.currentCharacter_ === Character.SYSTEM
        ? html`
            <div class="quiz-self-check-icon">!</div>
            <div class="quiz-header-text">
              <span class="quiz-character-name">Decision</span>
              <span class="quiz-prompt-label">Make the call</span>
            </div>
          `
        : html`
            <img id="decision-avatar" class="quiz-avatar" src="${getCharacterAvatarUrl(this.currentCharacter_, Emotion.CONFIDENT)}" alt="${CharacterNames[this.currentCharacter_]}">
            <div class="quiz-header-text">
              <span class="quiz-character-name">${CharacterNames[this.currentCharacter_]}</span>
              <span class="quiz-prompt-label">needs a call:</span>
            </div>
          `;

    promptEl.textContent = this.current_.prompt;
    feedbackEl.style.display = 'none';
    penaltyEl.style.display = 'none';
    this.renderEvidence_(this.current_.evidence);

    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    this.shuffledIndices_ = this.shuffleIndices_();
    const options = this.current_.options;
    optionsEl.innerHTML = this.shuffledIndices_
      .map(
        (originalIndex, displayIndex) => html`
          <button id="decision-option-${displayIndex}" class="quiz-option-btn" data-index="${originalIndex}">
            <span class="quiz-option-label">${labels[displayIndex]}</span>
            <span class="quiz-option-text">${options[originalIndex]}</span>
          </button>
        `
      )
      .join('');

    this.shuffledIndices_.forEach((_, displayIndex) => {
      const btn = getEl(`decision-option-${displayIndex}`);
      if (!btn) return;
      const originalIndex = Number.parseInt(btn.dataset.index ?? '0', 10);
      btn.addEventListener('click', () => this.handleOptionClick_(originalIndex));
    });
  }

  private renderEvidence_(evidence: DecisionEvidenceStatus[]): void {
    const el = getEl('decision-evidence');
    if (!el) return;
    if (evidence.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const missing = evidence.filter((e) => !e.ready).length;
    el.innerHTML = html`
      <div class="decision-evidence-title">${missing === 0 ? 'Evidence in hand' : 'Look before you decide'}</div>
      <ul class="decision-evidence-list">
        ${evidence.map((e) => html`<li class="decision-evidence-item ${e.ready ? 'ready' : 'missing'}" data-evidence-id="${e.id}"><span class="decision-evidence-mark">${e.ready ? '&#10003;' : '&#9675;'}</span>${e.label}</li>`).join('')}
      </ul>
      ${missing > 0 ? html`<div class="decision-evidence-warning">Deciding without looking scores partial credit.</div>` : ''}
    `;
  }

  private startEvidencePoll_(): void {
    this.stopEvidencePoll_();
    this.evidencePoll_ = window.setInterval(() => {
      if (!this.current_ || this.isShowingFeedback_) return;
      this.renderEvidence_(DecisionManager.getInstance().getEvidenceStatus(this.current_.objectiveId, this.current_.conditionIndex));
    }, DecisionModal.EVIDENCE_POLL_MS);
  }

  private stopEvidencePoll_(): void {
    if (this.evidencePoll_ !== null) {
      window.clearInterval(this.evidencePoll_);
      this.evidencePoll_ = null;
    }
  }

  private handleOptionClick_(originalIndex: number): void {
    if (!this.current_ || this.isShowingFeedback_) return;
    const answered: DecisionAnsweredData = { objectiveId: this.current_.objectiveId, conditionIndex: this.current_.conditionIndex, optionIndex: originalIndex };
    EventBus.getInstance().emit(Events.DECISION_ANSWERED, answered);
  }

  private handleGraded_(data: DecisionGradedData): void {
    if (!this.current_ || data.objectiveId !== this.current_.objectiveId || data.conditionIndex !== this.current_.conditionIndex) return;
    this.lastGraded_ = data;
    const displayIndex = this.shuffledIndices_.indexOf(data.optionIndex);
    const btn = getEl(`decision-option-${displayIndex}`);

    if (data.correct) {
      btn?.classList.add('correct');
      this.showCorrectFeedback_(data);
    } else {
      btn?.classList.add('incorrect', 'disabled');
      btn?.setAttribute('disabled', 'true');
      this.showIncorrectFeedback_(data);
    }
  }

  private showCorrectFeedback_(data: DecisionGradedData): void {
    this.isShowingFeedback_ = true;
    this.stopEvidencePoll_();
    const closeBtn = getEl(`${this.boxId}-close`);
    if (closeBtn) closeBtn.style.display = 'none';
    this.showOverlay_();
    this.setAvatar_(Emotion.HAPPY);

    const feedbackEl = getEl('decision-feedback');
    if (feedbackEl) {
      feedbackEl.innerHTML = html`
        <div class="feedback-correct">
          <span class="feedback-icon">&#10003;</span>
          <span class="feedback-text">${data.evidenced ? 'Right call.' : 'Right call - but you had not looked at everything.'}</span>
        </div>
        ${data.evidenced ? '' : html`<p class="decision-unevidenced">Not checked: ${data.missingEvidence.join(', ')}. Partial credit.</p>`}
        ${data.feedback ? html`<p class="feedback-explanation">${data.feedback}</p>` : ''}
        <button id="decision-continue-btn" class="quiz-continue-btn">Continue</button>
      `;
      feedbackEl.style.display = 'block';
      getEl('decision-continue-btn')?.addEventListener('click', () => this.handleContinueClick_());
    }
    this.renderPenalty_(data.pointsDeducted);
    this.disableOptions_();
  }

  private showIncorrectFeedback_(data: DecisionGradedData): void {
    this.setAvatar_(Emotion.CONCERNED);
    const feedbackEl = getEl('decision-feedback');
    if (feedbackEl) {
      feedbackEl.innerHTML = html`
        <div class="feedback-incorrect">
          <span class="feedback-icon">&#10007;</span>
          <span class="feedback-text">That is not what the evidence says.</span>
        </div>
        ${data.feedback ? html`<p class="feedback-explanation">${data.feedback}</p>` : ''}
      `;
      feedbackEl.style.display = 'block';
    }
    this.renderPenalty_(data.pointsDeducted);
    window.setTimeout(() => {
      if (!this.isShowingFeedback_) this.setAvatar_(Emotion.CONFIDENT);
    }, 1500);
  }

  private renderPenalty_(total: number): void {
    const penaltyEl = getEl('decision-penalty-notice');
    if (!penaltyEl) return;
    if (total <= 0) {
      penaltyEl.style.display = 'none';
      return;
    }
    penaltyEl.innerHTML = html`<span class="penalty-total">-${total} points so far</span>`;
    penaltyEl.style.display = 'block';
  }

  private handleContinueClick_(): void {
    if (!this.current_ || !this.lastGraded_) {
      this.close();
      return;
    }
    const resolved: DecisionResolvedData = {
      objectiveId: this.current_.objectiveId,
      conditionIndex: this.current_.conditionIndex,
      totalAttempts: this.lastGraded_.attempts,
      totalPointsDeducted: this.lastGraded_.pointsDeducted,
    };
    EventBus.getInstance().emit(Events.DECISION_RESOLVED, resolved);
    this.current_ = null;
    this.close();
  }

  private setAvatar_(emotion: Emotion): void {
    if (this.currentCharacter_ === Character.SYSTEM) return;
    const avatar = getEl('decision-avatar') as HTMLImageElement | null;
    if (avatar) avatar.src = getCharacterAvatarUrl(this.currentCharacter_, emotion);
  }

  private disableOptions_(): void {
    this.shuffledIndices_.forEach((_, displayIndex) => {
      const btn = getEl(`decision-option-${displayIndex}`);
      btn?.setAttribute('disabled', 'true');
    });
  }

  private shuffleIndices_(): number[] {
    if (!this.current_) return [];
    const indices = Array.from({ length: this.current_.options.length }, (_, i) => i);
    if (this.current_.preserveOptionOrder || indices.length <= 1) return indices;
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  private showOverlay_(): void {
    if (this.overlayEl_) return;
    this.overlayEl_ = document.createElement('div');
    this.overlayEl_.className = 'quiz-modal-overlay';
    document.body.appendChild(this.overlayEl_);
  }

  private hideOverlay_(): void {
    this.overlayEl_?.remove();
    this.overlayEl_ = null;
  }
}
