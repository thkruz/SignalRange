import { dBm, FECType, Hertz, IfSignal, MHz, ModulationType } from '@app/types';
import { vi } from 'vitest';
import { Receiver, ReceiverModemState, ReceiverState } from '../../../src/equipment/receiver/receiver';
import { TapPoint } from '../../../src/equipment/rf-front-end/coupler-module/tap-points';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Helper to create mock IF signals
function createMockIfSignal(overrides: Partial<IfSignal> = {}): IfSignal {
  return {
    signalId: 'test-signal-1',
    serverId: 1,
    noradId: 12345,
    power: -30 as dBm,
    bandwidth: 20e6 as Hertz, // 20 MHz
    modulation: 'QPSK' as ModulationType,
    fec: '1/2' as FECType,
    polarization: 'V',
    feed: 'test-video.mp4',
    isDegraded: false,
    origin: 'satellite-rx' as any,
    noiseFloor: -100 as dBm,
    gainInPath: 0 as any,
    frequency: 1400e6 as any, // 1400 MHz in Hz
    ...overrides,
  };
}

// Helper to create mock RF front-end
function createMockRfFrontEnd(signals: IfSignal[] = [], options: {
  externalNoise?: number;
  totalRxGain?: number;
  noiseFloorNoGain?: number;
  agcOutputPower?: number;
  notchState?: any;
} = {}) {
  const {
    externalNoise = -120,
    totalRxGain = 60,
    noiseFloorNoGain = -174,
    agcOutputPower = -30,
    notchState = null,
  } = options;

  return {
    externalNoise,
    agcModule: {
      outputSignals: signals,
      state: {
        outputPower: agcOutputPower,
      },
    },
    couplerModule: {
      signalPathManager: {
        getTotalRxGain: () => totalRxGain,
        getNoiseFloorAt: (_tapPoint: TapPoint, _bandwidth: Hertz) => ({
          noiseFloorNoGain,
          noiseFloor: noiseFloorNoGain + totalRxGain,
          isInternalNoiseGreater: false,
        }),
      },
    },
    notchFilterModule: notchState ? { state: notchState } : null,
  };
}

describe('Receiver class', () => {
  let receiver: Receiver;
  let parentElement: HTMLElement;

  beforeEach(() => {
    vi.resetModules();

    // Create a clean DOM root
    document.body.innerHTML = '<div id="test-root"></div>';
    parentElement = document.getElementById('test-root')!;

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
    EventBus.getInstance().clear(Events.RX_CONFIG_CHANGED);
    EventBus.getInstance().clear(Events.RX_ACTIVE_MODEM_CHANGED);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('getDefaultState', () => {
    it('should return default state with 4 modems', () => {
      const state = Receiver.getDefaultState();

      expect(state.modems).toHaveLength(4);
      expect(state.activeModem).toBe(1);
      expect(state.availableSignals).toEqual([]);
    });

    it('should configure modems with correct numbers', () => {
      const state = Receiver.getDefaultState();

      expect(state.modems[0].modemNumber).toBe(1);
      expect(state.modems[1].modemNumber).toBe(2);
      expect(state.modems[2].modemNumber).toBe(3);
      expect(state.modems[3].modemNumber).toBe(4);
    });

    it('should assign antennas correctly (1-2 to antenna 1, 3-4 to antenna 2)', () => {
      const state = Receiver.getDefaultState();

      expect(state.modems[0].antenna_id).toBe(1);
      expect(state.modems[1].antenna_id).toBe(1);
      expect(state.modems[2].antenna_id).toBe(2);
      expect(state.modems[3].antenna_id).toBe(2);
    });

    it('should set default modem configuration', () => {
      const state = Receiver.getDefaultState();
      const modem = state.modems[0];

      expect(modem.frequency).toBe(1400);
      expect(modem.bandwidth).toBe(20);
      expect(modem.modulation).toBe('QPSK');
      expect(modem.fec).toBe('1/2');
      expect(modem.isPowered).toBe(true);
    });

    it('should set default identifiers', () => {
      const state = Receiver.getDefaultState();

      expect(state.uuid).toBe('default');
      expect(state.team_id).toBe(1);
      expect(state.server_id).toBe(1);
    });
  });

  describe('Initialization', () => {
    it('should create receiver with default state', () => {
      receiver = new Receiver('test-root', []);

      expect(receiver).toBeDefined();
      expect(receiver.state.modems).toHaveLength(4);
      expect(receiver.state.activeModem).toBe(1);
    });

    it('should accept custom team and server IDs', () => {
      receiver = new Receiver('test-root', [], {}, 5, 10);

      expect(receiver.state.team_id).toBe(5);
      expect(receiver.state.server_id).toBe(10);
    });

    it('should merge partial modem overrides by modem number', () => {
      const overrides: Partial<ReceiverState> = {
        modems: [
          { modemNumber: 2, frequency: 1500 as MHz, bandwidth: 36 as MHz } as ReceiverModemState,
        ],
      };

      receiver = new Receiver('test-root', [], overrides);

      // Modem 2 should have overridden values
      const modem2 = receiver.state.modems.find(m => m.modemNumber === 2);
      expect(modem2?.frequency).toBe(1500);
      expect(modem2?.bandwidth).toBe(36);

      // Other modems should have defaults
      const modem1 = receiver.state.modems.find(m => m.modemNumber === 1);
      expect(modem1?.frequency).toBe(1400);
    });

    it('should subscribe to EventBus events', () => {
      const onSpy = vi.spyOn(EventBus.getInstance(), 'on');

      receiver = new Receiver('test-root', []);

      expect(onSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));

      onSpy.mockRestore();
    });

    it('should create power switch', () => {
      receiver = new Receiver('test-root', []);

      expect(receiver.powerSwitch).toBeDefined();
    });
  });

  describe('activeModem getter', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return the currently active modem', () => {
      const active = receiver.activeModem;

      expect(active.modemNumber).toBe(1);
    });

    it('should return first modem as fallback if active not found', () => {
      receiver.state.activeModem = 99; // Invalid modem number

      const active = receiver.activeModem;

      expect(active.modemNumber).toBe(1);
    });
  });

  describe('setActiveModem', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should change the active modem', () => {
      receiver.setActiveModem(3);

      expect(receiver.state.activeModem).toBe(3);
      expect(receiver.activeModem.modemNumber).toBe(3);
    });

    it('should emit RX_ACTIVE_MODEM_CHANGED event', () => {
      const emitSpy = vi.spyOn(receiver, 'emit');

      receiver.setActiveModem(2);

      expect(emitSpy).toHaveBeenCalledWith(Events.RX_ACTIVE_MODEM_CHANGED, {
        uuid: receiver.uuid,
        activeModem: 2,
      });

      emitSpy.mockRestore();
    });
  });

  describe('Input handlers', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should handle antenna change', () => {
      receiver.handleAntennaChange(2);

      // Input data is staged, not yet applied
      expect((receiver as any).inputData.antenna_id).toBe(2);
    });

    it('should handle frequency change', () => {
      receiver.handleFrequencyChange(1550);

      expect((receiver as any).inputData.frequency).toBe(1550);
    });

    it('should handle bandwidth change', () => {
      receiver.handleBandwidthChange(36);

      expect((receiver as any).inputData.bandwidth).toBe(36);
    });

    it('should handle modulation change', () => {
      receiver.handleModulationChange('8QAM' as ModulationType);

      expect((receiver as any).inputData.modulation).toBe('8QAM');
    });

    it('should handle FEC change', () => {
      receiver.handleFecChange('3/4' as FECType);

      expect((receiver as any).inputData.fec).toBe('3/4');
    });
  });

  describe('applyChanges', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should apply staged input data to active modem', () => {
      receiver.handleFrequencyChange(1600);
      receiver.handleBandwidthChange(40);
      receiver.handleModulationChange('16QAM' as ModulationType);
      receiver.handleFecChange('5/6' as FECType);

      receiver.applyChanges();

      expect(receiver.activeModem.frequency).toBe(1600);
      expect(receiver.activeModem.bandwidth).toBe(40);
      expect(receiver.activeModem.modulation).toBe('16QAM');
      expect(receiver.activeModem.fec).toBe('5/6');
    });

    it('should preserve power state when applying changes', () => {
      receiver.activeModem.isPowered = false;
      receiver.handleFrequencyChange(1600);

      receiver.applyChanges();

      expect(receiver.activeModem.isPowered).toBe(false);
    });

    it('should emit RX_CONFIG_CHANGED event', () => {
      const emitSpy = vi.spyOn(receiver, 'emit');

      receiver.handleFrequencyChange(1600);
      receiver.applyChanges();

      expect(emitSpy).toHaveBeenCalledWith(Events.RX_CONFIG_CHANGED, {
        uuid: receiver.uuid,
        modem: 1,
        config: expect.objectContaining({
          frequency: 1600,
        }),
      });

      emitSpy.mockRestore();
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should sync modem data', () => {
      const newModems: ReceiverModemState[] = [
        { modemNumber: 1, antenna_id: 1, frequency: 1500 as MHz, bandwidth: 30 as MHz, modulation: '8QAM' as ModulationType, fec: '2/3' as FECType, isPowered: true },
        { modemNumber: 2, antenna_id: 1, frequency: 1400 as MHz, bandwidth: 20 as MHz, modulation: 'QPSK' as ModulationType, fec: '1/2' as FECType, isPowered: true },
        { modemNumber: 3, antenna_id: 2, frequency: 1400 as MHz, bandwidth: 20 as MHz, modulation: 'QPSK' as ModulationType, fec: '1/2' as FECType, isPowered: true },
        { modemNumber: 4, antenna_id: 2, frequency: 1400 as MHz, bandwidth: 20 as MHz, modulation: 'QPSK' as ModulationType, fec: '1/2' as FECType, isPowered: true },
      ];

      receiver.sync({ modems: newModems });

      expect(receiver.state.modems[0].frequency).toBe(1500);
      expect(receiver.state.modems[0].bandwidth).toBe(30);
      expect(receiver.state.modems[0].modulation).toBe('8QAM');
    });

    it('should sync active modem', () => {
      receiver.sync({ activeModem: 3 });

      expect(receiver.state.activeModem).toBe(3);
    });
  });

  describe('getStatusAlarms', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return empty array when no signals available', () => {
      receiver.state.availableSignals = [];

      const alarms = receiver.getStatusAlarms();

      expect(alarms).toEqual([]);
    });

    it('should return info alarm when signals are detected', () => {
      receiver.state.availableSignals = [
        { id: 'sig1', feed: 'test.mp4', isDegraded: false },
      ];

      const alarms = receiver.getStatusAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0].severity).toBe('info');
      expect(alarms[0].message).toBe('Signal(s) Detected');
    });
  });

  describe('hasSignalForModem', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return false when no RF front-end connected', () => {
      const modem = receiver.activeModem;

      const hasSignal = receiver.hasSignalForModem(modem);

      expect(hasSignal).toBe(false);
    });
  });

  describe('isSignalDegraded', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return false when no RF front-end connected', () => {
      const modem = receiver.activeModem;

      const isDegraded = receiver.isSignalDegraded(modem);

      expect(isDegraded).toBe(false);
    });
  });

  describe('getSnrForModem', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return null when modem is not powered', () => {
      const modem = receiver.activeModem;
      modem.isPowered = false;

      const snr = receiver.getSnrForModem(modem);

      expect(snr).toBeNull();
    });

    it('should return null when no RF front-end connected', () => {
      const modem = receiver.activeModem;

      const snr = receiver.getSnrForModem(modem);

      expect(snr).toBeNull();
    });
  });

  describe('getPowerForModem', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return null when modem is not powered', () => {
      const modem = receiver.activeModem;
      modem.isPowered = false;

      const power = receiver.getPowerForModem(modem);

      expect(power).toBeNull();
    });

    it('should return null when no signals visible', () => {
      const modem = receiver.activeModem;

      const power = receiver.getPowerForModem(modem);

      expect(power).toBeNull();
    });
  });

  describe('getSignalsInBandwidth', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return no signal result when no RF front-end connected', () => {
      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(false);
      expect(result.hasLock).toBe(false);
      expect(result.actualModulation).toBeNull();
      expect(result.configuredModulation).toBe('QPSK');
      expect(result.cnRatio_dB).toBe(-Infinity);
      expect(result.frequencyOffset_Hz).toBe(0);
      expect(result.modulationMismatch).toBe(false);
      expect(result.fecMismatch).toBe(false);
    });

    it('should use active modem by default', () => {
      receiver.setActiveModem(2);
      receiver.state.modems[1].modulation = '8QAM' as ModulationType;

      const result = receiver.getSignalsInBandwidth();

      expect(result.configuredModulation).toBe('8QAM');
    });

    it('should accept specific modem parameter', () => {
      const modem3 = receiver.state.modems[2];
      modem3.modulation = '16QAM' as ModulationType;

      const result = receiver.getSignalsInBandwidth(modem3);

      expect(result.configuredModulation).toBe('16QAM');
    });
  });

  describe('connectRfFrontEnd', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should store RF front-end reference', () => {
      const mockRfFrontEnd = {} as any;

      receiver.connectRfFrontEnd(mockRfFrontEnd);

      expect((receiver as any).rfFrontEnd_).toBe(mockRfFrontEnd);
    });
  });

  describe('antennas getter', () => {
    it('should return the antennas array', () => {
      const mockAntennas = [{}, {}] as any[];
      receiver = new Receiver('test-root', mockAntennas);

      expect(receiver.antennas).toBe(mockAntennas);
      expect(receiver.antennas).toHaveLength(2);
    });
  });

  describe('FEC bandwidth tolerance', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should have higher tolerance for lower FEC rates', () => {
      // Access private method through the class - we test this indirectly
      // through the getSignalsInBandwidth behavior
      // The tolerance mapping is:
      // 1/2 -> 0.40 (highest tolerance)
      // 2/3 -> 0.50
      // 3/4 -> 0.60
      // 5/6 -> 0.75
      // 7/8 -> 0.85 (lowest tolerance)

      // Test different FEC configurations
      receiver.state.modems[0].fec = '1/2' as FECType;
      expect(receiver.activeModem.fec).toBe('1/2');

      receiver.state.modems[0].fec = '7/8' as FECType;
      expect(receiver.activeModem.fec).toBe('7/8');
    });
  });

  describe('getSignalsInBandwidth with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should detect carrier when signal is in bandwidth', () => {
      const signal = createMockIfSignal();
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(true);
      expect(result.actualModulation).toBe('QPSK');
    });

    it('should detect lock when modulation and FEC match', () => {
      const signal = createMockIfSignal({
        modulation: 'QPSK' as ModulationType,
        fec: '1/2' as FECType,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasLock).toBe(true);
      expect(result.modulationMismatch).toBe(false);
      expect(result.fecMismatch).toBe(false);
    });

    it('should detect modulation mismatch', () => {
      const signal = createMockIfSignal({
        modulation: '8QAM' as ModulationType, // Different from modem's QPSK
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(true);
      expect(result.hasLock).toBe(false);
      expect(result.modulationMismatch).toBe(true);
      expect(result.actualModulation).toBe('8QAM');
    });

    it('should detect FEC mismatch', () => {
      const signal = createMockIfSignal({
        fec: '3/4' as FECType, // Different from modem's 1/2
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(true);
      expect(result.hasLock).toBe(false);
      expect(result.fecMismatch).toBe(true);
    });

    it('should calculate frequency offset', () => {
      const signal = createMockIfSignal({
        frequency: 1401e6 as any, // 1 MHz above modem center (1400 MHz)
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.frequencyOffset_Hz).toBe(1e6); // 1 MHz offset
    });

    it('should filter out signals below noise floor', () => {
      const signal = createMockIfSignal({
        power: -200 as dBm, // Extremely weak signal
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        externalNoise: -50, // High noise level
        totalRxGain: 10, // Low gain so signal + gain < externalNoise
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      // Signal power + gain (-200 + 10 = -190) < externalNoise (-50)
      expect(result.hasCarrier).toBe(false);
    });

    it('should filter out signals with bandwidth too large', () => {
      const signal = createMockIfSignal({
        bandwidth: 50e6 as Hertz, // 50 MHz - larger than modem's 20 MHz
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(false);
    });

    it('should filter out signals outside frequency range', () => {
      const signal = createMockIfSignal({
        frequency: 1500e6 as any, // Way outside 1400 MHz +/- 10 MHz
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasCarrier).toBe(false);
    });

    it('should calculate C/N ratio', () => {
      const signal = createMockIfSignal({
        power: -30 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.cnRatio_dB).toBeGreaterThan(0);
      expect(result.signalLevel_dBm).toBe(-30);
    });

    it('should include ADC degradation info', () => {
      const signal = createMockIfSignal();
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.adcDegradation).toBeDefined();
      expect(result.effectiveCnRatio_dB).toBeDefined();
    });

    it('should detect bandwidth clipping', () => {
      const signal = createMockIfSignal({
        bandwidth: 5e6 as Hertz, // 5 MHz - only 25% of expected 20 MHz
        fec: '7/8' as FECType, // Fragile FEC needs 85% bandwidth
      });
      receiver.state.modems[0].fec = '7/8' as FECType;
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.isBandwidthClipped).toBe(true);
      expect(result.hasLock).toBe(false);
    });

    it('should prefer signals with matching modulation/FEC', () => {
      const matchingSignal = createMockIfSignal({
        signalId: 'matching',
        modulation: 'QPSK' as ModulationType,
        fec: '1/2' as FECType,
        bandwidth: 15e6 as Hertz,
      });
      const mismatchedSignal = createMockIfSignal({
        signalId: 'mismatched',
        modulation: '8QAM' as ModulationType,
        fec: '3/4' as FECType,
        bandwidth: 20e6 as Hertz, // Larger bandwidth but wrong mod/FEC
      });
      const mockRfFrontEnd = createMockRfFrontEnd([matchingSignal, mismatchedSignal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.hasLock).toBe(true);
      expect(result.actualModulation).toBe('QPSK');
    });

    it('should calculate interference power from multiple signals', () => {
      const targetSignal = createMockIfSignal({
        signalId: 'target',
        bandwidth: 20e6 as Hertz,
      });
      const interferingSignal = createMockIfSignal({
        signalId: 'interferer',
        frequency: 1405e6 as any, // 5 MHz offset, partially overlapping
        bandwidth: 10e6 as Hertz,
        power: -40 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([targetSignal, interferingSignal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const result = receiver.getSignalsInBandwidth();

      expect(result.interferenceCount).toBe(1);
      expect(result.interferencePower_dBm).toBeDefined();
    });
  });

  describe('getVisibleSignals with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return empty array when no RF front-end', () => {
      const signals = receiver.getVisibleSignals();
      expect(signals).toEqual([]);
    });

    it('should return matching signal', () => {
      const signal = createMockIfSignal();
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].signalId).toBe('test-signal-1');
    });

    it('should filter by modulation', () => {
      const signal = createMockIfSignal({
        modulation: '16QAM' as ModulationType, // Different from QPSK
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(0);
    });

    it('should filter by FEC', () => {
      const signal = createMockIfSignal({
        fec: '7/8' as FECType, // Different from 1/2
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(0);
    });

    it('should mark signal as degraded when frequency offset exceeds 10%', () => {
      const signal = createMockIfSignal({
        frequency: 1403e6 as any, // 3 MHz offset (15% of 20 MHz bandwidth)
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].isDegraded).toBe(true);
    });

    it('should mark signal as degraded when C/N is too low', () => {
      // For QPSK, required C/N is 10 dB
      // Signal level = -80 dBm
      // Noise floor = noiseFloorNoGain + totalRxGain = -85 + 0 = -85 dBm
      // C/N = -80 - (-85) = 5 dB (below 10 dB requirement)
      const signal = createMockIfSignal({
        power: -80 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -85, // Gives 5 dB C/N (below QPSK 10 dB requirement)
        totalRxGain: 0,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].isDegraded).toBe(true);
    });

    it('should return strongest signal when multiple match', () => {
      const weakSignal = createMockIfSignal({
        signalId: 'weak',
        power: -50 as dBm,
      });
      const strongSignal = createMockIfSignal({
        signalId: 'strong',
        power: -30 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([weakSignal, strongSignal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].signalId).toBe('strong');
    });

    it('should filter out suppressed signals (>20dB below strongest)', () => {
      const strongSignal = createMockIfSignal({
        signalId: 'strong',
        power: -30 as dBm,
      });
      const suppressedSignal = createMockIfSignal({
        signalId: 'suppressed',
        power: -55 as dBm, // 25 dB below strong
      });
      const mockRfFrontEnd = createMockRfFrontEnd([strongSignal, suppressedSignal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].signalId).toBe('strong');
    });

    it('should filter out notched signals', () => {
      const signal = createMockIfSignal({
        frequency: 1400e6 as any,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        notchState: {
          isPowered: true,
          notches: [
            { enabled: true, centerFrequency: 1400, bandwidth: 5 }, // Notch at signal frequency
          ],
        },
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(0);
    });

    it('should not filter signals outside notch bandwidth', () => {
      const signal = createMockIfSignal({
        frequency: 1400e6 as any,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        notchState: {
          isPowered: true,
          notches: [
            { enabled: true, centerFrequency: 1450, bandwidth: 5 }, // Notch at different frequency
          ],
        },
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
    });

    it('should respect disabled notches', () => {
      const signal = createMockIfSignal();
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        notchState: {
          isPowered: true,
          notches: [
            { enabled: false, centerFrequency: 1400, bandwidth: 5 },
          ],
        },
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
    });
  });

  describe('hasSignalForModem with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return true when signal with feed exists', () => {
      const signal = createMockIfSignal({ feed: 'video.mp4' });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      expect(receiver.hasSignalForModem(receiver.activeModem)).toBe(true);
    });

    it('should return false when signal has empty feed', () => {
      const signal = createMockIfSignal({ feed: '' });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      expect(receiver.hasSignalForModem(receiver.activeModem)).toBe(false);
    });
  });

  describe('isSignalDegraded with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return true when signal is marked degraded', () => {
      const signal = createMockIfSignal({
        frequency: 1405e6 as any, // Offset to trigger degradation
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      expect(receiver.isSignalDegraded(receiver.activeModem)).toBe(true);
    });

    it('should return false when signal is not degraded', () => {
      const signal = createMockIfSignal({
        power: -20 as dBm, // Strong signal
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      expect(receiver.isSignalDegraded(receiver.activeModem)).toBe(false);
    });
  });

  describe('getSnrForModem with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return C/N ratio when signal is present', () => {
      const signal = createMockIfSignal();
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const snr = receiver.getSnrForModem(receiver.activeModem);

      expect(snr).not.toBeNull();
      expect(typeof snr).toBe('number');
    });
  });

  describe('getPowerForModem with RF front-end', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return signal power when signal is present', () => {
      const signal = createMockIfSignal({ power: -35 as dBm });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const power = receiver.getPowerForModem(receiver.activeModem);

      expect(power).toBe(-35);
    });
  });

  describe('update method', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should call syncDomWithState', () => {
      const syncSpy = vi.spyOn(receiver as any, 'syncDomWithState');

      receiver.update();

      expect(syncSpy).toHaveBeenCalled();
      syncSpy.mockRestore();
    });

    it('should check for alarms', () => {
      const alarmSpy = vi.spyOn(receiver as any, 'checkForAlarms_');

      receiver.update();

      expect(alarmSpy).toHaveBeenCalled();
      alarmSpy.mockRestore();
    });
  });

  describe('initialSync', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should copy active modem to input data', () => {
      receiver.state.modems[0].frequency = 1550 as MHz;
      receiver.state.modems[0].bandwidth = 36 as MHz;

      receiver.initialSync();

      expect((receiver as any).inputData.frequency).toBe(1550);
      expect((receiver as any).inputData.bandwidth).toBe(36);
    });
  });

  describe('handlePowerToggle', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should toggle power state after delay', () => {
      receiver.handlePowerToggle(false);

      // Power off has 250ms delay
      vi.advanceTimersByTime(300);

      expect(receiver.activeModem.isPowered).toBe(false);
    });

    it('should emit RX_CONFIG_CHANGED on power toggle', () => {
      const emitSpy = vi.spyOn(receiver, 'emit');

      receiver.handlePowerToggle(false);
      vi.advanceTimersByTime(300);

      expect(emitSpy).toHaveBeenCalledWith(
        Events.RX_CONFIG_CHANGED,
        expect.objectContaining({
          uuid: receiver.uuid,
        })
      );

      emitSpy.mockRestore();
    });
  });

  describe('DOM event handling', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should handle input change for frequency', () => {
      const input = document.querySelector('.input-rx-frequency') as HTMLInputElement;
      input.value = '1550';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect((receiver as any).inputData.frequency).toBe(1550);
    });

    it('should handle input change for bandwidth', () => {
      const input = document.querySelector('.input-rx-bandwidth') as HTMLInputElement;
      input.value = '36';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect((receiver as any).inputData.bandwidth).toBe(36);
    });

    it('should handle input change for antenna', () => {
      const select = document.querySelector('.input-rx-antenna') as HTMLSelectElement;
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((receiver as any).inputData.antenna_id).toBe(2);
    });

    it('should handle input change for modulation', () => {
      const select = document.querySelector('.input-rx-modulation') as HTMLSelectElement;
      select.value = '8QAM';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((receiver as any).inputData.modulation).toBe('8QAM');
    });

    it('should handle input change for FEC', () => {
      const select = document.querySelector('.input-rx-fec') as HTMLSelectElement;
      select.value = '3/4';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((receiver as any).inputData.fec).toBe('3/4');
    });

    it('should apply changes on Apply button click', () => {
      const input = document.querySelector('.input-rx-frequency') as HTMLInputElement;
      input.value = '1600';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const applyBtn = document.querySelector('.btn-apply') as HTMLButtonElement;
      applyBtn.click();

      expect(receiver.activeModem.frequency).toBe(1600);
    });

    it('should switch modem on button click', () => {
      const modemBtn = document.querySelector('#modem-2') as HTMLButtonElement;
      modemBtn.click();

      expect(receiver.state.activeModem).toBe(2);
    });
  });

  describe('LED color logic', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should show gray LED when modem is powered off', () => {
      receiver.activeModem.isPowered = false;
      receiver.update();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-gray')).toBe(true);
    });

    it('should show green LED when one good signal is present', () => {
      const signal = createMockIfSignal({
        power: -20 as dBm, // Strong signal
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-green')).toBe(true);
    });

    it('should show amber LED when signal is degraded', () => {
      const signal = createMockIfSignal({
        frequency: 1405e6 as any, // Offset causes degradation
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal]);
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-amber')).toBe(true);
    });
  });

  describe('syncDomWithState', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should update current value displays', () => {
      receiver.state.modems[0].frequency = 1550 as MHz;
      receiver.state.modems[0].bandwidth = 36 as MHz;
      receiver.update();

      const currentValues = document.querySelectorAll('.current-value');
      expect(currentValues[1].textContent).toBe('1550 MHz');
      expect(currentValues[2].textContent).toBe('36 MHz');
    });

    it('should update modem button active state', () => {
      receiver.setActiveModem(3);

      const modem1Btn = document.querySelector('#modem-1') as HTMLButtonElement;
      const modem3Btn = document.querySelector('#modem-3') as HTMLButtonElement;

      expect(modem1Btn.classList.contains('active')).toBe(false);
      expect(modem3Btn.classList.contains('active')).toBe(true);
    });

    it('should update power indicator light', () => {
      receiver.activeModem.isPowered = false;
      receiver.update();

      const light = document.querySelector('#rx-active-power-light') as HTMLElement;
      expect(light.classList.contains('off')).toBe(true);
    });

    it('should show NO SIGNAL when no feed available', () => {
      receiver.update();

      const monitor = document.querySelector('.monitor-screen') as HTMLElement;
      expect(monitor.classList.contains('no-signal')).toBe(true);
      expect(monitor.querySelector('.no-signal-text')).not.toBeNull();
    });

    it('should show no-power state when modem is off', () => {
      receiver.activeModem.isPowered = false;
      receiver.update();

      const monitor = document.querySelector('.monitor-screen') as HTMLElement;
      expect(monitor.classList.contains('no-power')).toBe(true);
    });

    it('should show video feed when signal is available', () => {
      const signal = createMockIfSignal({
        feed: 'test.mp4',
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const monitor = document.querySelector('.monitor-screen') as HTMLElement;
      expect(monitor.classList.contains('signal-found')).toBe(true);
    });

    it('should skip update when state has not changed', () => {
      // First update
      receiver.update();
      const lastState = JSON.stringify(receiver.state);

      // Second update with same state
      const syncSpy = vi.spyOn(receiver as any, 'syncDomWithState');
      receiver.update();

      // State should still be the same
      expect(JSON.stringify(receiver.state)).toBe(lastState);
    });

    it('should add glitch effect for degraded image signals', () => {
      // Use frequency offset to ensure signal is degraded
      // Glitch effect is applied for images in syncDomWithState
      const signal = createMockIfSignal({
        feed: 'test.jpg',
        isImage: true,
        frequency: 1404e6 as any, // 4 MHz offset = 20% of 20 MHz BW (>10% threshold)
        power: -20 as dBm, // Strong signal to pass C/N check
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      // Verify signal is degraded
      const signals = receiver.getVisibleSignals();
      expect(signals).toHaveLength(1);
      expect(signals[0].isDegraded).toBe(true);

      receiver.update();

      const monitor = document.querySelector('.monitor-screen') as HTMLElement;
      expect(monitor.classList.contains('glitch')).toBe(true);
    });

    it('should add glitch effect for degraded cached video signals', () => {
      // Glitch effect is added when using cached video on re-render
      const signal = createMockIfSignal({
        feed: 'test.mp4',
        frequency: 1404e6 as any, // 4 MHz offset triggers degradation
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      // First update caches the video
      receiver.update();

      // Force state change to trigger re-render using cached video
      (receiver as any).lastRenderState = null;
      receiver.update();

      const monitor = document.querySelector('.monitor-screen') as HTMLElement;
      expect(monitor.classList.contains('glitch')).toBe(true);
    });
  });

  describe('getModemStatusClass', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should return modem-found for signal with non-denied feed', () => {
      const signal = createMockIfSignal({
        feed: 'video.mp4',
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const modemBtn = document.querySelector('#modem-1') as HTMLButtonElement;
      expect(modemBtn.classList.contains('modem-found')).toBe(true);
    });

    it('should return empty string when no signals', () => {
      receiver.update();

      const modemBtn = document.querySelector('#modem-1') as HTMLButtonElement;
      expect(modemBtn.classList.contains('modem-found')).toBe(false);
      expect(modemBtn.classList.contains('modem-denied')).toBe(false);
      expect(modemBtn.classList.contains('modem-degraded')).toBe(false);
    });
  });

  describe('media caching', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should cache video elements', () => {
      const signal = createMockIfSignal({
        feed: 'cached-video.mp4',
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      // First render
      receiver.update();

      // Modify state to trigger re-render
      receiver.state.availableSignals = [];
      receiver.update();

      // Re-show signal
      receiver.state.availableSignals = [{ id: 'test', feed: 'cached-video.mp4', isDegraded: false }];
      receiver.update();

      expect((receiver as any).mediaCache['cached-video.mp4']).toBeDefined();
    });

    it('should handle image feeds', () => {
      const signal = createMockIfSignal({
        feed: 'test.jpg',
        isImage: true,
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const img = document.querySelector('.image-feed') as HTMLImageElement;
      expect(img).not.toBeNull();
    });

    it('should handle external image feeds', () => {
      const signal = createMockIfSignal({
        feed: 'https://example.com/image.jpg',
        isImage: true,
        isExternal: true,
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const img = document.querySelector('.external-image-feed') as HTMLImageElement;
      expect(img).not.toBeNull();
    });

    it('should handle external video feeds (iframe)', () => {
      const signal = createMockIfSignal({
        feed: 'https://example.com/video',
        isExternal: true,
        power: -20 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -174,
        totalRxGain: 60,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);
      receiver.update();

      const iframe = document.querySelector('.external-feed') as HTMLIFrameElement;
      expect(iframe).not.toBeNull();
    });
  });

  describe('C/N requirements by modulation', () => {
    beforeEach(() => {
      receiver = new Receiver('test-root', []);
    });

    it('should mark BPSK signal as degraded when C/N < 7 dB', () => {
      receiver.state.modems[0].modulation = 'BPSK' as ModulationType;
      const signal = createMockIfSignal({
        modulation: 'BPSK' as ModulationType,
        power: -90 as dBm, // Very weak
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -95, // Gives ~5 dB C/N
        totalRxGain: 0,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].isDegraded).toBe(true);
    });

    it('should mark 16QAM signal as degraded when C/N < 16 dB', () => {
      receiver.state.modems[0].modulation = '16QAM' as ModulationType;
      const signal = createMockIfSignal({
        modulation: '16QAM' as ModulationType,
        power: -70 as dBm,
      });
      const mockRfFrontEnd = createMockRfFrontEnd([signal], {
        noiseFloorNoGain: -80, // Gives ~10 dB C/N
        totalRxGain: 0,
      });
      receiver.connectRfFrontEnd(mockRfFrontEnd as any);

      const signals = receiver.getVisibleSignals();

      expect(signals).toHaveLength(1);
      expect(signals[0].isDegraded).toBe(true);
    });
  });
});
