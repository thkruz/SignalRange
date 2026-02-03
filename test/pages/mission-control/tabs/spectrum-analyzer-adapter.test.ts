import { Mocked, vi } from 'vitest';
import { RealTimeSpectrumAnalyzer } from '../../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumAnalyzerAdapter } from '../../../../src/pages/mission-control/tabs/spectrum-analyzer-adapter';

describe('SpectrumAnalyzerAdapter', () => {
  let mockSpectrumAnalyzer: Mocked<RealTimeSpectrumAnalyzer>;
  let containerEl: HTMLElement;
  let adapter: SpectrumAnalyzerAdapter;
  let mockCanvas: HTMLCanvasElement;
  let mockSpectralCanvas: HTMLCanvasElement;
  let mockWaterfallCanvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock canvas elements
    mockCanvas = document.createElement('canvas');
    mockCanvas.id = 'main-canvas';
    mockSpectralCanvas = document.createElement('canvas');
    mockSpectralCanvas.id = 'spectral-canvas';
    mockWaterfallCanvas = document.createElement('canvas');
    mockWaterfallCanvas.id = 'waterfall-canvas';

    // Setup mock RealTimeSpectrumAnalyzer
    mockSpectrumAnalyzer = {
      getCanvas: vi.fn().mockReturnValue(mockCanvas),
      getSpectralCanvas: vi.fn().mockReturnValue(mockSpectralCanvas),
      getWaterfallCanvas: vi.fn().mockReturnValue(mockWaterfallCanvas),
    } as unknown as Mocked<RealTimeSpectrumAnalyzer>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="spec-analyzer-canvas-container">
        <p>Placeholder content</p>
      </div>
    `;
    document.body.appendChild(containerEl);

    adapter = new SpectrumAnalyzerAdapter(mockSpectrumAnalyzer, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(SpectrumAnalyzerAdapter);
    });

    it('should embed canvases into container', () => {
      const container = containerEl.querySelector('#spec-analyzer-canvas-container');

      expect(container?.contains(mockCanvas)).toBe(true);
      expect(container?.contains(mockSpectralCanvas)).toBe(true);
      expect(container?.contains(mockWaterfallCanvas)).toBe(true);
    });

    it('should clear placeholder content when embedding canvases', () => {
      const container = containerEl.querySelector('#spec-analyzer-canvas-container');

      expect(container?.querySelector('p')).toBeNull();
    });
  });

  describe('canvas management', () => {
    it('should call getCanvas on spectrum analyzer', () => {
      expect(mockSpectrumAnalyzer.getCanvas).toHaveBeenCalled();
    });

    it('should call getSpectralCanvas on spectrum analyzer', () => {
      expect(mockSpectrumAnalyzer.getSpectralCanvas).toHaveBeenCalled();
    });

    it('should call getWaterfallCanvas on spectrum analyzer', () => {
      expect(mockSpectrumAnalyzer.getWaterfallCanvas).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clear container content', () => {
      adapter.dispose();

      const container = containerEl.querySelector('#spec-analyzer-canvas-container');
      expect(container?.innerHTML).toBe('');
    });

    it('should not destroy canvas elements (owned by spectrum analyzer)', () => {
      adapter.dispose();

      // Canvas elements should still exist in memory
      expect(mockCanvas.parentElement).toBeNull();
      expect(mockSpectralCanvas.parentElement).toBeNull();
      expect(mockWaterfallCanvas.parentElement).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw when container not found (qs throws)', () => {
      const emptyContainer = document.createElement('div');

      expect(() => {
        new SpectrumAnalyzerAdapter(mockSpectrumAnalyzer, emptyContainer);
      }).toThrow();
    });
  });
});
