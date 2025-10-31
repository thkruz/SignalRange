import { Events } from '../../events/event-bus';
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './spectrum-analyzer.css';

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

interface Signal {
  freq: number;
  bw: number;
  amp: number;
  target_id: number;
  rf?: boolean;
  feed?: string;
  power?: number;
  modulation?: string;
  fec?: string;
}

/**
 * SpectrumAnalyzer - Single analyzer unit
 * Manages its own state, canvas rendering, and signal processing
 * Extends Equipment base class for standard lifecycle
 */
export class SpectrumAnalyzer extends Equipment {
  // Canvas elements
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // State
  private readonly config: SpectrumAnalyzerConfig;
  private isRfMode: boolean = false;
  private isPaused: boolean = false;
  private isDrawHold: boolean = false;
  private isDrawMarker: boolean = false;
  private isShowSignals: boolean = false;

  // Canvas dimensions
  private width: number = 600;
  private height: number = 400;

  // Animation
  private animationId: number | null = null;
  private running: boolean = false;
  private refreshRate: number = 10; // FPS
  private lastDrawTime: number = 0;

  // Signal processing
  private data: Float32Array;
  private noiseData: Float32Array;
  private maxHoldData: Float32Array;
  private signals: Signal[] = [];

  // Frequency management
  private minFreq: number = 420e6; // Hz
  private maxFreq: number = 450e6; // Hz
  private bw: number = 30e6; // Hz
  private centerFreq: number = 435e6; // Hz

  // Decibel management
  private minDecibels: number = -120;
  private maxDecibels: number = -20;
  private decibelShift: number = 120; // Shift to make 0 the min
  private range: number = -100; // maxDecibels - minDecibels
  private noiseFloor: number = 5;

  // Antenna and satellite
  private antenna_id: number = 1;
  private target_id: number | null = null;
  private antennaOffset: number = 0;
  private targetOffset: number = 400e6;
  private upconvertOffset: number = 3350e6; // C Band default
  private downconvertOffset: number = 3500e6; // C Band default
  private hpa: boolean = false;
  private loopback: boolean = false;
  private locked: boolean = false;
  private operational: boolean = false;

  // Colors
  private noiseColor: string = '#0bf';

  // Resize handler reference
  private resizeHandler: (() => void) | null = null;

  constructor(parentId: string, unit: number, teamId: number = 1, antennaId: number = 1) {
    super(parentId, unit, teamId);

    this.antenna_id = antennaId;

    // Initialize config
    this.config = {
      unit: this.unit,
      team_id: this.teamId,
      antenna_id: this.antenna_id,
      rf: false,
      frequency: 4700, // MHz
      span: 100, // MHz
      hold: false,
      minDecibels: this.minDecibels,
      maxDecibels: this.maxDecibels,
      noiseFloor: this.noiseFloor,
    };

    // Initialize typed arrays
    this.data = new Float32Array(this.width);
    this.noiseData = new Float32Array(this.width);
    this.maxHoldData = new Float32Array(this.width);

    // Calculate range
    this.range = this.minDecibels - this.maxDecibels;
    this.bw = this.maxFreq - this.minFreq;
    this.centerFreq = this.minFreq + this.bw / 2;

    this.build();
  }

  protected loadCSS(): void {
    // CSS is imported at the top of the file
  }

  protected render(): void {
    this.element.innerHTML = html`
      <div class="spectrum-analyzer-box">
        <div class="spec-a-header">
          <div class="spec-a-title">Spectrum Analyzer ${this.unit}</div>
          <div class="spec-a-span">Span: ${this.config.span} MHz</div>
        </div>

        <div class="spec-a-canvas-container">
          <canvas id="specA${this.unit}" width="${this.width}" height="${this.height}"></canvas>
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
      // Initial resize to fit container
      this.resize();
    }
  }

  protected addListeners(): void {
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
    this.on(Events.ANTENNA_FREQUENCY_CHANGED, (data) => {
      if (data.antennaId === this.config.antenna_id) {
        this.updateFrequency(data.frequency);
      }
    });

    // Window resize handler
    this.resizeHandler = () => {
      if (this.canvas && this.canvas.parentElement) {
        const newWidth = this.canvas.parentElement.offsetWidth - 6;
        if (newWidth !== this.canvas.width) {
          this.resize();
        }
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  protected initialize(): void {
    this.start();
  }

  protected removeListeners(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  /**
   * Public API Methods
   */

  public update(data: any): void {
    // Update configuration from external source
    if (data.signals) this.signals = data.signals;
    if (data.target_id !== undefined) this.target_id = data.target_id;
    if (data.locked !== undefined) this.locked = data.locked;
    if (data.operational !== undefined) this.operational = data.operational;
    if (data.hpa !== undefined) this.hpa = data.hpa;
    if (data.loopback !== undefined) this.loopback = data.loopback;
    if (data.antennaOffset !== undefined) this.antennaOffset = data.antennaOffset;
  }

  public getConfig(): SpectrumAnalyzerConfig {
    return { ...this.config };
  }

  public changeCenterFreq(freq: number): void {
    this.centerFreq = freq;
    this.minFreq = freq - this.bw / 2;
    this.maxFreq = freq + this.bw / 2;
    this.config.frequency = freq / 1e6; // Convert to MHz for display

    this.updateDisplay();
  }

  public changeBandwidth(freqSpan: number): void {
    this.bw = freqSpan;
    this.minFreq = this.centerFreq - this.bw / 2;
    this.maxFreq = this.centerFreq + this.bw / 2;
    this.config.span = freqSpan / 1e6; // Convert to MHz for display

    this.updateDisplay();
  }

  public resetHoldData(): void {
    this.maxHoldData = new Float32Array(this.width);
  }

  public setBand(band: string): void {
    const freqBandInfo = SpectrumAnalyzer.getFreqBandInfo(band);
    this.minFreq = freqBandInfo.minFreq;
    this.maxFreq = freqBandInfo.maxFreq;
    this.bw = this.maxFreq - this.minFreq;
    this.centerFreq = this.minFreq + this.bw / 2;

    // Update offsets based on band
    if (band === 'c') {
      this.upconvertOffset = 3350e6;
      this.downconvertOffset = 3500e6;
    } else if (band === 'ku') {
      this.upconvertOffset = 12750e6;
      this.downconvertOffset = 10950e6;
    }
  }

  /**
   * Private Methods
   */

  private openConfig(): void {
    this.emit(Events.SPEC_A_CONFIG_CHANGED, { unit: this.unit });
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

    this.emit(Events.SPEC_A_MODE_CHANGED, {
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
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // Update header span
    const spanEl = qs('.spec-a-span', this.element);
    if (spanEl) {
      spanEl.textContent = `Span: ${this.config.span} MHz`;
    }

    // Update info display
    const infoEl = qs('.spec-a-info', this.element);
    if (infoEl) {
      infoEl.innerHTML = html`
        <div>CF: ${this.config.frequency} MHz</div>
        <div>Ant: ${this.config.antenna_id}</div>
      `;
    }
  }

  /**
   * Animation Methods
   */

  private start(): void {
    if (this.running) return;
    this.running = true;

    // Start after a random delay to stagger multiple analyzers
    setTimeout(() => {
      this.draw();
    }, Math.random() * 1000);
  }

  private stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.running = false;
  }

  private draw(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  private animate(): void {
    if (!this.isPaused && this.running) {
      const now = Date.now();
      if (now - this.lastDrawTime > 1000 / this.refreshRate) {
        this.clearCanvas(this.ctx!);
        if (this.ctx) {
          this.ctx.globalAlpha = 1.0;
        }

        // Create and draw noise
        this.noiseData = this.createNoise(this.noiseData);
        this.drawNoise(this.ctx!);

        // Draw signals
        this.signals
          .filter((signal) => signal.target_id === this.target_id)
          .forEach((signal, i) => {
            let color = this.noiseColor;
            if (!this.locked || !this.operational) return;
            if (this.isShowSignals) {
              color = SpectrumAnalyzer.getRandomRgb(i);
            }

            // Process signal based on RF/IF mode
            if (signal.rf) {
              // Instructor mode - signal is already in RF
              const rfDownSignal = { ...signal };
              const ifDownSignal = { ...signal, freq: signal.freq - this.downconvertOffset };

              if (!this.isRfMode) {
                this.drawSignal(this.ctx!, color, ifDownSignal);
              } else {
                this.drawSignal(this.ctx!, color, rfDownSignal);
              }
            } else {
              // Student mode - signal is in IF, needs upconversion
              if (!this.isRfMode) {
                // Draw IF signals
                const ifUpSignal = signal;
                const ifDownSignal = {
                  ...signal,
                  freq: signal.freq + this.upconvertOffset - this.downconvertOffset,
                };
                ifDownSignal.freq += this.loopback ? +this.antennaOffset : this.targetOffset;
                ifDownSignal.amp = !this.loopback && !this.hpa ? -1000 : ifDownSignal.amp;

                this.drawSignal(this.ctx!, color, ifUpSignal);
                this.drawSignal(this.ctx!, color, ifDownSignal);
              } else {
                // Draw RF signals
                const rfUpSignal = { ...signal, freq: signal.freq + this.upconvertOffset };
                const rfDownSignal = { ...signal, freq: signal.freq + this.upconvertOffset };
                rfDownSignal.freq += this.loopback ? +this.antennaOffset : this.targetOffset;
                rfDownSignal.amp = !this.loopback && !this.hpa ? -1000 : rfDownSignal.amp;

                this.drawSignal(this.ctx!, color, rfUpSignal);
                this.drawSignal(this.ctx!, color, rfDownSignal);
              }
            }
          });

        // Draw max hold if enabled
        if (this.isDrawHold) {
          this.drawMaxHold(this.ctx!);
        }

        // Hide below noise floor
        this.hideBelowNoiseFloor(this.ctx!);

        // Draw grid overlay
        this.drawGridOverlay(this.ctx!);

        this.lastDrawTime = now;
      }
    }

    // Continue animation loop
    this.draw();
  }

  /**
   * Canvas Drawing Methods
   */

  private clearCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = 'white';

    // Vertical lines
    for (let x = 0; x < this.width; x += this.width / 10) {
      ctx.fillRect(x, 0, 1, this.height);
    }

    // Horizontal lines
    for (let y = 0; y < this.height; y += this.height / 10) {
      ctx.fillRect(0, y, this.width, 1);
    }

    ctx.globalAlpha = 1.0;
  }

  private drawNoise(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.noiseColor;
    ctx.beginPath();

    for (let x = 0, len = this.noiseData.length; x < len; x++) {
      const y = (this.noiseData[x] - this.maxDecibels - this.decibelShift) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();
  }

  private hideBelowNoiseFloor(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.fillStyle = '#000';
    ctx.moveTo(0, this.height);

    for (let x = 0; x < this.width; x++) {
      const y = (this.noiseData[x] - this.maxDecibels - this.decibelShift) / this.range;
      ctx.lineTo(x, this.height * y);
    }

    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  private drawSignal(ctx: CanvasRenderingContext2D, color: string, signal: Signal): void {
    const center = ((signal.freq - this.minFreq) / (this.maxFreq - this.minFreq)) * this.width;
    const inBandWidth = ((signal.bw / (this.maxFreq - this.minFreq)) * this.width) / 2;
    const outOfBandWidth = ((signal.bw / (this.maxFreq - this.minFreq)) * this.width) / 1.8;

    this.data = this.createSignal(this.data, center, signal.amp, inBandWidth, outOfBandWidth);

    let maxX = 0;
    let maxY = 1;
    let maxSignalFreq = 0;

    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.data.length;
    for (let x = 0; x < len; x++) {
      const lowestSignal = this.data[x] >= this.noiseData[x] ? this.data[x] : 0;
      const y = (lowestSignal - this.maxDecibels - this.decibelShift) / this.range;

      maxSignalFreq = y < maxY ? lowestSignal : maxSignalFreq;
      maxX = y < maxY ? x : maxX;
      maxY = y < maxY ? y : maxY;

      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();

    // Draw marker if enabled
    if (this.isDrawMarker) {
      this.drawMarker(maxX, maxY, ctx, maxSignalFreq);
    }
  }

  private drawMarker(maxX: number, maxY: number, ctx: CanvasRenderingContext2D, maxSignalFreq: number): void {
    if (maxX > 0) {
      maxY -= 0.025;

      // Draw diamond marker
      ctx.beginPath();
      ctx.fillStyle = '#f00';
      ctx.moveTo(maxX, this.height * maxY);
      ctx.lineTo(maxX - 5, this.height * maxY - 5);
      ctx.lineTo(maxX, this.height * maxY - 10);
      ctx.lineTo(maxX + 5, this.height * maxY - 5);
      ctx.lineTo(maxX, this.height * maxY);
      ctx.fill();

      // Draw frequency label
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      const freq = (this.minFreq + (maxX * (this.maxFreq - this.minFreq)) / this.width) / 1e6;
      ctx.fillText(`${freq.toFixed(1)} MHz`, maxX - 20, this.height * maxY - 30);
      ctx.fillText(`${(maxSignalFreq + this.minDecibels).toFixed(1)} dB`, maxX - 20, this.height * maxY - 20);
    }
  }

  private drawMaxHold(ctx: CanvasRenderingContext2D, color: string = '#ff0'): void {
    ctx.strokeStyle = color;
    ctx.beginPath();

    const len = this.data.length;
    for (let x = 0; x < len; x++) {
      const y = (this.maxHoldData[x] - this.maxDecibels - this.decibelShift) / this.range;
      if (x === 0) {
        ctx.moveTo(x, this.height * y);
      } else {
        ctx.lineTo(x, this.height * y);
      }
    }

    ctx.stroke();
  }

  /**
   * Signal Processing Methods
   */

  private createNoise(data: Float32Array): Float32Array {
    for (let x = 0; x < data.length; x++) {
      data[x] = (0.5 + (5 * Math.random()) / 10) * (this.noiseFloor + this.decibelShift);

      // Random spikes
      if (Math.random() > 0.999) {
        data[x] *= 1 + Math.random();
      }

      // Update max hold
      if (this.maxHoldData[x] < data[x]) {
        this.maxHoldData[x] = data[x];
      }
    }

    return data;
  }

  private createSignal(
    data: Float32Array,
    center: number,
    amplitude: number,
    inBandWidth: number,
    outOfBandWidth: number
  ): Float32Array {
    for (let x = 0; x < data.length; x++) {
      let y = 0;

      // Check if we're within the signal bandwidth
      if (x > center - outOfBandWidth && x < center + outOfBandWidth) {
        y = (0.75 + Math.random() / 4) * (amplitude + this.decibelShift);
      }

      // Simulate drop near edge of band (multiple stages for realistic rolloff)
      if (x < center - inBandWidth * 0.5) {
        if (Math.random() < 0.95) {
          const distanceFromCenter = Math.abs(x - center - inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth / 1.5, 6.5 + Math.random());
        }
      } else if (x > center + inBandWidth * 0.5) {
        if (Math.random() < 0.95) {
          const distanceFromCenter = Math.abs(x - center + inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth / 1.5, 6.5 + Math.random());
        }
      }

      if (x < center - inBandWidth * 0.75) {
        if (Math.random() < 0.93) {
          const distanceFromCenter = Math.abs(x - center - inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth, 1.5 + Math.random());
        }
      } else if (x > center + inBandWidth * 0.75) {
        if (Math.random() < 0.93) {
          const distanceFromCenter = Math.abs(x - center + inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth, 1.5 + Math.random());
        }
      }

      if (x < center - inBandWidth * 0.9) {
        if (Math.random() < 0.9) {
          const distanceFromCenter = Math.abs(x - center - inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth, 2.5 + Math.random());
        }
      } else if (x > center + inBandWidth * 0.9) {
        if (Math.random() < 0.9) {
          const distanceFromCenter = Math.abs(x - center + inBandWidth);
          y -= Math.pow(distanceFromCenter / inBandWidth, 2.5 + Math.random());
        }
      }

      // Zero out signal far outside the band
      if (x > center + outOfBandWidth || x < center - outOfBandWidth) {
        y = 0;
      } else {
        // Handle out-of-band regions
        if (x < center - inBandWidth) {
          y = 0;
        } else if (x > center + inBandWidth) {
          y = 0;
        }
      }

      // Update max hold
      if (this.maxHoldData[x] < y) {
        this.maxHoldData[x] = y;
      }

      // Update noise floor
      if (this.noiseData[x] < y) {
        this.noiseData[x] = y;
      }

      data[x] = y > 0 ? y : 0;
    }

    return data;
  }

  /**
   * Canvas Management
   */

  private resize(): void {
    if (!this.canvas || !this.canvas.parentElement) return;

    const newWidth = Math.max(this.canvas.parentElement.offsetWidth - 6, 10);
    const newHeight = Math.max(newWidth, 10); // Square aspect ratio

    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;

      // Reallocate typed arrays
      this.data = new Float32Array(this.width);
      this.noiseData = new Float32Array(this.width);
      this.maxHoldData = new Float32Array(this.width);
    }
  }

  /**
   * Static Utility Methods
   */

  public static getFreqBandInfo(band: string): { minFreq: number; maxFreq: number } {
    const freqBands: Record<string, { minFreq: number; maxFreq: number }> = {
      hf: { minFreq: 3e6, maxFreq: 30e6 },
      vhf: { minFreq: 30e6, maxFreq: 300e6 },
      uhf: { minFreq: 300e6, maxFreq: 3e9 },
      l: { minFreq: 1e9, maxFreq: 2e9 },
      s: { minFreq: 2e9, maxFreq: 4e9 },
      c: { minFreq: 4e9, maxFreq: 8e9 },
      x: { minFreq: 8e9, maxFreq: 12e9 },
      ku: { minFreq: 12e9, maxFreq: 18e9 },
      k: { minFreq: 18e9, maxFreq: 27e9 },
      ka: { minFreq: 27e9, maxFreq: 40e9 },
    };

    if (!freqBands[band]) {
      throw new Error(`Invalid frequency band: ${band}`);
    }

    return freqBands[band];
  }

  public static rgb2hex(rgb: number[]): string {
    return '#' + rgb.map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  public static getRandomRgb(seed?: number): string {
    // Generate consistent colors based on seed
    if (seed !== undefined) {
      const hue = (seed * 137.508) % 360; // Golden angle for good color distribution
      return `hsl(${hue}, 70%, 50%)`;
    }

    // Random color
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return SpectrumAnalyzer.rgb2hex([r, g, b]);
  }

  /**
   * Cleanup
   */

  public destroy(): void {
    this.stop();
    super.destroy();
  }
}