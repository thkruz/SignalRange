import { Mock, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';

// Mock Router to break circular import chain (router → campaign-selection → BasePage)
vi.mock('../../../src/router', () => ({
  router: {
    navigateTo: vi.fn(),
    getCurrentRoute: vi.fn(),
  },
  NavigationOptions: {},
}));

// Mock level-complete-modal which imports router
vi.mock('../../../src/modal/level-complete-modal', () => ({
  LevelCompleteModal: {
    show: vi.fn(),
    hide: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('../../../src/events/event-bus');
vi.mock('../../../src/app', () => ({
  App: {
    authReady: Promise.resolve(),
  },
}));
vi.mock('../../../src/pages/layout/body/body', () => ({
  Body: {
    containerId: 'body-container',
  },
}));
vi.mock('../../../src/pages/mission-control/global-command-bar', () => ({
  GlobalCommandBar: vi.fn(function () {
    return {
      dispose: vi.fn(),
    };
  }),
}));
vi.mock('../../../src/pages/mission-control/timeline-deck', () => ({
  TimelineDeck: vi.fn(function () {
    return {
      dispose: vi.fn(),
    };
  }),
}));
vi.mock('../../../src/pages/mission-control/asset-tree-sidebar', () => ({
  AssetTreeSidebar: vi.fn(function () {
    return {
      destroy: vi.fn(),
      refresh: vi.fn(),
    };
  }),
}));
vi.mock('../../../src/pages/mission-control/tabbed-canvas', () => ({
  TabbedCanvas: vi.fn(function () {
    return {
      destroy: vi.fn(),
    };
  }),
}));
vi.mock('../../../src/assets/ground-station/ground-station', () => ({
  GroundStation: vi.fn(function () {
    return {
      state: { id: 'GS-001', name: 'Test Station' },
      antennas: [],
      rfFrontEnds: [],
      spectrumAnalyzers: [],
      transmitters: [],
      receivers: [],
      initializeEquipment: vi.fn(),
      sync: vi.fn(),
    };
  }),
}));
/**
 * Scenario settings the page reads. Mutable so a test can opt the scenario in
 * to the contact-timeline deck (which is otherwise absent by design).
 */
let mockSettings: Record<string, unknown> = { missionBriefUrl: null };

vi.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      data: { id: 'test-scenario' },
      get settings() {
        return mockSettings;
      },
      getScenario: vi.fn(() => ({
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
vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: [],
      satellites: [],
    })),
    destroy: vi.fn(),
  },
}));
vi.mock('../../../src/services/alarm-service', () => ({
  AlarmService: {
    getInstance: vi.fn(),
    destroy: vi.fn(),
  },
}));
vi.mock('../../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
    })),
    destroy: vi.fn(),
  },
}));
vi.mock('../../../src/scenarios/scenario-dialog-manager', () => ({
  ScenarioDialogManager: {
    reset: vi.fn(),
  },
}));
vi.mock('../../../src/modal/quiz-modal', () => ({
  QuizModal: {
    destroy: vi.fn(),
  },
}));
vi.mock('../../../src/modal/pending-quiz-indicator', () => ({
  PendingQuizIndicator: {
    destroy: vi.fn(),
  },
}));
vi.mock('../../../src/sync', () => ({
  syncEquipmentWithStore: vi.fn(),
}));
vi.mock('../../../src/sync/storage', () => ({
  syncManager: {
    provider: {
      write: vi.fn(),
    },
  },
}));
vi.mock('../../../src/user-account/auth', () => ({
  Auth: {
    isLoggedIn: vi.fn(() => Promise.resolve(false)),
    getSession: vi.fn(() => Promise.resolve(null)),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));
vi.mock('../../../src/logging/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

import { GroundStation } from '../../../src/assets/ground-station/ground-station';
import { Logger } from '../../../src/logging/logger';
import { PendingQuizIndicator } from '../../../src/modal/pending-quiz-indicator';
import { QuizModal } from '../../../src/modal/quiz-modal';
import { ObjectivesManager } from '../../../src/objectives/objectives-manager';
import { AssetTreeSidebar } from '../../../src/pages/mission-control/asset-tree-sidebar';
import { GlobalCommandBar } from '../../../src/pages/mission-control/global-command-bar';
import { TabbedCanvas } from '../../../src/pages/mission-control/tabbed-canvas';
import { TimelineDeck } from '../../../src/pages/mission-control/timeline-deck';
import { ScenarioDialogManager } from '../../../src/scenarios/scenario-dialog-manager';
import { AlarmService } from '../../../src/services/alarm-service';
import { SimulationManager } from '../../../src/simulation/simulation-manager';
import { syncEquipmentWithStore } from '../../../src/sync';
import { Auth } from '../../../src/user-account/auth';
// Import after mocks are set up
import { MissionControlPage } from '../../../src/pages/mission-control/mission-control-page';

describe('MissionControlPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock; destroy: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      destroy: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);
    (EventBus.destroy as Mock) = vi.fn();

    // Setup body container
    bodyContainer = document.createElement('div');
    bodyContainer.id = 'body-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    // Destroy the singleton
    MissionControlPage.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
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
      expect(GlobalCommandBar).toHaveBeenCalledWith('global-command-bar-container');
    });

    it('should NOT create TimelineDeck when the scenario does not opt in', () => {
      // The deck is opt-in via settings.contactTimeline; campaigns without it
      // (Campaign 1) keep the original shell layout.
      expect(TimelineDeck).not.toHaveBeenCalled();
    });

    it('should create TimelineDeck when the scenario declares contactTimeline', () => {
      MissionControlPage.destroy();
      vi.mocked(TimelineDeck).mockClear();
      mockSettings = { missionBriefUrl: null, contactTimeline: { horizonHours: 2 } };

      MissionControlPage.create();

      expect(TimelineDeck).toHaveBeenCalledWith('app-shell-page', { horizonHours: 2 });

      mockSettings = { missionBriefUrl: null };
    });

    it('should create AssetTreeSidebar', () => {
      expect(AssetTreeSidebar).toHaveBeenCalledWith('asset-tree-sidebar-container');
    });

    it('should create TabbedCanvas', () => {
      expect(TabbedCanvas).toHaveBeenCalledWith('tabbed-canvas-container');
    });
  });

  describe('ground station creation', () => {
    beforeEach(() => {
      MissionControlPage.create();
    });

    it('should create ground stations from scenario config', () => {
      expect(GroundStation).toHaveBeenCalled();
    });

    it('should initialize equipment for each ground station', () => {

      const mockGsInstance = GroundStation.mock.results[0]?.value;
      expect(mockGsInstance?.initializeEquipment).toHaveBeenCalled();
    });
  });

  describe('clock', () => {
    it('should start clock on initialization', () => {
      const page = MissionControlPage.create();

      // Clock starts running - advance timers to verify no errors
      vi.advanceTimersByTime(2000);

      // Page should be created successfully with clock running
      expect(page).toBeInstanceOf(MissionControlPage);
    });
  });

  describe('async initialization', () => {
    it('should initialize SimulationManager', async () => {
      MissionControlPage.create();

      // Let async init complete
      await Promise.resolve();
      vi.advanceTimersByTime(100);

      expect(SimulationManager.getInstance).toHaveBeenCalled();
    });

    it('should initialize AlarmService', async () => {
      MissionControlPage.create();

      // Let async init complete
      await Promise.resolve();
      vi.advanceTimersByTime(100);

      expect(AlarmService.getInstance).toHaveBeenCalled();
    });

    it('should call syncEquipmentWithStore', async () => {
      MissionControlPage.create();

      // Let async init complete (multiple awaits for promise chain)
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(100);
      await Promise.resolve();

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


      expect(AlarmService.destroy).toHaveBeenCalled();
    });

    it('should destroy SimulationManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();


      expect(SimulationManager.destroy).toHaveBeenCalled();
    });

    it('should destroy ObjectivesManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      expect(ObjectivesManager.destroy).toHaveBeenCalled();
    });

    it('should reset ScenarioDialogManager', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      expect(ScenarioDialogManager.reset).toHaveBeenCalled();
    });

    it('should destroy QuizModal', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

      expect(QuizModal.destroy).toHaveBeenCalled();
    });

    it('should destroy PendingQuizIndicator', () => {
      MissionControlPage.create();
      MissionControlPage.destroy();

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
      vi.advanceTimersByTime(100);

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping checkpoint load due to forceReplay')
      );
    });
  });
});

describe('MissionControlPage with logged in user', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock; destroy: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock Auth to return logged in
    Auth.isLoggedIn.mockReturnValue(Promise.resolve(true));

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      destroy: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);
    (EventBus.destroy as Mock) = vi.fn();

    // Setup body container
    bodyContainer = document.createElement('div');
    bodyContainer.id = 'body-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    MissionControlPage.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('should attempt to load checkpoint when user is logged in', async () => {
    MissionControlPage.create();

    // Let async init and auth check complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(100);


    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Loading checkpoint for scenario')
    );
  });
});

describe('MissionControlPage existing instance cleanup', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock; destroy: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      destroy: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);
    (EventBus.destroy as Mock) = vi.fn();

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
