import { Mock, Mocked, vi } from 'vitest';
import { LNBModuleCore, LNBState } from '../../../../src/equipment/rf-front-end/lnb-module/lnb-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { LNBAdapter } from '../../../../src/pages/mission-control/tabs/lnb-adapter';

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

describe('LNBAdapter', () => {
  let mockLnbModule: Mocked<LNBModuleCore>;
  let containerEl: HTMLElement;
  let adapter: LNBAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState: LNBState = {
    isPowered: true,
    loFrequency: 6080,
    gain: 55,
    noiseTemperature: 60,
    isExtRefLocked: true,
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

    // Setup mock LNBModuleCore
    mockLnbModule = {
      state: { ...mockState },
      handleLoFrequencyChange: vi.fn(),
      handleGainChange: vi.fn(),
      handlePowerToggle: vi.fn(),
      getAlarms: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<LNBModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="lnb-alarm-badge"></div>
      <input type="number" id="lnb-lo-frequency" />
      <button id="lnb-lo-dec-coarse">-100</button>
      <button id="lnb-lo-dec-fine">-10</button>
      <button id="lnb-lo-inc-fine">+10</button>
      <button id="lnb-lo-inc-coarse">+100</button>
      <input type="number" id="lnb-gain" />
      <button id="lnb-gain-dec-coarse">-1</button>
      <button id="lnb-gain-dec-fine">-0.1</button>
      <button id="lnb-gain-inc-fine">+0.1</button>
      <button id="lnb-gain-inc-coarse">+1</button>
      <button id="lnb-apply-btn">Apply</button>
      <input type="checkbox" id="lnb-power" />
      <span id="lnb-noise-temp-display"></span>
      <span id="lnb-lock-status"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new LNBAdapter(mockLnbModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(LNBAdapter);
    });

    it('should register for RF_FE_LNB_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_LNB_CHANGED,
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
      const loInput = containerEl.querySelector('#lnb-lo-frequency') as HTMLInputElement;
      expect(loInput.value).toBe('6080');
    });

    it('should initialize staged gain from module state', () => {
      const gainInput = containerEl.querySelector('#lnb-gain') as HTMLInputElement;
      expect(gainInput.value).toBe('55.0');
    });

    it('should update staged LO frequency on button click', () => {
      const incBtn = containerEl.querySelector('#lnb-lo-inc-coarse') as HTMLButtonElement;
      const loInput = containerEl.querySelector('#lnb-lo-frequency') as HTMLInputElement;

      incBtn.click();

      expect(loInput.value).toBe('6180');
    });

    it('should update staged gain on button click', () => {
      const incBtn = containerEl.querySelector('#lnb-gain-inc-coarse') as HTMLButtonElement;
      const gainInput = containerEl.querySelector('#lnb-gain') as HTMLInputElement;

      incBtn.click();

      expect(gainInput.value).toBe('56.0');
    });

    it('should clamp LO frequency to valid range (5000-7000)', () => {
      const loInput = containerEl.querySelector('#lnb-lo-frequency') as HTMLInputElement;

      loInput.value = '8000';
      loInput.dispatchEvent(new Event('change'));

      expect(loInput.value).toBe('7000');
    });

    it('should clamp gain to valid range (0-65)', () => {
      const gainInput = containerEl.querySelector('#lnb-gain') as HTMLInputElement;

      gainInput.value = '80';
      gainInput.dispatchEvent(new Event('change'));

      expect(gainInput.value).toBe('65.0');
    });
  });

  describe('apply button', () => {
    it('should apply staged values when clicked', () => {
      const applyBtn = containerEl.querySelector('#lnb-apply-btn') as HTMLButtonElement;

      applyBtn.click();

      expect(mockLnbModule.handleLoFrequencyChange).toHaveBeenCalledWith(6080);
      expect(mockLnbModule.handleGainChange).toHaveBeenCalledWith(55);
    });
  });

  describe('power switch', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#lnb-power') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockLnbModule.handlePowerToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('syncDomWithState', () => {
    it('should update noise temperature display', () => {
      adapter.update();

      const display = containerEl.querySelector('#lnb-noise-temp-display') as HTMLElement;
      expect(display.textContent).toBe('60 K');
    });

    it('should update lock status display when locked', () => {
      adapter.update();

      const display = containerEl.querySelector('#lnb-lock-status') as HTMLElement;
      expect(display.textContent).toBe('Locked');
      expect(display.className).toContain('status-badge-locked');
    });

    it('should update lock status display when unlocked', () => {
      mockLnbModule.state.isExtRefLocked = false;
      adapter.update();

      const display = containerEl.querySelector('#lnb-lock-status') as HTMLElement;
      expect(display.textContent).toBe('Unlocked');
      expect(display.className).toContain('status-badge-unlocked');
    });

    it('should show placeholder values when powered off', () => {
      mockLnbModule.state.isPowered = false;
      adapter.update();

      const noiseDisplay = containerEl.querySelector('#lnb-noise-temp-display') as HTMLElement;
      expect(noiseDisplay.textContent).toBe('-- K');

      const lockStatus = containerEl.querySelector('#lnb-lock-status') as HTMLElement;
      expect(lockStatus.textContent).toBe('--');
    });

    it('should disable controls when powered off', () => {
      mockLnbModule.state.isPowered = false;
      adapter.update();

      const loInput = containerEl.querySelector('#lnb-lo-frequency') as HTMLInputElement;
      const gainInput = containerEl.querySelector('#lnb-gain') as HTMLInputElement;
      const applyBtn = containerEl.querySelector('#lnb-apply-btn') as HTMLButtonElement;

      expect(loInput.disabled).toBe(true);
      expect(gainInput.disabled).toBe(true);
      expect(applyBtn.disabled).toBe(true);
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
        Events.RF_FE_LNB_CHANGED,
        expect.any(Function)
      );
    });
  });
});
