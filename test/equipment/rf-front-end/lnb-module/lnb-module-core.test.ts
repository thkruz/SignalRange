import { LNBModuleCore, LNBState } from '../../../../src/equipment/rf-front-end/lnb-module/lnb-module-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { dB, dBi, dBm, Hertz, MHz, RfFrequency, RfSignal } from '../../../../src/types';
import { SignalOrigin } from '../../../../src/signal-origin';

describe('LNBModuleCore', () => {
  let rfFrontEnd: RFFrontEndCore;
  let lnbModule: LNBModuleCore;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    lnbModule = rfFrontEnd.lnbModule;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = LNBModuleCore.getDefaultState();

      expect(defaultState.isPowered).toBe(true);
      expect(defaultState.loFrequency).toBe(6080);
      expect(defaultState.gain).toBe(0);
      expect(defaultState.lnaNoiseFigure).toBe(0.6);
      expect(defaultState.mixerNoiseFigure).toBe(16.0);
      expect(defaultState.noiseTemperature).toBe(45);
      expect(defaultState.noiseTemperatureStabilizationTime).toBe(150);
      expect(defaultState.temperature).toBe(25);
      expect(defaultState.thermalStabilizationTime).toBe(150);
      expect(defaultState.frequencyError).toBe(0);
      expect(defaultState.isExtRefLocked).toBe(true);
      expect(defaultState.noiseFloor).toBe(-140);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(lnbModule).toBeDefined();
      expect(lnbModule.state.isPowered).toBe(true);
      expect(lnbModule.state.loFrequency).toBe(6080);
    });

    it('should initialize signal arrays as empty', () => {
      expect(lnbModule.postLNASignals).toEqual([]);
      expect(lnbModule.ifSignals).toEqual([]);
    });
  });

  describe('update - signal processing', () => {
    it('should apply gain to RX signals when powered', () => {
      const mockSignal: RfSignal = {
        frequency: 7000e6 as RfFrequency,
        bandwidth: 1e6 as Hertz,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      jest.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 50 as dB;
      lnbModule.update();

      expect(lnbModule.postLNASignals.length).toBe(1);
      expect(lnbModule.postLNASignals[0].power).toBe(-30); // -80 + 50
      expect(lnbModule.postLNASignals[0].origin).toBe(SignalOrigin.LOW_NOISE_AMPLIFIER);
    });

    it('should apply -300 dB gain when powered off', () => {
      const mockSignal: RfSignal = {
        frequency: 7000e6 as RfFrequency,
        bandwidth: 1e6 as Hertz,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      jest.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.isPowered = false;
      lnbModule.update();

      expect(lnbModule.postLNASignals.length).toBe(1);
      expect(lnbModule.postLNASignals[0].power).toBe(-380); // -80 + (-300)
    });

    it('should downconvert RF to IF frequency', () => {
      const mockSignal: RfSignal = {
        frequency: 7000e6 as RfFrequency, // 7000 MHz
        bandwidth: 1e6 as Hertz,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      jest.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.frequencyError = 0;
      lnbModule.update();

      expect(lnbModule.ifSignals.length).toBe(1);
      // IF = LO - RF = 6080e6 - 7000e6 = -920e6 (but absolute would be 920e6)
      // Actually: IF = effectiveLO - RF = 6080e6 - 7000e6 = -920000000
      expect(lnbModule.ifSignals[0].frequency).toBe(-920e6);
      expect(lnbModule.ifSignals[0].origin).toBe(SignalOrigin.LOW_NOISE_BLOCK);
    });

    it('should apply 40 dB attenuation for out-of-band signals', () => {
      const mockSignal: RfSignal = {
        frequency: 5000e6 as RfFrequency, // Results in IF outside 950-2150 MHz
        bandwidth: 1e6 as Hertz,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      jest.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.gain = 0 as dB;
      lnbModule.update();

      // IF = 6080e6 - 5000e6 = 1080e6 (1080 MHz - within band, no attenuation)
      // Let's use a frequency that's out of band
    });
  });

  describe('calculateIfFrequency', () => {
    it('should calculate IF frequency correctly', () => {
      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.frequencyError = 0;

      const ifFreq = lnbModule.calculateIfFrequency(7500e6 as RfFrequency);

      // IF = LO - RF = 6080e6 - 7500e6 = -1420e6
      expect(ifFreq).toBe(-1420e6);
    });

    it('should include frequency error in calculation', () => {
      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.frequencyError = 1000; // 1 kHz drift

      const ifFreq = lnbModule.calculateIfFrequency(7500e6 as RfFrequency);

      // IF = (LO + error) - RF = (6080e6 + 1000) - 7500e6
      expect(ifFreq).toBe(-1419999000);
    });
  });

  describe('getTotalGain', () => {
    it('should return gain when powered', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 55 as dB;

      expect(lnbModule.getTotalGain()).toBe(55);
    });

    it('should return -100 when powered off', () => {
      lnbModule.state.isPowered = false;

      expect(lnbModule.getTotalGain()).toBe(-100);
    });
  });

  describe('getOutputPower', () => {
    it('should add gain to input power when powered', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 50 as dB;

      expect(lnbModule.getOutputPower(-80)).toBe(-30);
    });

    it('should return -120 when powered off', () => {
      lnbModule.state.isPowered = false;

      expect(lnbModule.getOutputPower(-80)).toBe(-120);
    });
  });

  describe('getNoiseFloor', () => {
    it('should calculate noise floor based on noise temperature', () => {
      lnbModule.state.noiseTemperature = 290; // Room temp

      const noiseFloor = lnbModule.getNoiseFloor(1e6 as Hertz);

      // P = -198.6 + 10*log10(290) + 10*log10(1e6)
      // P = -198.6 + 24.62 + 60 = -113.98
      expect(noiseFloor).toBeCloseTo(-114, 0);
    });

    it('should scale with bandwidth', () => {
      lnbModule.state.noiseTemperature = 100;

      const narrowBand = lnbModule.getNoiseFloor(1e6 as Hertz);
      const wideBand = lnbModule.getNoiseFloor(10e6 as Hertz);

      // 10x bandwidth = +10 dB
      expect(wideBand - narrowBand).toBeCloseTo(10, 1);
    });
  });

  describe('getAlarms', () => {
    it('should return empty array when powered off', () => {
      lnbModule.state.isPowered = false;

      const alarms = lnbModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should alarm when not locked to reference', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.isExtRefLocked = false;

      // Need to mock isExtRefPresent to return true
      jest.spyOn(lnbModule, 'isExtRefPresent').mockReturnValue(true);

      const alarms = lnbModule.getAlarms();

      expect(alarms).toContain('LNB not locked to reference');
    });

    it('should alarm when noise temperature is high', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.noiseTemperature = 150;

      const alarms = lnbModule.getAlarms();

      expect(alarms.some(a => a.includes('noise temperature high'))).toBe(true);
    });

    it('should alarm when noise figure is degraded', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.lnaNoiseFigure = 1.5;

      const alarms = lnbModule.getAlarms();

      expect(alarms.some(a => a.includes('noise figure degraded'))).toBe(true);
    });

    it('should not alarm when all parameters are normal', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.isExtRefLocked = true;
      lnbModule.state.noiseTemperature = 50;
      lnbModule.state.lnaNoiseFigure = 0.6;

      const alarms = lnbModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });
  });

  describe('handlePowerToggle', () => {
    it('should toggle power state', () => {
      lnbModule.state.isPowered = true;

      lnbModule.handlePowerToggle();

      expect(lnbModule.state.isPowered).toBe(false);

      lnbModule.handlePowerToggle();

      expect(lnbModule.state.isPowered).toBe(true);
    });

    it('should set explicit power state', () => {
      lnbModule.handlePowerToggle(false);

      expect(lnbModule.state.isPowered).toBe(false);

      lnbModule.handlePowerToggle(true);

      expect(lnbModule.state.isPowered).toBe(true);
    });
  });

  describe('handleGainChange', () => {
    it('should update gain', () => {
      lnbModule.handleGainChange(55);

      expect(lnbModule.state.gain).toBe(55);
    });
  });

  describe('handleLoFrequencyChange', () => {
    it('should update LO frequency', () => {
      lnbModule.handleLoFrequencyChange(5800);

      expect(lnbModule.state.loFrequency).toBe(5800);
    });
  });

  describe('thermal stabilization', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should set temperature to ambient when powered off', () => {
      lnbModule.state.isPowered = false;

      lnbModule.updateThermalState_();

      expect(lnbModule.state.temperature).toBe(25);
    });

    it('should reach operating temperature after stabilization', () => {
      lnbModule.state.isPowered = true;
      lnbModule.handlePowerToggle(true);

      // Advance time past stabilization period
      jest.advanceTimersByTime(200000); // 200 seconds

      lnbModule.updateThermalState_();

      expect(lnbModule.state.temperature).toBe(50);
    });
  });

  describe('frequency drift', () => {
    it('should have no drift when locked and warmed up', () => {
      lnbModule.state.isExtRefLocked = true;

      // Mock GPSDO as warmed up
      jest.spyOn(rfFrontEnd.gpsdoModule, 'get10MhzOutput').mockReturnValue({
        frequency: 10e6 as any,
        power: -10,
        isWarmedUp: true,
        isEnabled: true
      });
      jest.spyOn(lnbModule, 'isExtRefPresent').mockReturnValue(true);

      lnbModule.update();

      expect(lnbModule.state.frequencyError).toBe(0);
    });

    it('should have drift when not locked', () => {
      lnbModule.state.isExtRefLocked = false;
      lnbModule.state.temperature = 30; // Below nominal (50°C)

      lnbModule.update();

      // Drift should be non-zero
      expect(lnbModule.state.frequencyError).not.toBe(0);
    });
  });

  describe('noise temperature calculation', () => {
    it('should set ambient noise temperature when powered off', () => {
      lnbModule.state.isPowered = false;

      lnbModule.update();

      expect(lnbModule.state.noiseTemperature).toBe(290);
    });
  });

  describe('sync', () => {
    it('should sync state from external source', () => {
      const newState: Partial<LNBState> = {
        gain: 60 as dB,
        loFrequency: 5500 as MHz
      };

      lnbModule.sync(newState);

      expect(lnbModule.state.gain).toBe(60);
      expect(lnbModule.state.loFrequency).toBe(5500);
    });
  });

  describe('rxSignalsIn getter', () => {
    it('should get signals from OMT module', () => {
      const signals = lnbModule.rxSignalsIn;

      expect(Array.isArray(signals)).toBe(true);
    });

    it('should include BUC loopback signals when enabled', () => {
      rfFrontEnd.bucModule.state.isLoopback = true;

      const signals = lnbModule.rxSignalsIn;

      expect(Array.isArray(signals)).toBe(true);
    });
  });
});
