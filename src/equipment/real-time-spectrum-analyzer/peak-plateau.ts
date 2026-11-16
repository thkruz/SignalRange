/**
 * Peak Search's pick rule, used by `RealTimeSpectrumAnalyzer.peakSearch` at the
 * click and by the in-plot marker (`SpectralDensityPlot.updateTopMarkers`) when
 * the marker is turned on, so the readout, the marker and the Ops Log line
 * agree (phase 32 D11). Peak Search is one shot (phase 33 D10): the marker stays
 * on the clicked bin, `plateauAt` reads that bin each sweep.
 */

/**
 * Bins less than this far below the trace maximum count as one flat top, so a
 * noisy 36 MHz carrier top reads at its centre instead of its noisiest bin
 */
export const PEAK_PLATEAU_DB = 0.5;

/** The peak of a trace: the bin Peak Search reads and the run it sits in */
export interface PeakPlateau {
  /** The bin Peak Search reads: the centre of the run (left of centre for an even run) */
  bin: number;
  /** The highest finite level in the trace, dBm */
  maxDbm: number;
  /** First bin of the contiguous run within PEAK_PLATEAU_DB of maxDbm */
  start: number;
  /** Last bin of that run */
  end: number;
}

/**
 * The highest point of `data[0..length)`, wherever it sits relative to the
 * amplitude window, as the centre of the contiguous run of bins within
 * PEAK_PLATEAU_DB of the maximum. Null when no bin is finite.
 */
export function findPeakPlateau(data: ArrayLike<number>, length: number = data.length): PeakPlateau | null {
  const n = Math.min(length, data.length);
  let best = -1;
  for (let x = 0; x < n; x++) {
    if (Number.isFinite(data[x]) && (best < 0 || data[x] > data[best])) {
      best = x;
    }
  }
  if (best < 0) {
    return null;
  }
  const maxDbm = data[best];
  const floor = maxDbm - PEAK_PLATEAU_DB;
  let start = best;
  while (start > 0 && data[start - 1] > floor) {
    start--;
  }
  let end = best;
  while (end + 1 < n && data[end + 1] > floor) {
    end++;
  }

  return { bin: start + Math.floor((end - start) / 2), maxDbm, start, end };
}

/**
 * The run around a pinned Peak Search bin (phase 33 D10): the bin and its
 * level now, and the contiguous bins within PEAK_PLATEAU_DB of that level, so
 * the hand-stepping list does not put a second marker on the same flat top.
 * The bin never moves; a bin with no finite level is a run of one.
 */
export function plateauAt(data: ArrayLike<number>, length: number, bin: number): PeakPlateau {
  const n = Math.min(length, data.length);
  const level = data[bin];
  if (bin < 0 || bin >= n || !Number.isFinite(level)) {
    return { bin, maxDbm: level, start: bin, end: bin };
  }
  const floor = level - PEAK_PLATEAU_DB;
  let start = bin;
  while (start > 0 && data[start - 1] > floor) {
    start--;
  }
  let end = bin;
  while (end + 1 < n && data[end + 1] > floor) {
    end++;
  }

  return { bin, maxDbm: level, start, end };
}
