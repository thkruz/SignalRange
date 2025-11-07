import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";

export abstract class RTSAScreen {
  // Canvas elements
  readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly specA: RealTimeSpectrumAnalyzer;

  // Canvas dimensions
  protected width: number = 800;
  protected height: number = 400;

  constructor(canvas: HTMLCanvasElement, specA: RealTimeSpectrumAnalyzer) {
    this.canvas = canvas;
    this.specA = specA;
    this.width = canvas.width;
    this.height = canvas.height;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas 2D context');
    }
    this.ctx = context;
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