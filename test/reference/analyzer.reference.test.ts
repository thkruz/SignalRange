/**
 * Spectrum analyzer reference cases (phase 19.2): the displayed noise level
 * follows the RBW's noise bandwidth (also in Auto), the instrument's own noise
 * figure sets its floor through the coupling factor, noise through a log
 * detector has its textbook statistics, carrier and noise add as powers, and
 * a CW line takes the Gaussian RBW filter's shape.
 *
 * Sources: Keysight Application Note 150 "Spectrum Analysis Basics" (log
 * detection of Rayleigh noise: 2.51 dB under the true power, 5.57 dB standard
 * deviation; Gaussian RBW filters; noise bandwidth ~1.065 x RBW).
 */

import { autoRbwHz, GAUSSIAN_RBW_ENBW_FACTOR, RealTimeSpectrumAnalyzer } from '../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { TapPoint } from '../../src/equipment/rf-front-end/coupler-module/tap-points';
import { BOLTZMANN_DBM_PER_K_HZ } from '../../src/simulation/noise-model';
import type { IfSignal } from '../../src/types';
import { expectWithinAbs, referenceCase } from './reference-helpers';

const WIDTH = 4000;

interface FakeAnalyzerOptions {
  rbw?: number | null;
  vbw?: number | null;
  span?: number;
  detector?: 'sample' | 'peak' | 'average';
  noiseFigureDb?: number;
  /** Line noise at the tap, dBm/Hz (with gain), or null for no tap enabled */
  lineDbmPerHz?: number | null;
  couplingDb?: number;
  signals?: IfSignal[];
}

/** A RealTimeSpectrumAnalyzer with only the state and front end the noise path reads (no DOM) */
function fakeAnalyzer(options: FakeAnalyzerOptions = {}): RealTimeSpectrumAnalyzer {
  const analyzer = Object.create(RealTimeSpectrumAnalyzer.prototype) as RealTimeSpectrumAnalyzer;
  const lineDbmPerHz = options.lineDbmPerHz ?? null;
  analyzer.state = {
    rbw: options.rbw === undefined ? 1e3 : options.rbw,
    vbw: options.vbw,
    span: options.span ?? 10e6,
    centerFrequency: 1e9,
    detector: options.detector,
    noiseFigureDb: options.noiseFigureDb,
    isUseTapA: false,
    isUseTapB: lineDbmPerHz !== null,
    minAmplitude: -200,
    noiseFloorNoGain: 0,
    isSkipLnaGainDuringDraw: true,
  } as never;
  (analyzer as unknown as { rfFrontEnd_: unknown }).rfFrontEnd_ = {
    couplerModule: {
      state: { tapPointA: TapPoint.TX_IF, tapPointB: TapPoint.RX_IF, couplingFactorA: -20, couplingFactorB: options.couplingDb ?? -20 },
      signalPathManager: {
        getNoiseFloorAt: (_tap: TapPoint, bandwidth: number) => ({ noiseFloorNoGain: (lineDbmPerHz ?? -300) + 10 * Math.log10(bandwidth), shouldApplyGain: true }),
        getTotalGainTo: () => 0,
      },
    },
    agcModule: { outputSignals: options.signals ?? [] },
    notchFilterModule: { state: { isPowered: false, notches: [] } },
  };
  analyzer.lineNoiseDbm = Number.NEGATIVE_INFINITY;
  analyzer.inputSignals = analyzer.getInputSignals() as IfSignal[];

  return analyzer;
}

/** Run the data processor over the analyzer's current span */
function trace(analyzer: RealTimeSpectrumAnalyzer) {
  const processor = new SpectrumDataProcessor(analyzer, WIDTH);
  const half = analyzer.state.span / 2;
  processor.setFrequencyRange((analyzer.state.centerFrequency - half) as never, (analyzer.state.centerFrequency + half) as never);
  processor.generateData();

  return processor;
}

const mean = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: ArrayLike<number>) => {
  const m = mean(xs);
  return Math.sqrt(Array.from(xs).reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('analyzer noise floor', () => {
  referenceCase('with no tap the floor is the instrument: kT0 + NF + 10 log(ENBW), ENBW = 1.065 RBW', undefined, () => {
    const analyzer = fakeAnalyzer({ rbw: 10e3, noiseFigureDb: 22, lineDbmPerHz: null });
    const expected = BOLTZMANN_DBM_PER_K_HZ + 10 * Math.log10(290) + 22 + 10 * Math.log10(10e3 * GAUSSIAN_RBW_ENBW_FACTOR);

    expectWithinAbs(analyzer.state.noiseFloorNoGain, expected, 0.05);
    expectWithinAbs(GAUSSIAN_RBW_ENBW_FACTOR, 1.0645, 0.001);
  });

  referenceCase('Auto RBW: the noise bandwidth follows the auto-coupled RBW, not the span', undefined, () => {
    const span = 100e6;
    const analyzer = fakeAnalyzer({ rbw: null, span, lineDbmPerHz: -100, couplingDb: -20 });
    const rbw = autoRbwHz(span);
    const line = -100 + 10 * Math.log10(rbw * GAUSSIAN_RBW_ENBW_FACTOR);

    expect(rbw).toBe(300e3);
    // The line dominates the instrument (-132 dBm/Hz through the tap) by 32 dB
    expectWithinAbs(analyzer.state.noiseFloorNoGain, line, 0.05);
  });

  referenceCase('the coupling factor refers the instrument floor to the line: a -20 dB tap raises it 20 dB', undefined, () => {
    const analyzer = fakeAnalyzer({ rbw: 1e3, noiseFigureDb: 22, lineDbmPerHz: -300, couplingDb: -20 });
    const instrument = BOLTZMANN_DBM_PER_K_HZ + 10 * Math.log10(290) + 22 + 10 * Math.log10(1e3 * GAUSSIAN_RBW_ENBW_FACTOR);

    expectWithinAbs(analyzer.state.noiseFloorNoGain, instrument + 20, 0.05);
  });
});

describe('log-detected noise', () => {
  referenceCase('sample detector, VBW = RBW: noise reads 2.51 dB under its power with a 5.57 dB standard deviation', undefined, () => {
    const analyzer = fakeAnalyzer({ rbw: 1e3, vbw: 1e3, detector: 'sample', lineDbmPerHz: -100 });
    const data = trace(analyzer).combinedData;

    expectWithinAbs(mean(data) - analyzer.state.noiseFloorNoGain, -2.51, 0.3);
    expectWithinAbs(std(data), 5.57, 0.4);
  });

  referenceCase('video averaging narrows the trace: VBW = RBW / 10 cuts the deviation by about sqrt(10)', undefined, () => {
    const analyzer = fakeAnalyzer({ rbw: 1e3, vbw: 100, detector: 'sample', lineDbmPerHz: -100 });
    const data = trace(analyzer).combinedData;

    expectWithinAbs(std(data), 5.57 / Math.sqrt(10), 0.4);
    expectWithinAbs(mean(data) - analyzer.state.noiseFloorNoGain, -2.51, 0.3);
  });

  referenceCase('the average detector reads the true noise power (no log bias)', undefined, () => {
    const analyzer = fakeAnalyzer({ rbw: 1e3, vbw: 100, detector: 'average', lineDbmPerHz: -100 });

    expectWithinAbs(mean(trace(analyzer).combinedData) - analyzer.state.noiseFloorNoGain, 0, 0.2);
  });
});

describe('signal and noise', () => {
  referenceCase('a carrier at the noise level adds 3 dB (powers add, not max)', undefined, () => {
    // 1 MHz carrier (symbol rate 1/1.2 MHz, roll-off 0.2) whose flat-top
    // density equals the line noise density
    const noiseDbmPerHz = -100;
    const carrier = { signalId: 'c', frequency: 1e9, bandwidth: 1e6, power: noiseDbmPerHz + 60 + 10 * Math.log10(1 / 1.2) } as unknown as IfSignal;
    const analyzer = fakeAnalyzer({ rbw: 1e3, vbw: 100, detector: 'average', lineDbmPerHz: noiseDbmPerHz, signals: [carrier] });
    const data = trace(analyzer).combinedData;
    // Centre pixels of the 10 MHz span: the carrier's flat top
    const centre = data.slice(WIDTH / 2 - 100, WIDTH / 2 + 100);
    const floor = data.slice(0, 400);

    expectWithinAbs(mean(centre) - mean(floor), 3.01, 0.4);
  });

  referenceCase('a CW line takes the Gaussian RBW shape: its power at the centre, -3 dB at +/- RBW/2', undefined, () => {
    const rbw = 10e3;
    const cw = { signalId: 'cw', frequency: 1e9, bandwidth: 0, power: -50 } as unknown as IfSignal;
    const analyzer = fakeAnalyzer({ rbw, span: 100e3, lineDbmPerHz: -300, signals: [cw] });
    const processor = trace(analyzer);
    const hzPerPixel = 100e3 / WIDTH;
    const at = (offsetHz: number) => processor.signalData[Math.round(WIDTH / 2 + offsetHz / hzPerPixel - 0.5)];

    expectWithinAbs(at(0), -50, 0.05);
    expectWithinAbs(at(rbw / 2), -53.01, 0.1);
    expectWithinAbs(at(rbw), -62.04, 0.2);
  });
});
