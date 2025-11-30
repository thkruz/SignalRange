import { qs } from "@app/engine/utils/query-selector";
import { Receiver } from "@app/equipment/receiver/receiver";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";

/**
 * IQConstellationAdapter - Displays I&Q constellation diagram for receiver signals
 *
 * Shows constellation points based on the current modulation type:
 * - BPSK: 2 points on horizontal axis
 * - QPSK: 4 points in a square
 * - 8QAM: 8 points
 * - 16QAM: 16 points in a grid
 */
export class IQConstellationAdapter {
  private readonly receiver_: Receiver;
  private readonly canvas_: HTMLCanvasElement;
  private readonly ctx_: CanvasRenderingContext2D;
  private updateHandler_: (() => void) | null = null;
  private animationFrameId_: number | null = null;
  private readonly width_ = 200;
  private readonly height_ = 200;

  constructor(receiver: Receiver, container: HTMLElement) {
    this.receiver_ = receiver;

    // Create canvas
    this.canvas_ = document.createElement('canvas');
    this.canvas_.width = this.width_;
    this.canvas_.height = this.height_;
    this.canvas_.className = 'iq-constellation-canvas';

    const canvasContainer = qs('#iq-constellation-container', container);
    if (canvasContainer) {
      canvasContainer.appendChild(this.canvas_);
    }

    this.ctx_ = this.canvas_.getContext('2d')!;

    // Start rendering
    this.startRendering_();

    // Subscribe to updates
    this.updateHandler_ = () => this.render_();
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);
  }

  private startRendering_(): void {
    this.render_();
  }

  private render_(): void {
    const ctx = this.ctx_;
    const w = this.width_;
    const h = this.height_;
    const centerX = w / 2;
    const centerY = h / 2;
    const scale = 0.35 * Math.min(w, h);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    this.drawGrid_(ctx, centerX, centerY, scale);

    // Get current modem state
    const activeModem = this.receiver_.state.modems[this.receiver_.state.activeModem - 1];
    if (!activeModem?.isPowered) {
      this.drawNoSignal_(ctx, centerX, centerY);
      return;
    }

    // Check if receiver has a valid signal for this modem
    if (!this.receiver_.hasSignalForModem(activeModem)) {
      this.drawNoSignal_(ctx, centerX, centerY);
      return;
    }

    // Get constellation points based on modulation
    const points = this.getConstellationPoints_(activeModem.modulation);

    // Draw constellation points with noise
    this.drawConstellation_(ctx, points, centerX, centerY, scale);
  }

  private drawGrid_(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number): void {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw axes
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(this.width_, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, this.height_);
    ctx.stroke();

    // Draw unit circle (reference)
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#222';
    ctx.setLineDash([2, 4]);
    for (let i = -1; i <= 1; i += 0.5) {
      if (i === 0) continue;
      ctx.beginPath();
      ctx.moveTo(cx + i * scale, 0);
      ctx.lineTo(cx + i * scale, this.height_);
      ctx.moveTo(0, cy + i * scale);
      ctx.lineTo(this.width_, cy + i * scale);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw labels
    ctx.fillStyle = '#666';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('I', this.width_ - 12, cy - 5);
    ctx.fillText('Q', cx + 5, 12);
  }

  private drawNoSignal_(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.fillStyle = '#666';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO SIGNAL', cx, cy);
    ctx.textAlign = 'left';
  }

  private getConstellationPoints_(modulation: string): { i: number; q: number }[] {
    switch (modulation) {
      case 'BPSK':
        return [
          { i: -1, q: 0 },
          { i: 1, q: 0 }
        ];
      case 'QPSK':
        const qpskVal = 0.707;
        return [
          { i: qpskVal, q: qpskVal },
          { i: -qpskVal, q: qpskVal },
          { i: -qpskVal, q: -qpskVal },
          { i: qpskVal, q: -qpskVal }
        ];
      case '8QAM':
        return [
          { i: 1, q: 0 },
          { i: 0.707, q: 0.707 },
          { i: 0, q: 1 },
          { i: -0.707, q: 0.707 },
          { i: -1, q: 0 },
          { i: -0.707, q: -0.707 },
          { i: 0, q: -1 },
          { i: 0.707, q: -0.707 }
        ];
      case '16QAM':
        const v = 0.33;
        const points: { i: number; q: number }[] = [];
        for (let i = -1.5; i <= 1.5; i++) {
          for (let q = -1.5; q <= 1.5; q++) {
            points.push({ i: i * v * 2, q: q * v * 2 });
          }
        }
        return points;
      default:
        return [
          { i: 0.707, q: 0.707 },
          { i: -0.707, q: 0.707 },
          { i: -0.707, q: -0.707 },
          { i: 0.707, q: -0.707 }
        ];
    }
  }

  private drawConstellation_(
    ctx: CanvasRenderingContext2D,
    points: { i: number; q: number }[],
    cx: number,
    cy: number,
    scale: number
  ): void {
    // Draw multiple samples with noise for each point
    const samplesPerPoint = 20;
    const noiseLevel = 0.08;

    ctx.fillStyle = 'rgba(0, 255, 128, 0.6)';

    for (const point of points) {
      for (let s = 0; s < samplesPerPoint; s++) {
        const noiseI = (Math.random() - 0.5) * noiseLevel;
        const noiseQ = (Math.random() - 0.5) * noiseLevel;

        const x = cx + (point.i + noiseI) * scale;
        const y = cy - (point.q + noiseQ) * scale; // Invert Y for proper orientation

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw ideal constellation points
    ctx.fillStyle = '#00ff80';
    for (const point of points) {
      const x = cx + point.i * scale;
      const y = cy - point.q * scale;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public dispose(): void {
    if (this.updateHandler_) {
      EventBus.getInstance().off(Events.UPDATE, this.updateHandler_);
      this.updateHandler_ = null;
    }

    if (this.animationFrameId_) {
      cancelAnimationFrame(this.animationFrameId_);
      this.animationFrameId_ = null;
    }

    this.canvas_.remove();
  }
}
