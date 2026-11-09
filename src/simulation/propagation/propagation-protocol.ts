/**
 * Propagation worker protocol (request/response keyed by sim-time grid point).
 *
 * Buffers: each result slot is a pair of Float64Arrays (pos, look) that the
 * worker transfers to the main thread. The main thread keeps them in a ring
 * (bounded Map ordered by grid time) and, when a slot is evicted, transfers
 * the buffers back with `recycle`, where the worker reuses them for later
 * requests. Two pools (warm, sweep) of fixed-size buffers circulate, so a
 * steady state allocates nothing.
 */

/** Grid spacing, sim ms. */
export const WARM_GRID_MS = 1000;
export const SWEEP_GRID_MS = 60000;

import type { PassSearchSpec } from './pass-search';

export type SlotKind = 'warm' | 'sweep';

export type PropagationRequest =
  | { type: 'init'; tle1: string[]; tle2: string[]; stations: Float64Array }
  /** Replace the warm set (member indices, ascending). Results for earlier generations are stale. */
  | { type: 'warm'; indices: Int32Array; gen: number }
  | { type: 'compute'; id: number; kind: SlotKind; gridMs: number; gen: number }
  | { type: 'recycle'; buffers: ArrayBuffer[] }
  /** Lane (group) of every member, used by `visibility` requests */
  | { type: 'groups'; groupOf: Uint16Array; groupCount: number }
  /** Next AOS/LOS search; answered with a `passes` response. Interleaved with grid requests. */
  | { type: 'passes'; id: number; spec: PassSearchSpec }
  /** Members above `minEl` per lane and station at `count` grid times, answered one `visibility` response per time */
  | { type: 'visibility'; id: number; startMs: number; stepMs: number; count: number; minEl: number }
  /** Drop a queued or running passes/visibility job */
  | { type: 'cancel'; id: number };

export type PropagationResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; kind: SlotKind; gridMs: number; gen: number; pos: Float64Array; look: Float64Array; workMs: number }
  | { type: 'passes'; id: number; records: Float64Array; workMs: number }
  /** counts[g * stations + s] for the `index`-th grid time of the request */
  | { type: 'visibility'; id: number; index: number; counts: Uint16Array; done: boolean; workMs: number }
  | { type: 'error'; message: string; id?: number };
