import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { qs } from '@app/engine/utils/query-selector';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { ADCStatus } from '@app/equipment/receiver/adc-degradation';
import { IQSignalInfo, Receiver, ReceiverModemState } from '@app/equipment/receiver/receiver';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';

/**
 * ReceiverAdapter - Bridges Receiver equipment class to modern Mission Control UI
 *
 * Follows established adapter pattern:
 * - readonly properties for immutable references
 * - DOM caching to eliminate repeated queries
 * - Private methods with underscore suffix
 * - Extracted event handlers (not inline)
 * - Strongly-typed state handlers
 * - Circular update prevention via state string comparison
 *
 * Key Differences from TransmitterAdapter:
 * - Includes modulation and FEC configuration
 * - Video monitor display for signal feeds
 * - Signal quality indicators on modem buttons
 * - Status bar shows signal detection instead of alarms
 */
export class ReceiverAdapter {
  private static readonly UPDATE_INTERVAL_MS = 250;

  private readonly receiver: Receiver;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler_: () => void;
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;

  constructor(receiver: Receiver, containerEl: HTMLElement) {
    this.receiver = receiver;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('rx-alarm-badge-led');
    const badgeContainer = qs('#rx-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Create state change handler
    this.stateChangeHandler_ = () => {
      this.syncDomWithState_();
    };

    // Create throttled update handler for Events.UPDATE
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    // Initialize
    this.setupDomCache_();
    this.setupEventListeners_();
    this.subscribeToStateChanges_();

    // Initial sync
    this.syncDomWithState_();
  }

  /**
   * Subscribe to receiver state changes
   */
  private subscribeToStateChanges_(): void {
    EventBus.getInstance().on(Events.RX_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.RX_ACTIVE_MODEM_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.SYNC, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /**
   * Throttled sync for UPDATE events to avoid performance issues
   */
  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < ReceiverAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  /**
   * Cache all DOM elements to eliminate repeated querySelector calls
   */
  private setupDomCache_(): void {
    // Modem selection buttons (1-4)
    for (let i = 1; i <= 4; i++) {
      const btn = this.containerEl.querySelector(`[data-modem="${i}"]`);
      if (btn) this.domCache_.set(`modem-btn-${i}`, btn as HTMLElement);
    }

    // Configuration inputs
    this.cacheElement_('antenna-select');
    this.cacheElement_('frequency-input');
    this.cacheElement_('bandwidth-input');
    this.cacheElement_('modulation-select');
    this.cacheElement_('fec-select');
    this.cacheElement_('apply-btn');

    // Current value displays
    this.cacheElement_('antenna-current');
    this.cacheElement_('frequency-current');
    this.cacheElement_('bandwidth-current');
    this.cacheElement_('modulation-current');
    this.cacheElement_('fec-current');

    // Video monitor elements
    this.cacheElement_('video-monitor');
    this.cacheElement_('video-feed');

    // Power switch
    this.cacheElement_('power-switch');

    // Signal quality status badge
    this.cacheElement_('signal-status');

    // C/N and power level displays
    this.cacheElement_('cn-raw-display');
    this.cacheElement_('cn-effective-display');
    this.cacheElement_('power-level-display');
    this.cacheElement_('noise-floor-display');

    // ADC status displays
    this.cacheElement_('adc-level-display');
    this.cacheElement_('adc-status-display');
    this.cacheElement_('degradation-section');
    this.cacheElement_('clip-penalty-display');
    this.cacheElement_('quant-penalty-display');
    this.cacheElement_('total-penalty-display');

    // Status bar
    this.cacheElement_('status-bar');
  }

  /**
   * Helper to cache a single element
   */
  private cacheElement_(id: string): void {
    const el = this.containerEl.querySelector(`#${id}`);
    if (el) this.domCache_.set(id, el as HTMLElement);
  }

  /**
   * Wire all event handlers
   */
  private setupEventListeners_(): void {
    // Modem selection buttons
    for (let i = 1; i <= 4; i++) {
      const btn = this.domCache_.get(`modem-btn-${i}`);
      if (btn) {
        const handler = () => this.modemSelectHandler_(i);
        btn.addEventListener('click', handler);
        this.boundHandlers.set(`modem-${i}`, handler as EventListener);
      }
    }

    // Configuration inputs
    const antennaSelect = this.domCache_.get('antenna-select');
    if (antennaSelect) {
      const handler = (e: Event) => this.antennaHandler_(e);
      antennaSelect.addEventListener('change', handler);
      this.boundHandlers.set('antenna', handler);
    }

    const frequencyInput = this.domCache_.get('frequency-input');
    if (frequencyInput) {
      const handler = (e: Event) => this.frequencyHandler_(e);
      frequencyInput.addEventListener('input', handler);
      this.boundHandlers.set('frequency', handler);
    }

    const bandwidthInput = this.domCache_.get('bandwidth-input');
    if (bandwidthInput) {
      const handler = (e: Event) => this.bandwidthHandler_(e);
      bandwidthInput.addEventListener('input', handler);
      this.boundHandlers.set('bandwidth', handler);
    }

    const modulationSelect = this.domCache_.get('modulation-select');
    if (modulationSelect) {
      const handler = (e: Event) => this.modulationHandler_(e);
      modulationSelect.addEventListener('change', handler);
      this.boundHandlers.set('modulation', handler);
    }

    const fecSelect = this.domCache_.get('fec-select');
    if (fecSelect) {
      const handler = (e: Event) => this.fecHandler_(e);
      fecSelect.addEventListener('change', handler);
      this.boundHandlers.set('fec', handler);
    }

    // Apply button
    const applyBtn = this.domCache_.get('apply-btn');
    if (applyBtn) {
      const handler = () => this.applyHandler_();
      applyBtn.addEventListener('click', handler);
      this.boundHandlers.set('apply', handler as EventListener);
    }

    // Power switch
    const powerSwitch = this.domCache_.get('power-switch');
    if (powerSwitch) {
      const handler = (e: Event) => this.powerSwitchHandler_(e);
      powerSwitch.addEventListener('change', handler);
      this.boundHandlers.set('power', handler);
    }
  }

  /**
   * Event Handlers
   */

  private modemSelectHandler_(modemNumber: number): void {
    this.receiver.setActiveModem(modemNumber);
    this.syncDomWithState_();
  }

  private antennaHandler_(e: Event): void {
    const value = parseInt((e.target as HTMLSelectElement).value);
    this.receiver.handleAntennaChange(value);
  }

  private frequencyHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.receiver.handleFrequencyChange(value);
    }
  }

  private bandwidthHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.receiver.handleBandwidthChange(value);
    }
  }

  private modulationHandler_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value as any;
    this.receiver.handleModulationChange(value);
  }

  private fecHandler_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value as any;
    this.receiver.handleFecChange(value);
  }

  private applyHandler_(): void {
    this.receiver.applyChanges();
    this.syncDomWithState_();
  }

  private powerSwitchHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.receiver.handlePowerToggle(isEnabled);
    this.syncDomWithState_();
  }

  /**
   * Sync DOM with receiver state
   * Uses state string comparison to prevent unnecessary updates
   */
  private syncDomWithState_(): void {
    // Build comprehensive state string that includes signal status for all modems
    // (signal detection depends on external data, not just receiver state)
    // Include raw signal data since isDegraded flag has mutation issues in getVisibleSignals
    const activeModem = this.getActiveModem_();
    const visibleSignals = activeModem ? this.receiver.getVisibleSignals(activeModem) : [];

    const modemSignalStatus = this.receiver.state.modems.map(modem => ({
      modemNumber: modem.modemNumber,
      hasSignal: this.receiver.hasSignalForModem(modem),
      isDegraded: this.receiver.isSignalDegraded(modem),
      snr: this.receiver.getSnrForModem(modem),
      power: this.receiver.getPowerForModem(modem),
    }));

    // Include visible signals for active modem to detect degradation changes
    const activeSignalState = visibleSignals.map(s => ({
      id: s.signalId,
      power: Math.round(s.power * 10) / 10, // Round to avoid floating point noise
      frequency: s.frequency,
      isDegraded: s.isDegraded,
      feed: s.feed,
    }));

    const stateString = JSON.stringify({
      receiverState: this.receiver.state,
      modemSignalStatus,
      activeSignalState,
    });

    // Early exit if nothing changed
    if (stateString === this.lastStateString) return;
    this.lastStateString = stateString;

    // Update modem buttons (active state + signal quality indicators)
    this.updateModemButtons_();

    // Sync configuration inputs/displays for active modem
    if (activeModem) {
      this.updateConfigurationInputs_(activeModem);
      this.updateCurrentValueDisplays_(activeModem);
    }

    // Update video monitor
    this.updateVideoMonitor_();

    // Update power switch and signal LED
    this.updatePowerAndSignal_();

    // Update status bar
    this.updateStatusBar_();
  }

  /**
   * Helper Methods
   */

  private getActiveModem_(): ReceiverModemState | undefined {
    return this.receiver.state.modems.find(
      m => m.modemNumber === this.receiver.state.activeModem
    );
  }

  private updateModemButtons_(): void {
    for (let i = 1; i <= 4; i++) {
      const btn = this.domCache_.get(`modem-btn-${i}`);
      if (!btn) continue;

      const modem = this.receiver.state.modems.find(m => m.modemNumber === i);
      const isActive = i === this.receiver.state.activeModem;

      // Update classes
      btn.classList.remove('active', 'btn-rx-signal-good', 'btn-rx-signal-degraded');
      if (isActive) btn.classList.add('active');

      // Add signal quality class
      if (modem) {
        const signalClass = this.getModemSignalClass_(modem);
        if (signalClass) btn.classList.add(signalClass);
      }
    }
  }

  private getModemSignalClass_(modem: ReceiverModemState): string {
    if (!modem.isPowered) return '';

    const signalInfo = this.receiver.getSignalsInBandwidth(modem);
    if (!signalInfo.hasCarrier) return '';

    const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;

    // Match signal quality thresholds
    if (signalInfo.hasLock && effectiveCn > 15) {
      return 'btn-rx-signal-good';
    }
    if (effectiveCn > 8) {
      return 'btn-rx-signal-degraded';
    }
    return 'btn-rx-signal-error';
  }

  private updateConfigurationInputs_(modem: ReceiverModemState): void {
    // Antenna selector - skip if user is focused
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    if (antennaSelect && document.activeElement !== antennaSelect) {
      antennaSelect.value = String(modem.antenna_id);
    }

    // Frequency input - skip if user is focused
    const frequencyInput = this.domCache_.get('frequency-input') as HTMLInputElement;
    if (frequencyInput && document.activeElement !== frequencyInput) {
      frequencyInput.value = Number(modem.frequency.toFixed(1)).toString();
    }

    // Bandwidth input - skip if user is focused
    const bandwidthInput = this.domCache_.get('bandwidth-input') as HTMLInputElement;
    if (bandwidthInput && document.activeElement !== bandwidthInput) {
      bandwidthInput.value = Number(modem.bandwidth.toFixed(1)).toString();
    }

    // Modulation selector - skip if user is focused
    const modulationSelect = this.domCache_.get('modulation-select') as HTMLSelectElement;
    if (modulationSelect && document.activeElement !== modulationSelect) {
      modulationSelect.value = modem.modulation;
    }

    // FEC selector - skip if user is focused
    const fecSelect = this.domCache_.get('fec-select') as HTMLSelectElement;
    if (fecSelect && document.activeElement !== fecSelect) {
      fecSelect.value = modem.fec;
    }
  }

  private updateCurrentValueDisplays_(modem: ReceiverModemState): void {
    // Antenna current value
    const antennaCurrent = this.domCache_.get('antenna-current');
    if (antennaCurrent) {
      antennaCurrent.textContent = String(modem.antenna_id);
    }

    // Frequency current value
    const frequencyCurrent = this.domCache_.get('frequency-current');
    if (frequencyCurrent) {
      frequencyCurrent.textContent = `${modem.frequency} MHz`;
    }

    // Bandwidth current value
    const bandwidthCurrent = this.domCache_.get('bandwidth-current');
    if (bandwidthCurrent) {
      bandwidthCurrent.textContent = `${modem.bandwidth} MHz`;
    }

    // Modulation current value
    const modulationCurrent = this.domCache_.get('modulation-current');
    if (modulationCurrent) {
      modulationCurrent.textContent = modem.modulation;
    }

    // FEC current value
    const fecCurrent = this.domCache_.get('fec-current');
    if (fecCurrent) {
      fecCurrent.textContent = modem.fec;
    }
  }

  private updateVideoMonitor_(): void {
    const monitor = this.domCache_.get('video-monitor');
    const videoFeed = this.domCache_.get('video-feed') as HTMLImageElement | HTMLVideoElement;

    if (!monitor || !videoFeed) return;

    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    // Check power state
    if (!activeModem.isPowered) {
      monitor.classList.remove('no-signal', 'signal-found', 'signal-degraded');
      monitor.classList.add('no-power');
      return;
    }

    // Check for matching signal
    const hasSignal = this.receiver.hasSignalForModem(activeModem);
    const isDegraded = this.receiver.isSignalDegraded(activeModem);

    if (!hasSignal) {
      monitor.classList.remove('no-power', 'signal-found', 'signal-degraded');
      monitor.classList.add('no-signal');
    } else {
      monitor.classList.remove('no-power', 'no-signal');
      monitor.classList.add('signal-found');

      if (isDegraded) {
        monitor.classList.add('signal-degraded');
      } else {
        monitor.classList.remove('signal-degraded');
      }

      // Set video feed source
      const visibleSignals = this.receiver.getVisibleSignals(activeModem);
      if (visibleSignals.length > 0) {
        const signal = visibleSignals[0];

        // Check if it's an image or video
        if (signal.isImage) {
          const imgElement = videoFeed as HTMLImageElement;
          imgElement.src = signal.isExternal ? signal.feed : `/images/${signal.feed}`;
        } else {
          if (signal.isExternal) {
            // For external videos, we might need an iframe
            // For now, just set the src
            const videoElement = videoFeed as HTMLVideoElement;
            videoElement.src = signal.feed;
          } else {
            const videoElement = videoFeed as HTMLVideoElement;
            videoElement.src = `/videos/${signal.feed}`;
          }
        }
      }
    }
  }

  private updatePowerAndSignal_(): void {
    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    // Power Switch
    const powerSwitch = this.domCache_.get('power-switch') as HTMLInputElement;
    if (powerSwitch) {
      powerSwitch.checked = activeModem.isPowered;
    }

    // Get signal info for C/N and ADC data (needed for signal quality)
    const signalInfo = this.receiver.getSignalsInBandwidth(activeModem);

    // Signal Quality Status Badge - use actual C/N thresholds matching IQ constellation
    const signalStatus = this.domCache_.get('signal-status');
    if (signalStatus) {
      if (!activeModem.isPowered) {
        signalStatus.className = 'status-badge status-badge-none';
        signalStatus.textContent = 'Off';
      } else if (!signalInfo.hasCarrier) {
        signalStatus.className = 'status-badge status-badge-none';
        signalStatus.textContent = 'None';
      } else {
        // Use effective C/N (includes ADC penalty) for quality assessment
        const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;

        // Match IQ constellation thresholds:
        // - Good: C/N > 15 dB AND locked
        // - Degraded: 8 < C/N <= 15 dB OR unlocked with decent C/N
        // - Poor: C/N <= 8 dB
        if (signalInfo.hasLock && effectiveCn > 15) {
          signalStatus.className = 'status-badge status-badge-good';
          signalStatus.textContent = 'Good';
        } else if (effectiveCn > 8) {
          signalStatus.className = 'status-badge status-badge-degraded';
          signalStatus.textContent = signalInfo.hasLock ? 'Degraded' : 'Unlocked';
        } else if (effectiveCn > 0) {
          signalStatus.className = 'status-badge status-badge-error';
          signalStatus.textContent = 'Poor';
        } else {
          signalStatus.className = 'status-badge status-badge-error';
          signalStatus.textContent = 'Critical';
        }
      }
    }

    // Use hasCarrier for all display logic (consistent with signal quality badge)
    const hasCarrier = signalInfo.hasCarrier;

    // Raw C/N display - only show when we have a carrier
    const cnRawDisplay = this.domCache_.get('cn-raw-display');
    if (cnRawDisplay) {
      const cn = signalInfo.cnRatio_dB;
      cnRawDisplay.textContent = (hasCarrier && cn > -50) ? `${cn.toFixed(1)} dB` : '-- dB';
    }

    // Effective C/N display - only show when we have a carrier
    const cnEffectiveDisplay = this.domCache_.get('cn-effective-display');
    if (cnEffectiveDisplay) {
      const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;
      cnEffectiveDisplay.textContent = (hasCarrier && effectiveCn > -50) ? `${effectiveCn.toFixed(1)} dB` : '-- dB';
    }

    // Power level display - only show when we have a carrier
    const powerLevelDisplay = this.domCache_.get('power-level-display');
    if (powerLevelDisplay) {
      const power = signalInfo.signalLevel_dBm;
      powerLevelDisplay.textContent = (hasCarrier && power !== undefined) ? `${power.toFixed(1)} dBm` : '-- dBm';
    }

    // Noise floor display (for debugging/teaching) - always show if available
    const noiseFloorDisplay = this.domCache_.get('noise-floor-display');
    if (noiseFloorDisplay) {
      const noiseFloor = signalInfo.noiseFloor_dBm;
      noiseFloorDisplay.textContent = noiseFloor !== undefined ? `${noiseFloor.toFixed(1)} dBm` : '-- dBm';
    }

    // Update ADC status displays - only show actual values when we have a carrier
    this.updateAdcStatus_(signalInfo, hasCarrier);

    // Update alarm badge
    const alarms = this.getAlarmsFromReceiver_();
    this.alarmBadge_.update(alarms);
  }

  /**
   * Update ADC status displays based on signal info
   * @param signalInfo Signal info from receiver
   * @param hasSignal Whether a matching signal exists (mod + FEC match)
   */
  private updateAdcStatus_(signalInfo: IQSignalInfo, hasSignal: boolean): void {
    const adcDeg = signalInfo.adcDegradation;

    // Only show actual ADC values when we have a matching signal
    const showAdcValues = hasSignal && adcDeg;

    // ADC Level display
    const adcLevelEl = this.domCache_.get('adc-level-display');
    if (adcLevelEl) {
      if (showAdcValues) {
        adcLevelEl.textContent = `${adcDeg.inputLevel_dBFS.toFixed(1)} dBFS`;
        adcLevelEl.className = 'fw-bold font-monospace ' + this.getAdcLevelClass_(adcDeg.status);
      } else {
        adcLevelEl.textContent = '-- dBFS';
        adcLevelEl.className = 'fw-bold font-monospace';
      }
    }

    // ADC Status badge
    const adcStatusEl = this.domCache_.get('adc-status-display');
    if (adcStatusEl) {
      if (showAdcValues) {
        adcStatusEl.textContent = this.getAdcStatusText_(adcDeg.status);
        adcStatusEl.className = 'status-badge ' + this.getAdcStatusBadgeClass_(adcDeg.status);
      } else {
        adcStatusEl.textContent = '--';
        adcStatusEl.className = 'status-badge status-badge-none';
      }
    }

    // Show/hide degradation breakdown - only when we have a matching signal with penalties
    const degradationSection = this.domCache_.get('degradation-section');
    if (degradationSection) {
      if (showAdcValues && adcDeg.totalPenalty_dB > 0.1) {
        degradationSection.classList.remove('d-none');
        this.updatePenaltyDisplay_('clip-penalty-display', adcDeg.clipPenalty_dB);
        this.updatePenaltyDisplay_('quant-penalty-display', adcDeg.quantizationPenalty_dB);
        this.updatePenaltyDisplay_('total-penalty-display', adcDeg.totalPenalty_dB);
      } else {
        degradationSection.classList.add('d-none');
      }
    }
  }

  private updatePenaltyDisplay_(elementId: string, penalty: number): void {
    const el = this.domCache_.get(elementId);
    if (el) {
      el.textContent = `${penalty.toFixed(1)} dB`;
    }
  }

  private getAdcLevelClass_(status: ADCStatus): string {
    switch (status) {
      case 'optimal': return 'text-success';
      case 'clipping':
      case 'severe-clipping': return 'text-danger';
      case 'low-level':
      case 'severe-low': return 'text-info';
      default: return '';
    }
  }

  private getAdcStatusText_(status: ADCStatus): string {
    switch (status) {
      case 'optimal': return 'Optimal';
      case 'clipping': return 'Clipping';
      case 'severe-clipping': return 'CLIPPING!';
      case 'low-level': return 'Low Level';
      case 'severe-low': return 'LOW LEVEL!';
      default: return '--';
    }
  }

  private getAdcStatusBadgeClass_(status: ADCStatus): string {
    switch (status) {
      case 'optimal': return 'status-badge-good';
      case 'clipping': return 'status-badge-degraded';
      case 'severe-clipping': return 'status-badge-error';
      case 'low-level': return 'status-badge-degraded';
      case 'severe-low': return 'status-badge-error';
      default: return 'status-badge-none';
    }
  }

  private updateStatusBar_(): void {
    const statusBar = this.domCache_.get('status-bar');
    if (!statusBar) return;

    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    if (!activeModem.isPowered) {
      statusBar.className = 'alert alert-secondary mt-3';
      statusBar.textContent = 'Modem powered off';
      return;
    }

    const signalInfo = this.receiver.getSignalsInBandwidth(activeModem);

    if (!signalInfo.hasCarrier) {
      statusBar.className = 'alert alert-info mt-3';
      statusBar.textContent = 'Searching for signal...';
      return;
    }

    const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;

    // Match signal quality badge thresholds
    if (signalInfo.hasLock && effectiveCn > 15) {
      statusBar.className = 'alert alert-success mt-3';
      statusBar.textContent = 'Signal locked - Good quality';
    } else if (effectiveCn > 8) {
      statusBar.className = 'alert alert-warning mt-3';
      const lockStatus = signalInfo.hasLock ? 'locked' : 'unlocked';
      statusBar.textContent = `Signal ${lockStatus} - Degraded quality (C/N: ${effectiveCn.toFixed(1)} dB)`;
    } else if (effectiveCn > 0) {
      statusBar.className = 'alert alert-danger mt-3';
      statusBar.textContent = `Signal poor - C/N: ${effectiveCn.toFixed(1)} dB`;
    } else {
      statusBar.className = 'alert alert-danger mt-3';
      statusBar.textContent = `Signal critical - C/N: ${effectiveCn.toFixed(1)} dB`;
    }
  }

  /**
   * Get current alarms from receiver as AlarmStatus array
   */
  private getAlarmsFromReceiver_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const activeModem = this.getActiveModem_();

    if (!activeModem) return alarms;

    if (!activeModem.isPowered) {
      alarms.push({ severity: 'info', message: 'Modem powered off' });
      return alarms;
    }

    const signalInfo = this.receiver.getSignalsInBandwidth(activeModem);

    if (!signalInfo.hasCarrier) {
      alarms.push({ severity: 'warning', message: 'No signal detected' });
      return alarms;
    }

    const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;

    // Match signal quality thresholds
    if (effectiveCn <= 0) {
      alarms.push({ severity: 'error', message: `Critical C/N: ${effectiveCn.toFixed(1)} dB` });
    } else if (effectiveCn <= 8) {
      alarms.push({ severity: 'error', message: `Poor C/N: ${effectiveCn.toFixed(1)} dB` });
    } else if (effectiveCn <= 15 || !signalInfo.hasLock) {
      alarms.push({ severity: 'warning', message: signalInfo.hasLock ? 'Signal degraded' : 'Signal unlocked' });
    }

    // Add interference warning if present
    if (signalInfo.interferenceCount && signalInfo.interferenceCount > 0) {
      alarms.push({ severity: 'warning', message: `${signalInfo.interferenceCount} interferer(s) detected` });
    }

    return alarms;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Unsubscribe from state changes
    EventBus.getInstance().off(Events.RX_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.RX_ACTIVE_MODEM_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.SYNC, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      if (key.startsWith('modem-')) {
        const modemNum = parseInt(key.split('-')[1]);
        const btn = this.domCache_.get(`modem-btn-${modemNum}`);
        btn?.removeEventListener('click', handler);
      } else {
        const el = this.domCache_.get(key);
        const eventType = key.includes('switch') || key.includes('select') ? 'change' : key.includes('btn') ? 'click' : 'input';
        el?.removeEventListener(eventType, handler);
      }
    });

    // Clear maps
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
