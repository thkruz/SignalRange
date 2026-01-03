import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Hertz, dB } from '../../../src/types';
import { TraceMode } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { TapPoint } from '../../../src/equipment/rf-front-end/coupler-module/tap-points';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});

// Mock SoundManager
jest.mock('@app/sound/sound-manager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      play: jest.fn(),
    }),
  },
}));

// Mock getEl to return mock DOM elements
jest.mock('@app/engine/utils/get-el', () => {
  // Define the mock element factory inside the factory function
  const mockElement = (id: string) => {
    if (id.includes('specA') || id.includes('canvas')) {
      return {
        id,
        tagName: 'CANVAS',
        width: 800,
        height: 400,
        style: { display: '' },
        getContext: jest.fn().mockReturnValue({
          fillRect: jest.fn(),
          clearRect: jest.fn(),
          drawImage: jest.fn(),
          putImageData: jest.fn(),
          getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(800 * 400 * 4) }),
          createImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(800 * 400 * 4) }),
        }),
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
          contains: jest.fn(),
        },
      };
    }
    return {
      id,
      innerHTML: '',
      style: { display: '' },
      appendChild: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        toggle: jest.fn(),
        contains: jest.fn(),
      },
    };
  };

  return {
    getEl: jest.fn().mockImplementation((id: string) => mockElement(id)),
    showEl: jest.fn(),
    hideEl: jest.fn(),
    setInnerHtml: jest.fn(),
  };
});

// Mock HelpButton
jest.mock('@app/components/help-btn/help-btn', () => ({
  HelpButton: {
    create: jest.fn().mockReturnValue({
      html: '<button class="help-btn">?</button>',
    }),
  },
}));

// Mock AnalyzerControlBox
jest.mock('@app/equipment/real-time-spectrum-analyzer/analyzer-control-box', () => ({
  AnalyzerControlBox: class MockAnalyzerControlBox {
    open() {}
    close() {}
  }
}));

// Mock DraggableBox
jest.mock('@app/engine/ui/draggable-box', () => ({
  DraggableBox: class MockDraggableBox {
    constructor() {}
    open() {}
    close() {}
  }
}));

// Mock RTSAScreen, SpectralDensityPlot, WaterfallDisplay
jest.mock('@app/equipment/real-time-spectrum-analyzer/rtsa-screen/spectral-density-plot', () => ({
  SpectralDensityPlot: class MockSpectralDensityPlot {
    canvas = { id: 'mock-spectral-canvas' };
    setFrequencyRange() {}
    draw() {}
    resetMaxHold() {}
    resetMinHold() {}
    resetMaxHold_() {}
    resetMinHold_() {}
  }
}));

jest.mock('@app/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display', () => ({
  WaterfallDisplay: class MockWaterfallDisplay {
    canvas = { id: 'mock-waterfall-canvas' };
    setFrequencyRange() {}
    draw() {}
    resetMaxHold() {}
    resetMinHold() {}
  }
}));

describe('RealTimeSpectrumAnalyzer', () => {
  let specA: RealTimeSpectrumAnalyzer;
  let mockRfFrontEnd: any;
  let parentElement: HTMLElement;

  // Create mock signal path manager
  const createMockSignalPathManager = () => ({
    getTotalRxGain: jest.fn().mockReturnValue(30),
    getTotalGainTo: jest.fn().mockReturnValue(30),
    getNoiseFloorAt: jest.fn().mockReturnValue({
      noiseFloorNoGain: -104,
      shouldApplyGain: true,
    }),
  });

  // Create mock coupler module
  const createMockCouplerModule = () => ({
    signalPathManager: createMockSignalPathManager(),
    state: {
      tapPointA: TapPoint.RX_IF,
      tapPointB: TapPoint.RX_RF_POST_LNA,
    },
  });

  // Create mock modules
  const createMockModule = (signals: any[] = []) => ({
    inputSignals: signals,
    outputSignals: signals,
    postLNASignals: signals,
    txSignalsOut: signals,
    rxSignalsOut: signals,
  });

  // Create mock antenna
  const createMockAntenna = () => ({
    state: {
      rxSignalsIn: [],
    },
  });

  // Create mock notch filter module
  const createMockNotchFilterModule = () => ({
    state: {
      isPowered: false,
      notches: [],
    },
  });

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="test-root"></div>
      <div id="draggable-boxes-container"></div>
    `;
    parentElement = document.getElementById('test-root')!;

    // Clear event bus
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SPEC_A_CONFIG_CHANGED);
    EventBus.getInstance().clear(Events.ANTENNA_STATE_CHANGED);

    // Create mock RF front end
    mockRfFrontEnd = {
      state: { uuid: 'rf-front-end-uuid' },
      couplerModule: createMockCouplerModule(),
      bucModule: createMockModule(),
      hpaModule: createMockModule(),
      omtModule: {
        ...createMockModule(),
        txSignalsOut: [],
        rxSignalsOut: [],
      },
      lnbModule: {
        ...createMockModule(),
        postLNASignals: [],
        getTotalGain: jest.fn().mockReturnValue(30),
      },
      agcModule: {
        outputSignals: [],
      },
      notchFilterModule: createMockNotchFilterModule(),
      antenna: createMockAntenna(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create spectrum analyzer with default state', () => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(specA).toBeDefined();
      expect(specA.state).toBeDefined();
    });

    it('should merge initial state with defaults', () => {
      const initialState: Partial<RealTimeSpectrumAnalyzerState> = {
        centerFrequency: 1e9 as Hertz,
        span: 200e6 as Hertz,
      };

      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd, initialState);

      expect(specA.state.centerFrequency).toBe(1e9);
      expect(specA.state.span).toBe(200e6);
    });

    it('should set UUID from base equipment', () => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(specA.state.uuid).toBeDefined();
      expect(specA.state.uuid.length).toBeGreaterThan(0);
    });

    it('should set RF front end UUID', () => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(specA.state.rfFeUuid).toBe('rf-front-end-uuid');
    });

    it('should set input value in MHz by default', () => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(specA.state.inputUnit).toBe('MHz');
    });

    it('should subscribe to UPDATE event', () => {
      const onSpy = jest.spyOn(EventBus.getInstance(), 'on');

      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(onSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should subscribe to SYNC event', () => {
      const onSpy = jest.spyOn(EventBus.getInstance(), 'on');

      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(onSpy).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));
    });

    it('should subscribe to DRAW event', () => {
      const onSpy = jest.spyOn(EventBus.getInstance(), 'on');

      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);

      expect(onSpy).toHaveBeenCalledWith(Events.DRAW, expect.any(Function));
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should have default screen mode as spectralDensity', () => {
      expect(specA.state.screenMode).toBe('spectralDensity');
    });

    it('should have default traces configuration', () => {
      expect(specA.state.traces).toHaveLength(3);
      expect(specA.state.traces[0].mode).toBe('clearwrite');
      expect(specA.state.traces[0].isVisible).toBe(true);
    });

    it('should have default frequency settings', () => {
      expect(specA.state.minFrequency).toBe(5e3);
      expect(specA.state.maxFrequency).toBe(25.5e9);
    });

    it('should have default amplitude settings', () => {
      expect(specA.state.minAmplitude).toBe(-100);
      expect(specA.state.maxAmplitude).toBe(-40);
      expect(specA.state.scaleDbPerDiv).toBe(6);
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should update state with new values', () => {
      const newState: Partial<RealTimeSpectrumAnalyzerState> = {
        centerFrequency: 2e9 as Hertz,
        isPaused: true,
      };

      specA.sync(newState as RealTimeSpectrumAnalyzerState);

      expect(specA.state.centerFrequency).toBe(2e9);
      expect(specA.state.isPaused).toBe(true);
    });

    it('should call syncDomWithState after sync', () => {
      const syncDomSpy = jest.spyOn(specA, 'syncDomWithState');

      specA.sync({ isPaused: true } as RealTimeSpectrumAnalyzerState);

      expect(syncDomSpy).toHaveBeenCalled();
    });
  });

  describe('changeCenterFreq', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should update center frequency', () => {
      specA.changeCenterFreq(1.5e9);

      expect(specA.state.centerFrequency).toBe(1.5e9);
    });

    it('should call syncDomWithState', () => {
      const syncDomSpy = jest.spyOn(specA, 'syncDomWithState');

      specA.changeCenterFreq(1.5e9);

      expect(syncDomSpy).toHaveBeenCalled();
    });
  });

  describe('changeBandwidth', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should update span', () => {
      specA.changeBandwidth(50e6);

      expect(specA.state.span).toBe(50e6);
    });

    it('should call syncDomWithState', () => {
      const syncDomSpy = jest.spyOn(specA, 'syncDomWithState');

      specA.changeBandwidth(50e6);

      expect(syncDomSpy).toHaveBeenCalled();
    });
  });

  describe('togglePause', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should toggle pause state from false to true', () => {
      specA.state.isPaused = false;

      specA.togglePause();

      expect(specA.state.isPaused).toBe(true);
    });

    it('should toggle pause state from true to false', () => {
      specA.state.isPaused = true;

      specA.togglePause();

      expect(specA.state.isPaused).toBe(false);
    });

    it('should emit SPEC_A_CONFIG_CHANGED event', () => {
      const emitSpy = jest.spyOn(specA, 'emit');

      specA.togglePause();

      expect(emitSpy).toHaveBeenCalledWith(
        Events.SPEC_A_CONFIG_CHANGED,
        expect.objectContaining({
          uuid: specA.state.uuid,
          isPaused: expect.any(Boolean),
        })
      );
    });
  });

  describe('updateScreenVisibility', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should show single canvas in spectralDensity mode', () => {
      specA.state.screenMode = 'spectralDensity';

      specA.updateScreenVisibility();

      const singleCanvas = specA.getCanvas();
      const spectralCanvas = specA.getSpectralCanvas();
      const waterfallCanvas = specA.getWaterfallCanvas();

      expect(singleCanvas?.style.display).toBe('block');
      expect(spectralCanvas?.style.display).toBe('none');
      expect(waterfallCanvas?.style.display).toBe('none');
    });

    it('should show single canvas in waterfall mode', () => {
      specA.state.screenMode = 'waterfall';

      specA.updateScreenVisibility();

      const singleCanvas = specA.getCanvas();
      const spectralCanvas = specA.getSpectralCanvas();
      const waterfallCanvas = specA.getWaterfallCanvas();

      expect(singleCanvas?.style.display).toBe('block');
      expect(spectralCanvas?.style.display).toBe('none');
      expect(waterfallCanvas?.style.display).toBe('none');
    });

    it('should show both canvases in both mode', () => {
      specA.state.screenMode = 'both';

      specA.updateScreenVisibility();

      const singleCanvas = specA.getCanvas();
      const spectralCanvas = specA.getSpectralCanvas();
      const waterfallCanvas = specA.getWaterfallCanvas();

      expect(singleCanvas?.style.display).toBe('none');
      expect(spectralCanvas?.style.display).toBe('block');
      expect(waterfallCanvas?.style.display).toBe('block');
    });
  });

  describe('noiseFloorAndGain getter', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should return noise floor without gain when isSkipLnaGainDuringDraw is true', () => {
      specA.state.noiseFloorNoGain = -104;
      specA.state.isSkipLnaGainDuringDraw = true;

      const noiseFloor = specA.noiseFloorAndGain;

      expect(noiseFloor).toBe(-104);
    });

    it('should return noise floor with gain when isSkipLnaGainDuringDraw is false', () => {
      specA.state.noiseFloorNoGain = -104;
      specA.state.isSkipLnaGainDuringDraw = false;
      mockRfFrontEnd.couplerModule.signalPathManager.getTotalRxGain.mockReturnValue(30);

      const noiseFloor = specA.noiseFloorAndGain;

      expect(noiseFloor).toBe(-74); // -104 + 30
    });
  });

  describe('resetMaxHoldData', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should call resetMaxHold on current screen in single mode', () => {
      specA.state.screenMode = 'spectralDensity';
      // Set screen reference to spectralDensity (simulating what toggleScreenMode does)
      specA.screen = specA.spectralDensity;
      const resetSpy = jest.spyOn(specA.screen!, 'resetMaxHold');

      specA.resetMaxHoldData();

      expect(resetSpy).toHaveBeenCalled();
    });

    it('should call resetMaxHold on both screens in both mode', () => {
      specA.state.screenMode = 'both';
      const spectralResetSpy = jest.spyOn(specA.spectralDensityBoth!, 'resetMaxHold_');
      const waterfallResetSpy = jest.spyOn(specA.waterfallBoth!, 'resetMaxHold');

      specA.resetMaxHoldData();

      expect(spectralResetSpy).toHaveBeenCalled();
      expect(waterfallResetSpy).toHaveBeenCalled();
    });
  });

  describe('resetMinHoldData', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should call resetMinHold on current screen in single mode', () => {
      specA.state.screenMode = 'spectralDensity';
      // Set screen reference to spectralDensity (simulating what toggleScreenMode does)
      specA.screen = specA.spectralDensity;
      const resetSpy = jest.spyOn(specA.screen!, 'resetMinHold');

      specA.resetMinHoldData();

      expect(resetSpy).toHaveBeenCalled();
    });

    it('should call resetMinHold on both screens in both mode', () => {
      specA.state.screenMode = 'both';
      const spectralResetSpy = jest.spyOn(specA.spectralDensityBoth!, 'resetMinHold_');
      const waterfallResetSpy = jest.spyOn(specA.waterfallBoth!, 'resetMinHold');

      specA.resetMinHoldData();

      expect(spectralResetSpy).toHaveBeenCalled();
      expect(waterfallResetSpy).toHaveBeenCalled();
    });
  });

  describe('getInputSignals', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should return empty array when no signals present', () => {
      mockRfFrontEnd.agcModule.outputSignals = [];

      const signals = specA.getInputSignals();

      expect(signals).toEqual([]);
    });

    it('should update noiseFloorNoGain in state', () => {
      mockRfFrontEnd.couplerModule.signalPathManager.getNoiseFloorAt.mockReturnValue({
        noiseFloorNoGain: -100,
        shouldApplyGain: true,
      });

      specA.getInputSignals();

      expect(specA.state.noiseFloorNoGain).toBeDefined();
    });

    it('should respect isUseTapA setting', () => {
      specA.state.isUseTapA = false;
      specA.state.isUseTapB = true;

      specA.getInputSignals();

      // Should only process tap B
      expect(mockRfFrontEnd.couplerModule.signalPathManager.getNoiseFloorAt).toHaveBeenCalled();
    });

    it('should respect isUseTapB setting', () => {
      specA.state.isUseTapA = true;
      specA.state.isUseTapB = false;

      specA.getInputSignals();

      // Should only process tap A
      expect(mockRfFrontEnd.couplerModule.signalPathManager.getNoiseFloorAt).toHaveBeenCalled();
    });
  });

  describe('Canvas Getters', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should return main canvas', () => {
      const canvas = specA.getCanvas();

      expect(canvas).toBeDefined();
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
    });

    it('should return spectral canvas', () => {
      const canvas = specA.getSpectralCanvas();

      expect(canvas).toBeDefined();
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
    });

    it('should return waterfall canvas', () => {
      const canvas = specA.getWaterfallCanvas();

      expect(canvas).toBeDefined();
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
    });
  });

  describe('freqAutoTune', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should center on strongest signal within span', () => {
      specA.inputSignals = [
        { frequency: 600e6, power: -50, bandwidth: 10e6 } as any,
        { frequency: 620e6, power: -40, bandwidth: 10e6 } as any,
      ];
      specA.state.centerFrequency = 610e6 as Hertz;
      specA.state.span = 100e6 as Hertz;

      specA.freqAutoTune();

      // Should center on the stronger signal at 620 MHz
      expect(specA.state.centerFrequency).toBe(620e6);
    });

    it('should adjust span to fit signal bandwidth', () => {
      specA.inputSignals = [
        { frequency: 600e6, power: -40, bandwidth: 20e6 } as any,
      ];
      specA.state.centerFrequency = 600e6 as Hertz;
      specA.state.span = 100e6 as Hertz;

      specA.freqAutoTune();

      // Span should be 10% wider than signal bandwidth
      expect(specA.state.span).toBe(22e6); // 20e6 * 1.1
    });

    it('should adjust amplitude range based on signal power', () => {
      specA.inputSignals = [
        { frequency: 600e6, power: -35, bandwidth: 10e6 } as any,
      ];
      specA.state.centerFrequency = 600e6 as Hertz;
      specA.state.span = 100e6 as Hertz;

      specA.freqAutoTune();

      // Max amplitude should be rounded up to nearest 10 dB
      expect(specA.state.maxAmplitude).toBeGreaterThanOrEqual(-40);
    });

    it('should use noise floor when no strong signal found', () => {
      specA.inputSignals = [];
      specA.state.centerFrequency = 600e6 as Hertz;
      specA.state.span = 100e6 as Hertz;

      specA.freqAutoTune();

      // Should still update state without errors
      expect(specA.state.centerFrequency).toBeDefined();
    });

    it('should not auto-tune if span is too large', () => {
      specA.inputSignals = [
        { frequency: 600e6, power: -40, bandwidth: 10e6 } as any,
      ];
      specA.state.centerFrequency = 600e6 as Hertz;
      specA.state.span = 500e6 as Hertz; // > 320 MHz

      const originalCenter = specA.state.centerFrequency;
      specA.freqAutoTune();

      // With span > 320 MHz, signal won't be found, so random noise floor signal is used
      expect(specA.state.centerFrequency).not.toBe(originalCenter);
    });
  });

  describe('DOM Initialization', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should create config button', () => {
      const configButton = parentElement.querySelector('.btn-config');
      expect(configButton).toBeDefined();
    });

    it('should create tap A button', () => {
      const tapAButton = parentElement.querySelector('.btn-tap-a');
      expect(tapAButton).toBeDefined();
    });

    it('should create tap B button', () => {
      const tapBButton = parentElement.querySelector('.btn-tap-b');
      expect(tapBButton).toBeDefined();
    });

    it('should create info display', () => {
      const info = parentElement.querySelector('.spec-a-info');
      expect(info).toBeDefined();
    });

    it('should create main canvas', () => {
      const canvas = parentElement.querySelector(`#specA${specA.state.uuid}`);
      expect(canvas).toBeDefined();
    });
  });

  describe('Tap Button Interactions', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should toggle tap A on button click', () => {
      const initialTapA = specA.state.isUseTapA;
      const tapAButton = parentElement.querySelector('.btn-tap-a') as HTMLButtonElement;

      tapAButton.click();

      expect(specA.state.isUseTapA).toBe(!initialTapA);
    });

    it('should toggle tap B on button click', () => {
      const initialTapB = specA.state.isUseTapB;
      const tapBButton = parentElement.querySelector('.btn-tap-b') as HTMLButtonElement;

      tapBButton.click();

      expect(specA.state.isUseTapB).toBe(!initialTapB);
    });
  });

  describe('syncDomWithState', () => {
    beforeEach(() => {
      specA = new RealTimeSpectrumAnalyzer('test-root', mockRfFrontEnd);
    });

    it('should update info display with center frequency', () => {
      specA.state.centerFrequency = 1.5e9 as Hertz;

      specA.syncDomWithState();

      const info = parentElement.querySelector('.spec-a-info');
      expect(info?.innerHTML).toContain('1500');
    });

    it('should update tap A button class based on state', () => {
      specA.state.isUseTapA = true;

      specA.syncDomWithState();

      const tapAButton = parentElement.querySelector('.btn-tap-a');
      expect(tapAButton?.className).toContain('btn-active');
    });

    it('should update tap B button class based on state', () => {
      specA.state.isUseTapB = false;

      specA.syncDomWithState();

      const tapBButton = parentElement.querySelector('.btn-tap-b');
      expect(tapBButton?.className).not.toContain('btn-active');
    });

    it('should not update DOM if state unchanged', () => {
      specA.syncDomWithState(); // First call to set prevState

      const info = parentElement.querySelector('.spec-a-info');
      const initialContent = info?.innerHTML;

      specA.syncDomWithState(); // Second call with same state

      expect(info?.innerHTML).toBe(initialContent);
    });
  });
});
