import { vi } from 'vitest';
import { BUCModuleCore, BUCState } from '../../../../src/equipment/rf-front-end/buc-module/buc-module-core';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import type { dB, dBm, Hertz, IfSignal, MHz, RfSignal } from '../../../../src/types';
import { advanceSimTime } from '../../../helpers/sim-time';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Concrete test implementation of abstract BUCModuleCore
class TestBUCModule extends BUCModuleCore {
  constructor(state: BUCState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
    super(state, rfFrontEnd, unit);
  }

  protected initializeDom(parentId: string): HTMLElement {
    const el = document.createElement('div');
    el.id = this.uniqueId;
    document.getElementById(parentId)?.appendChild(el);
    return el;
  }

  addEventListeners(): void {
    // No-op for test
  }

  protected syncDomWithState_(): void {
    // No-op for test
  }

  // Expose protected method for testing
  public testGetLoopbackLedStatus(): string {
    return this.getLoopbackLedStatus();
  }
}

// Mock transmitter with modem
function createMockTransmitter(modems: any[] = []): any {
  return {
    state: {
      modems:
        modems.length > 0
          ? modems
          : [
              {
                isTransmitting: true,
                isFaulted: false,
                isLoopback: false,
                ifSignal: {
                  frequency: 500e6,
                  bandwidth: 36e6,
                  power: -10 as dBm,
                  origin: SignalOrigin.TRANSMITTER,
                } as IfSignal,
              },
            ],
    },
    isModemInIntermittentDropout: () => false, // Mock method - no dropout
  };
}

// Mock RFFrontEndCore
function createMockRfFrontEnd(gpsdoOverrides: { isPresent?: boolean; isWarmedUp?: boolean } = {}, transmitters?: any[]): RFFrontEndCore {
  // If transmitters is explicitly undefined, use default; if explicitly empty array, use empty
  const txList = transmitters === undefined ? [createMockTransmitter()] : transmitters;
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({
        isPresent: gpsdoOverrides.isPresent ?? true,
        isWarmedUp: gpsdoOverrides.isWarmedUp ?? true,
      }),
      fractionalFrequencyError: () => 0,
    },
    cableLossDb: () => 0,
    transmitters: txList,
    state: {
      teamId: 1,
      serverId: 1,
    },
  } as unknown as RFFrontEndCore;
}

describe('BUCModuleCore', () => {
  let bucModule: TestBUCModule;
  let mockRfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('getDefaultState()', () => {
    it('should return correct default values', () => {
      const defaults = BUCModuleCore.getDefaultState();

      // Operational State
      expect(defaults.isPowered).toBe(true);
      expect(defaults.isMuted).toBe(false);
      expect(defaults.isLoopback).toBe(false);
      expect(defaults.temperature).toBe(25);
      expect(defaults.currentDraw).toBe(0);

      // Frequency Translation
      expect(defaults.loFrequency).toBe(6425);
      expect(defaults.isExtRefLocked).toBe(true);
      expect(defaults.frequencyError).toBe(0);
      expect(defaults.phaseLockRange).toBe(10000);

      // Output Filter
      expect(defaults.filterLowHz).toBe(5.925e9);
      expect(defaults.filterHighHz).toBe(6.425e9);
      expect(defaults.filterRejectionDb).toBe(-60);

      // Gain & Power
      expect(defaults.gain).toBe(0);
      expect(defaults.outputPower).toBe(-10);
      expect(defaults.saturationPower).toBe(15);
      expect(defaults.gainFlatness).toBe(0.5);

      // Signal Quality
      expect(defaults.groupDelay).toBe(3);
      expect(defaults.phaseNoise).toBe(-100);
      expect(defaults.spuriousOutputs).toEqual([]);
      expect(defaults.noiseFloor).toBe(-140);
    });
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      expect(bucModule).toBeInstanceOf(BUCModuleCore);
      expect(bucModule.state.isPowered).toBe(true);
      expect(bucModule.state.loFrequency).toBe(6425);
    });

    it('should merge provided state with defaults', () => {
      const customState: BUCState = {
        ...BUCModuleCore.getDefaultState(),
        isPowered: false,
        gain: 20 as dB,
        loFrequency: 6500 as MHz,
      };

      bucModule = new TestBUCModule(customState, mockRfFrontEnd, 1);

      expect(bucModule.state.isPowered).toBe(false);
      expect(bucModule.state.gain).toBe(20);
      expect(bucModule.state.loFrequency).toBe(6500);
      expect(bucModule.state.saturationPower).toBe(15); // from defaults
    });

    it('should generate correct uniqueId', () => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 2);

      expect((bucModule as any).uniqueId).toBe('rf-fe-buc-2');
    });

    it('should initialize with empty output signals', () => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      expect(bucModule.outputSignals).toEqual([]);
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    describe('signal processing', () => {
      it('should upconvert IF signals to RF when powered', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 10 as dB;

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(1);
        expect(bucModule.outputSignals[0].origin).toBe(SignalOrigin.BUC);
      });

      it('should apply gain to output signals', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 20 as dB;

        bucModule.update();

        // Input -10 dBm + 20 dB = 10 dBm, 5 dB under the 15 dBm P1dB: the soft
        // (Rapp) curve has already taken 0.08 dB
        expect(bucModule.outputSignals[0].power).toBeCloseTo(9.92, 2);
      });

      it('should attenuate signals when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;

        bucModule.update();

        // When muted, gain is -170 dB
        expect(bucModule.outputSignals[0].power).toBeLessThan(-100);
      });

      it('should not produce output signals when not powered', () => {
        // Verify we have input signals
        expect(bucModule.inputSignals.length).toBeGreaterThan(0);

        bucModule.state.isPowered = false;
        bucModule.update();

        // When not powered, lock is lost and frequency drift may cause signals
        // to be out of band, or no RF output is produced. Either way, no valid
        // output signals should be present.
        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should reject out-of-band signals', () => {
        // Create a transmitter with out-of-band IF signal
        const outOfBandTransmitter = createMockTransmitter([
          {
            isTransmitting: true,
            isFaulted: false,
            isLoopback: false,
            ifSignal: {
              frequency: 2000e6 as Hertz, // This will produce out-of-band RF
              bandwidth: 36e6,
              power: -10 as dBm,
              origin: SignalOrigin.TRANSMITTER,
            } as IfSignal,
          },
        ]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [outOfBandTransmitter]);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

        bucModule.update();

        // Out-of-band signal should be filtered out
        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from faulted modems', () => {
        const faultedTransmitter = createMockTransmitter([
          {
            isTransmitting: true,
            isFaulted: true,
            isLoopback: false,
            ifSignal: {
              frequency: 500e6,
              bandwidth: 36e6,
              power: -10 as dBm,
              origin: SignalOrigin.TRANSMITTER,
            } as IfSignal,
          },
        ]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [faultedTransmitter]);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from loopback modems', () => {
        const loopbackTransmitter = createMockTransmitter([
          {
            isTransmitting: true,
            isFaulted: false,
            isLoopback: true,
            ifSignal: {
              frequency: 500e6,
              bandwidth: 36e6,
              power: -10 as dBm,
              origin: SignalOrigin.TRANSMITTER,
            } as IfSignal,
          },
        ]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [loopbackTransmitter]);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from non-transmitting modems', () => {
        const nonTxTransmitter = createMockTransmitter([
          {
            isTransmitting: false,
            isFaulted: false,
            isLoopback: false,
            ifSignal: {
              frequency: 500e6,
              bandwidth: 36e6,
              power: -10 as dBm,
              origin: SignalOrigin.TRANSMITTER,
            } as IfSignal,
          },
        ]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [nonTxTransmitter]);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(0);
      });
    });

    describe('lock status updates', () => {
      it('should maintain lock when powered with external reference', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isExtRefLocked = true;

        bucModule.update();

        expect(bucModule.state.isExtRefLocked).toBe(true);
        expect(bucModule.state.frequencyError).toBe(0);
      });

      it('should lose lock when external reference is not present', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
        bucModule = new TestBUCModule({ ...BUCModuleCore.getDefaultState(), isExtRefLocked: true }, mockRfFrontEnd, 1);

        bucModule.update();

        expect(bucModule.state.isExtRefLocked).toBe(false);
      });

      it('should lose lock when not powered', () => {
        bucModule.state.isPowered = false;
        bucModule.state.isExtRefLocked = true;

        bucModule.update();

        expect(bucModule.state.isExtRefLocked).toBe(false);
      });

      it('should simulate lock acquisition when powered with reference but not locked', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isExtRefLocked = false;

        bucModule.update();

        // Fast forward timers to complete lock acquisition
        advanceSimTime(6000);

        expect(bucModule.state.isExtRefLocked).toBe(true);
      });

      it('should have frequency drift when external reference is not warmed up', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: true, isWarmedUp: false });
        bucModule = new TestBUCModule({ ...BUCModuleCore.getDefaultState(), isExtRefLocked: true }, mockRfFrontEnd, 1);

        bucModule.update();

        // Frequency error should be non-zero when not warmed up
        expect(bucModule.state.frequencyError).not.toBe(0);
      });

      it('should have frequency drift when unlocked', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

        bucModule.update();

        expect(bucModule.state.frequencyError).not.toBe(0);
      });
    });

    describe('output power calculation', () => {
      it('should report the output floor when not powered', () => {
        bucModule.state.isPowered = false;

        bucModule.update();

        expect(bucModule.state.outputPower).toBe(BUCModuleCore.OUTPUT_POWER_FLOOR_DBM);
        expect(bucModule.hasRfOutput()).toBe(false);
      });

      it('should report the output floor when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;

        bucModule.update();

        expect(bucModule.state.outputPower).toBe(BUCModuleCore.OUTPUT_POWER_FLOOR_DBM);
        expect(bucModule.hasRfOutput()).toBe(false);
      });

      it('should derive output power from the actual output signals, not a fixed drive', () => {
        // Two in-band -10 dBm carriers: total output is +3 dB over one
        const carrier = (frequency: number) => ({
          isTransmitting: true,
          isFaulted: false,
          isLoopback: false,
          ifSignal: { frequency, bandwidth: 1e6, power: -10 as dBm, origin: SignalOrigin.TRANSMITTER } as IfSignal,
        });
        mockRfFrontEnd = createMockRfFrontEnd({}, [createMockTransmitter([carrier(490e6), carrier(500e6)])]);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
        bucModule.state.gain = 10 as dB;

        bucModule.update();

        expect(bucModule.outputSignals).toHaveLength(2);
        // Composite 3 dB over one carrier, 15 dB under P1dB: linear to 0.01 dB
        expect(bucModule.state.outputPower).toBeCloseTo(10 * Math.log10(2), 2);
      });

      it('should report the floor and no saturation alarm when every carrier is out of band', () => {
        // LO pushes both sidebands outside the 5.925-6.425 GHz output filter
        bucModule.state.loFrequency = 7500 as MHz;
        bucModule.state.gain = 60 as dB;

        bucModule.update();

        expect(bucModule.outputSignals).toEqual([]);
        expect(bucModule.state.outputPower).toBe(BUCModuleCore.OUTPUT_POWER_FLOOR_DBM);
        expect(bucModule.getAlarms().some((a) => a.includes('saturation'))).toBe(false);
      });

      it('should calculate linear output power below saturation', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 10 as dB;

        bucModule.update();

        // Input -10 dBm + 10 dB gain = 0 dBm, 15 dB under P1dB: linear
        expect(bucModule.state.outputPower).toBeCloseTo(0, 2);
      });

      it('should apply compression when at saturation', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 30 as dB; // Would give 20 dBm, above P1dB (15)

        bucModule.update();

        // Should be compressed: 20 - (20-15)*0.5 = 17.5, but max 3dB compression
        expect(bucModule.state.outputPower).toBeLessThan(20);
        expect(bucModule.state.outputPower).toBeGreaterThan(15);
      });
    });

    describe('signal quality updates', () => {
      it('should reset signal quality when not powered', () => {
        bucModule.state.isPowered = false;

        bucModule.update();

        expect(bucModule.state.phaseNoise).toBe(0);
        expect(bucModule.state.groupDelay).toBe(0);
        expect(bucModule.state.spuriousOutputs).toEqual([]);
      });

      it('should have good phase noise when locked', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isExtRefLocked = true;

        bucModule.update();

        // The synthesiser on the station reference (lo-reference.ts)
        expect(bucModule.state.phaseNoise).toBe(-95);
      });

      it('should have degraded phase noise when unlocked', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
        bucModule.state.isPowered = true;

        bucModule.update();

        // When unlocked, phase noise is between -70 and -80 dBc/Hz
        expect(bucModule.state.phaseNoise).toBeGreaterThanOrEqual(-80);
        expect(bucModule.state.phaseNoise).toBeLessThanOrEqual(-70);
      });

      it('should calculate group delay based on temperature', () => {
        bucModule.state.isPowered = true;
        bucModule.state.temperature = 45; // 20 degrees above ambient

        bucModule.update();

        // Base delay (3) + temp variation (20 * 0.1 = 2) + random (0-2)
        expect(bucModule.state.groupDelay).toBeGreaterThanOrEqual(5);
      });

      it('should generate spurious products when powered with input signals', () => {
        bucModule.state.isPowered = true;

        bucModule.update();

        expect(bucModule.state.spuriousOutputs.length).toBeGreaterThan(0);
        // Should have 2nd and 3rd harmonic products
        expect(bucModule.state.spuriousOutputs.some((s) => s.loHarmonic === 2)).toBe(true);
        expect(bucModule.state.spuriousOutputs.some((s) => s.loHarmonic === 3)).toBe(true);
      });

      it('should not generate spurious products when no input signals', () => {
        mockRfFrontEnd = createMockRfFrontEnd({}, []);
        bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
        bucModule.state.isPowered = true;

        bucModule.update();

        expect(bucModule.state.spuriousOutputs).toEqual([]);
      });
    });

    describe('thermal state updates', () => {
      it('should cool down when not powered', () => {
        bucModule.state.isPowered = false;
        bucModule.state.temperature = 50;
        bucModule.state.currentDraw = 2;

        bucModule.update();

        // Should be cooling toward ambient (25°C)
        expect(bucModule.state.temperature).toBeLessThan(50);
        expect(bucModule.state.currentDraw).toBe(0);
      });

      it('should heat up based on output power when powered', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 20 as dB; // Higher gain = higher power = more heat
        bucModule.state.temperature = 25; // Start at ambient

        bucModule.update();

        // Temperature should increase
        expect(bucModule.state.temperature).toBeGreaterThanOrEqual(25);
      });

      it('should draw current when powered', () => {
        bucModule.state.isPowered = true;
        bucModule.state.currentDraw = 0;
        bucModule.state.gain = 30 as dB;

        // Run multiple updates to simulate gradual current increase
        for (let i = 0; i < 100; i++) {
          bucModule.update();
        }

        expect(bucModule.state.currentDraw).toBeGreaterThan(0);
      });
    });
  });

  describe('getAlarms()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    it('should return empty array when no alarms', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = true;
      bucModule.state.frequencyError = 0;
      bucModule.state.outputPower = 0 as dBm;
      bucModule.state.temperature = 30;
      bucModule.state.currentDraw = 1;
      bucModule.state.phaseNoise = -100;

      const alarms = bucModule.getAlarms();

      expect(alarms).toEqual([]);
    });

    it('should return empty array when not powered', () => {
      bucModule.state.isPowered = false;
      bucModule.state.isExtRefLocked = false;
      bucModule.state.temperature = 100;

      const alarms = bucModule.getAlarms();

      expect(alarms).toEqual([]);
    });

    it('should return lock alarm when not locked but reference is present', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = false;

      const alarms = bucModule.getAlarms();

      expect(alarms).toContain('BUC not locked to reference');
    });

    it('should return frequency error alarm when error > 50kHz', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = false;
      bucModule.state.frequencyError = 60000; // 60 kHz

      const alarms = bucModule.getAlarms();

      expect(alarms.some((a) => a.includes('frequency error'))).toBe(true);
      expect(alarms.some((a) => a.includes('60.0 kHz'))).toBe(true);
    });

    it('should return saturation warning when approaching P1dB', () => {
      bucModule.state.isPowered = true;
      bucModule.state.saturationPower = 15 as dBm;
      bucModule.state.outputPower = 14 as dBm; // Within 2 dB of saturation
      bucModule.outputSignals = [{ frequency: 6e9, bandwidth: 1e6, power: 14, origin: SignalOrigin.BUC } as unknown as RfSignal];

      const alarms = bucModule.getAlarms();

      expect(alarms.some((a) => a.includes('saturation'))).toBe(true);
    });

    it('should not warn of saturation when the BUC has no RF output', () => {
      bucModule.state.isPowered = true;
      bucModule.state.saturationPower = 15 as dBm;
      bucModule.state.outputPower = 14 as dBm;
      bucModule.outputSignals = [];

      const alarms = bucModule.getAlarms();

      expect(alarms.some((a) => a.includes('saturation'))).toBe(false);
    });

    it('should return over-temperature alarm when > 70°C', () => {
      bucModule.state.isPowered = true;
      bucModule.state.temperature = 75;

      const alarms = bucModule.getAlarms();

      expect(alarms.some((a) => a.includes('over-temperature'))).toBe(true);
      expect(alarms.some((a) => a.includes('75.0'))).toBe(true);
    });

    it('should return high current alarm when > 4.5A', () => {
      bucModule.state.isPowered = true;
      bucModule.state.currentDraw = 5.0;

      const alarms = bucModule.getAlarms();

      expect(alarms.some((a) => a.includes('high current'))).toBe(true);
      expect(alarms.some((a) => a.includes('5.00 A'))).toBe(true);
    });

    it('should return phase noise alarm when degraded and unlocked', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = false;
      bucModule.state.phaseNoise = -80; // Above -85 dBc/Hz

      const alarms = bucModule.getAlarms();

      expect(alarms).toContain('BUC phase noise degraded (unlocked)');
    });

    it('should not return phase noise alarm when locked', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = true;
      bucModule.state.phaseNoise = -80;

      const alarms = bucModule.getAlarms();

      expect(alarms).not.toContain('BUC phase noise degraded (unlocked)');
    });

    it('should return multiple alarms when multiple conditions met', () => {
      bucModule.state.isPowered = true;
      bucModule.state.isExtRefLocked = false;
      bucModule.state.temperature = 80;
      bucModule.state.currentDraw = 5;

      const alarms = bucModule.getAlarms();

      expect(alarms.length).toBeGreaterThan(1);
    });
  });

  describe('calculateRfFrequency()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    it('should calculate upper sideband frequency when in band', () => {
      bucModule.state.loFrequency = 5925 as MHz; // LO at 5.925 GHz
      bucModule.state.filterLowHz = 5.925e9 as Hertz;
      bucModule.state.filterHighHz = 6.425e9 as Hertz;

      const ifFreq = 200e6; // 200 MHz IF
      const rfFreq = bucModule.calculateRfFrequency(ifFreq);

      // Upper sideband: 5925 + 200 = 6125 MHz (in band)
      expect(rfFreq).toBe(6.125e9);
    });

    it('should calculate lower sideband frequency when upper is out of band', () => {
      bucModule.state.loFrequency = 6425 as MHz; // LO at 6.425 GHz
      bucModule.state.filterLowHz = 5.925e9 as Hertz;
      bucModule.state.filterHighHz = 6.425e9 as Hertz;

      const ifFreq = 500e6; // 500 MHz IF
      // Upper sideband: 6425 + 500 = 6925 MHz (out of band)
      // Lower sideband: 6425 - 500 = 5925 MHz (in band)
      const rfFreq = bucModule.calculateRfFrequency(ifFreq);

      expect(rfFreq).toBe(5.925e9);
    });

    it('should return upper sideband when neither is in band', () => {
      bucModule.state.loFrequency = 4000 as MHz; // LO at 4 GHz
      bucModule.state.filterLowHz = 5.925e9 as Hertz;
      bucModule.state.filterHighHz = 6.425e9 as Hertz;

      const ifFreq = 500e6;
      const rfFreq = bucModule.calculateRfFrequency(ifFreq);

      // Both sidebands out of band, returns upper
      expect(rfFreq).toBe(4.5e9); // 4000 + 500 MHz
    });

    it('should include frequency error when not locked', () => {
      mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
      bucModule = new TestBUCModule(
        { ...BUCModuleCore.getDefaultState(), frequencyError: 10000 }, // 10 kHz error
        mockRfFrontEnd,
        1
      );
      bucModule.state.isExtRefLocked = false;

      const ifFreq = 500e6;
      const rfFreq = bucModule.calculateRfFrequency(ifFreq);

      // Frequency should include the error
      // LO = 6425 MHz + 10 kHz, upper sideband would be out of band
      // Lower sideband = 6425.01 MHz - 500 MHz = 5925.01 MHz
      expect(Math.abs(rfFreq - 5.92501e9)).toBeLessThan(100); // Within 100 Hz tolerance
    });
  });

  describe('getActiveInjectionMode()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    it('should return "none" when no input signals', () => {
      mockRfFrontEnd = createMockRfFrontEnd({}, []);
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      expect(bucModule.getActiveInjectionMode()).toBe('none');
    });

    it('should return "low" for upper sideband (low-side injection)', () => {
      // Default config: LO = 6425 MHz, IF = 500 MHz
      // Upper sideband = 6925 MHz (out of band)
      // Lower sideband = 5925 MHz (in band) -> high-side injection
      bucModule.state.loFrequency = 5500 as MHz;
      bucModule.state.filterLowHz = 5.925e9 as Hertz;
      bucModule.state.filterHighHz = 6.425e9 as Hertz;

      // With IF at 500 MHz, upper sideband = 6000 MHz (in band)
      expect(bucModule.getActiveInjectionMode()).toBe('low');
    });

    it('should return "high" for lower sideband (high-side injection)', () => {
      // Default: LO = 6425 MHz, IF = 500 MHz
      // Lower sideband = 5925 MHz (in band) -> high-side injection
      expect(bucModule.getActiveInjectionMode()).toBe('high');
    });

    it('should return "none" when neither sideband is in band', () => {
      bucModule.state.loFrequency = 4000 as MHz;
      bucModule.state.filterLowHz = 5.925e9 as Hertz;
      bucModule.state.filterHighHz = 6.425e9 as Hertz;

      expect(bucModule.getActiveInjectionMode()).toBe('none');
    });
  });

  describe('handler methods', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    describe('handlePowerToggle()', () => {
      it('should set power state', () => {
        bucModule.handlePowerToggle(false);
        expect(bucModule.state.isPowered).toBe(false);

        bucModule.handlePowerToggle(true);
        expect(bucModule.state.isPowered).toBe(true);
      });

      it('should not change state when undefined', () => {
        bucModule.state.isPowered = true;
        bucModule.handlePowerToggle(undefined);
        expect(bucModule.state.isPowered).toBe(true);
      });
    });

    describe('handleGainChange()', () => {
      it('should update gain', () => {
        bucModule.handleGainChange(25);
        expect(bucModule.state.gain).toBe(25);
      });
    });

    describe('handleMuteToggle()', () => {
      it('should toggle mute state', () => {
        bucModule.handleMuteToggle(true);
        expect(bucModule.state.isMuted).toBe(true);

        bucModule.handleMuteToggle(false);
        expect(bucModule.state.isMuted).toBe(false);
      });
    });

    describe('handleLoFrequencyChange()', () => {
      it('should update LO frequency', () => {
        bucModule.handleLoFrequencyChange(6500);
        expect(bucModule.state.loFrequency).toBe(6500);
      });
    });

    describe('handleLoopbackToggle()', () => {
      it('should toggle loopback state', () => {
        bucModule.handleLoopbackToggle(true);
        expect(bucModule.state.isLoopback).toBe(true);

        bucModule.handleLoopbackToggle(false);
        expect(bucModule.state.isLoopback).toBe(false);
      });
    });
  });

  describe('getLoopbackLedStatus()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    it('should return led-blue when in loopback', () => {
      bucModule.state.isLoopback = true;
      expect(bucModule.testGetLoopbackLedStatus()).toBe('led-blue');
    });

    it('should return led-off when not in loopback', () => {
      bucModule.state.isLoopback = false;
      expect(bucModule.testGetLoopbackLedStatus()).toBe('led-off');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule({ ...BUCModuleCore.getDefaultState(), isPowered: true, isMuted: false }, mockRfFrontEnd, 1);
    });

    describe('getTotalGain()', () => {
      it('should return -120 when not powered', () => {
        bucModule.state.isPowered = false;
        expect(bucModule.getTotalGain()).toBe(-120);
      });

      it('should return -120 when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;
        expect(bucModule.getTotalGain()).toBe(-120);
      });

      it('should return gain when powered and not muted', () => {
        bucModule.state.gain = 15 as dB;
        expect(bucModule.getTotalGain()).toBe(15);
      });
    });

    describe('getOutputPower()', () => {
      it('should return -120 when not powered', () => {
        bucModule.state.isPowered = false;
        expect(bucModule.getOutputPower(-10)).toBe(-120);
      });

      it('should return -120 when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;
        expect(bucModule.getOutputPower(-10)).toBe(-120);
      });

      it('should return linear output power below saturation', () => {
        bucModule.state.gain = 10 as dB;
        bucModule.state.saturationPower = 20 as dBm;

        // Input -10 dBm + 10 dB gain = 0 dBm, 20 dB under P1dB: linear
        expect(bucModule.getOutputPower(-10)).toBeCloseTo(0, 2);
      });

      it('should apply compression at saturation', () => {
        bucModule.state.gain = 40 as dB;
        bucModule.state.saturationPower = 15 as dBm;

        // Input 0 dBm + 40 dB gain = 40 dBm (way above saturation)
        const output = bucModule.getOutputPower(0);
        expect(output).toBeLessThan(40);
        expect(output).toBeGreaterThan(15);
      });
    });

    describe('getCompressionDb()', () => {
      it('should return 0 when not powered', () => {
        bucModule.state.isPowered = false;
        expect(bucModule.getCompressionDb()).toBe(0);
      });

      it('should return 0 when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;
        expect(bucModule.getCompressionDb()).toBe(0);
      });

      it('should return 0 in linear region', () => {
        bucModule.state.gain = 10 as dB;
        bucModule.state.saturationPower = 20 as dBm;
        expect(bucModule.getCompressionDb()).toBe(0);
      });

      it('should return the compression at the P1dB drive: 1 dB', () => {
        bucModule.state.gain = 30 as dB;
        bucModule.state.saturationPower = 15 as dBm;
        // Find the drive that compresses by 1 dB, then read it back
        let lo = -60;
        let hi = 10;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (30 - (bucModule.getOutputPower(mid) - mid) < 1) lo = mid;
          else hi = mid;
        }
        expect(bucModule.getOutputPower(lo)).toBeCloseTo(15, 2);
        bucModule.update();
        // At -10 dBm in (20 dBm linear, 5 dB over P1dB) the curve is near Psat (17.16 dBm)
        expect(bucModule.state.outputPower).toBeLessThan(17.17);
        expect(bucModule.getCompressionDb()).toBeGreaterThan(2.8);
      });

      it('should return higher compression when further into saturation', () => {
        bucModule.state.saturationPower = 15 as dBm;
        bucModule.state.gain = 30 as dB;
        bucModule.update();
        const less = bucModule.getCompressionDb();
        bucModule.state.gain = 50 as dB;
        bucModule.update();
        // Output pinned near Psat: 40 dBm linear -> 17.16, so ~22.8 dB of compression
        expect(bucModule.getCompressionDb()).toBeGreaterThan(less);
        expect(bucModule.getCompressionDb()).toBeCloseTo(40 - 17.16, 1);
      });
    });

    describe('getFrequencyStabilityPpm()', () => {
      it('should return 0 when LO frequency is 0', () => {
        bucModule.state.loFrequency = 0 as MHz;
        expect(bucModule.getFrequencyStabilityPpm()).toBe(0);
      });

      it('should calculate PPM from frequency error', () => {
        bucModule.state.loFrequency = 6000 as MHz; // 6 GHz
        bucModule.state.frequencyError = 6000; // 6 kHz error

        // 6000 Hz / 6e9 Hz * 1e6 = 1 ppm
        expect(bucModule.getFrequencyStabilityPpm()).toBeCloseTo(1, 2);
      });
    });

    describe('isInSaturation()', () => {
      it('should return true when output >= saturation', () => {
        bucModule.state.outputPower = 15 as dBm;
        bucModule.state.saturationPower = 15 as dBm;
        expect(bucModule.isInSaturation()).toBe(true);
      });

      it('should return false when output < saturation', () => {
        bucModule.state.outputPower = 10 as dBm;
        bucModule.state.saturationPower = 15 as dBm;
        expect(bucModule.isInSaturation()).toBe(false);
      });
    });

    describe('getSignalQualityMetrics()', () => {
      it('should return all signal quality metrics', () => {
        bucModule.state.phaseNoise = -100;
        bucModule.state.groupDelay = 5;
        bucModule.state.frequencyError = 1000;
        bucModule.state.isExtRefLocked = true;
        bucModule.state.spuriousOutputs = [{ frequency: 10e9 as Hertz, level: -40, loHarmonic: 2, ifHarmonic: 1 }];

        const metrics = bucModule.getSignalQualityMetrics();

        expect(metrics.phaseNoise).toBe(-100);
        expect(metrics.groupDelay).toBe(5);
        expect(metrics.frequencyError).toBe(1000);
        expect(metrics.isLocked).toBe(true);
        expect(metrics.spuriousCount).toBe(1);
      });
    });

    describe('getThermalState()', () => {
      it('should return thermal parameters', () => {
        bucModule.state.temperature = 45;
        bucModule.state.currentDraw = 2;
        bucModule.state.outputPower = 10 as dBm;

        const thermal = bucModule.getThermalState();

        expect(thermal.temperature).toBe(45);
        expect(thermal.currentDraw).toBe(2);
        expect(thermal.powerDissipation).toBeDefined();
      });

      it('should calculate power dissipation', () => {
        bucModule.state.currentDraw = 2; // 2 A
        bucModule.state.outputPower = 10 as dBm; // 10^(10/10) = 10 mW in formula

        const thermal = bucModule.getThermalState();

        // Power dissipation = V * I - P_out = 28 * 2 - 10 = 46
        expect(thermal.powerDissipation).toBeGreaterThan(40);
      });
    });
  });

  describe('inputSignals getter', () => {
    it('should return empty array when no transmitters', () => {
      mockRfFrontEnd = createMockRfFrontEnd({}, []);
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      expect(bucModule.inputSignals).toEqual([]);
    });

    it('should return IF signals from transmitting modems', () => {
      const tx = createMockTransmitter();
      mockRfFrontEnd = createMockRfFrontEnd({}, [tx]);
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      const inputs = bucModule.inputSignals;
      expect(inputs.length).toBe(1);
      expect(inputs[0].frequency).toBe(500e6);
    });

    it('should aggregate signals from multiple transmitters', () => {
      const tx1 = createMockTransmitter();
      const tx2 = createMockTransmitter([
        {
          isTransmitting: true,
          isFaulted: false,
          isLoopback: false,
          ifSignal: {
            frequency: 600e6,
            bandwidth: 36e6,
            power: -10 as dBm,
            origin: SignalOrigin.TRANSMITTER,
          } as IfSignal,
        },
      ]);

      mockRfFrontEnd = createMockRfFrontEnd({}, [tx1, tx2]);
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);

      const inputs = bucModule.inputSignals;
      expect(inputs.length).toBe(2);
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(BUCModuleCore.getDefaultState(), mockRfFrontEnd, 1);
    });

    it('should merge partial state', () => {
      const newState: Partial<BUCState> = {
        temperature: 50,
        gain: 25 as dB,
      };

      bucModule.sync(newState);

      expect(bucModule.state.temperature).toBe(50);
      expect(bucModule.state.gain).toBe(25);
      expect(bucModule.state.isPowered).toBe(true); // unchanged
    });
  });
});

describe('BUCModuleCore thermal and current (phase 19.6)', () => {
  let bucModule: TestBUCModule;
  /** A 28 dBm P1dB BUC at 23 dB of gain on a -7 dBm IF drive (the Campaign 1 operating point) */
  const c1Buc = (): TestBUCModule => {
    const tx = createMockTransmitter([
      {
        isTransmitting: true,
        isFaulted: false,
        isLoopback: false,
        ifSignal: { frequency: 500e6, bandwidth: 36e6, power: -7 as dBm, origin: SignalOrigin.TRANSMITTER } as IfSignal,
      },
    ]);
    return new TestBUCModule({ ...BUCModuleCore.getDefaultState(), gain: 23 as dB, saturationPower: 28 as dBm, temperature: 25 }, createMockRfFrontEnd({}, [tx]), 1);
  };

  beforeEach(() => {
    vi.useRealTimers();
    bucModule = c1Buc();
  });

  it('starts at its equilibrium for the operating point (a running station), in watts', () => {
    bucModule.update();
    // 16 dBm out of a 30.16 dBm Psat stage: 2.6 + 2.4 sqrt(40 mW / 1038 mW) = 3.07 A
    expect(bucModule.state.currentDraw).toBeCloseTo(3.07, 2);
    // 24 V x 3.07 A - 0.04 W through 0.30 degC/W over 25 degC
    expect(bucModule.state.temperature).toBeCloseTo(25 + 0.3 * (24 * 3.071 - 0.04), 0);
    const { powerDissipation } = bucModule.getThermalState();
    expect(powerDissipation).toBeCloseTo(24 * bucModule.state.currentDraw - 0.0398, 2);
  });

  it('more drive draws more current and runs hotter; the case lags with a 10 min time constant', () => {
    bucModule.update();
    const before = bucModule.state.temperature;
    bucModule.state.gain = 33 as dB;
    bucModule.update();
    const target = bucModule.equilibriumTemperatureC();
    expect(target).toBeGreaterThan(before + 5);
    advanceSimTime(600_000, { emitUpdate: true });
    // One time constant: 63 % of the way
    const fraction = (bucModule.state.temperature - before) / (target - before);
    expect(fraction).toBeGreaterThan(0.58);
    expect(fraction).toBeLessThan(0.68);
    expect(bucModule.state.currentDraw).toBeCloseTo(4.04, 1);
  });

  it('driven into saturation it draws over the 4.5 A alarm', () => {
    bucModule.state.gain = 50 as dB;
    bucModule.update();
    advanceSimTime(20_000, { emitUpdate: true });
    expect(bucModule.state.currentDraw).toBeGreaterThan(4.5);
    expect(bucModule.getAlarms().some((a) => a.includes('high current draw'))).toBe(true);
  });

  it('a cooling-factor fault scales the rise, so less drive is the fix', () => {
    bucModule.update();
    const healthy23 = bucModule.equilibriumTemperatureC();
    bucModule.setCoolingFactor(1.35);
    const faulted23 = bucModule.equilibriumTemperatureC();
    bucModule.state.gain = 33 as dB;
    bucModule.update();
    const faulted33 = bucModule.equilibriumTemperatureC();
    expect(faulted23 - 25).toBeCloseTo(1.35 * (healthy23 - 25), 6);
    expect(faulted33 - faulted23).toBeGreaterThan(8);
    expect(bucModule.getAlarms().some((a) => a.includes('BUC cooling fault'))).toBe(true);
  });

  it('an excess-current fault adds amps and their heat; muting removes the stage bias', () => {
    bucModule.update();
    const base = bucModule.equilibriumCurrentA();
    const baseT = bucModule.equilibriumTemperatureC();
    bucModule.setExcessCurrent(1.6);
    expect(bucModule.equilibriumCurrentA()).toBeCloseTo(base + 1.6, 6);
    expect(bucModule.equilibriumTemperatureC()).toBeCloseTo(baseT + 0.3 * 24 * 1.6, 6);
    bucModule.state.isMuted = true;
    bucModule.update();
    expect(bucModule.equilibriumCurrentA()).toBeCloseTo(2.6, 6);
  });

  it('a staged temperature is kept and then relaxes toward equilibrium', () => {
    bucModule.setTemperature(72);
    bucModule.update();
    expect(bucModule.state.temperature).toBeCloseTo(72, 6);
    advanceSimTime(60_000, { emitUpdate: true });
    expect(bucModule.state.temperature).toBeLessThan(72);
    expect(bucModule.state.temperature).toBeGreaterThan(60);
  });

  it('muted, the output stage idles: current falls to idle and the case cools', () => {
    bucModule.state.gain = 33 as dB;
    bucModule.update();
    bucModule.setTemperature(65);
    bucModule.state.isMuted = true;
    advanceSimTime(30_000, { emitUpdate: true });
    expect(bucModule.state.currentDraw).toBeCloseTo(2.6, 1);
    expect(bucModule.state.temperature).toBeLessThan(65);
  });

  it('the legacy additive offset still lifts the target and clears to zero, never negative', () => {
    bucModule.update();
    const base = bucModule.equilibriumTemperatureC();
    bucModule.setThermalOffset(40);
    expect(bucModule.equilibriumTemperatureC()).toBeCloseTo(base + 40, 6);
    bucModule.setThermalOffset(-5);
    expect(bucModule.thermalOffsetC).toBe(0);
    expect(bucModule.getAlarms().some((a) => a.includes('cooling fault'))).toBe(false);
  });
});

describe('BUCModuleCore temperature trend (nats-s13-F1)', () => {
  const c1Buc = (): TestBUCModule => {
    const tx = createMockTransmitter([
      {
        isTransmitting: true,
        isFaulted: false,
        isLoopback: false,
        ifSignal: { frequency: 500e6, bandwidth: 36e6, power: -7 as dBm, origin: SignalOrigin.TRANSMITTER } as IfSignal,
      },
    ]);
    return new TestBUCModule({ ...BUCModuleCore.getDefaultState(), gain: 33 as dB, saturationPower: 28 as dBm, temperature: 25 }, createMockRfFrontEnd({}, [tx]), 1);
  };

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('a unit staged hot shows the curve that got it there: S13 at 62 degC heading for 65 reads ~57 ten minutes back, rising ~0.3 degC/min', () => {
    const buc = c1Buc();
    buc.setCoolingFactor(1.38);
    buc.update();
    buc.setTemperature(62);
    advanceSimTime(1_000, { emitUpdate: true });

    const target = buc.equilibriumTemperatureC();
    expect(target).toBeGreaterThan(64);
    expect(target).toBeLessThan(66);
    const tenMinAgo = buc.temperatureLog.readingMinutesAgo(10) as number;
    expect(tenMinAgo).toBeCloseTo(target + (62 - target) * Math.E, 0);
    expect(tenMinAgo).toBeGreaterThan(55);
    expect(tenMinAgo).toBeLessThan(59);
    const trend = buc.temperatureTrendCPerMin() as number;
    expect(trend).toBeGreaterThan(0.2);
    expect(trend).toBeLessThan(0.5);
  });

  it('a de-rate turns the trend negative within a few minutes of logged samples', () => {
    const buc = c1Buc();
    buc.setCoolingFactor(1.38);
    buc.update();
    buc.setTemperature(62);
    advanceSimTime(1_000, { emitUpdate: true });
    buc.state.gain = 23 as dB;
    advanceSimTime(5 * 60_000, { emitUpdate: true });

    expect(buc.temperatureTrendCPerMin() as number).toBeLessThan(-0.3);
    expect(buc.temperatureLog.samples.length).toBeGreaterThan(150);
  });

  it('a unit at equilibrium logs a flat line', () => {
    const buc = c1Buc();
    buc.update();
    advanceSimTime(60_000, { emitUpdate: true });
    expect(Math.abs(buc.temperatureTrendCPerMin() as number)).toBeLessThan(0.01);
  });
});
