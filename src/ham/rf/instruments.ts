/**
 * @file instruments - inline SWR/wattmeter, loads, antenna analyzer
 * @description Pure and deterministic. Meters read at their own reference plane; the
 * analyzer sweeps the path beyond its port and never accepts a transmitter.
 */

import type { HamConnection } from '../ham-types';
import { type Cx, cxAbs, cxAdd, cxMul, cxPolar, cxScale, swrFromGamma, zFromGamma } from './complex';
import { gammaBeyond, type RfDevice, type RfPath, type RfTermination, resolveRfPath, TX_REFUSALS } from './rf-path';

export { TX_REFUSALS };

/* ---------------- (a) inline SWR / wattmeter ---------------- */

export interface SwrMeterSpec {
  minMHz: number;
  maxMHz: number;
  minW: number;
  maxW: number;
}

export const DEFAULT_SWR_METER: SwrMeterSpec = { minMHz: 125, maxMHz: 525, minW: 1, maxW: 200 };

export interface SwrMeterReading {
  forwardW: number;
  reflectedW: number;
  swr: number;
  /** Outside the rated frequency or power range: the numbers are not to be trusted */
  unreliable: boolean;
  reasons: ('frequency-out-of-range' | 'power-too-low' | 'power-too-high' | 'no-meter')[];
}

/** Read the inline meter in `path` for a transmitter output of txOutW at the path start */
export function readInlineSwrMeter(path: RfPath, txOutW: number, spec: SwrMeterSpec = DEFAULT_SWR_METER): SwrMeterReading {
  if (!path.swrMeter) return { forwardW: 0, reflectedW: 0, swr: 1, unreliable: true, reasons: ['no-meter'] };
  const forwardW = txOutW * 10 ** (-path.swrMeter.lossToMeterDb / 10);
  const g = cxAbs(path.swrMeter.gamma);
  const reasons: SwrMeterReading['reasons'] = [];
  if (path.freqMHz < spec.minMHz || path.freqMHz > spec.maxMHz) reasons.push('frequency-out-of-range');
  if (forwardW < spec.minW) reasons.push('power-too-low');
  if (forwardW > spec.maxW) reasons.push('power-too-high');
  return { forwardW, reflectedW: forwardW * g * g, swr: path.swrMeter.swr, unreliable: reasons.length > 0, reasons };
}

/* ---------------- (b) loads ---------------- */

export interface DummyLoadState {
  ratedW: number;
  ratedSeconds: number;
  /** Stored heat, J */
  heatJ: number;
}

export type DummyLoadHeat = 'cool' | 'warm' | 'warning' | 'overheated';

const COOL_TAU_S = 900;

export const createDummyLoad = (ratedW = 100, ratedSeconds = 300): DummyLoadState => ({ ratedW, ratedSeconds, heatJ: 0 });

export const dummyLoadCapacityJ = (s: DummyLoadState): number => s.ratedW * s.ratedSeconds;

/** Advance the heat state: exact solution of dH/dt = P - H/tau over dtS seconds with constant power */
export function stepDummyLoad(s: DummyLoadState, powerW: number, dtS: number): DummyLoadState {
  const decay = Math.exp(-dtS / COOL_TAU_S);
  const heatJ = s.heatJ * decay + powerW * COOL_TAU_S * (1 - decay);
  return { ...s, heatJ };
}

export function dummyLoadHeat(s: DummyLoadState): { fraction: number; state: DummyLoadHeat; warning: string | null } {
  const fraction = s.heatJ / dummyLoadCapacityJ(s);
  if (fraction >= 1) return { fraction, state: 'overheated', warning: 'Dummy load is over its thermal rating. Stop transmitting and let it cool.' };
  if (fraction >= 0.8) return { fraction, state: 'warning', warning: 'Dummy load is getting hot. Release the key and let it cool.' };
  return { fraction, state: fraction >= 0.3 ? 'warm' : 'cool', warning: null };
}

export const CAL_LOAD_RATED_W = 0.5;

/** Operator-facing refusal when a transmitter is connected toward a calibration load or analyzer, else null */
export function transmitterRefusal(termination: RfTermination): string | null {
  if (termination === 'cal-load' || termination === 'analyzer') return TX_REFUSALS[termination];
  return null;
}

/* ---------------- (c) antenna analyzer ---------------- */

export interface AnalyzerCalibration {
  done: boolean;
  /** Reference plane: the output of this device (e.g. the test cable). null = the analyzer port. */
  referenceDeviceId: string | null;
}

export const UNCALIBRATED: AnalyzerCalibration = { done: false, referenceDeviceId: null };

export interface AnalyzerPoint {
  fMHz: number;
  swr: number;
  zMag: number;
  r: number;
  x: number;
}

export interface AnalyzerSweep {
  points: AnalyzerPoint[];
  /** Calibration was missing or its reference device is not in the path: readings carry an error */
  uncalibrated: boolean;
  flags: ('uncalibrated' | 'cal-reference-not-in-path')[];
  minSwr: { fMHz: number; swr: number } | null;
  /** Set when the sweep was refused (a transmitter on the path) */
  refusal: string | null;
}

/** Deterministic uncalibrated error: scaled, rotated, and an additive offset that drifts with frequency */
function uncalibratedGamma(g: Cx, fMHz: number): Cx {
  return cxAdd(cxMul(cxScale(g, 0.82), cxPolar(1, 0.5)), cxPolar(0.12, 0.31 * fMHz));
}

/**
 * One-port sweep of the path beyond the analyzer's port. The analyzer must not be connected
 * to a transmitter: a path ending in a radio is refused.
 */
export function analyzerSweep(
  devices: Readonly<Record<string, RfDevice>>,
  connections: readonly HamConnection[],
  analyzerId: string,
  opts: { startMHz: number; stopMHz: number; points: number; calibration?: AnalyzerCalibration; portId?: string }
): AnalyzerSweep {
  const cal = opts.calibration ?? UNCALIBRATED;
  const portId = opts.portId ?? 'rf';
  const n = Math.max(2, Math.floor(opts.points));
  const out: AnalyzerSweep = { points: [], uncalibrated: !cal.done, flags: [], minSwr: null, refusal: null };
  let calUsable = cal.done;
  for (let i = 0; i < n; i += 1) {
    const f = opts.startMHz + ((opts.stopMHz - opts.startMHz) * i) / (n - 1);
    const path = resolveRfPath(devices, connections, { startDeviceId: analyzerId, startPortId: portId, freqMHz: f });
    if (path.termination === 'radio') {
      return {
        points: [],
        uncalibrated: out.uncalibrated,
        flags: [],
        minSwr: null,
        refusal: 'Analyzer connected to a transmitter: sweep refused. Disconnect the radio first; it would destroy the analyzer.',
      };
    }
    let g: Cx;
    if (cal.done && cal.referenceDeviceId) {
      const idx = path.elements.map((e) => e.deviceId).lastIndexOf(cal.referenceDeviceId);
      if (idx < 0) {
        calUsable = false;
        g = uncalibratedGamma(path.gammaAtStart, f);
      } else g = gammaBeyond(path, idx + 1);
    } else if (cal.done) g = path.gammaAtStart;
    else g = uncalibratedGamma(path.gammaAtStart, f);
    const z = zFromGamma(g);
    const swr = swrFromGamma(g);
    out.points.push({ fMHz: f, swr, zMag: Math.hypot(z.r, z.x), r: z.r, x: z.x });
    if (!out.minSwr || swr < out.minSwr.swr) out.minSwr = { fMHz: f, swr };
  }
  if (!cal.done) out.flags.push('uncalibrated');
  else if (!calUsable) {
    out.flags.push('cal-reference-not-in-path');
    out.uncalibrated = true;
  }
  return out;
}

/** Frequency of minimum SWR in a sweep (the "resonance" the analyzer shows) */
export const minSwrFrequency = (sweep: AnalyzerSweep): number | null => sweep.minSwr?.fMHz ?? null;
