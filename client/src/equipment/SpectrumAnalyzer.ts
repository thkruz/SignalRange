import { html, qs } from '../utils';
import { eventBus, Events } from '../events/event-bus';
import { DEFAULT_SPEC_A } from '../constants';

export interface SpectrumAnalyzerConfig {
  unit: number; // 1-4
  team_id: number;
  antenna_id: number;
  rf: boolean; // true = RF mode, false = IF mode
  frequency: number; // MHz - center frequency
  span: number; // MHz - bandwidth
  hold: boolean; // Hold max amplitude
  minDecibels: number;
  maxDecibels: number;
  noiseFloor: number;
}

/**
 * SpectrumAnalyzer - Single analyzer unit
 * Manages its own state and renders to a canvas
 */
export class SpectrumAnalyzer {
  private readonly element: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // State
  private readonly config: SpectrumAnalyzerConfig;
  private isRfMode: boolean = false;
  private isPaused: boolean = false;
  private animationId: number | null = null;

  constructor(
    parentId: string,
    private readonly unit: number, // 1-4
    private readonly teamId: number = 1,
    private readonly antennaId: number = 1
  ) {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    this.element = parent;

    // Initialize config
    this.config = {
      unit: this.unit,
      team_id: this.teamId,
      antenna_id: this.antennaId,
      rf: false,
      frequency: 4700, // MHz
      span: 100, // MHz
      hold: false,
      minDecibels: DEFAULT_SPEC_A.minDecibels,
      maxDecibels: DEFAULT_SPEC_A.maxDecibels,
      noiseFloor: DEFAULT_SPEC_A.noiseFloor,
    };

    this.render();
    this.addListeners();
    this.start();
  }

  private render(): void {
    this.element.innerHTML = html`
      <div class="spectrum-analyzer-box">
        <div class="spec-a-header">
          <div class="spec-a-title">Spectrum Analyzer ${this.unit}</div>
          <div class="spec-a-span">Span: ${this.config.span} MHz</div>
        </div>

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.unit}" width="600" height="400"></canvas>
        </div>

        <div class="spec-a-info">
          <div>CF: ${this.config.frequency} MHz</div>
          <div>Ant: ${this.config.antenna_id}</div>
        </div>

        <div class="spec-a-controls">
          <button class="btn-config" data-action="config">Config</button>
          <button class="btn-mode ${this.isRfMode ? 'active' : ''}" data-action="mode">
            ${this.isRfMode ? 'RF' : 'IF'}
          </button>
          <button class="btn-pause ${this.isPaused ? 'active' : ''}" data-action="pause">
            Pause
          </button>
        </div>
      </div>
    `;

    // Get canvas reference
    this.canvas = qs<HTMLCanvasElement>(`#specA${this.unit}`, this.element);
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
  }

  private addListeners(): void {
    // Button clicks
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      switch (action) {
        case 'config':
          this.openConfig();
          break;
        case 'mode':
          this.toggleMode();
          break;
        case 'pause':
          this.togglePause();
          break;
      }
    });

    // Listen for antenna changes
    eventBus.on(Events.ANTENNA_FREQUENCY_CHANGED, (data) => {
      if (data.antennaId === this.config.antenna_id) {
        this.updateFrequency(data.frequency);
      }
    });
  }

  private openConfig(): void {
    // TODO: Open config modal
    console.log('Open config for Spec A', this.unit);
    eventBus.emit(Events.SPEC_A_CONFIG_CHANGED, { unit: this.unit });
  }

  private toggleMode(): void {
    this.isRfMode = !this.isRfMode;
    this.config.rf = this.isRfMode;

    // Update button state
    const btn = qs('.btn-mode', this.element);
    if (btn) {
      btn.textContent = this.isRfMode ? 'RF' : 'IF';
      btn.classList.toggle('active', this.isRfMode);
    }

    eventBus.emit(Events.SPEC_A_MODE_CHANGED, {
      unit: this.unit,
      mode: this.isRfMode ? 'RF' : 'IF'
    });
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;

    // Update button state
    const btn = qs('.btn-pause', this.element);
    if (btn) {
      btn.classList.toggle('active', this.isPaused);
    }

    if (this.isPaused) {
      this.stop();
    } else {
      this.start();
    }
  }

  private updateFrequency(frequency: number): void {
    this.config.frequency = frequency;

    // Update display
    const infoEl = qs('.spec-a-info', this.element);
    if (infoEl) {
      infoEl.innerHTML = html`
        <div>CF: ${this.config.frequency} MHz</div>
        <div>Ant: ${this.config.antenna_id}</div>
      `;
    }
  }

  private start(): void {
    if (this.animationId) return;

    const draw = () => {
      this.drawSpectrum();
      this.animationId = requestAnimationFrame(draw);
    };

    draw();
  }

  private stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private drawSpectrum(): void {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // Draw spectrum (simplified - will be replaced with real signal processing)
    this.ctx.strokeStyle = '#0f0';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < width; i++) {
      const x = i;
      const noise = Math.random() * 20 - 10;
      const signal = Math.sin(i / 50) * 50;
      const y = height - ((noise + signal + 120) / 40) * height;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  public destroy(): void {
    this.stop();
    eventBus.clear(); // Only clear our listeners
  }
}