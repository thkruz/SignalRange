import { EventBus } from '../../../src/events/event-bus';

// Mock Router to break circular import chain (router → campaign-selection → BasePage)
jest.mock('../../../src/router', () => ({
  router: {
    navigateTo: jest.fn(),
    getCurrentRoute: jest.fn(),
  },
  NavigationOptions: {},
}));

// Mock level-complete-modal which imports router
jest.mock('../../../src/modal/level-complete-modal', () => ({
  LevelCompleteModal: {
    show: jest.fn(),
    hide: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('../../../src/events/event-bus');
jest.mock('../../../src/app', () => ({
  App: {
    authReady: Promise.resolve(),
  },
}));
jest.mock('../../../src/pages/layout/body/body', () => ({
  Body: {
    containerId: 'body-container',
  },
}));
jest.mock('../../../src/pages/mission-control/global-command-bar', () => ({
  GlobalCommandBar: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
}));
jest.mock('../../../src/pages/mission-control/timeline-deck', () => ({
  TimelineDeck: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
}));
jest.mock('../../../src/pages/mission-control/asset-tree-sidebar', () => ({
  AssetTreeSidebar: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    refresh: jest.fn(),
  })),
}));
jest.mock('../../../src/pages/mission-control/tabbed-canvas', () => ({
  TabbedCanvas: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
  })),
}));
jest.mock('../../../src/assets/ground-station/ground-station', () => ({
  GroundStation: jest.fn().mockImplementation(() => ({
    state: { id: 'GS-001', name: 'Test Station' },
    antennas: [],
    rfFrontEnds: [],
    spectrumAnalyzers: [],
    transmitters: [],
    receivers: [],
    initializeEquipment: jest.fn(),
    sync: jest.fn(),
  })),
}));
jest.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      data: { id: 'test-scenario' },
      settings: { missionBriefUrl: null },
      getScenario: jest.fn(() => ({
        groundStations: [
          {
            id: 'GS-001',
            name: 'Test Station',
            location: { lat: 25, lon: -80, alt: 10 },
          },
        ],
      })),
    })),
  },
}));
jest.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      groundStations: [],
      satellites: [],
    })),
    destroy: jest.fn(),
  },
}));
jest.mock('../../../src/services/alarm-service', () => ({
  AlarmService: {
    getInstance: jest.fn(),
    destroy: jest.fn(),
  },
}));
jest.mock('../../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(),
    })),
    destroy: jest.fn(),
  },
}));
jest.mock('../../../src/scenarios/scenario-dialog-manager', () => ({
  ScenarioDialogManager: {
    reset: jest.fn(),
  },
}));
jest.mock('../../../src/modal/quiz-modal', () => ({
  QuizModal: {
    destroy: jest.fn(),
  },
}));
jest.mock('../../../src/modal/pending-quiz-indicator', () => ({
  PendingQuizIndicator: {
    destroy: jest.fn(),
  },
}));
jest.mock('../../../src/sync', () => ({
  syncEquipmentWithStore: jest.fn(),
}));
jest.mock('../../../src/sync/storage', () => ({
  syncManager: {
    provider: {
      write: jest.fn(),
    },
  },
}));
jest.mock('../../../src/user-account/auth', () => ({
  Auth: {
    isLoggedIn: jest.fn(() => Promise.resolve(false)),
  },
}));
jest.mock('../../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../src/engine/utils/query-selector', () => ({
  qs: jest.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

// Import after mocks are set up
import { MissionControlPage } from '../../../src/pages/mission-control/mission-control-page';

describe('MissionControlPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock; destroy: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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
    bodyContainer.id = 'body-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    // Destroy the singleton
    MissionControlPage.destroy();
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  describe('singleton pattern', () => {
    it('should create instance with create()', () => {
      const page = MissionControlPage.create();
      expect(page).toBeInstanceOf(MissionControlPage);
    });

    it('should throw error if create() called twice', () => {
      MissionControlPage.create();
      expect(() => MissionControlPage.create()).toThrow('AppShellPage instance already exists');
    });

    it('should return instance with getInstance()', () => {
      const page = MissionControlPage.create();
      expect(MissionControlPage.getInstance()).toBe(page);
    });

    it('should return null from getInstance() before create()', () => {
      expect(MissionControlPage.getInstance()).toBeNull();
    });

    it('should return null from getInstance() after destroy()', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();
      expect(MissionControlPage.getInstance()).toBeNull();
    });
  });

  describe('HTML rendering', () => {
    let page: MissionControlPage;

    beforeEach(() => {
      page = MissionControlPage.create();
    });

    it('should render app-shell-page container', () => {
      const container = document.querySelector('#app-shell-page');
      expect(container).not.toBeNull();
    });

    it('should render with flex-column class', () => {
      const container = document.querySelector('#app-shell-page');
      expect(container?.classList.contains('flex-column')).toBe(true);
    });

    it('should render global command bar container', () => {
      const header = document.querySelector('#global-command-bar-container');
      expect(header).not.toBeNull();
    });

    it('should render main workspace area', () => {
      const main = document.querySelector('.app-shell-main');
      expect(main).not.toBeNull();
    });

    it('should render asset tree sidebar container', () => {
      const sidebar = document.querySelector('#asset-tree-sidebar-container');
      expect(sidebar).not.toBeNull();
    });

    it('should render tabbed canvas container', () => {
      const canvas = document.querySelector('#tabbed-canvas-container');
      expect(canvas).not.toBeNull();
    });

    it('should have correct page id', () => {
      expect(page.id).toBe('app-shell-page');
    });
  });

  describe('component initialization', () => {
    beforeEach(() => {
      MissionControlPage.create();
    });

    it('should create GlobalCommandBar', () => {
      const { GlobalCommandBar } = require('../../../src/pages/mission-control/global-command-bar');
      expect(GlobalCommandBar).toHaveBeenCalledWith('global-command-bar-container');
    });

    it('should create TimelineDeck', () => {
      const { TimelineDeck } = require('../../../src/pages/mission-control/timeline-deck');
      expect(TimelineDeck).toHaveBeenCalledWith('app-shell-page');
    });

    it('should create AssetTreeSidebar', () => {
      const { AssetTreeSidebar } = require('../../../src/pages/mission-control/asset-tree-sidebar');
      expect(AssetTreeSidebar).toHaveBeenCalledWith('asset-tree-sidebar-container');
    });

    it('should create TabbedCanvas', () => {
      const { TabbedCanvas } = require('../../../src/pages/mission-control/tabbed-canvas');
      expect(TabbedCanvas).toHaveBeenCalledWith('tabbed-canvas-container');
    });
  });

  describe('ground station creation', () => {
    beforeEach(() => {
      MissionControlPage.create();
    });

    it('should create ground stations from scenario config', () => {
      const { GroundStation } = require('../../../src/assets/ground-station/ground-station');
      expect(GroundStation).toHaveBeenCalled();
    });

    it('should initialize equipment for each ground station', () => {
      const { GroundStation } = require('../../../src/assets/ground-station/ground-station');
      const mockGsInstance = GroundStation.mock.results[0]?.value;
      expect(mockGsInstance?.initializeEquipment).toHaveBeenCalled();
    });
  });

  describe('clock', () => {
    it('should start clock on initialization', () => {
      const page = MissionControlPage.create();

      // Clock starts running - advance timers to verify no errors
      jest.advanceTimersByTime(2000);

      // Page should be created successfully with clock running
      expect(page).toBeInstanceOf(MissionControlPage);
    });
  });

  describe('async initialization', () => {
    it('should initialize SimulationManager', async () => {
      MissionControlPage.create();

      // Let async init complete
      await Promise.resolve();
      jest.advanceTimersByTime(100);

      const { SimulationManager } = require('../../../src/simulation/simulation-manager');
      expect(SimulationManager.getInstance).toHaveBeenCalled();
    });

    it('should initialize AlarmService', async () => {
      MissionControlPage.create();

      // Let async init complete
      await Promise.resolve();
      jest.advanceTimersByTime(100);

      const { AlarmService } = require('../../../src/services/alarm-service');
      expect(AlarmService.getInstance).toHaveBeenCalled();
    });

    it('should call syncEquipmentWithStore', async () => {
      MissionControlPage.create();

      // Let async init complete (multiple awaits for promise chain)
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const { syncEquipmentWithStore } = require('../../../src/sync');
      expect(syncEquipmentWithStore).toHaveBeenCalled();
    });
  });

  describe('hide', () => {
    it('should hide the page DOM element', () => {
      const page = MissionControlPage.create();
      page.hide();

      const container = document.querySelector('#app-shell-page') as HTMLElement;
      expect(container?.style.display).toBe('none');
    });

    it('should call destroy', () => {
      const page = MissionControlPage.create();
      page.hide();

      expect(MissionControlPage.getInstance()).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should destroy AlarmService', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { AlarmService } = require('../../../src/services/alarm-service');
      expect(AlarmService.destroy).toHaveBeenCalled();
    });

    it('should destroy SimulationManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { SimulationManager } = require('../../../src/simulation/simulation-manager');
      expect(SimulationManager.destroy).toHaveBeenCalled();
    });

    it('should destroy ObjectivesManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { ObjectivesManager } = require('../../../src/objectives/objectives-manager');
      expect(ObjectivesManager.destroy).toHaveBeenCalled();
    });

    it('should reset ScenarioDialogManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { ScenarioDialogManager } = require('../../../src/scenarios/scenario-dialog-manager');
      expect(ScenarioDialogManager.reset).toHaveBeenCalled();
    });

    it('should destroy QuizModal', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { QuizModal } = require('../../../src/modal/quiz-modal');
      expect(QuizModal.destroy).toHaveBeenCalled();
    });

    it('should destroy PendingQuizIndicator', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      const { PendingQuizIndicator } = require('../../../src/modal/pending-quiz-indicator');
      expect(PendingQuizIndicator.destroy).toHaveBeenCalled();
    });

    it('should destroy EventBus', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      expect(EventBus.destroy).toHaveBeenCalled();
    });

    it('should not fail if called when no instance exists', () => {
      expect(() => MissionControlPage.destroy()).not.toThrow();
    });
  });

  describe('navigation options', () => {
    it('should accept navigation options', () => {
      const page = MissionControlPage.create({ forceReplay: true });
      expect(page).toBeInstanceOf(MissionControlPage);
    });

    it('should skip checkpoint load when forceReplay is true', async () => {
      MissionControlPage.create({ forceReplay: true });

      await Promise.resolve();
      jest.advanceTimersByTime(100);

      const { Logger } = require('../../../src/logging/logger');
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping checkpoint load due to forceReplay')
      );
    });
  });
});

describe('MissionControlPage with logged in user', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock; destroy: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock Auth to return logged in
    const { Auth } = require('../../../src/user-account/auth');
    Auth.isLoggedIn.mockReturnValue(Promise.resolve(true));

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
    bodyContainer.id = 'body-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    MissionControlPage.destroy();
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('should attempt to load checkpoint when user is logged in', async () => {
    MissionControlPage.create();

    // Let async init and auth check complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(100);

    const { Logger } = require('../../../src/logging/logger');
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Loading checkpoint for scenario')
    );
  });
});

describe('MissionControlPage existing instance cleanup', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock; destroy: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      destroy: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);
    (EventBus.destroy as jest.Mock) = jest.fn();

    // Setup body container with existing app-shell-page
    bodyContainer = document.createElement('div');
    bodyContainer.id = 'body-container';

    const existingPage = document.createElement('div');
    existingPage.id = 'app-shell-page';
    bodyContainer.appendChild(existingPage);

    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    MissionControlPage.destroy();
    document.body.innerHTML = '';
  });

  it('should remove existing instance from DOM', () => {
    // There's an existing #app-shell-page in the DOM
    const existingBefore = document.querySelectorAll('#app-shell-page');
    expect(existingBefore.length).toBe(1);

    MissionControlPage.create();

    // After create, there should still be exactly one (the new one)
    const existingAfter = document.querySelectorAll('#app-shell-page');
    expect(existingAfter.length).toBe(1);
  });
});
