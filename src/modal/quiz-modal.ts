/**
 * @file Quiz Modal - Interactive quiz for status-check objective conditions
 * @description Non-modal draggable box that presents multiple choice questions to verify player understanding
 */

import { EventBus } from '@app/events/event-bus';
import { Events, QuizAnsweredData, QuizDismissedData, QuizShowData } from '@app/events/events';
import { DraggableBox } from '@engine/ui/draggable-box';
import { getEl, showEl } from '@engine/utils/get-el';
import { html } from '@engine/utils/development/formatter';
import { Character, CharacterAvatars, CharacterNames, Emotion, getCharacterAvatarUrl } from './character-enum';
import './quiz-modal.css';

/**
 * Singleton non-modal box for presenting status-check quizzes
 * Unlike a modal, this allows interaction with background elements
 */
export class QuizModal extends DraggableBox {
  private static instance_: QuizModal | null = null;

  private currentQuiz_: QuizShowData | null = null;
  private attempts_: number = 0;
  private totalPointsDeducted_: number = 0;
  private isShowingFeedback_: boolean = false;
  private domCreated_: boolean = false;

  private readonly boundShowQuizHandler_: (data: QuizShowData) => void;

  private constructor() {
    super('quiz-modal', { width: '500px', title: 'Knowledge Check', skipDomCreation: true });

    this.boundShowQuizHandler_ = this.handleShowQuiz_.bind(this);
    EventBus.getInstance().on(Events.QUIZ_SHOW, this.boundShowQuizHandler_);
  }

  static getInstance(): QuizModal {
    QuizModal.instance_ ??= new QuizModal();
    return QuizModal.instance_;
  }

  protected getBoxContentHtml(): string {
    return html`
      <div class="quiz-modal-content">
        <div class="quiz-header">
          <img id="quiz-avatar" class="quiz-avatar" src="${CharacterAvatars[Character.CHARLIE_BROOKS]}" alt="Charlie Brooks">
          <div class="quiz-header-text">
            <span class="quiz-character-name">${CharacterNames[Character.CHARLIE_BROOKS]}</span>
            <span class="quiz-prompt-label">asks:</span>
          </div>
        </div>
        <div id="quiz-question" class="quiz-question">
          <!-- Question text inserted here -->
        </div>
        <div id="quiz-options" class="quiz-options">
          <!-- Options inserted here -->
        </div>
        <div id="quiz-feedback" class="quiz-feedback" style="display: none;">
          <!-- Feedback shown after answer -->
        </div>
        <div id="quiz-penalty-notice" class="quiz-penalty-notice" style="display: none;">
          <!-- Penalty notice shown on wrong answers -->
        </div>
      </div>
    `;
  }

  private createDom_(): void {
    if (this.domCreated_) return;

    const parentDom = document.getElementsByTagName('body')[0];

    parentDom.insertAdjacentHTML('beforeend', html`
      <div id="${this.boxId}" class="draggable-box quiz-box" style="pointer-events:auto; display:none;">
        <div class="draggable-box__title-bar">
          <div class="draggable-box__title">
            <span>${this.title}</span>
          </div>
          <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
        </div>
        <div class="draggable-box__content">
          ${this.getBoxContentHtml()}
        </div>
      </div>
    `);

    this.domCreated_ = true;
    this.onOpen();
  }

  private handleShowQuiz_(data: QuizShowData): void {
    this.currentQuiz_ = data;
    this.attempts_ = 0;
    this.totalPointsDeducted_ = 0;
    this.isShowingFeedback_ = false;

    // Create DOM lazily on first show
    if (!this.domCreated_) {
      this.createDom_();
    }

    this.open(() => {
      this.renderQuiz_();
    });
  }

  override open(cb?: () => void): void {
    if (!this.boxEl) {
      console.error('QuizModal: Cannot open, DOM not created');
      return;
    }

    showEl(this.boxEl);

    if (this.width) {
      this.boxEl.style.minWidth = this.width;
    }

    // Center the box
    this.boxEl.style.top = `${(window.scrollY + (window.innerHeight - this.boxEl.offsetHeight) / 2)}px`;
    this.boxEl.style.left = `${(window.innerWidth - this.boxEl.offsetWidth) / 2}px`;

    // Bring to front
    this.boxEl.style.zIndex = DraggableBox.increaseMaxZIndex().toString();

    if (cb) {
      cb();
    }
  }

  private renderQuiz_(): void {
    if (!this.currentQuiz_) return;

    const questionEl = getEl('quiz-question');
    const optionsEl = getEl('quiz-options');
    const feedbackEl = getEl('quiz-feedback');
    const penaltyEl = getEl('quiz-penalty-notice');

    if (!questionEl || !optionsEl || !feedbackEl || !penaltyEl) return;

    // Update avatar to show confident emotion
    const avatarEl = getEl('quiz-avatar') as HTMLImageElement;
    if (avatarEl) {
      avatarEl.src = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.CONFIDENT);
    }

    // Set question text
    questionEl.textContent = this.currentQuiz_.question;

    // Hide feedback and penalty notices
    feedbackEl.style.display = 'none';
    penaltyEl.style.display = 'none';

    // Create option buttons
    const optionLabels = ['A', 'B', 'C', 'D'];
    optionsEl.innerHTML = this.currentQuiz_.options
      .map((option, index) => html`
        <button
          id="quiz-option-${index}"
          class="quiz-option-btn"
          data-index="${index}"
        >
          <span class="quiz-option-label">${optionLabels[index]}</span>
          <span class="quiz-option-text">${option}</span>
        </button>
      `)
      .join('');

    // Add click handlers
    this.currentQuiz_.options.forEach((_, index) => {
      const btn = getEl(`quiz-option-${index}`);
      if (btn) {
        btn.addEventListener('click', () => this.handleOptionClick_(index));
      }
    });
  }

  private handleOptionClick_(index: number): void {
    if (!this.currentQuiz_ || this.isShowingFeedback_) return;

    this.attempts_++;

    const isCorrect = index === this.currentQuiz_.correctIndex;

    // Update button states
    this.updateButtonStates_(index, isCorrect);

    if (isCorrect) {
      // Emit correct answer immediately to stop the timer
      // The Continue button just closes the modal after reading the explanation
      const answeredData: QuizAnsweredData = {
        objectiveId: this.currentQuiz_.objectiveId,
        conditionIndex: this.currentQuiz_.conditionIndex,
        isCorrect: true,
        selectedIndex: index,
        attempts: this.attempts_,
        pointsDeducted: this.totalPointsDeducted_,
      };
      EventBus.getInstance().emit(Events.QUIZ_ANSWERED, answeredData);
      this.showCorrectFeedback_();
    } else {
      this.showIncorrectFeedback_(index);

      // Only emit for incorrect answers immediately (for point tracking)
      const answeredData: QuizAnsweredData = {
        objectiveId: this.currentQuiz_.objectiveId,
        conditionIndex: this.currentQuiz_.conditionIndex,
        isCorrect: false,
        selectedIndex: index,
        attempts: this.attempts_,
        pointsDeducted: this.totalPointsDeducted_,
      };
      EventBus.getInstance().emit(Events.QUIZ_ANSWERED, answeredData);
    }
  }

  private updateButtonStates_(selectedIndex: number, isCorrect: boolean): void {
    if (!this.currentQuiz_) return;

    this.currentQuiz_.options.forEach((_, index) => {
      const btn = getEl(`quiz-option-${index}`);
      if (!btn) return;

      btn.classList.remove('selected', 'correct', 'incorrect');

      if (index === selectedIndex) {
        btn.classList.add('selected', isCorrect ? 'correct' : 'incorrect');
      }

      if (isCorrect && index === this.currentQuiz_.correctIndex) {
        btn.classList.add('correct');
      }
    });
  }

  private showCorrectFeedback_(): void {
    if (!this.currentQuiz_) return;

    this.isShowingFeedback_ = true;

    const feedbackEl = getEl('quiz-feedback');
    const avatarEl = getEl('quiz-avatar') as HTMLImageElement;

    if (avatarEl) {
      avatarEl.src = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.HAPPY);
    }

    if (feedbackEl) {
      feedbackEl.innerHTML = html`
        <div class="feedback-correct">
          <span class="feedback-icon">&#10003;</span>
          <span class="feedback-text">Correct!</span>
        </div>
        ${this.currentQuiz_.explanation ? html`
          <p class="feedback-explanation">${this.currentQuiz_.explanation}</p>
        ` : ''}
        <button id="quiz-continue-btn" class="quiz-continue-btn">Continue</button>
      `;
      feedbackEl.style.display = 'block';

      const continueBtn = getEl('quiz-continue-btn');
      if (continueBtn) {
        continueBtn.addEventListener('click', () => this.handleContinueClick_());
      }
    }

    // Disable all option buttons
    this.disableOptions_();
  }

  /**
   * Handle Continue button click - just close the modal
   * The correct answer was already emitted immediately when answered
   */
  private handleContinueClick_(): void {
    this.close();
  }

  private showIncorrectFeedback_(selectedIndex: number): void {
    if (!this.currentQuiz_) return;

    // Apply point penalty
    this.totalPointsDeducted_ += this.currentQuiz_.pointPenalty;

    const feedbackEl = getEl('quiz-feedback');
    const penaltyEl = getEl('quiz-penalty-notice');
    const avatarEl = getEl('quiz-avatar') as HTMLImageElement;

    if (avatarEl) {
      avatarEl.src = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.CONCERNED);
    }

    if (feedbackEl) {
      feedbackEl.innerHTML = html`
        <div class="feedback-incorrect">
          <span class="feedback-icon">&#10007;</span>
          <span class="feedback-text">Not quite. Try again.</span>
        </div>
      `;
      feedbackEl.style.display = 'block';
    }

    if (penaltyEl) {
      penaltyEl.innerHTML = html`
        <span class="penalty-text">-${this.currentQuiz_.pointPenalty} points</span>
        <span class="penalty-total">(Total: -${this.totalPointsDeducted_} points)</span>
      `;
      penaltyEl.style.display = 'block';
    }

    // Disable the wrong answer button but keep others enabled
    const wrongBtn = getEl(`quiz-option-${selectedIndex}`);
    if (wrongBtn) {
      wrongBtn.setAttribute('disabled', 'true');
      wrongBtn.classList.add('disabled');
    }

    // Reset avatar after a short delay
    setTimeout(() => {
      if (avatarEl && !this.isShowingFeedback_) {
        avatarEl.src = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.CONFIDENT);
      }
    }, 1500);
  }

  private disableOptions_(): void {
    if (!this.currentQuiz_) return;

    this.currentQuiz_.options.forEach((_, index) => {
      const btn = getEl(`quiz-option-${index}`);
      if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.classList.add('disabled');
      }
    });
  }

  override close(cb?: () => void): void {
    // If closing without completing (not showing success feedback), emit QUIZ_DISMISSED
    if (this.currentQuiz_ && !this.isShowingFeedback_) {
      const dismissedData: QuizDismissedData = {
        objectiveId: this.currentQuiz_.objectiveId,
        conditionIndex: this.currentQuiz_.conditionIndex,
      };
      EventBus.getInstance().emit(Events.QUIZ_DISMISSED, dismissedData);
    }

    this.currentQuiz_ = null;
    this.isShowingFeedback_ = false;
    super.close(cb);
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    EventBus.getInstance().off(Events.QUIZ_SHOW, this.boundShowQuizHandler_);
  }
}
