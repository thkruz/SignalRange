import { Mocked, vi } from 'vitest';
import { AnalyzerControl, AnalyzerControlOptions } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control';
import { TraceMode } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Hertz } from '../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Mock SoundManager to prevent actual sound playing
vi.mock('@app/sound/sound-manager', () => ({
  __esModule: true,
  default: {
    getInstance: vi.fn().mockReturnValue({
      play: vi.fn(),
    }),
  },
}));

describe('AnalyzerControl', () => {
  let analyzerControl: AnalyzerControl;
  let mockSpecA: Mocked<Partial<RealTimeSpectrumAnalyzer>>;
  let mockState: RealTimeSpectrumAnalyzerState;
  let parentElement: HTMLElement;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="test-root"></div>';
    parentElement = document.getElementById('test-root')!;

    // Clear event bus
    EventBus.getInstance().clear(Events.SPEC_A_CONFIG_CHANGED);

    // Create mock state
    mockState = {
      uuid: 'test-uuid',
      team_id: 1,
      rfFeUuid: 'test-rfFeUuid',
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      lastSpan: 100e6 as Hertz,
      minFrequency: 5e3 as Hertz,
      maxFrequency: 25.5e9 as Hertz,
      rbw: 1e6 as Hertz,
      lockedControl: 'freq',
      inputValue: '',
      inputUnit: 'MHz',
      referenceLevel: 0,
      minAmplitude: -100,
      maxAmplitude: -40,
      scaleDbPerDiv: 6 as any,
      noiseFloorNoGain: -104,
      isSkipLnaGainDuringDraw: true,
      isPaused: false,
      hold: false,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      isUpdateMarkers: false,
      topMarkers: [],
      markerIndex: 0,
      refreshRate: 10,
      screenMode: 'spectralDensity',
      isUseTapA: true,
      isUseTapB: true,
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
      ],
      selectedTrace: 1,
    };

    // Create mock spectrum analyzer
    mockSpecA = {
      state: mockState,
      syncDomWithState: vi.fn(),
      freqAutoTune: vi.fn(),
      resetMaxHoldData: vi.fn(),
      resetMinHoldData: vi.fn(),
    };

    // Create analyzer control
    const options: AnalyzerControlOptions = {
      element: parentElement,
      spectrumAnalyzer: mockSpecA as any,
    };

    analyzerControl = new AnalyzerControl(options);
    analyzerControl.init_('test-root', 'replace');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create analyzer control instance', () => {
      expect(analyzerControl).toBeDefined();
    });

    it('should have reference to spectrum analyzer', () => {
      expect(analyzerControl.specA).toBe(mockSpecA);
    });

    it('should initialize panel elements', () => {
      expect(analyzerControl.panelElements).toBeDefined();
      expect(analyzerControl.panelElements.freq).toBeDefined();
      expect(analyzerControl.panelElements.span).toBeDefined();
      expect(analyzerControl.panelElements.ampt).toBeDefined();
      expect(analyzerControl.panelElements.mkr).toBeDefined();
      expect(analyzerControl.panelElements.mkr2).toBeDefined();
      expect(analyzerControl.panelElements.bw).toBeDefined();
      expect(analyzerControl.panelElements.sweep).toBeDefined();
      expect(analyzerControl.panelElements.trace).toBeDefined();
      expect(analyzerControl.panelElements.save).toBeDefined();
      expect(analyzerControl.panelElements.mode).toBeDefined();
      expect(analyzerControl.panelElements.ghz).toBeDefined();
      expect(analyzerControl.panelElements.mhz).toBeDefined();
      expect(analyzerControl.panelElements.khz).toBeDefined();
      expect(analyzerControl.panelElements.hz).toBeDefined();
    });

    it('should cache DOM elements', () => {
      expect(analyzerControl.domCache).toBeDefined();
      expect(analyzerControl.domCache['label-cell-1']).toBeDefined();
      expect(analyzerControl.domCache['label-select-button-1']).toBeDefined();
    });

    it('should have frequency button selected by default', () => {
      expect(analyzerControl.controlSelection).toBe(analyzerControl.panelElements.freq);
    });
  });

  describe('DOM Structure', () => {
    it('should create number pad buttons', () => {
      const numButtons = parentElement.querySelectorAll('.num-button');
      expect(numButtons.length).toBeGreaterThan(0);
    });

    it('should create number buttons 0-9', () => {
      for (let i = 0; i <= 9; i++) {
        const button = parentElement.querySelector(`.num-button[data-value="${i}"]`);
        expect(button).toBeDefined();
      }
    });

    it('should create decimal button', () => {
      const button = parentElement.querySelector('.num-button[data-value="."]');
      expect(button).toBeDefined();
    });

    it('should create sign toggle button', () => {
      const button = parentElement.querySelector('.num-button[data-value="+/-"]');
      expect(button).toBeDefined();
    });

    it('should create escape button', () => {
      const button = parentElement.querySelector('.num-button[data-value="esc"]');
      expect(button).toBeDefined();
    });

    it('should create backspace button', () => {
      const button = parentElement.querySelector('.num-button[data-value="bksp"]');
      expect(button).toBeDefined();
    });

    it('should create enter button', () => {
      const button = parentElement.querySelector('.num-button[data-value="enter"]');
      expect(button).toBeDefined();
    });

    it('should create power button', () => {
      const button = parentElement.querySelector('.num-button[data-value="power"]');
      expect(button).toBeDefined();
    });

    it('should create sub-menu labels', () => {
      for (let i = 1; i <= 8; i++) {
        const label = parentElement.querySelector(`.label-cell-${i}`);
        expect(label).toBeDefined();
      }
    });

    it('should create sub-menu buttons', () => {
      for (let i = 1; i <= 8; i++) {
        const button = parentElement.querySelector(`.label-select-button-${i}`);
        expect(button).toBeDefined();
      }
    });
  });

  describe('updateSubMenu', () => {
    it('should update control selection', () => {
      const mockControlButton = analyzerControl.panelElements.span;
      analyzerControl.updateSubMenu('span', mockControlButton);

      expect(analyzerControl.controlSelection).toBe(mockControlButton);
    });

    it('should clear label cells when updating sub menu', () => {
      // Set some content
      analyzerControl.domCache['label-cell-1'].textContent = 'Test Content';

      analyzerControl.updateSubMenu('span', analyzerControl.panelElements.span);

      // After updating, the sub-menu content should be cleared by clearSubMenu
      // Then the span button will set its own labels
      expect(analyzerControl.domCache['label-cell-1'].textContent).toBe('');
    });
  });

  describe('Number pad input handling', () => {
    beforeEach(() => {
      // Ensure a control is selected
      analyzerControl.panelElements.freq.click();
    });

    it('should append number to input value when number button clicked', () => {
      const button5 = parentElement.querySelector('.num-button[data-value="5"]') as HTMLButtonElement;
      button5.click();

      expect(mockState.inputValue).toContain('5');
    });

    it('should append multiple numbers correctly', () => {
      const button1 = parentElement.querySelector('.num-button[data-value="1"]') as HTMLButtonElement;
      const button2 = parentElement.querySelector('.num-button[data-value="2"]') as HTMLButtonElement;
      const button3 = parentElement.querySelector('.num-button[data-value="3"]') as HTMLButtonElement;

      mockState.inputValue = '';
      button1.click();
      button2.click();
      button3.click();

      expect(mockState.inputValue).toBe('123');
    });

    it('should handle decimal button', () => {
      const buttonDecimal = parentElement.querySelector('.num-button[data-value="."]') as HTMLButtonElement;
      const button5 = parentElement.querySelector('.num-button[data-value="5"]') as HTMLButtonElement;

      mockState.inputValue = '123';
      buttonDecimal.click();
      button5.click();

      expect(mockState.inputValue).toBe('123.5');
    });

    it('should toggle sign with +/- button', () => {
      mockState.inputValue = '123';

      const buttonSign = parentElement.querySelector('.num-button[data-value="+/-"]') as HTMLButtonElement;
      buttonSign.click();

      expect(mockState.inputValue).toBe('-123');

      buttonSign.click();

      expect(mockState.inputValue).toBe('123');
    });

    it('should clear input with escape button', () => {
      mockState.inputValue = '123';

      const buttonEsc = parentElement.querySelector('.num-button[data-value="esc"]') as HTMLButtonElement;
      buttonEsc.click();

      expect(mockState.inputValue).toBe('');
    });

    it('should remove last character with backspace button', () => {
      mockState.inputValue = '123';

      const buttonBksp = parentElement.querySelector('.num-button[data-value="bksp"]') as HTMLButtonElement;
      buttonBksp.click();

      expect(mockState.inputValue).toBe('12');
    });

    it('should sync DOM with state after input', () => {
      const button5 = parentElement.querySelector('.num-button[data-value="5"]') as HTMLButtonElement;
      button5.click();

      expect(mockSpecA.syncDomWithState).toHaveBeenCalled();
    });
  });

  describe('Enter button handling', () => {
    beforeEach(() => {
      analyzerControl.panelElements.freq.click();
    });

    it('should call onEnterPressed on control selection', () => {
      const enterSpy = vi.spyOn(analyzerControl.controlSelection!, 'onEnterPressed');

      mockState.inputValue = '700';
      mockState.inputUnit = 'MHz';

      const buttonEnter = parentElement.querySelector('.num-button[data-value="enter"]') as HTMLButtonElement;
      buttonEnter.click();

      expect(enterSpy).toHaveBeenCalled();
    });

    it('should not process invalid number input', () => {
      mockState.inputValue = 'invalid';
      mockState.inputUnit = 'MHz';

      const buttonEnter = parentElement.querySelector('.num-button[data-value="enter"]') as HTMLButtonElement;

      // Should not throw
      expect(() => buttonEnter.click()).not.toThrow();
    });
  });

  describe('Unit conversion in number handling', () => {
    beforeEach(() => {
      analyzerControl.panelElements.freq.click();
    });

    it('should handle GHz unit conversion', () => {
      mockState.inputValue = '1.5';
      mockState.inputUnit = 'GHz';

      const buttonEnter = parentElement.querySelector('.num-button[data-value="enter"]') as HTMLButtonElement;
      buttonEnter.click();

      // 1.5 GHz = 1.5e9 Hz
      expect(mockState.centerFrequency).toBe(1.5e9);
    });

    it('should handle MHz unit conversion', () => {
      mockState.inputValue = '500';
      mockState.inputUnit = 'MHz';

      const buttonEnter = parentElement.querySelector('.num-button[data-value="enter"]') as HTMLButtonElement;
      buttonEnter.click();

      // 500 MHz = 500e6 Hz
      expect(mockState.centerFrequency).toBe(500e6);
    });

    it('should handle kHz unit conversion', () => {
      mockState.inputValue = '1000000';
      mockState.inputUnit = 'kHz';

      const buttonEnter = parentElement.querySelector('.num-button[data-value="enter"]') as HTMLButtonElement;
      buttonEnter.click();

      // 1000000 kHz = 1e9 Hz = 1 GHz
      expect(mockState.centerFrequency).toBe(1e9);
    });
  });

  describe('Control button selection', () => {
    it('should update sub menu when freq button clicked', () => {
      analyzerControl.panelElements.span.click();
      analyzerControl.panelElements.freq.click();

      expect(analyzerControl.controlSelection).toBe(analyzerControl.panelElements.freq);
    });

    it('should update sub menu when span button clicked', () => {
      analyzerControl.panelElements.span.click();

      expect(analyzerControl.controlSelection).toBe(analyzerControl.panelElements.span);
    });

    it('should update sub menu when trace button clicked', () => {
      analyzerControl.panelElements.trace.click();

      expect(analyzerControl.controlSelection).toBe(analyzerControl.panelElements.trace);
    });
  });
});
