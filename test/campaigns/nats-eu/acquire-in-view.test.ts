/**
 * Phase 35 D1 lint: a nats-eu `signal-detected` row with a `signalId` must be
 * watchable on the analyzer framing the player was last told to set. For every
 * such row the nearest `speca-center-frequency` (own objective first, then the
 * prerequisite chain breadth-first) must put the signal's IF (LO 13100 MHz -
 * RF) inside the analyzer window: |centre - IF| <= 1 MHz + span / 2, with the
 * span taken from the same objective as the centre (the 60 MHz station default when it sets none).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }), destroy: () => undefined },
}));

const modules = import.meta.glob('../../../src/campaigns/nats-eu/scenario*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

const LNB_LO_MHZ = 13100;
/** The station analyzer's default span, used when the chain never sets one. */
const DEFAULT_SPAN_HZ = 60e6;

/** RF (MHz) of every MERIDIAN carrier, from src/campaigns/nats-eu/satellites.ts. */
const SIGNAL_RF_MHZ: Record<string, number> = {
  'MERIDIAN-SAR-1-Beacon': 11711,
  'MERIDIAN-SAR-1-VIDEO': 11686,
  'MERIDIAN-SAR-2-Beacon': 11703,
  'MERIDIAN-SAR-2-VIDEO': 11730,
  'MERIDIAN-SAR-3-Beacon': 11785,
  'MERIDIAN-SAR-3-VIDEO': 11760,
};

interface Cond {
  type: string;
  params?: Record<string, unknown>;
}
interface Obj {
  id: string;
  prerequisiteObjectiveIds?: string[];
  conditions?: Cond[];
}

function framing(obj: Obj): { centreMhz: number; spanHz: number } | null {
  const centre = obj.conditions?.filter((c) => c.type === 'speca-center-frequency').at(-1);
  if (!centre) return null;
  const span = obj.conditions?.find((c) => c.type === 'speca-span-set');

  return { centreMhz: Number(centre.params?.centerFrequency) / 1e6, spanHz: Number(span?.params?.span ?? DEFAULT_SPAN_HZ) };
}

function nearestFraming(obj: Obj, byId: Map<string, Obj>): { centreMhz: number; spanHz: number } | null {
  const seen = new Set<string>([obj.id]);
  let level: Obj[] = [obj];
  while (level.length > 0) {
    for (const o of level) {
      const f = framing(o);
      if (f) return f;
    }
    const next: Obj[] = [];
    for (const o of level) {
      for (const id of o.prerequisiteObjectiveIds ?? []) {
        const p = byId.get(id);
        if (p && !seen.has(id)) {
          seen.add(id);
          next.push(p);
        }
      }
    }
    level = next;
  }

  return null;
}

describe('nats-eu acquisition rows are watchable on the framed analyzer', () => {
  let rows = 0;
  for (const [path, mod] of Object.entries(modules)) {
    const name = /scenario(\d+)\.ts$/u.exec(path)?.[1];
    const data = Object.values(mod).find((v) => v && typeof v === 'object' && Array.isArray((v as { objectives?: unknown }).objectives)) as { objectives: Obj[] } | undefined;
    if (!name || !data) continue;
    const byId = new Map(data.objectives.map((o) => [o.id, o]));
    for (const obj of data.objectives) {
      for (const cond of obj.conditions ?? []) {
        const signalId = cond.type === 'signal-detected' ? (cond.params?.signalId as string | undefined) : undefined;
        if (!signalId) continue;
        rows++;
        it(`s${name} ${obj.id}: ${signalId}`, () => {
          if (signalId.startsWith('INTERFERER-')) return; // interferers are watched by the call-the-X rows, not acquisition
          const rf = SIGNAL_RF_MHZ[signalId];
          expect(rf, `unknown signalId ${signalId}; add it to SIGNAL_RF_MHZ`).toBeDefined();
          const f = nearestFraming(obj, byId);
          if (!f) return; // no framing step in the chain: nothing to contradict
          const ifMhz = LNB_LO_MHZ - rf;
          const windowMhz = 1 + f.spanHz / 2e6;
          expect(Math.abs(f.centreMhz - ifMhz), `centre ${f.centreMhz} MHz vs ${signalId} IF ${ifMhz} MHz (window +-${windowMhz} MHz)`).toBeLessThanOrEqual(windowMhz);
        });
      }
    }
  }

  it('finds acquisition rows', () => {
    expect(rows).toBeGreaterThan(10);
  });
});
