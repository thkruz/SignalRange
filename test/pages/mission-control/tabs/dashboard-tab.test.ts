import { Mock, Mocked, vi } from 'vitest';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { DashboardTab } from '../../../../src/pages/mission-control/tabs/dashboard-tab';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/assets/ground-station/ground-station');

// Mock image imports
vi.mock('../../../../src/assets/icons/antenna.png', () => ({ default: 'antenna.png' }));
vi.mock('../../../../src/assets/icons/radio.png', () => ({ default: 'radio.png' }));
vi.mock('../../../../src/assets/icons/arrow-big-down-lines.png', () => ({ default: 'rx.png' }));
vi.mock('../../../../src/assets/icons/arrow-big-up-lines.png', () => ({ default: 'tx.png' }));

describe('DashboardTab', () => {
  let mockGroundStation: Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: DashboardTab;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockLocation = {
    latitude: 38.897,
    longitude: -77.037,
    elevation: 100,
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

    // Setup mock GroundStation
    mockGroundStation = {
      state: {
        id: 'GS-001',
        name: 'Test Ground Station',
        location: mockLocation,
        isOperational: true,
      },
      antennas: [
        {
          state: {
            azimuth: 180,
            elevation: 45,
            trackingMode: 'manual',
            isLocked: false,
            isBeaconLocked: false,
            beaconCN: null,
            hasFault: false,
          },
        },
      ],
      rfFrontEnds: [
        {
          gpsdoModule: {
            state: {
              isLocked: true,
              satelliteCount: 8,
              isInHoldover: false,
              warmupTimeRemaining: 0,
              isPowered: true,
            },
          },
          lnbModule: {
            state: {
              isExtRefLocked: true,
              noiseTemperature: 60,
              isPowered: true,
            },
          },
          filterModule: {
            state: {
              bandwidth: 36,
            },
          },
          bucModule: {
            state: {
              isExtRefLocked: true,
              outputPower: 35,
            },
          },
          hpaModule: {
            state: {
              outputPower: 44,
              isOverdriven: false,
              isPowered: true,
            },
          },
          getStatusAlarms: vi.fn().mockReturnValue([]),
        },
      ],
      transmitters: [
        {
          state: {
            modems: [
              { isPowered: true, isTransmitting: false, isFaulted: false },
              { isPowered: false, isTransmitting: false, isFaulted: false },
            ],
          },
          getPowerPercentage: vi.fn().mockReturnValue(50),
        },
      ],
      receivers: [
        {
          state: {
            modems: [
              { isPowered: true },
              { isPowered: true },
            ],
            availableSignals: [],
          },
          getSnrForModem: vi.fn().mockReturnValue(15),
        },
      ],
      initializeEquipment: vi.fn(),
    } as unknown as Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'dashboard-container';
    document.body.appendChild(containerEl);

    tab = new DashboardTab(mockGroundStation, 'dashboard-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(DashboardTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
        rfFrontEnds: [],
        transmitters: [],
        receivers: [],
      } as unknown as Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'dashboard-container-2';
      document.body.appendChild(containerEl2);

      new DashboardTab(emptyGs, 'dashboard-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('HTML rendering', () => {
    it('should display station name', () => {
      const stationName = document.body.querySelector('h4');
      expect(stationName?.textContent).toContain('Test Ground Station');
    });

    it('should display station location', () => {
      const dashboardEl = document.querySelector('.dashboard-tab');
      expect(dashboardEl?.innerHTML).toContain('38.8970');
      expect(dashboardEl?.innerHTML).toContain('-77.0370');
    });

    it('should display equipment counts', () => {
      const antennaCount = document.querySelector('#antenna-count');
      expect(antennaCount?.textContent).toBe('1');
    });
  });

  describe('clickable cards', () => {
    it('should emit SWITCH_TAB event when card is clicked', () => {
      const card = document.querySelector('[data-target-tab="acu-control"]') as HTMLElement;
      card?.click();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.SWITCH_TAB,
        { tabId: 'acu-control' }
      );
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const dashboardEl = document.querySelector('.dashboard-tab') as HTMLElement;
      expect(dashboardEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const dashboardEl = document.querySelector('.dashboard-tab') as HTMLElement;
      expect(dashboardEl?.style.display).toBe('none');
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
      const dashboardEl = document.querySelector('.dashboard-tab');
      expect(dashboardEl).toBeNull();
    });
  });

  describe('state synchronization', () => {
    it('should update station status display', () => {
      const statusEl = document.querySelector('#station-status');
      expect(statusEl?.textContent).toBe('OPERATIONAL');
      expect(statusEl?.classList.contains('status-badge-green')).toBe(true);
    });

    it('should update active receivers count', () => {
      const rxEl = document.querySelector('#active-receivers');
      expect(rxEl?.textContent).toBe('2');
    });

    it('should update active transmitters count', () => {
      const txEl = document.querySelector('#active-transmitters');
      expect(txEl?.textContent).toBe('1');
    });
  });
});
