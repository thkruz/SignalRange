import { Mock, Mocked, vi } from 'vitest';
import { calculateADCDegradation } from '../../../../src/equipment/receiver/adc-degradation';
import { Receiver, ReceiverModemState } from '../../../../src/equipment/receiver/receiver';
import { modemLockAlarm } from '../../../../src/equipment/receiver/rx-signal-quality';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { ReceiverAdapter } from '../../../../src/pages/mission-control/tabs/receiver-adapter';
import type { dBm } from '../../../../src/types';

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

describe('ReceiverAdapter', () => {
  let mockReceiver: Mocked<Receiver>;
  let containerEl: HTMLElement;
  let adapter: ReceiverAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

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
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock Receiver
    mockReceiver = {
      state: JSON.parse(JSON.stringify(mockState)),
      setActiveModem: vi.fn(),
      handleAntennaChange: vi.fn(),
      handleFrequencyChange: vi.fn(),
      handleBandwidthChange: vi.fn(),
      handleModulationChange: vi.fn(),
      handleFecChange: vi.fn(),
      applyChanges: vi.fn(),
      handlePowerToggle: vi.fn(),
      getVisibleSignals: vi.fn().mockReturnValue([]),
      hasSignalForModem: vi.fn().mockReturnValue(false),
      isSignalDegraded: vi.fn().mockReturnValue(false),
      getSnrForModem: vi.fn().mockReturnValue(0),
      getPowerForModem: vi.fn().mockReturnValue(-100),
      getSignalsInBandwidth: vi.fn().mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: 0,
        effectiveCnRatio_dB: 0,
      }),
    } as unknown as Mocked<Receiver>;

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
      <canvas id="video-feed" width="320" height="180"></canvas>
      <input type="checkbox" id="power-switch" />
      <span id="signal-status" class="status-badge"></span>
      <span id="cn-raw-display"></span>
      <span id="cn-effective-display"></span>
      <span id="power-level-display"></span>
      <span id="noise-floor-display"></span>
      <span id="adc-level-display"></span>
      <span id="adc-status-display"></span>
      <div id="adc-ceiling-display" class="small text-muted mb-1 d-none"></div>
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
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.RX_CONFIG_CHANGED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.RX_ACTIVE_MODEM_CHANGED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
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

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.RX_CONFIG_CHANGED, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.RX_ACTIVE_MODEM_CHANGED, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });
  });

  describe('throttled sync via UPDATE event', () => {
    it('should sync when UPDATE event fires past throttle', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(500);
      updateHandler();

      expect(mockReceiver.getVisibleSignals).toHaveBeenCalled();
    });

    it('should not sync if within throttle interval', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      // First call
      vi.spyOn(Date, 'now').mockReturnValue(0);
      updateHandler();
      const callCountAfterFirst = mockReceiver.getVisibleSignals.mock.calls.length;

      // Second call within throttle
      vi.spyOn(Date, 'now').mockReturnValue(100);
      updateHandler();

      expect(mockReceiver.getVisibleSignals.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe('state change events', () => {
    it('should sync on RX_CONFIG_CHANGED event', () => {
      const handler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.RX_CONFIG_CHANGED)?.[1];

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

    it('should show Degraded when locked with under 1 dB of margin', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        isLowMargin: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Degraded');
    });

    it('should show Acquiring while the demodulator waits out its acquisition time', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        lockState: 'acquiring',
        cnRatio_dB: 12,
        effectiveCnRatio_dB: 12,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Acquiring');
    });

    it('should show Mismatch when the modulation/FEC labels differ, whatever the C/N', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        formatMismatch: true,
        fecMismatch: true,
        cnRatio_dB: 14,
        effectiveCnRatio_dB: 14,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('Mismatch');
      expect(status.className).toContain('status-badge-error');
    });

    it('should show No Lock below the MODCOD threshold', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        lockState: 'unlocked',
        cnRatio_dB: 3,
        effectiveCnRatio_dB: 3,
        effectiveEsN0_dB: 3.8,
        requiredEsN0_dB: 5.03,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const status = containerEl.querySelector('#signal-status') as HTMLElement;
      expect(status.textContent).toBe('No Lock');
      expect(status.className).toContain('status-badge-error');
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
      expect((containerEl.querySelector('#adc-ceiling-display') as HTMLElement).classList.contains('d-none')).toBe(true);
    });

    describe('OPTIMAL drive on a very clean carrier (phase 31 D10, r5-s07-F1)', () => {
      // A loopback carrier at ~50 dB Es/N0 at -8 dBFS: the real ADC degradation
      const clean = calculateADCDegradation(-30 as dBm, { power_dBm: -30, esN0_dB: 50, symbolRate_Hz: 30e6 });

      it('the fixture really is OPTIMAL with a penalty above 0.1 dB', () => {
        expect(clean.status).toBe('optimal');
        expect(clean.totalPenalty_dB).toBeGreaterThan(0.1);
      });

      it('hides the red penalty rows and shows one neutral ceiling line that closes Raw (+) ceiling = Effective (Phase 32 D17, nats-r7-s07-F1)', () => {
        // The S7 loop test: Raw 50.7, Effective 39.5 at OPTIMAL drive
        mockReceiver.getSignalsInBandwidth.mockReturnValue({
          hasCarrier: true,
          hasLock: true,
          cnRatio_dB: 50.7,
          effectiveCnRatio_dB: 39.5,
          adcDegradation: clean,
        });
        (adapter as any).lastStateString = '';
        (adapter as any).syncDomWithState_();

        expect((containerEl.querySelector('#degradation-section') as HTMLElement).classList.contains('d-none')).toBe(true);
        const line = containerEl.querySelector('#adc-ceiling-display') as HTMLElement;
        expect(line.classList.contains('d-none')).toBe(false);
        expect(line.textContent).toBe('Converter ceiling: ~40 dB');
        expect(line.className).not.toContain('text-danger');
        // Effective C/N stays as computed
        expect((containerEl.querySelector('#cn-effective-display') as HTMLElement).textContent).toBe('39.5 dB');
      });

      it('rounds the ceiling to 0.5 dB', () => {
        // Raw 50, ceiling 41.5 -> Effective 40.97
        const effective = -10 * Math.log10(10 ** -5 + 10 ** -4.15);
        mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 50, effectiveCnRatio_dB: effective, adcDegradation: clean });
        (adapter as any).lastStateString = '';
        (adapter as any).syncDomWithState_();
        expect((containerEl.querySelector('#adc-ceiling-display') as HTMLElement).textContent).toBe('Converter ceiling: ~41.5 dB');
      });

      it('hides the line when Effective is within 0.3 dB of Raw', () => {
        mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 30, effectiveCnRatio_dB: 29.8, adcDegradation: clean });
        (adapter as any).lastStateString = '';
        (adapter as any).syncDomWithState_();
        expect((containerEl.querySelector('#adc-ceiling-display') as HTMLElement).classList.contains('d-none')).toBe(true);
      });

      it('shows no ceiling line when the carrier loses nothing to the ADC', () => {
        mockReceiver.getSignalsInBandwidth.mockReturnValue({
          hasCarrier: true,
          hasLock: true,
          cnRatio_dB: 15,
          effectiveCnRatio_dB: 15,
          adcDegradation: clean,
        });
        (adapter as any).lastStateString = '';
        (adapter as any).syncDomWithState_();

        expect((containerEl.querySelector('#adc-ceiling-display') as HTMLElement).classList.contains('d-none')).toBe(true);
        expect((containerEl.querySelector('#degradation-section') as HTMLElement).classList.contains('d-none')).toBe(true);
      });

      it('computes the ceiling that power-adds with Raw to Effective', () => {
        const ceiling = ReceiverAdapter.converterCeilingDb(50.7, 39.5);
        expect(ceiling).toBeCloseTo(39.84, 2);
        // Raw (+) ceiling closes back to Effective
        expect(-10 * Math.log10(10 ** (-50.7 / 10) + 10 ** (-ceiling / 10))).toBeCloseTo(39.5, 6);
        expect(ReceiverAdapter.converterCeilingDb(30, 30)).toBeNaN();
      });
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

    it('should show Es/N0, C/N0 and the MODCOD requirement on the RX panel', () => {
      containerEl.insertAdjacentHTML('beforeend', '<span id="esn0-display"></span><span id="cn0-display"></span><span id="required-esn0-display"></span>');
      adapter.dispose();
      adapter = new ReceiverAdapter(mockReceiver, containerEl);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 14.2,
        effectiveCnRatio_dB: 14.2,
        effectiveEsN0_dB: 15.0,
        cn0_dBHz: 89.8,
        requiredEsN0_dB: 5.03,
        modcod: { name: 'QPSK 3/4' },
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      expect(containerEl.querySelector('#esn0-display')?.textContent).toBe('15.0 dB');
      expect(containerEl.querySelector('#cn0-display')?.textContent).toBe('89.8 dB-Hz');
      expect(containerEl.querySelector('#required-esn0-display')?.textContent).toBe('5.0 dB (QPSK 3/4), locks at 5.5 dB');
      expect((containerEl.querySelector('#status-bar') as HTMLElement).textContent).toBe('Signal locked - Good margin (Es/N0 15.0 dB, need 5.0 dB)');
    });

    it('quotes the acquire line, not "need", while unlocked (Phase 30 D10, nats-r5-s17-F2)', () => {
      const statusBar = () => (containerEl.querySelector('#status-bar') as HTMLElement).textContent;
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        lockState: 'acquiring',
        cnRatio_dB: 5.2,
        effectiveCnRatio_dB: 5.2,
        effectiveEsN0_dB: 5.9,
        requiredEsN0_dB: 5.03,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
      expect(statusBar()).toBe('Acquiring lock (Es/N0 5.9 dB, locks at 5.5 dB)');

      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        lockState: 'unlocked',
        cnRatio_dB: 4.4,
        effectiveCnRatio_dB: 4.4,
        effectiveEsN0_dB: 5.2,
        requiredEsN0_dB: 5.03,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
      expect(statusBar()).toBe('Signal no lock - Below threshold (Es/N0 5.2 dB, locks at 5.5 dB)');
    });

    it('should say Format mismatch, not Near threshold, when the labels differ (nats-s04-F4)', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        formatMismatch: true,
        fecMismatch: true,
        cnRatio_dB: 13.7,
        effectiveCnRatio_dB: 13.7,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('Format mismatch');
      expect(statusBar.textContent).not.toContain('Near threshold');
    });

    it('should show degraded margin message', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        isLowMargin: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('Degraded margin');
    });

    it('should not claim Good margin while the payload reports frame sync loss', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      adapter.setPayloadStatusProvider(() => ({ frameSyncLocked: false, rsUncorrectableBlocks: 0, channelStatus: 'No Lock' }));
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).not.toContain('Good margin');
      expect(statusBar.textContent).toContain('Frame sync lost');
      expect(statusBar.className).toContain('alert-warning');
    });

    it('should not claim Good margin while the payload reports RS overload', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      adapter.setPayloadStatusProvider(() => ({ frameSyncLocked: true, rsUncorrectableBlocks: 12, channelStatus: 'Critical' }));
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('RS overload');
    });

    it('should agree with the alarm badge: no alarm at Good margin, even below 15 dB', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 10,
        effectiveCnRatio_dB: 10,
      });
      adapter.setPayloadStatusProvider(() => ({ frameSyncLocked: true, rsUncorrectableBlocks: 0, channelStatus: 'Good' }));
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const statusBar = containerEl.querySelector('#status-bar') as HTMLElement;
      expect(statusBar.textContent).toContain('Good margin');
      expect((adapter as any).getAlarmBadgeState_().alarms).toEqual([]);
    });

    it('should raise a warning (not an error) in the degraded-margin band', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        isLowMargin: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
      });

      const alarms = (adapter as any).getAlarmBadgeState_().alarms;
      expect(alarms).toHaveLength(1);
      expect(alarms[0].severity).toBe('warning');
    });
  });

  describe('one verdict for badge, status bar and card LED (Phase 33 D4)', () => {
    const sync = () => {
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
    };
    const badge = () => containerEl.querySelector('#signal-status') as HTMLElement;
    const statusBar = () => containerEl.querySelector('#status-bar') as HTMLElement;
    /** The alarms the card LED was last painted from */
    const ledAlarms = () => {
      const calls = ((adapter as any).alarmBadge_.update as Mock).mock.calls;
      return calls[calls.length - 1][0];
    };

    it('raises no alarm for an in-band interferer at a good margin, so the LED stays green (nats-r8-s05-F2)', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 14,
        effectiveCnRatio_dB: 14,
        interferenceCount: 1,
      });
      sync();

      expect(ledAlarms()).toEqual([]);
      expect(badge().textContent).toBe('Good');
      expect(statusBar().className).toContain('alert-success');
    });

    it('names the interferer inside the one degraded-margin warning', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        isLowMargin: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
        effectiveEsN0_dB: 5.6,
        requiredEsN0_dB: 5.03,
        interferenceCount: 1,
      });
      sync();

      expect(ledAlarms()).toEqual([{ severity: 'warning', message: 'Degraded margin - Modem 1: Es/N0 5.6 dB, need 5.0 dB - 1 interferer(s) in band' }]);
      expect(badge().textContent).toBe('Degraded');
      expect(statusBar().textContent).toContain('Degraded margin');
      expect(statusBar().textContent).toContain('1 interferer(s) in band');
    });

    it('reads amber on the badge, the status bar and the LED for a payload problem at a good margin (nats-r8-s21-F1)', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      adapter.setPayloadStatusProvider(() => ({ frameSyncLocked: true, rsUncorrectableBlocks: 3, channelStatus: 'Critical' }));
      sync();

      expect(badge().textContent).toBe('Degraded');
      expect(badge().className).toContain('status-badge-degraded');
      expect(statusBar().className).toContain('alert-warning');
      expect(statusBar().textContent).toContain('RS overload');
      expect(ledAlarms()).toEqual([{ severity: 'warning', message: 'RS overload' }]);
    });

    it('shows no payload line for the FEC Degraded status alone (the margin grade carries it)', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
      });
      adapter.setPayloadStatusProvider(() => ({ frameSyncLocked: true, rsUncorrectableBlocks: 0, channelStatus: 'Degraded' }));
      sync();

      expect(badge().textContent).toBe('Good');
      expect(statusBar().textContent).toContain('Good margin');
      expect(statusBar().textContent).not.toContain('Payload');
      expect(ledAlarms()).toEqual([]);
    });
  });

  describe('card LED reads lock history and the Dashboard wording (Phase 34 D5/D6)', () => {
    /** Swap the mocked badge for the real one, mounted in the container */
    const useRealBadge = async (): Promise<HTMLElement> => {
      const actual = await vi.importActual<typeof import('../../../../src/components/card-alarm-badge/card-alarm-badge')>(
        '../../../../src/components/card-alarm-badge/card-alarm-badge'
      );
      const real = actual.CardAlarmBadge.create('rx-real-badge');
      const host = containerEl.querySelector('#rx-alarm-badge') as HTMLElement;
      host.innerHTML = real.html;
      (adapter as any).alarmBadge_ = real;
      return host.querySelector('.card-alarm-led') as HTMLElement;
    };
    const sync = () => {
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
    };

    it('is red "Carrier lock lost - Modem 1: no carrier" when the modem had lock and the carrier went (nats-r8-s24-F1)', async () => {
      const led = await useRealBadge();
      (mockReceiver as any).getLockTransition = vi.fn().mockReturnValue({ hadLock: true, lockLostAtMs: 1, lastSignalId: 'c1' });
      sync();

      expect(led.className).toBe('card-alarm-led error');
      expect(led.title).toBe('Carrier lock lost - Modem 1: no carrier');
    });

    it('is grey "No carrier" with no carrier and no lock history', async () => {
      const led = await useRealBadge();
      (mockReceiver as any).getLockTransition = vi.fn().mockReturnValue(null);
      sync();

      expect(led.className).toBe('card-alarm-led off');
      expect(led.title).toBe('No carrier');
      expect((adapter as any).getAlarmBadgeState_().alarms).toEqual([]);
    });

    it('titles a degraded margin with the Dashboard text plus the interferer suffix (nats-r9-s21-F2)', async () => {
      const led = await useRealBadge();
      const info = {
        hasCarrier: true,
        hasLock: true,
        isLowMargin: true,
        cnRatio_dB: 6,
        effectiveCnRatio_dB: 6,
        effectiveEsN0_dB: 5.6,
        requiredEsN0_dB: 5.03,
        interferenceCount: 2,
      };
      mockReceiver.getSignalsInBandwidth.mockReturnValue(info);
      (mockReceiver as any).getLockTransition = vi.fn().mockReturnValue({ hadLock: true, lockLostAtMs: null, lastSignalId: 'c1' });
      sync();

      const dashboard = modemLockAlarm(1, info as any, null);
      expect(dashboard).not.toBeNull();
      expect(led.className).toBe('card-alarm-led warning');
      expect(led.title).toBe(`${dashboard?.label} - ${dashboard?.detail} - 2 interferer(s) in band`);
      expect(led.title).toBe('Degraded margin - Modem 1: Es/N0 5.6 dB, need 5.0 dB - 2 interferer(s) in band');
    });

    it('never raises "No signal detected"', () => {
      (mockReceiver as any).getLockTransition = vi.fn().mockReturnValue(null);
      sync();
      const calls = ((adapter as any).alarmBadge_.update as Mock).mock.calls;
      for (const [alarms] of calls) {
        expect(JSON.stringify(alarms)).not.toContain('No signal detected');
      }
      expect(calls[calls.length - 1]).toEqual([[], true, 'No carrier']);
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

    it('should mark a visible carrier without modem lock as no-lock (CARRIER PRESENT, not SIGNAL LOCKED)', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: '' }]);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: false, cnRatio_dB: 2, effectiveCnRatio_dB: 2 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-no-video')).toBe(true);
      expect(monitor.classList.contains('signal-no-lock')).toBe(true);
    });

    it('should drop the no-lock modifier once the modem locks', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: '' }]);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 12, effectiveCnRatio_dB: 12 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-no-video')).toBe(true);
      expect(monitor.classList.contains('signal-no-lock')).toBe(false);
    });

    it('should show signal-found when video feed present', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'video.mp4', isImage: false, isExternal: false }]);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 12, effectiveCnRatio_dB: 12 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-found')).toBe(true);
    });

    it('should add degraded class when signal is degraded', () => {
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'video.mp4', isImage: false }]);
      mockReceiver.isSignalDegraded.mockReturnValue(true);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 12, effectiveCnRatio_dB: 12 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();

      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(monitor.classList.contains('signal-degraded')).toBe(true);
    });

    it('draws colour bars on a canvas when locked and decoding, a slate otherwise, never an <img> (Phase 30 D14)', () => {
      const feed = () => containerEl.querySelector('#video-feed') as HTMLCanvasElement;
      mockReceiver.getVisibleSignals.mockReturnValue([{ signalId: '1', power: -50, frequency: 1200, feed: 'test.jpg', isImage: true, isExternal: false }]);
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 12, effectiveCnRatio_dB: 12 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
      expect(feed().tagName).toBe('CANVAS');
      expect(feed().dataset.picture).toBe('bars');
      expect(feed().getAttribute('src')).toBeNull();

      // Carrier there but no lock: no picture, the overlay reads CARRIER PRESENT / NO LOCK
      mockReceiver.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: false, cnRatio_dB: 2, effectiveCnRatio_dB: 2 });
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
      const monitor = containerEl.querySelector('#video-monitor') as HTMLElement;
      expect(feed().dataset.picture).toBe('slate');
      expect(monitor.classList.contains('signal-no-lock')).toBe(true);
      expect(monitor.classList.contains('signal-found')).toBe(false);

      // No carrier: NO SIGNAL slate
      mockReceiver.getVisibleSignals.mockReturnValue([]);
      (adapter as any).lastStateString = '';
      (adapter as any).syncDomWithState_();
      expect(feed().dataset.picture).toBe('slate');
      expect(monitor.classList.contains('no-signal')).toBe(true);
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
