import { vi } from 'vitest';
import { amplifierFromDatasheet, outputPowerDbm } from '../../../../src/equipment/rf-front-end/amplifier-models';
import { BUCModuleCore } from '../../../../src/equipment/rf-front-end/buc-module/buc-module-core';
import { HPAModuleCore, HPAState } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-core';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import { FIXED_STEP_MS, SimClock } from '../../../../src/simulation/sim-clock';
import type { dB, dBm, RfSignal } from '../../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
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

function carrier(power: number, frequency = 6e9, id = 'c1'): RfSignal {
  return {
    signalId: id,
    serverId: 1,
    noradId: 12345,
    frequency: frequency as any,
    polarization: 'H',
    power: power as dBm,
    bandwidth: 36e6 as any,
    modulation: 'QPSK' as any,
    fec: '3/4' as any,
    feed: '',
    isDegraded: false,
    origin: SignalOrigin.BUC,
    noiseFloor: null as any,
    gainInPath: 0 as any,
  };
}

function createMockRfFrontEnd(signals: RfSignal[] = [carrier(16)]): RFFrontEndCore {
  const bucModule = {
    state: { isPowered: true, isLoopback: false, outputPower: 16 as dBm, gain: 23 as dB, isMuted: false },
    outputSignals: signals,
  } as unknown as BUCModuleCore;

  return {
    gpsdoModule: { get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }) },
    bucModule,
    cableLossDb: () => 0,
    state: { teamId: 1, serverId: 1, buc: bucModule.state },
  } as unknown as RFFrontEndCore;
}

/** A 1 kW C-band TWTA in ALC (the Campaign 1 station HPA) */
function c1Hpa(fe: RFFrontEndCore, overrides: Partial<HPAState> = {}): TestHPAModule {
  return new TestHPAModule(
    { ...HPAModuleCore.getDefaultState(), amplifierType: 'twta', p1db: 60 as dBm, backOff: 10, isHpaEnabled: true, isHpaSwitchEnabled: true, ...overrides },
    fe,
    1
  );
}

function runFor(module: TestHPAModule, seconds: number): void {
  const steps = Math.round((seconds * 1000) / FIXED_STEP_MS);
  for (let i = 0; i < steps; i++) {
    SimClock.step();
    module.update();
  }
}

describe('HPAModuleCore (phase 19.6 amplifier model)', () => {
  let fe: RFFrontEndCore;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);
    SimClock.reset();
    fe = createMockRfFrontEnd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('defaults', () => {
    it('starts with no RF: output -90 dBm, ALC on, 10 dB back-off', () => {
      const d = HPAModuleCore.getDefaultState();
      expect(d.outputPower).toBe(-90);
      expect(d.backOff).toBe(10);
      expect(d.isAlcEnabled).toBe(true);
      expect(d.isHpaEnabled).toBe(false);
    });

    it('defaults P1dB to 59 dBm and a TWTA (Saleh) curve 4.12 dB under Psat', () => {
      const hpa = new TestHPAModule(HPAModuleCore.getDefaultState(), fe, 1);
      expect(hpa.p1db).toBe(59);
      expect(hpa.psatDbm).toBeCloseTo(63.12, 2);
    });
  });

  describe('ALC: output = P1dB - back-off, input + gain = output', () => {
    it.each([10, 8, 6, 5, 3, 1, 0])('back-off %i dB', (backOff) => {
      const hpa = c1Hpa(fe, { backOff });
      hpa.update();
      expect(hpa.state.outputPower).toBeCloseTo(60 - backOff, 2);
      expect(hpa.state.inputPower! + hpa.state.gain).toBeCloseTo(hpa.state.outputPower, 6);
      expect(hpa.state.outputBackoffDb).toBeCloseTo(backOff, 2);
      expect(hpa.outputSignals[0].power).toBeCloseTo(hpa.state.outputPower, 6);
    });

    it('a 5 -> 10 dB back-off change drops the output 5 dB; 1 -> 10 drops 9 dB', () => {
      const a = c1Hpa(fe, { backOff: 5 });
      a.update();
      const b = c1Hpa(fe, { backOff: 10 });
      b.update();
      const c = c1Hpa(fe, { backOff: 1 });
      c.update();
      expect(a.state.outputPower - b.state.outputPower).toBeCloseTo(5, 2);
      expect(c.state.outputPower - b.state.outputPower).toBeCloseTo(9, 2);
    });

    it('holds the output when the drive drops 10 dB: the gain rises 10 dB', () => {
      const hot = c1Hpa(createMockRfFrontEnd([carrier(26)]), { backOff: 8 });
      hot.update();
      const derated = c1Hpa(createMockRfFrontEnd([carrier(16)]), { backOff: 8 });
      derated.update();
      expect(hot.state.outputPower).toBeCloseTo(derated.state.outputPower, 2);
      expect(derated.state.gain - hot.state.gain).toBeCloseTo(10, 2);
    });

    it('flags the ALC end stop when the drive is too weak for the setpoint', () => {
      const hpa = c1Hpa(createMockRfFrontEnd([carrier(-40)]), { backOff: 0 });
      hpa.update();
      expect(hpa.state.isAlcAtLimit).toBe(true);
      expect(hpa.state.outputPower).toBeLessThan(60);
      expect(hpa.getAlarms().some((a) => a.includes('ALC at maximum gain'))).toBe(true);
    });
  });

  describe('fixed gain (ALC off): the back-off is an attenuator calibrated on the rated drive', () => {
    it('gives P1dB - back-off at the rated drive and follows the drive dB for dB', () => {
      const signals = [carrier(16)];
      const hpa = c1Hpa(createMockRfFrontEnd(signals), { isAlcEnabled: false, ratedInputDbm: 16 as dBm, backOff: 10 });
      hpa.update();
      // Small-signal calibration: 50 dBm less the 0.08 dB the curve takes 10 dB under P1dB
      expect(Math.abs(hpa.state.outputPower - 49.92)).toBeLessThan(0.02);

      // The drive drops 5 dB (a BUC left at 18 dB instead of 23): so does the output
      signals[0] = carrier(11);
      hpa.update();
      expect(Math.abs(hpa.state.outputPower - 44.97)).toBeLessThan(0.03);
      expect(hpa.state.gain).toBeCloseTo(hpa.state.outputPower - 11, 6);
    });

    it('switching ALC off keeps the back-off meaning: the gain is the rated-drive calibration', () => {
      const hpa = c1Hpa(fe, { backOff: 6, ratedInputDbm: 16 as dBm });
      hpa.update();
      expect(hpa.state.outputPower).toBeCloseTo(54, 2);
      hpa.handleAlcToggle(false);
      expect(hpa.isAlcEnabled).toBe(false);
      // Rated drive: P1dB - 6 less the curve's 0.3 dB of compression there
      expect(hpa.state.outputPower).toBeGreaterThan(53.5);
      expect(hpa.state.outputPower).toBeLessThan(54);
    });
  });

  describe('compression and intermodulation', () => {
    it('reads the AM/AM curve: small-signal gain minus compression', () => {
      // ALC off, rated drive 0 dBm, back-off 0: attenuation = 0 + 60 - 60 = 0 dB
      const hpa = c1Hpa(fe, { isAlcEnabled: false, ratedInputDbm: 0 as dBm, backOff: 0 });
      hpa.update();
      expect(hpa.state.attenuationDb).toBeCloseTo(0, 6);
      const model = amplifierFromDatasheet('saleh', 60, 60);
      expect(hpa.state.outputPower).toBeCloseTo(outputPowerDbm(model, 16), 2);
    });

    it('IM3 rises as the back-off drops (the back-off lesson)', () => {
      const levels = [10, 6, 3, 1].map((backOff) => {
        const hpa = c1Hpa(fe, { backOff });
        hpa.update();
        return hpa.state.imdLevel;
      });
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeGreaterThan(levels[i - 1]);
      }
      // About 2 dB worse per dB of back-off given up in the linear region
      expect((levels[1] - levels[0]) / 4).toBeGreaterThan(1.7);
      expect((levels[1] - levels[0]) / 4).toBeLessThan(2.3);
    });

    it('overdrive below 3 dB of output back-off', () => {
      const ok = c1Hpa(fe, { backOff: 3 });
      ok.update();
      const hot = c1Hpa(fe, { backOff: 2 });
      hot.update();
      expect(ok.state.isOverdriven).toBe(false);
      expect(hot.state.isOverdriven).toBe(true);
      expect(hot.getAlarms()).toContain('HPA overdrive - IMD degradation');
    });

    it('draws regrowth shoulders for one carrier and 2f1 - f2 products for two', () => {
      const one = c1Hpa(fe);
      one.update();
      expect(one.distortionSignals).toHaveLength(2);
      expect(one.distortionSignals.every((s) => s.isDistortion)).toBe(true);
      expect(one.distortionSignals[0].power).toBeCloseTo(one.outputSignals[0].power + one.state.imdLevel, 6);

      const two = c1Hpa(createMockRfFrontEnd([carrier(13, 5.93e9, 'a'), carrier(13, 5.97e9, 'b')]));
      two.update();
      const freqs = two.distortionSignals.map((s) => s.frequency).sort();
      expect(freqs).toEqual([5.89e9, 6.01e9]);
      // Equal carriers: each product sits at the two-tone C/IM3 below a carrier
      expect(two.distortionSignals[0].power).toBeCloseTo(two.outputSignals[0].power + two.state.imdLevel, 1);
    });
  });

  describe('no RF', () => {
    it('reads -90 dBm and no distortion when disabled or unpowered', () => {
      const off = c1Hpa(fe, { isHpaEnabled: false });
      off.update();
      expect(off.state.outputPower).toBe(-90);
      expect(off.outputSignals).toEqual([]);
      expect(off.distortionSignals).toEqual([]);
      expect(off.state.isOverdriven).toBe(false);

      const unpowered = c1Hpa(fe, { isPowered: false });
      unpowered.update();
      expect(unpowered.outputSignals).toEqual([]);
    });

    it('passes nothing while the BUC is in loopback', () => {
      (fe.bucModule.state as { isLoopback: boolean }).isLoopback = true;
      const hpa = c1Hpa(fe);
      expect(hpa.inputSignals).toEqual([]);
    });

    it('disables itself when the BUC is not powered', () => {
      (fe.bucModule.state as { isPowered: boolean }).isPowered = false;
      const hpa = c1Hpa(fe);
      hpa.update();
      expect(hpa.state.isPowered).toBe(false);
    });
  });

  describe('thermal (first-order lag on run time)', () => {
    it('starts at its equilibrium and heats toward a hotter one when the output rises', () => {
      const hpa = c1Hpa(fe, { backOff: 10 });
      hpa.update();
      const cool = hpa.state.temperature;
      expect(cool).toBeCloseTo(hpa.equilibriumTemperatureC(), 6);

      hpa.handleBackOffChange(1);
      const hotTarget = hpa.equilibriumTemperatureC();
      expect(hotTarget).toBeGreaterThan(cool + 10);

      runFor(hpa, 10);
      // Ten seconds into a 2 min time constant: barely moved
      expect(hpa.state.temperature).toBeLessThan(cool + 0.1 * (hotTarget - cool));
      runFor(hpa, 600);
      expect(hpa.state.temperature).toBeCloseTo(hotTarget, 0);
    });

    it('cools gradually when switched off (no instant drop to ambient)', () => {
      const hpa = c1Hpa(fe, { backOff: 2 });
      hpa.update();
      const hot = hpa.state.temperature;
      hpa.state.isPowered = false;
      runFor(hpa, 5);
      expect(hpa.state.temperature).toBeGreaterThan(hot - 2);
      expect(hpa.state.temperature).toBeGreaterThan(30);
    });
  });

  describe('handlers', () => {
    it('handleHpaToggle enables and disables the output when powered', () => {
      const hpa = c1Hpa(fe, { isHpaEnabled: false, isHpaSwitchEnabled: false });
      hpa.handleHpaToggle();
      expect(hpa.state.isHpaEnabled).toBe(true);
      hpa.handleHpaToggle();
      expect(hpa.state.isHpaEnabled).toBe(false);
    });

    it('handleHpaToggle does nothing when unpowered', () => {
      const hpa = c1Hpa(fe, { isPowered: false, isHpaEnabled: false, isHpaSwitchEnabled: false });
      hpa.handleHpaToggle();
      expect(hpa.state.isHpaSwitchEnabled).toBe(false);
    });

    it('handleBackOffChange clamps to 0-30 dB and recomputes at once', () => {
      const hpa = c1Hpa(fe);
      hpa.handleBackOffChange(40);
      expect(hpa.state.backOff).toBe(30);
      hpa.handleBackOffChange(4);
      expect(hpa.state.outputPower).toBeCloseTo(56, 2);
    });

    it('handlePowerToggle refuses power without the BUC', () => {
      (fe.bucModule.state as { isPowered: boolean }).isPowered = false;
      const hpa = c1Hpa(fe, { isPowered: false });
      const cb = vi.fn();
      hpa.handlePowerToggle(true, cb);
      expect(hpa.state.isPowered).toBe(false);
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('alarms', () => {
    it('raises over-temperature above 85 C and power sequencing without the BUC', () => {
      const hpa = c1Hpa(fe);
      hpa.state.temperature = 90;
      expect(hpa.getAlarms().some((a) => a.includes('over-temperature'))).toBe(true);
      (fe.bucModule.state as { isPowered: boolean }).isPowered = false;
      expect(hpa.getAlarms()).toContain('HPA enabled without BUC power');
    });
  });

  describe('renderPowerMeter_()', () => {
    it('renders 5 LED segments, red near saturation', () => {
      const hpa = c1Hpa(fe);
      const html = hpa.testRenderPowerMeter(hpa.psatDbm - 30);
      expect((html.match(/led-segment/gu) ?? []).length).toBe(5);
      expect(html).toContain('led-red');
      expect(hpa.testRenderPowerMeter(0)).not.toContain('led-green');
    });
  });
});
