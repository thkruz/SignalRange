import { EventBus } from '../../src/events/event-bus';
import { Events, QuizShowData } from '../../src/events/events';
import { QuizModal } from '../../src/modal/quiz-modal';

// Mock DraggableBox
jest.mock('../../src/engine/ui/draggable-box', () => ({
  DraggableBox: class MockDraggableBox {
    protected boxId: string;
    protected width: string;
    protected title: string;
    protected boxEl: HTMLElement | null = null;

    private static maxZIndex_ = 100;

    constructor(id: string, options: { width: string; title: string; skipDomCreation?: boolean }) {
      this.boxId = id;
      this.width = options.width;
      this.title = options.title;
    }

    static increaseMaxZIndex(): number {
      return ++MockDraggableBox.maxZIndex_;
    }

    static getMaxZIndex(): number {
      return MockDraggableBox.maxZIndex_;
    }

    protected onOpen(): void {
      // Override in subclass
    }

    open(cb?: () => void): void {
      if (cb) cb();
    }

    close(cb?: () => void): void {
      if (this.boxEl) {
        this.boxEl.style.display = 'none';
      }
      if (cb) cb();
    }
  },
}));

// Mock html utility
jest.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => result + str + (values[i] ?? ''), '');
  },
}));

// Mock getEl and showEl
const mockElements: Map<string, HTMLElement> = new Map();

jest.mock('../../src/engine/utils/get-el', () => ({
  getEl: (id: string) => mockElements.get(id) || global.document.getElementById(id),
  showEl: (el: HTMLElement) => {
    if (el) el.style.display = 'block';
  },
}));

// Mock character-enum
jest.mock('../../src/modal/character-enum', () => ({
  Character: {
    CHARLIE_BROOKS: 'charlie_brooks',
  },
  CharacterAvatars: {
    charlie_brooks: '/avatars/charlie_brooks.png',
  },
  CharacterNames: {
    charlie_brooks: 'Charlie Brooks',
  },
  Emotion: {
    CONFIDENT: 'confident',
    HAPPY: 'happy',
    CONCERNED: 'concerned',
  },
  getCharacterAvatarUrl: (character: string, emotion: string) =>
    `/avatars/${character}_${emotion}.png`,
}));

// Mock CSS import
jest.mock('../../src/modal/quiz-modal.css', () => ({}));

describe('QuizModal', () => {
  let modal: QuizModal;
  let eventBus: EventBus;

  const createMockQuizData = (overrides?: Partial<QuizShowData>): QuizShowData => ({
    objectiveId: 'obj-1',
    conditionIndex: 0,
    question: 'What is the answer?',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctIndex: 1,
    pointPenalty: 10,
    explanation: 'The correct answer is B.',
    ...overrides,
  });

  beforeEach(() => {
    // Reset singletons
    (QuizModal as any).instance_ = null;
    EventBus.destroy();

    // Reset DOM
    document.body.innerHTML = '';
    mockElements.clear();

    eventBus = EventBus.getInstance();
    modal = QuizModal.getInstance();

    jest.useFakeTimers();
  });

  afterEach(() => {
    QuizModal.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
    mockElements.clear();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = QuizModal.getInstance();
      const instance2 = QuizModal.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Constructor', () => {
    it('should register QUIZ_SHOW event listener', () => {
      const onSpy = jest.spyOn(eventBus, 'on');

      // Reset and recreate to capture the spy
      (QuizModal as any).instance_ = null;
      QuizModal.getInstance();

      expect(onSpy).toHaveBeenCalledWith(Events.QUIZ_SHOW, expect.any(Function));
    });

    it('should set correct boxId', () => {
      expect((modal as any).boxId).toBe('quiz-modal');
    });

    it('should set correct title', () => {
      expect((modal as any).title).toBe('Knowledge Check');
    });
  });

  describe('handleShowQuiz_', () => {
    it('should create DOM on first quiz show', () => {
      expect((modal as any).domCreated_).toBe(false);

      const quizData = createMockQuizData();
      eventBus.emit(Events.QUIZ_SHOW, quizData);

      expect((modal as any).domCreated_).toBe(true);
    });

    it('should store current quiz data', () => {
      const quizData = createMockQuizData();
      eventBus.emit(Events.QUIZ_SHOW, quizData);

      expect((modal as any).currentQuiz_).toEqual(quizData);
    });

    it('should reset attempts counter', () => {
      (modal as any).attempts_ = 5;

      const quizData = createMockQuizData();
      eventBus.emit(Events.QUIZ_SHOW, quizData);

      expect((modal as any).attempts_).toBe(0);
    });

    it('should reset total points deducted', () => {
      (modal as any).totalPointsDeducted_ = 30;

      const quizData = createMockQuizData();
      eventBus.emit(Events.QUIZ_SHOW, quizData);

      expect((modal as any).totalPointsDeducted_).toBe(0);
    });

    it('should reset feedback flag', () => {
      (modal as any).isShowingFeedback_ = true;

      const quizData = createMockQuizData();
      eventBus.emit(Events.QUIZ_SHOW, quizData);

      expect((modal as any).isShowingFeedback_).toBe(false);
    });
  });

  describe('getBoxContentHtml', () => {
    it('should return HTML with quiz structure', () => {
      const html = (modal as any).getBoxContentHtml();

      expect(html).toContain('quiz-modal-content');
      expect(html).toContain('quiz-header');
      expect(html).toContain('quiz-question');
      expect(html).toContain('quiz-options');
      expect(html).toContain('quiz-feedback');
      expect(html).toContain('quiz-penalty-notice');
    });

    it('should include character avatar', () => {
      const html = (modal as any).getBoxContentHtml();

      expect(html).toContain('quiz-avatar');
      expect(html).toContain('Charlie Brooks');
    });
  });

  describe('renderQuiz_', () => {
    beforeEach(() => {
      // Create DOM elements that renderQuiz_ expects
      const questionEl = document.createElement('div');
      questionEl.id = 'quiz-question';
      document.body.appendChild(questionEl);
      mockElements.set('quiz-question', questionEl);

      const optionsEl = document.createElement('div');
      optionsEl.id = 'quiz-options';
      document.body.appendChild(optionsEl);
      mockElements.set('quiz-options', optionsEl);

      const feedbackEl = document.createElement('div');
      feedbackEl.id = 'quiz-feedback';
      document.body.appendChild(feedbackEl);
      mockElements.set('quiz-feedback', feedbackEl);

      const penaltyEl = document.createElement('div');
      penaltyEl.id = 'quiz-penalty-notice';
      document.body.appendChild(penaltyEl);
      mockElements.set('quiz-penalty-notice', penaltyEl);

      const avatarEl = document.createElement('img');
      avatarEl.id = 'quiz-avatar';
      document.body.appendChild(avatarEl);
      mockElements.set('quiz-avatar', avatarEl);
    });

    it('should set question text', () => {
      const quizData = createMockQuizData({ question: 'Test question?' });
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const questionEl = mockElements.get('quiz-question');
      expect(questionEl?.textContent).toBe('Test question?');
    });

    it('should create option buttons', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const optionsEl = mockElements.get('quiz-options');
      expect(optionsEl?.innerHTML).toContain('quiz-option-btn');
    });

    it('should hide feedback element initially', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const feedbackEl = mockElements.get('quiz-feedback');
      expect(feedbackEl?.style.display).toBe('none');
    });

    it('should hide penalty element initially', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const penaltyEl = mockElements.get('quiz-penalty-notice');
      expect(penaltyEl?.style.display).toBe('none');
    });

    it('should render single option quiz without letter labels', () => {
      const quizData = createMockQuizData({
        options: ['Acknowledge'],
        correctIndex: 0,
      });
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const optionsEl = mockElements.get('quiz-options');
      expect(optionsEl?.innerHTML).toContain('quiz-option-single');
      expect(optionsEl?.innerHTML).not.toContain('quiz-option-label');
    });

    it('should update avatar to confident emotion', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;

      (modal as any).renderQuiz_();

      const avatarEl = mockElements.get('quiz-avatar') as HTMLImageElement;
      expect(avatarEl?.src).toContain('confident');
    });
  });

  describe('handleOptionClick_', () => {
    beforeEach(() => {
      // Set up required DOM elements
      const feedbackEl = document.createElement('div');
      feedbackEl.id = 'quiz-feedback';
      document.body.appendChild(feedbackEl);
      mockElements.set('quiz-feedback', feedbackEl);

      const penaltyEl = document.createElement('div');
      penaltyEl.id = 'quiz-penalty-notice';
      document.body.appendChild(penaltyEl);
      mockElements.set('quiz-penalty-notice', penaltyEl);

      const avatarEl = document.createElement('img');
      avatarEl.id = 'quiz-avatar';
      document.body.appendChild(avatarEl);
      mockElements.set('quiz-avatar', avatarEl);

      // Create mock box element
      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;
    });

    it('should increment attempts counter', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];
      (modal as any).attempts_ = 0;

      (modal as any).handleOptionClick_(0);

      expect((modal as any).attempts_).toBe(1);
    });

    it('should emit QUIZ_PASSED when correct answer selected', () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const quizData = createMockQuizData({ correctIndex: 1 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      // Add close button for showCorrectFeedback_
      const closeBtn = document.createElement('span');
      closeBtn.id = 'quiz-modal-close';
      document.body.appendChild(closeBtn);

      (modal as any).handleOptionClick_(1);

      expect(emitSpy).toHaveBeenCalledWith(Events.QUIZ_PASSED, expect.objectContaining({
        objectiveId: 'obj-1',
        conditionIndex: 0,
      }));
    });

    it('should emit QUIZ_ANSWERED when incorrect answer selected', () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const quizData = createMockQuizData({ correctIndex: 1, pointPenalty: 15 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).handleOptionClick_(0); // Wrong answer

      expect(emitSpy).toHaveBeenCalledWith(Events.QUIZ_ANSWERED, expect.objectContaining({
        objectiveId: 'obj-1',
        isCorrect: false,
        selectedIndex: 0,
      }));
    });

    it('should not process click when showing feedback', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).isShowingFeedback_ = true;
      (modal as any).attempts_ = 0;

      (modal as any).handleOptionClick_(0);

      expect((modal as any).attempts_).toBe(0);
    });

    it('should not process click when no quiz is active', () => {
      (modal as any).currentQuiz_ = null;
      (modal as any).attempts_ = 0;

      (modal as any).handleOptionClick_(0);

      expect((modal as any).attempts_).toBe(0);
    });
  });

  describe('showIncorrectFeedback_', () => {
    beforeEach(() => {
      const feedbackEl = document.createElement('div');
      feedbackEl.id = 'quiz-feedback';
      document.body.appendChild(feedbackEl);
      mockElements.set('quiz-feedback', feedbackEl);

      const penaltyEl = document.createElement('div');
      penaltyEl.id = 'quiz-penalty-notice';
      document.body.appendChild(penaltyEl);
      mockElements.set('quiz-penalty-notice', penaltyEl);

      const avatarEl = document.createElement('img');
      avatarEl.id = 'quiz-avatar';
      document.body.appendChild(avatarEl);
      mockElements.set('quiz-avatar', avatarEl);

      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;
    });

    it('should accumulate point penalties', () => {
      const quizData = createMockQuizData({ pointPenalty: 10 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).totalPointsDeducted_ = 0;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showIncorrectFeedback_(0);

      expect((modal as any).totalPointsDeducted_).toBe(10);

      (modal as any).showIncorrectFeedback_(2);

      expect((modal as any).totalPointsDeducted_).toBe(20);
    });

    it('should show feedback element', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showIncorrectFeedback_(0);

      const feedbackEl = mockElements.get('quiz-feedback');
      expect(feedbackEl?.style.display).toBe('block');
    });

    it('should show penalty notice', () => {
      const quizData = createMockQuizData({ pointPenalty: 10 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).totalPointsDeducted_ = 0;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showIncorrectFeedback_(0);

      const penaltyEl = mockElements.get('quiz-penalty-notice');
      expect(penaltyEl?.style.display).toBe('block');
      expect(penaltyEl?.innerHTML).toContain('-10 points');
    });

    it('should update avatar to concerned emotion', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showIncorrectFeedback_(0);

      const avatarEl = mockElements.get('quiz-avatar') as HTMLImageElement;
      expect(avatarEl?.src).toContain('concerned');
    });

    it('should disable wrong answer button', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      // Create the button for the wrong answer
      const wrongBtn = document.createElement('button');
      wrongBtn.id = 'quiz-option-0';
      document.body.appendChild(wrongBtn);
      mockElements.set('quiz-option-0', wrongBtn);

      (modal as any).showIncorrectFeedback_(0);

      expect(wrongBtn.getAttribute('disabled')).toBe('true');
      expect(wrongBtn.classList.contains('disabled')).toBe(true);
    });
  });

  describe('showCorrectFeedback_', () => {
    beforeEach(() => {
      const feedbackEl = document.createElement('div');
      feedbackEl.id = 'quiz-feedback';
      document.body.appendChild(feedbackEl);
      mockElements.set('quiz-feedback', feedbackEl);

      const avatarEl = document.createElement('img');
      avatarEl.id = 'quiz-avatar';
      document.body.appendChild(avatarEl);
      mockElements.set('quiz-avatar', avatarEl);

      const closeBtn = document.createElement('span');
      closeBtn.id = 'quiz-modal-close';
      document.body.appendChild(closeBtn);
      mockElements.set('quiz-modal-close', closeBtn);

      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;
    });

    it('should set feedback showing flag', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      expect((modal as any).isShowingFeedback_).toBe(true);
    });

    it('should hide close button', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      const closeBtn = mockElements.get('quiz-modal-close');
      expect(closeBtn?.style.display).toBe('none');
    });

    it('should show feedback with correct message', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      const feedbackEl = mockElements.get('quiz-feedback');
      expect(feedbackEl?.innerHTML).toContain('Correct!');
      expect(feedbackEl?.innerHTML).toContain('feedback-correct');
    });

    it('should show explanation if provided', () => {
      const quizData = createMockQuizData({ explanation: 'This is the explanation.' });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      const feedbackEl = mockElements.get('quiz-feedback');
      expect(feedbackEl?.innerHTML).toContain('This is the explanation.');
    });

    it('should create Continue button', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      const feedbackEl = mockElements.get('quiz-feedback');
      expect(feedbackEl?.innerHTML).toContain('quiz-continue-btn');
      expect(feedbackEl?.innerHTML).toContain('Continue');
    });

    it('should update avatar to happy emotion', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      const avatarEl = mockElements.get('quiz-avatar') as HTMLImageElement;
      expect(avatarEl?.src).toContain('happy');
    });

    it('should create overlay', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).showCorrectFeedback_();

      expect((modal as any).overlayEl_).toBeTruthy();
      expect(document.querySelector('.quiz-modal-overlay')).toBeTruthy();
    });
  });

  describe('handleContinueClick_', () => {
    beforeEach(() => {
      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;
    });

    it('should emit QUIZ_COMPLETED event', () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).attempts_ = 2;
      (modal as any).totalPointsDeducted_ = 10;
      (modal as any).isShowingFeedback_ = true;

      (modal as any).handleContinueClick_();

      expect(emitSpy).toHaveBeenCalledWith(Events.QUIZ_COMPLETED, expect.objectContaining({
        objectiveId: 'obj-1',
        conditionIndex: 0,
        totalAttempts: 2,
        totalPointsDeducted: 10,
      }));
    });

    it('should hide overlay', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).isShowingFeedback_ = true;

      // Create an overlay
      const overlay = document.createElement('div');
      overlay.className = 'quiz-modal-overlay';
      document.body.appendChild(overlay);
      (modal as any).overlayEl_ = overlay;

      (modal as any).handleContinueClick_();

      expect((modal as any).overlayEl_).toBeNull();
      expect(document.querySelector('.quiz-modal-overlay')).toBeNull();
    });

    it('should close modal when no quiz is active', () => {
      (modal as any).currentQuiz_ = null;
      const closeSpy = jest.spyOn(modal, 'close');

      (modal as any).handleContinueClick_();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;

      const closeBtn = document.createElement('span');
      closeBtn.id = 'quiz-modal-close';
      closeBtn.style.display = 'none';
      document.body.appendChild(closeBtn);

      (modal as any).domCreated_ = true;
    });

    it('should emit QUIZ_DISMISSED when closing without completing', () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).isShowingFeedback_ = false;

      modal.close();

      expect(emitSpy).toHaveBeenCalledWith(Events.QUIZ_DISMISSED, expect.objectContaining({
        objectiveId: 'obj-1',
        conditionIndex: 0,
      }));
    });

    it('should not emit QUIZ_DISMISSED when showing feedback (completed)', () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;
      (modal as any).isShowingFeedback_ = true;

      modal.close();

      expect(emitSpy).not.toHaveBeenCalledWith(Events.QUIZ_DISMISSED, expect.anything());
    });

    it('should hide overlay if present', () => {
      const overlay = document.createElement('div');
      overlay.className = 'quiz-modal-overlay';
      document.body.appendChild(overlay);
      (modal as any).overlayEl_ = overlay;

      modal.close();

      expect(document.querySelector('.quiz-modal-overlay')).toBeNull();
    });

    it('should restore close button visibility', () => {
      const closeBtn = document.getElementById('quiz-modal-close');
      closeBtn!.style.display = 'none';

      modal.close();

      expect(closeBtn?.style.display).toBe('');
    });

    it('should clear current quiz', () => {
      const quizData = createMockQuizData();
      (modal as any).currentQuiz_ = quizData;

      modal.close();

      expect((modal as any).currentQuiz_).toBeNull();
    });

    it('should reset feedback flag', () => {
      (modal as any).isShowingFeedback_ = true;

      modal.close();

      expect((modal as any).isShowingFeedback_).toBe(false);
    });
  });

  describe('shuffleIndices_', () => {
    it('should return empty array when no quiz', () => {
      (modal as any).currentQuiz_ = null;

      const result = (modal as any).shuffleIndices_();

      expect(result).toEqual([]);
    });

    it('should not shuffle single option quiz', () => {
      const quizData = createMockQuizData({ options: ['Only option'] });
      (modal as any).currentQuiz_ = quizData;

      const result = (modal as any).shuffleIndices_();

      expect(result).toEqual([0]);
    });

    it('should return indices for all options', () => {
      const quizData = createMockQuizData({ options: ['A', 'B', 'C', 'D'] });
      (modal as any).currentQuiz_ = quizData;

      const result = (modal as any).shuffleIndices_();

      expect(result.sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('overlay management', () => {
    beforeEach(() => {
      const boxEl = document.createElement('div');
      boxEl.id = 'quiz-modal';
      document.body.appendChild(boxEl);
      (modal as any).boxEl = boxEl;
    });

    it('should create overlay only once', () => {
      (modal as any).showOverlay_();
      (modal as any).showOverlay_();

      const overlays = document.querySelectorAll('.quiz-modal-overlay');
      expect(overlays.length).toBe(1);
    });

    it('should remove overlay on hide', () => {
      (modal as any).showOverlay_();
      expect(document.querySelector('.quiz-modal-overlay')).toBeTruthy();

      (modal as any).hideOverlay_();
      expect(document.querySelector('.quiz-modal-overlay')).toBeNull();
    });

    it('should set overlay reference to null on hide', () => {
      (modal as any).showOverlay_();
      expect((modal as any).overlayEl_).toBeTruthy();

      (modal as any).hideOverlay_();
      expect((modal as any).overlayEl_).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should unsubscribe from QUIZ_SHOW event', () => {
      const offSpy = jest.spyOn(eventBus, 'off');

      modal.dispose();

      expect(offSpy).toHaveBeenCalledWith(Events.QUIZ_SHOW, expect.any(Function));
    });
  });

  describe('destroy', () => {
    it('should dispose and close the modal', () => {
      const disposeSpy = jest.spyOn(modal, 'dispose');
      const closeSpy = jest.spyOn(modal, 'close');

      QuizModal.destroy();

      expect(disposeSpy).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should reset singleton instance', () => {
      expect((QuizModal as any).instance_).toBeTruthy();

      QuizModal.destroy();

      expect((QuizModal as any).instance_).toBeNull();
    });

    it('should allow creating new instance after destroy', () => {
      const oldInstance = QuizModal.getInstance();
      QuizModal.destroy();
      const newInstance = QuizModal.getInstance();

      expect(newInstance).not.toBe(oldInstance);
    });

    it('should do nothing when no instance exists', () => {
      QuizModal.destroy();

      expect(() => QuizModal.destroy()).not.toThrow();
    });
  });

  describe('disableOptions_', () => {
    it('should disable all option buttons', () => {
      // Create option buttons
      const buttons: HTMLButtonElement[] = [];
      for (let i = 0; i < 4; i++) {
        const btn = document.createElement('button');
        btn.id = `quiz-option-${i}`;
        document.body.appendChild(btn);
        mockElements.set(`quiz-option-${i}`, btn);
        buttons.push(btn);
      }

      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).disableOptions_();

      buttons.forEach((btn) => {
        expect(btn.getAttribute('disabled')).toBe('true');
        expect(btn.classList.contains('disabled')).toBe(true);
      });
    });
  });

  describe('updateButtonStates_', () => {
    beforeEach(() => {
      for (let i = 0; i < 4; i++) {
        const btn = document.createElement('button');
        btn.id = `quiz-option-${i}`;
        document.body.appendChild(btn);
        mockElements.set(`quiz-option-${i}`, btn);
      }
    });

    it('should mark selected button as correct when answer is correct', () => {
      const quizData = createMockQuizData({ correctIndex: 1 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).updateButtonStates_(1, true);

      const correctBtn = mockElements.get('quiz-option-1');
      expect(correctBtn?.classList.contains('selected')).toBe(true);
      expect(correctBtn?.classList.contains('correct')).toBe(true);
    });

    it('should mark selected button as incorrect when answer is wrong', () => {
      const quizData = createMockQuizData({ correctIndex: 1 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      (modal as any).updateButtonStates_(0, false);

      const wrongBtn = mockElements.get('quiz-option-0');
      expect(wrongBtn?.classList.contains('selected')).toBe(true);
      expect(wrongBtn?.classList.contains('incorrect')).toBe(true);
    });

    it('should remove previous state classes', () => {
      const quizData = createMockQuizData({ correctIndex: 1 });
      (modal as any).currentQuiz_ = quizData;
      (modal as any).shuffledIndices_ = [0, 1, 2, 3];

      // Add some classes first
      const btn = mockElements.get('quiz-option-0');
      btn?.classList.add('selected', 'correct', 'incorrect');

      (modal as any).updateButtonStates_(1, true);

      expect(btn?.classList.contains('selected')).toBe(false);
      expect(btn?.classList.contains('correct')).toBe(false);
      expect(btn?.classList.contains('incorrect')).toBe(false);
    });
  });
});
