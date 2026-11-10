/**
 * @file spectrum-panel - SDR spectrum trace and waterfall with click-to-tune
 * @description Draws `manager.spectrum(deviceId)` rows (dBm bins across the SDR span) as a trace
 * plus a scrolling waterfall. Clicking the canvas retunes the SDR to that frequency.
 * Test ids: ham-spectrum-<dev>-canvas, ham-spectrum-<dev>-readout, ham-spectrum-select.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { card, h, Rebuilder, select, tid } from '../ui-kit';

const FLOOR_DBM = -130;
const CEIL_DBM = -50;
const WATERFALL_ROWS = 96;
const TRACE_H = 48;

/** Dark blue -> light blue -> yellow -> red gradient for a dBm value */
export function spectrumColor(dbm: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, (dbm - FLOOR_DBM) / (CEIL_DBM - FLOOR_DBM))) ** 1.6;
  if (n < 0.35) return [0, Math.round(40 + n * 300), Math.round(80 + n * 400)];
  if (n < 0.7) {
    const t = (n - 0.35) / 0.35;

    return [Math.round(255 * t), Math.round(145 + 110 * t), Math.round(220 * (1 - t))];
  }
  const t = (n - 0.7) / 0.3;

  return [255, Math.round(255 * (1 - t)), 0];
}

export class SpectrumPanel implements StationPanel {
  readonly id = 'spectrum';
  readonly title = 'Spectrum & waterfall';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private body_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private selected_ = '';
  private canvas_: HTMLCanvasElement | null = null;
  private readout_: HTMLElement | null = null;
  private rows_: Float32Array[] = [];
  private lastRow_: Float32Array | undefined;

  private static sdrs_(m: HamStationManager): string[] {
    return m
      .devices()
      .filter((d) => d.kind === 'sdr' && !d.removed && !d.spare && d.location === m.location)
      .map((d) => d.id);
  }

  isRelevant(m: HamStationManager): boolean {
    return SpectrumPanel.sdrs_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = card('ham-spectrum-card', this.title);
    this.root_ = c.root;
    this.body_ = h('div');
    c.body.append(this.body_);
    host.append(c.root);
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    const ids = SpectrumPanel.sdrs_(m);
    this.rebuild_.run(this.body_, ids.join('|'), () => this.build_(m, ids));
    const row = this.selected_ ? m.spectrum(this.selected_) : undefined;
    if (row && row !== this.lastRow_) {
      this.lastRow_ = row;
      this.rows_.unshift(row.slice());
      if (this.rows_.length > WATERFALL_ROWS) this.rows_.pop();
    }
    this.draw_(m);
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.canvas_ = null;
    this.rows_ = [];
  }

  private build_(m: HamStationManager, ids: string[]): void {
    if (!ids.includes(this.selected_)) {
      this.selected_ = ids[0] ?? '';
      this.rows_ = [];
      this.lastRow_ = undefined;
    }
    if (ids.length > 1) {
      const sel = select(
        'ham-spectrum-select',
        'SDR to display',
        ids.map((id) => ({ value: id, label: m.device(id)?.label ?? id })),
        this.selected_
      );
      sel.classList.add('w-auto', 'mb-2');
      sel.addEventListener('change', () => {
        this.selected_ = sel.value;
        this.rows_ = [];
        this.lastRow_ = undefined;
        this.build_(this.ctx_.manager, ids);
      });
      this.body_.append(sel);
    }
    if (!this.selected_) return;
    const id = this.selected_;
    const canvas = h('canvas', {
      width: 256,
      height: TRACE_H + WATERFALL_ROWS,
      class: 'w-100 border rounded',
      style: 'cursor: crosshair; image-rendering: pixelated',
      id: tid('ham-spectrum', id, 'canvas'),
      'data-testid': tid('ham-spectrum', id, 'canvas'),
      role: 'img',
      'aria-label': `${m.device(id)?.label ?? id} spectrum and waterfall. Click to tune.`,
      tabindex: 0,
    });
    canvas.addEventListener('click', (ev) => this.tune_(ev, id));
    this.canvas_ = canvas;
    this.readout_ = h('div', { class: 'small font-monospace mt-1', 'data-testid': tid('ham-spectrum', id, 'readout'), 'aria-live': 'off' });
    this.body_.append(canvas, this.readout_);
  }

  private tune_(ev: MouseEvent, id: string): void {
    const canvas = this.canvas_;
    const r = this.ctx_.manager.radio(id);
    if (!canvas || !r) return;
    const rect = canvas.getBoundingClientRect();
    const frac = rect.width > 0 ? (ev.clientX - rect.left) / rect.width : 0.5;
    const mhz = r.vfoMHz + ((Math.max(0, Math.min(1, frac)) - 0.5) * r.spanHz) / 1e6;
    this.ctx_.act({ type: 'radio.set', deviceId: id, patch: { vfoMHz: Math.round(mhz * 1e5) / 1e5 } });
  }

  private draw_(m: HamStationManager): void {
    const canvas = this.canvas_;
    const r = this.selected_ ? m.radio(this.selected_) : undefined;
    if (this.readout_ && r) this.readout_.textContent = `${r.vfoMHz.toFixed(4)} MHz  span ${(r.spanHz / 1000).toFixed(0)} kHz  (click to tune)`;
    if (!canvas || this.rows_.length === 0) return;
    let g: CanvasRenderingContext2D | null = null;
    try {
      g = canvas.getContext('2d');
    } catch {
      g = null;
    }
    if (!g) return;
    const w = canvas.width;
    g.fillStyle = '#10141a';
    g.fillRect(0, 0, w, canvas.height);
    const top = this.rows_[0];
    g.strokeStyle = '#7CFC00';
    g.beginPath();
    for (let x = 0; x < w; x++) {
      const v = top[Math.floor((x / w) * top.length)] ?? FLOOR_DBM;
      const y = TRACE_H - 1 - Math.max(0, Math.min(1, (v - FLOOR_DBM) / (CEIL_DBM - FLOOR_DBM))) * (TRACE_H - 2);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    const img = g.createImageData(w, this.rows_.length);
    this.rows_.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const [rr, gg, bb] = spectrumColor(row[Math.floor((x / w) * row.length)] ?? FLOOR_DBM);
        const o = (y * w + x) * 4;
        img.data[o] = rr;
        img.data[o + 1] = gg;
        img.data[o + 2] = bb;
        img.data[o + 3] = 255;
      }
    });
    g.putImageData(img, 0, TRACE_H);
  }
}
