import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import {
  RealTimeSpectrumAnalyzer,
  RealTimeSpectrumAnalyzerState
} from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import type { TraceMode } from "@app/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn";
import type { dB, Hertz } from "@app/types";

/**
 * SpectrumAnalyzerAdvancedAdapter - Modern UI controls for spectrum analyzer
 *
 * Provides complete control over RealTimeSpectrumAnalyzerState:
 * - Frequency: center frequency, span, RBW
 * - Amplitude: reference level, scale, min/max amplitude
 * - Display: screen mode, pause, refresh rate
 * - Traces: selection, visibility, updating, mode
 * - Hold modes: max hold, min hold
 * - Markers: enable, index
 *
 * All frequency inputs are in MHz and converted to Hz when updating state.
 */
export class SpectrumAnalyzerAdvancedAdapter {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private lastStateString: string = '';
  private readonly stateChangeHandler_: (state: Partial<RealTimeSpectrumAnalyzerState>) => void;

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;

    this.stateChangeHandler_ = this.handleStateChange_.bind(this);

    this.setupDomCache_();
    this.setupEventListeners_();
    this.subscribeToStateChanges_();
    this.syncDomWithState_();

    // TODO: Implement keyboard shortcuts later
    // this.setupKeyboardShortcuts_();
  }

  // ============ Conversion Helpers ============

  /** Convert MHz to Hz */
  private toHz_(mhz: number): number {
    return mhz * 1e6;
  }

  /** Convert Hz to MHz */
  private toMHz_(hz: number): number {
    return hz / 1e6;
  }

  // ============ DOM Setup ============

  private setupDomCache_(): void {
    const ids = [
      // Frequency controls
      'sa-center-freq',
      'sa-span',
      'sa-rbw',
      // Amplitude controls
      'sa-ref-level',
      'sa-scale',
      'sa-min-amp', 'sa-max-amp',
      // Display controls
      'sa-refresh',
      'sa-mode-spectral', 'sa-mode-waterfall', 'sa-mode-both',
      'sa-auto-tune', 'sa-pause',
      'sa-max-hold', 'sa-min-hold',
      // Trace controls
      'sa-trace-1', 'sa-trace-2', 'sa-trace-3',
      'sa-trace-visible', 'sa-trace-updating', 'sa-trace-mode',
      // Marker controls
      'sa-marker-enabled', 'sa-marker-index', 'sa-marker-info'
    ];

    ids.forEach(id => {
      const el = qs(`#${id}`, this.containerEl);
      if (el) {
        this.domCache_.set(id, el);
      }
    });
  }

  private setupEventListeners_(): void {
    // Frequency controls
    this.addInputHandler_('sa-center-freq', this.handleCenterFreqChange_.bind(this));
    this.addInputHandler_('sa-span', this.handleSpanChange_.bind(this));
    this.addChangeHandler_('sa-rbw', this.handleRbwChange_.bind(this));

    // Amplitude controls
    this.addInputHandler_('sa-ref-level', this.handleRefLevelChange_.bind(this));
    this.addChangeHandler_('sa-scale', this.handleScaleChange_.bind(this));
    this.addInputHandler_('sa-min-amp', this.handleMinAmpChange_.bind(this));
    this.addInputHandler_('sa-max-amp', this.handleMaxAmpChange_.bind(this));

    // Refresh rate (select dropdown)
    this.addChangeHandler_('sa-refresh', this.handleRefreshChange_.bind(this));

    // Display mode buttons
    this.addClickHandler_('sa-mode-spectral', () => this.handleModeChange_('spectralDensity'));
    this.addClickHandler_('sa-mode-waterfall', () => this.handleModeChange_('waterfall'));
    this.addClickHandler_('sa-mode-both', () => this.handleModeChange_('both'));

    // Action buttons
    this.addClickHandler_('sa-auto-tune', this.handleAutoTune_.bind(this));
    this.addClickHandler_('sa-pause', this.handlePauseToggle_.bind(this));

    // Hold toggles
    this.addChangeHandler_('sa-max-hold', this.handleMaxHoldChange_.bind(this));
    this.addChangeHandler_('sa-min-hold', this.handleMinHoldChange_.bind(this));

    // Trace controls
    this.addClickHandler_('sa-trace-1', () => this.handleTraceSelect_(1));
    this.addClickHandler_('sa-trace-2', () => this.handleTraceSelect_(2));
    this.addClickHandler_('sa-trace-3', () => this.handleTraceSelect_(3));
    this.addChangeHandler_('sa-trace-visible', this.handleTraceVisibleChange_.bind(this));
    this.addChangeHandler_('sa-trace-updating', this.handleTraceUpdatingChange_.bind(this));
    this.addChangeHandler_('sa-trace-mode', this.handleTraceModeChange_.bind(this));

    // Marker controls
    this.addChangeHandler_('sa-marker-enabled', this.handleMarkerEnabledChange_.bind(this));
    this.addInputHandler_('sa-marker-index', this.handleMarkerIndexChange_.bind(this));
  }

  private addInputHandler_(id: string, handler: (e: Event) => void): void {
    const el = this.domCache_.get(id);
    if (el) {
      el.addEventListener('input', handler);
      this.boundHandlers.set(`${id}-input`, handler as EventListener);
    }
  }

  private addChangeHandler_(id: string, handler: (e: Event) => void): void {
    const el = this.domCache_.get(id);
    if (el) {
      el.addEventListener('change', handler);
      this.boundHandlers.set(`${id}-change`, handler as EventListener);
    }
  }

  private addClickHandler_(id: string, handler: () => void): void {
    const el = this.domCache_.get(id);
    if (el) {
      el.addEventListener('click', handler);
      this.boundHandlers.set(`${id}-click`, handler as EventListener);
    }
  }

  // ============ Event Bus ============

  private subscribeToStateChanges_(): void {
    EventBus.getInstance().on(Events.SPEC_A_CONFIG_CHANGED, this.stateChangeHandler_);
  }

  private handleStateChange_(state: Partial<RealTimeSpectrumAnalyzerState>): void {
    // Only sync if this is for our analyzer
    if (state.uuid && state.uuid !== this.spectrumAnalyzer.state.uuid) {
      return;
    }
    this.syncDomWithState_();
  }

  // ============ Control Handlers ============

  private handleCenterFreqChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.changeCenterFreq(this.toHz_(value));
    }
  }

  private handleSpanChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.changeBandwidth(this.toHz_(value));
    }
  }

  private handleRbwChange_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    if (value === 'auto') {
      this.spectrumAnalyzer.state.rbw = null;
    } else {
      this.spectrumAnalyzer.state.rbw = this.toHz_(parseFloat(value)) as Hertz;
    }
    this.emitStateChange_();
  }

  private handleRefLevelChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.referenceLevel = value;
      this.emitStateChange_();
    }
  }

  private handleScaleChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLSelectElement).value);
    this.spectrumAnalyzer.state.scaleDbPerDiv = value as dB;
    this.emitStateChange_();
  }

  private handleMinAmpChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.minAmplitude = value;
      this.emitStateChange_();
    }
  }

  private handleMaxAmpChange_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.maxAmplitude = value;
      this.emitStateChange_();
    }
  }

  private handleRefreshChange_(e: Event): void {
    const value = parseInt((e.target as HTMLSelectElement).value, 10);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.refreshRate = value;
      this.emitStateChange_();
    }
  }

  private handleModeChange_(mode: 'spectralDensity' | 'waterfall' | 'both'): void {
    this.spectrumAnalyzer.state.screenMode = mode;
    this.spectrumAnalyzer.updateScreenVisibility();
    this.updateModeButtons_(mode);
    this.emitStateChange_();
  }

  private handleAutoTune_(): void {
    this.spectrumAnalyzer.freqAutoTune();
    this.syncDomWithState_();
  }

  private handlePauseToggle_(): void {
    this.spectrumAnalyzer.togglePause();
    this.updatePauseButton_();
  }

  private handleMaxHoldChange_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.spectrumAnalyzer.state.isMaxHold = checked;
    if (!checked) {
      this.spectrumAnalyzer.resetMaxHoldData();
    }
    this.emitStateChange_();
  }

  private handleMinHoldChange_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.spectrumAnalyzer.state.isMinHold = checked;
    if (!checked) {
      this.spectrumAnalyzer.resetMinHoldData();
    }
    this.emitStateChange_();
  }

  private handleTraceSelect_(traceNum: number): void {
    this.spectrumAnalyzer.state.selectedTrace = traceNum;
    this.updateTraceButtons_();
    this.updateTraceControls_();
    this.emitStateChange_();
  }

  private handleTraceVisibleChange_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    const traceIndex = this.spectrumAnalyzer.state.selectedTrace - 1;
    if (this.spectrumAnalyzer.state.traces[traceIndex]) {
      this.spectrumAnalyzer.state.traces[traceIndex].isVisible = checked;
      this.emitStateChange_();
    }
  }

  private handleTraceUpdatingChange_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    const traceIndex = this.spectrumAnalyzer.state.selectedTrace - 1;
    if (this.spectrumAnalyzer.state.traces[traceIndex]) {
      this.spectrumAnalyzer.state.traces[traceIndex].isUpdating = checked;
      this.emitStateChange_();
    }
  }

  private handleTraceModeChange_(e: Event): void {
    const mode = (e.target as HTMLSelectElement).value as TraceMode;
    const traceIndex = this.spectrumAnalyzer.state.selectedTrace - 1;
    if (this.spectrumAnalyzer.state.traces[traceIndex]) {
      this.spectrumAnalyzer.state.traces[traceIndex].mode = mode;
      this.emitStateChange_();
    }
  }

  private handleMarkerEnabledChange_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.spectrumAnalyzer.state.isMarkerOn = checked;
    this.emitStateChange_();
  }

  private handleMarkerIndexChange_(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0) {
      this.spectrumAnalyzer.state.markerIndex = value;
      this.emitStateChange_();
    }
  }

  // ============ State Emission ============

  private emitStateChange_(): void {
    EventBus.getInstance().emit(Events.SPEC_A_CONFIG_CHANGED, {
      ...this.spectrumAnalyzer.state
    });
  }

  // ============ DOM Sync ============

  private syncDomWithState_(): void {
    const state = this.spectrumAnalyzer.state;

    // Prevent circular updates
    const relevantState = {
      centerFrequency: state.centerFrequency,
      span: state.span,
      rbw: state.rbw,
      referenceLevel: state.referenceLevel,
      scaleDbPerDiv: state.scaleDbPerDiv,
      minAmplitude: state.minAmplitude,
      maxAmplitude: state.maxAmplitude,
      refreshRate: state.refreshRate,
      screenMode: state.screenMode,
      isPaused: state.isPaused,
      isMaxHold: state.isMaxHold,
      isMinHold: state.isMinHold,
      selectedTrace: state.selectedTrace,
      traces: state.traces,
      isMarkerOn: state.isMarkerOn,
      markerIndex: state.markerIndex,
      topMarkers: state.topMarkers
    };

    const stateString = JSON.stringify(relevantState);
    if (stateString === this.lastStateString) {
      return;
    }
    this.lastStateString = stateString;

    // Frequency controls
    this.setInputValue_('sa-center-freq', this.toMHz_(state.centerFrequency).toFixed(3));
    this.setInputValue_('sa-span', this.toMHz_(state.span).toFixed(3));

    // RBW select
    const rbwSelect = this.domCache_.get('sa-rbw') as HTMLSelectElement;
    if (rbwSelect) {
      if (state.rbw === null) {
        rbwSelect.value = 'auto';
      } else {
        rbwSelect.value = this.toMHz_(state.rbw).toString();
      }
    }

    // Amplitude controls
    this.setInputValue_('sa-ref-level', state.referenceLevel.toString());

    const scaleSelect = this.domCache_.get('sa-scale') as HTMLSelectElement;
    if (scaleSelect) {
      scaleSelect.value = state.scaleDbPerDiv.toString();
    }

    this.setInputValue_('sa-min-amp', state.minAmplitude.toString());
    this.setInputValue_('sa-max-amp', state.maxAmplitude.toString());

    // Refresh rate (select dropdown)
    this.setInputValue_('sa-refresh', state.refreshRate.toString());

    // Display mode
    this.updateModeButtons_(state.screenMode);

    // Pause button
    this.updatePauseButton_();

    // Hold toggles
    this.setCheckboxValue_('sa-max-hold', state.isMaxHold);
    this.setCheckboxValue_('sa-min-hold', state.isMinHold);

    // Trace controls
    this.updateTraceButtons_();
    this.updateTraceControls_();

    // Marker controls
    this.setCheckboxValue_('sa-marker-enabled', state.isMarkerOn);
    this.setInputValue_('sa-marker-index', state.markerIndex.toString());
    this.updateMarkerInfo_();
  }

  private setInputValue_(id: string, value: string): void {
    const el = this.domCache_.get(id) as HTMLInputElement;
    if (el) {
      el.value = value;
    }
  }

  private setCheckboxValue_(id: string, checked: boolean): void {
    const el = this.domCache_.get(id) as HTMLInputElement;
    if (el) {
      el.checked = checked;
    }
  }

  private updateModeButtons_(mode: 'spectralDensity' | 'waterfall' | 'both'): void {
    const spectralBtn = this.domCache_.get('sa-mode-spectral');
    const waterfallBtn = this.domCache_.get('sa-mode-waterfall');
    const bothBtn = this.domCache_.get('sa-mode-both');

    [spectralBtn, waterfallBtn, bothBtn].forEach(btn => {
      btn?.classList.remove('active');
    });

    switch (mode) {
      case 'spectralDensity':
        spectralBtn?.classList.add('active');
        break;
      case 'waterfall':
        waterfallBtn?.classList.add('active');
        break;
      case 'both':
        bothBtn?.classList.add('active');
        break;
    }
  }

  private updatePauseButton_(): void {
    const pauseBtn = this.domCache_.get('sa-pause');
    if (pauseBtn) {
      const isPaused = this.spectrumAnalyzer.state.isPaused;
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
      pauseBtn.className = isPaused
        ? 'btn btn-success btn-sm'
        : 'btn btn-warning btn-sm';
    }
  }

  private updateTraceButtons_(): void {
    const selectedTrace = this.spectrumAnalyzer.state.selectedTrace;

    for (let i = 1; i <= 3; i++) {
      const btn = this.domCache_.get(`sa-trace-${i}`);
      if (btn) {
        btn.classList.toggle('active', i === selectedTrace);
      }
    }
  }

  private updateTraceControls_(): void {
    const state = this.spectrumAnalyzer.state;
    const traceIndex = state.selectedTrace - 1;
    const trace = state.traces[traceIndex];

    if (trace) {
      this.setCheckboxValue_('sa-trace-visible', trace.isVisible);
      this.setCheckboxValue_('sa-trace-updating', trace.isUpdating);

      const modeSelect = this.domCache_.get('sa-trace-mode') as HTMLSelectElement;
      if (modeSelect) {
        modeSelect.value = trace.mode;
      }
    }
  }

  private updateMarkerInfo_(): void {
    const state = this.spectrumAnalyzer.state;
    const markerInfo = this.domCache_.get('sa-marker-info');

    if (markerInfo && state.isMarkerOn && state.topMarkers && state.topMarkers.length > 0) {
      const marker = state.topMarkers[state.markerIndex] || state.topMarkers[0];
      if (marker) {
        const freqMHz = this.toMHz_(marker.x).toFixed(3);
        const power = marker.signal.toFixed(1);
        markerInfo.textContent = `Peak: ${freqMHz} MHz @ ${power} dBm`;
      }
    } else if (markerInfo) {
      markerInfo.textContent = 'Peak: --- MHz @ --- dBm';
    }
  }

  // ============ Cleanup ============

  dispose(): void {
    // Unsubscribe from EventBus
    EventBus.getInstance().off(Events.SPEC_A_CONFIG_CHANGED, this.stateChangeHandler_);

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      const [id, eventType] = key.split('-');
      const el = this.domCache_.get(id);
      if (el && eventType) {
        el.removeEventListener(eventType, handler);
      }
    });

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
