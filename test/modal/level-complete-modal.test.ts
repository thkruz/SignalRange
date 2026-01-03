import { LevelCompleteModal } from '../../src/modal/level-complete-modal';
import { ScoreBreakdown } from '../../src/scoring/score-calculator';

// Mock all dependencies - use global.document to avoid Jest mock scoping issues
jest.mock('../../src/engine/ui/draggable-modal', () => ({
  DraggableModal: class MockDraggableModal {
    protected boxId: string;
    protected title: string;
    protected boxEl: HTMLElement | null = null;

    constructor(id: string, options: { title: string; width: string }) {
      this.boxId = id;
      this.title = options.title;
    }

    open(): void {
      this.boxEl = global.document.createElement('div');
      this.boxEl.id = this.boxId;
      global.document.body.appendChild(this.boxEl);
      this.onOpen();
    }

    close(): void {
      this.boxEl?.remove();
      this.boxEl = null;
    }

    protected onOpen(): void {}
    protected getModalContentHtml(): string { return ''; }
  },
}));

jest.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => result + str + (values[i] ?? ''), '');
  },
}));

jest.mock('../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
jest.mock('../../src/router', () => ({
  Router: {
    getInstance: jest.fn(() => ({
      navigate: mockNavigate,
    })),
  },
}));

jest.mock('../../src/scoring/score-calculator', () => ({
  ScoreCalculator: {
    TIME_BONUS_DIVISOR: 10,
  },
}));

jest.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      checklistBox: { close: jest.fn() },
      missionBriefBox: { close: jest.fn() },
    })),
  },
}));

jest.mock('../../src/sync/storage', () => ({
  clearPersistedStore: jest.fn().mockResolvedValue(undefined),
}));

const mockResetScenarioForReplay = jest.fn().mockResolvedValue(undefined);
const mockDeleteCheckpoint = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: jest.fn(() => ({
    resetScenarioForReplay: mockResetScenarioForReplay,
    deleteCheckpoint: mockDeleteCheckpoint,
  })),
}));

const mockDialogManagerHide = jest.fn();
jest.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: jest.fn(() => ({
      hide: mockDialogManagerHide,
    })),
  },
}));

const mockQuizModalClose = jest.fn();
jest.mock('../../src/modal/quiz-modal', () => ({
  QuizModal: {
    getInstance: jest.fn(() => ({
      close: mockQuizModalClose,
    })),
  },
}));

const mockPendingQuizIndicatorSuppress = jest.fn();
jest.mock('../../src/modal/pending-quiz-indicator', () => ({
  PendingQuizIndicator: {
    getInstance: jest.fn(() => ({
      suppress: mockPendingQuizIndicatorSuppress,
    })),
  },
}));

describe('LevelCompleteModal', () => {
  let modal: LevelCompleteModal;
  const defaultScore: ScoreBreakdown = {
    basePoints: 100,
    timeBonus: 20,
    quizPenalties: 5,
    timePenalties: 10,
    totalScore: 105,
    objectiveBreakdown: [{ points: 50 }, { points: 50 }],
    timeRemainingSeconds: 200,
  };

  beforeEach(() => {
    (LevelCompleteModal as any).instance_ = null;
    document.body.innerHTML = '';
    modal = LevelCompleteModal.getInstance();
    jest.clearAllMocks();
  });

  afterEach(() => {
    (LevelCompleteModal as any).instance_ = null;
    document.body.innerHTML = '';
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = LevelCompleteModal.getInstance();
      const instance2 = LevelCompleteModal.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('showCompletion', () => {
    it('should display the modal element', () => {
      modal.showCompletion({
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'campaign-1',
        scenarioId: 'scenario-1',
      });

      expect(document.querySelector('#level-complete-modal')).toBeTruthy();
    });

    it('should close all popups before showing', () => {
      modal.showCompletion({
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'campaign-1',
        scenarioId: 'scenario-1',
      });

      expect(mockPendingQuizIndicatorSuppress).toHaveBeenCalled();
      expect(mockQuizModalClose).toHaveBeenCalled();
      expect(mockDialogManagerHide).toHaveBeenCalled();
    });

    it('should store campaign and scenario IDs', () => {
      modal.showCompletion({
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'test-campaign',
        scenarioId: 'test-scenario',
      });

      expect((modal as any).options_.campaignId).toBe('test-campaign');
      expect((modal as any).options_.scenarioId).toBe('test-scenario');
    });

    it('should store the callback', () => {
      const callback = jest.fn();

      modal.showCompletion(
        {
          score: defaultScore,
          elapsedTimeSeconds: 180,
          campaignId: 'campaign-1',
          scenarioId: 'scenario-1',
        },
        callback
      );

      expect((modal as any).onContinueCallback_).toBe(callback);
    });

    it('should set replay mode flag', () => {
      modal.showCompletion(
        {
          score: defaultScore,
          elapsedTimeSeconds: 180,
          campaignId: 'campaign-1',
          scenarioId: 'scenario-1',
        },
        undefined,
        true
      );

      expect((modal as any).isReplayMode_).toBe(true);
    });
  });

  describe('close override', () => {
    it('should not remove modal when close is called', () => {
      modal.showCompletion({
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'campaign-1',
        scenarioId: 'scenario-1',
      });

      modal.close();

      // Modal should still be present - close is overridden to do nothing
      expect(document.querySelector('#level-complete-modal')).toBeTruthy();
    });
  });

  describe('formatTime_', () => {
    it('should format time as MM:SS for under an hour', () => {
      const formatTime = (modal as any).formatTime_.bind(modal);

      expect(formatTime(125)).toBe('2:05');
      expect(formatTime(0)).toBe('0:00');
      expect(formatTime(59)).toBe('0:59');
      expect(formatTime(3599)).toBe('59:59');
    });

    it('should format time as HH:MM:SS for an hour or more', () => {
      const formatTime = (modal as any).formatTime_.bind(modal);

      expect(formatTime(3600)).toBe('1:00:00');
      expect(formatTime(3725)).toBe('1:02:05');
      expect(formatTime(7325)).toBe('2:02:05');
    });
  });

  describe('formatObjectivesDetail_', () => {
    it('should return "No objectives" for empty array', () => {
      const formatDetail = (modal as any).formatObjectivesDetail_.bind(modal);

      expect(formatDetail([])).toBe('No objectives');
    });

    it('should use singular for single objective', () => {
      const formatDetail = (modal as any).formatObjectivesDetail_.bind(modal);

      expect(formatDetail([{ points: 100 }])).toBe('1 objective x +100 each');
    });

    it('should show uniform format when all points are same', () => {
      const formatDetail = (modal as any).formatObjectivesDetail_.bind(modal);

      expect(formatDetail([{ points: 25 }, { points: 25 }, { points: 25 }])).toBe('3 objectives x +25 each');
    });

    it('should show count format when points differ', () => {
      const formatDetail = (modal as any).formatObjectivesDetail_.bind(modal);

      expect(formatDetail([{ points: 20 }, { points: 30 }])).toBe('2 objectives completed');
    });
  });
});
