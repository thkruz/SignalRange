import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Degrees } from "ootk";
import './polar-plot.css';

export interface PolarPlotConfig {
  /** Width of the canvas in pixels */
  width?: number;
  /** Height of the canvas in pixels */
  height?: number;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show elevation labels */
  showLabels?: boolean;
}

export class PolarPlot {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLElement;
  private canvas_?: HTMLCanvasElement;
  private ctx_?: CanvasRenderingContext2D;
  private azimuth: Degrees = 0 as Degrees;
  private elevation: Degrees = 0 as Degrees;
  private readonly config: Required<PolarPlotConfig>;

  constructor(
    uniqueId: string,
    config: PolarPlotConfig = {}
  ) {
    this.uniqueId = uniqueId;
    this.config = {
      width: config.width ?? 200,
      height: config.height ?? 200,
      showGrid: config.showGrid ?? true,
      showLabels: config.showLabels ?? true,
    };

    this.html_ = html`
      <div class="polar-plot" id="${uniqueId}">
        <canvas
          class="polar-plot-canvas"
          width="${this.config.width}"
          height="${this.config.height}">
        </canvas>
      </div>
    `;
  }

  onDomReady(): void {
    this.canvas_ = qs('.polar-plot-canvas', this.dom);
    this.ctx_ = this.canvas_.getContext('2d')!;
    this.ctx_.font = '12px monospace';
    this.ctx_.textBaseline = 'middle';
    this.draw_();
  }

  /**
   * Update the antenna position on the polar plot
   */
  draw(azimuth: Degrees, elevation: Degrees): void {
    if (this.azimuth !== azimuth || this.elevation !== elevation) {
      if (!this.ctx_ || !this.canvas_) return;
      this.azimuth = azimuth;
      this.elevation = elevation;
      this.draw_();
    }
  }

  /**
   * Draw the polar plot with current antenna position
   */
  private draw_(): void {
    if (!this.ctx_ || !this.canvas_) return;

    const ctx = this.ctx_;
    const width = this.canvas_.width;
    const height = this.canvas_.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20; // Leave margin for labels

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (this.config.showGrid) {
      this.drawGrid_(ctx, centerX, centerY, radius);
    }

    if (this.config.showLabels) {
      this.drawLabels_(ctx, centerX, centerY, radius);
    }

    this.drawAntennaPosition_(ctx, centerX, centerY, radius);
  }

  /**
   * Draw the polar grid (elevation circles and azimuth radials)
   */
  private drawGrid_(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw elevation circles (0°, 30°, 60°, 90°)
    const elevationSteps = [90, 75, 60, 45, 30, 15, 0]; // From center to edge
    for (const el of elevationSteps) {
      const r = radius * (1 - el / 90);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw azimuth radials (every 30°)
    for (let az = 0; az < 360; az += 30) {
      const angleRad = ((az - 90) * Math.PI) / 180; // Offset by 90° to make 0° point up
      const x = centerX + radius * Math.cos(angleRad);
      const y = centerY + radius * Math.sin(angleRad);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Draw outer circle (horizon)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /**
   * Draw azimuth and elevation labels
   */
  private drawLabels_(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';

    // Draw azimuth labels (N, E, S, W)
    const labels = [
      { text: 'N', az: 0 },
      { text: 'E', az: 90 },
      { text: 'S', az: 180 },
      { text: 'W', az: 270 },
    ];

    for (const label of labels) {
      const angleRad = ((label.az - 90) * Math.PI) / 180;
      const labelRadius = radius + 12;
      const x = centerX + labelRadius * Math.cos(angleRad);
      const y = centerY + labelRadius * Math.sin(angleRad);
      ctx.fillText(label.text, x, y);
    }

    // Draw elevation labels
    ctx.textAlign = 'left';
    const elevationLabels = [
      { text: '90°', el: 90 },
      { text: '75°', el: 75 },
      { text: '60°', el: 60 },
      { text: '45°', el: 45 },
      { text: '30°', el: 30 },
      { text: '15°', el: 15 },
      { text: '0°', el: 0 },
    ];

    // Draw elevation labels up and to the right at a 30 degree angle
    const angleRad = ((60 - 90) * Math.PI) / 180; // 30° azimuth, offset by 90°
    for (const label of elevationLabels) {
      const r = radius * (1 - label.el / 90);
      const x = centerX + r * Math.cos(angleRad) + 5;
      const y = centerY + r * Math.sin(angleRad);
      ctx.fillText(label.text, x, y);
    }
  }

  /**
   * Draw the antenna position as a red circle
   */
  private drawAntennaPosition_(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
    // Normalize azimuth to 0-360
    const normalizedAz = ((this.azimuth % 360) + 360) % 360;

    // Clamp elevation to 0-90
    const clampedEl = Math.max(0, Math.min(90, this.elevation));

    // Convert to polar coordinates
    // Elevation: 90° at center, 0° at edge
    // Azimuth: 0° points up (North), increases clockwise
    const r = radius * (1 - clampedEl / 90);
    const angleRad = ((normalizedAz - 90) * Math.PI) / 180; // Offset by 90° to make 0° point up

    const x = centerX + r * Math.cos(angleRad);
    const y = centerY + r * Math.sin(angleRad);

    // Draw red circle for antenna position
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();

    // Draw white outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw crosshair at center (boresight)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 5, centerY);
    ctx.lineTo(centerX + 5, centerY);
    ctx.moveTo(centerX, centerY - 5);
    ctx.lineTo(centerX, centerY + 5);
    ctx.stroke();
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  static create(
    id: string,
    config?: PolarPlotConfig
  ): PolarPlot {
    return new PolarPlot(id, config);
  }
}
