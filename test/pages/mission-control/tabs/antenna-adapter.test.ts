import { AntennaAdapter } from '../../../../src/pages/mission-control/tabs/antenna-adapter';
import { AntennaCore, AntennaState } from '../../../../src/equipment/antenna';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { Degrees } from 'ootk';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/equipment/antenna/antenna-core');

describe('AntennaAdapter', () => {
  let mockAntennaCore: jest.Mocked<AntennaCore>;
  let containerEl: HTMLElement;
  let adapter: AntennaAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; getInstance: jest.Mock };

  const mockState: AntennaState = {
    azimuth: 180 as Degrees,
    elevation: 45 as Degrees,
    polarization: 0 as Degrees,
    isPowered: true,
    isAutoTrackSwitchUp: false,
    isLoopback: false,
    rfMetrics: {
      frequency_GHz: 4.0,
      gain_dBi: 38.5,
      beamwidth_deg: 1.2,
      gOverT_dBK: 15.0,
      polLoss_dB: 0.1,
      skyTemp_K: 290,
    },
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      getInstance: jest.fn(),
    };
    mockEventBus.getInstance.mockReturnValue(mockEventBus);
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock AntennaCore
    mockAntennaCore = {
      state: { ...mockState },
      handleAzimuthChange: jest.fn(),
      handleElevationChange: jest.fn(),
      handlePolarizationChange: jest.fn(),
      handlePowerToggle: jest.fn(),
      handleAutoTrackToggle: jest.fn(),
      handleLoopbackToggle: jest.fn(),
    } as unknown as jest.Mocked<AntennaCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <input type="range" id="az-slider" />
      <span id="az-value"></span>
      <input type="range" id="el-slider" />
      <span id="el-value"></span>
      <input type="range" id="pol-slider" />
      <span id="pol-value"></span>
      <input type="checkbox" id="power-switch" />
      <input type="checkbox" id="autotrack-switch" />
      <input type="checkbox" id="loopback-switch" />
      <span id="rf-metric-freq"></span>
      <span id="rf-metric-gain"></span>
      <span id="rf-metric-beamwidth"></span>
      <span id="rf-metric-gt"></span>
      <span id="rf-metric-pol-loss"></span>
      <span id="rf-metric-sky-temp"></span>
    `;
    document.body.appendChild(containerEl);

    // Create adapter
    adapter = new AntennaAdapter(mockAntennaCore, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(AntennaAdapter);
    });

    it('should register for ANTENNA_STATE_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ANTENNA_STATE_CHANGED,
        expect.any(Function)
      );
    });

    it('should register for DOM_READY events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.DOM_READY,
        expect.any(Function)
      );
    });
  });

  describe('DOM caching', () => {
    it('should cache slider elements', () => {
      const azSlider = containerEl.querySelector('#az-slider');
      const elSlider = containerEl.querySelector('#el-slider');
      const polSlider = containerEl.querySelector('#pol-slider');

      expect(azSlider).toBeTruthy();
      expect(elSlider).toBeTruthy();
      expect(polSlider).toBeTruthy();
    });

    it('should cache switch elements', () => {
      const powerSwitch = containerEl.querySelector('#power-switch');
      const autoTrackSwitch = containerEl.querySelector('#autotrack-switch');
      const loopbackSwitch = containerEl.querySelector('#loopback-switch');

      expect(powerSwitch).toBeTruthy();
      expect(autoTrackSwitch).toBeTruthy();
      expect(loopbackSwitch).toBeTruthy();
    });
  });

  describe('event handlers', () => {
    it('should call handleAzimuthChange when azimuth slider changes', () => {
      const azSlider = containerEl.querySelector('#az-slider') as HTMLInputElement;
      azSlider.value = '90';
      azSlider.dispatchEvent(new Event('input'));

      expect(mockAntennaCore.handleAzimuthChange).toHaveBeenCalledWith(90);
    });

    it('should call handleElevationChange when elevation slider changes', () => {
      const elSlider = containerEl.querySelector('#el-slider') as HTMLInputElement;
      elSlider.value = '30';
      elSlider.dispatchEvent(new Event('input'));

      expect(mockAntennaCore.handleElevationChange).toHaveBeenCalledWith(30);
    });

    it('should call handlePolarizationChange when polarization slider changes', () => {
      const polSlider = containerEl.querySelector('#pol-slider') as HTMLInputElement;
      polSlider.value = '45';
      polSlider.dispatchEvent(new Event('input'));

      expect(mockAntennaCore.handlePolarizationChange).toHaveBeenCalledWith(45);
    });

    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#power-switch') as HTMLInputElement;
      powerSwitch.checked = true;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockAntennaCore.handlePowerToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleAutoTrackToggle when auto-track switch changes', () => {
      const autoTrackSwitch = containerEl.querySelector('#autotrack-switch') as HTMLInputElement;
      autoTrackSwitch.checked = true;
      autoTrackSwitch.dispatchEvent(new Event('change'));

      expect(mockAntennaCore.handleAutoTrackToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleLoopbackToggle when loopback switch changes', () => {
      const loopbackSwitch = containerEl.querySelector('#loopback-switch') as HTMLInputElement;
      loopbackSwitch.checked = true;
      loopbackSwitch.dispatchEvent(new Event('change'));

      expect(mockAntennaCore.handleLoopbackToggle).toHaveBeenCalledWith(true);
    });
  });

  describe('syncDomWithState', () => {
    it('should update azimuth display', () => {
      adapter.update();

      const azValue = containerEl.querySelector('#az-value') as HTMLElement;

      expect(azValue.textContent).toBe('180.0°');
    });

    it('should update elevation display', () => {
      adapter.update();

      const elValue = containerEl.querySelector('#el-value') as HTMLElement;

      expect(elValue.textContent).toBe('45.0°');
    });

    it('should update polarization display', () => {
      adapter.update();

      const polValue = containerEl.querySelector('#pol-value') as HTMLElement;

      expect(polValue.textContent).toBe('0.0°');
    });

    it('should update power switch state', () => {
      adapter.update();

      const powerSwitch = containerEl.querySelector('#power-switch') as HTMLInputElement;
      expect(powerSwitch.checked).toBe(true);
    });

    it('should update auto-track switch state', () => {
      adapter.update();

      const autoTrackSwitch = containerEl.querySelector('#autotrack-switch') as HTMLInputElement;
      expect(autoTrackSwitch.checked).toBe(false);
    });

    it('should update loopback switch state', () => {
      adapter.update();

      const loopbackSwitch = containerEl.querySelector('#loopback-switch') as HTMLInputElement;
      expect(loopbackSwitch.checked).toBe(false);
    });

    it('should update RF metrics displays', () => {
      adapter.update();

      const freqEl = containerEl.querySelector('#rf-metric-freq') as HTMLElement;
      const gainEl = containerEl.querySelector('#rf-metric-gain') as HTMLElement;
      const bwEl = containerEl.querySelector('#rf-metric-beamwidth') as HTMLElement;
      const gtEl = containerEl.querySelector('#rf-metric-gt') as HTMLElement;
      const polLossEl = containerEl.querySelector('#rf-metric-pol-loss') as HTMLElement;
      const skyTempEl = containerEl.querySelector('#rf-metric-sky-temp') as HTMLElement;

      expect(freqEl.textContent).toBe('4.000 GHz');
      expect(gainEl.textContent).toBe('38.5 dBi');
      expect(bwEl.textContent).toBe('1.20°');
      expect(gtEl.textContent).toBe('15.0 dB/K');
      expect(polLossEl.textContent).toBe('0.1 dB');
      expect(skyTempEl.textContent).toBe('290 K');
    });

    it('should prevent circular updates with identical state', () => {
      // First update
      adapter.update();
      const firstAzValue = (containerEl.querySelector('#az-value') as HTMLElement).textContent;

      // Second update with same state should not cause issues
      adapter.update();
      const secondAzValue = (containerEl.querySelector('#az-value') as HTMLElement).textContent;

      expect(firstAzValue).toBe(secondAzValue);
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.ANTENNA_STATE_CHANGED,
        expect.any(Function)
      );
    });

    it('should clear bound handlers', () => {
      adapter.dispose();

      // Verify no errors when attempting to trigger events after dispose
      const azSlider = containerEl.querySelector('#az-slider') as HTMLInputElement;
      expect(() => {
        azSlider.value = '90';
        azSlider.dispatchEvent(new Event('input'));
      }).not.toThrow();
    });
  });
});
