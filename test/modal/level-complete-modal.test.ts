import { vi } from 'vitest';
import { LevelCompleteModal } from '../../src/modal/level-complete-modal';
import { ScoreBreakdown } from '../../src/scoring/score-calculator';
import { SoundEvents } from '../../src/sound/sound-events';

vi.mock('../../src/sound/sound-events', () => ({ SoundEvents: { finish: vi.fn() } }));

// Mock all dependencies - use global.document to avoid Jest mock scoping issues
vi.mock('../../src/engine/ui/draggable-modal', () => ({
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
      this.boxEl.innerHTML = this.getModalContentHtml();
      global.document.body.appendChild(this.boxEl);
      this.onOpen();
    }

    close(): void {
      this.boxEl?.remove();
      this.boxEl = null;
    }

    protected onOpen(): void {}
    protected getModalContentHtml(): string {
      return '';
    }
  },
}));

vi.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((result, str, i) => result + str + (values[i] ?? ''), ''),
}));

vi.mock('../../src/logging/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('../../src/router', () => ({
  Router: {
    getInstance: vi.fn(() => ({
      navigate: mockNavigate,
    })),
  },
}));

vi.mock('../../src/scoring/score-calculator', () => ({
  ScoreCalculator: {
    TIME_BONUS_DIVISOR: 10,
  },
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      checklistBox: { close: vi.fn() },
      missionBriefBox: { close: vi.fn() },
    })),
  },
}));

vi.mock('../../src/sync/storage', () => ({
  clearPersistedStore: vi.fn().mockResolvedValue(undefined),
}));

const mockResetScenarioForReplay = vi.fn().mockResolvedValue(undefined);
const mockDeleteCheckpoint = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: vi.fn(() => ({
    resetScenarioForReplay: mockResetScenarioForReplay,
    deleteCheckpoint: mockDeleteCheckpoint,
  })),
}));

const mockDialogManagerHide = vi.fn();
vi.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: vi.fn(() => ({
      hide: mockDialogManagerHide,
    })),
  },
}));

const mockQuizModalClose = vi.fn();
vi.mock('../../src/modal/quiz-modal', () => ({
  QuizModal: {
    getInstance: vi.fn(() => ({
      close: mockQuizModalClose,
    })),
  },
}));

const mockPendingQuizIndicatorSuppress = vi.fn();
vi.mock('../../src/modal/pending-quiz-indicator', () => ({
  PendingQuizIndicator: {
    getInstance: vi.fn(() => ({
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
    vi.clearAllMocks();
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

  it('keeps the debrief open after a failed save and retries before navigating', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    modal.showCompletion(
      {
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'campaign-1',
        scenarioId: 'scenario-1',
        debrief: {
          previousScore: 90,
          bestScore: 105,
          personalBest: true,
          achievements: [],
          newlyUnlocked: true,
          nextMission: { id: 'scenario-2', title: 'Next assignment', imageUrl: '' },
        },
      },
      save
    );
    const next = document.querySelector<HTMLButtonElement>('#next-mission-btn')!;
    next.click();
    await vi.waitFor(() => expect(next.disabled).toBe(false));
    expect(document.querySelector('#debrief-save-status')?.textContent).toContain('Your result is still here');
    expect(mockNavigate).not.toHaveBeenCalled();
    next.click();
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/campaigns/campaign-1/scenarios/scenario-2'));
    expect(save).toHaveBeenCalledTimes(2);
    expect(document.querySelector('#level-complete-modal')).toBeNull();
  });

  it.each([true, false])('saves before the epilogue and waits for its action (accept=%s)', async (accept) => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    modal.showCompletion(
      {
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'campaign-1',
        scenarioId: 'scenario-1',
        debrief: {
          bestScore: 105,
          personalBest: true,
          achievements: [],
          newlyUnlocked: false,
          epilogue: { label: 'Campaign complete', title: 'Watch complete', image: '/room.webp', imageAlt: '', facts: [], actionLabel: 'Return to campaigns' },
        },
      },
      save
    );
    const button = document.querySelector<HTMLButtonElement>('#continue-btn')!;
    expect(button.textContent).toBe('View Epilogue');
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(document.querySelector('.scene-modal')).toBeNull();
    button.click();
    await vi.waitFor(() => expect(document.querySelector('.scene-modal')).not.toBeNull());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(2);
    if (accept) document.querySelector<HTMLButtonElement>('.scene-start')!.click();
    else document.querySelector('.scene-modal')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(accept ? '/' : '/campaigns/campaign-1'));
    expect(document.querySelector('.scene-modal')).toBeNull();
  });

  describe('showCompletion', () => {
    it('shows readable NICE tasks even without account history, deduplicating task codes', () => {
      modal.showCompletion({
        score: defaultScore,
        elapsedTimeSeconds: 180,
        campaignId: 'nats',
        scenarioId: 'nats-scenario1',
        isAuthenticated: false,
        niceTaskCodes: ['T0153', 'T0081', 'T0153', 'K0740'],
      });
      const section = document.querySelector('.mission-nice-tasks')!;
      expect(section.textContent).toContain('NICE tasks practiced · 2');
      expect(section.textContent).toContain('Diagnose network connectivity problems');
      expect(section.textContent).toContain('Monitor network capacity and performance');
      expect(Array.from(section.querySelectorAll('code'), (code) => code.textContent)).toEqual(['T0081', 'T0153']);
    });
    it('stops mission audio before presenting results', () => {
      modal.showCompletion({ score: defaultScore, elapsedTimeSeconds: 180, campaignId: 'nats', scenarioId: 'nats-scenario24' });
      expect(SoundEvents.finish).toHaveBeenCalledOnce();
    });
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
      const callback = vi.fn();

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
