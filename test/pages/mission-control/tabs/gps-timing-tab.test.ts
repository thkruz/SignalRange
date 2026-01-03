import { GPSTimingTab } from '../../../../src/pages/mission-control/tabs/gps-timing-tab';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/assets/ground-station/ground-station');
jest.mock('../../../../src/pages/mission-control/tabs/gpsdo-adapter');

// Mock image imports
jest.mock('../../../../src/assets/icons/activity.png', () => 'activity.png');
jest.mock('../../../../src/assets/icons/heart-rate-monitor.png', () => 'heart-rate-monitor.png');
jest.mock('../../../../src/assets/icons/power.png', () => 'power.png');
jest.mock('../../../../src/assets/icons/satellite.png', () => 'satellite.png');
jest.mock('../../../../src/assets/icons/share.png', () => 'share.png');
jest.mock('../../../../src/assets/icons/temperature.png', () => 'temperature.png');

describe('GPSTimingTab', () => {
  let mockGroundStation: jest.Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: GPSTimingTab;
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

    // Setup mock GroundStation
    mockGroundStation = {
      antennas: [{ state: {} }],
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
        },
      ],
      initializeEquipment: jest.fn(),
    } as unknown as jest.Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'gps-timing-container';
    document.body.appendChild(containerEl);

    tab = new GPSTimingTab(mockGroundStation, 'gps-timing-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(GPSTimingTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
      } as unknown as jest.Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'gps-timing-container-2';
      document.body.appendChild(containerEl2);

      new GPSTimingTab(emptyGs, 'gps-timing-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });
  });

  describe('HTML rendering', () => {
    it('should render Lock & Power Status card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Lock');
      expect(html).toContain('Power Status');
    });

    it('should render GNSS Constellation card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('GNSS Constellation');
    });

    it('should render OCXO Oven Control card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('OCXO Oven Control');
    });

    it('should render 10 MHz Distribution card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('10 MHz Distribution');
    });

    it('should render Reference Quality Metrics card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Reference Quality Metrics');
    });

    it('should render Holdover Performance card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Holdover Performance');
    });
  });

  describe('power controls', () => {
    it('should render power switch', () => {
      const powerSwitch = document.querySelector('#gpsdo-power');
      expect(powerSwitch).not.toBeNull();
    });

    it('should render GNSS switch', () => {
      const gnssSwitch = document.querySelector('#gpsdo-gnss-switch');
      expect(gnssSwitch).not.toBeNull();
    });
  });

  describe('status displays', () => {
    it('should render lock badge', () => {
      const lockBadge = document.querySelector('#gpsdo-lock-badge');
      expect(lockBadge).not.toBeNull();
    });

    it('should render satellite count', () => {
      const satCount = document.querySelector('#gpsdo-satellite-count');
      expect(satCount).not.toBeNull();
    });

    it('should render temperature display', () => {
      const tempDisplay = document.querySelector('#gpsdo-temperature');
      expect(tempDisplay).not.toBeNull();
    });

    it('should render frequency accuracy display', () => {
      const freqAccuracy = document.querySelector('#gpsdo-freq-accuracy');
      expect(freqAccuracy).not.toBeNull();
    });

    it('should render holdover duration display', () => {
      const holdoverDuration = document.querySelector('#gpsdo-holdover-duration');
      expect(holdoverDuration).not.toBeNull();
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const tabEl = document.querySelector('.gps-timing-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const tabEl = document.querySelector('.gps-timing-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should remove DOM element', () => {
      tab.dispose();
      const tabEl = document.querySelector('.gps-timing-tab');
      expect(tabEl).toBeNull();
    });
  });
});
