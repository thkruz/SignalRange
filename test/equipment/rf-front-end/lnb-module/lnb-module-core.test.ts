import { vi } from 'vitest';
import { LNBModuleCore, LNBState, LOOP_TRANSLATION_HZ, LOOPBACK_COUPLING_DB } from '../../../../src/equipment/rf-front-end/lnb-module/lnb-module-core';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import { dB, dBi, dBm, Hertz, MHz, RfFrequency, RfSignal } from '../../../../src/types';
import { advanceSimTime } from '../../../helpers/sim-time';

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
    vi.clearAllMocks();
    vi.useRealTimers();
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

      vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 50 as dB;
      lnbModule.update();

      expect(lnbModule.postLNASignals.length).toBe(1);
      expect(lnbModule.postLNASignals[0].power).toBe(-30); // -80 + 50
      expect(lnbModule.postLNASignals[0].origin).toBe(SignalOrigin.LOW_NOISE_AMPLIFIER);
    });

    it('should output no signals when powered off', () => {
      const mockSignal: RfSignal = {
        frequency: 7000e6 as RfFrequency,
        bandwidth: 1e6 as Hertz,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.isPowered = false;
      lnbModule.update();

      expect(lnbModule.postLNASignals).toEqual([]);
      expect(lnbModule.ifSignals).toEqual([]);
    });

    it('should downconvert RF to IF frequency', () => {
      const mockSignal: RfSignal = {
        frequency: 4880e6 as RfFrequency, // 4880 MHz
        bandwidth: 1e6 as Hertz,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.frequencyError = 0;
      lnbModule.update();

      expect(lnbModule.ifSignals.length).toBe(1);
      // High-side injection: IF = LO - RF = 6080e6 - 4880e6 = 1200e6 (in the 950-2150 MHz passband)
      // Locked LO: the reference's few parts in 10^12 (19.6) - millihertz
      expect(lnbModule.ifSignals[0].frequency).toBeCloseTo(1200e6, 0);
      expect(lnbModule.ifSignals[0].origin).toBe(SignalOrigin.LOW_NOISE_BLOCK);
    });

    it('should not attenuate a carrier fully inside the IF passband', () => {
      const mockSignal: RfSignal = {
        frequency: 5000e6 as RfFrequency, // IF = 1080 MHz, inside 950-2150 MHz
        bandwidth: 1e6 as Hertz,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };

      vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.gain = 0 as dB;
      lnbModule.update();

      expect(lnbModule.ifSignals).toHaveLength(1);
      expect(lnbModule.ifSignals[0].power).toBe(-60);
    });

    it('should drop a carrier whose whole bandwidth is outside the IF passband', () => {
      // Beacon-style narrow carrier far below the passband: IF = 6080 - 5900 = 180 MHz
      const outOfBand: RfSignal = {
        frequency: 5900e6 as RfFrequency,
        bandwidth: 10e3 as Hertz,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.OMT_RX,
        gainInPath: 30 as dBi,
      };
      const inBand: RfSignal = { ...outOfBand, frequency: 5000e6 as RfFrequency };

      vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([outOfBand, inBand]);

      lnbModule.state.loFrequency = 6080 as MHz;
      lnbModule.state.gain = 0 as dB;
      lnbModule.update();

      expect(lnbModule.ifSignals).toHaveLength(1);
      expect(lnbModule.ifSignals[0].frequency).toBeCloseTo(1080e6, 0);
    });

    it('rolls a carrier off on the passband skirts by overlap integral (19.6)', () => {
      const at = (rfHz: number): number | null => {
        const sig: RfSignal = {
          frequency: rfHz as RfFrequency,
          bandwidth: 10e6 as Hertz,
          power: -60 as dBm,
          polarization: 'V',
          origin: SignalOrigin.OMT_RX,
          gainInPath: 30 as dBi,
        };
        vi.spyOn(lnbModule, 'rxSignalsIn', 'get').mockReturnValue([sig]);
        lnbModule.state.loFrequency = 6080 as MHz;
        lnbModule.state.gain = 0 as dB;
        lnbModule.update();
        return lnbModule.ifSignals[0]?.power ?? null;
      };

      // Straddling the 950 MHz edge: the flat passband reaches it, the skirt
      // is -3 dB only 25 MHz beyond, so half a carrier outside costs ~nothing
      expect(at(5130e6)).toBeGreaterThan(-60.05);
      // 50 MHz beyond the edge (IF 900 MHz): 1 / (1 + 2^6) = -18.1 dB
      expect(at(5180e6)).toBeCloseTo(-78.1, 0);
      // 300 MHz beyond: 65 dB down, under the skirts entirely, not carried
      expect(at(5430e6)).toBeNull();
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
      vi.spyOn(lnbModule, 'isExtRefPresent').mockReturnValue(true);

      const alarms = lnbModule.getAlarms();

      expect(alarms).toContain('LNB not locked to reference');
    });

    it('should alarm when noise temperature is high', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.noiseTemperature = 150;

      const alarms = lnbModule.getAlarms();

      expect(alarms.some((a) => a.includes('noise temperature high'))).toBe(true);
    });

    it('should alarm when noise figure is degraded', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.lnaNoiseFigure = 1.5;

      const alarms = lnbModule.getAlarms();

      expect(alarms.some((a) => a.includes('noise figure degraded'))).toBe(true);
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

  describe('power-on gain (phase 27 Q6)', () => {
    it('powers up at powerOnGain after a power cycle', () => {
      lnbModule.state.powerOnGain = 65 as dB;
      lnbModule.handleGainChange(60);
      lnbModule.handlePowerToggle(false);
      expect(lnbModule.state.gain).toBe(60);
      lnbModule.handlePowerToggle(true);
      expect(lnbModule.state.gain).toBe(65);
    });

    it('keeps the set gain when already powered or when no powerOnGain is set', () => {
      lnbModule.state.powerOnGain = 65 as dB;
      lnbModule.state.isPowered = true;
      lnbModule.handleGainChange(60);
      lnbModule.handlePowerToggle(true);
      expect(lnbModule.state.gain).toBe(60);

      lnbModule.state.powerOnGain = undefined;
      lnbModule.handlePowerToggle(false);
      lnbModule.handlePowerToggle(true);
      expect(lnbModule.state.gain).toBe(60);
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
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
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
      advanceSimTime(200000); // 200 seconds

      lnbModule.updateThermalState_();

      expect(lnbModule.state.temperature).toBe(50);
    });
  });

  describe('frequency drift', () => {
    it('should have no drift when locked and warmed up', () => {
      lnbModule.state.isExtRefLocked = true;

      // Mock GPSDO as warmed up
      vi.spyOn(rfFrontEnd.gpsdoModule, 'get10MhzOutput').mockReturnValue({
        frequency: 10e6 as any,
        power: -10,
        isWarmedUp: true,
        isEnabled: true,
      });
      vi.spyOn(lnbModule, 'isExtRefPresent').mockReturnValue(true);

      lnbModule.update();

      // The reference's error on the LO: |y| <= 2e-12 x 5.25 GHz = 0.01 Hz
      expect(Math.abs(lnbModule.state.frequencyError)).toBeLessThan(0.02);
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
        loFrequency: 5500 as MHz,
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

  describe('test-loop coupler and input compression (phase 27, r2-s07-F1)', () => {
    const loopCarrier = (bucOutDbm: number, rfHz = 5943e6): RfSignal =>
      ({
        signalId: 'loop',
        frequency: rfHz as RfFrequency,
        power: bucOutDbm as dBm,
        bandwidth: 36e6 as Hertz,
        polarization: 'H',
        origin: SignalOrigin.BUC,
        gainInPath: 0 as dBi,
      }) as unknown as RfSignal;

    const driveLoop = (bucOutDbm: number, rfHz = 5943e6) => {
      rfFrontEnd.bucModule.state.isLoopback = true;
      vi.spyOn(rfFrontEnd.bucModule, 'outputSignals', 'get').mockReturnValue([loopCarrier(bucOutDbm, rfHz)]);
      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 60 as dB;
      // The normal receive LO: the loop translator, not an LO retune, brings the loop in (Phase 28 D3)
      lnbModule.state.loFrequency = 5250 as MHz;
      lnbModule.state.loInjection = 'high';
      lnbModule.state.frequencyError = 0;
      lnbModule.update();
    };

    it('the loop reaches the LNB through the coupler, not at the full BUC output', () => {
      driveLoop(13);
      const loop = lnbModule.rxSignalsIn.find((s) => s.signalId === 'loop');
      expect(loop?.power).toBeCloseTo(13 - LOOPBACK_COUPLING_DB, 6);
    });

    it('backed-off drive (modem -7 dBm, BUC 20 dB) stays linear; the station standard 23 dB compresses and alarms', () => {
      driveLoop(13);
      expect(lnbModule.compressionDb).toBeLessThan(0.3);
      expect(lnbModule.getAlarms().some((a) => a.includes('overload'))).toBe(false);

      driveLoop(16);
      expect(lnbModule.compressionDb).toBeGreaterThan(0.5);
      expect(lnbModule.getAlarms().some((a) => a.includes('overload'))).toBe(true);
    });

    it('the loop translator puts the 6053 MHz uplink at 3828 MHz RF, 1422 MHz IF with LO 5250 (nats-r3-s08-F1)', () => {
      // S8: modem 2 at 1047 MHz IF, BUC LO 7100 MHz: 6053 MHz uplink; -7 dBm
      // drive at the 20 dB loop gain puts +13 dBm out of the BUC
      driveLoop(13, 6053e6);

      const atLnbInput = lnbModule.rxSignalsIn.find((s) => s.signalId === 'loop');
      expect(LOOP_TRANSLATION_HZ).toBe(2225e6);
      expect(atLnbInput?.frequency).toBe(3828e6);
      expect(atLnbInput?.power).toBeCloseTo(13 - LOOPBACK_COUPLING_DB, 6);

      const atIf = lnbModule.ifSignals.find((s) => s.signalId === 'loop');
      expect(atIf).toBeDefined();
      expect(atIf!.frequency).toBeCloseTo(1422e6, -3);
      // Coupler loss, then LNB gain less its (small) compression and the IF cable
      const expected = 13 - LOOPBACK_COUPLING_DB + 60 - lnbModule.compressionDb - rfFrontEnd.cableLossDb('rxIf');
      expect(atIf!.power).toBeCloseTo(expected, 6);
      expect(atIf!.power).toBeGreaterThan(6);
      expect(atIf!.power).toBeLessThan(7.1);
    });

    it('S7: 5943 MHz uplink loops back at the TM-1 downlink-equivalent 3718 MHz, 1532 MHz IF', () => {
      driveLoop(13, 5943e6);

      const atIf = lnbModule.ifSignals.find((s) => s.signalId === 'loop');
      expect(atIf?.frequency).toBeCloseTo(1532e6, -3);
    });

    it('a station loopTranslationMHz overrides the 2225 MHz default', () => {
      lnbModule.state.loopTranslationMHz = 2300 as MHz;
      driveLoop(13, 6053e6);

      expect(lnbModule.rxSignalsIn.find((s) => s.signalId === 'loop')?.frequency).toBe(3753e6);
      lnbModule.state.loopTranslationMHz = undefined;
    });

    it('a satellite downlink alone is far from compression', () => {
      lnbModule.state.isPowered = true;
      lnbModule.state.gain = 65 as dB;
      lnbModule.update();
      expect(lnbModule.compressionDb).toBe(0);
    });
  });
});
