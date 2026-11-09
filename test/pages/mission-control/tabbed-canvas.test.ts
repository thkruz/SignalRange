import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { Mock, vi } from 'vitest';
import { OrbitalSatellite } from '../../../src/equipment/satellite/orbital-satellite';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { TabbedCanvas } from '../../../src/pages/mission-control/tabbed-canvas';

/** A genuinely SGP4-propagated satellite, for the instanceof-based tab gates. */
const ORBITAL_SAT = new OrbitalSatellite('TEST-LEO', 61701, [], [], {
  tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1,
  tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2,
  observer: { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers },
});

// Create mock tab factory
const createMockTab = () => ({
  get dom() {
    return global.document.createElement('div');
  },
  activate: vi.fn(),
  deactivate: vi.fn(),
  dispose: vi.fn(),
});

/**
 * Satellites the mocked SimulationManager reports. Mutable so the ground-track
 * gating tests can swap in a real OrbitalSatellite (the gate is an
 * `instanceof` check, so a plain object is deliberately not enough).
 */
const DEFAULT_SATELLITES = [
  {
    noradId: 12345,
    name: 'GALAXY-19',
    health: 0.95,
  },
];
let mockSatellites: unknown[] = DEFAULT_SATELLITES;
/** Antenna kind the mocked ground station reports (undefined = reflector). */
let mockAntennaKind: string | undefined;

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
                get kind() {
                  return mockAntennaKind;
                },
              },
            },
          ],
        },
      ],
      get satellites() {
        return mockSatellites;
      },
      getSatByNoradId: vi.fn((id: number) => (mockSatellites as Array<{ noradId: number }>).find((sat) => sat.noradId === id) ?? null),
    })),
  },
}));
vi.mock('../../../src/pages/mission-control/tabs/acu-control-tab', () => ({
  ACUControlTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/dashboard-tab', () => ({
  DashboardTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/gps-timing-tab', () => ({
  GPSTimingTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/ground-track-tab', () => ({
  GroundTrackTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/mission-overview-tab', () => ({
  MissionOverviewTab: Object.assign(
    vi.fn(function () {
      return createMockTab();
    }),
    { rememberStation: vi.fn(), resetRememberedStation: vi.fn() }
  ),
}));
vi.mock('../../../src/pages/mission-control/tabs/rx-analysis-tab', () => ({
  RxAnalysisTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/satellite-dashboard-tab', () => ({
  SatelliteDashboardTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/pages/mission-control/tabs/tx-chain-tab', () => ({
  TxChainTab: vi.fn(function () {
    return createMockTab();
  }),
}));
vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

import { ModalConfirm } from '../../../src/engine/ui/modal-confirm';
import { AntennaPageRegistry } from '../../../src/pages/mission-control/antenna-page-registry';
import { ACUControlTab } from '../../../src/pages/mission-control/tabs/acu-control-tab';
import { DashboardTab } from '../../../src/pages/mission-control/tabs/dashboard-tab';
import { GPSTimingTab } from '../../../src/pages/mission-control/tabs/gps-timing-tab';
import { GroundTrackTab } from '../../../src/pages/mission-control/tabs/ground-track-tab';
import { MissionOverviewTab } from '../../../src/pages/mission-control/tabs/mission-overview-tab';
import { RxAnalysisTab } from '../../../src/pages/mission-control/tabs/rx-analysis-tab';
import { SatelliteDashboardTab } from '../../../src/pages/mission-control/tabs/satellite-dashboard-tab';
import { TxChainTab } from '../../../src/pages/mission-control/tabs/tx-chain-tab';
import { FieldTabPolicy } from '../../../src/physical/field-tab-policy';
import { PhysicalPlantService } from '../../../src/physical/physical-plant-service';
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
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.ASSET_SELECTED, expect.any(Function));
    });

    it('should register for SWITCH_TAB events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SWITCH_TAB, expect.any(Function));
    });

    it('should register for MISSION_OVERVIEW_SELECTED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.MISSION_OVERVIEW_SELECTED, expect.any(Function));
    });
  });

  describe('ground station selection', () => {
    it('remembers the selected station for the Overview and forgets it on teardown (phase 31 D16)', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
      expect(MissionOverviewTab.rememberStation).toHaveBeenCalledWith('GS-001');

      tabbedCanvas.destroy();
      expect(MissionOverviewTab.resetRememberedStation).toHaveBeenCalled();
    });

    it('should render ground station tabs when GS selected', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('Dashboard');
    });

    it('should render ACU Control tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('ACU Control');
    });

    it('should render RX Analysis tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('RX Analysis');
    });

    it('should render TX Chain tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('TX Chain');
    });

    it('should render GPS Timing tab', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('GPS Timing');
    });

    it('should switch to dashboard tab by default for ground station', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      expect(DashboardTab).toHaveBeenCalled();
    });
  });

  describe('satellite selection', () => {
    it('should render satellite dashboard when satellite selected', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });

      expect(SatelliteDashboardTab).toHaveBeenCalled();
    });

    it('should render Dashboard tab for satellite', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toContain('Dashboard');
    });

    it('should show error for unknown satellite', () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'satellite', id: 'sat-99999' });

      const content = document.querySelector('#canvas-content');
      expect(content?.innerHTML).toContain('Satellite Not Found');
    });
  });

  /**
   * The Ground Track tab is gated on the satellite actually being SGP4
   * propagated - a fixed/GEO-modeled satellite has no sub-point path worth
   * drawing, so it must not appear for one.
   */
  describe('ground track tab gating', () => {
    const selectSatellite = (id: string): void => {
      const handler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      handler?.({ type: 'satellite', id });
    };

    const selectOverview = (): void => {
      const handler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.MISSION_OVERVIEW_SELECTED)?.[1];

      handler?.();
    };

    afterEach(() => {
      mockSatellites = DEFAULT_SATELLITES;
    });

    it('is absent for a non-orbital satellite', () => {
      selectSatellite('sat-12345');

      expect(document.querySelector('#tab-bar')?.innerHTML).not.toContain('Ground Track');
    });

    it('is offered for an SGP4-propagated satellite', () => {
      mockSatellites = [ORBITAL_SAT];
      selectSatellite(`sat-${ORBITAL_SAT.noradId}`);

      expect(document.querySelector('#tab-bar')?.innerHTML).toContain('Ground Track');
    });

    it('constructs the tab focused on the selected satellite when switched to', () => {
      mockSatellites = [ORBITAL_SAT];
      selectSatellite(`sat-${ORBITAL_SAT.noradId}`);

      const switchHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchHandler?.({ tabId: 'ground-track' });

      expect(GroundTrackTab).toHaveBeenCalledWith('canvas-content', ORBITAL_SAT);
    });

    it('adds a World Map tab to mission overview when orbital sats exist', () => {
      mockSatellites = [ORBITAL_SAT];
      selectOverview();

      const tabBar = document.querySelector('#tab-bar');

      expect(tabBar?.innerHTML).toContain('World Map');
      expect(tabBar?.innerHTML).toContain('Overview');
    });

    it('leaves mission overview tab-less without orbital sats', () => {
      selectOverview();

      expect(document.querySelector('#tab-bar')?.innerHTML).toBe('');
    });

    it('marks the overview tab active when returning from an asset', () => {
      mockSatellites = [ORBITAL_SAT];
      selectSatellite(`sat-${ORBITAL_SAT.noradId}`);
      selectOverview();

      expect(document.querySelector('.nav-link.active')?.getAttribute('data-tab-id')).toBe('mission-overview');
    });

    it('reopens the overview on the World Map when it was left there', () => {
      mockSatellites = [ORBITAL_SAT];
      selectOverview();

      const switchHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchHandler?.({ tabId: 'ground-track' });
      selectSatellite(`sat-${ORBITAL_SAT.noradId}`);
      selectOverview();

      expect(document.querySelector('.nav-link.active')?.getAttribute('data-tab-id')).toBe('ground-track');
    });
  });

  describe('mission overview selection', () => {
    it('should return to mission overview when MISSION_OVERVIEW_SELECTED', () => {
      // First select a ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Then select mission overview
      const overviewHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.MISSION_OVERVIEW_SELECTED)?.[1];

      overviewHandler?.();

      // MissionOverviewTab should be called (once in constructor, once after overview selected)
      expect(MissionOverviewTab).toHaveBeenCalled();
    });

    it('should clear tab bar when returning to mission overview', () => {
      // First select a ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Then select mission overview
      const overviewHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.MISSION_OVERVIEW_SELECTED)?.[1];

      overviewHandler?.();

      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar?.innerHTML).toBe('');
    });
  });

  describe('antenna pages', () => {
    const selectStation = () => {
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
    };
    const switchTo = (tabId: string) => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId });
    };

    afterEach(() => {
      mockAntennaKind = undefined;
      AntennaPageRegistry.destroy();
    });

    it('uses a registered page, its label and its lifecycle for a matching kind', () => {
      const page = { ...createMockTab(), tabLabel: 'Array Control' };
      const factory = vi.fn(() => page);

      AntennaPageRegistry.getInstance().register('phased-array', factory, { tabLabel: 'Array Control' });
      mockAntennaKind = 'phased-array';
      selectStation();
      expect(document.querySelector('#tab-bar')?.innerHTML).toContain('Array Control');

      switchTo('acu-control-0');

      expect(factory).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ id: 'GS-001' }) }), 'canvas-content', 0);
      expect(page.activate).toHaveBeenCalled();
      expect(ACUControlTab).not.toHaveBeenCalled();
    });

    it('keeps ACU Control for reflector antennas even when other kinds are registered', () => {
      const factory = vi.fn(() => ({ ...createMockTab(), tabLabel: 'Array Control' }));

      AntennaPageRegistry.getInstance().register('phased-array', factory);
      selectStation();
      expect(document.querySelector('#tab-bar')?.innerHTML).toContain('ACU Control');

      switchTo('acu-control-0');

      expect(ACUControlTab).toHaveBeenCalled();
      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('tab switching', () => {
    beforeEach(() => {
      // Select a ground station first
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
    });

    it('should switch tabs on SWITCH_TAB event', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'acu-control-0' });

      expect(ACUControlTab).toHaveBeenCalled();
    });

    it('should update active class on tab switch', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

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
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'rx-analysis' });

      expect(RxAnalysisTab).toHaveBeenCalled();
    });

    it('should create TxChainTab when switching to tx-chain', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'tx-chain' });

      expect(TxChainTab).toHaveBeenCalled();
    });

    it('should create GPSTimingTab when switching to gps-timing', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'gps-timing' });

      expect(GPSTimingTab).toHaveBeenCalled();
    });

    it('should show unknown tab message for undefined tab', () => {
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'unknown-tab' });

      const content = document.querySelector('#canvas-content');
      expect(content?.innerHTML).toContain('Unknown Tab');
    });
  });

  /**
   * Selecting an asset used to leave the tab bar with no `active` class at all
   * (the class was stamped from the *previous* asset's tab id), and always
   * reset the operator to the asset's first tab.
   */
  describe('active tab across asset switches', () => {
    const selectAsset = (type: 'ground-station' | 'satellite', id: string): void => {
      const handler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      handler?.({ type, id });
    };

    const switchTab = (tabId: string): void => {
      const handler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      handler?.({ tabId });
    };

    const activeTabId = (): string | null | undefined => document.querySelector('.nav-link.active')?.getAttribute('data-tab-id');

    it('marks a tab active after switching from a ground station to a satellite', () => {
      selectAsset('ground-station', 'GS-001');
      selectAsset('satellite', 'sat-12345');

      expect(activeTabId()).toBe('sat-dashboard');
    });

    it('marks exactly one tab active', () => {
      selectAsset('ground-station', 'GS-001');
      switchTab('tx-chain');

      expect(document.querySelectorAll('.nav-link.active')).toHaveLength(1);
    });

    it('reopens a ground station on the tab it was left on', () => {
      selectAsset('ground-station', 'GS-001');
      switchTab('rx-analysis');

      selectAsset('satellite', 'sat-12345');
      selectAsset('ground-station', 'GS-001');

      expect(activeTabId()).toBe('rx-analysis');
      expect(RxAnalysisTab).toHaveBeenCalledTimes(2);
    });

    it('remembers each asset independently', () => {
      selectAsset('ground-station', 'GS-001');
      switchTab('gps-timing');

      // The satellite has its own (unset) memory, so it opens at its default.
      selectAsset('satellite', 'sat-12345');
      expect(activeTabId()).toBe('sat-dashboard');

      selectAsset('ground-station', 'GS-001');
      expect(activeTabId()).toBe('gps-timing');
    });

    it('falls back to the default tab when the remembered tab is gone', () => {
      selectAsset('ground-station', 'GS-001');
      switchTab('rx-analysis');

      // A satellite has no rx-analysis tab; it must not be left with none active.
      selectAsset('satellite', 'sat-12345');

      expect(activeTabId()).toBe('sat-dashboard');
      expect(SatelliteDashboardTab).toHaveBeenCalled();
    });
  });

  describe('tab management', () => {
    it('should create DashboardTab when switching to dashboard', () => {
      // Select ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      expect(DashboardTab).toHaveBeenCalled();
    });

    it('should create ACUControlTab when switching to ACU Control', () => {
      // Select ground station first
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // Switch to ACU control tab
      const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

      switchTabHandler?.({ tabId: 'acu-control-0' });

      expect(ACUControlTab).toHaveBeenCalled();
    });

    it('should clear old tabs when selecting new asset', () => {
      // Select first ground station
      const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      // No errors when switching assets
      assetSelectedHandler?.({ type: 'satellite', id: 'sat-12345' });
    });
  });

  describe('destroy', () => {
    const registeredHandler = (event: Events): Function | undefined => mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === event)?.[1];

    it('should dispose all tab instances', () => {
      // Select ground station to create tabs
      const assetSelectedHandler = registeredHandler(Events.ASSET_SELECTED);

      assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

      const dashboardInstance = (DashboardTab as unknown as Mock).mock.results[0].value;

      tabbedCanvas.destroy();

      expect(dashboardInstance.dispose).toHaveBeenCalled();
    });

    it('should unregister from EventBus', () => {
      tabbedCanvas.destroy();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.ASSET_SELECTED, expect.any(Function));
    });

    /**
     * EventBus.off() matches by function identity, so unsubscribing anything
     * other than the exact callback that was registered is a silent no-op.
     */
    it.each([Events.ASSET_SELECTED, Events.SWITCH_TAB, Events.MISSION_OVERVIEW_SELECTED])('unsubscribes the exact handler it registered for %s', (event) => {
      const handler = registeredHandler(event);

      expect(handler).toBeDefined();

      tabbedCanvas.destroy();

      expect(mockEventBus.off).toHaveBeenCalledWith(event, handler);
    });

    it('stops reporting an active tab once destroyed', () => {
      registeredHandler(Events.ASSET_SELECTED)?.({ type: 'ground-station', id: 'GS-001' });
      expect(TabbedCanvas.getActiveTab()).toBe('dashboard');

      tabbedCanvas.destroy();

      expect(TabbedCanvas.getActiveTab()).toBeNull();
    });

    it('does not clear a replacement canvas when an old one is destroyed', () => {
      const replacement = new TabbedCanvas('tabbed-canvas-container');

      tabbedCanvas.destroy();

      expect(TabbedCanvas.getActiveTab()).toBe('mission-overview');

      // Let afterEach tear the live one down.
      tabbedCanvas = replacement;
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
    const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

    const acuTab = document.querySelector('[data-tab-id="acu-control-0"]');
    expect(acuTab?.classList.contains('disabled')).toBe(true);
  });

  it('should not disable dashboard tab when ground station not operational', () => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

    const dashboardTab = document.querySelector('[data-tab-id="dashboard"]');
    expect(dashboardTab?.classList.contains('disabled')).toBe(false);
  });

  it('does not reopen a remembered tab that is now disabled', () => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];
    const switchTabHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];

    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });
    switchTabHandler?.({ tabId: 'rx-analysis' });

    // Reselecting must not drop the operator back into a disabled console.
    assetSelectedHandler?.({ type: 'ground-station', id: 'GS-001' });

    expect(document.querySelector('.nav-link.active')?.getAttribute('data-tab-id')).toBe('dashboard');
  });
});

describe('TabbedCanvas nats-eu console tab gating', () => {
  const NATS_EU_TAB_IDS = ['link-budget', 'commanding', 'contact-schedule', 'security-console'];

  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };
  let savedSettings: SimulationSettings;

  const selectGroundStation = (): void => {
    const assetSelectedHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

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

describe('TabbedCanvas outside-the-tent guard', () => {
  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };
  let outside = false;
  const plant = {
    isOutside: () => outside,
    returnInside: vi.fn(() => {
      outside = false;
    }),
  };
  let confirmOpen: ReturnType<typeof vi.spyOn>;

  const switchHandler = () => mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];
  const activeTabId = () => document.querySelector('.nav-link.active')?.getAttribute('data-tab-id');

  beforeEach(() => {
    vi.clearAllMocks();
    outside = false;
    mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);
    const el = document.createElement('div');
    el.id = 'tabbed-canvas-container';
    document.body.appendChild(el);
    tabbedCanvas = new TabbedCanvas('tabbed-canvas-container');
    mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1]({ type: 'ground-station', id: 'GS-001' });
    confirmOpen = vi.spyOn(ModalConfirm.getInstance(), 'open').mockImplementation(() => undefined);
  });

  afterEach(() => {
    tabbedCanvas.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('is a no-op without a plant', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(null);
    switchHandler()?.({ tabId: 'rx-analysis' });
    expect(confirmOpen).not.toHaveBeenCalled();
    expect(activeTabId()).toBe('rx-analysis');
  });

  it('does not gate while the player is inside', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(plant as never);
    switchHandler()?.({ tabId: 'rx-analysis' });
    expect(confirmOpen).not.toHaveBeenCalled();
    expect(activeTabId()).toBe('rx-analysis');
  });

  it('blocks the switch while outside, and Go inside returns then switches', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(plant as never);
    const before = activeTabId();
    outside = true;
    switchHandler()?.({ tabId: 'rx-analysis' });
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    const [onConfirm, options] = confirmOpen.mock.calls[0] as [() => void, { message: string; confirmText: string; cancelText: string }];
    expect(options.message).toBe("You're outside. The laptop and equipment are in the tent.");
    expect(options.confirmText).toBe('Go inside');
    expect(options.cancelText).toBe('Stay outside');
    expect(activeTabId()).toBe(before);
    expect(plant.returnInside).not.toHaveBeenCalled();
    onConfirm();
    expect(plant.returnInside).toHaveBeenCalledTimes(1);
    expect(activeTabId()).toBe('rx-analysis');
  });

  it('gates a sidebar asset switch while outside, then switches after Go inside', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(plant as never);
    const assetHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];
    outside = true;
    mockEventBus.emit.mockClear();
    assetHandler({ type: 'ground-station', id: 'GS-002' });
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    // Sidebar highlight is pushed back to the asset still on screen
    expect(mockEventBus.emit).toHaveBeenCalledWith(Events.ASSET_SELECTED, { type: 'ground-station', id: 'GS-001' });
    mockEventBus.emit.mockClear();
    const [onConfirm] = confirmOpen.mock.calls[0] as [() => void];

    onConfirm();
    expect(plant.returnInside).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledWith(Events.ASSET_SELECTED, { type: 'ground-station', id: 'GS-002' });
  });

  it('does not gate a sidebar asset switch while inside', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(plant as never);
    const assetHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1];

    assetHandler({ type: 'ground-station', id: 'GS-002' });
    expect(confirmOpen).not.toHaveBeenCalled();
  });

  it('blocks nav-link clicks while outside', () => {
    vi.spyOn(PhysicalPlantService, 'plantOrNull').mockReturnValue(plant as never);
    const before = activeTabId();
    outside = true;
    (document.querySelector('[data-tab-id="rx-analysis"]') as HTMLElement).click();
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    expect(activeTabId()).toBe(before);
  });
});

describe('TabbedCanvas field station tab policy', () => {
  let tabbedCanvas: TabbedCanvas;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };
  let savedSettings: SimulationSettings;

  const tabIds = (): string[] => Array.from(document.querySelectorAll('#tab-bar .nav-link')).map((el) => el.getAttribute('data-tab-id') ?? '');
  const activeTabId = () => document.querySelector('.nav-link.active')?.getAttribute('data-tab-id');
  const selectStation = (): void => {
    mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ASSET_SELECTED)?.[1]({ type: 'ground-station', id: 'GS-001' });
  };
  const switchHandler = () => mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SWITCH_TAB)?.[1];
  const setSettings = (extra: Partial<SimulationSettings>): void => {
    ScenarioManager.getInstance().settings = { ...savedSettings, physicalPlant: {} as never, ...extra };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    FieldTabPolicy.reset();
    AntennaPageRegistry.destroy();
    SimulationManager.getInstance.mockReturnValue({
      groundStations: [
        {
          state: { id: 'GS-001', name: 'Field Post', isOperational: true, stationClass: 'field' },
          antennas: [{ config: { band: 'Ku', diameter: 1.2 } }],
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
    FieldTabPolicy.reset();
    AntennaPageRegistry.destroy();
    document.body.innerHTML = '';
  });

  it('shows only the Site tab by default', () => {
    setSettings({});
    selectStation();
    expect(tabIds()).toEqual(['site']);
    expect(activeTabId()).toBe('site');
  });

  it('adds scenario-allowed engineering tabs', () => {
    setSettings({ fieldTabs: ['rx-analysis', 'acu-control'] });
    selectStation();
    expect(tabIds()).toEqual(['site', 'acu-control-0', 'rx-analysis']);
  });

  it('ignores event-driven switches to hidden tabs', () => {
    setSettings({});
    selectStation();
    switchHandler()?.({ tabId: 'rx-analysis' });
    expect(activeTabId()).toBe('site');
  });

  it('restores the full engineering set when the trainer unlocks, and relocks', () => {
    setSettings({});
    selectStation();
    FieldTabPolicy.setEngineeringUnlocked(true);
    expect(tabIds()).toEqual(expect.arrayContaining(['dashboard', 'acu-control-0', 'rx-analysis', 'tx-chain', 'gps-timing', 'site']));
    FieldTabPolicy.reset();
    expect(tabIds()).toEqual(['site']);
  });

  it('shows a registered station tab for the class, opens the default one, and runs its lifecycle', () => {
    setSettings({});
    const page = { ...createMockTab(), tabLabel: 'SkyLink' };
    const factory = vi.fn(() => page);
    AntennaPageRegistry.getInstance().registerStationTab({ id: 'skylink', label: 'SkyLink', stationClasses: ['field'], factory, isDefault: true });
    AntennaPageRegistry.getInstance().registerStationTab({ id: 'other', label: 'Other', stationClasses: ['backyard'], factory: vi.fn() });
    selectStation();
    expect(tabIds()).toEqual(['site', 'station-skylink']);
    expect(activeTabId()).toBe('station-skylink');
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ id: 'GS-001' }) }), 'canvas-content');
    expect(page.activate).toHaveBeenCalled();
  });

  it('drops a station tab after unregister', () => {
    setSettings({});
    AntennaPageRegistry.getInstance().registerStationTab({
      id: 'skylink',
      label: 'SkyLink',
      stationClasses: ['field'],
      factory: () => ({ ...createMockTab(), tabLabel: 'SkyLink' }),
    });
    expect(AntennaPageRegistry.getInstance().unregisterStationTab('skylink')).toBe(true);
    selectStation();
    expect(tabIds()).toEqual(['site']);
  });
});
