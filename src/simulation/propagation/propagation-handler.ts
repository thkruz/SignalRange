import { PassSearchJob, VisibilityJob, type WorkerJob } from './pass-search';
import { POS_STRIDE, PropagatorCore } from './propagation-core';
import type { PropagationRequest, PropagationResponse } from './propagation-protocol';
import { TrackJob } from './track-job';

/** Longest slice a search job runs before yielding to queued grid requests, ms */
const JOB_SLICE_MS = 10;

/**
 * The worker's message handler, free of `self` so the worker file and the
 * in-process backend (tests, no-worker environments) run identical logic.
 */
export function createPropagationHandler(reply: (msg: PropagationResponse, transfer: Transferable[]) => void): (msg: PropagationRequest) => void {
  let core: PropagatorCore | null = null;
  let warm: Int32Array = new Int32Array(0);
  let warmGen = 0;
  const pool = new Map<number, ArrayBuffer[]>();
  let groupOf: Uint16Array | null = null;
  let groupCount = 0;
  // Long searches run in slices between messages so grid requests are not starved
  const jobs: { id: number; job: WorkerJob }[] = [];
  let pumping = false;
  const pump = (): void => {
    pumping = false;
    const entry = jobs[0];
    if (!entry) return;
    try {
      if (entry.job.run(JOB_SLICE_MS)) jobs.shift();
    } catch (e) {
      jobs.shift();
      reply({ type: 'error', message: String((e as Error)?.message ?? e), id: entry.id }, []);
    }
    if (jobs.length > 0) schedule();
  };
  const schedule = (): void => {
    if (!pumping) {
      pumping = true;
      setTimeout(pump, 0);
    }
  };

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
        case 'groups':
          groupOf = msg.groupOf;
          groupCount = msg.groupCount;
          break;
        case 'cancel': {
          const i = jobs.findIndex((j) => j.id === msg.id);
          if (i >= 0) jobs.splice(i, 1);
          break;
        }
        case 'passes': {
          if (!core) throw new Error('passes requested before init');
          const search = new PassSearchJob(core, msg.spec);
          const t0 = performance.now();
          let busy = 0;
          jobs.push({
            id: msg.id,
            job: {
              run: (budget) => {
                const s0 = performance.now();
                const done = search.run(budget);
                busy += performance.now() - s0;
                if (done) {
                  const records = search.result();
                  reply({ type: 'passes', id: msg.id, records, workMs: busy || performance.now() - t0 }, [records.buffer]);
                }
                return done;
              },
            },
          });
          schedule();
          break;
        }
        case 'track': {
          if (!core) throw new Error('track requested before init');
          const job = new TrackJob(core, msg);
          let busy = 0;
          jobs.push({
            id: msg.id,
            job: {
              run: (budget) => {
                const s0 = performance.now();
                const done = job.run(budget);
                busy += performance.now() - s0;
                if (done) {
                  const data = job.result();
                  reply({ type: 'track', id: msg.id, data, workMs: busy }, [data.buffer]);
                }
                return done;
              },
            },
          });
          schedule();
          break;
        }
        case 'visibility': {
          if (!core) throw new Error('visibility requested before init');
          if (!groupOf) throw new Error('visibility requested before groups');
          const total = msg.count;
          let busy = 0;
          const vis = new VisibilityJob(core, { startMs: msg.startMs, stepMs: msg.stepMs, count: total, minEl: msg.minEl, groupOf, groupCount }, (index, counts) => {
            const copy = counts.slice();
            reply({ type: 'visibility', id: msg.id, index, counts: copy, done: index === total - 1, workMs: busy }, [copy.buffer]);
          });
          jobs.push({
            id: msg.id,
            job: {
              run: (budget) => {
                const s0 = performance.now();
                const done = vis.run(budget);
                busy += performance.now() - s0;
                return done;
              },
            },
          });
          schedule();
          break;
        }
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
      reply({ type: 'error', message: String((e as Error)?.message ?? e), id: 'id' in msg ? (msg as { id: number }).id : undefined }, []);
    }
  };
}
