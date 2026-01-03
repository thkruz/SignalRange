import { SatelliteDashboardTab } from '../../../../src/pages/mission-control/tabs/satellite-dashboard-tab';
import { Satellite } from '../../../../src/equipment/satellite/satellite';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      settings: {
        trafficOwnership: null,
      },
    })),
  },
}));
jest.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      groundStations: [],
    })),
  },
}));
jest.mock('../../../../src/traffic/traffic-control-manager', () => ({
  TrafficControlManager: {
    getInstance: jest.fn(() => ({
      getOwnershipState: jest.fn(),
      checkStationReadiness: jest.fn(),
      initiateHandover: jest.fn(),
      executeHandover: jest.fn(),
    })),
  },
}));

// Mock image imports
jest.mock('../../../../src/assets/icons/satellite.png', () => 'satellite.png');

describe('SatelliteDashboardTab', () => {
  let mockSatellite: jest.Mocked<Satellite>;
  let containerEl: HTMLElement;
  let tab: SatelliteDashboardTab;
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
    } as unknown as jest.Mocked<Satellite>;

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
      mockSatellite.health = 0.7;
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'sat-container-2';
      document.body.appendChild(containerEl2);

      const tab2 = new SatelliteDashboardTab(mockSatellite, 'sat-container-2');
      const healthEl = containerEl2.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Degraded');
      expect(healthEl?.className).toContain('status-badge-amber');
      tab2.dispose();
    });

    it('should show Critical status for health < 0.5', () => {
      mockSatellite.health = 0.3;
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'sat-container-3';
      document.body.appendChild(containerEl2);

      const tab2 = new SatelliteDashboardTab(mockSatellite, 'sat-container-3');
      const healthEl = containerEl2.querySelector('#sat-health-badge');
      expect(healthEl?.textContent).toContain('Critical');
      expect(healthEl?.className).toContain('status-badge-red');
      tab2.dispose();
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
});
