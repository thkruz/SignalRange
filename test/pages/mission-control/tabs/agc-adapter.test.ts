import { Mock, Mocked, vi } from 'vitest';
import { AGCModuleCore, AGCState } from '../../../../src/equipment/rf-front-end/agc-module/agc-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { AGCAdapter } from '../../../../src/pages/mission-control/tabs/agc-adapter';

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

describe('AGCAdapter', () => {
  let mockAgcModule: Mocked<AGCModuleCore>;
  let containerEl: HTMLElement;
  let adapter: AGCAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState: AGCState = {
    isBypassed: false,
    currentGain: 15.5,
    inputPower: -30,
    outputPower: -14.5,
  } as AGCState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock AGCModuleCore
    mockAgcModule = {
      state: { ...mockState },
      handleBypassToggle: vi.fn(),
      getStatus: vi.fn().mockReturnValue('active'),
      getAlarms: vi.fn().mockReturnValue([]),
      isInputPowered: true,
      isNoiseOnly: false,
    } as unknown as Mocked<AGCModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="agc-alarm-badge"></div>
      <input type="checkbox" id="agc-bypass" />
      <span id="agc-gain-display"></span>
      <span id="agc-input-power-display"></span>
      <span id="agc-output-power-display"></span>
      <span id="agc-status" class="status-badge"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new AGCAdapter(mockAgcModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(AGCAdapter);
    });

    it('should register for RF_FE_AGC_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.RF_FE_AGC_CHANGED, expect.any(Function));
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });
  });

  describe('bypass switch', () => {
    it('should call handleBypassToggle when bypass switch changes', () => {
      const bypassSwitch = containerEl.querySelector('#agc-bypass') as HTMLInputElement;
      bypassSwitch.checked = true;
      bypassSwitch.dispatchEvent(new Event('change'));

      expect(mockAgcModule.handleBypassToggle).toHaveBeenCalledWith(true);
    });

    it('should update bypass switch state from module state', () => {
      mockAgcModule.state.isBypassed = true;
      (adapter as any).syncDomWithState_(mockAgcModule.state);

      const bypassSwitch = containerEl.querySelector('#agc-bypass') as HTMLInputElement;
      expect(bypassSwitch.checked).toBe(true);
    });
  });

  describe('syncDomWithState', () => {
    it('should update gain display', () => {
      (adapter as any).syncReadOnlyDisplays_();

      const display = containerEl.querySelector('#agc-gain-display') as HTMLElement;
      expect(display.textContent).toBe('15.5 dB');
    });

    it('should update input power display', () => {
      (adapter as any).syncReadOnlyDisplays_();

      const display = containerEl.querySelector('#agc-input-power-display') as HTMLElement;
      expect(display.textContent).toBe('-30.0 dBm');
    });

    it('should update output power display', () => {
      (adapter as any).syncReadOnlyDisplays_();

      const display = containerEl.querySelector('#agc-output-power-display') as HTMLElement;
      expect(display.textContent).toBe('-14.5 dBm');
    });
  });

  describe('status indicator', () => {
    it('should show Active status', () => {
      mockAgcModule.getStatus.mockReturnValue('active');
      (adapter as any).syncReadOnlyDisplays_();

      const status = containerEl.querySelector('#agc-status') as HTMLElement;
      expect(status.textContent).toBe('Active');
      expect(status.className).toContain('status-badge-locked');
    });

    it('should show Bypassed status', () => {
      mockAgcModule.getStatus.mockReturnValue('bypassed');
      (adapter as any).syncReadOnlyDisplays_();

      const status = containerEl.querySelector('#agc-status') as HTMLElement;
      expect(status.textContent).toBe('Bypassed');
      expect(status.className).toContain('status-badge-off');
    });

    it('should show At Max status', () => {
      mockAgcModule.getStatus.mockReturnValue('at-max');
      (adapter as any).syncReadOnlyDisplays_();

      const status = containerEl.querySelector('#agc-status') as HTMLElement;
      expect(status.textContent).toBe('At Max');
      expect(status.className).toContain('status-badge-warning');
    });

    it('should show At Min status', () => {
      mockAgcModule.getStatus.mockReturnValue('at-min');
      (adapter as any).syncReadOnlyDisplays_();

      const status = containerEl.querySelector('#agc-status') as HTMLElement;
      expect(status.textContent).toBe('At Min');
      expect(status.className).toContain('status-badge-warning');
    });
  });

  describe('card LED and Mode badge with no input or noise only (Phase 34 D7, nats-r9-s03-F2)', () => {
    /** Swap the mocked badge for the real one, mounted in the container */
    const useRealBadge = async (): Promise<HTMLElement> => {
      const actual = await vi.importActual<typeof import('../../../../src/components/card-alarm-badge/card-alarm-badge')>(
        '../../../../src/components/card-alarm-badge/card-alarm-badge'
      );
      const real = actual.CardAlarmBadge.create('agc-real-badge');
      const host = containerEl.querySelector('#agc-alarm-badge') as HTMLElement;
      host.innerHTML = real.html;
      (adapter as any).alarmBadge_ = real;
      return host.querySelector('.card-alarm-led') as HTMLElement;
    };
    const setModule = (fields: { isInputPowered?: boolean; isNoiseOnly?: boolean }) => {
      Object.assign(mockAgcModule as any, fields);
    };

    it('reads grey "LNB off" on the LED and "No Input" on the Mode badge with the LNB off', async () => {
      const led = await useRealBadge();
      setModule({ isInputPowered: false, isNoiseOnly: false });
      mockAgcModule.getStatus.mockReturnValue('no-input');
      (adapter as any).syncReadOnlyDisplays_();

      expect(led.className).toBe('card-alarm-led off');
      expect(led.title).toBe('LNB off');
      const status = containerEl.querySelector('#agc-status') as HTMLElement;
      expect(status.textContent).toBe('No Input');
      expect(status.className).toContain('status-badge-off');
    });

    it('reads grey with the noise title on noise before the alarm raises', async () => {
      const led = await useRealBadge();
      setModule({ isInputPowered: true, isNoiseOnly: true });
      (adapter as any).syncReadOnlyDisplays_();

      expect(led.className).toBe('card-alarm-led off');
      expect(led.title).toBe('At max gain on noise - no carrier');
    });

    it('lets the "AGC on noise only" alarm win: amber with the alarm text', async () => {
      const led = await useRealBadge();
      setModule({ isInputPowered: true, isNoiseOnly: true });
      mockAgcModule.getAlarms.mockReturnValue(['AGC on noise only - passband power is noise, no traffic carrier']);
      (adapter as any).syncReadOnlyDisplays_();

      expect(led.className).toBe('card-alarm-led warning');
      expect(led.title).toBe('AGC on noise only - passband power is noise, no traffic carrier');
    });

    it('is green "No alarms" with an input, a carrier and no alarm', async () => {
      const led = await useRealBadge();
      (adapter as any).syncReadOnlyDisplays_();

      expect(led.className).toBe('card-alarm-led success');
      expect(led.title).toBe('No alarms');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.RF_FE_AGC_CHANGED, expect.any(Function));
    });
  });
});
