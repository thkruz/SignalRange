import { NotchFilterAdapter } from '../../../../src/pages/mission-control/tabs/notch-filter-adapter';
import { NotchFilterModuleCore, NotchFilterState, NotchConfig } from '../../../../src/equipment/rf-front-end/notch-filter-module';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { MHz, dB } from '../../../../src/types';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');

describe('NotchFilterAdapter', () => {
  let mockNotchModule: jest.Mocked<NotchFilterModuleCore>;
  let containerEl: HTMLElement;
  let adapter: NotchFilterAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  const defaultNotch: NotchConfig = {
    enabled: false,
    centerFrequency: 1200 as MHz,
    bandwidth: 10 as MHz,
    depth: 30 as dB,
  };

  const mockState: NotchFilterState = {
    isPowered: true,
    notches: [
      { ...defaultNotch },
      { ...defaultNotch, centerFrequency: 1400 as MHz },
      { ...defaultNotch, centerFrequency: 1600 as MHz },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock NotchFilterModuleCore
    mockNotchModule = {
      state: JSON.parse(JSON.stringify(mockState)),
      handleNotchChange: jest.fn(),
      handlePowerToggle: jest.fn(),
    } as unknown as jest.Mocked<NotchFilterModuleCore>;

    // Setup container with required DOM elements for 3 notch slots
    containerEl = document.createElement('div');
    let notchHtml = '';
    for (let i = 0; i < 3; i++) {
      notchHtml += `
        <input type="checkbox" id="notch-${i}-enabled" />
        <input type="number" id="notch-${i}-freq" />
        <button id="notch-${i}-freq-dec-coarse">-100</button>
        <button id="notch-${i}-freq-dec-fine">-10</button>
        <button id="notch-${i}-freq-inc-fine">+10</button>
        <button id="notch-${i}-freq-inc-coarse">+100</button>
        <input type="number" id="notch-${i}-bw" />
        <button id="notch-${i}-bw-dec">-1</button>
        <button id="notch-${i}-bw-inc">+1</button>
        <input type="number" id="notch-${i}-depth" />
        <button id="notch-${i}-depth-dec">-5</button>
        <button id="notch-${i}-depth-inc">+5</button>
      `;
    }
    containerEl.innerHTML = `
      ${notchHtml}
      <button id="notch-apply-btn">Apply</button>
      <input type="checkbox" id="notch-power" />
    `;
    document.body.appendChild(containerEl);

    adapter = new NotchFilterAdapter(mockNotchModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(NotchFilterAdapter);
    });

    it('should register for RF_FE_NOTCH_FILTER_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_NOTCH_FILTER_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('staged values pattern', () => {
    it('should initialize staged frequencies from module state', () => {
      const freq0 = containerEl.querySelector('#notch-0-freq') as HTMLInputElement;
      const freq1 = containerEl.querySelector('#notch-1-freq') as HTMLInputElement;
      const freq2 = containerEl.querySelector('#notch-2-freq') as HTMLInputElement;

      expect(freq0.value).toBe('1200');
      expect(freq1.value).toBe('1400');
      expect(freq2.value).toBe('1600');
    });

    it('should update staged frequency on button click', () => {
      const incBtn = containerEl.querySelector('#notch-0-freq-inc-coarse') as HTMLButtonElement;
      const freqInput = containerEl.querySelector('#notch-0-freq') as HTMLInputElement;

      incBtn.click();

      expect(freqInput.value).toBe('1300');
    });

    it('should update staged bandwidth on button click', () => {
      const incBtn = containerEl.querySelector('#notch-0-bw-inc') as HTMLButtonElement;
      const bwInput = containerEl.querySelector('#notch-0-bw') as HTMLInputElement;

      incBtn.click();

      expect(bwInput.value).toBe('11');
    });

    it('should update staged depth on button click', () => {
      const incBtn = containerEl.querySelector('#notch-0-depth-inc') as HTMLButtonElement;
      const depthInput = containerEl.querySelector('#notch-0-depth') as HTMLInputElement;

      incBtn.click();

      expect(depthInput.value).toBe('35');
    });

    it('should clamp frequency to valid range (950-2150)', () => {
      const freqInput = containerEl.querySelector('#notch-0-freq') as HTMLInputElement;

      freqInput.value = '3000';
      freqInput.dispatchEvent(new Event('change'));

      expect(freqInput.value).toBe('2150');
    });

    it('should clamp bandwidth to valid range (0.1-50)', () => {
      const bwInput = containerEl.querySelector('#notch-0-bw') as HTMLInputElement;

      bwInput.value = '100';
      bwInput.dispatchEvent(new Event('change'));

      expect(bwInput.value).toBe('50');
    });

    it('should clamp depth to valid range (1-60)', () => {
      const depthInput = containerEl.querySelector('#notch-0-depth') as HTMLInputElement;

      depthInput.value = '100';
      depthInput.dispatchEvent(new Event('change'));

      expect(depthInput.value).toBe('60');
    });
  });

  describe('enable toggles', () => {
    it('should update staged enabled state when toggle changes', () => {
      const enableSwitch = containerEl.querySelector('#notch-0-enabled') as HTMLInputElement;
      enableSwitch.checked = true;
      enableSwitch.dispatchEvent(new Event('change'));

      // Click apply to commit
      const applyBtn = containerEl.querySelector('#notch-apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(mockNotchModule.handleNotchChange).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ enabled: true })
      );
    });
  });

  describe('apply button', () => {
    it('should apply all staged notch values when clicked', () => {
      const applyBtn = containerEl.querySelector('#notch-apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(mockNotchModule.handleNotchChange).toHaveBeenCalledTimes(3);
      expect(mockNotchModule.handleNotchChange).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ centerFrequency: 1200 })
      );
      expect(mockNotchModule.handleNotchChange).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ centerFrequency: 1400 })
      );
      expect(mockNotchModule.handleNotchChange).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ centerFrequency: 1600 })
      );
    });
  });

  describe('power switch', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#notch-power') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockNotchModule.handlePowerToggle).toHaveBeenCalledWith(false);
    });

    it('should disable controls when powered off', () => {
      mockNotchModule.state.isPowered = false;
      adapter.update();

      const freqInput = containerEl.querySelector('#notch-0-freq') as HTMLInputElement;
      const applyBtn = containerEl.querySelector('#notch-apply-btn') as HTMLButtonElement;

      expect(freqInput.disabled).toBe(true);
      expect(applyBtn.disabled).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RF_FE_NOTCH_FILTER_CHANGED,
        expect.any(Function)
      );
    });
  });
});
