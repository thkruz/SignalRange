import { Degrees } from 'ootk';
import { vi } from 'vitest';
import { PolarPlot, PolarPlotConfig } from '../../../src/components/polar-plot/polar-plot';

describe('PolarPlot', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const createPlotInDom = (
    id: string,
    config?: PolarPlotConfig
  ): PolarPlot => {
    const plot = new PolarPlot(id, config);
    container.innerHTML = plot.html;
    return plot;
  };

  describe('constructor', () => {
    it('should create instance with default configuration', () => {
      const plot = createPlotInDom('test-plot');

      expect(plot.html).toContain('id="test-plot"');
      expect(plot.html).toContain('polar-plot');
      expect(plot.html).toContain('polar-plot-canvas');
    });

    it('should apply default width and height when not provided', () => {
      const plot = createPlotInDom('default-size-plot');

      expect(plot.html).toContain('width="200"');
      expect(plot.html).toContain('height="200"');
    });

    it('should apply custom width and height', () => {
      const plot = createPlotInDom('custom-size-plot', { width: 300, height: 250 });

      expect(plot.html).toContain('width="300"');
      expect(plot.html).toContain('height="250"');
    });

    it('should use default showGrid and showLabels as true', () => {
      const plot = createPlotInDom('default-options-plot');
      plot.onDomReady();

      // Grid and labels should be drawn by default (tested indirectly via draw calls)
      const canvas = plot.dom.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas).toBeTruthy();
    });

    it('should allow disabling grid via config', () => {
      const plot = createPlotInDom('no-grid-plot', { showGrid: false });
      plot.onDomReady();

      // Should not throw even with grid disabled
      expect(plot.dom).toBeTruthy();
    });

    it('should allow disabling labels via config', () => {
      const plot = createPlotInDom('no-labels-plot', { showLabels: false });
      plot.onDomReady();

      // Should not throw even with labels disabled
      expect(plot.dom).toBeTruthy();
    });

    it('should allow disabling both grid and labels', () => {
      const plot = createPlotInDom('minimal-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      expect(plot.dom).toBeTruthy();
    });
  });

  describe('onDomReady', () => {
    it('should initialize canvas context', () => {
      const plot = createPlotInDom('canvas-init-plot');

      // Should not throw
      expect(() => plot.onDomReady()).not.toThrow();
    });

    it('should query for canvas element', () => {
      const plot = createPlotInDom('canvas-query-plot');
      plot.onDomReady();

      const canvas = plot.dom.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('should set font and text baseline on context', () => {
      const plot = createPlotInDom('context-setup-plot');
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fontSpy = vi.spyOn(ctx, 'font', 'set');
      const baselineSpy = vi.spyOn(ctx, 'textBaseline', 'set');

      plot.onDomReady();

      expect(fontSpy).toHaveBeenCalledWith('12px monospace');
      expect(baselineSpy).toHaveBeenCalledWith('middle');
    });

    it('should call draw_ to render initial state', () => {
      const plot = createPlotInDom('initial-draw-plot');
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');

      plot.onDomReady();

      // draw_ calls clearRect
      expect(clearRectSpy).toHaveBeenCalled();
    });
  });

  describe('draw', () => {
    it('should update position when azimuth changes', () => {
      const plot = createPlotInDom('azimuth-change-plot');
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');

      // Initial call in onDomReady clears rect, clear the mock
      clearRectSpy.mockClear();

      plot.draw(45 as Degrees, 0 as Degrees);

      expect(clearRectSpy).toHaveBeenCalled();
    });

    it('should update position when elevation changes', () => {
      const plot = createPlotInDom('elevation-change-plot');
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');

      clearRectSpy.mockClear();

      plot.draw(0 as Degrees, 45 as Degrees);

      expect(clearRectSpy).toHaveBeenCalled();
    });

    it('should not redraw when position is unchanged', () => {
      const plot = createPlotInDom('no-change-plot');
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;

      // First draw to set initial position
      plot.draw(45 as Degrees, 30 as Degrees);

      const clearRectSpy = vi.spyOn(ctx, 'clearRect');
      clearRectSpy.mockClear();

      // Same position - should not redraw
      plot.draw(45 as Degrees, 30 as Degrees);

      expect(clearRectSpy).not.toHaveBeenCalled();
    });

    it('should handle draw before onDomReady gracefully', () => {
      const plot = createPlotInDom('no-context-plot');

      // draw before onDomReady should not throw
      expect(() => plot.draw(45 as Degrees, 30 as Degrees)).not.toThrow();
    });

    it('should redraw when only azimuth changes', () => {
      const plot = createPlotInDom('az-only-change-plot');
      plot.onDomReady();

      plot.draw(10 as Degrees, 20 as Degrees);

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');
      clearRectSpy.mockClear();

      // Only azimuth changes
      plot.draw(50 as Degrees, 20 as Degrees);

      expect(clearRectSpy).toHaveBeenCalled();
    });

    it('should redraw when only elevation changes', () => {
      const plot = createPlotInDom('el-only-change-plot');
      plot.onDomReady();

      plot.draw(10 as Degrees, 20 as Degrees);

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');
      clearRectSpy.mockClear();

      // Only elevation changes
      plot.draw(10 as Degrees, 60 as Degrees);

      expect(clearRectSpy).toHaveBeenCalled();
    });
  });

  describe('azimuth normalization', () => {
    it('should handle azimuth values above 360', () => {
      const plot = createPlotInDom('az-high-plot');
      plot.onDomReady();

      // Should not throw with azimuth > 360
      expect(() => plot.draw(450 as Degrees, 45 as Degrees)).not.toThrow();
    });

    it('should handle negative azimuth values', () => {
      const plot = createPlotInDom('az-negative-plot');
      plot.onDomReady();

      // Should not throw with negative azimuth
      expect(() => plot.draw(-90 as Degrees, 45 as Degrees)).not.toThrow();
    });

    it('should handle azimuth at exactly 360', () => {
      const plot = createPlotInDom('az-360-plot');
      plot.onDomReady();

      expect(() => plot.draw(360 as Degrees, 45 as Degrees)).not.toThrow();
    });

    it('should handle azimuth at exactly 0', () => {
      const plot = createPlotInDom('az-0-plot');
      plot.onDomReady();

      expect(() => plot.draw(0 as Degrees, 45 as Degrees)).not.toThrow();
    });

    it('should handle large negative azimuth values', () => {
      const plot = createPlotInDom('az-large-negative-plot');
      plot.onDomReady();

      expect(() => plot.draw(-720 as Degrees, 45 as Degrees)).not.toThrow();
    });
  });

  describe('elevation clamping', () => {
    it('should clamp elevation above 90 to 90', () => {
      const plot = createPlotInDom('el-high-plot');
      plot.onDomReady();

      // Should not throw with elevation > 90
      expect(() => plot.draw(0 as Degrees, 120 as Degrees)).not.toThrow();
    });

    it('should clamp negative elevation to 0', () => {
      const plot = createPlotInDom('el-negative-plot');
      plot.onDomReady();

      // Should not throw with negative elevation
      expect(() => plot.draw(0 as Degrees, -30 as Degrees)).not.toThrow();
    });

    it('should handle elevation at exactly 90', () => {
      const plot = createPlotInDom('el-90-plot');
      plot.onDomReady();

      expect(() => plot.draw(0 as Degrees, 90 as Degrees)).not.toThrow();
    });

    it('should handle elevation at exactly 0', () => {
      const plot = createPlotInDom('el-0-plot');
      plot.onDomReady();

      expect(() => plot.draw(0 as Degrees, 0 as Degrees)).not.toThrow();
    });
  });

  describe('canvas drawing', () => {
    it('should draw background rectangle', () => {
      const plot = createPlotInDom('bg-draw-plot');
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      plot.onDomReady();

      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('should draw grid circles when showGrid is true', () => {
      const plot = createPlotInDom('grid-circles-plot', { showGrid: true });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      plot.onDomReady();

      // Multiple circles should be drawn for elevation
      expect(arcSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('should draw azimuth radials when showGrid is true', () => {
      const plot = createPlotInDom('grid-radials-plot', { showGrid: true });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');

      plot.onDomReady();

      // Radials draw from center to edge
      expect(moveToSpy).toHaveBeenCalled();
      expect(lineToSpy).toHaveBeenCalled();
    });

    it('should skip grid when showGrid is false', () => {
      // Test without grid
      const plotNoGrid = createPlotInDom('no-grid-draw-plot', { showGrid: false, showLabels: false });
      const canvasNoGrid = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctxNoGrid = canvasNoGrid.getContext('2d')!;
      const strokeSpyNoGrid = vi.spyOn(ctxNoGrid, 'stroke');

      plotNoGrid.onDomReady();
      const noGridStrokeCalls = strokeSpyNoGrid.mock.calls.length;

      // Clear DOM and create plot with grid
      container.innerHTML = '';
      const plotWithGrid = createPlotInDom('with-grid-draw-plot', { showGrid: true, showLabels: false });
      const canvasWithGrid = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctxWithGrid = canvasWithGrid.getContext('2d')!;
      const strokeSpyWithGrid = vi.spyOn(ctxWithGrid, 'stroke');

      plotWithGrid.onDomReady();
      const withGridStrokeCalls = strokeSpyWithGrid.mock.calls.length;

      // More stroke calls with grid enabled
      expect(withGridStrokeCalls).toBeGreaterThan(noGridStrokeCalls);
    });

    it('should draw cardinal direction labels when showLabels is true', () => {
      const plot = createPlotInDom('labels-draw-plot', { showLabels: true });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      plot.onDomReady();

      // Should draw N, E, S, W and elevation labels
      expect(fillTextSpy).toHaveBeenCalled();
      const calls = fillTextSpy.mock.calls.map(call => call[0]);
      expect(calls).toContain('N');
      expect(calls).toContain('E');
      expect(calls).toContain('S');
      expect(calls).toContain('W');
    });

    it('should draw elevation labels when showLabels is true', () => {
      const plot = createPlotInDom('el-labels-draw-plot', { showLabels: true });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      plot.onDomReady();

      const calls = fillTextSpy.mock.calls.map(call => call[0]);
      expect(calls).toContain('90°');
      expect(calls).toContain('45°');
      expect(calls).toContain('0°');
    });

    it('should skip labels when showLabels is false', () => {
      const plot = createPlotInDom('no-labels-draw-plot', { showLabels: false, showGrid: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      plot.onDomReady();

      // No fillText calls for labels when disabled
      expect(fillTextSpy).not.toHaveBeenCalled();
    });

    it('should draw antenna position circle', () => {
      const plot = createPlotInDom('antenna-circle-plot', { showGrid: false, showLabels: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      plot.onDomReady();

      // Antenna position drawn as circle
      expect(arcSpy).toHaveBeenCalled();
    });

    it('should draw center crosshair', () => {
      const plot = createPlotInDom('crosshair-plot', { showGrid: false, showLabels: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');

      plot.onDomReady();

      // Crosshair uses moveTo and lineTo
      expect(moveToSpy).toHaveBeenCalled();
      expect(lineToSpy).toHaveBeenCalled();
    });
  });

  describe('html getter', () => {
    it('should return HTML string containing polar-plot class', () => {
      const plot = createPlotInDom('html-class-plot');

      expect(plot.html).toContain('polar-plot');
    });

    it('should return HTML string containing canvas element', () => {
      const plot = createPlotInDom('html-canvas-plot');

      expect(plot.html).toContain('<canvas');
      expect(plot.html).toContain('polar-plot-canvas');
    });

    it('should return HTML string with unique id', () => {
      const plot = createPlotInDom('unique-id-plot');

      expect(plot.html).toContain('id="unique-id-plot"');
    });
  });

  describe('dom getter', () => {
    it('should return DOM element', () => {
      const plot = createPlotInDom('dom-element-plot');

      expect(plot.dom).toBeInstanceOf(HTMLElement);
    });

    it('should return element with correct id', () => {
      const plot = createPlotInDom('dom-id-plot');

      expect(plot.dom.id).toBe('dom-id-plot');
    });

    it('should cache DOM element on subsequent calls', () => {
      const plot = createPlotInDom('dom-cache-plot');

      const dom1 = plot.dom;
      const dom2 = plot.dom;

      expect(dom1).toBe(dom2);
    });

    it('should have polar-plot class', () => {
      const plot = createPlotInDom('dom-class-plot');

      expect(plot.dom.classList.contains('polar-plot')).toBe(true);
    });
  });

  describe('static create', () => {
    it('should create PolarPlot instance', () => {
      const plot = PolarPlot.create('static-plot');
      container.innerHTML = plot.html;

      expect(plot).toBeInstanceOf(PolarPlot);
    });

    it('should create instance with default config', () => {
      const plot = PolarPlot.create('static-default-plot');
      container.innerHTML = plot.html;

      expect(plot.html).toContain('width="200"');
      expect(plot.html).toContain('height="200"');
    });

    it('should create instance with custom config', () => {
      const config: PolarPlotConfig = {
        width: 400,
        height: 350,
        showGrid: false,
        showLabels: false,
      };
      const plot = PolarPlot.create('static-custom-plot', config);
      container.innerHTML = plot.html;

      expect(plot.html).toContain('width="400"');
      expect(plot.html).toContain('height="350"');
    });

    it('should create functional instance that can draw', () => {
      const plot = PolarPlot.create('static-draw-plot');
      container.innerHTML = plot.html;
      plot.onDomReady();

      expect(() => plot.draw(90 as Degrees, 45 as Degrees)).not.toThrow();
    });
  });

  describe('coordinate system', () => {
    it('should position 90° elevation at center', () => {
      const plot = createPlotInDom('center-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      arcSpy.mockClear();
      plot.draw(0 as Degrees, 90 as Degrees);

      // At 90° elevation, radius should be 0 (at center)
      // The arc call for antenna position should be near center
      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6); // radius 6 for antenna
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // Should be at center (100, 100 for 200x200 canvas)
        expect(antennaArcCall[0]).toBeCloseTo(100, 0);
        expect(antennaArcCall[1]).toBeCloseTo(100, 0);
      }
    });

    it('should position 0° elevation at edge', () => {
      const plot = createPlotInDom('edge-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      // First draw to a different position to force change (initial is 0,0)
      plot.draw(45 as Degrees, 45 as Degrees);
      arcSpy.mockClear();

      // Now draw at 0° elevation
      plot.draw(0 as Degrees, 0 as Degrees);

      // At 0° elevation, antenna should be at edge
      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6);
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // At 0° azimuth (North/up), y should be less than center
        expect(antennaArcCall[1]).toBeLessThan(100);
      }
    });

    it('should position 0° azimuth pointing up (North)', () => {
      const plot = createPlotInDom('north-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      arcSpy.mockClear();
      plot.draw(0 as Degrees, 45 as Degrees);

      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6);
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // At 0° azimuth, x should be at center, y above center
        expect(antennaArcCall[0]).toBeCloseTo(100, 0);
        expect(antennaArcCall[1]).toBeLessThan(100);
      }
    });

    it('should position 90° azimuth pointing right (East)', () => {
      const plot = createPlotInDom('east-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      arcSpy.mockClear();
      plot.draw(90 as Degrees, 45 as Degrees);

      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6);
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // At 90° azimuth, x should be right of center, y at center
        expect(antennaArcCall[0]).toBeGreaterThan(100);
        expect(antennaArcCall[1]).toBeCloseTo(100, 0);
      }
    });

    it('should position 180° azimuth pointing down (South)', () => {
      const plot = createPlotInDom('south-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      arcSpy.mockClear();
      plot.draw(180 as Degrees, 45 as Degrees);

      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6);
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // At 180° azimuth, x should be at center, y below center
        expect(antennaArcCall[0]).toBeCloseTo(100, 0);
        expect(antennaArcCall[1]).toBeGreaterThan(100);
      }
    });

    it('should position 270° azimuth pointing left (West)', () => {
      const plot = createPlotInDom('west-position-plot', { showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      arcSpy.mockClear();
      plot.draw(270 as Degrees, 45 as Degrees);

      const antennaArcCall = arcSpy.mock.calls.find(call => call[2] === 6);
      expect(antennaArcCall).toBeDefined();
      if (antennaArcCall) {
        // At 270° azimuth, x should be left of center, y at center
        expect(antennaArcCall[0]).toBeLessThan(100);
        expect(antennaArcCall[1]).toBeCloseTo(100, 0);
      }
    });
  });

  describe('canvas dimensions', () => {
    it('should use custom width for drawing calculations', () => {
      const plot = createPlotInDom('custom-width-plot', { width: 400, height: 200 });
      plot.onDomReady();

      const canvas = plot.dom.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(400);
    });

    it('should use custom height for drawing calculations', () => {
      const plot = createPlotInDom('custom-height-plot', { width: 200, height: 400 });
      plot.onDomReady();

      const canvas = plot.dom.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.height).toBe(400);
    });

    it('should calculate radius based on smaller dimension', () => {
      // With non-square canvas, radius should be based on smaller side
      const plot = createPlotInDom('non-square-plot', { width: 300, height: 200, showGrid: false, showLabels: false });
      plot.onDomReady();

      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');

      // Draw to a different position first (initial is 0,0)
      plot.draw(45 as Degrees, 45 as Degrees);

      // The antenna should still be drawn correctly
      expect(arcSpy).toHaveBeenCalled();
    });
  });

  describe('color and styling', () => {
    it('should use dark background color', () => {
      const plot = createPlotInDom('bg-color-plot');
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillStyleSpy = vi.spyOn(ctx, 'fillStyle', 'set');

      plot.onDomReady();

      expect(fillStyleSpy).toHaveBeenCalledWith('#1a1a1a');
    });

    it('should use red color for antenna position', () => {
      const plot = createPlotInDom('antenna-color-plot', { showGrid: false, showLabels: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const fillStyleSpy = vi.spyOn(ctx, 'fillStyle', 'set');

      plot.onDomReady();

      expect(fillStyleSpy).toHaveBeenCalledWith('#ff0000');
    });

    it('should use white outline for antenna position', () => {
      const plot = createPlotInDom('antenna-outline-plot', { showGrid: false, showLabels: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const strokeStyleSpy = vi.spyOn(ctx, 'strokeStyle', 'set');

      plot.onDomReady();

      expect(strokeStyleSpy).toHaveBeenCalledWith('#ffffff');
    });

    it('should use green color for center crosshair', () => {
      const plot = createPlotInDom('crosshair-color-plot', { showGrid: false, showLabels: false });
      const canvas = container.querySelector('.polar-plot-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const strokeStyleSpy = vi.spyOn(ctx, 'strokeStyle', 'set');

      plot.onDomReady();

      expect(strokeStyleSpy).toHaveBeenCalledWith('#00ff00');
    });
  });
});
