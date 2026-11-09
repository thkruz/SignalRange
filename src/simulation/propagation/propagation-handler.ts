import { POS_STRIDE, PropagatorCore } from './propagation-core';
import type { PropagationRequest, PropagationResponse } from './propagation-protocol';

/**
 * The worker's message handler, free of `self` so the worker file and the
 * in-process backend (tests, no-worker environments) run identical logic.
 */
export function createPropagationHandler(reply: (msg: PropagationResponse, transfer: Transferable[]) => void): (msg: PropagationRequest) => void {
  let core: PropagatorCore | null = null;
  let warm: Int32Array = new Int32Array(0);
  let warmGen = 0;
  const pool = new Map<number, ArrayBuffer[]>();

  const take = (bytes: number): Float64Array => {
    const buf = pool.get(bytes)?.pop();
    return buf ? new Float64Array(buf) : new Float64Array(bytes / 8);
  };

  return (msg) => {
    try {
      switch (msg.type) {
        case 'init':
          core = new PropagatorCore(msg.tle1, msg.tle2, msg.stations);
          reply({ type: 'ready' }, []);
          break;
        case 'warm':
          warm = msg.indices;
          warmGen = msg.gen;
          break;
        case 'recycle':
          for (const b of msg.buffers) {
            const list = pool.get(b.byteLength) ?? [];
            if (list.length < 64) list.push(b);
            pool.set(b.byteLength, list);
          }
          break;
        case 'compute': {
          if (!core) return;
          if (msg.kind === 'warm' && msg.gen !== warmGen) return; // stale request for an old warm set
          const t0 = performance.now();
          const idx = msg.kind === 'warm' ? warm : null;
          const count = idx ? idx.length : core.memberCount;
          const pos = take(count * POS_STRIDE * 8);
          const look = take(count * core.stationCount * 2 * 8);
          core.compute(msg.gridMs, idx, pos, look);
          reply({ type: 'result', id: msg.id, kind: msg.kind, gridMs: msg.gridMs, gen: msg.gen, pos, look, workMs: performance.now() - t0 }, [pos.buffer, look.buffer]);
          break;
        }
      }
    } catch (e) {
      reply({ type: 'error', message: String((e as Error)?.message ?? e) }, []);
    }
  };
}
