/**
 * Phase 35 D2: notch numbers in player text are the UI's (RX Analysis labels
 * `Notch ${index + 1}`). When a notch-filter-configured row pins `notchIndex: n`,
 * any "Notch k" in that objective's title, description or condition labels must
 * have k = n + 1 (s24-F1, s18-F3).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }), destroy: () => undefined },
}));

const modules = import.meta.glob('../../../src/campaigns/nats-eu/scenario*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

interface Row {
  type?: string;
  description?: string;
  params?: { notchIndex?: number };
}
interface Obj {
  id: string;
  title?: string;
  description?: string;
  conditions?: Row[];
}

describe('nats-eu notch numbering', () => {
  for (const [path, mod] of Object.entries(modules)) {
    const data = Object.values(mod).find((v) => v && typeof v === 'object' && Array.isArray((v as { objectives?: unknown }).objectives)) as { objectives: Obj[] } | undefined;
    if (!data) continue;
    const name = /scenario(\d+)\.ts$/u.exec(path)?.[1];

    it(`s${name}: "Notch k" text matches notchIndex k - 1`, () => {
      const wrong: string[] = [];
      for (const objective of data.objectives) {
        const indices = (objective.conditions ?? [])
          .filter((c) => c.type === 'notch-filter-configured' && typeof c.params?.notchIndex === 'number')
          .map((c) => c.params?.notchIndex as number);
        if (indices.length === 0) continue;
        const text = [objective.title, objective.description, ...(objective.conditions ?? []).map((c) => c.description)].join(' ');
        for (const match of text.matchAll(/notch\s+(\d+)/giu)) {
          if (!indices.some((n) => Number(match[1]) === n + 1)) wrong.push(`${objective.id}: "${match[0]}" vs notchIndex ${indices.join(',')}`);
        }
      }

      expect(wrong).toEqual([]);
    });
  }
});
