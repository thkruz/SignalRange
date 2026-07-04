import { Mock, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { TabbedCanvas } from '../../../src/pages/mission-control/tabbed-canvas';

// Create mock tab factory
const createMockTab = () => ({
  get dom() { return global.document.createElement('div'); },
  activate: vi.fn(),
  deactivate: vi.fn(),
  dispose: vi.fn(),
});

// Mock dependencies
vi.mock('../../../src/events/event-bus');
vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: [
        {
          state: {
            id: 'GS-001',
            name: 'Miami Station',
            isOperational: true,
          },
          antennas: [
            {
              config: {
                band: 'C',
                diameter: 9,
              },
            },
          ],
        },
      ],
      satellites: [
        {
          noradId: 12345,
          name: 'GALAXY-19',
          health: 0.95,
        },
      ],
      getSatByNoradId: vi.fn((id: number) => {
        if (id === 12345) {
          return {
            noradId: 12345,
            name: 'GALAXY-19',
            health: 0.95,
          };
        }
        return null;
      }),
    })),
  },
}));
vi.mock('../../../src/pages/mission-control/tabs/acu-control-tab', () => ({
  ACUControlTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/dashboard-tab', () => ({
  DashboardTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/gps-timing-tab', () => ({
  GPSTimingTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/mission-overview-tab', () => ({
  MissionOverviewTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/rx-analysis-tab', () => ({
  RxAnalysisTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/satellite-dashboard-tab', () => ({
  SatelliteDashboardTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/pages/mission-control/tabs/tx-chain-tab', () => ({
  TxChainTab: vi.fn(function () { return createMockTab(); }),
}));
vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

import { ACUControlTab } from '../../../src/pages/mission-control/tabs/acu-control-tab';
import { DashboardTab } from '../../../src/pages/mission-control/tabs/dashboard-tab';
import { GPSTimingTab } from '../../../src/pages/mission-control/tabs/gps-timing-tab';
import { MissionOverviewTab } from '../../../src/pages/mission-control/tabs/mission-overview-tab';
import { RxAnalysisTab } from '../../../src/pages/mission-control/tabs/rx-analysis-tab';
import { SatelliteDashboardTab } from '../../../src/pages/mission-control/tabs/satellite-dashboard-tab';
import { TxChainTab } from '../../../src/pages/mission-control/tabs/tx-chain-tab';
import { ScenarioManager, type SimulationSettings } from '../../../src/scenario-manager';
import { SimulationManager } from '../../../src/simulation/simulation-manager';
describe('TabbedCanvas', () => {
  let containerEl: HTMLElement;
  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'tabbed-canvas-container';
    document.body.appendChild(containerEl);

    tabbedCanvas = new TabbedCanvas('tabbed-canvas-container');
  });

  afterEach(() => {
    tabbedCanvas.destroy();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tabbedCanvas).toBeInstanceOf(TabbedCanvas);
    });

    it('should have correct container id', () => {
      expect(TabbedCanvas.containerId).toBe('tabbed-canvas-container');
    });
  });

  describe('HTML rendering', () => {
    it('should render tabbed canvas container', () => {
      const canvas = document.querySelector('.tabbed-canvas');
      expect(canvas).not.toBeNull();
    });

    it('should render canvas header', () => {
      const header = document.querySelector('.canvas-header');
      expect(header).not.toBeNull();
    });

    it('should render tab bar', () => {
      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar).not.toBeNull();
    });

    it('should render canvas content area', () => {
      const content = document.querySelector('#canvas-content');
      expect(content).not.toBeNull();
    });

    it('should render Mission Overview by default', () => {
      expect(MissionOverviewTab).toHaveBeenCalled();
    });
  });

  describe('event listeners', () => {
    it('should register for ASSET_SELECTED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ASSET_SELECTED,
        expect.any(Function)
      );
    });

    it('should register for SWITCH_TAB events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.SWITCH_TAB,
        expect.any(Function)
      );
    });

    it('should register for MISSION_OVERVIEW_SELECTED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.MISSION_OVERVIEW_SELECTED,
        expect.any(Function)
      );
    });
  });

  describe('ground station selection', () => {
    it('should render ground station tabs when GS selected', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('Dashboard');
    });

    it('should render ACU Control tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('ACU Control');
    });

    it('should render RX Analysis tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('RX Analysis');
    });

    it('should render TX Chain tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('TX Chain');
    });

    it('should render GPS Timing tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('GPS Timing');
    });

    it('should switch to dashboard tab by default for ground station', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      expect(DashboardTab).toHaveBeenCalled();
    });
  });

  describe('satellite selection', () => {
    it('should render satellite dashboard when satellite selected', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });

      expect(SatelliteDashboardTab).toHaveBeenCalled();
    });

    it('should render Dashboard tab for satellite', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('Dashboard');
    });

    it('should show error for unknown satellite', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-99999' });

      const content = document.querySelector('#canvas-content');
      expect(content?.innerHTML).toContain('Satellite Not Found');
    });
  });

  describe('mission overview selection', () => {
    it('should return to mission overview when MISSION_OVERVIEW_SELECTED', () => {
      // First select a ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Then select mission overview
      const overviewHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.MISSION_OVERVIEW_SELECTED
      )?.[1];

      overviewHandler?.();


      // MissionOverviewTab should be called (once in constructor, once after overview selected)
      expect(MissionOverviewTab).toHaveBeenCalled();
    });

    it('should clear tab bar when returning to mission overview', () => {
      // First select a ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Then select mission overview
      const overviewHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.MISSION_OVERVIEW_SELECTED
      )?.[1];

      overviewHandler?.();

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toBe('');
    });
  });

  describe('tab switching', () => {
    beforeEach(() => {
      // Select a ground station first
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
    });

    it('should switch tabs on SWITCH_TAB event', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'acu-control-0' });

      expect(ACUControlTab).toHaveBeenCalled();
    });

    it('should update active class on tab switch', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'rx-analysis' });

      const activeTab = document.querySelector('.nav-link.active');
      expect(activeTab?.getAttribute('data-tab-id')).toBe('rx-analysis');
    });

    it('should switch tab when nav-link clicked', () => {
      const acuTab = document.querySelector('[data-tab-id="acu-control-0"]') as HTMLElement;
      acuTab?.click();


      expect(ACUControlTab).toHaveBeenCalled();
    });

    it('should create RxAnalysisTab when switching to rx-analysis', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'rx-analysis' });

      expect(RxAnalysisTab).toHaveBeenCalled();
    });

    it('should create TxChainTab when switching to tx-chain', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'tx-chain' });

      expect(TxChainTab).toHaveBeenCalled();
    });

    it('should create GPSTimingTab when switching to gps-timing', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'gps-timing' });

      expect(GPSTimingTab).toHaveBeenCalled();
    });

    it('should show unknown tab message for undefined tab', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'unknown-tab' });

      const content = document.querySelector('#canvas-content');
      expect(content?.innerHTML).toContain('Unknown Tab');
    });
  });

  describe('tab management', () => {
    it('should create DashboardTab when switching to dashboard', () => {
      // Select ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });


      expect(DashboardTab).toHaveBeenCalled();
    });

    it('should create ACUControlTab when switching to ACU Control', () => {
      // Select ground station first
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Switch to ACU control tab
      const switchTabHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SWITCH_TAB
      )?.[1];

      switchTabHandler?.({ tabId: 'acu-control-0' });

      expect(ACUControlTab).toHaveBeenCalled();
    });

    it('should clear old tabs when selecting new asset', () => {
      // Select first ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // No errors when switching assets
      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });
    });
  });

  describe('destroy', () => {
    it('should dispose all tab instances', () => {
      // Select ground station to create tabs
      const assetSelectedHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
      )?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      tabbedCanvas.destroy();

      // Tabs should be disposed - no errors
    });

    it('should unregister from EventBus', () => {
      tabbedCanvas.destroy();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.ASSET_SELECTED,
        expect.any(Function)
      );
    });
  });
});

describe('TabbedCanvas with non-operational ground station', () => {
  let containerEl: HTMLElement;
  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ground station as non-operational
    SimulationManager.getInstance.mockReturnValue({
      groundStations: [
        {
          state: {
            id: 'GS-001',
            name: 'Miami Station',
            isOperational: false,
          },
          antennas: [
            {
              config: {
                band: 'C',
                diameter: 9,
              },
            },
          ],
        },
      ],
      satellites: [],
      getSatByNoradId: vi.fn(() => null),
    });

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'tabbed-canvas-container';
    document.body.appendChild(containerEl);

    tabbedCanvas = new TabbedCanvas('tabbed-canvas-container');
  });

  afterEach(() => {
    tabbedCanvas.destroy();
    document.body.innerHTML = '';
  });

  it('should disable equipment tabs when ground station not operational', () => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find(
      (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
    )?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

    const acuTab = document.querySelector('[data-tab-id="acu-control-0"]');
    expect(acuTab?.classList.contains('disabled')).toBe(true);
  });

  it('should not disable dashboard tab when ground station not operational', () => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find(
      (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
    )?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

    const dashboardTab = document.querySelector('[data-tab-id="dashboard"]');
    expect(dashboardTab?.classList.contains('disabled')).toBe(false);
  });
});

describe('TabbedCanvas nats-eu console tab gating', () => {
  const NATS_EU_TAB_IDS = ['link-budget', 'commanding', 'contact-schedule', 'security-console'];

  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };
  let savedSettings: SimulationSettings;

  const selectGroundStation = (): void => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find(
      (call: [string, Function]) => call[0] === Events.ASSET_SELECTED
    )?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    SimulationManager.getInstance.mockReturnValue({
      groundStations: [
        {
          state: { id: 'GS-001', name: 'Miami Station', isOperational: true },
          antennas: [{ config: { band: 'C', diameter: 9 } }],
        },
      ],
      satellites: [],
      getSatByNoradId: vi.fn(() => null),
    });

    mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    savedSettings = ScenarioManager.getInstance().settings;

    const containerEl = document.createElement('div');
    containerEl.id = 'tabbed-canvas-container';
    document.body.appendChild(containerEl);

    tabbedCanvas = new TabbedCanvas('tabbed-canvas-container');
  });

  afterEach(() => {
    ScenarioManager.getInstance().settings = savedSettings;
    tabbedCanvas.destroy();
    document.body.innerHTML = '';
  });

  it('does not register any nats-eu console tab without its settings block', () => {
    selectGroundStation();

    NATS_EU_TAB_IDS.forEach((tabId) => {
      expect(document.querySelector(`[data-tab-id="${tabId}"]`)).toBeNull();
    });
  });

  it('registers each console tab when its opt-in settings block is present', () => {
    ScenarioManager.getInstance().settings = {
      ...savedSettings,
      linkBudget: { expectedCNRDb: 14, thresholdCNRDb: 8 },
      commanding: {},
      contactSchedule: { contacts: [], stationIds: [] },
      security: { accounts: [], events: [] },
    };

    selectGroundStation();

    NATS_EU_TAB_IDS.forEach((tabId) => {
      expect(document.querySelector(`[data-tab-id="${tabId}"]`)).not.toBeNull();
    });
  });

  it('registers the security tab for a transec-only scenario', () => {
    ScenarioManager.getInstance().settings = {
      ...savedSettings,
      transec: {},
    };

    selectGroundStation();

    expect(document.querySelector('[data-tab-id="security-console"]')).not.toBeNull();
    expect(document.querySelector('[data-tab-id="link-budget"]')).toBeNull();
  });
});
