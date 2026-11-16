import { Mock, Mocked, vi } from 'vitest';
import { RealTimeSpectrumAnalyzer } from '../../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectralDensityPlot } from '../../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/spectral-density-plot';
import type { SpectrumDataProcessor } from '../../../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SpectrumAnalyzerAdvancedAdapter } from '../../../../src/pages/mission-control/tabs/spectrum-analyzer-advanced-adapter';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
const { logAction } = vi.hoisted(() => ({ logAction: vi.fn() }));
vi.mock('../../../../src/ops-log/event-auto-logger', () => ({
  EventAutoLogger: { getInstance: () => ({ logAction }) },
}));
vi.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ isDeveloperMode: false }) },
}));

describe('SpectrumAnalyzerAdvancedAdapter', () => {
  let mockSpectrumAnalyzer: Mocked<RealTimeSpectrumAnalyzer>;
  let containerEl: HTMLElement;
  let adapter: SpectrumAnalyzerAdvancedAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState = {
    uuid: 'test-uuid',
    centerFrequency: 1500e6,
    span: 100e6,
    rbw: null,
    referenceLevel: -20,
    scaleDbPerDiv: 10,
    minAmplitude: -120,
    maxAmplitude: 0,
    refreshRate: 10,
    screenMode: 'both' as const,
    isPaused: false,
    isMaxHold: false,
    isMinHold: false,
    selectedTrace: 1,
    traces: [
      { isVisible: true, isUpdating: true, mode: 'clearwrite' as const },
      { isVisible: false, isUpdating: false, mode: 'clearwrite' as const },
      { isVisible: false, isUpdating: false, mode: 'clearwrite' as const },
    ],
    isMarkerOn: false,
    markerIndex: 0,
    topMarkers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock RealTimeSpectrumAnalyzer
    mockSpectrumAnalyzer = {
      state: JSON.parse(JSON.stringify(mockState)),
      changeCenterFreq: vi.fn(),
      changeBandwidth: vi.fn(),
      freqAutoTune: vi.fn(),
      togglePause: vi.fn(),
      resetMaxHoldData: vi.fn(),
      resetMinHoldData: vi.fn(),
      updateScreenVisibility: vi.fn(),
    } as unknown as Mocked<RealTimeSpectrumAnalyzer>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <!-- Frequency controls -->
      <input type="number" id="sa-center-freq" />
      <input type="number" id="sa-span" />
      <select id="sa-rbw">
        <option value="auto">Auto</option>
        <option value="0.001">1 kHz</option>
        <option value="0.01">10 kHz</option>
      </select>

      <!-- Amplitude controls -->
      <input type="number" id="sa-ref-level" />
      <select id="sa-scale">
        <option value="5">5 dB/div</option>
        <option value="10">10 dB/div</option>
      </select>
      <input type="number" id="sa-min-amp" />
      <input type="number" id="sa-max-amp" />

      <!-- Display controls -->
      <select id="sa-refresh">
        <option value="10">10 Hz</option>
        <option value="30">30 Hz</option>
      </select>
      <button id="sa-mode-spectral">Spectral</button>
      <button id="sa-mode-waterfall">Waterfall</button>
      <button id="sa-mode-both">Both</button>
      <button id="sa-auto-tune">Auto-Tune</button>
      <button id="sa-pause">Pause</button>

      <!-- Hold toggles -->
      <input type="checkbox" id="sa-max-hold" />
      <input type="checkbox" id="sa-min-hold" />

      <!-- Engineering controls container -->
      <div id="sa-engineering-controls"></div>

      <!-- Trace controls -->
      <button id="sa-trace-1" data-trace="1">T1</button>
      <button id="sa-trace-2" data-trace="2">T2</button>
      <button id="sa-trace-3" data-trace="3">T3</button>
      <input type="checkbox" id="sa-trace-visible" />
      <input type="checkbox" id="sa-trace-updating" />
      <select id="sa-trace-mode">
        <option value="clearwrite">Clear Write</option>
        <option value="maxhold">Max Hold</option>
      </select>

      <!-- Marker controls -->
      <input type="checkbox" id="sa-marker-enabled" />
      <input type="number" id="sa-marker-index" />
      <span id="sa-marker-info">Peak: --- MHz @ --- dBm</span>
    `;
    document.body.appendChild(containerEl);

    adapter = new SpectrumAnalyzerAdvancedAdapter(mockSpectrumAnalyzer, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(SpectrumAnalyzerAdvancedAdapter);
    });

    it('should register for SPEC_A_CONFIG_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SPEC_A_CONFIG_CHANGED, expect.any(Function));
    });

    it('should sync DOM with initial state', () => {
      const centerFreqInput = containerEl.querySelector('#sa-center-freq') as HTMLInputElement;
      expect(centerFreqInput.value).toBe('1500');
    });
  });

  describe('frequency controls', () => {
    it('should call changeCenterFreq when center frequency input changes', () => {
      const centerFreqInput = containerEl.querySelector('#sa-center-freq') as HTMLInputElement;
      centerFreqInput.value = '1600';
      centerFreqInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.changeCenterFreq).toHaveBeenCalledWith(1600e6);
    });

    it('should call changeBandwidth when span input changes', () => {
      const spanInput = containerEl.querySelector('#sa-span') as HTMLInputElement;
      spanInput.value = '200';
      spanInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.changeBandwidth).toHaveBeenCalledWith(200e6);
    });

    it('should update RBW when select changes', () => {
      const rbwSelect = containerEl.querySelector('#sa-rbw') as HTMLSelectElement;
      rbwSelect.value = '0.01';
      rbwSelect.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.rbw).toBe(10e3);
    });

    it('should set RBW to null when auto is selected', () => {
      mockSpectrumAnalyzer.state.rbw = 10e3;
      const rbwSelect = containerEl.querySelector('#sa-rbw') as HTMLSelectElement;
      rbwSelect.value = 'auto';
      rbwSelect.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.rbw).toBeNull();
    });
  });

  describe('amplitude controls', () => {
    it('should update reference level on input', () => {
      const refLevelInput = containerEl.querySelector('#sa-ref-level') as HTMLInputElement;
      refLevelInput.value = '-10';
      refLevelInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.state.referenceLevel).toBe(-10);
    });

    it('should update scale on select change', () => {
      const scaleSelect = containerEl.querySelector('#sa-scale') as HTMLSelectElement;
      scaleSelect.value = '5';
      scaleSelect.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.scaleDbPerDiv).toBe(5);
    });

    it('should update min amplitude on input', () => {
      const minAmpInput = containerEl.querySelector('#sa-min-amp') as HTMLInputElement;
      minAmpInput.value = '-100';
      minAmpInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.state.minAmplitude).toBe(-100);
    });

    it('should update max amplitude on input', () => {
      const maxAmpInput = containerEl.querySelector('#sa-max-amp') as HTMLInputElement;
      maxAmpInput.value = '10';
      maxAmpInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.state.maxAmplitude).toBe(10);
    });
  });

  describe('display controls', () => {
    it('should update refresh rate on select change', () => {
      const refreshSelect = containerEl.querySelector('#sa-refresh') as HTMLSelectElement;
      refreshSelect.value = '30';
      refreshSelect.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.refreshRate).toBe(30);
    });

    it('should update screen mode to spectralDensity when button clicked', () => {
      const spectralBtn = containerEl.querySelector('#sa-mode-spectral') as HTMLButtonElement;
      spectralBtn.click();

      expect(mockSpectrumAnalyzer.state.screenMode).toBe('spectralDensity');
      expect(mockSpectrumAnalyzer.updateScreenVisibility).toHaveBeenCalled();
    });

    it('should update screen mode to waterfall when button clicked', () => {
      const waterfallBtn = containerEl.querySelector('#sa-mode-waterfall') as HTMLButtonElement;
      waterfallBtn.click();

      expect(mockSpectrumAnalyzer.state.screenMode).toBe('waterfall');
    });

    it('should call freqAutoTune when auto-tune button clicked', () => {
      const autoTuneBtn = containerEl.querySelector('#sa-auto-tune') as HTMLButtonElement;
      autoTuneBtn.click();

      expect(mockSpectrumAnalyzer.freqAutoTune).toHaveBeenCalled();
    });

    it('should call togglePause when pause button clicked', () => {
      const pauseBtn = containerEl.querySelector('#sa-pause') as HTMLButtonElement;
      pauseBtn.click();

      expect(mockSpectrumAnalyzer.togglePause).toHaveBeenCalled();
    });
  });

  describe('trace controls', () => {
    it('should update selected trace on button click', () => {
      const trace2Btn = containerEl.querySelector('#sa-trace-2') as HTMLButtonElement;
      trace2Btn.click();

      expect(mockSpectrumAnalyzer.state.selectedTrace).toBe(2);
    });

    it('should update trace visibility on checkbox change', () => {
      const visibleCheckbox = containerEl.querySelector('#sa-trace-visible') as HTMLInputElement;
      visibleCheckbox.checked = false;
      visibleCheckbox.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.traces[0].isVisible).toBe(false);
    });

    it('should update trace updating on checkbox change', () => {
      const updatingCheckbox = containerEl.querySelector('#sa-trace-updating') as HTMLInputElement;
      updatingCheckbox.checked = false;
      updatingCheckbox.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.traces[0].isUpdating).toBe(false);
    });

    it('should update trace mode on select change', () => {
      const modeSelect = containerEl.querySelector('#sa-trace-mode') as HTMLSelectElement;
      modeSelect.value = 'maxhold';
      modeSelect.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.traces[0].mode).toBe('maxhold');
    });
  });

  describe('marker controls', () => {
    it('should update isMarkerOn on checkbox change', () => {
      const markerCheckbox = containerEl.querySelector('#sa-marker-enabled') as HTMLInputElement;
      markerCheckbox.checked = true;
      markerCheckbox.dispatchEvent(new Event('change'));

      expect(mockSpectrumAnalyzer.state.isMarkerOn).toBe(true);
    });

    it('should update marker index on input', () => {
      const markerIndexInput = containerEl.querySelector('#sa-marker-index') as HTMLInputElement;
      markerIndexInput.value = '5';
      markerIndexInput.dispatchEvent(new Event('input'));

      expect(mockSpectrumAnalyzer.state.markerIndex).toBe(5);
    });

    it('releases the Peak Search bin when the marker is turned off or moved by hand (phase 33 D10)', () => {
      const markerCheckbox = containerEl.querySelector('#sa-marker-enabled') as HTMLInputElement;
      mockSpectrumAnalyzer.state.peakMarkerBin = 42;
      markerCheckbox.checked = false;
      markerCheckbox.dispatchEvent(new Event('change'));
      expect(mockSpectrumAnalyzer.state.peakMarkerBin).toBeUndefined();

      const markerIndexInput = containerEl.querySelector('#sa-marker-index') as HTMLInputElement;
      mockSpectrumAnalyzer.state.peakMarkerBin = 42;
      markerIndexInput.value = '2';
      markerIndexInput.dispatchEvent(new Event('input'));
      expect(mockSpectrumAnalyzer.state.peakMarkerBin).toBeUndefined();
    });

    it('repaints the frozen screen when a marker changes while paused, not while live (phase 33 D10, r8-s01-F1)', () => {
      const redrawFrozen = vi.fn();
      (mockSpectrumAnalyzer as unknown as { redrawFrozen: () => void }).redrawFrozen = redrawFrozen;
      const markerCheckbox = containerEl.querySelector('#sa-marker-enabled') as HTMLInputElement;
      const markerIndexInput = containerEl.querySelector('#sa-marker-index') as HTMLInputElement;

      markerCheckbox.checked = true;
      markerCheckbox.dispatchEvent(new Event('change'));
      expect(redrawFrozen).not.toHaveBeenCalled();

      mockSpectrumAnalyzer.state.isPaused = true;
      markerCheckbox.checked = false;
      markerCheckbox.dispatchEvent(new Event('change'));
      markerCheckbox.checked = true;
      markerCheckbox.dispatchEvent(new Event('change'));
      expect(mockSpectrumAnalyzer.state.isUpdateMarkers).toBe(true);
      markerIndexInput.value = '3';
      markerIndexInput.dispatchEvent(new Event('input'));
      expect(redrawFrozen).toHaveBeenCalledTimes(3);
    });
  });

  describe('state change handling', () => {
    it('should sync DOM when state changes', () => {
      // Manually update state
      mockSpectrumAnalyzer.state.centerFrequency = 2000e6;

      // Trigger state change event
      const stateChangeHandler = mockEventBus.on.mock.calls.find((call) => call[0] === Events.SPEC_A_CONFIG_CHANGED)?.[1];

      if (stateChangeHandler) {
        stateChangeHandler({ ...mockSpectrumAnalyzer.state });
      }

      const centerFreqInput = containerEl.querySelector('#sa-center-freq') as HTMLInputElement;
      expect(centerFreqInput.value).toBe('2000');
    });

    it('should ignore state changes for different analyzer', () => {
      const originalValue = (containerEl.querySelector('#sa-center-freq') as HTMLInputElement).value;

      // Trigger state change event with different UUID
      const stateChangeHandler = mockEventBus.on.mock.calls.find((call) => call[0] === Events.SPEC_A_CONFIG_CHANGED)?.[1];

      if (stateChangeHandler) {
        stateChangeHandler({ uuid: 'different-uuid', centerFrequency: 3000e6 });
      }

      const centerFreqInput = containerEl.querySelector('#sa-center-freq') as HTMLInputElement;
      expect(centerFreqInput.value).toBe(originalValue);
    });
  });

  describe('event emission', () => {
    it('should emit state change event when controls are updated', () => {
      const refLevelInput = containerEl.querySelector('#sa-ref-level') as HTMLInputElement;
      refLevelInput.value = '-10';
      refLevelInput.dispatchEvent(new Event('input'));

      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.SPEC_A_CONFIG_CHANGED, expect.objectContaining({ referenceLevel: -10 }));
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.SPEC_A_CONFIG_CHANGED, expect.any(Function));
    });
  });
});

describe('SpectrumAnalyzerAdvancedAdapter formatting (phase 27)', () => {
  it('shows a span with the precision it needs, not toFixed(3)', () => {
    expect(SpectrumAnalyzerAdvancedAdapter.formatMHz(2e3)).toBe('0.002');
    expect(SpectrumAnalyzerAdvancedAdapter.formatMHz(1.1e3)).toBe('0.0011');
    expect(SpectrumAnalyzerAdvancedAdapter.formatMHz(1074.5e6)).toBe('1074.5');
  });

  it('annotates RBW in Hz, kHz and MHz', () => {
    expect(SpectrumAnalyzerAdvancedAdapter.formatHz(3)).toBe('3 Hz');
    expect(SpectrumAnalyzerAdvancedAdapter.formatHz(30e3)).toBe('30 kHz');
    expect(SpectrumAnalyzerAdvancedAdapter.formatHz(1e6)).toBe('1 MHz');
  });
});

describe('SpectrumAnalyzerAdvancedAdapter Ops Log lines and peak readout (phase 31 D13, D15)', () => {
  let analyzer: RealTimeSpectrumAnalyzer;
  let containerEl: HTMLElement;
  let adapter: SpectrumAnalyzerAdvancedAdapter;
  const w = globalThis as unknown as { signalRange?: unknown };

  beforeEach(() => {
    vi.useFakeTimers();
    logAction.mockClear();
    (EventBus.getInstance as Mock).mockReturnValue({ on: vi.fn(), off: vi.fn(), emit: vi.fn() });

    analyzer = {
      state: {
        uuid: 'sa-1',
        centerFrequency: 1490e6,
        span: 75e6,
        rbw: null,
        referenceLevel: -20,
        scaleDbPerDiv: 10,
        refreshRate: 10,
        isPaused: false,
        minAmplitude: -100,
        maxAmplitude: -30,
        screenMode: 'both',
        selectedTrace: 1,
        traces: [
          { isVisible: true, isUpdating: true, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'clearwrite' },
        ],
        isMarkerOn: false,
        markerIndex: 0,
        topMarkers: [],
      },
      effectiveRbwHz: 3,
      changeCenterFreq: vi.fn(),
      changeBandwidth: vi.fn(),
      updateScreenVisibility: vi.fn(),
      peakSearch: vi.fn(() => ({ frequencyHz: 1085.000001e6, levelDbm: -69.2, bin: 42, maxDbm: -69.0 })),
      spectrumDataProcessor: { combinedData: new Float32Array(100) },
    } as unknown as RealTimeSpectrumAnalyzer;

    w.signalRange = { simulationManager: { groundStations: [{ state: { id: 'VT-01' }, spectrumAnalyzers: [analyzer] }] } };

    containerEl = document.createElement('div');
    const inputs = ['sa-center-freq', 'sa-span', 'sa-ref-level', 'sa-min-amp', 'sa-max-amp', 'sa-marker-index'].map((id) => `<input type="number" id="${id}" />`);
    const checks = ['sa-trace-visible', 'sa-trace-updating', 'sa-marker-enabled'].map((id) => `<input type="checkbox" id="${id}" />`);
    const buttons = ['sa-mode-spectral', 'sa-mode-waterfall', 'sa-mode-both', 'sa-auto-tune', 'sa-pause', 'sa-peak-search', 'sa-trace-1', 'sa-trace-2', 'sa-trace-3'].map(
      (id) => `<button id="${id}"></button>`
    );
    containerEl.innerHTML = `
      ${inputs.join('')}${checks.join('')}${buttons.join('')}
      <select id="sa-rbw"><option value="auto">Auto</option><option value="0.1">100 kHz</option></select>
      <select id="sa-scale"><option value="10">10</option></select>
      <select id="sa-refresh"><option value="10">10</option></select>
      <select id="sa-trace-mode"><option value="clearwrite">CW</option></select>
      <div id="sa-engineering-controls"></div>
      <span id="sa-peak-readout"></span>
      <span id="sa-marker-info"></span>
    `;
    document.body.appendChild(containerEl);
    adapter = new SpectrumAnalyzerAdvancedAdapter(analyzer, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
    delete w.signalRange;
    vi.useRealTimers();
  });

  it('formats the settings line with Auto RBW and its value, or a manual RBW', () => {
    expect(SpectrumAnalyzerAdvancedAdapter.formatConfigLine(analyzer)).toBe('SPEC A: 1490.000 MHz, span 75.000 MHz, RBW Auto (3 Hz), -100/-30 dBm');
    analyzer.state.rbw = 100e3 as Hertz;
    expect(SpectrumAnalyzerAdvancedAdapter.formatConfigLine(analyzer)).toBe('SPEC A: 1490.000 MHz, span 75.000 MHz, RBW 100 kHz, -100/-30 dBm');
  });

  it('a retune across several fields writes one line, 1 s after the last commit, tagged with the station', () => {
    const centre = containerEl.querySelector('#sa-center-freq') as HTMLInputElement;
    const span = containerEl.querySelector('#sa-span') as HTMLInputElement;
    centre.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(2000);
    expect(logAction).not.toHaveBeenCalled(); // typing alone writes nothing

    centre.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(500);
    span.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(999);
    expect(logAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith('SPEC A: 1490.000 MHz, span 75.000 MHz, RBW Auto (3 Hz), -100/-30 dBm', 'SPEC A', 'VT-01');

    // The same settings committed again write nothing new
    span.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1000);
    expect(logAction).toHaveBeenCalledTimes(1);
  });

  it('Peak Search writes its result at once', () => {
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    expect(logAction).toHaveBeenCalledWith('SPEC A: Peak Search 1085.000001 MHz @ -69.2 dBm', 'SPEC A', 'VT-01');
  });

  it('Peak Search is one shot: the marker, the readout and the log line carry the same peak (phase 32 D11, phase 33 D10)', () => {
    const state = analyzer.state;
    state.topMarkers = [{ x: 7, y: 0.9, signal: -99.1 }]; // a stale noise-spike marker
    state.markerIndex = 0;
    (analyzer.peakSearch as Mock).mockClear();
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();

    expect(analyzer.peakSearch).toHaveBeenCalledTimes(1);
    expect(state.isMarkerOn).toBe(true);
    expect(state.topMarkers).toHaveLength(1);
    expect(state.topMarkers[0]).toMatchObject({ x: 42, signal: -69.2 });
    expect(state.markerIndex).toBe(0);
    expect(state.peakMarkerBin).toBe(42);
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: 1085.000001 MHz @ -69.2 dBm');
    expect(logAction).toHaveBeenCalledWith('SPEC A: Peak Search 1085.000001 MHz @ -69.2 dBm', 'SPEC A', 'VT-01');
  });

  it('a peak above Max Amp sits clamped at the top edge with its true level', () => {
    analyzer.state.maxAmplitude = -75;
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    expect(analyzer.state.topMarkers[0]).toMatchObject({ x: 42, y: 0, signal: -69.2 });
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: 1085.000001 MHz @ -69.2 dBm');
  });

  it('while the marker stays on the Peak Search bin, the readout and Mkr both read that bin now (phase 34 D1)', () => {
    const state = analyzer.state;
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    // A later sweep: the level at bin 42 moved, and a noise spike is now higher elsewhere
    // Bin 42 of 100 across 1452.5..1527.5 MHz: 1452.5 + 42.5 * 0.75 = 1484.375 MHz
    state.topMarkers = [{ x: 42, y: 0.5, signal: -69.6 }];
    state.markerIndex = 0;
    (analyzer.peakSearch as Mock).mockReturnValue({ frequencyHz: 1500e6, levelDbm: -60, bin: 63, maxDbm: -60 });
    (adapter as unknown as { syncLiveReadouts_: () => void }).syncLiveReadouts_();
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: 1484.375000 MHz @ -69.6 dBm');
    expect(containerEl.querySelector('#sa-marker-info')?.textContent).toBe('Mkr: 1484.375000 MHz @ -69.6 dBm');

    // The marker moved by hand: no pinned bin, the readout reads dashes (no fresh search)
    state.peakMarkerBin = undefined;
    (adapter as unknown as { syncLiveReadouts_: () => void }).syncLiveReadouts_();
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: --- MHz @ --- dBm');
  });

  it('reads dashes before any Peak Search, even with a peak on the trace (phase 34 D1, r9-s03-F1)', () => {
    (analyzer.peakSearch as Mock).mockClear();
    for (let n = 0; n < 3; n++) {
      (adapter as unknown as { syncLiveReadouts_: () => void }).syncLiveReadouts_();
    }
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: --- MHz @ --- dBm');
    expect(analyzer.peakSearch).not.toHaveBeenCalled();
  });

  it('a new adapter on the same analyzer shows the pinned marker, not a fresh peakSearch() (phase 34 D1, tab round trip)', () => {
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    analyzer.state.topMarkers = [{ x: 42, y: 0.5, signal: -69.6 }];
    adapter.dispose();
    (analyzer.peakSearch as Mock).mockReturnValue({ frequencyHz: 1500e6, levelDbm: -60, bin: 63, maxDbm: -60 });
    (analyzer.peakSearch as Mock).mockClear();

    adapter = new SpectrumAnalyzerAdvancedAdapter(analyzer, containerEl);

    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: 1484.375000 MHz @ -69.6 dBm');
    expect(analyzer.peakSearch).not.toHaveBeenCalled();
  });

  it('prints the plot label, the SPEC A line and the readout with the same six decimals (phase 34 D3, r9-s15-F1)', () => {
    (analyzer.peakSearch as Mock).mockReturnValue({ frequencyHz: 1489.95449e6, levelDbm: -54.4, bin: 50, maxDbm: -54.4 });
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    expect(SpectralDensityPlot.formatMarkerMHz(1489.95449e6)).toBe('1489.954490');
    expect(containerEl.querySelector('#sa-peak-readout')?.textContent).toBe('Peak: 1489.954490 MHz @ -54.4 dBm');
    expect(logAction).toHaveBeenCalledWith('SPEC A: Peak Search 1489.954490 MHz @ -54.4 dBm', 'SPEC A', 'VT-01');
  });

  it('a paused Peak Search repaints the frozen screen before the readouts; a live one does not', () => {
    const redrawFrozen = vi.fn();
    (analyzer as unknown as { redrawFrozen: () => void }).redrawFrozen = redrawFrozen;
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    expect(redrawFrozen).not.toHaveBeenCalled();

    analyzer.state.isPaused = true;
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    expect(redrawFrozen).toHaveBeenCalledTimes(1);
    expect(redrawFrozen.mock.invocationCallOrder[0]).toBeLessThan(logAction.mock.invocationCallOrder.at(-1)!);
  });
});

describe('Peak Search end to end: log line = readout = marker (phase 33 D10, r7-s15-F1, r8-s01-F1)', () => {
  const WIDTH = 800;
  const HEIGHT = 230;
  let analyzer: RealTimeSpectrumAnalyzer;
  let dataProcessor: { combinedData: Float32Array; noiseData: Float32Array };
  let plot: SpectralDensityPlot;
  let containerEl: HTMLElement;
  let adapter: SpectrumAnalyzerAdvancedAdapter;
  const w = globalThis as unknown as { signalRange?: unknown };
  let seed = 1;
  /** Deterministic noise in [-0.5, 0.5) */
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };

  const sweep = (carrier: (x: number) => number): void => {
    const data = new Float32Array(WIDTH);
    for (let x = 0; x < WIDTH; x++) {
      data[x] = carrier(x);
    }
    dataProcessor.combinedData = data;
    vi.advanceTimersByTime(1000);
    if (!analyzer.state.isPaused) {
      plot.update();
      plot.draw();
    }
    (adapter as unknown as { syncLiveReadouts_: () => void }).syncLiveReadouts_();
  };
  const text = (id: string): string => containerEl.querySelector(`#${id}`)?.textContent ?? '';
  /** Frequency (MHz) and level (dBm) out of a "... 1490.125 MHz @ -54.4 dBm" line */
  const parse = (line: string): { mhz: number; dbm: number } => {
    const match = /(-?\d+(?:\.\d+)?) MHz @ (-?\d+\.\d) dBm/u.exec(line);
    return { mhz: Number(match?.[1]), dbm: Number(match?.[2]) };
  };
  const logLine = (): string => String(logAction.mock.calls.at(-1)?.[0] ?? '');

  beforeEach(() => {
    vi.useFakeTimers();
    logAction.mockClear();
    seed = 1;
    (EventBus.getInstance as Mock).mockReturnValue({ on: vi.fn(), off: vi.fn(), emit: vi.fn() });
    dataProcessor = { combinedData: new Float32Array(WIDTH).fill(-90), noiseData: new Float32Array(WIDTH).fill(-100) };
    analyzer = Object.assign(Object.create(RealTimeSpectrumAnalyzer.prototype) as RealTimeSpectrumAnalyzer, {
      uuid: 'sa-e2e',
      dataProcessor: dataProcessor as unknown as SpectrumDataProcessor,
      spectralDensity: null,
      inputSignals: [],
      state: {
        uuid: 'sa-e2e',
        centerFrequency: 1490e6,
        span: 75e6,
        rbw: 1e6,
        referenceLevel: -20,
        scaleDbPerDiv: 10,
        refreshRate: 10,
        isPaused: false,
        minAmplitude: -100,
        maxAmplitude: -30,
        noiseFloorNoGain: -95,
        isSkipLnaGainDuringDraw: true,
        screenMode: 'both',
        selectedTrace: 1,
        traces: [
          { isVisible: true, isUpdating: true, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'clearwrite' },
        ],
        isMarkerOn: false,
        isUpdateMarkers: false,
        markerIndex: 0,
        topMarkers: [],
      },
    });
    const canvas = document.createElement('canvas');
    plot = new SpectralDensityPlot(canvas, analyzer, dataProcessor as unknown as SpectrumDataProcessor, WIDTH, HEIGHT);
    plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
    analyzer.spectralDensityBoth = plot;
    vi.advanceTimersByTime(1100);

    w.signalRange = { simulationManager: { groundStations: [{ state: { id: 'VT-01' }, spectrumAnalyzers: [analyzer] }] } };
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <input type="number" id="sa-center-freq" /><input type="number" id="sa-span" /><input type="number" id="sa-ref-level" />
      <input type="number" id="sa-min-amp" /><input type="number" id="sa-max-amp" /><input type="number" id="sa-marker-index" />
      <input type="checkbox" id="sa-trace-visible" /><input type="checkbox" id="sa-trace-updating" /><input type="checkbox" id="sa-marker-enabled" />
      <button id="sa-mode-spectral"></button><button id="sa-mode-waterfall"></button><button id="sa-mode-both"></button>
      <button id="sa-auto-tune"></button><button id="sa-pause"></button><button id="sa-peak-search"></button>
      <button id="sa-trace-1"></button><button id="sa-trace-2"></button><button id="sa-trace-3"></button>
      <select id="sa-rbw"><option value="auto">Auto</option></select>
      <select id="sa-scale"><option value="10">10</option></select>
      <select id="sa-refresh"><option value="10">10</option></select>
      <select id="sa-trace-mode"><option value="clearwrite">CW</option></select>
      <div id="sa-engineering-controls"></div>
      <span id="sa-peak-readout"></span>
      <span id="sa-marker-info"></span>
    `;
    document.body.appendChild(containerEl);
    adapter = new SpectrumAnalyzerAdvancedAdapter(analyzer, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    plot.dispose();
    document.body.innerHTML = '';
    delete w.signalRange;
    vi.useRealTimers();
  });

  const clickAndCheck = (): { mhz: number; dbm: number } => {
    (containerEl.querySelector('#sa-peak-search') as HTMLButtonElement).click();
    const logged = parse(logLine());
    expect(logLine()).toMatch(/^SPEC A: Peak Search /u);
    expect(parse(text('sa-peak-readout'))).toEqual(logged);
    expect(parse(text('sa-marker-info'))).toEqual(logged);
    return logged;
  };

  it('on a flat top: the click, the readout and the marker agree, and stay so across 20 sweeps', () => {
    const flatTop = (x: number): number => (x >= 300 && x <= 500 ? -54.4 : -90);
    sweep(flatTop);
    const logged = clickAndCheck();
    const bin = analyzer.state.peakMarkerBin;
    expect(bin).toBe(400);

    for (let n = 0; n < 20; n++) {
      sweep(flatTop);
      expect(analyzer.state.peakMarkerBin).toBe(bin);
      expect(parse(text('sa-peak-readout'))).toEqual(logged);
      expect(parse(text('sa-marker-info'))).toEqual(logged);
    }
  });

  it('on noise: the marker stays on its bin and the readout follows it, the level there each sweep (phase 34 D1)', () => {
    const noisyTop = (x: number): number => (x >= 300 && x <= 500 ? -54.4 + noise() * 0.6 : -90 + noise() * 2);
    sweep(noisyTop);
    const logged = clickAndCheck();
    const bin = analyzer.state.peakMarkerBin!;

    for (let n = 0; n < 20; n++) {
      sweep(noisyTop);
      expect(analyzer.state.peakMarkerBin).toBe(bin);
      const readout = parse(text('sa-peak-readout'));
      const marker = parse(text('sa-marker-info'));
      expect(readout).toEqual(marker);
      expect(marker.mhz).toBe(logged.mhz);
      expect(marker.dbm).toBeCloseTo(plot.selectedTraceData![bin], 1);
    }
    expect(logAction.mock.calls.filter(([line]) => String(line).startsWith('SPEC A: Peak Search'))).toHaveLength(1);
  });

  it('a retune releases the marker: Peak and Mkr read dashes, isMarkerOn false, no re-pick (phase 34 D2, r9-s03-F1)', () => {
    const carrier = (x: number): number => (x === 400 ? -50 : -90);
    sweep(carrier);
    clickAndCheck();
    expect(analyzer.state.isMarkerOn).toBe(true);

    plot.setFrequencyRange(1462.5e6 as Hertz, 1537.5e6 as Hertz);
    sweep((x) => (x === 250 ? -45 : -90));
    expect(analyzer.state.isMarkerOn).toBe(false);
    expect(analyzer.state.peakMarkerBin).toBeUndefined();
    expect(text('sa-peak-readout')).toBe('Peak: --- MHz @ --- dBm');
    expect(text('sa-marker-info')).toBe('Mkr: --- MHz @ --- dBm');
    expect((containerEl.querySelector('#sa-marker-enabled') as HTMLInputElement).checked).toBe(false);

    // Further sweeps on the new window never place a marker by themselves
    sweep((x) => (x === 250 ? -45 : -90));
    expect(text('sa-peak-readout')).toBe('Peak: --- MHz @ --- dBm');
  });

  it('an amplitude-only change keeps the marker on its bin', () => {
    sweep((x) => (x === 400 ? -50 : -90));
    const logged = clickAndCheck();
    analyzer.state.maxAmplitude = -20;
    sweep((x) => (x === 400 ? -50 : -90));
    expect(analyzer.state.isMarkerOn).toBe(true);
    expect(analyzer.state.peakMarkerBin).toBe(400);
    expect(parse(text('sa-peak-readout'))).toEqual(logged);
  });

  it('paused: Peak Search reads the frozen trace on screen, not the live frame', () => {
    sweep((x) => (x === 250 ? -50 : -90));
    analyzer.state.isPaused = true;
    // The live frame moves on; the screen does not
    sweep((x) => (x === 600 ? -40 : -90));
    const logged = clickAndCheck();
    expect(analyzer.state.peakMarkerBin).toBe(250);
    expect(logged.dbm).toBe(-50);
  });
});
