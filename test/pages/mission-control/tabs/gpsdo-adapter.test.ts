import { Mock, Mocked, vi } from 'vitest';
import { GPSDOModuleCore } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { GPSDOAdapter } from '../../../../src/pages/mission-control/tabs/gpsdo-adapter';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');

describe('GPSDOAdapter', () => {
  let mockGpsdoModule: Mocked<GPSDOModuleCore>;
  let containerEl: HTMLElement;
  let adapter: GPSDOAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState = {
    isPowered: true,
    isGnssSwitchUp: true,
    isLocked: true,
    isGnssAcquiringLock: false,
    isInHoldover: false,
    gnssSignalPresent: true,
    satelliteCount: 8,
    constellation: 'GPS',
    temperature: 45,
    operatingHours: 1234.5,
    frequencyAccuracy: 1.0,
    allanDeviation: 0.5,
    phaseNoise: -110,
    lockDuration: 3661, // 1h 1m 1s
    holdoverDuration: 0,
    holdoverError: 0,
    active10MHzOutputs: 2,
    max10MHzOutputs: 4,
    utcAccuracy: 25,
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

    // Setup mock GPSDOModuleCore
    mockGpsdoModule = {
      state: { ...mockState },
      handlePowerToggle: vi.fn(),
      handleGnssToggle: vi.fn((checked, callback) => {
        if (callback) callback();
      }),
      getLockLedStatus_: vi.fn().mockReturnValue('led-green'),
      getGnssLedStatus_: vi.fn().mockReturnValue('led-green'),
      getWarmupLedStatus_: vi.fn().mockReturnValue('led-green'),
      formatWarmupTime_: vi.fn().mockReturnValue('READY'),
    } as unknown as Mocked<GPSDOModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <input type="checkbox" id="gpsdo-power" />
      <input type="checkbox" id="gpsdo-gnss-switch" />
      <span id="gpsdo-lock-badge"></span>
      <span id="gpsdo-gnss-badge"></span>
      <span id="gpsdo-warmup-badge"></span>
      <span id="gpsdo-holdover-badge"></span>
      <span id="gpsdo-holdover-duration"></span>
      <div id="gpsdo-holdover-progress"></div>
      <span id="gpsdo-holdover-ttl"></span>
      <span id="gpsdo-satellite-count"></span>
      <span id="gpsdo-constellation"></span>
      <span id="gpsdo-freq-accuracy"></span>
      <span id="gpsdo-allan-deviation"></span>
      <span id="gpsdo-phase-noise"></span>
      <span id="gpsdo-temperature"></span>
      <span id="gpsdo-lock-duration"></span>
      <span id="gpsdo-holdover-error"></span>
      <span id="gpsdo-10mhz-outputs"></span>
      <span id="gpsdo-utc-accuracy"></span>
      <span id="gpsdo-operating-hours"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new GPSDOAdapter(mockGpsdoModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(GPSDOAdapter);
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('power switch', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#gpsdo-power') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockGpsdoModule.handlePowerToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('GNSS switch', () => {
    it('should call handleGnssToggle when GNSS switch changes', () => {
      const gnssSwitch = containerEl.querySelector('#gpsdo-gnss-switch') as HTMLInputElement;
      gnssSwitch.checked = true;
      gnssSwitch.dispatchEvent(new Event('change'));

      expect(mockGpsdoModule.handleGnssToggle).toHaveBeenCalledWith(true, expect.any(Function));
    });
  });

  describe('syncDomWithState', () => {
    it('should update lock badge when locked', () => {
      adapter.update();

      const badge = containerEl.querySelector('#gpsdo-lock-badge') as HTMLElement;
      expect(badge.textContent).toBe('LOCKED');
      expect(badge.className).toContain('status-badge-green');
    });

    it('should update lock badge when acquiring', () => {
      mockGpsdoModule.state.isLocked = false;
      mockGpsdoModule.state.isGnssAcquiringLock = true;
      adapter.update();

      const badge = containerEl.querySelector('#gpsdo-lock-badge') as HTMLElement;
      expect(badge.textContent).toBe('ACQUIRING');
    });

    it('should update GNSS badge with satellite count', () => {
      adapter.update();

      const badge = containerEl.querySelector('#gpsdo-gnss-badge') as HTMLElement;
      expect(badge.textContent).toBe('8 SATS');
    });

    it('should update satellite count display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-satellite-count') as HTMLElement;
      expect(display.textContent).toBe('8');
    });

    it('should update constellation display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-constellation') as HTMLElement;
      expect(display.textContent).toBe('GPS');
    });

    it('should update temperature display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-temperature') as HTMLElement;
      expect(display.textContent).toBe('45.0 °C');
    });

    it('should update operating hours display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-operating-hours') as HTMLElement;
      expect(display.textContent).toBe('1234.5 hrs');
    });

    it('should update frequency accuracy display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-freq-accuracy') as HTMLElement;
      expect(display.textContent).toBe('1.00 ×10⁻¹¹');
    });

    it('should update phase noise display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-phase-noise') as HTMLElement;
      expect(display.textContent).toBe('-110.0 dBc/Hz');
    });

    it('should update lock duration display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-lock-duration') as HTMLElement;
      expect(display.textContent).toBe('1h 1m 1s');
    });

    it('should update 10 MHz outputs display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-10mhz-outputs') as HTMLElement;
      expect(display.textContent).toBe('2/4');
    });

    it('should update UTC accuracy display', () => {
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-utc-accuracy') as HTMLElement;
      expect(display.textContent).toBe('25 ns');
    });

    it('should show placeholder values when powered off', () => {
      mockGpsdoModule.state.isPowered = false;
      adapter.update();

      const satCount = containerEl.querySelector('#gpsdo-satellite-count') as HTMLElement;
      expect(satCount.textContent).toBe('--');

      const constellation = containerEl.querySelector('#gpsdo-constellation') as HTMLElement;
      expect(constellation.textContent).toBe('--');

      const lockBadge = containerEl.querySelector('#gpsdo-lock-badge') as HTMLElement;
      expect(lockBadge.textContent).toBe('OFF');
    });
  });

  describe('holdover state', () => {
    it('should update holdover badge when active', () => {
      mockGpsdoModule.state.isInHoldover = true;
      adapter.update();

      const badge = containerEl.querySelector('#gpsdo-holdover-badge') as HTMLElement;
      expect(badge.textContent).toBe('ACTIVE');
      expect(badge.className).toContain('status-badge-amber');
    });

    it('should update holdover badge when inactive', () => {
      adapter.update();

      const badge = containerEl.querySelector('#gpsdo-holdover-badge') as HTMLElement;
      expect(badge.textContent).toBe('INACTIVE');
    });

    it('should update holdover duration when active', () => {
      mockGpsdoModule.state.isInHoldover = true;
      mockGpsdoModule.state.holdoverDuration = 3661;
      adapter.update();

      const display = containerEl.querySelector('#gpsdo-holdover-duration') as HTMLElement;
      expect(display.textContent).toBe('1h 1m 1s');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });
});
