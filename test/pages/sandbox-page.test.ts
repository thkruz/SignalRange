import { EventBus } from '../../src/events/event-bus';

// Mock dependencies before imports
jest.mock('../../src/events/event-bus');

jest.mock('../../src/engine/utils/get-el', () => ({
  getEl: jest.fn(),
}));

jest.mock('../../src/engine/utils/query-selector', () => ({
  qs: jest.fn(),
}));

jest.mock('../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/router', () => ({
  NavigationOptions: {},
}));

jest.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      data: {
        id: 'sandbox',
        objectives: [],
      },
      settings: {
        isSync: false,
      },
    })),
  },
}));

jest.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      equipment: null,
      sync: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    initialize: jest.fn(),
    getInstance: jest.fn(() => ({
      areAllObjectivesCompleted: jest.fn(() => false),
      getObjectiveStates: jest.fn(() => []),
      getElapsedTime: jest.fn(() => 0),
      stopAllTimers: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/modal/quiz-modal', () => ({
  QuizModal: {
    getInstance: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/scenarios/scenario-dialog-manager', () => ({
  ScenarioDialogManager: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(),
    })),
    reset: jest.fn(),
  },
}));

jest.mock('../../src/sync/storage', () => ({
  syncEquipmentWithStore: jest.fn(),
  clearPersistedStore: jest.fn(() => Promise.resolve()),
  syncManager: {
    setEquipment: jest.fn(),
    provider: {
      write: jest.fn(() => Promise.resolve()),
    },
  },
  AppState: {},
}));

jest.mock('../../src/user-account/progress-save-manager', () => ({
  ProgressSaveManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    dispose: jest.fn(),
    loadCheckpoint: jest.fn(() => Promise.resolve(null)),
  })),
}));

jest.mock('../../src/scoring/scenario-completion-handler', () => ({
  ScenarioCompletionHandler: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/modal/time-penalty-toast', () => ({
  TimePenaltyToast: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
    })),
  },
}));

jest.mock('../../src/pages/sandbox/equipment', () => ({
  Equipment: jest.fn().mockImplementation(() => ({
    spectrumAnalyzers: [],
    antennas: [],
    rfFrontEnds: [],
    transmitters: [],
    receivers: [],
  })),
}));

jest.mock('../../src/pages/layout/body/body', () => ({
  Body: {
    containerId: 'body-content-container',
  },
}));

// Import after mocks
import { SandboxPage } from '../../src/pages/sandbox-page';
import { SimulationManager } from '../../src/simulation/simulation-manager';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { ScenarioDialogManager } from '../../src/scenarios/scenario-dialog-manager';
import { QuizModal } from '../../src/modal/quiz-modal';
import { Equipment } from '../../src/pages/sandbox/equipment';
import { clearPersistedStore } from '../../src/sync/storage';
import { qs } from '../../src/engine/utils/query-selector';
import { getEl } from '../../src/engine/utils/get-el';

// Setup qs mock to use actual DOM
const mockQs = qs as jest.Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

// Setup getEl mock to use actual DOM
const mockGetEl = getEl as jest.Mock;
mockGetEl.mockImplementation((id: string) => global.document.getElementById(id));

describe('SandboxPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock; destroy: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    (SandboxPage as any).instance_ = null;

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      destroy: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);
    (EventBus.destroy as jest.Mock) = jest.fn();

    // Setup body container
    bodyContainer = document.createElement('div');
    bodyContainer.id = 'body-content-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    SandboxPage.destroy();
    document.body.innerHTML = '';
  });

  describe('singleton pattern', () => {
    it('should create instance with create()', () => {
      const page = SandboxPage.create();
      expect(page).toBeInstanceOf(SandboxPage);
    });

    it('should throw error if create() called twice', () => {
      SandboxPage.create();
      expect(() => SandboxPage.create()).toThrow('SandboxPage instance already exists.');
    });

    it('should return instance with getInstance()', () => {
      const page = SandboxPage.create();
      expect(SandboxPage.getInstance()).toBe(page);
    });

    it('should return null from getInstance() before create()', () => {
      expect(SandboxPage.getInstance()).toBeNull();
    });

    it('should return null from getInstance() after destroy()', () => {
      SandboxPage.create();
      SandboxPage.destroy();
      expect(SandboxPage.getInstance()).toBeNull();
    });
  });

  describe('page id', () => {
    it('should have correct id', () => {
      const page = SandboxPage.create();
      expect(page.id).toBe('sandbox-page');
    });

    it('should have correct containerId', () => {
      expect(SandboxPage.containerId).toBe('sandbox-page-container');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      SandboxPage.create();
    });

    it('should render sandbox-page container', () => {
      const container = document.querySelector('#sandbox-page');
      expect(container).not.toBeNull();
    });

    it('should render sandbox-page-container div', () => {
      const container = document.querySelector('#sandbox-page-container');
      expect(container).not.toBeNull();
    });
  });

  describe('equipment initialization', () => {
    it('should create Equipment instance', async () => {
      SandboxPage.create();

      // Wait for async initialization
      await Promise.resolve();
      await Promise.resolve();

      expect(Equipment).toHaveBeenCalled();
    });

    it('should set equipment on SimulationManager', async () => {
      const mockSimManager = {
        equipment: null,
        sync: jest.fn(),
      };
      (SimulationManager.getInstance as jest.Mock).mockReturnValue(mockSimManager);

      SandboxPage.create();

      // Wait for async initialization
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSimManager.equipment).not.toBeNull();
    });
  });

  describe('navigation options', () => {
    it('should accept navigation options', () => {
      const page = SandboxPage.create({ forceReplay: true });
      expect(page).toBeInstanceOf(SandboxPage);
    });

    it('should clear local storage when not continuing from checkpoint', async () => {
      const { ScenarioManager } = require('../../src/scenario-manager');
      ScenarioManager.getInstance.mockReturnValue({
        data: { id: 'sandbox', objectives: [] },
        settings: { isSync: true },
      });

      SandboxPage.create({ forceReplay: true });

      // Wait for async initialization
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(clearPersistedStore).toHaveBeenCalled();
    });
  });

  describe('hide', () => {
    it('should call destroy', () => {
      const page = SandboxPage.create();
      page.hide();

      expect(SandboxPage.getInstance()).toBeNull();
    });

    it('should set display to none', () => {
      const page = SandboxPage.create();
      page.hide();

      const container = document.querySelector('#sandbox-page') as HTMLElement;
      expect(container?.style.display).toBe('none');
    });
  });

  describe('destroy', () => {
    it('should destroy SimulationManager', () => {
      SandboxPage.create();
      SandboxPage.destroy();

      expect(SimulationManager.destroy).toHaveBeenCalled();
    });

    it('should destroy ObjectivesManager', () => {
      SandboxPage.create();
      SandboxPage.destroy();

      expect(ObjectivesManager.destroy).toHaveBeenCalled();
    });

    it('should reset ScenarioDialogManager', () => {
      SandboxPage.create();
      SandboxPage.destroy();

      expect(ScenarioDialogManager.reset).toHaveBeenCalled();
    });

    it('should destroy QuizModal', () => {
      SandboxPage.create();
      SandboxPage.destroy();

      expect(QuizModal.destroy).toHaveBeenCalled();
    });

    it('should destroy EventBus', () => {
      SandboxPage.create();
      SandboxPage.destroy();

      expect(EventBus.destroy).toHaveBeenCalled();
    });

    it('should clear container innerHTML', () => {
      SandboxPage.create();

      // Add a container element
      const container = document.createElement('div');
      container.id = 'sandbox-page-container';
      container.innerHTML = '<div>Test content</div>';
      document.body.appendChild(container);

      SandboxPage.destroy();

      const containerAfter = document.getElementById('sandbox-page-container');
      expect(containerAfter?.innerHTML).toBe('');
    });

    it('should not throw if called when no instance exists', () => {
      expect(() => SandboxPage.destroy()).not.toThrow();
    });
  });

  describe('existing element cleanup', () => {
    it('should remove existing sandbox-page element before creating new one', () => {
      // Create existing element
      const existing = document.createElement('div');
      existing.id = 'sandbox-page';
      bodyContainer.appendChild(existing);

      // There should be one existing element
      expect(document.querySelectorAll('#sandbox-page').length).toBe(1);

      SandboxPage.create();

      // After create, there should still be exactly one
      expect(document.querySelectorAll('#sandbox-page').length).toBe(1);
    });
  });

  describe('checkpoint loading', () => {
    it('should load checkpoint when continuing from checkpoint', async () => {
      const { ScenarioManager } = require('../../src/scenario-manager');
      ScenarioManager.getInstance.mockReturnValue({
        data: { id: 'sandbox', objectives: [] },
        settings: { isSync: true },
      });

      const mockLoadCheckpoint = jest.fn(() =>
        Promise.resolve({
          state: {
            equipment: { test: 'data' },
          },
        })
      );

      const { ProgressSaveManager } = require('../../src/user-account/progress-save-manager');
      ProgressSaveManager.mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
        loadCheckpoint: mockLoadCheckpoint,
      }));

      SandboxPage.create({ continueFromCheckpoint: true });

      // Wait for async initialization
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLoadCheckpoint).toHaveBeenCalledWith('sandbox');
    });

    it('should not load checkpoint when starting fresh', async () => {
      const { ScenarioManager } = require('../../src/scenario-manager');
      ScenarioManager.getInstance.mockReturnValue({
        data: { id: 'sandbox', objectives: [] },
        settings: { isSync: true },
      });

      const mockLoadCheckpoint = jest.fn(() => Promise.resolve(null));

      const { ProgressSaveManager } = require('../../src/user-account/progress-save-manager');
      ProgressSaveManager.mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
        loadCheckpoint: mockLoadCheckpoint,
      }));

      SandboxPage.create({ forceReplay: true });

      // Wait for async initialization
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLoadCheckpoint).not.toHaveBeenCalled();
    });
  });
});
