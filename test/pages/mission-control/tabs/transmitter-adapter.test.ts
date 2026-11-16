import { Mock, Mocked, vi } from 'vitest';
import { Transmitter, TransmitterState } from '../../../../src/equipment/transmitter/transmitter';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { TransmitterAdapter } from '../../../../src/pages/mission-control/tabs/transmitter-adapter';

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

describe('TransmitterAdapter', () => {
  let mockTransmitter: Mocked<Transmitter>;
  let containerEl: HTMLElement;
  let adapter: TransmitterAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockModem = {
    modem_number: 1,
    antenna_id: 1,
    isTransmitting: false,
    isFaulted: false,
    isLoopback: false,
    isPowered: true,
    ifSignal: {
      frequency: 70e6,
      bandwidth: 36e6,
      power: -20,
      modulation: 'QPSK',
      fec: '3/4',
    },
  };

  const mockState: TransmitterState = {
    activeModem: 1,
    modems: [
      { ...mockModem, modem_number: 1 },
      { ...mockModem, modem_number: 2 },
      { ...mockModem, modem_number: 3 },
      { ...mockModem, modem_number: 4 },
    ],
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

    // Setup mock Transmitter
    mockTransmitter = {
      state: JSON.parse(JSON.stringify(mockState)),
      setActiveModem: vi.fn(),
      handleAntennaChange: vi.fn(),
      handleFrequencyChange: vi.fn(),
      handleBandwidthChange: vi.fn(),
      handlePowerChange: vi.fn(),
      handleModulationChange: vi.fn(),
      handleFecChange: vi.fn(),
      applyChanges: vi.fn(),
      handleTransmitToggle: vi.fn(),
      handleFaultReset: vi.fn(),
      handleLoopbackToggle: vi.fn(),
      handlePowerToggle: vi.fn(),
      getPowerPercentage: vi.fn().mockReturnValue(50),
      getStatusAlarms: vi.fn().mockReturnValue([]),
      getBootRemainingMs: vi.fn().mockReturnValue(2600),
    } as unknown as Mocked<Transmitter>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="tx-alarm-badge"></div>
      <button data-modem="1">Modem 1</button>
      <button data-modem="2">Modem 2</button>
      <button data-modem="3">Modem 3</button>
      <button data-modem="4">Modem 4</button>
      <select id="tx-antenna-select"><option value="1">Antenna 1</option></select>
      <input type="text" id="tx-frequency-input" />
      <input type="text" id="tx-bandwidth-input" />
      <input type="text" id="tx-power-input" />
      <select id="tx-modulation-select">
        <option value="QPSK">QPSK</option>
        <option value="8PSK">8PSK</option>
      </select>
      <select id="tx-fec-select">
        <option value="1/2">1/2</option>
        <option value="3/4">3/4</option>
      </select>
      <button id="tx-apply-btn">Apply</button>
      <span id="tx-frequency-current"></span>
      <span id="tx-bandwidth-current"></span>
      <span id="tx-power-current"></span>
      <span id="tx-modulation-current"></span>
      <span id="tx-fec-current"></span>
      <div id="tx-power-bar" style="width: 0%"></div>
      <span id="tx-power-percentage"></span>
      <input type="checkbox" id="tx-transmit-switch" />
      <span id="tx-boot-status" class="d-none"></span>
      <button id="tx-fault-reset-btn">Reset</button>
      <input type="checkbox" id="tx-loopback-switch" />
      <input type="checkbox" id="tx-power-switch" />
      <div id="tx-transmit-led" class="led-gray"></div>
      <div id="tx-fault-led" class="led-gray"></div>
      <div id="tx-loopback-led" class="led-gray"></div>
      <div id="tx-online-led" class="led-gray"></div>
      <div id="tx-status-bar" class="alert"></div>
    `;
    document.body.appendChild(containerEl);

    adapter = new TransmitterAdapter(mockTransmitter, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(TransmitterAdapter);
    });

    it('should register for TX events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.TX_ACTIVE_MODEM_CHANGED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.TX_TRANSMIT_CHANGED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
    });
  });

  describe('modem selection', () => {
    it('should call setActiveModem when modem button clicked', () => {
      const modemBtn = containerEl.querySelector('[data-modem="2"]') as HTMLButtonElement;
      modemBtn.click();

      expect(mockTransmitter.setActiveModem).toHaveBeenCalledWith(2);
    });

    it('should update modem button active class', () => {
      mockTransmitter.state.activeModem = 2;
      (adapter as any).syncDomWithState_(mockTransmitter.state);

      const modem1Btn = containerEl.querySelector('[data-modem="1"]') as HTMLButtonElement;
      const modem2Btn = containerEl.querySelector('[data-modem="2"]') as HTMLButtonElement;

      expect(modem1Btn.classList.contains('active')).toBe(false);
      expect(modem2Btn.classList.contains('active')).toBe(true);
    });
  });

  describe('configuration inputs', () => {
    it('should call handleFrequencyChange on frequency input', () => {
      const freqInput = containerEl.querySelector('#tx-frequency-input') as HTMLInputElement;
      freqInput.value = '75';
      freqInput.dispatchEvent(new Event('input'));

      expect(mockTransmitter.handleFrequencyChange).toHaveBeenCalledWith(75);
    });

    it('should call handleBandwidthChange on bandwidth input', () => {
      const bwInput = containerEl.querySelector('#tx-bandwidth-input') as HTMLInputElement;
      bwInput.value = '40';
      bwInput.dispatchEvent(new Event('input'));

      expect(mockTransmitter.handleBandwidthChange).toHaveBeenCalledWith(40);
    });

    it('should call handlePowerChange on power input', () => {
      const powerInput = containerEl.querySelector('#tx-power-input') as HTMLInputElement;
      powerInput.value = '-15';
      powerInput.dispatchEvent(new Event('input'));

      expect(mockTransmitter.handlePowerChange).toHaveBeenCalledWith(-15);
    });

    it('should call handleModulationChange on modulation select change', () => {
      const modSelect = containerEl.querySelector('#tx-modulation-select') as HTMLSelectElement;
      modSelect.value = '8PSK';
      modSelect.dispatchEvent(new Event('change'));

      expect(mockTransmitter.handleModulationChange).toHaveBeenCalledWith('8PSK');
    });

    it('should call handleFecChange on FEC select change', () => {
      const fecSelect = containerEl.querySelector('#tx-fec-select') as HTMLSelectElement;
      fecSelect.value = '1/2';
      fecSelect.dispatchEvent(new Event('change'));

      expect(mockTransmitter.handleFecChange).toHaveBeenCalledWith('1/2');
    });
  });

  describe('apply button', () => {
    it('should call applyChanges when clicked', () => {
      const applyBtn = containerEl.querySelector('#tx-apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(mockTransmitter.applyChanges).toHaveBeenCalled();
    });
  });

  describe('switches', () => {
    it('should call handleTransmitToggle when TX switch changes', () => {
      const txSwitch = containerEl.querySelector('#tx-transmit-switch') as HTMLInputElement;
      txSwitch.checked = true;
      txSwitch.dispatchEvent(new Event('change'));

      expect(mockTransmitter.handleTransmitToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleLoopbackToggle when loopback switch changes', () => {
      const loopbackSwitch = containerEl.querySelector('#tx-loopback-switch') as HTMLInputElement;
      loopbackSwitch.checked = true;
      loopbackSwitch.dispatchEvent(new Event('change'));

      expect(mockTransmitter.handleLoopbackToggle).toHaveBeenCalledWith(true);
    });

    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#tx-power-switch') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockTransmitter.handlePowerToggle).toHaveBeenCalledWith(false);
    });

    it('snaps the TX switch back off when the core refuses the key-up', () => {
      mockTransmitter.handleTransmitToggle.mockReturnValue(false);
      const txSwitch = containerEl.querySelector('#tx-transmit-switch') as HTMLInputElement;
      txSwitch.checked = true;
      txSwitch.dispatchEvent(new Event('change'));

      expect(txSwitch.checked).toBe(false);
    });

    it('should call handleFaultReset when fault reset button clicked', () => {
      const resetBtn = containerEl.querySelector('#tx-fault-reset-btn') as HTMLButtonElement;
      resetBtn.click();

      expect(mockTransmitter.handleFaultReset).toHaveBeenCalled();
    });
  });

  describe('TX modem boot lockout', () => {
    const getConfigChangedHandler = (): (() => void) => {
      const call = mockEventBus.on.mock.calls.find(([event]) => event === Events.TX_CONFIG_CHANGED);

      return call![1] as () => void;
    };

    beforeEach(() => {
      mockTransmitter.state.modems[0].isPowered = false;
      mockTransmitter.state.modems[0].isBooting = true;
      getConfigChangedHandler()();
    });

    it('disables the TX switch and shows BOOTING while the modem boots', () => {
      const txSwitch = containerEl.querySelector('#tx-transmit-switch') as HTMLInputElement;
      const bootStatus = containerEl.querySelector('#tx-boot-status') as HTMLElement;

      expect(txSwitch.disabled).toBe(true);
      expect(txSwitch.checked).toBe(false);
      expect(bootStatus.textContent).toBe('BOOTING 3 s');
      expect(bootStatus.classList.contains('d-none')).toBe(false);
    });

    it('keeps the power switch on and reports initializing in the status bar', () => {
      const powerSwitch = containerEl.querySelector('#tx-power-switch') as HTMLInputElement;
      const statusBar = containerEl.querySelector('#tx-status-bar') as HTMLElement;

      expect(powerSwitch.checked).toBe(true);
      // The Online LED is amber and says why (Phase 34 D4)
      const onlineLed = containerEl.querySelector('#tx-online-led') as HTMLElement;
      expect(onlineLed.classList.contains('warning')).toBe(true);
      expect(onlineLed.title).toBe('Online: BOOTING');
      expect(statusBar.textContent).toContain('still initializing');
      expect(statusBar.textContent).toContain('ready in 3 s');
    });

    it('re-enables the TX switch on the boot-complete state change, without waiting for a throttled sync', () => {
      mockTransmitter.state.modems[0].isBooting = false;
      mockTransmitter.state.modems[0].isPowered = true;
      getConfigChangedHandler()();

      const txSwitch = containerEl.querySelector('#tx-transmit-switch') as HTMLInputElement;
      const bootStatus = containerEl.querySelector('#tx-boot-status') as HTMLElement;
      const statusBar = containerEl.querySelector('#tx-status-bar') as HTMLElement;

      expect(txSwitch.disabled).toBe(false);
      expect(bootStatus.classList.contains('d-none')).toBe(true);
      expect(statusBar.textContent).toBe('Ready');
    });
  });

  describe('power budget visualization', () => {
    it('should have power bar element', () => {
      const powerBar = containerEl.querySelector('#tx-power-bar') as HTMLElement;
      expect(powerBar).not.toBeNull();
    });

    it('should have power percentage element', () => {
      const percentText = containerEl.querySelector('#tx-power-percentage') as HTMLElement;
      expect(percentText).not.toBeNull();
    });

    it('should call getPowerPercentage during sync', () => {
      (adapter as any).syncDomWithState_(mockTransmitter.state);
      expect(mockTransmitter.getPowerPercentage).toHaveBeenCalled();
    });
  });

  describe('LED indicators', () => {
    it('should update TX LED when transmitting', () => {
      mockTransmitter.state.modems[0].isTransmitting = true;
      (adapter as any).syncDomWithState_(mockTransmitter.state);

      const txLed = containerEl.querySelector('#tx-transmit-led') as HTMLElement;
      expect(txLed.classList.contains('error')).toBe(true);
    });

    it('should update fault LED when faulted', () => {
      mockTransmitter.state.modems[0].isFaulted = true;
      (adapter as any).syncDomWithState_(mockTransmitter.state);

      const faultLed = containerEl.querySelector('#tx-fault-led') as HTMLElement;
      expect(faultLed.classList.contains('error')).toBe(true);
    });

    it('should update online LED when powered', () => {
      mockTransmitter.state.modems[0].isPowered = true;
      (adapter as any).syncDomWithState_(mockTransmitter.state);

      const onlineLed = containerEl.querySelector('#tx-online-led') as HTMLElement;
      expect(onlineLed.classList.contains('success')).toBe(true);
    });

    it('titles every modem LED with its label and state, set with the class (Phase 34 D4, nats-r9-s01-F1)', () => {
      const title = (id: string) => (containerEl.querySelector(`#${id}`) as HTMLElement).title;
      const modem = mockTransmitter.state.modems[0];
      modem.isTransmitting = false;
      modem.isFaulted = false;
      modem.isLoopback = false;
      modem.isPowered = true;
      (adapter as any).syncDomWithState_(mockTransmitter.state);
      expect(title('tx-transmit-led')).toBe('TX: OFF');
      expect(title('tx-fault-led')).toBe('Fault: NONE');
      expect(title('tx-loopback-led')).toBe('Loop: OFF');
      expect(title('tx-online-led')).toBe('Online: ON');

      modem.isTransmitting = true;
      modem.isFaulted = true;
      modem.isLoopback = true;
      modem.isPowered = false;
      (adapter as any).syncDomWithState_(mockTransmitter.state);
      expect(title('tx-transmit-led')).toBe('TX: ON');
      expect(title('tx-fault-led')).toBe('Fault: FAULTED');
      expect(title('tx-loopback-led')).toBe('Loop: ON');
      expect((containerEl.querySelector('#tx-loopback-led') as HTMLElement).classList.contains('warning')).toBe(true);
      expect(title('tx-online-led')).toBe('Online: OFF');
      expect((containerEl.querySelector('#tx-online-led') as HTMLElement).classList.contains('off')).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.TX_ACTIVE_MODEM_CHANGED, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.TX_TRANSMIT_CHANGED, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
    });
  });
});
