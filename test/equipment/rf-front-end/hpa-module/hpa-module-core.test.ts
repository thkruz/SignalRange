import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { HPAModuleCore, HPAState } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-core';
import { BUCModuleCore } from '../../../../src/equipment/rf-front-end/buc-module/buc-module-core';
import { SignalOrigin } from '../../../../src/signal-origin';
import type { dB, dBm, RfSignal } from '../../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});

// Concrete test implementation of abstract HPAModuleCore
class TestHPAModule extends HPAModuleCore {
  constructor(state: HPAState, rfFrontEnd: RFFrontEndCore, unit: number = 1) {
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
  public testRenderPowerMeter(powerDbW: number): string {
    return this.renderPowerMeter_(powerDbW as any);
  }
}

// Mock BUC module
function createMockBucModule(overrides: Partial<BUCModuleCore> = {}): BUCModuleCore {
  return {
    state: {
      isPowered: true,
      isLoopback: false,
      outputPower: 10 as dBm,
      gain: 30 as dB,
      isMuted: false,
    },
    outputSignals: [],
    ...overrides,
  } as unknown as BUCModuleCore;
}

// Mock RFFrontEndCore
function createMockRfFrontEnd(bucOverrides: Partial<BUCModuleCore> = {}): RFFrontEndCore {
  const bucModule = createMockBucModule(bucOverrides);
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }),
    },
    bucModule,
    state: {
      teamId: 1,
      serverId: 1,
      buc: bucModule.state,
    },
  } as unknown as RFFrontEndCore;
}

describe('HPAModuleCore', () => {
  let hpaModule: TestHPAModule;
  let mockRfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    jest.clearAllMocks();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('getDefaultState()', () => {
    it('should return correct default values', () => {
      const defaults = HPAModuleCore.getDefaultState();

      expect(defaults.isPowered).toBe(true);
      expect(defaults.backOff).toBe(10);
      expect(defaults.outputPower).toBe(40);
      expect(defaults.isOverdriven).toBe(false);
      expect(defaults.imdLevel).toBe(-50);
      expect(defaults.temperature).toBe(75);
      expect(defaults.isHpaEnabled).toBe(false);
      expect(defaults.isHpaSwitchEnabled).toBe(false);
      expect(defaults.noiseFloor).toBe(-140);
      expect(defaults.gain).toBe(44);
    });
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      expect(hpaModule).toBeInstanceOf(HPAModuleCore);
      expect(hpaModule.state.isPowered).toBe(true);
      expect(hpaModule.state.backOff).toBe(10);
    });

    it('should merge provided state with defaults', () => {
      const customState: HPAState = {
        ...HPAModuleCore.getDefaultState(),
        isPowered: false,
        backOff: 15,
        temperature: 50,
      };

      hpaModule = new TestHPAModule(customState, mockRfFrontEnd, 1);

      expect(hpaModule.state.isPowered).toBe(false);
      expect(hpaModule.state.backOff).toBe(15);
      expect(hpaModule.state.temperature).toBe(50);
      expect(hpaModule.state.gain).toBe(44); // from defaults
    });

    it('should generate correct uniqueId', () => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        2
      );

      expect((hpaModule as any).uniqueId).toBe('rf-fe-hpa-2');
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    describe('output power calculation', () => {
      it('should calculate output power when powered and enabled', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = true;
        hpaModule.state.backOff = 10;

        hpaModule.update();

        // P1dB (50) - backOff (10) = 40 dBm
        expect(hpaModule.state.outputPower).toBe(40);
      });

      it('should set output power to -90 when powered but not enabled', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = false;

        hpaModule.update();

        expect(hpaModule.state.outputPower).toBe(-90);
      });

      it('should set output power to -90 when not powered', () => {
        hpaModule.state.isPowered = false;
        hpaModule.state.isHpaEnabled = true;

        hpaModule.update();

        expect(hpaModule.state.outputPower).toBe(-90);
      });

      it('should adjust output power with different back-off values', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = true;

        hpaModule.state.backOff = 0;
        hpaModule.update();
        expect(hpaModule.state.outputPower).toBe(50); // P1dB

        hpaModule.state.backOff = 20;
        hpaModule.update();
        expect(hpaModule.state.outputPower).toBe(30); // P1dB - 20
      });
    });

    describe('temperature calculation', () => {
      it('should calculate temperature based on output power when powered', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = true;
        hpaModule.state.backOff = 10;

        hpaModule.update();

        // At 40 dBm: 10W, dissipated = 5W (50% efficiency), temp = 25 + 50 = 75
        expect(hpaModule.state.temperature).toBeCloseTo(75, 0);
      });

      it('should set temperature to ambient when not powered', () => {
        hpaModule.state.isPowered = false;

        hpaModule.update();

        expect(hpaModule.state.temperature).toBe(25);
      });

      it('should calculate higher temperature at higher power', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = true;
        hpaModule.state.backOff = 0; // Max power

        hpaModule.update();

        // At 50 dBm: 100W, dissipated = 50W, temp = 25 + 500 = 525
        expect(hpaModule.state.temperature).toBeGreaterThan(75);
      });
    });

    describe('IMD calculation', () => {
      it('should calculate IMD based on back-off when powered', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.backOff = 10;

        hpaModule.update();

        // IMD = -30 - (backOff * 2) = -30 - 20 = -50 dBc
        expect(hpaModule.state.imdLevel).toBe(-50);
      });

      it('should improve IMD with higher back-off', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.backOff = 20;

        hpaModule.update();

        // IMD = -30 - (20 * 2) = -70 dBc (better)
        expect(hpaModule.state.imdLevel).toBe(-70);
      });

      it('should set IMD to -60 when not powered', () => {
        hpaModule.state.isPowered = false;

        hpaModule.update();

        expect(hpaModule.state.imdLevel).toBe(-60);
      });

      it('should set overdrive status when back-off < 3', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.backOff = 2;

        hpaModule.update();

        expect(hpaModule.state.isOverdriven).toBe(true);
      });

      it('should not set overdrive when back-off >= 3', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.backOff = 3;

        hpaModule.update();

        expect(hpaModule.state.isOverdriven).toBe(false);
      });

      it('should not set overdrive when not powered', () => {
        hpaModule.state.isPowered = false;
        hpaModule.state.backOff = 0;

        hpaModule.update();

        expect(hpaModule.state.isOverdriven).toBe(false);
      });
    });

    describe('alarm checking', () => {
      it('should disable HPA if BUC is not powered', () => {
        mockRfFrontEnd = createMockRfFrontEnd({ state: { isPowered: false } as any });
        hpaModule = new TestHPAModule(
          { ...HPAModuleCore.getDefaultState(), isPowered: true },
          mockRfFrontEnd,
          1
        );

        hpaModule.update();

        expect(hpaModule.state.isPowered).toBe(false);
      });
    });

    describe('signal processing', () => {
      it('should output empty signals when not powered', () => {
        hpaModule.state.isPowered = false;

        hpaModule.update();

        expect(hpaModule.outputSignals).toEqual([]);
      });

      it('should output empty signals when not enabled', () => {
        hpaModule.state.isPowered = true;
        hpaModule.state.isHpaEnabled = false;

        hpaModule.update();

        expect(hpaModule.outputSignals).toEqual([]);
      });

      it('should process input signals when powered and enabled', () => {
        const inputSignal: RfSignal = {
          frequency: 14000e6,
          power: 0 as dBm,
          bandwidth: 36e6,
          origin: SignalOrigin.BLOCK_UPCONVERTER,
        };

        (mockRfFrontEnd.bucModule as any).outputSignals = [inputSignal];
        hpaModule = new TestHPAModule(
          { ...HPAModuleCore.getDefaultState(), isPowered: true, isHpaEnabled: true },
          mockRfFrontEnd,
          1
        );

        hpaModule.update();

        expect(hpaModule.outputSignals.length).toBe(1);
        expect(hpaModule.outputSignals[0].origin).toBe(SignalOrigin.HIGH_POWER_AMPLIFIER);
      });

      it('should apply gain and back-off to signals', () => {
        const inputSignal: RfSignal = {
          frequency: 14000e6,
          power: 0 as dBm,
          bandwidth: 36e6,
          origin: SignalOrigin.BLOCK_UPCONVERTER,
        };

        (mockRfFrontEnd.bucModule as any).outputSignals = [inputSignal];
        hpaModule = new TestHPAModule(
          { ...HPAModuleCore.getDefaultState(), isPowered: true, isHpaEnabled: true, backOff: 10 },
          mockRfFrontEnd,
          1
        );

        hpaModule.update();

        // Output power should include gain calculation minus back-off
        expect(hpaModule.outputSignals[0].power).toBeDefined();
      });

      it('should return empty signals when BUC is in loopback mode', () => {
        (mockRfFrontEnd.bucModule as any).state.isLoopback = true;
        hpaModule = new TestHPAModule(
          { ...HPAModuleCore.getDefaultState(), isPowered: true, isHpaEnabled: true },
          mockRfFrontEnd,
          1
        );

        expect(hpaModule.inputSignals).toEqual([]);
      });
    });
  });

  describe('handlePowerToggle()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should enable power when BUC is powered', () => {
      hpaModule.state.isPowered = false;
      const callback = jest.fn();

      hpaModule.handlePowerToggle(true, callback);

      expect(hpaModule.state.isPowered).toBe(true);
      expect(callback).toHaveBeenCalledWith(hpaModule.state);
    });

    it('should disable power', () => {
      hpaModule.state.isPowered = true;
      const callback = jest.fn();

      hpaModule.handlePowerToggle(false, callback);

      expect(hpaModule.state.isPowered).toBe(false);
      expect(callback).toHaveBeenCalledWith(hpaModule.state);
    });

    it('should not enable power when BUC is not powered', () => {
      mockRfFrontEnd = createMockRfFrontEnd({ state: { isPowered: false } as any });
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: false },
        mockRfFrontEnd,
        1
      );
      const callback = jest.fn();

      hpaModule.handlePowerToggle(true, callback);

      expect(hpaModule.state.isPowered).toBe(false);
      expect(callback).toHaveBeenCalledWith(hpaModule.state);
    });
  });

  describe('handleBackOffChange()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: true, isHpaEnabled: true },
        mockRfFrontEnd,
        1
      );
    });

    it('should update back-off value', () => {
      hpaModule.handleBackOffChange(15);

      expect(hpaModule.state.backOff).toBe(15);
    });

    it('should recalculate output power immediately', () => {
      hpaModule.handleBackOffChange(5);

      // P1dB (50) - backOff (5) = 45 dBm
      expect(hpaModule.state.outputPower).toBe(45);
    });

    it('should recalculate IMD immediately', () => {
      hpaModule.handleBackOffChange(15);

      // IMD = -30 - (15 * 2) = -60 dBc
      expect(hpaModule.state.imdLevel).toBe(-60);
    });

    it('should update overdrive status immediately', () => {
      hpaModule.handleBackOffChange(2);

      expect(hpaModule.state.isOverdriven).toBe(true);
    });

    it('should recalculate temperature immediately', () => {
      const initialTemp = hpaModule.state.temperature;
      hpaModule.handleBackOffChange(0); // Max power

      expect(hpaModule.state.temperature).toBeGreaterThan(initialTemp);
    });
  });

  describe('handleHpaToggle()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: true },
        mockRfFrontEnd,
        1
      );
    });

    it('should toggle HPA switch state', () => {
      hpaModule.state.isHpaSwitchEnabled = false;

      hpaModule.handleHpaToggle();

      expect(hpaModule.state.isHpaSwitchEnabled).toBe(true);
    });

    it('should enable HPA when switch is toggled on and powered', () => {
      hpaModule.state.isHpaSwitchEnabled = false;
      hpaModule.state.isHpaEnabled = false;
      hpaModule.state.isPowered = true;

      hpaModule.handleHpaToggle();

      expect(hpaModule.state.isHpaEnabled).toBe(true);
    });

    it('should disable HPA when switch is toggled off', () => {
      hpaModule.state.isHpaSwitchEnabled = true;
      hpaModule.state.isHpaEnabled = true;

      hpaModule.handleHpaToggle();

      expect(hpaModule.state.isHpaSwitchEnabled).toBe(false);
      expect(hpaModule.state.isHpaEnabled).toBe(false);
    });

    it('should not toggle when not powered', () => {
      hpaModule.state.isPowered = false;
      hpaModule.state.isHpaSwitchEnabled = false;

      hpaModule.handleHpaToggle();

      expect(hpaModule.state.isHpaSwitchEnabled).toBe(false);
    });

    it('should recalculate output power immediately', () => {
      hpaModule.state.isHpaSwitchEnabled = false;
      hpaModule.state.isHpaEnabled = false;

      hpaModule.handleHpaToggle();

      // Should now have real output power instead of -90
      expect(hpaModule.state.outputPower).toBeGreaterThan(-90);
    });
  });

  describe('getAlarms()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return empty array when no alarms', () => {
      hpaModule.state.isPowered = true;
      hpaModule.state.isOverdriven = false;
      hpaModule.state.temperature = 70;

      const alarms = hpaModule.getAlarms();

      expect(alarms).toEqual([]);
    });

    it('should return overdrive alarm when overdriven and powered', () => {
      hpaModule.state.isPowered = true;
      hpaModule.state.isOverdriven = true;

      const alarms = hpaModule.getAlarms();

      expect(alarms).toContain('HPA overdrive - IMD degradation');
    });

    it('should not return overdrive alarm when not powered', () => {
      hpaModule.state.isPowered = false;
      hpaModule.state.isOverdriven = true;

      const alarms = hpaModule.getAlarms();

      expect(alarms).not.toContain('HPA overdrive - IMD degradation');
    });

    it('should return temperature alarm when over 85C', () => {
      hpaModule.state.isPowered = true;
      hpaModule.state.temperature = 90;

      const alarms = hpaModule.getAlarms();

      expect(alarms.some(a => a.includes('over-temperature'))).toBe(true);
      expect(alarms.some(a => a.includes('90'))).toBe(true);
    });

    it('should return power sequencing alarm when HPA on without BUC', () => {
      mockRfFrontEnd = createMockRfFrontEnd({ state: { isPowered: false } as any });
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: true },
        mockRfFrontEnd,
        1
      );

      const alarms = hpaModule.getAlarms();

      expect(alarms).toContain('HPA enabled without BUC power');
    });

    it('should return multiple alarms when multiple conditions met', () => {
      hpaModule.state.isPowered = true;
      hpaModule.state.isOverdriven = true;
      hpaModule.state.temperature = 90;

      const alarms = hpaModule.getAlarms();

      expect(alarms.length).toBe(2);
    });
  });

  describe('getTotalGain()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return -120 when not powered', () => {
      hpaModule.state.isPowered = false;

      const gain = hpaModule.getTotalGain();

      expect(gain).toBe(-120);
    });

    it('should return calculated gain when powered', () => {
      hpaModule.state.isPowered = true;
      hpaModule.state.backOff = 10;

      const gain = hpaModule.getTotalGain();

      expect(gain).toBeGreaterThan(0);
    });
  });

  describe('getOutputPower()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: true },
        mockRfFrontEnd,
        1
      );
    });

    it('should return -120 when not powered', () => {
      hpaModule.state.isPowered = false;

      const power = hpaModule.getOutputPower(-10);

      expect(power).toBe(-120);
    });

    it('should return calculated output power when powered', () => {
      hpaModule.state.isPowered = true;

      const power = hpaModule.getOutputPower(0);

      expect(power).toBeGreaterThan(0);
    });
  });

  describe('isOverdriven()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return true when state.isOverdriven is true', () => {
      hpaModule.state.isOverdriven = true;

      expect(hpaModule.isOverdriven()).toBe(true);
    });

    it('should return false when state.isOverdriven is false', () => {
      hpaModule.state.isOverdriven = false;

      expect(hpaModule.isOverdriven()).toBe(false);
    });
  });

  describe('getTemperature()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return current temperature', () => {
      hpaModule.state.temperature = 65;

      expect(hpaModule.getTemperature()).toBe(65);
    });
  });

  describe('getIMDLevel()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should return current IMD level', () => {
      hpaModule.state.imdLevel = -45;

      expect(hpaModule.getIMDLevel()).toBe(-45);
    });
  });

  describe('inputSignals getter', () => {
    it('should return empty array when BUC is in loopback', () => {
      (mockRfFrontEnd.bucModule as any).state.isLoopback = true;
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      expect(hpaModule.inputSignals).toEqual([]);
    });

    it('should return BUC output signals when not in loopback', () => {
      const testSignals: RfSignal[] = [
        { frequency: 14000e6, power: 10 as dBm, bandwidth: 36e6, origin: SignalOrigin.BLOCK_UPCONVERTER },
      ];
      (mockRfFrontEnd.bucModule as any).state.isLoopback = false;
      (mockRfFrontEnd.bucModule as any).outputSignals = testSignals;

      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );

      expect(hpaModule.inputSignals).toEqual(testSignals);
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should merge partial state', () => {
      const newState: Partial<HPAState> = {
        temperature: 80,
        backOff: 15,
      };

      hpaModule.sync(newState);

      expect(hpaModule.state.temperature).toBe(80);
      expect(hpaModule.state.backOff).toBe(15);
      expect(hpaModule.state.isPowered).toBe(true); // unchanged
    });
  });

  describe('renderPowerMeter_()', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        HPAModuleCore.getDefaultState(),
        mockRfFrontEnd,
        1
      );
    });

    it('should render 5 LED segments', () => {
      const html = hpaModule.testRenderPowerMeter(10);

      const segmentCount = (html.match(/led-segment/g) || []).length;
      expect(segmentCount).toBe(5);
    });

    it('should render all off segments at low power', () => {
      const html = hpaModule.testRenderPowerMeter(-50);

      expect(html).not.toContain('led-green');
      expect(html).not.toContain('led-yellow');
      expect(html).not.toContain('led-red');
    });

    it('should render green segments at moderate power', () => {
      const html = hpaModule.testRenderPowerMeter(10);

      expect(html).toContain('led-green');
    });

    it('should render yellow segments at higher power', () => {
      // Yellow threshold is at 80% of max (23 dBW), so need ~19 dBW
      const html = hpaModule.testRenderPowerMeter(19);

      expect(html).toContain('led-yellow');
    });

    it('should render red segments at high power', () => {
      // Red threshold is at 100% of max (23 dBW)
      const html = hpaModule.testRenderPowerMeter(24);

      expect(html).toContain('led-red');
    });
  });

  describe('gain calculation', () => {
    beforeEach(() => {
      hpaModule = new TestHPAModule(
        { ...HPAModuleCore.getDefaultState(), isPowered: true, isHpaEnabled: true, backOff: 10 },
        mockRfFrontEnd,
        1
      );
    });

    it('should apply max gain limit of 50 dB', () => {
      // Very low input power would require very high gain
      const power = hpaModule.getOutputPower(-100);

      // Output should be limited by max gain
      expect(power).toBeLessThanOrEqual(-100 + 50);
    });

    it('should apply compression when input is near saturation', () => {
      // High input power near P1dB should cause compression
      const power = hpaModule.getOutputPower(45);

      // Gain should be reduced due to compression
      expect(power).toBeLessThan(45 + 50);
    });

    it('should update state.gain based on processed signals', () => {
      const inputSignal: RfSignal = {
        frequency: 14000e6,
        power: 0 as dBm,
        bandwidth: 36e6,
        origin: SignalOrigin.BLOCK_UPCONVERTER,
      };

      (mockRfFrontEnd.bucModule as any).outputSignals = [inputSignal];

      hpaModule.update();

      expect(hpaModule.state.gain).toBeGreaterThan(0);
    });

    it('should set state.gain to 0 when no input signals', () => {
      (mockRfFrontEnd.bucModule as any).outputSignals = [];

      hpaModule.update();

      expect(hpaModule.state.gain).toBe(0);
    });
  });
});
