/**
 * Every site hotspot with a close-up opens exactly one close-up, one close-up per
 * item, and every close-up target exists in the frontline sandbox plant config.
 */

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { CLOSEUPS, SITE_HOTSPOTS } from '@app/campaigns/frontline/site-hotspots';
import { describe, expect, it } from 'vitest';

const partIds = new Set(frontlinePlantConfig.parts.map((p) => p.id));
const cableIds = new Set(frontlinePlantConfig.cables.map((c) => c.id));
const connectorIds = new Set(frontlinePlantConfig.connectors.map((c) => c.id));

describe('site close-ups', () => {
  it('has 13 close-ups, one per item', () => {
    expect(Object.keys(CLOSEUPS)).toHaveLength(13);
    for (const [key, def] of Object.entries(CLOSEUPS)) {
      expect(def.id).toBe(key);
      expect(def.image).toContain(`cu-${key}.webp`);
    }
  });

  it('every close-up hotspot maps to exactly one existing close-up, and each close-up has one hotspot', () => {
    const used = new Map<string, number>();
    for (const spot of SITE_HOTSPOTS) {
      if (!spot.closeup) {
        continue;
      }
      expect(CLOSEUPS[spot.closeup], spot.id).toBeDefined();
      used.set(spot.closeup, (used.get(spot.closeup) ?? 0) + 1);
    }
    for (const id of Object.keys(CLOSEUPS)) {
      expect(used.get(id), id).toBe(1);
    }
  });

  it('every close-up target id exists in the plant config', () => {
    for (const def of Object.values(CLOSEUPS)) {
      for (const r of def.regions) {
        expect(partIds.has(r.target) || connectorIds.has(r.target), `${def.id}/${r.id}`).toBe(true);
      }
      for (const p of def.probes) {
        expect(connectorIds.has(p.target), `${def.id}/${p.id}`).toBe(true);
      }
      for (const c of def.cables) {
        expect(cableIds.has(c.target), `${def.id}/${c.target}`).toBe(true);
      }
    }
  });

  it('keeps every verb reachable: regions, probes and cables cover every plant target', () => {
    const covered = new Set<string>();
    for (const def of Object.values(CLOSEUPS)) {
      def.regions.forEach((r) => {
        covered.add(r.target);
      });
      def.probes.forEach((p) => {
        covered.add(p.target);
      });
      def.cables.forEach((c) => {
        covered.add(c.target);
      });
    }
    for (const id of [...partIds, ...cableIds, ...connectorIds]) {
      expect(covered.has(id), id).toBe(true);
    }
  });
});
