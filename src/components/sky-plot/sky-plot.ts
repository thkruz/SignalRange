import { drawPolarGrid, drawPolarLabels } from '@app/components/polar-plot/polar-grid';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { azElToXY, nearestWithin, type PixelPoint, type SkyPoint, type SkyPolygon, scanLimitOutline, smallCircle } from './sky-geometry';
import './sky-plot.css';

export type SkyDotStyle = 'known' | 'dim' | 'target' | 'candidate' | 'pinned';

export interface SkyDot {
  id: string;
  azDeg: number;
  elDeg: number;
  style: SkyDotStyle;
}

export interface SkyBeam {
  azDeg: number;
  elDeg: number;
  /** Full 3 dB beamwidth, degrees. Marker radius = beamwidth / 2 on the sky (min 4 px). */
  beamwidthDeg: number;
}

export interface SkyScanMask {
  /** Panel normal azimuth, degrees. */
  panelAzDeg: number;
  /** Panel tilt from zenith, degrees (0 = flat, facing up). */
  tiltDeg: number;
  /** Maximum scan angle from the panel normal, degrees. */
  maxScanDeg: number;
}

export interface SkyPlotConfig {
  /** Initial CSS size of the (square) canvas before the first resize. Default 320. */
  size?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  /** Pointer pick tolerance in CSS px, added to the dot radius. Default 6. */
  hitTolerancePx?: number;
  onHover?: (dot: SkyDot | null, evt: PointerEvent) => void;
  onClick?: (dot: SkyDot, evt: PointerEvent | MouseEvent) => void;
}

export type SkyPaletteKey = 'bg' | 'grid' | 'horizon' | 'label' | 'known' | 'dim' | 'target' | 'candidate' | 'pinned' | 'beam' | 'mask' | 'zone';
export type SkyPalette = Record<SkyPaletteKey, string>;

/** Fallbacks used when the CSS tokens are unavailable (tests, detached DOM). */
export const DEFAULT_SKY_PALETTE: SkyPalette = {
  bg: '#1a1a1a',
  grid: '#333333',
  horizon: '#555555',
  label: '#888888',
  known: '#4da3ff',
  dim: '#6b6b6b',
  target: '#3ddc84',
  candidate: '#3ddc84',
  pinned: '#ff2827',
  beam: '#ff2827',
  mask: '#1f1f1f',
  zone: '#e0a030',
};

export interface SkyDotStyleSpec {
  /** Dot radius in CSS px. */
  radius: number;
  palette: SkyPaletteKey;
  /** Filled disc. */
  fill: boolean;
  /** Outline ring drawn around the dot. */
  ring: boolean;
  /** Ring colour key when different from the fill colour. */
  ringPalette?: SkyPaletteKey;
  ringWidth: number;
  /** Fill opacity. */
  alpha: number;
}

export const SKY_DOT_STYLES: Readonly<Record<SkyDotStyle, SkyDotStyleSpec>> = {
  known: { radius: 3, palette: 'known', fill: true, ring: false, ringWidth: 0, alpha: 1 },
  dim: { radius: 2.5, palette: 'dim', fill: true, ring: false, ringWidth: 0, alpha: 0.55 },
  target: { radius: 6, palette: 'target', fill: true, ring: false, ringWidth: 0, alpha: 1 },
  candidate: { radius: 6, palette: 'candidate', fill: false, ring: true, ringWidth: 2, alpha: 1 },
  pinned: { radius: 4, palette: 'known', fill: true, ring: true, ringPalette: 'pinned', ringWidth: 2, alpha: 1 },
};

export function getSkyDotStyleSpec(style: SkyDotStyle): SkyDotStyleSpec {
  return SKY_DOT_STYLES[style];
}

const PALETTE_VARS: Record<SkyPaletteKey, string> = {
  bg: '--sky-bg',
  grid: '--sky-grid',
  horizon: '--sky-horizon',
  label: '--sky-label',
  known: '--sky-known',
  dim: '--sky-dim',
  target: '--sky-target',
  candidate: '--sky-candidate',
  pinned: '--sky-pinned',
  beam: '--sky-beam',
  mask: '--sky-mask',
  zone: '--sky-zone',
};

/** Resolve the palette from the element's computed CSS variables (Mission Control tokens). */
export function resolveSkyPalette(el: Element): SkyPalette {
  const out = { ...DEFAULT_SKY_PALETTE };

  if (typeof getComputedStyle !== 'function') return out;

  const cs = getComputedStyle(el);

  for (const key of Object.keys(PALETTE_VARS) as SkyPaletteKey[]) {
    const v = cs.getPropertyValue(PALETTE_VARS[key]).trim();

    if (v) out[key] = v;
  }

  return out;
}

const LABEL_MARGIN = 22;
const HATCH_SPACING = 7;

export class SkyPlot {
  protected html_: string;
  private readonly uniqueId_: string;
  private readonly config_: Required<Pick<SkyPlotConfig, 'size' | 'showGrid' | 'showLabels' | 'hitTolerancePx'>> & Pick<SkyPlotConfig, 'onHover' | 'onClick'>;
  private dom_?: HTMLElement;
  private canvas_?: HTMLCanvasElement;
  private ctx_?: CanvasRenderingContext2D;
  private resizeObserver_?: ResizeObserver;
  private palette_: SkyPalette = DEFAULT_SKY_PALETTE;
  private rafId_ = 0;
  private disposed_ = false;

  private cssW_ = 0;
  private cssH_ = 0;
  private dpr_ = 1;

  private dots_: SkyDot[] = [];
  private beam_: SkyBeam | null = null;
  private track_: SkyPoint[] | null = null;
  private mask_: SkyScanMask | null = null;
  private zones_: SkyPolygon[] = [];

  // Screen positions of the dots from the last draw, used by hit testing.
  private px_ = new Float32Array(0);
  private py_ = new Float32Array(0);
  private pad_ = new Float32Array(0);
  private hoverId_: string | null = null;

  private readonly boundMove_: (e: PointerEvent) => void;
  private readonly boundLeave_: (e: PointerEvent) => void;
  private readonly boundClick_: (e: MouseEvent) => void;

  constructor(uniqueId: string, config: SkyPlotConfig = {}) {
    this.uniqueId_ = uniqueId;
    this.config_ = {
      size: config.size ?? 320,
      showGrid: config.showGrid ?? true,
      showLabels: config.showLabels ?? true,
      hitTolerancePx: config.hitTolerancePx ?? 6,
      onHover: config.onHover,
      onClick: config.onClick,
    };
    this.boundMove_ = this.onPointerMove_.bind(this);
    this.boundLeave_ = this.onPointerLeave_.bind(this);
    this.boundClick_ = this.onClick_.bind(this);

    this.html_ = html`
      <div class="sky-plot" id="${uniqueId}">
        <canvas class="sky-plot-canvas" width="${this.config_.size}" height="${this.config_.size}"></canvas>
      </div>
    `;
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId_}`);

    return this.dom_;
  }

  /** Call after the html has been inserted into the document. */
  onDomReady(): void {
    this.attach(qs<HTMLCanvasElement>('.sky-plot-canvas', this.dom));
  }

  /** Attach to an existing canvas (also used by tests). */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas_ = canvas;
    this.ctx_ = canvas.getContext('2d') ?? undefined;
    canvas.addEventListener('pointermove', this.boundMove_);
    canvas.addEventListener('pointerleave', this.boundLeave_);
    canvas.addEventListener('click', this.boundClick_);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver_ = new ResizeObserver(() => this.resize());
      this.resizeObserver_.observe(canvas);
    }

    this.refreshTheme();
    this.resize();
  }

  // ---- Scene setters (each schedules a coalesced redraw) ----

  setDots(dots: SkyDot[]): void {
    this.dots_ = dots;
    this.requestDraw();
  }

  setBeam(beam: SkyBeam | null): void {
    this.beam_ = beam;
    this.requestDraw();
  }

  /** Short predicted track for the target, in order of time. */
  setTrack(points: SkyPoint[] | null): void {
    this.track_ = points;
    this.requestDraw();
  }

  setScanMask(mask: SkyScanMask | null): void {
    this.mask_ = mask;
    this.requestDraw();
  }

  /** Hatched exclusion zones (build GEO belt with geoArcBand()). */
  setZones(zones: SkyPolygon[]): void {
    this.zones_ = zones;
    this.requestDraw();
  }

  /** Re-read the CSS tokens (call after a theme change). */
  refreshTheme(): void {
    if (this.canvas_) this.palette_ = resolveSkyPalette(this.canvas_);
    this.requestDraw();
  }

  /** Resize the backing store to the canvas CSS size times devicePixelRatio. */
  resize(): void {
    const canvas = this.canvas_;

    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.round(rect.width) || this.config_.size;
    const cssH = Math.round(rect.height) || cssW;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    this.cssW_ = cssW;
    this.cssH_ = cssH;
    this.dpr_ = dpr;

    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);

    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    this.draw();
  }

  requestDraw(): void {
    if (this.rafId_ || this.disposed_ || !this.ctx_ || typeof requestAnimationFrame !== 'function') return;

    this.rafId_ = requestAnimationFrame(() => {
      this.rafId_ = 0;
      this.draw();
    });
  }

  /** Geometry of the plot in CSS px. */
  getLayout(): { cx: number; cy: number; radius: number } {
    const w = this.cssW_ || this.config_.size;
    const h = this.cssH_ || this.config_.size;

    return { cx: w / 2, cy: h / 2, radius: Math.max(10, Math.min(w, h) / 2 - LABEL_MARGIN) };
  }

  /** Nearest dot within the pick tolerance of a CSS-px point on the canvas, or null. Uses the last draw's positions. */
  hitTest(x: number, y: number, tolerancePx = this.config_.hitTolerancePx): SkyDot | null {
    const i = nearestWithin(this.px_, this.py_, this.pad_, this.dots_.length, x, y, tolerancePx);

    return i < 0 ? null : this.dots_[i];
  }

  dispose(): void {
    this.disposed_ = true;

    if (this.rafId_ && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId_);

    this.rafId_ = 0;
    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = undefined;
    this.canvas_?.removeEventListener('pointermove', this.boundMove_);
    this.canvas_?.removeEventListener('pointerleave', this.boundLeave_);
    this.canvas_?.removeEventListener('click', this.boundClick_);
    this.canvas_ = undefined;
    this.ctx_ = undefined;
    this.dots_ = [];
    this.zones_ = [];
  }

  // ---- Drawing ----

  /** Synchronous full redraw. */
  draw(): void {
    const ctx = this.ctx_;

    if (!ctx || this.disposed_) return;

    const pal = this.palette_;
    const { cx, cy, radius } = this.getLayout();
    const w = this.cssW_ || this.config_.size;
    const h = this.cssH_ || this.config_.size;

    ctx.setTransform(this.dpr_, 0, 0, this.dpr_, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';

    if (this.config_.showGrid) {
      drawPolarGrid(ctx, cx, cy, radius, { grid: pal.grid, horizon: pal.horizon, label: pal.label });
    }

    this.drawZones_(ctx, cx, cy, radius);
    this.drawMask_(ctx, cx, cy, radius);

    if (this.config_.showLabels) drawPolarLabels(ctx, cx, cy, radius, pal.label);

    this.drawTrack_(ctx, cx, cy, radius);
    this.drawDots_(ctx, cx, cy, radius);
    this.drawBeam_(ctx, cx, cy, radius);
  }

  private tracePolygon_(ctx: CanvasRenderingContext2D, pts: SkyPoint[], cx: number, cy: number, radius: number): void {
    for (let i = 0; i < pts.length; i++) {
      const p = azElToXY(pts[i].azDeg, pts[i].elDeg, cx, cy, radius);

      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }

    ctx.closePath();
  }

  private drawMask_(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const m = this.mask_;

    if (!m) return;

    const outline = scanLimitOutline(m.panelAzDeg, m.tiltDeg, m.maxScanDeg);

    // Shade the sky outside the scan cone: horizon disc minus the cone (even-odd).
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.tracePolygon_(ctx, outline, cx, cy, radius);
    ctx.fillStyle = this.palette_.mask;
    ctx.globalAlpha = 0.72;
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    this.tracePolygon_(ctx, outline, cx, cy, radius);
    ctx.strokeStyle = this.palette_.target;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.restore();
  }

  private drawZones_(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    if (this.zones_.length === 0) return;

    const color = this.palette_.zone;

    for (const zone of this.zones_) {
      if (zone.points.length < 3) continue;

      ctx.save();
      ctx.beginPath();
      this.tracePolygon_(ctx, zone.points, cx, cy, radius);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.clip();

      // Diagonal hatch across the horizon square.
      ctx.beginPath();
      const span = radius * 2;

      for (let o = -span; o <= span; o += HATCH_SPACING) {
        ctx.moveTo(cx - radius + o, cy + radius);
        ctx.lineTo(cx + radius + o, cy - radius);
      }

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      this.tracePolygon_(ctx, zone.points, cx, cy, radius);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawTrack_(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const t = this.track_;

    if (!t || t.length < 2) return;

    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < t.length; i++) {
      const p = azElToXY(t[i].azDeg, t[i].elDeg, cx, cy, radius);

      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }

    ctx.strokeStyle = this.palette_.target;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  }

  private drawDots_(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const n = this.dots_.length;

    if (this.px_.length < n) {
      this.px_ = new Float32Array(n);
      this.py_ = new Float32Array(n);
      this.pad_ = new Float32Array(n);
    }

    const pal = this.palette_;
    // Draw order: dim first, then known, then emphasised styles on top.
    const order: SkyDotStyle[] = ['dim', 'known', 'pinned', 'candidate', 'target'];

    // Position pass (also feeds hit-testing)
    for (let i = 0; i < n; i++) {
      const d = this.dots_[i];
      const p = azElToXY(d.azDeg, d.elDeg, cx, cy, radius);

      this.px_[i] = p.x;
      this.py_[i] = p.y;
      this.pad_[i] = SKY_DOT_STYLES[d.style].radius;
    }

    for (const style of order) {
      const spec = SKY_DOT_STYLES[style];

      for (let i = 0; i < n; i++) {
        if (this.dots_[i].style !== style) continue;

        const x = this.px_[i];
        const y = this.py_[i];

        ctx.beginPath();
        ctx.arc(x, y, spec.radius, 0, Math.PI * 2);

        if (spec.fill) {
          ctx.globalAlpha = spec.alpha;
          ctx.fillStyle = pal[spec.palette];
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (spec.ring) {
          if (spec.fill) {
            ctx.beginPath();
            ctx.arc(x, y, spec.radius + spec.ringWidth, 0, Math.PI * 2);
          }

          ctx.strokeStyle = pal[spec.ringPalette ?? spec.palette];
          ctx.lineWidth = spec.ringWidth;
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  private drawBeam_(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const b = this.beam_;

    if (!b) return;

    const c: PixelPoint = azElToXY(b.azDeg, b.elDeg, cx, cy, radius);
    const pts = smallCircle(b.azDeg, b.elDeg, Math.max(0.01, b.beamwidthDeg / 2), 36);

    // Pixel radius from the sky circle (largest distance), floored for visibility.
    let rPx = 0;

    for (const p of pts) {
      const q = azElToXY(p.azDeg, p.elDeg, cx, cy, radius);

      rPx = Math.max(rPx, Math.hypot(q.x - c.x, q.y - c.y));
    }

    ctx.save();
    ctx.strokeStyle = this.palette_.beam;
    ctx.lineWidth = 1.5;

    if (rPx >= 4) {
      ctx.beginPath();
      this.tracePolygon_(ctx, pts, cx, cy, radius);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cross-hair
    ctx.beginPath();
    ctx.moveTo(c.x - 3, c.y);
    ctx.lineTo(c.x + 3, c.y);
    ctx.moveTo(c.x, c.y - 3);
    ctx.lineTo(c.x, c.y + 3);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Interaction ----

  private localXY_(e: MouseEvent): PixelPoint {
    const rect = this.canvas_!.getBoundingClientRect();

    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerMove_(e: PointerEvent): void {
    if (!this.config_.onHover) return;

    const { x, y } = this.localXY_(e);
    const dot = this.hitTest(x, y);
    const id = dot?.id ?? null;

    if (id !== this.hoverId_ || dot) {
      this.hoverId_ = id;
      this.config_.onHover(dot, e);
    }
  }

  private onPointerLeave_(e: PointerEvent): void {
    if (this.hoverId_ !== null) {
      this.hoverId_ = null;
      this.config_.onHover?.(null, e);
    }
  }

  private onClick_(e: MouseEvent): void {
    if (!this.config_.onClick) return;

    const { x, y } = this.localXY_(e);
    const dot = this.hitTest(x, y);

    if (dot) this.config_.onClick(dot, e);
  }

  static create(id: string, config?: SkyPlotConfig): SkyPlot {
    return new SkyPlot(id, config);
  }
}
