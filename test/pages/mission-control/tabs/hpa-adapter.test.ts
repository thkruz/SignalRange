import { HPAAdapter } from '../../../../src/pages/mission-control/tabs/hpa-adapter';
import { HPAModuleCore, HPAState } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/components/card-alarm-badge/card-alarm-badge', () => ({
  CardAlarmBadge: {
    create: jest.fn(() => ({
      html: '<div class="mock-badge"></div>',
      update: jest.fn(),
      dispose: jest.fn(),
    })),
  },
}));

describe('HPAAdapter', () => {
  let mockHpaModule: jest.Mocked<HPAModuleCore>;
  let containerEl: HTMLElement;
  let adapter: HPAAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  const mockState: HPAState = {
    isPowered: true,
    isHpaEnabled: true,
    backOff: 6,
    outputPower: 44,
    gain: 20,
    temperature: 55,
    isOverdriven: false,
    imdLevel: -30,
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

    // Setup mock HPAModuleCore
    mockHpaModule = {
      state: { ...mockState },
      handleBackOffChange: jest.fn(),
      handlePowerToggle: jest.fn((checked, callback) => {
        if (callback) callback(mockHpaModule.state);
      }),
      handleHpaToggle: jest.fn(),
      getAlarms: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<HPAModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="hpa-alarm-badge"></div>
      <input type="number" id="hpa-backoff" />
      <button id="hpa-backoff-dec-coarse">-5</button>
      <button id="hpa-backoff-dec-fine">-1</button>
      <button id="hpa-backoff-inc-fine">+1</button>
      <button id="hpa-backoff-inc-coarse">+5</button>
      <button id="hpa-apply-btn">Apply</button>
      <input type="checkbox" id="hpa-power" />
      <input type="checkbox" id="hpa-enable" />
      <span id="hpa-output-power-display"></span>
      <div id="hpa-power-meter">
        ${Array(10).fill('<div class="power-segment led-off"></div>').join('')}
      </div>
      <span id="hpa-power-watts"></span>
      <span id="hpa-p1db-display"></span>
      <span id="hpa-gain-display"></span>
      <span id="hpa-temperature-display"></span>
      <span id="hpa-imd-display"></span>
      <span id="hpa-overdrive-status"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new HPAAdapter(mockHpaModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(HPAAdapter);
    });

    it('should register for RF_FE_HPA_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_HPA_CHANGED,
        expect.any(Function)
      );
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('staged backoff pattern', () => {
    it('should initialize staged backoff from module state', () => {
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;
      expect(backoffInput.value).toBe('6');
    });

    it('should update staged backoff on button click', () => {
      const incBtn = containerEl.querySelector('#hpa-backoff-inc-coarse') as HTMLButtonElement;
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      incBtn.click();

      expect(backoffInput.value).toBe('11');
    });

    it('should clamp backoff to valid range (0-30)', () => {
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      backoffInput.value = '40';
      backoffInput.dispatchEvent(new Event('change'));

      expect(backoffInput.value).toBe('30');
    });
  });

  describe('apply button', () => {
    it('should apply staged backoff when clicked', () => {
      const applyBtn = containerEl.querySelector('#hpa-apply-btn') as HTMLButtonElement;

      applyBtn.click();

      expect(mockHpaModule.handleBackOffChange).toHaveBeenCalledWith(6);
    });
  });

  describe('power and HPA enable switches', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#hpa-power') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockHpaModule.handlePowerToggle).toHaveBeenCalledWith(false, expect.any(Function));
    });

    it('should call handleHpaToggle when HPA enable switch changes', () => {
      mockHpaModule.state.isHpaEnabled = false;
      const enableSwitch = containerEl.querySelector('#hpa-enable') as HTMLInputElement;
      enableSwitch.checked = true;
      enableSwitch.dispatchEvent(new Event('change'));

      expect(mockHpaModule.handleHpaToggle).toHaveBeenCalled();
    });
  });

  describe('syncDomWithState', () => {
    it('should update output power display', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-output-power-display') as HTMLElement;
      expect(display.textContent).toBe('44.0 dBm');
    });

    it('should update power in watts', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-power-watts') as HTMLElement;
      // 44 dBm = 10^((44-30)/10) = 25.12 W
      expect(display.textContent).toBe('25 W');
    });

    it('should update gain display', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-gain-display') as HTMLElement;
      expect(display.textContent).toBe('20.0 dB');
    });

    it('should update temperature display', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-temperature-display') as HTMLElement;
      expect(display.textContent).toBe('55.0 °C');
    });

    it('should update IMD display', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-imd-display') as HTMLElement;
      expect(display.textContent).toBe('-30.0 dBc');
    });

    it('should update overdrive status when normal', () => {
      adapter.update();

      const display = containerEl.querySelector('#hpa-overdrive-status') as HTMLElement;
      expect(display.textContent).toBe('Normal');
      expect(display.className).toContain('status-badge-good');
    });

    it('should update overdrive status when overdriven', () => {
      mockHpaModule.state.isOverdriven = true;
      adapter.update();

      const display = containerEl.querySelector('#hpa-overdrive-status') as HTMLElement;
      expect(display.textContent).toBe('OVERDRIVE');
      expect(display.className).toContain('status-badge-danger');
    });

    it('should show placeholder values when powered off', () => {
      mockHpaModule.state.isPowered = false;
      adapter.update();

      const powerDisplay = containerEl.querySelector('#hpa-output-power-display') as HTMLElement;
      expect(powerDisplay.textContent).toBe('-- dBm');

      const tempDisplay = containerEl.querySelector('#hpa-temperature-display') as HTMLElement;
      expect(tempDisplay.textContent).toBe('-- °C');
    });

    it('should disable controls when powered off', () => {
      mockHpaModule.state.isPowered = false;
      adapter.update();

      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;
      const applyBtn = containerEl.querySelector('#hpa-apply-btn') as HTMLButtonElement;

      expect(backoffInput.disabled).toBe(true);
      expect(applyBtn.disabled).toBe(true);
    });
  });

  describe('power meter visualization', () => {
    it('should update power meter segments', () => {
      adapter.update();

      const meter = containerEl.querySelector('#hpa-power-meter') as HTMLElement;
      const segments = meter.querySelectorAll('.power-segment');

      // 44 dBm normalized: (44-30)/(50-30) = 0.7 = 7 segments
      const activeSegments = Array.from(segments).filter(
        s => !s.className.includes('led-off')
      );
      expect(activeSegments.length).toBe(7);
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RF_FE_HPA_CHANGED,
        expect.any(Function)
      );
    });
  });
});
