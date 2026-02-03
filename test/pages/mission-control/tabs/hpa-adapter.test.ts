import { Mock, Mocked, vi } from 'vitest';
import { HPAModuleCore, HPAState } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { HPAAdapter } from '../../../../src/pages/mission-control/tabs/hpa-adapter';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/components/card-alarm-badge/card-alarm-badge', () => ({
  CardAlarmBadge: {
    create: vi.fn(() => ({
      html: '<div class="mock-badge"></div>',
      update: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

describe('HPAAdapter', () => {
  let mockHpaModule: Mocked<HPAModuleCore>;
  let containerEl: HTMLElement;
  let adapter: HPAAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState: HPAState = {
    isPowered: true,
    isHpaEnabled: true,
    backOff: 6,
    outputPower: 44,
    gain: 20,
    temperature: 55,
    isOverdriven: false,
    imdLevel: -30,
  } as HPAState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock HPAModuleCore
    mockHpaModule = {
      state: { ...mockState },
      inputSignals: [],
      p1db: 59, // P1dB compression point in dBm
      handleBackOffChange: vi.fn(),
      handlePowerToggle: vi.fn((checked, callback) => {
        if (callback) callback(mockHpaModule.state);
      }),
      handleHpaToggle: vi.fn(),
      getAlarms: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<HPAModuleCore>;

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
      <span id="hpa-input-power-display"></span>
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
      expect(display.className).toContain('status-badge-warning');
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

      // 44 dBm normalized: (44-30)/(63-30) ≈ 0.424 = 4 segments (rounded)
      const activeSegments = Array.from(segments).filter(
        s => !s.className.includes('led-off')
      );
      expect(activeSegments.length).toBe(4);
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

  describe('throttled sync via UPDATE event', () => {
    it('should sync read-only displays when UPDATE event fires past throttle', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      expect(updateHandler).toBeDefined();

      mockHpaModule.state.outputPower = 48;
      mockHpaModule.state.temperature = 60;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const outputDisplay = containerEl.querySelector('#hpa-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('48.0 dBm');

      const tempDisplay = containerEl.querySelector('#hpa-temperature-display') as HTMLElement;
      expect(tempDisplay.textContent).toBe('60.0 °C');
    });

    it('should not sync if within throttle interval', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockHpaModule.state.outputPower = 48;

      vi.spyOn(Date, 'now').mockReturnValue(0);
      updateHandler();

      const outputDisplay = containerEl.querySelector('#hpa-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('44.0 dBm'); // Still the original value
    });

    it('should update gain during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockHpaModule.state.gain = 25;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const gainDisplay = containerEl.querySelector('#hpa-gain-display') as HTMLElement;
      expect(gainDisplay.textContent).toBe('25.0 dB');
    });

    it('should update IMD during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockHpaModule.state.imdLevel = -25;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const imdDisplay = containerEl.querySelector('#hpa-imd-display') as HTMLElement;
      expect(imdDisplay.textContent).toBe('-25.0 dBc');
    });

    it('should show placeholder values when powered off during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockHpaModule.state.isPowered = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const outputDisplay = containerEl.querySelector('#hpa-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('-- dBm');

      const imdDisplay = containerEl.querySelector('#hpa-imd-display') as HTMLElement;
      expect(imdDisplay.textContent).toBe('-- dBc');
    });

    it('should update power meter during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockHpaModule.state.outputPower = 63; // Max power (63 dBm)

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const meter = containerEl.querySelector('#hpa-power-meter') as HTMLElement;
      const segments = meter.querySelectorAll('.power-segment');
      const activeSegments = Array.from(segments).filter(
        s => !s.className.includes('led-off')
      );
      expect(activeSegments.length).toBe(10);
    });
  });

  describe('RF_FE_HPA_CHANGED event handler', () => {
    it('should sync DOM when HPA state changes', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_HPA_CHANGED
      )?.[1];
      expect(stateHandler).toBeDefined();

      const newState: Partial<HPAState> = {
        isPowered: true,
        backOff: 10,
        outputPower: 42,
      };

      stateHandler(newState);

      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;
      expect(backoffInput.value).toBe('10');
    });

    it('should update power switch from state change', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_HPA_CHANGED
      )?.[1];

      stateHandler({ isPowered: false });

      const powerSwitch = containerEl.querySelector('#hpa-power') as HTMLInputElement;
      expect(powerSwitch.checked).toBe(false);
    });

    it('should update HPA enable switch from state change', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_HPA_CHANGED
      )?.[1];

      stateHandler({ isHpaEnabled: false });

      const enableSwitch = containerEl.querySelector('#hpa-enable') as HTMLInputElement;
      expect(enableSwitch.checked).toBe(false);
    });
  });

  describe('alarm classification', () => {
    it('should classify overdrive alarms as error', () => {
      mockHpaModule.getAlarms.mockReturnValue(['HPA OVERDRIVE']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockHpaModule.getAlarms).toHaveBeenCalled();
    });

    it('should classify temperature alarms as warning', () => {
      mockHpaModule.getAlarms.mockReturnValue(['High Temperature']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockHpaModule.getAlarms).toHaveBeenCalled();
    });

    it('should classify fault alarms as error', () => {
      mockHpaModule.getAlarms.mockReturnValue(['Hardware Fault']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockHpaModule.getAlarms).toHaveBeenCalled();
    });
  });

  describe('backoff button adjustments', () => {
    it('should decrease backoff with fine button', () => {
      const decFineBtn = containerEl.querySelector('#hpa-backoff-dec-fine') as HTMLButtonElement;
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      decFineBtn.click();

      expect(backoffInput.value).toBe('5');
    });

    it('should decrease backoff with coarse button', () => {
      const decCoarseBtn = containerEl.querySelector('#hpa-backoff-dec-coarse') as HTMLButtonElement;
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      decCoarseBtn.click();

      expect(backoffInput.value).toBe('1');
    });

    it('should clamp backoff at minimum', () => {
      mockHpaModule.state.backOff = 2;
      adapter = new HPAAdapter(mockHpaModule, containerEl);

      const decCoarseBtn = containerEl.querySelector('#hpa-backoff-dec-coarse') as HTMLButtonElement;
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      decCoarseBtn.click();

      expect(backoffInput.value).toBe('0');
    });

    it('should clamp backoff at maximum', () => {
      mockHpaModule.state.backOff = 28;
      adapter = new HPAAdapter(mockHpaModule, containerEl);

      const incCoarseBtn = containerEl.querySelector('#hpa-backoff-inc-coarse') as HTMLButtonElement;
      const backoffInput = containerEl.querySelector('#hpa-backoff') as HTMLInputElement;

      incCoarseBtn.click();

      expect(backoffInput.value).toBe('30');
    });
  });

  describe('HPA toggle behavior', () => {
    it('should not toggle HPA if state already matches', () => {
      mockHpaModule.state.isHpaEnabled = true;
      const enableSwitch = containerEl.querySelector('#hpa-enable') as HTMLInputElement;
      enableSwitch.checked = true;
      enableSwitch.dispatchEvent(new Event('change'));

      expect(mockHpaModule.handleHpaToggle).not.toHaveBeenCalled();
    });
  });

  describe('P1dB display', () => {
    it('should update P1dB margin display', () => {
      adapter.update();

      const p1dbDisplay = containerEl.querySelector('#hpa-p1db-display') as HTMLElement;
      expect(p1dbDisplay).not.toBeNull();
    });
  });
});
