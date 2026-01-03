import { BUCAdapter } from '../../../../src/pages/mission-control/tabs/buc-adapter';
import { BUCModuleCore, BUCState } from '../../../../src/equipment/rf-front-end/buc-module/buc-module-core';
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

describe('BUCAdapter', () => {
  let mockBucModule: jest.Mocked<BUCModuleCore>;
  let containerEl: HTMLElement;
  let adapter: BUCAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  const mockState: BUCState = {
    isPowered: true,
    isMuted: false,
    loFrequency: 6425,
    gain: 58,
    outputPower: 35,
    saturationPower: 40,
    isExtRefLocked: true,
    temperature: 45,
    currentDraw: 2.5,
    phaseNoise: -80,
    frequencyError: 50,
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

    // Setup mock BUCModuleCore
    mockBucModule = {
      state: { ...mockState },
      outputSignals: [{ frequency: 5943e6 }],
      handleLoFrequencyChange: jest.fn(),
      handleGainChange: jest.fn(),
      handlePowerToggle: jest.fn(),
      handleMuteToggle: jest.fn(),
      getActiveInjectionMode: jest.fn().mockReturnValue('low'),
      getAlarms: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<BUCModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="buc-alarm-badge"></div>
      <input type="number" id="buc-lo-frequency" />
      <button id="buc-lo-dec-coarse">-100</button>
      <button id="buc-lo-dec-fine">-10</button>
      <button id="buc-lo-inc-fine">+10</button>
      <button id="buc-lo-inc-coarse">+100</button>
      <input type="number" id="buc-gain" />
      <button id="buc-gain-dec-coarse">-1</button>
      <button id="buc-gain-dec-fine">-0.5</button>
      <button id="buc-gain-inc-fine">+0.5</button>
      <button id="buc-gain-inc-coarse">+1</button>
      <button id="buc-apply-btn">Apply</button>
      <input type="checkbox" id="buc-power" />
      <input type="checkbox" id="buc-mute" />
      <span id="buc-sideband-status"></span>
      <span id="buc-output-power-display"></span>
      <span id="buc-rf-frequency-display"></span>
      <span id="buc-p1db-margin-display"></span>
      <span id="buc-lock-status"></span>
      <span id="buc-temperature-display"></span>
      <span id="buc-current-display"></span>
      <span id="buc-phase-noise-display"></span>
      <span id="buc-freq-error-display"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new BUCAdapter(mockBucModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(BUCAdapter);
    });

    it('should register for RF_FE_BUC_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_BUC_CHANGED,
        expect.any(Function)
      );
    });

    it('should register for UPDATE events for throttled sync', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('staged values pattern', () => {
    it('should initialize staged LO frequency from module state', () => {
      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;
      expect(loInput.value).toBe('6425');
    });

    it('should initialize staged gain from module state', () => {
      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;
      expect(gainInput.value).toBe('58');
    });

    it('should update staged LO frequency on button click', () => {
      const incBtn = containerEl.querySelector('#buc-lo-inc-coarse') as HTMLButtonElement;
      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;

      incBtn.click();

      expect(loInput.value).toBe('6525');
    });

    it('should update staged gain on button click', () => {
      const incBtn = containerEl.querySelector('#buc-gain-inc-coarse') as HTMLButtonElement;
      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;

      incBtn.click();

      expect(gainInput.value).toBe('59');
    });

    it('should clamp LO frequency to valid range', () => {
      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;

      // Set value above max (7000)
      loInput.value = '8000';
      loInput.dispatchEvent(new Event('change'));

      expect(loInput.value).toBe('7000');
    });

    it('should clamp gain to valid range', () => {
      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;

      // Set value above max (70)
      gainInput.value = '80';
      gainInput.dispatchEvent(new Event('change'));

      expect(gainInput.value).toBe('70');
    });
  });

  describe('apply button', () => {
    it('should apply staged values when clicked', () => {
      const applyBtn = containerEl.querySelector('#buc-apply-btn') as HTMLButtonElement;

      applyBtn.click();

      expect(mockBucModule.handleLoFrequencyChange).toHaveBeenCalledWith(6425);
      expect(mockBucModule.handleGainChange).toHaveBeenCalledWith(58);
    });
  });

  describe('power and mute switches', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#buc-power') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockBucModule.handlePowerToggle).toHaveBeenCalledWith(false);
    });

    it('should call handleMuteToggle when mute switch changes', () => {
      const muteSwitch = containerEl.querySelector('#buc-mute') as HTMLInputElement;
      muteSwitch.checked = true;
      muteSwitch.dispatchEvent(new Event('change'));

      expect(mockBucModule.handleMuteToggle).toHaveBeenCalledWith(true);
    });
  });

  describe('syncDomWithState', () => {
    it('should update output power display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-output-power-display') as HTMLElement;
      expect(display.textContent).toBe('35.0 dBm');
    });

    it('should update RF frequency display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-rf-frequency-display') as HTMLElement;
      expect(display.textContent).toBe('5943.00 MHz');
    });

    it('should update P1dB margin display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-p1db-margin-display') as HTMLElement;
      expect(display.textContent).toBe('5.0 dB'); // 40 - 35 = 5
    });

    it('should update lock status display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-lock-status') as HTMLElement;
      expect(display.textContent).toBe('Locked');
      expect(display.className).toContain('status-badge-locked');
    });

    it('should update temperature display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-temperature-display') as HTMLElement;
      expect(display.textContent).toBe('45.0 °C');
    });

    it('should update current display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-current-display') as HTMLElement;
      expect(display.textContent).toBe('2.50 A');
    });

    it('should update phase noise display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-phase-noise-display') as HTMLElement;
      expect(display.textContent).toBe('-80 dBc/Hz');
    });

    it('should update frequency error display', () => {
      adapter.update();

      const display = containerEl.querySelector('#buc-freq-error-display') as HTMLElement;
      expect(display.textContent).toBe('50 Hz');
    });

    it('should show placeholder values when powered off', () => {
      mockBucModule.state.isPowered = false;
      adapter.update();

      const outputDisplay = containerEl.querySelector('#buc-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('-- dBm');

      const tempDisplay = containerEl.querySelector('#buc-temperature-display') as HTMLElement;
      expect(tempDisplay.textContent).toBe('-- °C');
    });

    it('should disable controls when powered off', () => {
      mockBucModule.state.isPowered = false;
      adapter.update();

      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;
      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;
      const applyBtn = containerEl.querySelector('#buc-apply-btn') as HTMLButtonElement;

      expect(loInput.disabled).toBe(true);
      expect(gainInput.disabled).toBe(true);
      expect(applyBtn.disabled).toBe(true);
    });
  });

  describe('sideband status', () => {
    it('should have sideband status element', () => {
      const status = containerEl.querySelector('#buc-sideband-status') as HTMLElement;
      expect(status).not.toBeNull();
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
        Events.RF_FE_BUC_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('frequency error formatting', () => {
    it('should format large frequency errors in kHz', () => {
      mockBucModule.state.frequencyError = 1500;
      adapter.update();

      const display = containerEl.querySelector('#buc-freq-error-display') as HTMLElement;
      expect(display.textContent).toBe('1.5 kHz');
    });

    it('should format small frequency errors in Hz', () => {
      mockBucModule.state.frequencyError = 500;
      adapter.update();

      const display = containerEl.querySelector('#buc-freq-error-display') as HTMLElement;
      expect(display.textContent).toBe('500 Hz');
    });
  });

  describe('throttled sync via UPDATE event', () => {
    it('should sync read-only displays when UPDATE event fires past throttle', () => {
      // Find UPDATE handler
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
      expect(updateHandler).toBeDefined();

      // Update module state
      mockBucModule.state.outputPower = 42.5;
      mockBucModule.state.temperature = 55;

      // Trigger update with time past throttle
      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const outputDisplay = containerEl.querySelector('#buc-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('42.5 dBm');

      const tempDisplay = containerEl.querySelector('#buc-temperature-display') as HTMLElement;
      expect(tempDisplay.textContent).toBe('55.0 °C');
    });

    it('should not sync if within throttle interval', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.outputPower = 42.5;

      // First call at time 0 - should not sync due to initial throttle
      jest.spyOn(Date, 'now').mockReturnValue(0);
      updateHandler();

      // Output should still be from initial sync
      const outputDisplay = containerEl.querySelector('#buc-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('35.0 dBm');
    });

    it('should update lock status during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.isExtRefLocked = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const lockStatus = containerEl.querySelector('#buc-lock-status') as HTMLElement;
      expect(lockStatus.textContent).toBe('Unlocked');
      expect(lockStatus.className).toContain('status-badge-unlocked');
    });

    it('should update P1dB margin during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.outputPower = 38;
      mockBucModule.state.saturationPower = 40;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const p1dbDisplay = containerEl.querySelector('#buc-p1db-margin-display') as HTMLElement;
      expect(p1dbDisplay.textContent).toBe('2.0 dB');
    });

    it('should update current draw during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.currentDraw = 3.25;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const currentDisplay = containerEl.querySelector('#buc-current-display') as HTMLElement;
      expect(currentDisplay.textContent).toBe('3.25 A');
    });

    it('should update phase noise during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.phaseNoise = -85;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const phaseNoiseDisplay = containerEl.querySelector('#buc-phase-noise-display') as HTMLElement;
      expect(phaseNoiseDisplay.textContent).toBe('-85 dBc/Hz');
    });

    it('should show placeholder values when powered off during throttled sync', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      mockBucModule.state.isPowered = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const outputDisplay = containerEl.querySelector('#buc-output-power-display') as HTMLElement;
      expect(outputDisplay.textContent).toBe('-- dBm');

      const rfFreqDisplay = containerEl.querySelector('#buc-rf-frequency-display') as HTMLElement;
      expect(rfFreqDisplay.textContent).toBe('-- MHz');
    });
  });

  describe('sideband status display', () => {
    it('should show USB for low injection mode', () => {
      mockBucModule.getActiveInjectionMode.mockReturnValue('low');

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const status = containerEl.querySelector('#buc-sideband-status') as HTMLElement;
      expect(status.textContent).toBe('USB');
      expect(status.className).toContain('status-badge-good');
    });

    it('should show LSB for high injection mode', () => {
      mockBucModule.getActiveInjectionMode.mockReturnValue('high');

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const status = containerEl.querySelector('#buc-sideband-status') as HTMLElement;
      expect(status.textContent).toBe('LSB');
      expect(status.className).toContain('status-badge-good');
    });

    it('should show Out of Band for no valid injection mode', () => {
      mockBucModule.getActiveInjectionMode.mockReturnValue(null);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const status = containerEl.querySelector('#buc-sideband-status') as HTMLElement;
      expect(status.textContent).toBe('Out of Band');
      expect(status.className).toContain('status-badge-warning');
    });

    it('should show placeholder when powered off', () => {
      mockBucModule.state.isPowered = false;

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const status = containerEl.querySelector('#buc-sideband-status') as HTMLElement;
      expect(status.textContent).toBe('--');
      expect(status.className).toContain('status-badge-off');
    });
  });

  describe('alarm classification', () => {
    it('should classify error alarms correctly', () => {
      mockBucModule.getAlarms.mockReturnValue(['Phase Lock Error']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      // Verify getAlarms was called during sync
      expect(mockBucModule.getAlarms).toHaveBeenCalled();
    });

    it('should classify warning alarms correctly', () => {
      mockBucModule.getAlarms.mockReturnValue(['Reference not locked']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockBucModule.getAlarms).toHaveBeenCalled();
    });

    it('should classify fault alarms as error', () => {
      mockBucModule.getAlarms.mockReturnValue(['Hardware Fault']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockBucModule.getAlarms).toHaveBeenCalled();
    });

    it('should classify saturation alarms as warning', () => {
      mockBucModule.getAlarms.mockReturnValue(['Approaching saturation']);

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      expect(mockBucModule.getAlarms).toHaveBeenCalled();
    });
  });

  describe('RF_FE_BUC_CHANGED event handler', () => {
    it('should sync DOM when BUC state changes', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_BUC_CHANGED
      )?.[1];
      expect(stateHandler).toBeDefined();

      const newState: Partial<BUCState> = {
        isPowered: true,
        loFrequency: 6500,
        gain: 60,
        outputPower: 40,
      };

      stateHandler(newState);

      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;
      expect(loInput.value).toBe('6500');

      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;
      expect(gainInput.value).toBe('60');
    });

    it('should update power switch from state change', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_BUC_CHANGED
      )?.[1];

      stateHandler({ isPowered: false });

      const powerSwitch = containerEl.querySelector('#buc-power') as HTMLInputElement;
      expect(powerSwitch.checked).toBe(false);
    });

    it('should update mute switch from state change', () => {
      const stateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RF_FE_BUC_CHANGED
      )?.[1];

      stateHandler({ isMuted: true });

      const muteSwitch = containerEl.querySelector('#buc-mute') as HTMLInputElement;
      expect(muteSwitch.checked).toBe(true);
    });
  });

  describe('button adjustment boundary handling', () => {
    it('should clamp LO frequency at minimum', () => {
      // Set staged value near minimum
      mockBucModule.state.loFrequency = 6010;
      adapter = new BUCAdapter(mockBucModule, containerEl);

      const decBtn = containerEl.querySelector('#buc-lo-dec-coarse') as HTMLButtonElement;
      const loInput = containerEl.querySelector('#buc-lo-frequency') as HTMLInputElement;

      // Click multiple times to go below minimum
      decBtn.click();
      decBtn.click();

      expect(loInput.value).toBe('6000');
    });

    it('should clamp gain at minimum', () => {
      mockBucModule.state.gain = 0.5;
      adapter = new BUCAdapter(mockBucModule, containerEl);

      const decBtn = containerEl.querySelector('#buc-gain-dec-coarse') as HTMLButtonElement;
      const gainInput = containerEl.querySelector('#buc-gain') as HTMLInputElement;

      decBtn.click();

      expect(gainInput.value).toBe('0');
    });
  });
});
