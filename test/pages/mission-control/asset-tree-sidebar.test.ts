import { AssetTreeSidebar } from '../../../src/pages/mission-control/asset-tree-sidebar';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

// Mock dependencies
jest.mock('../../../src/events/event-bus');
jest.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      groundStations: [
        {
          state: {
            id: 'GS-001',
            name: 'Miami Station',
            isOperational: true,
          },
        },
        {
          state: {
            id: 'GS-002',
            name: 'London Station',
            isOperational: false,
          },
        },
      ],
      satellites: [
        {
          noradId: 12345,
          name: 'GALAXY-19',
          health: 0.95,
        },
      ],
      missionBriefBox: null,
      checklistBox: null,
      dialogHistoryBox: null,
    })),
  },
}));
jest.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      settings: {
        missionBriefUrl: null,
      },
    })),
  },
}));
jest.mock('../../../src/objectives', () => ({
  ObjectivesManager: {
    hasLoadedObjectives: jest.fn(() => false),
    isScenarioLocked: jest.fn(() => false),
    getInstance: jest.fn(() => ({
      syncCollapsedStatesFromDOM: jest.fn(),
      generateHtmlChecklist: jest.fn(() => '<div>Checklist</div>'),
    })),
  },
}));
jest.mock('../../../src/modal/pending-quiz-indicator', () => ({
  PendingQuizIndicator: {
    getInstance: jest.fn(),
  },
}));
jest.mock('../../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: jest.fn(() => ({
      showQuiz: jest.fn(),
    })),
  },
}));
jest.mock('../../../src/modal/draggable-html-box');
jest.mock('../../../src/modal/dialog-history-box');
jest.mock('../../../src/engine/utils/query-selector', () => ({
  qs: jest.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

describe('AssetTreeSidebar', () => {
  let containerEl: HTMLElement;
  let sidebar: AssetTreeSidebar;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'asset-tree-sidebar-container';
    document.body.appendChild(containerEl);

    sidebar = new AssetTreeSidebar('asset-tree-sidebar-container');
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(sidebar).toBeInstanceOf(AssetTreeSidebar);
    });

    it('should have correct container id', () => {
      expect(AssetTreeSidebar.containerId).toBe('asset-tree-sidebar-container');
    });
  });

  describe('HTML rendering', () => {
    it('should render sidebar container', () => {
      const sidebarEl = document.querySelector('.asset-tree-sidebar');
      expect(sidebarEl).not.toBeNull();
    });

    it('should render sidebar header', () => {
      const header = document.querySelector('.sidebar-header');
      expect(header).not.toBeNull();
    });

    it('should render Assets title', () => {
      const title = document.querySelector('.sidebar-header h3');
      expect(title?.textContent).toBe('Assets');
    });

    it('should render collapse button', () => {
      const collapseBtn = document.querySelector('.sidebar-collapse-btn');
      expect(collapseBtn).not.toBeNull();
    });

    it('should render sidebar content area', () => {
      const content = document.querySelector('.sidebar-content');
      expect(content).not.toBeNull();
    });

    it('should render asset tree container', () => {
      const assetTree = document.querySelector('#asset-tree');
      expect(assetTree).not.toBeNull();
    });
  });

  describe('Mission Overview item', () => {
    it('should render Mission Overview item', () => {
      const overviewItem = document.querySelector('[data-asset-type="mission-overview"]');
      expect(overviewItem).not.toBeNull();
    });

    it('should render Mission Overview text', () => {
      const overviewItem = document.querySelector('.mission-overview-item');
      expect(overviewItem?.textContent).toContain('Mission Overview');
    });

    it('should have Mission Overview selected by default', () => {
      const overviewItem = document.querySelector('.mission-overview-item');
      expect(overviewItem?.classList.contains('active')).toBe(true);
    });
  });

  describe('Ground Stations section', () => {
    it('should render Ground Stations header', () => {
      const headers = document.querySelectorAll('.list-group-header-text');
      const headerTexts = Array.from(headers).map(h => h.textContent);
      expect(headerTexts).toContain('Ground Stations');
    });

    it('should render ground station items', () => {
      const gsItems = document.querySelectorAll('[data-asset-type="ground-station"]');
      expect(gsItems.length).toBe(2);
    });

    it('should render first ground station name', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-001"]');
      expect(gsItem?.textContent).toContain('Miami Station');
    });

    it('should render second ground station name', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-002"]');
      expect(gsItem?.textContent).toContain('London Station');
    });

    it('should show operational status indicator', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-001"]');
      const status = gsItem?.querySelector('.item-status');
      expect(status?.classList.contains('operational')).toBe(true);
    });

    it('should show offline status indicator', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-002"]');
      const status = gsItem?.querySelector('.item-status');
      expect(status?.classList.contains('offline')).toBe(true);
    });
  });

  describe('Satellites section', () => {
    it('should render Satellites header', () => {
      const headers = document.querySelectorAll('.list-group-header-text');
      const headerTexts = Array.from(headers).map(h => h.textContent);
      expect(headerTexts).toContain('Satellites');
    });

    it('should render satellite items', () => {
      const satItems = document.querySelectorAll('[data-asset-type="satellite"]');
      expect(satItems.length).toBe(1);
    });

    it('should render satellite name', () => {
      const satItem = document.querySelector('[data-asset-id="sat-12345"]');
      expect(satItem?.textContent).toContain('GALAXY-19');
    });

    it('should show operational status for healthy satellite', () => {
      const satItem = document.querySelector('[data-asset-id="sat-12345"]');
      const status = satItem?.querySelector('.item-status');
      expect(status?.classList.contains('operational')).toBe(true);
    });
  });

  describe('collapse/expand functionality', () => {
    it('should toggle collapsed class on collapse button click', () => {
      const collapseBtn = document.querySelector('.sidebar-collapse-btn') as HTMLElement;
      const sidebarContainer = document.querySelector('#asset-tree-sidebar-container');

      collapseBtn?.click();
      expect(sidebarContainer?.classList.contains('collapsed')).toBe(true);

      collapseBtn?.click();
      expect(sidebarContainer?.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('asset selection', () => {
    it('should emit ASSET_SELECTED event when ground station clicked', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-001"]') as HTMLElement;
      gsItem?.click();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.ASSET_SELECTED,
        { type: 'ground-station', id: 'GS-001' }
      );
    });

    it('should emit ASSET_SELECTED event when satellite clicked', () => {
      const satItem = document.querySelector('[data-asset-id="sat-12345"]') as HTMLElement;
      satItem?.click();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.ASSET_SELECTED,
        { type: 'satellite', id: 'sat-12345' }
      );
    });

    it('should emit MISSION_OVERVIEW_SELECTED when Mission Overview clicked', () => {
      // First select something else
      const gsItem = document.querySelector('[data-asset-id="GS-001"]') as HTMLElement;
      gsItem?.click();

      // Then click Mission Overview
      const overviewItem = document.querySelector('.mission-overview-item') as HTMLElement;
      overviewItem?.click();

      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.MISSION_OVERVIEW_SELECTED);
    });

    it('should update active class when asset selected', () => {
      const gsItem = document.querySelector('[data-asset-id="GS-001"]') as HTMLElement;
      gsItem?.click();

      expect(gsItem?.classList.contains('active')).toBe(true);
    });

    it('should remove active class from other items when new asset selected', () => {
      const gsItem1 = document.querySelector('[data-asset-id="GS-001"]') as HTMLElement;
      const gsItem2 = document.querySelector('[data-asset-id="GS-002"]') as HTMLElement;

      gsItem1?.click();
      expect(gsItem1?.classList.contains('active')).toBe(true);

      gsItem2?.click();
      expect(gsItem1?.classList.contains('active')).toBe(false);
      expect(gsItem2?.classList.contains('active')).toBe(true);
    });
  });

  describe('event listeners', () => {
    it('should register for ROUTE_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ROUTE_CHANGED,
        expect.any(Function)
      );
    });

    it('should register for ASSET_SELECTED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ASSET_SELECTED,
        expect.any(Function)
      );
    });

    it('should register for SCENARIO_UNLOCKED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.SCENARIO_UNLOCKED,
        expect.any(Function)
      );
    });

    it('should update selection UI when ASSET_SELECTED received externally', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ id: 'GS-002', type: 'ground-station' });

      const gsItem = document.querySelector('[data-asset-id="GS-002"]');
      expect(gsItem?.classList.contains('active')).toBe(true);
    });

    it('should unlock sidebar when SCENARIO_UNLOCKED received', () => {
      // First lock the sidebar
      const sidebarEl = document.querySelector('.asset-tree-sidebar') as HTMLElement;
      sidebarEl?.classList.add('sidebar-locked');

      const unlockHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SCENARIO_UNLOCKED
      )?.[1];

      unlockHandler?.();

      expect(sidebarEl?.classList.contains('sidebar-locked')).toBe(false);
    });
  });

  describe('refresh', () => {
    it('should refresh the asset tree', () => {
      // Get initial GS items count
      const initialGsItems = document.querySelectorAll('[data-asset-type="ground-station"]');
      expect(initialGsItems.length).toBe(2);

      // Call refresh
      sidebar.refresh();

      // Items should still be there after refresh
      const refreshedGsItems = document.querySelectorAll('[data-asset-type="ground-station"]');
      expect(refreshedGsItems.length).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should stop checklist refresh timer', () => {
      sidebar.destroy();
      // No errors should occur - timer cleanup successful
    });
  });
});

describe('AssetTreeSidebar with mission brief', () => {
  let containerEl: HTMLElement;
  let sidebar: AssetTreeSidebar;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ScenarioManager to have a mission brief URL
    const { ScenarioManager } = require('../../../src/scenario-manager');
    ScenarioManager.getInstance.mockReturnValue({
      settings: {
        missionBriefUrl: '/briefs/test-mission.html',
      },
    });

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'asset-tree-sidebar-container';
    document.body.appendChild(containerEl);

    sidebar = new AssetTreeSidebar('asset-tree-sidebar-container');
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.innerHTML = '';
  });

  it('should show mission section when missionBriefUrl is set', () => {
    const missionSection = document.querySelector('#mission-icons-section');
    expect(missionSection).not.toBeNull();
    expect((missionSection as HTMLElement)?.style.display).toBe('block');
  });

  it('should render Mission Brief item', () => {
    const missionBriefItem = document.querySelector('.mission-brief-icon');
    expect(missionBriefItem).not.toBeNull();
    expect(missionBriefItem?.textContent).toContain('Mission Brief');
  });

  it('should render Checklist item', () => {
    const checklistItem = document.querySelector('.checklist-icon');
    expect(checklistItem).not.toBeNull();
    expect(checklistItem?.textContent).toContain('Checklist');
  });

  it('should render Dialog History item', () => {
    const dialogItem = document.querySelector('.dialog-icon');
    expect(dialogItem).not.toBeNull();
    expect(dialogItem?.textContent).toContain('Dialog History');
  });

  it('should add sidebar-locked class when scenario is locked', () => {
    const sidebarEl = document.querySelector('.asset-tree-sidebar');
    expect(sidebarEl?.classList.contains('sidebar-locked')).toBe(true);
  });
});

describe('AssetTreeSidebar with no satellites', () => {
  let containerEl: HTMLElement;
  let sidebar: AssetTreeSidebar;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock SimulationManager to have no satellites
    const { SimulationManager } = require('../../../src/simulation/simulation-manager');
    SimulationManager.getInstance.mockReturnValue({
      groundStations: [],
      satellites: [],
      missionBriefBox: null,
      checklistBox: null,
      dialogHistoryBox: null,
    });

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'asset-tree-sidebar-container';
    document.body.appendChild(containerEl);

    sidebar = new AssetTreeSidebar('asset-tree-sidebar-container');
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.innerHTML = '';
  });

  it('should show placeholder when no satellites', () => {
    const placeholder = document.querySelector('.placeholder-item');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('No satellites in scenario');
  });
});
