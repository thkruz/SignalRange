import { Logger } from "@app/logging/logger";
import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";

export abstract class RTSAScreen {
  // Canvas elements
  readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly specA: RealTimeSpectrumAnalyzer;

  // Canvas dimensions
  protected width_: number = 800; // More width to increase resolution (especially for noise floor)
  protected height_: number = 230;

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer, width = 800, height = 230) {
    this.canvas = canvas;
    this.specA = specA;
    this.width_ = width;
    this.height_ = height;
    this.canvas.width = this.width_;
    this.canvas.height = this.height_;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas 2D context');
    }
    this.ctx = context;
  }

  get width(): number {
    return this.width_;
  }

  get height(): number {
    return this.height_;
  }

  set width(value: number) {
    this.width_ = value;
    Logger.warn('RTSAScreen', 'set width', `Width set to ${value}, resizing canvas`);
  }

  set height(value: number) {
    this.height_ = value;
    Logger.warn('RTSAScreen', 'set height', `Height set to ${value}, resizing canvas`);
  }

  public resetMaxHold(): void {
    // To be implemented by subclasses if needed
  }

  /**
   * Canvas Management
   */

  protected abstract resize(): void;

  /**
   * Static Utility Methods
   */

  public static rgb2hex(rgb: number[]): string {
    return '#' + rgb.map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  public static getRandomRgb(i: number): string {
    let rgb = [255, 0, 0];
    if (i % 3 === 0) {
      rgb[0] = 255;
      rgb[1] = (i * 32) % 255;
      rgb[2] = (i * 64) % 255;
    } else if (i % 3 === 1) {
      rgb[0] = (i * 64) % 255;
      rgb[1] = (i * 32) % 255;
      rgb[2] = 255;
    } else if (i % 3 === 2) {
      rgb[0] = (i * 32) % 255;
      rgb[1] = 255;
      rgb[2] = (i * 64) % 255;
    } else {
      rgb[0] = 255;
      rgb[1] = 255;
      rgb[2] = 255;
    }
    return RTSAScreen.rgb2hex(rgb);
  }
}