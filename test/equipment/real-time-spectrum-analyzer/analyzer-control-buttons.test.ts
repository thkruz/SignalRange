import { Mocked, vi } from 'vitest';
import { AnalyzerControl } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control';
import { ACFreqBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-freq-btn/ac-freq-btn';
import { ACSpanBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-span-btn/ac-span-btn';
import { ACTraceBtn, TraceMode } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Hertz } from '../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

describe('Analyzer Control Buttons', () => {
  let mockAnalyzerControl: Mocked<Partial<AnalyzerControl>>;
  let mockSpecA: Mocked<Partial<RealTimeSpectrumAnalyzer>>;
  let mockState: RealTimeSpectrumAnalyzerState;

  // Create mock DOM cache
  const createMockDomCache = () => {
    const cache: { [key: string]: HTMLElement } = {};
    for (let i = 1; i <= 8; i++) {
      cache[`label-cell-${i}`] = document.createElement('div');
      cache[`label-select-button-${i}`] = document.createElement('button');
    }
    return cache;
  };

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="test-root"></div>';

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

    // Create mock analyzer control
    mockAnalyzerControl = {
      specA: mockSpecA as any,
      domCache: createMockDomCache(),
      updateSubMenu: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('ACFreqBtn', () => {
    let freqBtn: ACFreqBtn;

    beforeEach(() => {
      freqBtn = new ACFreqBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(freqBtn.html).toContain('ac-freq-btn-test-uuid');
      });

      it('should have Freq label in HTML', () => {
        expect(freqBtn.html).toContain('Freq');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        freqBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('freq', freqBtn);
      });

      it('should set label cells on click', () => {
        freqBtn.click();

        expect(mockAnalyzerControl.domCache!['label-cell-1'].textContent).toBe('Center Freq');
        expect(mockAnalyzerControl.domCache!['label-cell-2'].textContent).toBe('Start Freq');
        expect(mockAnalyzerControl.domCache!['label-cell-3'].textContent).toBe('Stop Freq');
        expect(mockAnalyzerControl.domCache!['label-cell-4'].textContent).toBe('Auto-Tune');
      });
    });

    describe('onEnterPressed', () => {
      it('should update center frequency when in center mode', () => {
        // Simulate clicking center freq first
        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        // Set input value
        mockState.inputValue = '700';
        mockState.inputUnit = 'MHz';

        freqBtn.onEnterPressed();

        expect(mockState.centerFrequency).toBe(700e6);
      });

      it('should reject frequency out of range', () => {
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        // Set frequency out of range (above max)
        mockState.inputValue = '30';
        mockState.inputUnit = 'GHz';

        freqBtn.onEnterPressed();

        // Should have shown alert and not changed frequency
        expect(window.alert).toHaveBeenCalled();
        expect(mockState.centerFrequency).toBe(600e6);
      });

      it('should convert GHz to Hz correctly', () => {
        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '1.5';
        mockState.inputUnit = 'GHz';

        freqBtn.onEnterPressed();

        expect(mockState.centerFrequency).toBe(1.5e9);
      });

      it('should convert kHz to Hz correctly', () => {
        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '100000';
        mockState.inputUnit = 'kHz';

        freqBtn.onEnterPressed();

        expect(mockState.centerFrequency).toBe(100e6);
      });
    });

    describe('Tick adjustment', () => {
      it('should handle major tick change', () => {
        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        const initialFreq = mockState.centerFrequency;
        freqBtn.onMajorTickChange(0.1);

        // Frequency should have changed
        expect(mockState.centerFrequency).not.toBe(initialFreq);
      });

      it('should handle minor tick change', () => {
        freqBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        const initialFreq = mockState.centerFrequency;
        freqBtn.onMinorTickChange(0.1);

        // Frequency should have changed (smaller adjustment than major)
        expect(mockState.centerFrequency).not.toBe(initialFreq);
      });
    });
  });

  describe('ACSpanBtn', () => {
    let spanBtn: ACSpanBtn;

    beforeEach(() => {
      spanBtn = new ACSpanBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(spanBtn.html).toContain('ac-span-btn-test-uuid');
      });

      it('should have Span label in HTML', () => {
        expect(spanBtn.html).toContain('Span');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        spanBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('span', spanBtn);
      });

      it('should set label cells on click', () => {
        spanBtn.click();

        expect(mockAnalyzerControl.domCache!['label-cell-1'].textContent).toBe('Set Span');
        expect(mockAnalyzerControl.domCache!['label-cell-2'].textContent).toBe('Full Span');
        expect(mockAnalyzerControl.domCache!['label-cell-3'].textContent).toBe('Zero Span');
        expect(mockAnalyzerControl.domCache!['label-cell-4'].textContent).toBe('Last Span');
      });
    });

    describe('Full span button', () => {
      it('should set span to full range on full span click', () => {
        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        // Full span should be max - min
        const expectedSpan = mockState.maxFrequency - mockState.minFrequency;
        expect(mockState.span).toBe(expectedSpan);
      });

      it('should save last span before setting full span', () => {
        const originalSpan = mockState.span;

        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        expect(mockState.lastSpan).toBe(originalSpan);
      });

      it('should center frequency on full span', () => {
        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        const expectedCenter = (mockState.minFrequency + mockState.maxFrequency) / 2;
        expect(mockState.centerFrequency).toBe(expectedCenter);
      });
    });

    describe('Last span button', () => {
      it('should restore last span value', () => {
        mockState.lastSpan = 50e6 as Hertz;
        mockState.span = 100e6 as Hertz;

        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-4'].click();

        expect(mockState.span).toBe(50e6);
      });
    });

    describe('onEnterPressed', () => {
      it('should update span when set span is selected', () => {
        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '200';
        mockState.inputUnit = 'MHz';

        spanBtn.onEnterPressed();

        expect(mockState.span).toBe(200e6);
      });

      it('should save last span before updating', () => {
        const originalSpan = mockState.span;

        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '200';
        mockState.inputUnit = 'MHz';

        spanBtn.onEnterPressed();

        expect(mockState.lastSpan).toBe(originalSpan);
      });

      it('should set locked control to span', () => {
        spanBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '200';
        mockState.inputUnit = 'MHz';

        spanBtn.onEnterPressed();

        expect(mockState.lockedControl).toBe('span');
      });
    });
  });

  describe('ACTraceBtn', () => {
    let traceBtn: ACTraceBtn;

    beforeEach(() => {
      traceBtn = new ACTraceBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(traceBtn.html).toContain('ac-trace-btn-test-uuid');
      });

      it('should have Trace label in HTML', () => {
        expect(traceBtn.html).toContain('Trace');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        traceBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('trace', traceBtn);
      });

      it('should set label cells on click', () => {
        traceBtn.click();

        expect(mockAnalyzerControl.domCache!['label-cell-1'].textContent).toBe('Trace Select');
        expect(mockAnalyzerControl.domCache!['label-cell-2'].textContent).toBe('Clear/Write');
        expect(mockAnalyzerControl.domCache!['label-cell-3'].textContent).toBe('Hold');
        expect(mockAnalyzerControl.domCache!['label-cell-4'].textContent).toBe('Max Hold');
        expect(mockAnalyzerControl.domCache!['label-cell-5'].textContent).toBe('Min Hold');
        expect(mockAnalyzerControl.domCache!['label-cell-6'].textContent).toBe('Average');
      });
    });

    describe('getTraceState', () => {
      it('should return trace state for valid trace number', () => {
        const state = traceBtn.getTraceState(1);

        expect(state).toBeDefined();
        expect(state).toEqual({
          isVisible: true,
          isUpdating: true,
          mode: 'clearwrite',
        });
      });

      it('should return null for invalid trace number (0)', () => {
        const state = traceBtn.getTraceState(0);
        expect(state).toBeNull();
      });

      it('should return null for invalid trace number (4)', () => {
        const state = traceBtn.getTraceState(4);
        expect(state).toBeNull();
      });
    });

    describe('getSelectedTrace', () => {
      it('should return currently selected trace', () => {
        mockState.selectedTrace = 2;
        expect(traceBtn.getSelectedTrace()).toBe(2);
      });
    });

    describe('Trace mode buttons', () => {
      it('should set max hold mode on max hold button click', () => {
        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-4'].click();

        expect(mockState.traces[0].mode).toBe('maxhold');
        expect(mockState.isMaxHold).toBe(true);
        expect(mockState.isMinHold).toBe(false);
      });

      it('should set min hold mode on min hold button click', () => {
        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-5'].click();

        expect(mockState.traces[0].mode).toBe('minhold');
        expect(mockState.isMaxHold).toBe(false);
        expect(mockState.isMinHold).toBe(true);
      });

      it('should set hold mode on hold button click', () => {
        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-3'].click();

        expect(mockState.traces[0].mode).toBe('hold');
        expect(mockState.traces[0].isUpdating).toBe(false);
      });

      it('should set average mode on average button click', () => {
        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-6'].click();

        expect(mockState.traces[0].mode).toBe('average');
        expect(mockState.traces[0].isUpdating).toBe(true);
      });

      it('should toggle visibility on clear/write button click', () => {
        const originalVisibility = mockState.traces[0].isVisible;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        expect(mockState.traces[0].isVisible).toBe(!originalVisibility);
        expect(mockState.traces[0].mode).toBe('clearwrite');
      });
    });

    describe('Trace selection', () => {
      it('should update input value on trace select click', () => {
        mockState.selectedTrace = 2;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        expect(mockState.inputValue).toBe('2');
      });

      it('should handle valid trace selection via enter', () => {
        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '3';

        traceBtn.onEnterPressed();

        expect(mockState.selectedTrace).toBe(3);
      });

      it('should reject invalid trace selection via enter', () => {
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        mockState.inputValue = '5';

        traceBtn.onEnterPressed();

        expect(window.alert).toHaveBeenCalled();
        expect(mockState.selectedTrace).not.toBe(5);
      });
    });

    describe('Tick changes for trace selection', () => {
      it('should not change trace on tick if not in trace select mode', () => {
        mockState.selectedTrace = 1;

        // Click without selecting trace select submenu
        traceBtn.onMajorTickChange(1);

        expect(mockState.selectedTrace).toBe(1);
      });

      it('should change trace on major tick in trace select mode', () => {
        mockState.selectedTrace = 1;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        traceBtn.onMajorTickChange(-1);

        expect(mockState.selectedTrace).toBe(2);
      });

      it('should reject trace selection out of bounds via tick', () => {
        vi.spyOn(window, 'alert').mockImplementation(() => { });
        mockState.selectedTrace = 3;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        traceBtn.onMajorTickChange(-1); // Try to go to trace 4

        expect(window.alert).toHaveBeenCalled();
        expect(mockState.selectedTrace).toBe(3);
      });
    });

    describe('Reset hold data calls', () => {
      it('should call resetMaxHoldData on max hold for trace 1', () => {
        mockState.selectedTrace = 1;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-4'].click();

        expect(mockSpecA.resetMaxHoldData).toHaveBeenCalled();
      });

      it('should call resetMinHoldData on min hold for trace 1', () => {
        mockState.selectedTrace = 1;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-5'].click();

        expect(mockSpecA.resetMinHoldData).toHaveBeenCalled();
      });

      it('should not call resetMaxHoldData for trace 2', () => {
        mockState.selectedTrace = 2;

        traceBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-4'].click();

        expect(mockSpecA.resetMaxHoldData).not.toHaveBeenCalled();
      });
    });
  });
});
