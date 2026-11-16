/**
 * @file plant-svg - SVG string helpers for the image-relative overlays
 * @description Overlays use a viewBox of 1000 x (1000 / aspect) so coordinates
 * stay in the 0..1 image space of the data file and scale with the picture.
 */

import type { SiteShape } from './site-types';

export const VIEW_W = 1000;

export function viewHeight(aspect: number): number {
  return VIEW_W / aspect;
}

export function svgOpen(aspect: number, extraClass = ''): string {
  return `<svg class="${extraClass}" viewBox="0 0 ${VIEW_W} ${viewHeight(aspect).toFixed(1)}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`;
}

const f = (n: number): string => n.toFixed(1);

/** One shape as an SVG element string; `cls` is the rect class, `pathCls` the polyline class */
export function shapeSvg(shape: SiteShape, aspect: number, cls: string, pathCls: string): string {
  const h = viewHeight(aspect);
  if (shape.kind === 'rect') {
    return `<rect class="${cls}" x="${f(shape.x * VIEW_W)}" y="${f(shape.y * h)}" width="${f(shape.w * VIEW_W)}" height="${f(shape.h * h)}" rx="4"/>`;
  }
  const points = shape.points.map(([x, y]) => `${f(x * VIEW_W)},${f(y * h)}`).join(' ');

  return `<polyline class="${pathCls}" points="${points}" stroke-width="${f(shape.width * VIEW_W)}"/>`;
}

/** Centre of a shape in view units */
export function shapeCentre(shape: SiteShape, aspect: number): [number, number] {
  const h = viewHeight(aspect);
  if (shape.kind === 'rect') {
    return [(shape.x + shape.w / 2) * VIEW_W, (shape.y + shape.h / 2) * h];
  }
  const mid = shape.points[Math.floor(shape.points.length / 2)];

  return [mid[0] * VIEW_W, mid[1] * h];
}

/** Point at fraction t (0..1) of the polyline's length, in 0..1 image space */
export function pointAlong(points: Array<[number, number]>, t: number): [number, number] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(d);
    total += d;
  }
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] === 0 ? 0 : Math.min(remaining / lengths[i], 1);

      return [points[i][0] + (points[i + 1][0] - points[i][0]) * k, points[i][1] + (points[i + 1][1] - points[i][1]) * k];
    }
    remaining -= lengths[i];
  }

  return points[0];
}
