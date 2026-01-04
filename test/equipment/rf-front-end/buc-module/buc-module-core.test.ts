import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { BUCModuleCore, BUCState } from '../../../../src/equipment/rf-front-end/buc-module/buc-module-core';
import { SignalOrigin } from '../../../../src/signal-origin';
import type { dB, dBm, Hertz, IfSignal, MHz } from '../../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
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
      modems: modems.length > 0 ? modems : [{
        isTransmitting: true,
        isFaulted: false,
        isLoopback: false,
        ifSignal: {
          frequency: 500e6,
          bandwidth: 36e6,
          power: -10 as dBm,
          origin: SignalOrigin.TRANSMITTER,
        } as IfSignal,
      }],
    },
  };
}

// Mock RFFrontEndCore
function createMockRfFrontEnd(
  gpsdoOverrides: { isPresent?: boolean; isWarmedUp?: boolean } = {},
  transmitters?: any[]
): RFFrontEndCore {
  // If transmitters is explicitly undefined, use default; if explicitly empty array, use empty
  const txList = transmitters === undefined
    ? [createMockTransmitter()]
    : transmitters;
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({
        isPresent: gpsdoOverrides.isPresent ?? true,
        isWarmedUp: gpsdoOverrides.isWarmedUp ?? true,
      }),
    },
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
    jest.clearAllMocks();
    jest.useFakeTimers();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        2
      );

      expect((bucModule as any).uniqueId).toBe('rf-fe-buc-2');
    });

    it('should initialize with empty output signals', () => {
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      expect(bucModule.outputSignals).toEqual([]);
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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

        // Input power is -10 dBm, gain is 20 dB, so output should be around 10 dBm
        expect(bucModule.outputSignals[0].power).toBe(10);
      });

      it('should attenuate signals when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;

        bucModule.update();

        // When muted, gain is -170 dB
        expect(bucModule.outputSignals[0].power).toBeLessThan(-100);
      });

      it('should attenuate signals when not powered', () => {
        // Verify we have input signals
        expect(bucModule.inputSignals.length).toBeGreaterThan(0);

        bucModule.state.isPowered = false;
        bucModule.update();

        // When not powered, gain is -170 dB, signals are heavily attenuated
        expect(bucModule.outputSignals.length).toBeGreaterThan(0);
        expect(bucModule.outputSignals[0].power).toBeLessThan(-100);
      });

      it('should reject out-of-band signals', () => {
        // Create a transmitter with out-of-band IF signal
        const outOfBandTransmitter = createMockTransmitter([{
          isTransmitting: true,
          isFaulted: false,
          isLoopback: false,
          ifSignal: {
            frequency: 2000e6 as Hertz, // This will produce out-of-band RF
            bandwidth: 36e6,
            power: -10 as dBm,
            origin: SignalOrigin.TRANSMITTER,
          } as IfSignal,
        }]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [outOfBandTransmitter]);
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );

        bucModule.update();

        // Out-of-band signal should be filtered out
        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from faulted modems', () => {
        const faultedTransmitter = createMockTransmitter([{
          isTransmitting: true,
          isFaulted: true,
          isLoopback: false,
          ifSignal: {
            frequency: 500e6,
            bandwidth: 36e6,
            power: -10 as dBm,
            origin: SignalOrigin.TRANSMITTER,
          } as IfSignal,
        }]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [faultedTransmitter]);
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from loopback modems', () => {
        const loopbackTransmitter = createMockTransmitter([{
          isTransmitting: true,
          isFaulted: false,
          isLoopback: true,
          ifSignal: {
            frequency: 500e6,
            bandwidth: 36e6,
            power: -10 as dBm,
            origin: SignalOrigin.TRANSMITTER,
          } as IfSignal,
        }]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [loopbackTransmitter]);
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );

        bucModule.update();

        expect(bucModule.outputSignals.length).toBe(0);
      });

      it('should not process signals from non-transmitting modems', () => {
        const nonTxTransmitter = createMockTransmitter([{
          isTransmitting: false,
          isFaulted: false,
          isLoopback: false,
          ifSignal: {
            frequency: 500e6,
            bandwidth: 36e6,
            power: -10 as dBm,
            origin: SignalOrigin.TRANSMITTER,
          } as IfSignal,
        }]);

        mockRfFrontEnd = createMockRfFrontEnd({}, [nonTxTransmitter]);
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );

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
        bucModule = new TestBUCModule(
          { ...BUCModuleCore.getDefaultState(), isExtRefLocked: true },
          mockRfFrontEnd,
          1
        );

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
        jest.advanceTimersByTime(6000);

        expect(bucModule.state.isExtRefLocked).toBe(true);
      });

      it('should have frequency drift when external reference is not warmed up', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: true, isWarmedUp: false });
        bucModule = new TestBUCModule(
          { ...BUCModuleCore.getDefaultState(), isExtRefLocked: true },
          mockRfFrontEnd,
          1
        );

        bucModule.update();

        // Frequency error should be non-zero when not warmed up
        expect(bucModule.state.frequencyError).not.toBe(0);
      });

      it('should have frequency drift when unlocked', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );

        bucModule.update();

        expect(bucModule.state.frequencyError).not.toBe(0);
      });
    });

    describe('output power calculation', () => {
      it('should set output power to -170 when not powered', () => {
        bucModule.state.isPowered = false;

        bucModule.update();

        expect(bucModule.state.outputPower).toBe(-170);
      });

      it('should set output power to -170 when muted', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = true;

        bucModule.update();

        expect(bucModule.state.outputPower).toBe(-170);
      });

      it('should calculate linear output power below saturation', () => {
        bucModule.state.isPowered = true;
        bucModule.state.isMuted = false;
        bucModule.state.gain = 10 as dB;

        bucModule.update();

        // Input -10 dBm + 10 dB gain = 0 dBm (below saturation at 15 dBm)
        expect(bucModule.state.outputPower).toBe(0);
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

        expect(bucModule.state.phaseNoise).toBeLessThanOrEqual(-100);
        expect(bucModule.state.phaseNoise).toBeGreaterThanOrEqual(-105);
      });

      it('should have degraded phase noise when unlocked', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ isPresent: false });
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );
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
        expect(bucModule.state.spuriousOutputs.some(s => s.loHarmonic === 2)).toBe(true);
        expect(bucModule.state.spuriousOutputs.some(s => s.loHarmonic === 3)).toBe(true);
      });

      it('should not generate spurious products when no input signals', () => {
        mockRfFrontEnd = createMockRfFrontEnd({}, []);
        bucModule = new TestBUCModule(
          BUCModuleCore.getDefaultState(),
          mockRfFrontEnd,
          1
        );
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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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

      expect(alarms.some(a => a.includes('frequency error'))).toBe(true);
      expect(alarms.some(a => a.includes('60.0 kHz'))).toBe(true);
    });

    it('should return saturation warning when approaching P1dB', () => {
      bucModule.state.isPowered = true;
      bucModule.state.saturationPower = 15 as dBm;
      bucModule.state.outputPower = 14 as dBm; // Within 2 dB of saturation

      const alarms = bucModule.getAlarms();

      expect(alarms.some(a => a.includes('saturation'))).toBe(true);
    });

    it('should return over-temperature alarm when > 70°C', () => {
      bucModule.state.isPowered = true;
      bucModule.state.temperature = 75;

      const alarms = bucModule.getAlarms();

      expect(alarms.some(a => a.includes('over-temperature'))).toBe(true);
      expect(alarms.some(a => a.includes('75.0'))).toBe(true);
    });

    it('should return high current alarm when > 4.5A', () => {
      bucModule.state.isPowered = true;
      bucModule.state.currentDraw = 5.0;

      const alarms = bucModule.getAlarms();

      expect(alarms.some(a => a.includes('high current'))).toBe(true);
      expect(alarms.some(a => a.includes('5.00 A'))).toBe(true);
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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return "none" when no input signals', () => {
      mockRfFrontEnd = createMockRfFrontEnd({}, []);
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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
      bucModule = new TestBUCModule(
        { ...BUCModuleCore.getDefaultState(), isPowered: true, isMuted: false },
        mockRfFrontEnd,
        1
      );
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

        // Input -10 dBm + 10 dB gain = 0 dBm (below saturation)
        expect(bucModule.getOutputPower(-10)).toBe(0);
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

      it('should return compression amount in saturation', () => {
        bucModule.state.gain = 30 as dB;
        bucModule.state.saturationPower = 15 as dBm;
        // Linear output = -10 + 30 = 20 dBm, 5 dB above P1dB
        // Compression = min(5 * 0.5, 3) = 2.5 dB
        expect(bucModule.getCompressionDb()).toBeCloseTo(2.5, 1);
      });

      it('should cap compression at 3 dB', () => {
        bucModule.state.gain = 50 as dB;
        bucModule.state.saturationPower = 15 as dBm;
        // Very high compression scenario
        expect(bucModule.getCompressionDb()).toBeLessThanOrEqual(3);
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
        bucModule.state.spuriousOutputs = [
          { frequency: 10e9 as Hertz, level: -40, loHarmonic: 2, ifHarmonic: 1 },
        ];

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
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      expect(bucModule.inputSignals).toEqual([]);
    });

    it('should return IF signals from transmitting modems', () => {
      const tx = createMockTransmitter();
      mockRfFrontEnd = createMockRfFrontEnd({}, [tx]);
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      const inputs = bucModule.inputSignals;
      expect(inputs.length).toBe(1);
      expect(inputs[0].frequency).toBe(500e6);
    });

    it('should aggregate signals from multiple transmitters', () => {
      const tx1 = createMockTransmitter();
      const tx2 = createMockTransmitter([{
        isTransmitting: true,
        isFaulted: false,
        isLoopback: false,
        ifSignal: {
          frequency: 600e6,
          bandwidth: 36e6,
          power: -10 as dBm,
          origin: SignalOrigin.TRANSMITTER,
        } as IfSignal,
      }]);

      mockRfFrontEnd = createMockRfFrontEnd({}, [tx1, tx2]);
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      const inputs = bucModule.inputSignals;
      expect(inputs.length).toBe(2);
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      bucModule = new TestBUCModule(
        BUCModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
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
