/**
 * No two selectable boxes overlap: close-up regions, close-up probe hit circles (r = 20 view
 * units, as the UI draws them) and the site views' hotspots.
 */

import { CLOSEUPS, SITE_ASPECT, SITE_HOTSPOTS } from '@app/campaigns/frontline/site-hotspots';
import { VIEW_W, viewHeight } from '@app/physical/ui/plant-svg';
import type { SiteShape } from '@app/physical/ui/site-types';
import { describe, expect, it } from 'vitest';

/** Must match the hit circle radius in part-closeup-modal.ts */
const PROBE_HIT_R = 20;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** True when the view-unit point is inside the shape (rect, or within half the stroke of the polyline) */
function shapeHas(shape: SiteShape, aspect: number, x: number, y: number): boolean {
  const h = viewHeight(aspect);
  if (shape.kind === 'rect') {
    return x >= shape.x * VIEW_W && x <= (shape.x + shape.w) * VIEW_W && y >= shape.y * h && y <= (shape.y + shape.h) * h;
  }
  const half = (shape.width * VIEW_W) / 2;
  for (let i = 1; i < shape.points.length; i++) {
    const ax = shape.points[i - 1][0] * VIEW_W;
    const ay = shape.points[i - 1][1] * h;
    const bx = shape.points[i][0] * VIEW_W;
    const by = shape.points[i][1] * h;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= half) {
      return true;
    }
  }

  return false;
}

/** Bounds of a shape in view units (rect only; a path is sampled, so its bounds are only a search window) */
function toBox(shape: SiteShape, aspect: number): Box {
  const h = viewHeight(aspect);
  if (shape.kind === 'rect') {
    return { x0: shape.x * VIEW_W, y0: shape.y * h, x1: (shape.x + shape.w) * VIEW_W, y1: (shape.y + shape.h) * h };
  }
  const half = (shape.width * VIEW_W) / 2;
  const xs = shape.points.map((p) => p[0] * VIEW_W);
  const ys = shape.points.map((p) => p[1] * h);

  return { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half };
}

/** Rasterised overlap on a 2-unit grid, so diagonal paths are not judged by their bounding box */
function shapesOverlap(a: SiteShape, b: SiteShape, aspect: number): boolean {
  const ba = toBox(a, aspect);
  const bb = toBox(b, aspect);
  const x0 = Math.max(ba.x0, bb.x0);
  const x1 = Math.min(ba.x1, bb.x1);
  const y0 = Math.max(ba.y0, bb.y0);
  const y1 = Math.min(ba.y1, bb.y1);
  if (x0 >= x1 || y0 >= y1) {
    return false;
  }
  for (let x = x0; x <= x1; x += 2) {
    for (let y = y0; y <= y1; y += 2) {
      if (shapeHas(a, aspect, x, y) && shapeHas(b, aspect, x, y)) {
        return true;
      }
    }
  }

  return false;
}

function circleHitsBox(cx: number, cy: number, r: number, b: Box): boolean {
  const dx = cx - Math.max(b.x0, Math.min(cx, b.x1));
  const dy = cy - Math.max(b.y0, Math.min(cy, b.y1));

  return dx * dx + dy * dy < r * r;
}

describe('selection boxes do not overlap', () => {
  it('close-up regions never overlap each other', () => {
    const bad: string[] = [];
    for (const def of Object.values(CLOSEUPS)) {
      const boxes = def.regions.map((r) => ({ id: r.id, shape: r.shape }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (shapesOverlap(boxes[i].shape, boxes[j].shape, def.aspect)) {
            bad.push(`${def.id}: ${boxes[i].id} x ${boxes[j].id}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('close-up probe hit circles never overlap each other', () => {
    const bad: string[] = [];
    for (const def of Object.values(CLOSEUPS)) {
      const h = viewHeight(def.aspect);
      for (let i = 0; i < def.probes.length; i++) {
        for (let j = i + 1; j < def.probes.length; j++) {
          const d = Math.hypot((def.probes[i].x - def.probes[j].x) * VIEW_W, (def.probes[i].y - def.probes[j].y) * h);
          if (d < PROBE_HIT_R * 2) {
            bad.push(`${def.id}: ${def.probes[i].id} x ${def.probes[j].id} (${d.toFixed(1)})`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a probe circle only touches the region it sits on, never another region', () => {
    const bad: string[] = [];
    for (const def of Object.values(CLOSEUPS)) {
      const h = viewHeight(def.aspect);
      for (const probe of def.probes) {
        const cx = probe.x * VIEW_W;
        const cy = probe.y * h;
        for (const region of def.regions) {
          const box = toBox(region.shape, def.aspect);
          if (!shapeHas(region.shape, def.aspect, cx, cy) && circleHitsBox(cx, cy, PROBE_HIT_R, box)) {
            bad.push(`${def.id}: probe ${probe.id} clips region ${region.id}`);
          }
        }
        const sitsOn = def.regions.filter((r) => shapeHas(r.shape, def.aspect, cx, cy));
        if (sitsOn.length > 1) {
          bad.push(`${def.id}: probe ${probe.id} sits on ${sitsOn.length} regions`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('site hotspots in the same view never overlap', () => {
    const bad: string[] = [];
    for (const view of ['inside', 'outside'] as const) {
      const spots = SITE_HOTSPOTS.filter((s) => s.view === view);
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const hit = spots[i].shapes.some((a) => spots[j].shapes.some((b) => shapesOverlap(a, b, SITE_ASPECT[view])));
          if (hit) {
            bad.push(`${view}: ${spots[i].id} x ${spots[j].id}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
