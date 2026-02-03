import { vi } from 'vitest';
import { ObjectiveFailedModal } from '../../src/modal/objective-failed-modal';

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
      global.document.body.appendChild(this.boxEl);
      this.onOpen();
    }

    close(): void {
      this.boxEl?.remove();
      this.boxEl = null;
    }

    protected onOpen(): void { }
    protected getModalContentHtml(): string { return ''; }
  },
}));

vi.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => result + str + (values[i] ?? ''), '');
  },
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      data: { id: 'scenario-1' },
    })),
  },
}));

vi.mock('../../src/sync/storage', () => ({
  clearPersistedStore: vi.fn().mockResolvedValue(undefined),
}));

const mockHasCheckpoint = vi.fn().mockResolvedValue(false);
const mockClearCheckpoint = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/user-account/progress-save-manager', () => ({
  ProgressSaveManager: vi.fn(function () {
    return {
      hasCheckpoint: mockHasCheckpoint,
      clearCheckpoint: mockClearCheckpoint,
    };
  }),
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

vi.mock('../../src/assets/icons/stopwatch.png', () => ({ default: 'stopwatch.png' }));

describe('ObjectiveFailedModal', () => {
  let modal: ObjectiveFailedModal;

  beforeEach(() => {
    (ObjectiveFailedModal as any).instance_ = null;
    document.body.innerHTML = '';
    modal = ObjectiveFailedModal.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    (ObjectiveFailedModal as any).instance_ = null;
    document.body.innerHTML = '';
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ObjectiveFailedModal.getInstance();
      const instance2 = ObjectiveFailedModal.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('showFailure', () => {
    it('should display the modal element', async () => {
      await modal.showFailure({
        title: 'Test Failure',
        message: 'Time ran out',
      });

      expect(document.querySelector('#objective-failed-modal')).toBeTruthy();
    });

    it('should close all popups before showing', async () => {
      await modal.showFailure({
        title: 'Failure',
        message: 'Test',
      });

      expect(mockPendingQuizIndicatorSuppress).toHaveBeenCalled();
      expect(mockQuizModalClose).toHaveBeenCalled();
      expect(mockDialogManagerHide).toHaveBeenCalled();
    });

    it('should set title to "Mission Failed" for scenario timeout', async () => {
      await modal.showFailure({
        isScenarioTimeout: true,
      });

      expect((modal as any).title).toBe('Mission Failed');
    });

    it('should set title to "Objective Failed" for objective timeout', async () => {
      await modal.showFailure({
        isScenarioTimeout: false,
      });

      expect((modal as any).title).toBe('Objective Failed');
    });

    it('should check for checkpoint existence', async () => {
      await modal.showFailure({
        title: 'Failure',
        message: 'Test',
      });

      expect(mockHasCheckpoint).toHaveBeenCalledWith('scenario-1');
    });
  });

  describe('close override', () => {
    it('should not remove modal when close is called', async () => {
      await modal.showFailure({
        title: 'Failure',
        message: 'Test',
      });

      modal.close();

      // Modal should still be present - close is overridden to do nothing
      expect(document.querySelector('#objective-failed-modal')).toBeTruthy();
    });
  });
});
