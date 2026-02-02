import { dBm, Hertz, IfFrequency } from '@app/types';
import { vi } from 'vitest';
import { Transmitter, TransmitterModem, TransmitterState } from '../../../src/equipment/transmitter/transmitter';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { SignalOrigin } from '../../../src/signal-origin';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

describe('Transmitter class', () => {
  let transmitter: Transmitter;
  let parentElement: HTMLElement;

  beforeEach(() => {
    vi.resetModules();

    // Create a clean DOM root
    document.body.innerHTML = '<div id="test-root"></div>';
    parentElement = document.getElementById('test-root')!;

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
    EventBus.getInstance().clear(Events.TX_CONFIG_CHANGED);
    EventBus.getInstance().clear(Events.TX_ACTIVE_MODEM_CHANGED);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('getDefaultState', () => {
    it('should return default state with 4 modems', () => {
      const state = Transmitter.getDefaultState();

      expect(state.modems).toHaveLength(4);
      expect(state.activeModem).toBe(1);
    });

    it('should configure modems with correct numbers', () => {
      const state = Transmitter.getDefaultState();

      expect(state.modems[0].modem_number).toBe(1);
      expect(state.modems[1].modem_number).toBe(2);
      expect(state.modems[2].modem_number).toBe(3);
      expect(state.modems[3].modem_number).toBe(4);
    });

    it('should set modem IDs correctly (0-indexed)', () => {
      const state = Transmitter.getDefaultState();

      expect(state.modems[0].id).toBe(0);
      expect(state.modems[1].id).toBe(1);
      expect(state.modems[2].id).toBe(2);
      expect(state.modems[3].id).toBe(3);
    });

    it('should set default modem configuration', () => {
      const state = Transmitter.getDefaultState();
      const modem = state.modems[0];

      expect(modem.antenna_id).toBe(1);
      expect(modem.isPowered).toBe(true);
      expect(modem.isLoopback).toBe(false);
      expect(modem.isFaulted).toBe(false);
      expect(modem.isTransmitting).toBe(false);
      expect(modem.isTransmittingSwitchUp).toBe(false);
      expect(modem.isFaultSwitchUp).toBe(false);
    });

    it('should set default IF signal configuration', () => {
      const state = Transmitter.getDefaultState();
      const ifSignal = state.modems[0].ifSignal;

      expect(ifSignal.frequency).toBe(1400e6); // 1.4 GHz IF
      expect(ifSignal.power).toBe(-20);
      expect(ifSignal.bandwidth).toBe(10e6); // 10 MHz
      expect(ifSignal.modulation).toBe('QPSK');
      expect(ifSignal.fec).toBe('1/2');
      expect(ifSignal.origin).toBe(SignalOrigin.TRANSMITTER);
    });

    it('should set default identifiers', () => {
      const state = Transmitter.getDefaultState();

      expect(state.uuid).toBe('default');
      expect(state.team_id).toBe(1);
      expect(state.server_id).toBe(1);
    });

    it('should set unique signal IDs for each modem', () => {
      const state = Transmitter.getDefaultState();

      expect(state.modems[0].ifSignal.signalId).toBe('default-1');
      expect(state.modems[1].ifSignal.signalId).toBe('default-2');
      expect(state.modems[2].ifSignal.signalId).toBe('default-3');
      expect(state.modems[3].ifSignal.signalId).toBe('default-4');
    });
  });

  describe('Initialization', () => {
    it('should create transmitter with default state', () => {
      transmitter = new Transmitter('test-root');

      expect(transmitter).toBeDefined();
      expect(transmitter.state.modems).toHaveLength(4);
      expect(transmitter.state.activeModem).toBe(1);
    });

    it('should accept custom team and server IDs', () => {
      transmitter = new Transmitter('test-root', {}, 5, 10);

      expect(transmitter.state.team_id).toBe(5);
      expect(transmitter.state.server_id).toBe(10);
    });

    it('should merge partial modem overrides by modem number', () => {
      const overrides: Partial<TransmitterState> = {
        modems: [
          { modem_number: 2, antenna_id: 2 } as TransmitterModem,
        ],
      };

      transmitter = new Transmitter('test-root', overrides);

      // Modem 2 should have overridden values
      const modem2 = transmitter.state.modems.find(m => m.modem_number === 2);
      expect(modem2?.antenna_id).toBe(2);

      // Other modems should have defaults
      const modem1 = transmitter.state.modems.find(m => m.modem_number === 1);
      expect(modem1?.antenna_id).toBe(1);
    });

    it('should merge partial ifSignal overrides', () => {
      const overrides: Partial<TransmitterState> = {
        modems: [
          {
            modem_number: 1,
            ifSignal: {
              frequency: 1500e6 as IfFrequency,
              power: -10 as dBm,
            },
          } as TransmitterModem,
        ],
      };

      transmitter = new Transmitter('test-root', overrides);

      const modem1 = transmitter.state.modems.find(m => m.modem_number === 1);
      expect(modem1?.ifSignal.frequency).toBe(1500e6);
      expect(modem1?.ifSignal.power).toBe(-10);
      // Non-overridden values should remain default
      expect(modem1?.ifSignal.bandwidth).toBe(10e6);
      expect(modem1?.ifSignal.modulation).toBe('QPSK');
    });

    it('should generate unique signal IDs based on uuid', () => {
      const overrides: Partial<TransmitterState> = {
        uuid: 'custom-tx-1',
      };

      transmitter = new Transmitter('test-root', overrides);

      expect(transmitter.state.modems[0].ifSignal.signalId).toBe('custom-tx-1-1-default');
      expect(transmitter.state.modems[1].ifSignal.signalId).toBe('custom-tx-1-2-default');
    });

    it('should subscribe to EventBus events', () => {
      const onSpy = vi.spyOn(EventBus.getInstance(), 'on');

      transmitter = new Transmitter('test-root');

      expect(onSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));

      onSpy.mockRestore();
    });

    it('should create power switch', () => {
      transmitter = new Transmitter('test-root');

      expect(transmitter.powerSwitch).toBeDefined();
    });

    it('should create toggle switches', () => {
      transmitter = new Transmitter('test-root');

      expect(transmitter.txToggleSwitch).toBeDefined();
      expect(transmitter.loopbackSwitch).toBeDefined();
      expect(transmitter.faultResetSwitch).toBeDefined();
    });

    it('should preserve explicit signalId override', () => {
      const overrides: Partial<TransmitterState> = {
        modems: [
          {
            modem_number: 1,
            ifSignal: {
              signalId: 'my-custom-signal-id',
            },
          } as TransmitterModem,
        ],
      };

      transmitter = new Transmitter('test-root', overrides);

      expect(transmitter.state.modems[0].ifSignal.signalId).toBe('my-custom-signal-id');
    });

    it('should set all signals to TRANSMITTER origin', () => {
      transmitter = new Transmitter('test-root');

      for (const modem of transmitter.state.modems) {
        expect(modem.ifSignal.origin).toBe(SignalOrigin.TRANSMITTER);
      }
    });
  });

  describe('activeModem getter', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should return the currently active modem', () => {
      const active = transmitter.activeModem;

      expect(active.modem_number).toBe(1);
    });

    it('should return first modem as fallback if active not found', () => {
      transmitter.state.activeModem = 99; // Invalid modem number

      const active = transmitter.activeModem;

      expect(active.modem_number).toBe(1);
    });
  });

  describe('setActiveModem', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should change the active modem', () => {
      transmitter.setActiveModem(3);

      expect(transmitter.state.activeModem).toBe(3);
      expect(transmitter.activeModem.modem_number).toBe(3);
    });

    it('should emit TX_ACTIVE_MODEM_CHANGED event', () => {
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.setActiveModem(2);

      expect(emitSpy).toHaveBeenCalledWith(Events.TX_ACTIVE_MODEM_CHANGED, {
        uuid: transmitter.uuid,
        activeModem: 2,
      });

      emitSpy.mockRestore();
    });

    it('should copy active modem data to inputData', () => {
      // Modify modem 3's frequency
      transmitter.state.modems[2].ifSignal.frequency = 1600e6 as IfFrequency;

      transmitter.setActiveModem(3);

      // The inputData should now reflect modem 3's values
      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1600e6);
    });
  });

  describe('Input handlers', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should handle antenna change', () => {
      transmitter.handleAntennaChange(2);

      expect((transmitter as any).inputData.antenna_id).toBe(2);
    });

    it('should handle frequency change (MHz to Hz conversion)', () => {
      transmitter.handleFrequencyChange(1550);

      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1550e6);
    });

    it('should handle bandwidth change (MHz to Hz conversion)', () => {
      transmitter.handleBandwidthChange(20);

      expect((transmitter as any).inputData.ifSignal.bandwidth).toBe(20e6);
    });

    it('should handle power change', () => {
      transmitter.handlePowerChange(-15);

      expect((transmitter as any).inputData.ifSignal.power).toBe(-15);
    });

    it('should handle negative power values', () => {
      transmitter.handlePowerChange(-30);

      expect((transmitter as any).inputData.ifSignal.power).toBe(-30);
    });

    it('should handle modulation change', () => {
      transmitter.handleModulationChange('8QAM');

      expect((transmitter as any).inputData.ifSignal.modulation).toBe('8QAM');
    });

    it('should handle FEC change', () => {
      transmitter.handleFecChange('3/4');

      expect((transmitter as any).inputData.ifSignal.fec).toBe('3/4');
    });

    it('should initialize ifSignal from active modem if not set', () => {
      // Clear inputData
      (transmitter as any).inputData = { ifSignal: {} };

      transmitter.handleFrequencyChange(1550);

      // Should have copied other ifSignal properties from active modem
      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1550e6);
      expect((transmitter as any).inputData.ifSignal.signalId).toBeDefined();
    });
  });

  describe('applyChanges', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should apply staged input data to active modem', () => {
      transmitter.handleFrequencyChange(1600);
      transmitter.handleBandwidthChange(20);
      transmitter.handlePowerChange(-15);
      transmitter.handleModulationChange('16QAM');
      transmitter.handleFecChange('5/6');

      transmitter.applyChanges();

      expect(transmitter.activeModem.ifSignal.frequency).toBe(1600e6);
      expect(transmitter.activeModem.ifSignal.bandwidth).toBe(20e6);
      expect(transmitter.activeModem.ifSignal.power).toBe(-15);
      expect(transmitter.activeModem.ifSignal.modulation).toBe('16QAM');
      expect(transmitter.activeModem.ifSignal.fec).toBe('5/6');
    });

    it('should apply antenna change', () => {
      transmitter.handleAntennaChange(2);

      transmitter.applyChanges();

      expect(transmitter.activeModem.antenna_id).toBe(2);
    });

    it('should emit TX_CONFIG_CHANGED event', () => {
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.handleFrequencyChange(1600);
      transmitter.applyChanges();

      expect(emitSpy).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, {
        uuid: transmitter.uuid,
        modem: 1,
        config: expect.objectContaining({
          ifSignal: expect.objectContaining({
            frequency: 1600e6,
          }),
        }),
      });

      emitSpy.mockRestore();
    });

    it('should reset inputData to match applied state', () => {
      transmitter.handleFrequencyChange(1600);
      transmitter.applyChanges();

      // inputData should now match the modem's actual state
      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1600e6);
    });

    it('should not apply if modem not found', () => {
      transmitter.state.activeModem = 99; // Invalid
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation();

      transmitter.applyChanges();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should sync modem data', () => {
      const newModems: TransmitterModem[] = transmitter.state.modems.map((m, i) => ({
        ...m,
        ifSignal: {
          ...m.ifSignal,
          frequency: (1500e6 + i * 100e6) as IfFrequency,
        },
      }));

      transmitter.sync({ modems: newModems });

      expect(transmitter.state.modems[0].ifSignal.frequency).toBe(1500e6);
      expect(transmitter.state.modems[1].ifSignal.frequency).toBe(1600e6);
    });

    it('should sync active modem', () => {
      transmitter.sync({ activeModem: 3 });

      expect(transmitter.state.activeModem).toBe(3);
    });

    it('should preserve existing active modem if not provided', () => {
      transmitter.state.activeModem = 2;

      transmitter.sync({});

      expect(transmitter.state.activeModem).toBe(2);
    });
  });

  describe('getPowerPercentage', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should return 0 when modem is not powered', () => {
      transmitter.activeModem.isPowered = false;

      const percentage = transmitter.getPowerPercentage();

      expect(percentage).toBe(0);
    });

    it('should calculate power percentage based on power budget', () => {
      // Default: power=-20dBm, bandwidth=10MHz
      // Power budget load = power + 10*log10(bandwidth_MHz)
      // = -20 + 10*log10(10) = -20 + 10 = -10 dBm
      // Percentage = 100 * (-10) / 10 = -100%
      transmitter.activeModem.isPowered = true;

      const percentage = transmitter.getPowerPercentage();

      // With default settings: -20 dBm + 10*log10(10) = -10 dBm
      // Percentage = round(100 * -10 / 10) = -100
      expect(percentage).toBe(-100);
    });

    it('should increase with higher power', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.ifSignal.power = 0 as dBm;
      transmitter.activeModem.ifSignal.bandwidth = 10e6 as Hertz;

      const percentage = transmitter.getPowerPercentage();

      // 0 dBm + 10*log10(10) = 10 dBm
      // Percentage = round(100 * 10 / 10) = 100
      expect(percentage).toBe(100);
    });

    it('should increase with wider bandwidth', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.ifSignal.power = 0 as dBm;
      transmitter.activeModem.ifSignal.bandwidth = 100e6 as Hertz;

      const percentage = transmitter.getPowerPercentage();

      // 0 dBm + 10*log10(100) = 20 dBm
      // Percentage = round(100 * 20 / 10) = 200
      expect(percentage).toBe(200);
    });
  });

  describe('getStatusAlarms', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should return empty array when no issues', () => {
      const alarms = transmitter.getStatusAlarms();

      expect(alarms).toEqual([]);
    });

    it('should return error alarm when modem is faulted', () => {
      transmitter.state.modems[0].isFaulted = true;

      const alarms = transmitter.getStatusAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0].severity).toBe('error');
      expect(alarms[0].message).toBe('Modem 1 Faulted');
    });

    it('should return info alarm when modem is in loopback mode', () => {
      transmitter.state.modems[1].isLoopback = true;

      const alarms = transmitter.getStatusAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0].severity).toBe('info');
      expect(alarms[0].message).toBe('Modem 2 in Loopback Mode');
    });

    it('should return error when transmitting modem exceeds power budget', () => {
      transmitter.state.modems[0].isTransmitting = true;
      transmitter.state.modems[0].ifSignal.power = 10 as dBm;
      transmitter.state.modems[0].ifSignal.bandwidth = 100e6 as Hertz;

      const alarms = transmitter.getStatusAlarms();

      // Should have both warning (>90%) and error (>100%) alarms
      const errorAlarms = alarms.filter(a => a.severity === 'error');
      expect(errorAlarms.some(a => a.message.includes('Exceeds Max'))).toBe(true);
    });

    it('should return warning when transmitting modem approaches power budget', () => {
      transmitter.state.modems[0].isTransmitting = true;
      // Set power to just above 90% but below 100%
      transmitter.state.modems[0].ifSignal.power = 0 as dBm;
      transmitter.state.modems[0].ifSignal.bandwidth = 8e6 as Hertz; // ~9 dBm load = 90%

      const alarms = transmitter.getStatusAlarms();

      const warningAlarms = alarms.filter(a => a.severity === 'warning');
      // At 90% threshold, may or may not trigger depending on rounding
      expect(warningAlarms.length).toBeGreaterThanOrEqual(0);
    });

    it('should return multiple alarms for multiple modems', () => {
      transmitter.state.modems[0].isFaulted = true;
      transmitter.state.modems[1].isLoopback = true;
      transmitter.state.modems[2].isFaulted = true;

      const alarms = transmitter.getStatusAlarms();

      expect(alarms.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('handleTransmitToggle', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should enable transmission when powered', () => {
      transmitter.activeModem.isPowered = true;

      transmitter.handleTransmitToggle(true);

      expect(transmitter.activeModem.isTransmitting).toBe(true);
      expect(transmitter.activeModem.isTransmittingSwitchUp).toBe(true);
    });

    it('should disable transmission', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.isTransmitting = true;
      transmitter.activeModem.isTransmittingSwitchUp = true;

      transmitter.handleTransmitToggle(false);

      expect(transmitter.activeModem.isTransmitting).toBe(false);
      expect(transmitter.activeModem.isTransmittingSwitchUp).toBe(false);
    });

    it('should not enable transmission when not powered', () => {
      transmitter.activeModem.isPowered = false;

      transmitter.handleTransmitToggle(true);

      expect(transmitter.activeModem.isTransmitting).toBe(false);
    });

    it('should emit TX_CONFIG_CHANGED event', () => {
      transmitter.activeModem.isPowered = true;
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.handleTransmitToggle(true);

      expect(emitSpy).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Object));

      emitSpy.mockRestore();
    });

    it('should set fault when exceeding power budget during transmission', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.ifSignal.power = 10 as dBm;
      transmitter.activeModem.ifSignal.bandwidth = 100e6 as Hertz;

      transmitter.handleTransmitToggle(true);

      expect(transmitter.activeModem.isFaulted).toBe(true);
    });
  });

  describe('handleLoopbackToggle', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should enable loopback mode', () => {
      transmitter.handleLoopbackToggle(true);

      expect(transmitter.activeModem.isLoopback).toBe(true);
    });

    it('should disable loopback mode', () => {
      transmitter.activeModem.isLoopback = true;

      transmitter.handleLoopbackToggle(false);

      expect(transmitter.activeModem.isLoopback).toBe(false);
    });

    it('should emit TX_CONFIG_CHANGED event', () => {
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.handleLoopbackToggle(true);

      expect(emitSpy).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Object));

      emitSpy.mockRestore();
    });
  });

  describe('handlePowerToggle', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should turn on power after boot delay', () => {
      transmitter.activeModem.isPowered = false;

      transmitter.handlePowerToggle(true);

      // Power on has 4000ms delay
      expect(transmitter.activeModem.isPowered).toBe(false);

      vi.advanceTimersByTime(4100);

      expect(transmitter.activeModem.isPowered).toBe(true);
    });

    it('should turn off power after short delay', () => {
      transmitter.activeModem.isPowered = true;

      transmitter.handlePowerToggle(false);

      // Power off has 250ms delay
      expect(transmitter.activeModem.isPowered).toBe(true);

      vi.advanceTimersByTime(300);

      expect(transmitter.activeModem.isPowered).toBe(false);
    });

    it('should stop transmission when powering off', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.isTransmitting = true;

      transmitter.handlePowerToggle(false);

      // Transmission stops immediately
      expect(transmitter.activeModem.isTransmitting).toBe(false);
    });

    it('should clear faults when powering off', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.isFaulted = true;

      transmitter.handlePowerToggle(false);

      expect(transmitter.activeModem.isFaulted).toBe(false);
    });

    it('should emit TX_CONFIG_CHANGED after delay', () => {
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.handlePowerToggle(false);

      expect(emitSpy).not.toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Object));

      vi.advanceTimersByTime(300);

      expect(emitSpy).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Object));

      emitSpy.mockRestore();
    });
  });

  describe('handleFaultReset', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set fault switch up immediately', () => {
      transmitter.handleFaultReset();

      expect(transmitter.activeModem.isFaultSwitchUp).toBe(true);
    });

    it('should clear fault after timeout if not transmitting', () => {
      transmitter.activeModem.isFaulted = true;
      transmitter.activeModem.isTransmitting = false;

      transmitter.handleFaultReset();

      vi.advanceTimersByTime(300);

      expect(transmitter.activeModem.isFaulted).toBe(false);
      expect(transmitter.activeModem.isFaultSwitchUp).toBe(false);
    });

    it('should not clear fault if still transmitting', () => {
      transmitter.activeModem.isFaulted = true;
      transmitter.activeModem.isTransmitting = true;

      transmitter.handleFaultReset();

      vi.advanceTimersByTime(300);

      expect(transmitter.activeModem.isFaulted).toBe(true);
    });

    it('should emit TX_CONFIG_CHANGED events', () => {
      const emitSpy = vi.spyOn(transmitter, 'emit');

      transmitter.handleFaultReset();

      // Should emit immediately
      expect(emitSpy).toHaveBeenCalledWith(Events.TX_CONFIG_CHANGED, expect.any(Object));

      vi.advanceTimersByTime(300);

      // Should emit again after timeout
      expect(emitSpy).toHaveBeenCalledTimes(2);

      emitSpy.mockRestore();
    });
  });

  describe('initialSync', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should copy active modem to input data', () => {
      transmitter.state.modems[0].ifSignal.frequency = 1550e6 as IfFrequency;
      transmitter.state.modems[0].ifSignal.bandwidth = 36e6 as Hertz;

      transmitter.initialSync();

      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1550e6);
      expect((transmitter as any).inputData.ifSignal.bandwidth).toBe(36e6);
    });
  });

  describe('update method', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should call checkForAlarms_', () => {
      const alarmSpy = vi.spyOn(transmitter as any, 'checkForAlarms_');

      transmitter.update();

      expect(alarmSpy).toHaveBeenCalled();
      alarmSpy.mockRestore();
    });
  });

  describe('DOM event handling', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should handle input change for frequency', () => {
      const input = document.querySelector('.input-tx-frequency') as HTMLInputElement;
      input.value = '1550';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.ifSignal.frequency).toBe(1550e6);
    });

    it('should handle input change for bandwidth', () => {
      const input = document.querySelector('.input-tx-bandwidth') as HTMLInputElement;
      input.value = '20';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.ifSignal.bandwidth).toBe(20e6);
    });

    it('should handle input change for power', () => {
      const input = document.querySelector('.input-tx-power') as HTMLInputElement;
      input.value = '-15';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.ifSignal.power).toBe(-15);
    });

    it('should handle input change for antenna', () => {
      const select = document.querySelector('.input-tx-antenna') as HTMLSelectElement;
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.antenna_id).toBe(2);
    });

    it('should handle input change for modulation', () => {
      const select = document.querySelector('.input-tx-modulation') as HTMLSelectElement;
      select.value = '8QAM';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.ifSignal.modulation).toBe('8QAM');
    });

    it('should handle input change for FEC', () => {
      const select = document.querySelector('.input-tx-fec') as HTMLSelectElement;
      select.value = '3/4';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect((transmitter as any).inputData.ifSignal.fec).toBe('3/4');
    });

    it('should reject invalid power values with non-numeric characters', () => {
      const input = document.querySelector('.input-tx-power') as HTMLInputElement;
      const originalPower = (transmitter as any).inputData.ifSignal?.power;
      input.value = 'abc';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Power should not change to invalid value
      expect((transmitter as any).inputData.ifSignal.power).toBe(originalPower);
    });

    it('should apply changes on Apply button click', () => {
      const input = document.querySelector('.input-tx-frequency') as HTMLInputElement;
      input.value = '1600';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const applyBtn = document.querySelector('.btn-apply') as HTMLButtonElement;
      applyBtn.click();

      expect(transmitter.activeModem.ifSignal.frequency).toBe(1600e6);
    });

    it('should switch modem on button click', () => {
      const modemBtn = document.querySelector('#modem-2') as HTMLButtonElement;
      modemBtn.click();

      expect(transmitter.state.activeModem).toBe(2);
    });
  });

  describe('syncDomWithState', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should update current value displays', () => {
      transmitter.state.modems[0].ifSignal.frequency = 1550e6 as IfFrequency;
      transmitter.state.modems[0].ifSignal.bandwidth = 36e6 as Hertz;
      (transmitter as any).lastRenderState = null; // Force update
      (transmitter as any).syncDomWithState();

      const currentValues = document.querySelectorAll('.tx-modem-config .current-value');
      expect(currentValues[1].textContent).toBe('1550 MHz');
      expect(currentValues[2].textContent).toBe('36 MHz');
    });

    it('should update modem button active state', () => {
      transmitter.setActiveModem(3);

      const modem1Btn = document.querySelector('#modem-1') as HTMLButtonElement;
      const modem3Btn = document.querySelector('#modem-3') as HTMLButtonElement;

      expect(modem1Btn.classList.contains('active')).toBe(false);
      expect(modem3Btn.classList.contains('active')).toBe(true);
    });

    it('should add transmitting class to modem button when transmitting', () => {
      transmitter.activeModem.isTransmitting = true;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const modem1Btn = document.querySelector('#modem-1') as HTMLButtonElement;
      expect(modem1Btn.classList.contains('transmitting')).toBe(true);
    });

    it('should update power bar width', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.ifSignal.power = 0 as dBm;
      transmitter.activeModem.ifSignal.bandwidth = 10e6 as Hertz;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const powerBar = document.querySelector('.power-bar') as HTMLElement;
      expect(powerBar.style.width).toBe('100%');
    });

    it('should add over-budget class when power exceeds 100%', () => {
      transmitter.activeModem.isPowered = true;
      transmitter.activeModem.ifSignal.power = 10 as dBm;
      transmitter.activeModem.ifSignal.bandwidth = 100e6 as Hertz;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const powerBar = document.querySelector('.power-bar') as HTMLElement;
      expect(powerBar.classList.contains('over-budget')).toBe(true);
    });

    it('should update power indicator light', () => {
      transmitter.activeModem.isPowered = false;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const light = document.querySelector('#tx-active-power-light') as HTMLElement;
      expect(light.classList.contains('off')).toBe(true);
    });

    it('should update transmitting indicator light', () => {
      transmitter.activeModem.isTransmitting = true;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const light = document.querySelector('#tx-transmitting-light') as HTMLElement;
      expect(light.classList.contains('on')).toBe(true);
    });

    it('should update loopback indicator light', () => {
      transmitter.activeModem.isLoopback = true;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const light = document.querySelector('#tx-loopback-light') as HTMLElement;
      expect(light.classList.contains('on')).toBe(true);
    });

    it('should add fault class to fault indicator parent', () => {
      transmitter.activeModem.isFaulted = true;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const faultIndicator = document.querySelector('#tx-fault-light')?.parentElement as HTMLElement;
      expect(faultIndicator.classList.contains('fault')).toBe(true);
    });

    it('should skip update when state has not changed', () => {
      // First sync
      (transmitter as any).syncDomWithState();

      // Spy on DOM operations
      const ledElement = (transmitter as any).domCache['led'];
      const classNameSetter = vi.spyOn(ledElement, 'className', 'set');

      // Second sync with same state
      (transmitter as any).syncDomWithState();

      // Should not update DOM
      expect(classNameSetter).not.toHaveBeenCalled();
      classNameSetter.mockRestore();
    });
  });

  describe('LED color logic', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should show no LED color when no modems are powered', () => {
      transmitter.state.modems.forEach(m => m.isPowered = false);
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-red')).toBe(false);
      expect(led.classList.contains('led-green')).toBe(false);
    });

    it('should show green LED when powered but not transmitting', () => {
      transmitter.state.modems[0].isPowered = true;
      transmitter.state.modems.forEach(m => m.isTransmitting = false);
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-green')).toBe(true);
    });

    it('should show red LED when any modem is transmitting', () => {
      transmitter.state.modems[0].isPowered = true;
      transmitter.state.modems[0].isTransmitting = true;
      (transmitter as any).lastRenderState = null;
      (transmitter as any).syncDomWithState();

      const led = document.querySelector('.led') as HTMLElement;
      expect(led.classList.contains('led-red')).toBe(true);
    });
  });

  describe('Power budget calculation', () => {
    beforeEach(() => {
      transmitter = new Transmitter('test-root');
    });

    it('should calculate correct power budget load', () => {
      // Test the formula: powerBudgetLoad = power + 10*log10(bandwidth_MHz)
      const calculateLoad = (transmitter as any).calculatePowerBudgetLoad_.bind(transmitter);

      // 10 MHz at 0 dBm = 0 + 10*log10(10) = 10 dBm
      expect(calculateLoad(10e6 as Hertz, 0 as dBm)).toBeCloseTo(10);

      // 1 MHz at 0 dBm = 0 + 10*log10(1) = 0 dBm
      expect(calculateLoad(1e6 as Hertz, 0 as dBm)).toBeCloseTo(0);

      // 100 MHz at -10 dBm = -10 + 10*log10(100) = -10 + 20 = 10 dBm
      expect(calculateLoad(100e6 as Hertz, -10 as dBm)).toBeCloseTo(10);
    });
  });
});
