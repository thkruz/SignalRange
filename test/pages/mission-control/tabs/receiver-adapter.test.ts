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

  describe('throttled sync via UPDATE event', () => {
    it('should sync when UPDATE event fires past throttle', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(500);
      updateHandler();

      expect(mockReceiver.getVisibleSignals).toHaveBeenCalled();
    });

    it('should not sync if within throttle interval', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      // First call
      jest.spyOn(Date, 'now').mockReturnValue(0);
      updateHandler();
      const callCountAfterFirst = mockReceiver.getVisibleSignals.mock.calls.length;

      // Second call within throttle
      jest.spyOn(Date, 'now').mockReturnValue(100);
      updateHandler();

      expect(mockReceiver.getVisibleSignals.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe('state change events', () => {
    it('should sync on RX_CONFIG_CHANGED event', () => {
      const handler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.RX_CONFIG_CHANGED
      )?.[1];

      mockReceiver.state.activeModem = 2;
      handler();

      expect(mockReceiver.getVisibleSignals).toHaveBeenCalled();
    });
  });

  describe('antenna handler', () => {
    it('should call handleAntennaChange on antenna select change', () => {
      const antennaSelect = containerEl.querySelector('#antenna-select') as HTMLSelectElement;
      antennaSelect.value = '1';
      antennaSelect.dispatchEvent(new Event('change'));

      expect(mockReceiver.handleAntennaChange).toHaveBeenCalledWith(1);
    });
  });

  describe('validation', () => {
    it('should disable apply button when frequency is invalid', () => {
      const freqInput = containerEl.querySelector('#frequency-input') as HTMLInputElement;
      freqInput.value = '-100';
      freqInput.dispatchEvent(new Event('input'));

      const applyBtn = containerEl.querySelector('#apply-btn') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('should not call applyChanges when validation errors exist', () => {
      const freqInput = containerEl.querySelector('#frequency-input') as HTMLInputElement;
      freqInput.value = '-100';
      freqInput.dispatchEvent(new Event('input'));

      const applyBtn = containerEl.querySelector('#apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(mockReceiver.applyChanges).not.toHaveBeenCalled();
    });

    it('should handle invalid number in frequency input', () => {
      const freqInput = containerEl.querySelector('#frequency-input') as HTMLInputElement;
      freqInput.value = 'invalid';
      freqInput.dispatchEvent(new Event('input'));

      expect(mockReceiver.handleFrequencyChange).not.toHaveBeenCalled();
    });

    it('should handle invalid number in bandwidth input', () => {
      const bwInput = containerEl.querySelector('#bandwidth-input') as HTMLInputElement;
      bwInput.value = 'invalid';
      bwInput.dispatchEvent(new Event('input'));

      expect(mockReceiver.handleBandwidthChange).not.toHaveBeenCalled();
    });
  });

  describe('signal quality badge', () => {
    it('should show Good when C/N >= 8 and locked', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      // Reset state string to force re-sync
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Good');
      expect(status.className).toContain('status-badge-good');
    });

    it('should show Degraded when C/N >= 5 and locked', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Degraded');
    });

    it('should show Unlocked when C/N >= 5 but not locked', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Unlocked');
    });

    it('should show Poor when C/N < 5 and > 0', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        cnRatio_dB: 3,
        effectiveCnRatio_dB: 3,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Poor');
      expect(status.className).toContain('status-badge-error');
    });

    it('should show Critical when C/N <= 0', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        cnRatio_dB: 0,
        effectiveCnRatio_dB: 0,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Critical');
    });
  });

  describe('C/N and power displays', () => {
    it('should show C/N values when carrier present', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15.5,
        effectiveCnRatio_dB: 14.2,
        signalLevel_dBm: -50,
        noiseFloor_dBm: -100,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const cnRaw = containerEl.querySelector('#cn-raw-display') as HTMLElement;
      const cnEffective = containerEl.querySelector('#cn-effective-display') as HTMLElement;
      const powerLevel = containerEl.querySelector('#power-level-display') as HTMLElement;
      const noiseFloor = containerEl.querySelector('#noise-floor-display') as HTMLElement;

      expect(cnRaw.textContent).toBe('15.5 dB');
      expect(cnEffective.textContent).toBe('14.2 dB');
      expect(powerLevel.textContent).toBe('-50.0 dBm');
      expect(noiseFloor.textContent).toBe('-100.0 dBm');
    });

    it('should show placeholder when powered off', () => {
      mockReceiver.state.modems[0].isPowered = false;
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const cnRaw = containerEl.querySelector('#cn-raw-display') as HTMLElement;
      expect(cnRaw.textContent).toBe('-- dB');
    });
  });

  describe('ADC status displays', () => {
    it('should show ADC values when signal present', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: -12,
          status: 'optimal',
          clipPenalty_dB: 0,
          quantizationPenalty_dB: 0.1,
          totalPenalty_dB: 0.1,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const adcLevel = containerEl.querySelector('#adc-level-display') as HTMLElement;
      const adcStatus = containerEl.querySelector('#adc-status-display') as HTMLElement;

      expect(adcLevel.textContent).toBe('-12.0 dBFS');
      expect(adcStatus.textContent).toBe('Optimal');
    });

    it('should show clipping status for clipping ADC', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: -2,
          status: 'clipping',
          clipPenalty_dB: 2,
          quantizationPenalty_dB: 0,
          totalPenalty_dB: 2,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const adcStatus = containerEl.querySelector('#adc-status-display') as HTMLElement;
      expect(adcStatus.textContent).toBe('Clipping');
    });

    it('should show severe-clipping status', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: 0,
          status: 'severe-clipping',
          clipPenalty_dB: 5,
          quantizationPenalty_dB: 0,
          totalPenalty_dB: 5,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const adcStatus = containerEl.querySelector('#adc-status-display') as HTMLElement;
      expect(adcStatus.textContent).toBe('CLIPPING!');
    });

    it('should show low-level status', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: -35,
          status: 'low-level',
          clipPenalty_dB: 0,
          quantizationPenalty_dB: 1,
          totalPenalty_dB: 1,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const adcStatus = containerEl.querySelector('#adc-status-display') as HTMLElement;
      expect(adcStatus.textContent).toBe('Low Level');
    });

    it('should show severe-low status', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: -50,
          status: 'severe-low',
          clipPenalty_dB: 0,
          quantizationPenalty_dB: 3,
          totalPenalty_dB: 3,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const adcStatus = containerEl.querySelector('#adc-status-display') as HTMLElement;
      expect(adcStatus.textContent).toBe('LOW LEVEL!');
    });

    it('should show degradation section when penalties exist', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        adcDegradation: {
          inputLevel_dBFS: -2,
          status: 'clipping',
          clipPenalty_dB: 2,
          quantizationPenalty_dB: 0.5,
          totalPenalty_dB: 2.5,
        },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const degradationSection = containerEl.querySelector('#degradation-section') as HTMLElement;
      expect(degradationSection.classList.contains('d-none')).toBe(false);

      const clipPenalty = containerEl.querySelector('#clip-penalty-display') as HTMLElement;
      expect(clipPenalty.textContent).toBe('2.0 dB');
    });
  });

  describe('status bar', () => {
    it('should show validation error message', () => {
      const freqInput = containerEl.querySelector('#frequency-input') as HTMLInputElement;
      freqInput.value = '-100';
      freqInput.dispatchEvent(new Event('input'));
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.className).toContain('alert-danger');
    });

    it('should show powered off message', () => {
      mockReceiver.state.modems[0].isPowered = false;
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toBe('Modem powered off');
    });

    it('should show searching message when no carrier', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: 0,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toBe('Searching for signal...');
    });

    it('should show good margin message when signal good', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('Good margin');
    });

    it('should show degraded margin message', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('Degraded margin');
    });

  });

  describe('video monitor', () => {
    it('should show no-power state when modem off', () => {
      mockReceiver.state.modems[0].isPowered = false;
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('no-power')).toBe(true);
    });

    it('should show no-signal state when no decoded signal', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([]);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('no-signal')).toBe(true);
    });

    it('should show signal-no-video when signal but no feed', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: '' }]);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-no-video')).toBe(true);
    });

    it('should show signal-found when video feed present', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'video.mp4', isImage: false, isExternal: false }]);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-found')).toBe(true);
    });

    it('should add degraded class when signal is degraded', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'video.mp4', isImage: false }]);
      mockReceiver.isSignalDegraded.mockReturnValue(true);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-degraded')).toBe(true);
    });

    it('should set image src for image feeds', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'test.jpg', isImage: true, isExternal: false }]);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const videoFeed = containerEl.querySelector('#video-feed') as HTMLImageElement;
      expect(videoFeed.src).toContain('/images/test.jpg');
    });
  });

  describe('modem button signal classes', () => {
    it('should call getSignalsInBandwidth for each modem during sync', () => {
      (adapter as any).syncDomWithState_();
      // Should be called once per modem during updateModemButtons_
      expect(mockReceiver.getSignalsInBandwidth).toHaveBeenCalled();
    });

    it('should add active class to selected modem button', () => {
      (adapter as any).syncDomWithState_();

      const modemBtn = containerEl.querySelector('[data-modem="1"]') as HTMLElement;
      expect(modemBtn.classList.contains('active')).toBe(true);
    });

    it('should not add active class to non-selected modem buttons', () => {
      (adapter as any).syncDomWithState_();

      const modemBtn2 = containerEl.querySelector('[data-modem="2"]') as HTMLElement;
      expect(modemBtn2.classList.contains('active')).toBe(false);
    });
  });

  describe('pending power state', () => {
    it('should show pending power state until confirmed', () => {
      const powerSwitch = containerEl.querySelector('#power-switch') as HTMLInputElement;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      // Power switch should reflect user action
      expect(powerSwitch.checked).toBe(false);
    });
  });

  describe('current value displays', () => {
    it('should update current value displays', () => {
      (adapter as any).syncDomWithState_();

      const freqCurrent = containerEl.querySelector('#frequency-current') as HTMLElement;
      const bwCurrent = containerEl.querySelector('#bandwidth-current') as HTMLElement;
      const modCurrent = containerEl.querySelector('#modulation-current') as HTMLElement;
      const fecCurrent = containerEl.querySelector('#fec-current') as HTMLElement;

      expect(freqCurrent.textContent).toBe('1200 MHz');
      expect(bwCurrent.textContent).toBe('36 MHz');
      expect(modCurrent.textContent).toBe('QPSK');
      expect(fecCurrent.textContent).toBe('3/4');
    });
  });
});
