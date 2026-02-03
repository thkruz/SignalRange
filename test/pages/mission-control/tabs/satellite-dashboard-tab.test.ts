import { Mock, Mocked, vi } from 'vitest';
import { Satellite } from '../../../../src/equipment/satellite/satellite';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SatelliteDashboardTab } from '../../../../src/pages/mission-control/tabs/satellite-dashboard-tab';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      settings: {
        trafficOwnership: null,
      },
    })),
  },
}));
vi.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: [],
    })),
  },
}));
vi.mock('../../../../src/traffic/traffic-control-manager', () => ({
  TrafficControlManager: {
    getInstance: vi.fn(() => ({
      getOwnershipState: vi.fn(),
      checkStationReadiness: vi.fn(),
      initiateHandover: vi.fn(),
      executeHandover: vi.fn(),
    })),
  },
}));

// Mock image imports
vi.mock('../../../../src/assets/icons/satellite.png', () => ({ default: 'satellite.png' }));

import { ScenarioManager } from '../../../../src/scenario-manager';
import { SimulationManager } from '../../../../src/simulation/simulation-manager';
import { TrafficControlManager } from '../../../../src/traffic/traffic-control-manager';
describe('SatelliteDashboardTab', () => {
  let mockSatellite: Mocked<Satellite>;
  let containerEl: HTMLElement;
  let tab: SatelliteDashboardTab;
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

    // Setup mock Satellite
    mockSatellite = {
      noradId: 12345,
      name: 'Test Satellite',
      az: 180.5,
      el: 45.2,
      rotation: 0,
      health: 0.95,
      transponders: [
        { id: 'TP-1', uplinkFrequency: 14e9, downlinkFrequency: 12e9, isActive: true },
        { id: 'TP-2', uplinkFrequency: 14.1e9, downlinkFrequency: 12.1e9, isActive: false },
      ],
      rxSignal: [],
      externalSignal: [],
      txSignal: [],
    } as unknown as Mocked<Satellite>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'satellite-dashboard-container';
    document.body.appendChild(containerEl);

    tab = new SatelliteDashboardTab(mockSatellite, 'satellite-dashboard-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(SatelliteDashboardTab);
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('HTML rendering', () => {
    it('should render satellite information card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Satellite Information');
    });

    it('should render transponders card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Transponders');
    });

    it('should display NORAD ID', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('12345');
    });

    it('should display health info', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Health');
    });
  });

  describe('satellite info displays', () => {
    it('should display azimuth', () => {
      const azEl = document.querySelector('#sat-azimuth');
      expect(azEl?.textContent).toContain('180.5');
    });

    it('should display elevation', () => {
      const elEl = document.querySelector('#sat-elevation');
      expect(elEl?.textContent).toContain('45.2');
    });

    it('should display rotation', () => {
      const rotEl = document.querySelector('#sat-rotation');
      expect(rotEl?.textContent).toContain('0.0');
    });

    it('should display health badge', () => {
      const healthEl = document.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('95');
    });
  });

  describe('transponder displays', () => {
    it('should display total transponder count', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('2');
    });

    it('should display active transponder count', () => {
      const activeEl = document.querySelector('#sat-active-transponders');
      expect(activeEl?.textContent).toBe('1');
    });

    it('should render transponder list items', () => {
      const transponderItems = document.querySelectorAll('.transponder-item');
      expect(transponderItems.length).toBe(2);
    });
  });

  describe('health status badge', () => {
    it('should show Healthy status for health >= 0.9', () => {
      const healthEl = document.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Healthy');
      expect(healthEl?.className).toContain('status-badge-green');
    });

    it('should show Degraded status for health >= 0.5 and < 0.9', () => {
      // Dispose first tab to avoid duplicate ID conflicts
      tab.dispose();

      mockSatellite.health = 0.7;
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'sat-container-2';
      document.body.appendChild(containerEl2);

      const tab2 = new SatelliteDashboardTab(mockSatellite, 'sat-container-2');
      const healthEl = containerEl2.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Degraded');
      expect(healthEl?.className).toContain('status-badge-amber');
      tab2.dispose();

      // Recreate original tab for afterEach cleanup
      tab = new SatelliteDashboardTab(mockSatellite, 'satellite-dashboard-container');
    });

    it('should show Critical status for health < 0.5', () => {
      // Dispose first tab to avoid duplicate ID conflicts
      tab.dispose();

      mockSatellite.health = 0.3;
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'sat-container-3';
      document.body.appendChild(containerEl2);

      const tab2 = new SatelliteDashboardTab(mockSatellite, 'sat-container-3');
      const healthEl = containerEl2.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Critical');
      expect(healthEl?.className).toContain('status-badge-red');
      tab2.dispose();

      // Recreate original tab for afterEach cleanup
      tab = new SatelliteDashboardTab(mockSatellite, 'satellite-dashboard-container');
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const tabEl = document.querySelector('.satellite-dashboard-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const tabEl = document.querySelector('.satellite-dashboard-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should unregister from UPDATE events', () => {
      tab.dispose();
      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });

    it('should remove DOM element', () => {
      tab.dispose();
      const tabEl = document.querySelector('.satellite-dashboard-tab');
      expect(tabEl).toBeNull();
    });
  });

  describe('empty transponders', () => {
    it('should display "No transponders configured" when satellite has no transponders', () => {
      mockSatellite.transponders = [];
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'sat-container-empty';
      document.body.appendChild(containerEl2);

      const tab2 = new SatelliteDashboardTab(mockSatellite, 'sat-container-empty');
      const transponderList = containerEl2.querySelector('.transponder-list');
      expect(transponderList?.textContent).toContain('No transponders configured');
      tab2.dispose();
    });
  });

  describe('syncDomWithState via UPDATE event', () => {
    it('should update azimuth when UPDATE event fires', () => {
      // Change satellite position
      mockSatellite.az = 270.3;

      // Get the update handler and call it
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      expect(updateHandler).toBeDefined();
      updateHandler();

      const azEl = document.querySelector('#sat-azimuth');
      expect(azEl?.textContent).toContain('270.3');
    });

    it('should update elevation when UPDATE event fires', () => {
      mockSatellite.el = 80.5;

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      updateHandler();

      const elEl = document.querySelector('#sat-elevation');
      expect(elEl?.textContent).toContain('80.5');
    });

    it('should update rotation when UPDATE event fires', () => {
      mockSatellite.rotation = 45.7;

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      updateHandler();

      const rotEl = document.querySelector('#sat-rotation');
      expect(rotEl?.textContent).toContain('45.7');
    });

    it('should update health badge when UPDATE event fires', () => {
      mockSatellite.health = 0.6;

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      updateHandler();

      const healthEl = document.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Degraded');
      expect(healthEl?.textContent).toContain('60');
    });

    it('should update active transponder count when UPDATE event fires', () => {
      mockSatellite.transponders[1].isActive = true;

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      updateHandler();

      const activeEl = document.querySelector('#sat-active-transponders');
      expect(activeEl?.textContent).toBe('2');
    });
  });
});

describe('SatelliteDashboardTab with Traffic Control', () => {
  let mockSatellite: Mocked<Satellite>;
  let containerEl: HTMLElement;
  let tab: SatelliteDashboardTab;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };
  let mockTrafficControlManager: {
    getOwnershipState: Mock;
    checkStationReadiness: Mock;
    initiateHandover: Mock;
    executeHandover: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock TrafficControlManager
    mockTrafficControlManager = {
      getOwnershipState: vi.fn(),
      checkStationReadiness: vi.fn(),
      initiateHandover: vi.fn(),
      executeHandover: vi.fn(),
    };

    TrafficControlManager.getInstance.mockReturnValue(mockTrafficControlManager);

    // Setup mock ScenarioManager with traffic ownership
    ScenarioManager.getInstance.mockReturnValue({
      settings: {
        trafficOwnership: [
          { satelliteNoradId: 12345, owningGroundStationId: 'GS-001' },
        ],
      },
    });

    // Setup mock SimulationManager with ground stations
    SimulationManager.getInstance.mockReturnValue({
      groundStations: [
        { state: { id: 'GS-001', name: 'Station 1' } },
        { state: { id: 'GS-002', name: 'Station 2' } },
      ],
    });

    // Setup mock Satellite
    mockSatellite = {
      noradId: 12345,
      name: 'Test Satellite',
      az: 180.5,
      el: 45.2,
      rotation: 0,
      health: 0.95,
      transponders: [
        { id: 'TP-1', uplinkFrequency: 14e9, downlinkFrequency: 12e9, isActive: true },
      ],
      rxSignal: [],
      externalSignal: [],
      txSignal: [],
    } as unknown as Mocked<Satellite>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'satellite-dashboard-container-tc';
    document.body.appendChild(containerEl);

    tab = new SatelliteDashboardTab(mockSatellite, 'satellite-dashboard-container-tc');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('traffic control section visibility', () => {
    it('should show traffic control section when satellite is in traffic ownership config', () => {
      const section = document.querySelector('#sat-traffic-control-section');
      expect(section?.classList.contains('d-none')).toBe(false);
    });

    it('should render traffic control card header', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Traffic Control');
    });
  });

  describe('handover target dropdown', () => {
    it('should populate handover target dropdown with ground stations', () => {
      const select = document.querySelector('#sat-handover-target') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.innerHTML).toContain('GS-001');
      expect(select.innerHTML).toContain('Station 1');
      expect(select.innerHTML).toContain('GS-002');
      expect(select.innerHTML).toContain('Station 2');
    });

    it('should initiate handover when target is selected', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      const select = document.querySelector('#sat-handover-target') as HTMLSelectElement;
      select.value = 'GS-002';
      select.dispatchEvent(new Event('change'));

      expect(mockTrafficControlManager.initiateHandover).toHaveBeenCalledWith(12345, 'GS-002');
    });

    it('should not initiate handover if target is same as owner', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      const select = document.querySelector('#sat-handover-target') as HTMLSelectElement;
      select.value = 'GS-001';
      select.dispatchEvent(new Event('change'));

      expect(mockTrafficControlManager.initiateHandover).not.toHaveBeenCalled();
    });

    it('should not initiate handover if handover is already in progress', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
      });

      const select = document.querySelector('#sat-handover-target') as HTMLSelectElement;
      select.value = 'GS-002';
      select.dispatchEvent(new Event('change'));

      expect(mockTrafficControlManager.initiateHandover).not.toHaveBeenCalled();
    });

    it('should not initiate handover if no target is selected', () => {
      const select = document.querySelector('#sat-handover-target') as HTMLSelectElement;
      select.value = '';
      select.dispatchEvent(new Event('change'));

      expect(mockTrafficControlManager.initiateHandover).not.toHaveBeenCalled();
    });
  });

  describe('execute handover button', () => {
    it('should execute handover when button is clicked', () => {
      const btn = document.querySelector('#sat-execute-handover') as HTMLButtonElement;
      btn.disabled = false;
      btn.click();

      expect(mockTrafficControlManager.executeHandover).toHaveBeenCalledWith(12345);
    });
  });

  describe('traffic control sync', () => {
    it('should update owner display during sync', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      // Trigger update handler with sufficient time elapsed for throttle
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      // Force past throttle by manipulating time
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const ownerEl = document.querySelector('#sat-traffic-owner');
      expect(ownerEl?.textContent).toBe('GS-001');
    });

    it('should update target status when handover is in progress', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
        handoverTargetStationId: 'GS-002',
        sourceStationReady: true,
        targetStationReady: true,
      });

      mockTrafficControlManager.checkStationReadiness.mockReturnValue({
        isReady: true,
        cnRatio_dB: 12.5,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusEl = document.querySelector('#sat-target-status');
      const led = statusEl?.querySelector('.led');
      const statusText = statusEl?.querySelector('.status-text');
      expect(led?.className).toContain('led-green');
      expect(statusText?.textContent).toBe('Ready');
    });

    it('should show amber LED when target is not ready', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
        handoverTargetStationId: 'GS-002',
      });

      mockTrafficControlManager.checkStationReadiness.mockReturnValue({
        isReady: false,
        cnRatio_dB: 5.0,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusEl = document.querySelector('#sat-target-status');
      const led = statusEl?.querySelector('.led');
      expect(led?.className).toContain('led-amber');
    });

    it('should display C/N ratio when handover is in progress', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
        handoverTargetStationId: 'GS-002',
      });

      mockTrafficControlManager.checkStationReadiness.mockReturnValue({
        isReady: true,
        cnRatio_dB: 12.5,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const cnEl = document.querySelector('#sat-target-cn');
      expect(cnEl?.textContent).toBe('12.5 dB');
    });

    it('should display -- dB when C/N ratio is null', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
        handoverTargetStationId: 'GS-002',
      });

      mockTrafficControlManager.checkStationReadiness.mockReturnValue({
        isReady: false,
        cnRatio_dB: null,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const cnEl = document.querySelector('#sat-target-cn');
      expect(cnEl?.textContent).toBe('-- dB');
    });

    it('should reset status when handover is not in progress', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusEl = document.querySelector('#sat-target-status');
      const led = statusEl?.querySelector('.led');
      expect(led?.className).toContain('led-off');
    });

    it('should enable execute button when both stations are ready', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: true,
        handoverTargetStationId: 'GS-002',
        sourceStationReady: true,
        targetStationReady: true,
      });

      mockTrafficControlManager.checkStationReadiness.mockReturnValue({
        isReady: true,
        cnRatio_dB: 12.5,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const btn = document.querySelector('#sat-execute-handover') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('should disable execute button when handover is not in progress', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const btn = document.querySelector('#sat-execute-handover') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('should show -- for owner when ownership state is null', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue(null);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const ownerEl = document.querySelector('#sat-traffic-owner');
      expect(ownerEl?.textContent).toBe('--');
    });
  });

  describe('throttling', () => {
    it('should not sync traffic control if within throttle interval', () => {
      mockTrafficControlManager.getOwnershipState.mockReturnValue({
        owningGroundStationId: 'GS-001',
        isHandoverInProgress: false,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      // First call at time 1000 (past initial throttle)
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      updateHandler();
      expect(mockTrafficControlManager.getOwnershipState).toHaveBeenCalledTimes(1);

      // Second call at time 1500ms (within 1000ms throttle interval)
      vi.spyOn(Date, 'now').mockReturnValue(1500);
      updateHandler();
      // Should still be 1 call since throttle prevents the second call
      expect(mockTrafficControlManager.getOwnershipState).toHaveBeenCalledTimes(1);

      // Third call at time 2500ms (past throttle interval)
      vi.spyOn(Date, 'now').mockReturnValue(2500);
      updateHandler();
      // Now should have 2 calls
      expect(mockTrafficControlManager.getOwnershipState).toHaveBeenCalledTimes(2);
    });
  });
});
