/**
 * @file GeoMap - Interactive geographic canvas map
 * @description A dependency-free canvas map over a real Earth basemap
 * (earthmap4k.jpg). Two consumers today:
 *
 * - the Campaign 5 geolocation console: satellite subpoints, TDOA/FDOA lines of
 *   position, the computed fix circle + error ellipse, truth markers;
 * - the ground-track tab (Campaign 2+): sub-satellite tracks split past/future,
 *   ground-station visibility circles, and the day/night terminator.
 *
 * Every layer is optional, so a consumer only pays for what it sets.
 *
 * The view is a pannable/zoomable window onto the globe, independent of the
 * solver's area of interest: it opens fully zoomed out on the whole world and
 * the operator scroll-wheel-zooms (centered on the cursor) and drags to pan in
 * to where the lines of position cross. No auto-zoom to the answer.
 *
 * The basemap is a standard full-Earth equirectangular image (lon -180..180
 * across, lat 90..-90 down), and the projection is uniform-degrees so overlays
 * register exactly with the imagery. Overlay accent colors read from the
 * --mc-* theme variables. New in Campaign 5; no other campaign references it.
 */

import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import type { ErrorEllipse } from '@app/services/geolocation-service';
import {
  interpolateGroundPoint,
  nightPolygon,
  splitAtAntimeridian,
  subsolarPoint,
  visibilityCircle,
  type GroundPoint,
  type LonLat,
} from '@app/services/ground-track-math';
import './geo-map.css';

export interface GeoMarker {
  lat: number;
  lon: number;
  label: string;
  kind: 'station' | 'satellite' | 'fix' | 'truth';
}

/**
 * A line of position, defined by its constraint rather than sampled points:
 * `residual(lat, lon)` is zero exactly on the line (e.g. predicted TDOA minus
 * the measured value). The map traces the zero contour across the current view
 * at draw time, so the line spans the whole visible map and stays solid at any
 * zoom level.
 */
export interface GeoLop {
  residual: (lat: number, lon: number) => number;
  kind: 'tdoa' | 'fdoa';
}

/**
 * A sub-satellite ground track. `nowMs` splits it into a solid past leg and a
 * dotted future leg, so the operator can read the direction of travel at a
 * glance without an animation.
 */
export interface GeoTrack {
  points: GroundPoint[];
  nowMs: number;
  label: string;
  color: string;
  /** Draw thicker and label the live sub-point (the focused satellite). */
  isHighlighted?: boolean;
}

/**
 * A ground-station access circle: the region within which a satellite at the
 * given angular radius clears the station's elevation mask. Radius comes from
 * `visibilityRadiusDeg` so the map and the pass planner share one definition.
 */
export interface GeoFootprint {
  lat: number;
  lon: number;
  radiusDeg: number;
  label: string;
}

export interface GeoMapLayers {
  markers: GeoMarker[];
  lops: GeoLop[];
  fix?: { lat: number; lon: number; ellipse: ErrorEllipse | null } | null;
  tracks?: GeoTrack[];
  footprints?: GeoFootprint[];
  /** Render the day/night terminator for this instant (scenario time, not wall clock). */
  terminator?: Date | null;
}

/** Current view window onto the globe (uniform degrees per pixel). */
interface Viewport {
  centerLat: number;
  centerLon: number;
  degPerPx: number;
}

const KM_PER_DEG_LAT = 111.32;
/** Full-Earth equirectangular basemap served from public/images */
const EARTH_BASEMAP_URL = '/images/earthmap4k.jpg';
/** City-lights companion to the day basemap, clipped to the night polygon */
const EARTH_NIGHT_BASEMAP_URL = '/images/earthmap-night4k.jpg';
/** Tightest zoom (deg/px) - ~a third of a degree across a 600px canvas */
const MIN_DEG_PER_PX = 0.0005;
/** Scroll-wheel zoom factor per notch */
const ZOOM_STEP = 1.2;

export class GeoMap {
  private readonly uniqueId_: string;
  private readonly width_: number;
  private readonly height_: number;
  private readonly html_: string;
  private readonly earthImage_: HTMLImageElement;
  private readonly boundWheel_: (e: WheelEvent) => void;
  private readonly boundPointerDown_: (e: PointerEvent) => void;
  private readonly boundPointerMove_: (e: PointerEvent) => void;
  private readonly boundPointerUp_: (e: PointerEvent) => void;

  private readonly nightImage_: HTMLImageElement;

  private dom_: HTMLElement | null = null;
  private canvas_: HTMLCanvasElement | null = null;
  private ctx_: CanvasRenderingContext2D | null = null;
  private layers_: GeoMapLayers = { markers: [], lops: [] };
  private earthLoaded_ = false;
  private nightLoaded_ = false;
  private readonly view_: Viewport;
  private dragLast_: { x: number; y: number } | null = null;
  private drawScheduled_ = false;

  constructor(uniqueId: string, config: { width?: number; height?: number } = {}) {
    this.uniqueId_ = uniqueId;
    // 2:1 aspect so the whole equirectangular globe fits when fully zoomed out
    this.width_ = config.width ?? 600;
    this.height_ = config.height ?? 300;
    this.html_ = html`
      <div class="geo-map" id="${uniqueId}">
        <canvas class="geo-map-canvas" width="${this.width_}" height="${this.height_}"></canvas>
      </div>
    `;

    // Open fully zoomed out on the whole world; the operator zooms in manually.
    this.view_ = { centerLat: 0, centerLon: 0, degPerPx: this.maxDegPerPx_() };

    this.boundWheel_ = this.handleWheel_.bind(this);
    this.boundPointerDown_ = this.handlePointerDown_.bind(this);
    this.boundPointerMove_ = this.handlePointerMove_.bind(this);
    this.boundPointerUp_ = this.handlePointerUp_.bind(this);

    // Load the Earth basemap; redraw once it's available (falls back to a
    // solid theme surface until then, and on load error).
    this.earthImage_ = new Image();
    this.earthImage_.onload = () => {
      this.earthLoaded_ = true;
      this.draw();
    };
    this.earthImage_.src = EARTH_BASEMAP_URL;

    // Night lights are only used when a consumer asks for the terminator; the
    // shading falls back to a flat dark fill until (or if) this loads.
    this.nightImage_ = new Image();
    this.nightImage_.onload = () => {
      this.nightLoaded_ = true;
      this.draw();
    };
    this.nightImage_.src = EARTH_NIGHT_BASEMAP_URL;
  }

  get outerHtml(): string {
    return this.html_;
  }

  get dom(): HTMLElement | null {
    return this.dom_;
  }

  /** Bind to the rendered DOM (call after the parent innerHTML is set) */
  attach(parent: HTMLElement): void {
    this.dom_ = qs(`#${this.uniqueId_}`, parent);
    this.canvas_ = qs('.geo-map-canvas', this.dom_);
    this.ctx_ = this.canvas_.getContext('2d');
    this.canvas_.addEventListener('wheel', this.boundWheel_, { passive: false });
    this.canvas_.addEventListener('pointerdown', this.boundPointerDown_);
    this.canvas_.addEventListener('pointermove', this.boundPointerMove_);
    this.canvas_.addEventListener('pointerup', this.boundPointerUp_);
    this.canvas_.addEventListener('pointerleave', this.boundPointerUp_);
    this.draw();
  }

  dispose(): void {
    if (this.canvas_) {
      this.canvas_.removeEventListener('wheel', this.boundWheel_);
      this.canvas_.removeEventListener('pointerdown', this.boundPointerDown_);
      this.canvas_.removeEventListener('pointermove', this.boundPointerMove_);
      this.canvas_.removeEventListener('pointerup', this.boundPointerUp_);
      this.canvas_.removeEventListener('pointerleave', this.boundPointerUp_);
    }
  }

  setLayers(layers: GeoMapLayers): void {
    this.layers_ = layers;
    this.draw();
  }

  /**
   * Recenter the view without changing zoom. Consumers use this to open on an
   * asset of interest; the operator's pan/zoom afterwards is never overridden.
   */
  centerOn(lat: number, lon: number, degPerPx?: number): void {
    if (degPerPx !== undefined) {
      this.view_.degPerPx = Math.min(this.maxDegPerPx_(), Math.max(MIN_DEG_PER_PX, degPerPx));
    }
    this.view_.centerLat = lat;
    this.view_.centerLon = lon;
    this.clampView_();
    this.draw();
  }

  /** Coalesce rapid interaction redraws (pan/zoom) to one per animation frame */
  private scheduleDraw_(): void {
    if (this.drawScheduled_) {
      return;
    }
    this.drawScheduled_ = true;
    requestAnimationFrame(() => {
      this.drawScheduled_ = false;
      this.draw();
    });
  }

  draw(): void {
    const ctx = this.ctx_;
    if (!ctx) {
      return;
    }

    const styles = getComputedStyle(this.dom_ ?? document.body);
    const surface = styles.getPropertyValue('--mc-surface-0').trim() || '#121314';
    const accentRgb = styles.getPropertyValue('--mc-accent-red-rgb').trim() || '143, 111, 70';
    const accentBright = styles.getPropertyValue('--mc-accent-red-bright').trim() || '#d2a86a';

    ctx.clearRect(0, 0, this.width_, this.height_);

    if (this.drawBasemap_(ctx, this.earthImage_, this.earthLoaded_)) {
      this.drawTerminator_(ctx);
      // Slight veil so overlay lines, labels, and markers stay legible over
      // the imagery without washing the map out.
      ctx.fillStyle = 'rgba(8, 12, 18, 0.28)';
      ctx.fillRect(0, 0, this.width_, this.height_);
    } else {
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, this.width_, this.height_);
    }

    this.drawGraticule_(ctx);
    this.drawFootprints_(ctx);
    this.drawTracks_(ctx);
    this.drawLops_(ctx, accentBright);
    this.drawFix_(ctx, accentBright, accentRgb);
    this.drawMarkers_(ctx);
  }

  // ── Projection ──────────────────────────────────────────────────────────

  private project_(lat: number, lon: number): { x: number; y: number } {
    const { centerLat, centerLon, degPerPx } = this.view_;
    return {
      x: this.width_ / 2 + (lon - centerLon) / degPerPx,
      y: this.height_ / 2 - (lat - centerLat) / degPerPx,
    };
  }

  private unproject_(x: number, y: number): { lat: number; lon: number } {
    const { centerLat, centerLon, degPerPx } = this.view_;
    return {
      lon: centerLon + (x - this.width_ / 2) * degPerPx,
      lat: centerLat - (y - this.height_ / 2) * degPerPx,
    };
  }

  // ── Interaction: scroll-wheel zoom + drag pan ─────────────────────────────

  /** deg/px at which the whole globe just fits the canvas (max zoom out) */
  private maxDegPerPx_(): number {
    return Math.min(360 / this.width_, 180 / this.height_);
  }

  /** Convert a pointer event to canvas pixel coordinates (accounts for CSS scaling) */
  private canvasXy_(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas_?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (e.clientX - rect.left) * (this.width_ / rect.width),
      y: (e.clientY - rect.top) * (this.height_ / rect.height),
    };
  }

  private handleWheel_(e: WheelEvent): void {
    e.preventDefault();
    const { x, y } = this.canvasXy_(e);
    const geo = this.unproject_(x, y); // keep the point under the cursor fixed

    const factor = e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const degPerPx = Math.min(this.maxDegPerPx_(), Math.max(MIN_DEG_PER_PX, this.view_.degPerPx * factor));
    this.view_.degPerPx = degPerPx;

    // Re-center so `geo` stays under (x, y) at the new scale
    this.view_.centerLon = geo.lon - (x - this.width_ / 2) * degPerPx;
    this.view_.centerLat = geo.lat + (y - this.height_ / 2) * degPerPx;
    this.clampView_();
    this.scheduleDraw_();
  }

  private handlePointerDown_(e: PointerEvent): void {
    this.dragLast_ = this.canvasXy_(e);
    this.canvas_?.setPointerCapture(e.pointerId);
  }

  private handlePointerMove_(e: PointerEvent): void {
    if (!this.dragLast_) {
      return;
    }
    const now = this.canvasXy_(e);
    const degPerPx = this.view_.degPerPx;
    this.view_.centerLon -= (now.x - this.dragLast_.x) * degPerPx;
    this.view_.centerLat += (now.y - this.dragLast_.y) * degPerPx;
    this.dragLast_ = now;
    this.clampView_();
    this.scheduleDraw_();
  }

  private handlePointerUp_(e: PointerEvent): void {
    this.dragLast_ = null;
    this.canvas_?.releasePointerCapture?.(e.pointerId);
  }

  /** Keep the view window within the basemap bounds (no off-world panning) */
  private clampView_(): void {
    const spanLon = this.width_ * this.view_.degPerPx;
    const spanLat = this.height_ * this.view_.degPerPx;
    this.view_.centerLon = spanLon >= 360
      ? 0
      : Math.min(180 - spanLon / 2, Math.max(-180 + spanLon / 2, this.view_.centerLon));
    this.view_.centerLat = spanLat >= 180
      ? 0
      : Math.min(90 - spanLat / 2, Math.max(-90 + spanLat / 2, this.view_.centerLat));
  }

  // ── Layers ────────────────────────────────────────────────────────────────

  /**
   * Draw an equirectangular basemap for the current view window. Returns false
   * (caller falls back to a solid surface) until the image has loaded.
   */
  private drawBasemap_(ctx: CanvasRenderingContext2D, img: HTMLImageElement, loaded: boolean): boolean {
    if (!loaded || !img.naturalWidth) {
      return false;
    }

    const topLeft = this.unproject_(0, 0);
    const bottomRight = this.unproject_(this.width_, this.height_);
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    // Equirectangular: x = (lon+180)/360, y = (90-lat)/180 (top = higher lat)
    const sx = ((topLeft.lon + 180) / 360) * imgW;
    const sw = ((bottomRight.lon - topLeft.lon) / 360) * imgW;
    const sy = ((90 - topLeft.lat) / 180) * imgH;
    const sh = ((topLeft.lat - bottomRight.lat) / 180) * imgH;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.width_, this.height_);

    return true;
  }

  /**
   * Shade the night side, clipped to the terminator polygon. Where the city-
   * lights basemap is available it is drawn inside the clip so the dark side
   * stays readable; otherwise a flat darkening does the job.
   *
   * The polygon is traced in *screen* space, so it follows the current pan/zoom
   * for free.
   *
   * Its longitudes are already monotonic (-180 → 180, then the two closing
   * points at the dark pole), so they are projected literally. Do NOT "unwrap"
   * them: the deliberate 180 → -180 step in the closing pair is what runs the
   * path along the pole edge, and smoothing it out closes the polygon with a
   * diagonal across the map instead.
   *
   * Near an equinox the curve is genuinely near-vertical (the terminator runs
   * pole to pole), so lat(lon) jumps between ±88° between adjacent samples.
   * That is physically correct, not an artifact — the fill handles it because
   * each column still spans from the curve to the dark pole.
   */
  private drawTerminator_(ctx: CanvasRenderingContext2D): void {
    const date = this.layers_.terminator;

    if (!date) {
      return;
    }

    const polygon = nightPolygon(subsolarPoint(date));

    ctx.save();
    ctx.beginPath();

    for (const [i, point] of polygon.entries()) {
      const { x, y } = this.project_(point.lat, point.lon);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.clip();

    if (!this.drawBasemap_(ctx, this.nightImage_, this.nightLoaded_)) {
      ctx.fillStyle = 'rgba(2, 6, 14, 0.55)';
      ctx.fillRect(0, 0, this.width_, this.height_);
    } else {
      // Even with city lights, keep the night side clearly darker than day.
      ctx.fillStyle = 'rgba(2, 6, 14, 0.35)';
      ctx.fillRect(0, 0, this.width_, this.height_);
    }

    ctx.restore();
  }

  /**
   * Ground-station access circles. Drawn under the tracks so a track crossing
   * into a footprint reads as "this is the pass" without hiding the line.
   */
  private drawFootprints_(ctx: CanvasRenderingContext2D): void {
    for (const footprint of this.layers_.footprints ?? []) {
      const ring = visibilityCircle({ lat: footprint.lat, lon: footprint.lon }, footprint.radiusDeg);

      if (ring.length === 0) {
        continue;
      }

      ctx.lineWidth = 1.25;
      ctx.strokeStyle = 'rgba(90, 169, 220, 0.85)';
      ctx.setLineDash([4, 3]);

      for (const segment of splitAtAntimeridian(ring)) {
        this.strokePath_(ctx, segment);
      }

      ctx.setLineDash([]);
    }
  }

  /**
   * Sub-satellite tracks: solid behind the satellite, dotted ahead of it, with
   * a marker at the live sub-point. Each leg is split at the antimeridian so it
   * runs to the map edge instead of streaking back across the world.
   */
  private drawTracks_(ctx: CanvasRenderingContext2D): void {
    for (const track of this.layers_.tracks ?? []) {
      if (track.points.length < 2) {
        continue;
      }

      const past = track.points.filter((p) => p.t <= track.nowMs);
      const future = track.points.filter((p) => p.t >= track.nowMs);
      const width = track.isHighlighted ? 2 : 1.25;

      const drawLeg = (points: GroundPoint[], dash: number[]): void => {
        if (points.length < 2) {
          return;
        }
        ctx.setLineDash(dash);
        for (const segment of splitAtAntimeridian(points)) {
          // Dark halo keeps the line readable over bright terrain.
          ctx.lineWidth = width + 2;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          this.strokePath_(ctx, segment);
          ctx.lineWidth = width;
          ctx.strokeStyle = track.color;
          this.strokePath_(ctx, segment);
        }
        ctx.setLineDash([]);
      };

      drawLeg(past, []);
      drawLeg(future, [5, 4]);

      const now = interpolateGroundPoint(track.points, track.nowMs);

      if (now) {
        const { x, y } = this.project_(now.lat, now.lon);

        ctx.beginPath();
        ctx.arc(x, y, track.isHighlighted ? 5 : 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = track.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.stroke();

        ctx.font = track.isHighlighted ? 'bold 11px monospace' : '10px monospace';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeText(track.label, x + 8, y - 2);
        ctx.fillStyle = track.color;
        ctx.fillText(track.label, x + 8, y - 2);
      }
    }
  }

  /** Stroke a lon/lat polyline as a single projected path. */
  private strokePath_(ctx: CanvasRenderingContext2D, points: LonLat[]): void {
    if (points.length < 2) {
      return;
    }

    ctx.beginPath();
    for (const [i, point] of points.entries()) {
      const { x, y } = this.project_(point.lat, point.lon);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private drawGraticule_(ctx: CanvasRenderingContext2D): void {
    const topLeft = this.unproject_(0, 0);
    const bottomRight = this.unproject_(this.width_, this.height_);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';

    const label = (text: string, x: number, y: number): void => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(text, x, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    };

    const lonStep = GeoMap.gridStep_(bottomRight.lon - topLeft.lon);
    for (let lon = Math.ceil(topLeft.lon / lonStep) * lonStep; lon <= bottomRight.lon; lon += lonStep) {
      const { x } = this.project_(0, lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height_);
      ctx.stroke();
      label(`${lon.toFixed(1)}°`, x + 2, 2);
    }

    const latStep = GeoMap.gridStep_(topLeft.lat - bottomRight.lat);
    for (let lat = Math.ceil(bottomRight.lat / latStep) * latStep; lat <= topLeft.lat; lat += latStep) {
      const { y } = this.project_(lat, 0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width_, y);
      ctx.stroke();
      label(`${lat.toFixed(1)}°`, 2, y + 2);
    }
  }

  private drawLops_(ctx: CanvasRenderingContext2D, tdoaColor: string): void {
    // Grid cells ~8 px across the current view; the contour is re-traced every
    // draw so it always spans the visible map and stays solid at any zoom.
    const cols = Math.max(2, Math.round(this.width_ / 8));
    const rows = Math.max(2, Math.round(this.height_ / 8));

    for (const lop of this.layers_.lops) {
      const segments = this.traceContour_(lop.residual, cols, rows);

      const stroke = (color: string, lineWidth: number): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of segments) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      };

      // Dark halo under a bright line keeps the LOP high-contrast over terrain.
      stroke('rgba(0, 0, 0, 0.75)', 4.5);
      stroke(lop.kind === 'tdoa' ? tdoaColor : '#3ec8ff', 2);
    }
  }

  /**
   * Marching squares: trace the residual == 0 contour across the current view
   * as a list of pixel-space line segments. Sampling in screen space means the
   * line is drawn at whatever resolution the current zoom needs.
   */
  private traceContour_(
    residual: (lat: number, lon: number) => number,
    cols: number,
    rows: number,
  ): Array<[number, number, number, number]> {
    const cellW = this.width_ / cols;
    const cellH = this.height_ / rows;
    const nx = cols + 1;
    const ny = rows + 1;

    // Residual at every grid node (shared between adjacent cells)
    const values = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const geo = this.unproject_(i * cellW, j * cellH);
        values[j * nx + i] = residual(geo.lat, geo.lon);
      }
    }

    const interp = (
      x1: number, y1: number, v1: number,
      x2: number, y2: number, v2: number,
    ): [number, number] => {
      const t = v1 / (v1 - v2);
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    };

    const segments: Array<[number, number, number, number]> = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x0 = i * cellW;
        const y0 = j * cellH;
        const x1 = (i + 1) * cellW;
        const y1 = (j + 1) * cellH;
        const tl = values[j * nx + i];
        const tr = values[j * nx + i + 1];
        const br = values[(j + 1) * nx + i + 1];
        const bl = values[(j + 1) * nx + i];
        if (!Number.isFinite(tl + tr + br + bl)) {
          continue;
        }

        const crossings: Array<[number, number]> = [];
        if ((tl < 0) !== (tr < 0)) crossings.push(interp(x0, y0, tl, x1, y0, tr)); // top
        if ((tr < 0) !== (br < 0)) crossings.push(interp(x1, y0, tr, x1, y1, br)); // right
        if ((br < 0) !== (bl < 0)) crossings.push(interp(x1, y1, br, x0, y1, bl)); // bottom
        if ((bl < 0) !== (tl < 0)) crossings.push(interp(x0, y1, bl, x0, y0, tl)); // left

        if (crossings.length === 2) {
          segments.push([crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]]);
        } else if (crossings.length === 4) {
          // Saddle - connect as two segments (either pairing reads fine here)
          segments.push([crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]]);
          segments.push([crossings[2][0], crossings[2][1], crossings[3][0], crossings[3][1]]);
        }
      }
    }

    return segments;
  }

  private drawFix_(ctx: CanvasRenderingContext2D, accentBright: string, accentRgb: string): void {
    const fix = this.layers_.fix;
    if (!fix?.ellipse) {
      return;
    }

    const center = this.project_(fix.lat, fix.lon);
    const degPerPx = this.view_.degPerPx;
    const kmPerDegLon = KM_PER_DEG_LAT * Math.cos(fix.lat * (Math.PI / 180));
    const pxPerKmX = 1 / (degPerPx * kmPerDegLon);
    const pxPerKmY = 1 / (degPerPx * KM_PER_DEG_LAT);

    // orientationDeg is bearing of the semi-major axis clockwise from north
    const theta = fix.ellipse.orientationDeg * (Math.PI / 180);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.beginPath();
    for (let a = 0; a <= 360; a += 6) {
      const rad = a * (Math.PI / 180);
      const north = fix.ellipse.semiMajorKm * Math.cos(rad) * Math.cos(theta)
        - fix.ellipse.semiMinorKm * Math.sin(rad) * Math.sin(theta);
      const east = fix.ellipse.semiMajorKm * Math.cos(rad) * Math.sin(theta)
        + fix.ellipse.semiMinorKm * Math.sin(rad) * Math.cos(theta);
      const px = east * pxPerKmX;
      const py = -north * pxPerKmY;
      if (a === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.strokeStyle = accentBright;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = `rgba(${accentRgb}, 0.12)`;
    ctx.fill();
    ctx.restore();
  }

  private drawMarkers_(ctx: CanvasRenderingContext2D): void {
    for (const marker of this.layers_.markers) {
      const { x, y } = this.project_(marker.lat, marker.lon);
      const style = GeoMap.markerStyle_(marker.kind);

      ctx.fillStyle = style.color;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;

      if (marker.kind === 'satellite') {
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.stroke();
      } else if (marker.kind === 'fix') {
        // The computed emitter fix: a ring with a center dot, sitting on top
        // of the TDOA/FDOA lines of position and the error ellipse.
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      } else if (marker.kind === 'truth') {
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.moveTo(x + 5, y - 5);
        ctx.lineTo(x - 5, y + 5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Outlined label for contrast over the basemap imagery
      ctx.font = '10px monospace';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeText(marker.label, x + 9, y - 1);
      ctx.fillStyle = style.color;
      ctx.fillText(marker.label, x + 9, y - 1);
    }
  }

  private static markerStyle_(kind: GeoMarker['kind']): { color: string } {
    switch (kind) {
      case 'station':
        return { color: '#5aa9dc' };
      case 'satellite':
        return { color: '#e8ebee' };
      case 'fix':
        return { color: '#ffd07a' };
      case 'truth':
        return { color: '#ff5a4f' };
    }
  }

  /** Pick a graticule step (deg) that yields ~4-8 gridlines across a span */
  private static gridStep_(spanDeg: number): number {
    const target = spanDeg / 6;
    const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45];
    for (const candidate of candidates) {
      if (candidate >= target) {
        return candidate;
      }
    }

    return candidates.at(-1) ?? 1;
  }
}
