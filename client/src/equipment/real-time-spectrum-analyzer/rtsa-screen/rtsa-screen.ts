import { Antenna } from "../../antenna/antenna";
import { RealTimeSpectrumAnalyzer } from "../real-time-spectrum-analyzer";

export abstract class RTSAScreen {
  // Canvas elements
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly antenna: Antenna;
  protected readonly specA: RealTimeSpectrumAnalyzer;

  // Canvas dimensions
  protected width: number = 1600;
  protected height: number = 400;

  constructor(canvas: HTMLCanvasElement, antenna: Antenna, specA: RealTimeSpectrumAnalyzer) {
    this.canvas = canvas;
    this.antenna = antenna;
    this.specA = specA;

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

  protected setupResizeHandler(): void {
    this.resizeHandler = () => {
      if (this.canvas.parentElement) {
        const newWidth = this.canvas.parentElement.offsetWidth - 6;
        if (newWidth !== this.canvas.width) {
          this.resize();
        }
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  // Resize handler
  private resizeHandler: (() => void) | null = null;

  protected resize(): boolean {
    if (!this.canvas.parentElement) return false;

    const newWidth = Math.max(this.canvas.parentElement.offsetWidth - 6, 10);
    const newHeight = Math.max(newWidth, 10); // Square aspect ratio

    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      return true;
    }

    return false;
  }

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