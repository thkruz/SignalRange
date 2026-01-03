import { ReceiverAdapter } from '../../../../src/pages/mission-control/tabs/receiver-adapter';
import { Receiver, ReceiverModemState } from '../../../../src/equipment/receiver/receiver';
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

describe('ReceiverAdapter', () => {
  let mockReceiver: jest.Mocked<Receiver>;
  let containerEl: HTMLElement;
  let adapter: ReceiverAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  const mockModem: ReceiverModemState = {
    modemNumber: 1,
    antenna_id: 1,
    isPowered: true,
    frequency: 1200,
    bandwidth: 36,
    modulation: 'QPSK',
    fec: '3/4',
  };

  const mockState = {
    activeModem: 1,
    modems: [
      { ...mockModem, modemNumber: 1 },
      { ...mockModem, modemNumber: 2 },
      { ...mockModem, modemNumber: 3 },
      { ...mockModem, modemNumber: 4 },
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

    // Setup mock Receiver
    mockReceiver = {
      state: JSON.parse(JSON.stringify(mockState)),
      setActiveModem: jest.fn(),
      handleAntennaChange: jest.fn(),
      handleFrequencyChange: jest.fn(),
      handleBandwidthChange: jest.fn(),
      handleModulationChange: jest.fn(),
      handleFecChange: jest.fn(),
      applyChanges: jest.fn(),
      handlePowerToggle: jest.fn(),
      getVisibleSignals: jest.fn().mockReturnValue([]),
      hasSignalForModem: jest.fn().mockReturnValue(false),
      isSignalDegraded: jest.fn().mockReturnValue(false),
      getSnrForModem: jest.fn().mockReturnValue(0),
      getPowerForModem: jest.fn().mockReturnValue(-100),
      getSignalsInBandwidth: jest.fn().mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: 0,
        effectiveCnRatio_dB: 0,
      }),
    } as unknown as jest.Mocked<Receiver>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="rx-alarm-badge"></div>
      <button data-modem="1">Modem 1</button>
      <button data-modem="2">Modem 2</button>
      <button data-modem="3">Modem 3</button>
      <button data-modem="4">Modem 4</button>
      <select id="antenna-select"><option value="1">Antenna 1</option></select>
      <input type="text" id="frequency-input" />
      <input type="text" id="bandwidth-input" />
      <select id="modulation-select">
        <option value="QPSK">QPSK</option>
        <option value="8PSK">8PSK</option>
      </select>
      <select id="fec-select">
        <option value="1/2">1/2</option>
        <option value="3/4">3/4</option>
      </select>
      <button id="apply-btn">Apply</button>
      <span id="antenna-current"></span>
      <span id="frequency-current"></span>
      <span id="bandwidth-current"></span>
      <span id="modulation-current"></span>
      <span id="fec-current"></span>
      <div id="video-monitor"></div>
      <img id="video-feed" />
      <input type="checkbox" id="power-switch" />
      <span id="signal-status" class="status-badge"></span>
      <span id="cn-raw-display"></span>
      <span id="cn-effective-display"></span>
      <span id="power-level-display"></span>
      <span id="noise-floor-display"></span>
      <span id="adc-level-display"></span>
      <span id="adc-status-display"></span>
      <div id="degradation-section" class="d-none">
        <span id="clip-penalty-display"></span>
        <span id="quant-penalty-display"></span>
        <span id="total-penalty-display"></span>
      </div>
      <div id="status-bar" class="alert"></div>
    `;
    document.body.appendChild(containerEl);

    adapter = new ReceiverAdapter(mockReceiver, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(ReceiverAdapter);
    });

    it('should register for RX events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RX_CONFIG_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RX_ACTIVE_MODEM_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.SYNC,
        expect.any(Function)
      );
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });

  describe('modem selection', () => {
    it('should call setActiveModem when modem button clicked', () => {
      const modemBtn = containerEl.querySelector('[data-modem="2"]') as HTMLButtonElement;
      modemBtn.click();

      expect(mockReceiver.setActiveModem).toHaveBeenCalledWith(2);
    });
  });

  describe('configuration inputs', () => {
    it('should call handleFrequencyChange on frequency input', () => {
      const freqInput = containerEl.querySelector('#frequency-input') as HTMLInputElement;
      freqInput.value = '1300';
      freqInput.dispatchEvent(new Event('input'));

      expect(mockReceiver.handleFrequencyChange).toHaveBeenCalledWith(1300);
    });

    it('should call handleBandwidthChange on bandwidth input', () => {
      const bwInput = containerEl.querySelector('#bandwidth-input') as HTMLInputElement;
      bwInput.value = '40';
      bwInput.dispatchEvent(new Event('input'));

      expect(mockReceiver.handleBandwidthChange).toHaveBeenCalledWith(40);
    });

    it('should call handleModulationChange on modulation select change', () => {
      const modSelect = containerEl.querySelector('#modulation-select') as HTMLSelectElement;
      modSelect.value = '8PSK';
      modSelect.dispatchEvent(new Event('change'));

      expect(mockReceiver.handleModulationChange).toHaveBeenCalledWith('8PSK');
    });

    it('should call handleFecChange on FEC select change', () => {
      const fecSelect = containerEl.querySelector('#fec-select') as HTMLSelectElement;
      fecSelect.value = '1/2';
      fecSelect.dispatchEvent(new Event('change'));

      expect(mockReceiver.handleFecChange).toHaveBeenCalledWith('1/2');
    });
  });

  describe('apply button', () => {
    it('should call applyChanges when clicked', () => {
      const applyBtn = containerEl.querySelector('#apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(mockReceiver.applyChanges).toHaveBeenCalled();
    });
  });

  describe('power switch', () => {
    it('should call handlePowerToggle when power switch changes', () => {
      const powerSwitch = containerEl.querySelector('#power-switch') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(mockReceiver.handlePowerToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('signal status', () => {
    it('should show Off status when modem is powered off', () => {
      mockReceiver.state.modems[0].isPowered = false;
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Off');
    });

    it('should show None status when no carrier', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: 0,
      });
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('None');
    });

    it('should call getSignalsInBandwidth during sync', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      (adapter as any).syncDomWithState_();

      expect(mockReceiver.getSignalsInBandwidth).toHaveBeenCalled();
    });

    it('should have status element', () => {
      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status).not.toBeNull();
    });
  });

  describe('C/N displays', () => {
    it('should have C/N display elements', () => {
      const cnRaw = containerEl.querySelector('#cn-raw-display') as HTMLElement;
      const cnEffective = containerEl.querySelector('#cn-effective-display') as HTMLElement;

      expect(cnRaw).not.toBeNull();
      expect(cnEffective).not.toBeNull();
    });

    it('should show placeholder when no carrier', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: 0,
      });
      (adapter as any).syncDomWithState_();

      const cnRaw = containerEl.querySelector('#cn-raw-display') as HTMLElement;
      expect(cnRaw.textContent).toBe('-- dB');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RX_CONFIG_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RX_ACTIVE_MODEM_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.SYNC,
        expect.any(Function)
      );
      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });
  });
});
