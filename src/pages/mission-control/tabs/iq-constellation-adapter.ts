import { qs } from "@app/engine/utils/query-selector";
import { IQSignalInfo, Receiver } from "@app/equipment/receiver/receiver";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { ModulationType } from "@app/types";

/**
 * IQConstellationAdapter - Displays I&Q constellation diagram for receiver signals
 *
 * Realistic simulation features:
 * - Shows actual signal constellation even when modem config doesn't match
 * - C/N-based noise scaling (higher C/N = tighter clusters)
 * - Carrier recovery rotation when modulation is mismatched
 * - Phase rotation from frequency offset
 * - Pure noise display when no carrier present
 */
export class IQConstellationAdapter {
  private readonly receiver_: Receiver;
  private readonly canvas_: HTMLCanvasElement;
  private readonly ctx_: CanvasRenderingContext2D;
  private updateHandler_: (() => void) | null = null;
  private animationFrameId_: number | null = null;
  private readonly width_ = 200;
  private readonly height_ = 200;

  // Status indicator DOM elements (using generic type due to jQuery type pollution)
  private statusContainer_: { remove(): void } | null = null;
  private cnIndicator_: { textContent: string | null; className: string } | null = null;
  private lockIndicator_: { textContent: string | null; className: string } | null = null;

  // Carrier recovery simulation
  private carrierRotationPhase_ = 0;
  private readonly MISMATCH_ROTATION_RATE_ = 0.7; // rad/sec - configurable

  constructor(receiver: Receiver, container: HTMLElement) {
    this.receiver_ = receiver;

    const canvasContainer = qs('#iq-constellation-container', container);
    if (!canvasContainer) return;

    // Create status indicators (DOM elements outside canvas)
    this.createStatusElements_(canvasContainer);

    // Create canvas
    this.canvas_ = document.createElement('canvas');
    this.canvas_.width = this.width_;
    this.canvas_.height = this.height_;
    this.canvas_.className = 'iq-constellation-canvas';
    canvasContainer.appendChild(this.canvas_);

    this.ctx_ = this.canvas_.getContext('2d')!;

    // Start rendering
    this.startRendering_();

    // Subscribe to updates
    this.updateHandler_ = () => this.render_();
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);
  }

  private createStatusElements_(container: Element): void {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'iq-status-container';

    const cnSpan = document.createElement('span');
    cnSpan.className = 'iq-status-cn font-monospace';

    const lockSpan = document.createElement('span');
    lockSpan.className = 'iq-status-lock font-monospace';

    statusDiv.append(cnSpan, lockSpan);
    container.appendChild(statusDiv);

    // Store references with minimal interface to avoid jQuery type conflicts
    this.statusContainer_ = { remove: () => statusDiv.remove() };
    this.cnIndicator_ = cnSpan;
    this.lockIndicator_ = lockSpan;
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
      this.drawNoPower_(ctx, centerX, centerY);
      this.updateStatusIndicators_(null);
      return;
    }

    // Get signal info using relaxed filtering (for IQ display)
    const signalState = this.receiver_.getSignalsInBandwidth(activeModem);
    this.updateStatusIndicators_(signalState);

    if (!signalState.hasCarrier) {
      // No carrier - show pure noise
      this.drawNoiseOnly_(ctx, centerX, centerY, scale);
      return;
    }

    // Get constellation based on ACTUAL modulation (not configured)
    const modulation = signalState.actualModulation ?? signalState.configuredModulation;
    let points = this.getConstellationPoints_(modulation);

    // When locked, carrier recovery compensates for frequency offset - constellation is stable
    // When not locked, apply rotation effects to simulate carrier hunting
    if (signalState.hasLock) {
      this.carrierRotationPhase_ = 0;
    } else {
      points = this.applyCarrierRecoveryError_(points, signalState);
      points = this.applyFrequencyOffset_(points, signalState.frequencyOffset_Hz);
    }

    // Draw constellation with C/N-based noise
    this.drawConstellationRealistic_(ctx, points, centerX, centerY, scale, signalState);
  }

  private updateStatusIndicators_(state: IQSignalInfo | null): void {
    if (!this.cnIndicator_ || !this.lockIndicator_) return;

    if (!state) {
      this.cnIndicator_.textContent = 'C/N: ---';
      this.cnIndicator_.className = 'iq-status-cn font-monospace text-muted';
      this.lockIndicator_.textContent = 'OFF';
      this.lockIndicator_.className = 'iq-status-lock font-monospace text-muted';
      return;
    }

    // C/N indicator
    const cnText = state.cnRatio_dB > -50 ? `C/N: ${state.cnRatio_dB.toFixed(1)} dB` : 'C/N: ---';
    const cnClass = state.cnRatio_dB > 15 ? 'text-success' : state.cnRatio_dB > 8 ? 'text-warning' : 'text-danger';
    this.cnIndicator_.textContent = cnText;
    this.cnIndicator_.className = `iq-status-cn font-monospace ${cnClass}`;

    // Lock indicator
    const lockText = state.hasLock ? 'LOCKED' : state.hasCarrier ? 'CARRIER' : 'NO LOCK';
    const lockClass = state.hasLock ? 'text-success' : state.hasCarrier ? 'text-warning' : 'text-danger';
    this.lockIndicator_.textContent = lockText;
    this.lockIndicator_.className = `iq-status-lock font-monospace ${lockClass}`;
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

  private drawNoPower_(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.fillStyle = '#444';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MODEM OFF', cx, cy);
    ctx.textAlign = 'left';
  }

  private drawNoiseOnly_(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number): void {
    // Pure Gaussian noise across IQ plane - no text overlay
    ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
    for (let i = 0; i < 200; i++) {
      const { z0, z1 } = this.boxMullerGaussian_();
      ctx.beginPath();
      ctx.arc(cx + z0 * scale * 0.8, cy + z1 * scale * 0.8, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Box-Muller transform for proper Gaussian distribution
   */
  private boxMullerGaussian_(): { z0: number; z1: number } {
    let u1: number, u2: number;
    do {
      u1 = Math.random();
      u2 = Math.random();
    } while (u1 <= Number.EPSILON);

    const mag = Math.sqrt(-2.0 * Math.log(u1));
    return {
      z0: mag * Math.cos(2 * Math.PI * u2),
      z1: mag * Math.sin(2 * Math.PI * u2)
    };
  }

  /**
   * Compute noise spread from C/N ratio
   * Higher C/N = tighter constellation clusters
   */
  private computeNoiseSpread_(cnRatio_dB: number): number {
    if (cnRatio_dB < -10) return 1.0;   // Pure noise
    if (cnRatio_dB > 30) return 0.02;   // Very tight clusters

    const cnLinear = Math.pow(10, cnRatio_dB / 10);
    return Math.min(1.0, Math.max(0.02, 1 / Math.sqrt(2 * cnLinear)));
  }

  /**
   * Apply carrier recovery error when modulation is mismatched.
   * Simulates carrier loop hunting - constellation rotates slowly.
   */
  private applyCarrierRecoveryError_(
    points: { i: number; q: number }[],
    state: IQSignalInfo
  ): { i: number; q: number }[] {
    if (!state.modulationMismatch) {
      this.carrierRotationPhase_ = 0;
      return points;
    }

    // Apply base rotation rate, scaled by modulation order difference
    const orderScale = this.getMismatchOrderScale_(state.actualModulation, state.configuredModulation);
    this.carrierRotationPhase_ += this.MISMATCH_ROTATION_RATE_ * orderScale * 0.033; // ~30fps

    const cos = Math.cos(this.carrierRotationPhase_);
    const sin = Math.sin(this.carrierRotationPhase_);

    return points.map(p => ({
      i: p.i * cos - p.q * sin,
      q: p.i * sin + p.q * cos
    }));
  }

  private getMismatchOrderScale_(actual: ModulationType | null, configured: ModulationType): number {
    const order: Record<string, number> = { 'BPSK': 2, 'QPSK': 4, '8QAM': 8, '16QAM': 16 };
    const actualOrder = order[actual ?? 'QPSK'] ?? 4;
    const configuredOrder = order[configured] ?? 4;
    const ratio = actualOrder / configuredOrder;
    return ratio > 1 ? 1 + 0.2 * Math.log2(ratio) : 0.8;
  }

  /**
   * Apply phase rotation from frequency offset.
   * Offset causes constellation to rotate continuously.
   */
  private applyFrequencyOffset_(
    points: { i: number; q: number }[],
    frequencyOffset_Hz: number
  ): { i: number; q: number }[] {
    // Scale down frequency offset for visible rotation (avoid spinning too fast)
    const scaledOffset = frequencyOffset_Hz / 1000; // kHz scale
    const phase = 2 * Math.PI * scaledOffset * (Date.now() / 1000);
    const cos = Math.cos(phase);
    const sin = Math.sin(phase);

    return points.map(p => ({
      i: p.i * cos - p.q * sin,
      q: p.i * sin + p.q * cos
    }));
  }

  private getConstellationPoints_(modulation: ModulationType | string): { i: number; q: number }[] {
    switch (modulation) {
      case 'BPSK':
        return [
          { i: -1, q: 0 },
          { i: 1, q: 0 }
        ];
      case 'QPSK': {
        const qpskVal = 0.707;
        return [
          { i: qpskVal, q: qpskVal },
          { i: -qpskVal, q: qpskVal },
          { i: -qpskVal, q: -qpskVal },
          { i: qpskVal, q: -qpskVal }
        ];
      }
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
      case '16QAM': {
        const v = 0.33;
        const points: { i: number; q: number }[] = [];
        for (let ii = -1.5; ii <= 1.5; ii++) {
          for (let qq = -1.5; qq <= 1.5; qq++) {
            points.push({ i: ii * v * 2, q: qq * v * 2 });
          }
        }
        return points;
      }
      default:
        return [
          { i: 0.707, q: 0.707 },
          { i: -0.707, q: 0.707 },
          { i: -0.707, q: -0.707 },
          { i: 0.707, q: -0.707 }
        ];
    }
  }

  private drawConstellationRealistic_(
    ctx: CanvasRenderingContext2D,
    points: { i: number; q: number }[],
    cx: number,
    cy: number,
    scale: number,
    state: IQSignalInfo
  ): void {
    const noiseSpread = this.computeNoiseSpread_(state.cnRatio_dB);
    const samplesPerPoint = this.getSamplesPerPoint_(state.cnRatio_dB);

    // Determine color based on lock state
    const color = state.hasLock
      ? 'rgba(0, 255, 128, 0.6)'      // Green - locked
      : state.modulationMismatch
        ? 'rgba(255, 165, 0, 0.6)'    // Orange - wrong modulation
        : 'rgba(255, 255, 0, 0.6)';   // Yellow - wrong FEC or marginal

    ctx.fillStyle = color;

    // Draw noisy samples
    for (const point of points) {
      for (let s = 0; s < samplesPerPoint; s++) {
        const { z0, z1 } = this.boxMullerGaussian_();
        const noiseI = z0 * noiseSpread;
        const noiseQ = z1 * noiseSpread;

        const x = cx + (point.i + noiseI) * scale;
        const y = cy - (point.q + noiseQ) * scale;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw ideal constellation reference points (dimmer when not locked)
    ctx.fillStyle = state.hasLock ? '#00ff80' : 'rgba(255, 255, 255, 0.3)';
    for (const point of points) {
      const x = cx + point.i * scale;
      const y = cy - point.q * scale;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private getSamplesPerPoint_(cnRatio_dB: number): number {
    // More samples when C/N is low (to show spread)
    // Fewer when C/N is high (tight clusters visible with fewer points)
    if (cnRatio_dB < 5) return 40;
    if (cnRatio_dB < 10) return 30;
    if (cnRatio_dB < 15) return 25;
    if (cnRatio_dB < 20) return 20;
    return 15;
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

    this.statusContainer_?.remove();
    this.canvas_.remove();
  }
}
