import { RTSAScreen } from '../../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/rtsa-screen';
import { RealTimeSpectrumAnalyzer } from '../../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';

// Concrete implementation of abstract RTSAScreen for testing
class TestableRTSAScreen extends RTSAScreen {
  public resizeCalled = false;

  protected resize(): void {
    this.resizeCalled = true;
  }

  // Expose protected members for testing
  public getCtx(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getSpecA(): RealTimeSpectrumAnalyzer {
    return this.specA;
  }
}

describe('RTSAScreen', () => {
  let canvas: HTMLCanvasElement;
  let mockSpecA: RealTimeSpectrumAnalyzer;
  let screen: TestableRTSAScreen;

  beforeEach(() => {
    // Create a mock canvas with getContext
    canvas = document.createElement('canvas');

    // Create a minimal mock for RealTimeSpectrumAnalyzer
    mockSpecA = {
      state: {
        isPaused: false,
        minAmplitude: -100,
        maxAmplitude: 0,
        span: 100e6,
        rbw: 10e3,
        refreshRate: 10,
        referenceLevel: 0,
        noiseFloorNoGain: -120,
        traces: [
          { isVisible: true, isUpdating: true, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'maxhold' },
          { isVisible: false, isUpdating: false, mode: 'minhold' },
        ],
        selectedTrace: 1,
        isMarkerOn: false,
        isUpdateMarkers: false,
        topMarkers: [],
        markerIndex: 0,
        isSkipLnaGainDuringDraw: false,
      },
      noiseFloorAndGain: -100,
      inputSignals: [],
      rfFrontEnd_: {
        couplerModule: {
          signalPathManager: {
            getTotalRxGain: () => 10,
          },
        },
        lnbModule: {
          getTotalGain: () => 30,
        },
      },
    } as unknown as RealTimeSpectrumAnalyzer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize canvas with default dimensions', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(230);
    });

    it('should initialize canvas with custom dimensions', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA, 1024, 512);

      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(512);
    });

    it('should store canvas reference', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(screen.canvas).toBe(canvas);
    });

    it('should acquire 2D context', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(screen.getCtx()).toBeDefined();
      expect(screen.getCtx()).toBeInstanceOf(CanvasRenderingContext2D);
    });

    it('should throw error if canvas context is unavailable', () => {
      const mockCanvas = {
        getContext: jest.fn().mockReturnValue(null),
        width: 0,
        height: 0,
      } as unknown as HTMLCanvasElement;

      expect(() => new TestableRTSAScreen(mockCanvas, mockSpecA)).toThrow(
        'Failed to get canvas 2D context'
      );
    });

    it('should store specA reference', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(screen.getSpecA()).toBe(mockSpecA);
    });
  });

  describe('width property', () => {
    beforeEach(() => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);
    });

    it('should return initial width', () => {
      expect(screen.width).toBe(800);
    });

    it('should allow setting width', () => {
      screen.width = 1200;

      expect(screen.width).toBe(1200);
    });
  });

  describe('height property', () => {
    beforeEach(() => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);
    });

    it('should return initial height', () => {
      expect(screen.height).toBe(230);
    });

    it('should allow setting height', () => {
      screen.height = 400;

      expect(screen.height).toBe(400);
    });
  });

  describe('resetMaxHold', () => {
    it('should be callable (default implementation does nothing)', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(() => screen.resetMaxHold()).not.toThrow();
    });
  });

  describe('resetMinHold', () => {
    it('should be callable (default implementation does nothing)', () => {
      screen = new TestableRTSAScreen(canvas, mockSpecA);

      expect(() => screen.resetMinHold()).not.toThrow();
    });
  });

  describe('rgb2hex static method', () => {
    it('should convert RGB array to hex string', () => {
      expect(RTSAScreen.rgb2hex([255, 0, 0])).toBe('#ff0000');
      expect(RTSAScreen.rgb2hex([0, 255, 0])).toBe('#00ff00');
      expect(RTSAScreen.rgb2hex([0, 0, 255])).toBe('#0000ff');
    });

    it('should pad single digit hex values with zero', () => {
      expect(RTSAScreen.rgb2hex([0, 0, 0])).toBe('#000000');
      expect(RTSAScreen.rgb2hex([1, 2, 3])).toBe('#010203');
      expect(RTSAScreen.rgb2hex([15, 15, 15])).toBe('#0f0f0f');
    });

    it('should handle white color', () => {
      expect(RTSAScreen.rgb2hex([255, 255, 255])).toBe('#ffffff');
    });

    it('should handle mixed values', () => {
      expect(RTSAScreen.rgb2hex([128, 64, 192])).toBe('#8040c0');
    });
  });

  describe('getRandomRgb static method', () => {
    it('should return valid hex color string', () => {
      const color = RTSAScreen.getRandomRgb(0);

      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should vary color based on index modulo 3 (i % 3 === 0)', () => {
      const color0 = RTSAScreen.getRandomRgb(0);
      const color3 = RTSAScreen.getRandomRgb(3);
      const color6 = RTSAScreen.getRandomRgb(6);

      // All should be valid hex colors
      expect(color0).toMatch(/^#[0-9a-f]{6}$/);
      expect(color3).toMatch(/^#[0-9a-f]{6}$/);
      expect(color6).toMatch(/^#[0-9a-f]{6}$/);

      // i % 3 === 0: rgb[0] = 255 (red channel is max)
      expect(color0.substring(1, 3)).toBe('ff'); // red component
    });

    it('should vary color based on index modulo 3 (i % 3 === 1)', () => {
      const color1 = RTSAScreen.getRandomRgb(1);
      const color4 = RTSAScreen.getRandomRgb(4);

      // All should be valid hex colors
      expect(color1).toMatch(/^#[0-9a-f]{6}$/);
      expect(color4).toMatch(/^#[0-9a-f]{6}$/);

      // i % 3 === 1: rgb[2] = 255 (blue channel is max)
      expect(color1.substring(5, 7)).toBe('ff'); // blue component
    });

    it('should vary color based on index modulo 3 (i % 3 === 2)', () => {
      const color2 = RTSAScreen.getRandomRgb(2);
      const color5 = RTSAScreen.getRandomRgb(5);

      // All should be valid hex colors
      expect(color2).toMatch(/^#[0-9a-f]{6}$/);
      expect(color5).toMatch(/^#[0-9a-f]{6}$/);

      // i % 3 === 2: rgb[1] = 255 (green channel is max)
      expect(color2.substring(3, 5)).toBe('ff'); // green component
    });

    it('should produce different colors for different indices', () => {
      const colors = new Set<string>();
      for (let i = 0; i < 10; i++) {
        colors.add(RTSAScreen.getRandomRgb(i));
      }

      // Should have multiple unique colors (may have some overlap due to modulo)
      expect(colors.size).toBeGreaterThan(1);
    });
  });
});
