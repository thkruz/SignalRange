/**
 * Hover-glow mattes: every hotspot mask points at an existing webp (when the gitignored art is present locally),
 * has an image-relative bbox inside 0..1, and overlaps its hotspot's own shapes.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORWARD_HOTSPOTS, SITE_HOTSPOTS } from '@app/campaigns/frontline/site-hotspots';
import type { SiteHotspot, SiteShape } from '@app/physical/ui/site-types';
import { describe, expect, it } from 'vitest';

const withMask = [...SITE_HOTSPOTS, ...FORWARD_HOTSPOTS].filter((h): h is SiteHotspot & { mask: NonNullable<SiteHotspot['mask']> } => !!h.mask);
const ASSETS = resolve(__dirname, '../../public/assets');

/** Bounding box [x0, y0, x1, y1] of a shape (paths padded by half their width) */
const bounds = (s: SiteShape): [number, number, number, number] => {
  if (s.kind === 'rect') {
    return [s.x, s.y, s.x + s.w, s.y + s.h];
  }
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  const r = s.width / 2;

  return [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
};

describe('hotspot glow masks', () => {
  it('has masks for the forward scene', () => {
    expect(withMask.length).toBeGreaterThanOrEqual(25);
  });

  it('gives every camp and forward hotspot a mask', () => {
    const missing = [...SITE_HOTSPOTS, ...FORWARD_HOTSPOTS].filter((h) => !h.mask).map((h) => h.id);
    expect(missing).toEqual([]);
  });

  it.each(withMask.map((h) => [h.id, h] as const))('%s: bbox inside the image and overlapping its shapes', (_id, h) => {
    const [x, y, w, hh] = h.mask.bbox;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(w).toBeGreaterThan(0);
    expect(hh).toBeGreaterThan(0);
    expect(x + w).toBeLessThanOrEqual(1);
    expect(y + hh).toBeLessThanOrEqual(1);
    const hits = h.shapes.some((s) => {
      const [x0, y0, x1, y1] = bounds(s);

      return x0 < x + w && x1 > x && y0 < y + hh && y1 > y;
    });
    expect(hits).toBe(true);
  });

  it.each(withMask.map((h) => [h.id, h.mask.file] as const))('%s: mask file exists', (_id, file) => {
    expect(file).toMatch(/\.webp$/u);
    if (existsSync(resolve(ASSETS, 'campaigns/frontline/physical'))) {
      expect(existsSync(resolve(ASSETS, file.replace('/assets/', '')))).toBe(true);
    }
  });
});
