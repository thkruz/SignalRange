import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { qs } from '@app/engine/utils/query-selector';
import { EngineeringModeService } from '@app/engineering-mode/engineering-mode-service';
import type { TraceMode } from '@app/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectralDensityPlot } from '@app/equipment/real-time-spectrum-analyzer/rtsa-screen/spectral-density-plot';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { EventAutoLogger } from '@app/ops-log/event-auto-logger';
import type { dB, Hertz } from '@app/types';
import { parseLocalizedNumber } from '@app/utils/parse-number';

/**
 * SpectrumAnalyzerAdvancedAdapter - Modern UI controls for spectrum analyzer
 *
 * Provides complete control over RealTimeSpectrumAnalyzerState:
 * - Frequency: center frequency, span, RBW
 * - Amplitude: reference level, scale, min/max amplitude
 * - Display: screen mode, pause, refresh rate
 * - Traces: selection, visibility, updating, mode
 * - Markers: enable, index
 *
 * Engineering mode controls (Ref Level, Scale, Refresh, Markers) are hidden
 * by default and shown when ENGINEERING_MODE is enabled.
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
  private readonly updateHandler_: () => void;
  private lastLiveSyncMs_: number = 0;
  /** Live readouts (peak, RBW in use) refresh at most this often, ms */
  private static readonly LIVE_READOUT_INTERVAL_MS = 500;
  /** A retune across several fields writes one Ops Log line after this quiet time, ms (phase 31 D13) */
  static readonly CONFIG_LOG_DEBOUNCE_MS = 1000;
  /** Pending config-line timer per analyzer: survives an adapter rebuilt mid-debounce */
  private static readonly configLogTimers_ = new Map<RealTimeSpectrumAnalyzer, ReturnType<typeof setTimeout>>();
  /** Last config line written per analyzer, so a no-op commit writes nothing */
  private static readonly lastConfigLine_ = new WeakMap<RealTimeSpectrumAnalyzer, string>();
  /** Committed-change ('change' event) listeners that schedule the config line */
  private readonly commitLogListeners_: [HTMLElement, EventListener][] = [];

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;

    this.stateChangeHandler_ = this.handleStateChange_.bind(this);
    this.updateHandler_ = this.throttledLiveSync_.bind(this);

    this.setupDomCache_();
    this.setupEventListeners_();
    this.subscribeToStateChanges_();
    this.setupEngineeringModeListener_();
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

  /**
   * A frequency in MHz with the precision it needs (to 1 Hz), trailing zeros
   * dropped: a 2 kHz span reads 0.002, a 1.1 kHz one 0.0011, not 0.001
   */
  static formatMHz(hz: number): string {
    return Number.parseFloat((hz / 1e6).toFixed(6)).toString();
  }

  /** Hz as the analyzer annotates RBW: 3 Hz, 30 kHz, 1 MHz */
  static formatHz(hz: number): string {
    if (hz >= 1e6) {
      return `${Number.parseFloat((hz / 1e6).toFixed(3))} MHz`;
    }
    if (hz >= 1e3) {
      return `${Number.parseFloat((hz / 1e3).toFixed(3))} kHz`;
    }

    return `${Number.parseFloat(hz.toFixed(1))} Hz`;
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
      'sa-min-amp',
      'sa-max-amp',
      // Display controls
      'sa-refresh',
      'sa-mode-spectral',
      'sa-mode-waterfall',
      'sa-mode-both',
      'sa-auto-tune',
      'sa-pause',
      // Engineering controls container
      'sa-engineering-controls',
      // Trace controls
      'sa-trace-1',
      'sa-trace-2',
      'sa-trace-3',
      'sa-trace-visible',
      'sa-trace-updating',
      'sa-trace-mode',
      // Marker controls
      'sa-marker-enabled',
      'sa-marker-index',
      'sa-marker-info',
    ];

    ids.forEach((id) => {
      const el = qs(`#${id}`, this.containerEl);
      if (el) {
        this.domCache_.set(id, el);
      }
    });

    // Peak Search and live readouts (phase 27); optional so an older layout still binds
    for (const id of ['sa-peak-search', 'sa-peak-readout', 'sa-rbw-status']) {
      const el = this.containerEl.querySelector<HTMLElement>(`#${id}`);
      if (el) {
        this.domCache_.set(id, el);
      }
    }
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
    // A scenario whose lesson is finding the signal by hand hides AUTO-TUNE (nats-s05-F3)
    if (this.spectrumAnalyzer.state.isAutoTuneAvailable === false) {
      this.domCache_.get('sa-auto-tune')?.classList.add('d-none');
    }
    this.addClickHandler_('sa-pause', this.handlePauseToggle_.bind(this));
    this.addClickHandler_('sa-peak-search', this.handlePeakSearch_.bind(this));

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

    // A committed retune (Enter, blur, select) writes one Ops Log line (phase 31 D13)
    for (const id of ['sa-center-freq', 'sa-span', 'sa-rbw', 'sa-ref-level', 'sa-min-amp', 'sa-max-amp']) {
      const el = this.domCache_.get(id);
      if (el) {
        const listener: EventListener = () => this.scheduleConfigLog_();
        el.addEventListener('change', listener);
        this.commitLogListeners_.push([el, listener]);
      }
    }
  }

  private addInputHandler_(id: string, handler: (e: Event) => void): void {
    const el = this.domCache_.get(id);
    if (el) {
      el.addEventListener('input', handler);
      this.boundHandlers.set(`${id}-input`, handler as EventListener);
      // Enter and blur commit too (change), so a value typed in one go still
      // lands even if an intermediate keystroke was out of range (nats-s05-F4)
      el.addEventListener('change', handler);
      this.boundHandlers.set(`${id}-change`, handler as EventListener);
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
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);
  }

  /** Peak readout and RBW-in-use follow the live trace, throttled */
  private throttledLiveSync_(): void {
    const now = Date.now();
    if (now - this.lastLiveSyncMs_ < SpectrumAnalyzerAdvancedAdapter.LIVE_READOUT_INTERVAL_MS) {
      return;
    }
    this.lastLiveSyncMs_ = now;
    this.syncLiveReadouts_();
  }

  private syncLiveReadouts_(): void {
    const analyzer = this.spectrumAnalyzer;

    const peakReadout = this.domCache_.get('sa-peak-readout');
    if (peakReadout) {
      // Built from analyzer state only (phase 34 D1, r9-s03-F1): the pinned
      // Peak Search bin and its live level, the same marker the plot labels.
      // No pinned bin (before any Peak Search, after a retune) reads dashes, and
      // a rebuilt adapter shows the marker the analyzer still holds
      const state = analyzer.state;
      const peak = state.isMarkerOn && state.peakMarkerBin !== undefined ? this.activeMarker_() : null;
      peakReadout.textContent = SpectrumAnalyzerAdvancedAdapter.formatPeakReadout(peak);
    }
    // A retune releases the marker on the plot (phase 34 D2): the checkbox follows
    this.setCheckboxValue_('sa-marker-enabled', analyzer.state.isMarkerOn);

    const rbwStatus = this.domCache_.get('sa-rbw-status');
    if (rbwStatus && typeof analyzer.effectiveRbwHz === 'number') {
      const inUse = SpectrumAnalyzerAdvancedAdapter.formatHz(analyzer.effectiveRbwHz);
      // A manual RBW too narrow for the span is coupled up, and says so
      rbwStatus.textContent = analyzer.isRbwLimited ? `RBW ${inUse} (span limit)` : `RBW ${inUse}`;
      rbwStatus.classList.toggle('text-warning', Boolean(analyzer.isRbwLimited));
      rbwStatus.classList.toggle('text-muted', !analyzer.isRbwLimited);
    }

    this.updateMarkerInfo_();
  }

  private handleStateChange_(state: Partial<RealTimeSpectrumAnalyzerState>): void {
    // Only sync if this is for our analyzer
    if (state.uuid && state.uuid !== this.spectrumAnalyzer.state.uuid) {
      return;
    }
    this.syncDomWithState_();
  }

  // ============ Engineering Mode ============

  private setupEngineeringModeListener_(): void {
    const engService = EngineeringModeService.getInstance();

    // Listen for engineering mode changes
    engService.onChange((enabled) => {
      this.updateEngineeringModeVisibility_(enabled);
    });

    // Set initial visibility
    this.updateEngineeringModeVisibility_(engService.isEnabled());
  }

  private updateEngineeringModeVisibility_(enabled: boolean): void {
    const container = this.domCache_.get('sa-engineering-controls');
    if (container) {
      container.style.display = enabled ? 'block' : 'none';
    }
  }

  // ============ Control Handlers ============

  private handleCenterFreqChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.changeCenterFreq(this.toHz_(value));
    }
  }

  private handleSpanChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.changeBandwidth(this.toHz_(value));
    }
  }

  private handleRbwChange_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    if (value === 'auto') {
      this.spectrumAnalyzer.state.rbw = null;
    } else {
      this.spectrumAnalyzer.state.rbw = this.toHz_(parseLocalizedNumber(value)) as Hertz;
    }
    this.emitStateChange_();
  }

  private handleRefLevelChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.referenceLevel = value;
      this.emitStateChange_();
    }
  }

  private handleScaleChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLSelectElement).value);
    this.spectrumAnalyzer.state.scaleDbPerDiv = value as dB;
    this.emitStateChange_();
  }

  private handleMinAmpChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.spectrumAnalyzer.state.minAmplitude = value;
      this.emitStateChange_();
    }
  }

  private handleMaxAmpChange_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
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
    this.updateTraceControlsEnabled_(mode);
    this.emitStateChange_();
  }

  private handleAutoTune_(): void {
    this.spectrumAnalyzer.freqAutoTune();
    this.syncDomWithState_();
    this.syncLiveReadouts_();
  }

  /**
   * Peak Search, one shot (phase 33 D10, supersedes Phase 30 D11 tracking):
   * one `peakSearch()` at the click reads the trace on screen, places the
   * marker on that bin, and writes the readout and the log line, so all three
   * carry the same pick. The marker stays on the bin (its level re-read every
   * sweep); the readout then follows that bin's live level from analyzer state
   * (phase 34 D1). A paused screen repaints its frozen trace with the marker
   * (r8-s01-F1).
   */
  private handlePeakSearch_(): void {
    const state = this.spectrumAnalyzer.state;
    const peak = this.spectrumAnalyzer.peakSearch?.() ?? null;
    state.isMarkerOn = true;
    if (peak && typeof peak.bin === 'number') {
      const range = state.maxAmplitude - state.minAmplitude;
      const y = range > 0 ? (peak.levelDbm - state.minAmplitude) / range : 0;
      // Above Max Amp the marker sits clamped at the top edge, true level kept
      state.topMarkers = [{ x: peak.bin, y: 1 - Math.max(0, Math.min(1, y)), signal: peak.levelDbm }];
      state.markerIndex = 0;
      state.peakMarkerBin = peak.bin;
    } else {
      state.peakMarkerBin = undefined;
      state.isUpdateMarkers = true;
    }
    this.redrawIfPaused_();
    this.syncLiveReadouts_();
    // The readout and the Ops Log line quote one value: the marker as the readout reads it, not a second sample (nats-eu-r1 s01-F4)
    const shown = peak && state.peakMarkerBin !== undefined ? { frequencyHz: peak.frequencyHz, levelDbm: this.activeMarker_()?.levelDbm ?? peak.levelDbm } : peak;
    const peakReadout = this.domCache_.get('sa-peak-readout');
    if (peakReadout) {
      peakReadout.textContent = SpectrumAnalyzerAdvancedAdapter.formatPeakReadout(shown);
    }
    this.emitStateChange_();
    this.logPeakSearch_(shown);
  }

  /** A paused screen repaints its frozen trace with the markers (phase 33 D10, r8-s01-F1) */
  private redrawIfPaused_(): void {
    if (this.spectrumAnalyzer.state.isPaused) {
      this.spectrumAnalyzer.redrawFrozen?.();
    }
  }

  /** `Peak: 1085.000001 MHz @ -69.2 dBm`, or dashes with no peak */
  static formatPeakReadout(peak: { frequencyHz: number; levelDbm: number } | null): string {
    return peak ? `Peak: ${SpectralDensityPlot.formatMarkerMHz(peak.frequencyHz)} MHz @ ${peak.levelDbm.toFixed(1)} dBm` : 'Peak: --- MHz @ --- dBm';
  }

  private handlePauseToggle_(): void {
    this.spectrumAnalyzer.togglePause();
    this.updatePauseButton_();
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
    // On: mark the trace afresh; off: release the Peak Search bin
    this.spectrumAnalyzer.state.isUpdateMarkers = checked;
    this.spectrumAnalyzer.state.peakMarkerBin = undefined;
    this.redrawIfPaused_();
    this.emitStateChange_();
  }

  private handleMarkerIndexChange_(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0) {
      this.spectrumAnalyzer.state.markerIndex = value;
      // A marker moved by hand leaves the Peak Search bin
      this.spectrumAnalyzer.state.peakMarkerBin = undefined;
      this.redrawIfPaused_();
      this.emitStateChange_();
    }
  }

  // ============ State Emission ============

  private emitStateChange_(): void {
    EventBus.getInstance().emit(Events.SPEC_A_CONFIG_CHANGED, {
      ...this.spectrumAnalyzer.state,
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
      selectedTrace: state.selectedTrace,
      traces: state.traces,
      isMarkerOn: state.isMarkerOn,
      markerIndex: state.markerIndex,
      topMarkers: state.topMarkers,
    };

    const stateString = JSON.stringify(relevantState);
    if (stateString === this.lastStateString) {
      return;
    }
    this.lastStateString = stateString;

    // Frequency controls
    this.setInputValue_('sa-center-freq', SpectrumAnalyzerAdvancedAdapter.formatMHz(state.centerFrequency));
    this.setInputValue_('sa-span', SpectrumAnalyzerAdvancedAdapter.formatMHz(state.span));

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

    // Trace controls
    this.updateTraceButtons_();
    this.updateTraceControls_();
    this.updateTraceControlsEnabled_(state.screenMode);

    // Marker controls
    this.setCheckboxValue_('sa-marker-enabled', state.isMarkerOn);
    this.setInputValue_('sa-marker-index', state.markerIndex.toString());
    this.syncLiveReadouts_();
  }

  private setInputValue_(id: string, value: string): void {
    const el = this.domCache_.get(id) as HTMLInputElement;
    // Never rewrite the field the operator is typing in
    if (el && document.activeElement !== el) {
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

    [spectralBtn, waterfallBtn, bothBtn].forEach((btn) => {
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
      pauseBtn.className = isPaused ? 'btn btn-success btn-sm' : 'btn btn-warning btn-sm';
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

  /**
   * Enable/disable trace controls based on screen mode.
   * Traces are only relevant for spectral and both modes, not waterfall-only.
   */
  private updateTraceControlsEnabled_(mode: 'spectralDensity' | 'waterfall' | 'both'): void {
    const isEnabled = mode !== 'waterfall';

    // Trace selection buttons
    for (let i = 1; i <= 3; i++) {
      const btn = this.domCache_.get(`sa-trace-${i}`) as HTMLButtonElement;
      if (btn) {
        btn.disabled = !isEnabled;
      }
    }

    // Trace toggles and mode select
    const visibleCheckbox = this.domCache_.get('sa-trace-visible') as HTMLInputElement;
    const updatingCheckbox = this.domCache_.get('sa-trace-updating') as HTMLInputElement;
    const modeSelect = this.domCache_.get('sa-trace-mode') as HTMLSelectElement;

    if (visibleCheckbox) visibleCheckbox.disabled = !isEnabled;
    if (updatingCheckbox) updatingCheckbox.disabled = !isEnabled;
    if (modeSelect) modeSelect.disabled = !isEnabled;
  }

  private updateMarkerInfo_(): void {
    const markerInfo = this.domCache_.get('sa-marker-info');
    if (!markerInfo) {
      return;
    }

    const marker = this.activeMarker_();
    markerInfo.textContent = marker ? `Mkr: ${SpectralDensityPlot.formatMarkerMHz(marker.frequencyHz)} MHz @ ${marker.levelDbm.toFixed(1)} dBm` : 'Mkr: --- MHz @ --- dBm';
  }

  /** The marker on screen as frequency (Hz) and level (dBm), or null when off or not placed */
  private activeMarker_(): { frequencyHz: number; levelDbm: number } | null {
    const state = this.spectrumAnalyzer.state;
    const marker = state.isMarkerOn && state.topMarkers?.length > 0 ? (state.topMarkers[state.markerIndex] ?? state.topMarkers[0]) : null;
    const points = this.spectrumAnalyzer.spectrumDataProcessor?.combinedData?.length ?? 0;
    if (!marker || points <= 0) {
      return null;
    }
    // A marker's x is its trace point: back to frequency across the span
    return { frequencyHz: state.centerFrequency - state.span / 2 + ((marker.x + 0.5) / points) * state.span, levelDbm: marker.signal };
  }

  // ============ Ops Log (phase 31 D13, r6-s15-F2) ============

  /** Ground station that owns this analyzer, for the Ops Log tag */
  private stationId_(): string | undefined {
    const w = globalThis as unknown as { signalRange?: { simulationManager?: { groundStations?: GroundStation[] } } };
    const stations = w.signalRange?.simulationManager?.groundStations ?? [];

    return stations.find((gs) => (gs.spectrumAnalyzers ?? []).includes(this.spectrumAnalyzer))?.state?.id;
  }

  /** Write the settings line once the operator has stopped retuning for CONFIG_LOG_DEBOUNCE_MS */
  private scheduleConfigLog_(): void {
    const analyzer = this.spectrumAnalyzer;
    const timers = SpectrumAnalyzerAdvancedAdapter.configLogTimers_;
    const pending = timers.get(analyzer);
    if (pending !== undefined) {
      clearTimeout(pending);
    }
    const stationId = this.stationId_();
    timers.set(
      analyzer,
      setTimeout(() => {
        timers.delete(analyzer);
        const line = SpectrumAnalyzerAdvancedAdapter.formatConfigLine(analyzer);
        if (SpectrumAnalyzerAdvancedAdapter.lastConfigLine_.get(analyzer) === line) {
          return;
        }
        SpectrumAnalyzerAdvancedAdapter.lastConfigLine_.set(analyzer, line);
        EventAutoLogger.getInstance().logAction(line, 'SPEC A', stationId);
      }, SpectrumAnalyzerAdvancedAdapter.CONFIG_LOG_DEBOUNCE_MS)
    );
  }

  /** `SPEC A: 1490.000 MHz, span 75.000 MHz, RBW Auto (3 Hz), -100/-30 dBm` */
  static formatConfigLine(analyzer: RealTimeSpectrumAnalyzer): string {
    const state = analyzer.state;
    let rbw: string;
    if (state.rbw === null || state.rbw === undefined) {
      const inUse = analyzer.effectiveRbwHz;
      rbw = typeof inUse === 'number' && Number.isFinite(inUse) ? `RBW Auto (${SpectrumAnalyzerAdvancedAdapter.formatHz(inUse)})` : 'RBW Auto';
    } else {
      rbw = `RBW ${SpectrumAnalyzerAdvancedAdapter.formatHz(state.rbw)}`;
    }
    const amp = (v: number): string => (Number.isInteger(v) ? v.toString() : v.toFixed(1));

    return `SPEC A: ${(state.centerFrequency / 1e6).toFixed(3)} MHz, span ${(state.span / 1e6).toFixed(3)} MHz, ${rbw}, ${amp(state.minAmplitude)}/${amp(state.maxAmplitude)} dBm`;
  }

  /** `SPEC A: Peak Search 1085.000001 MHz @ -69.2 dBm`, the click's own pick */
  private logPeakSearch_(peak: { frequencyHz: number; levelDbm: number } | null): void {
    const line = peak ? `SPEC A: Peak Search ${SpectralDensityPlot.formatMarkerMHz(peak.frequencyHz)} MHz @ ${peak.levelDbm.toFixed(1)} dBm` : 'SPEC A: Peak Search';
    EventAutoLogger.getInstance().logAction(line, 'SPEC A', this.stationId_());
  }

  // ============ Cleanup ============

  dispose(): void {
    // Unsubscribe from EventBus
    EventBus.getInstance().off(Events.SPEC_A_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.UPDATE, this.updateHandler_);

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      // Ids contain dashes ("sa-center-freq"); the event type is after the last one
      const cut = key.lastIndexOf('-');
      const id = key.slice(0, cut);
      const eventType = key.slice(cut + 1);
      const el = this.domCache_.get(id);
      if (el && eventType) {
        el.removeEventListener(eventType, handler);
      }
    });

    this.boundHandlers.clear();
    for (const [el, listener] of this.commitLogListeners_) {
      el.removeEventListener('change', listener);
    }
    this.commitLogListeners_.length = 0;
    this.domCache_.clear();
  }
}
