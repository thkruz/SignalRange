import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { qs } from '@app/engine/utils/query-selector';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { ValidationError, validateModemBandwidth, validateModemFrequency } from '@app/equipment/modem/modem-constraints';
import { ADCStatus } from '@app/equipment/receiver/adc-degradation';
import { LOCK_HYSTERESIS_DB } from '@app/equipment/receiver/modcod';
import { IQSignalInfo, Receiver, ReceiverModemState } from '@app/equipment/receiver/receiver';
import {
  classifyRxSignal,
  describePayloadProblem,
  LOCK_LOST_LABEL,
  modemLockAlarm,
  RxModemSeverity,
  RxModemVerdict,
  RxPayloadStatus,
  rxModemVerdict,
} from '@app/equipment/receiver/rx-signal-quality';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { parseLocalizedNumber } from '@app/utils/parse-number';

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
  private pendingPowerState_: boolean | null = null;

  // Staged input strings for exact user input preservation
  private stagedInputStrings_: Map<string, string> = new Map();

  // Validation errors for user feedback
  private validationErrors_: ValidationError[] = [];

  // Payload decoder status (frame sync / RS), so the modem status never claims
  // "Good margin" while Payload Data Integrity reports sync loss or overload
  private payloadStatusProvider_: (() => RxPayloadStatus | null) | null = null;
  /** Gets every signal sample the modem readouts show (null: modem off), for readouts that must match them */
  private signalSampleListener_: ((info: IQSignalInfo | null) => void) | null = null;

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
   * Supply the payload decoder status (from the RX payload adapter) so the
   * modem status bar and alarm badge agree with Payload Data Integrity.
   */
  public setPayloadStatusProvider(provider: (() => RxPayloadStatus | null) | null): void {
    this.payloadStatusProvider_ = provider;
  }

  /**
   * Hand each sample the modem's C/N readouts are drawn from to `listener`
   * (null when the modem is off): the constellation header shows the modem's
   * Effective C/N from the same sample at the same moment (phase 29 D4,
   * nats-r3-s06-F3).
   */
  public setSignalSampleListener(listener: ((info: IQSignalInfo | null) => void) | null): void {
    this.signalSampleListener_ = listener;
  }

  private getPayloadProblem_(): string | null {
    return describePayloadProblem(this.payloadStatusProvider_?.() ?? null);
  }

  /** The card's one verdict for a modem with a carrier: badge, status bar and LED */
  private getVerdict_(modemNumber: number, signalInfo: IQSignalInfo): RxModemVerdict {
    // The payload decoder only qualifies a good margin; skip the read otherwise
    const payloadProblem = classifyRxSignal(signalInfo) === 'good' ? this.getPayloadProblem_() : null;
    return rxModemVerdict(modemNumber, signalInfo, payloadProblem);
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
    this.cacheElement_('esn0-display');
    this.cacheElement_('cn0-display');
    this.cacheElement_('required-esn0-display');
    this.cacheElement_('power-level-display');
    this.cacheElement_('noise-floor-display');

    // ADC status displays
    this.cacheElement_('adc-level-display');
    this.cacheElement_('adc-status-display');
    this.cacheElement_('degradation-section');
    this.cacheElement_('clip-penalty-display');
    this.cacheElement_('quant-penalty-display');
    this.cacheElement_('total-penalty-display');
    this.cacheElement_('adc-ceiling-display');

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
    // Clear staged inputs and validation when switching modems
    this.stagedInputStrings_.clear();
    this.validationErrors_ = [];

    this.receiver.setActiveModem(modemNumber);
    this.syncDomWithState_();
  }

  private antennaHandler_(e: Event): void {
    const value = parseInt((e.target as HTMLSelectElement).value);
    this.receiver.handleAntennaChange(value);
  }

  private frequencyHandler_(e: Event): void {
    const inputEl = e.target as HTMLInputElement;
    const rawValue = inputEl.value;

    // Store exact user input for display preservation
    this.stagedInputStrings_.set('frequency', rawValue);

    const value = parseLocalizedNumber(rawValue);
    if (!isNaN(value)) {
      // Validate and update error state
      const error = validateModemFrequency(value);
      this.updateValidationError_('frequency', error);

      // Still update receiver for live preview
      this.receiver.handleFrequencyChange(value);
    } else {
      // Invalid number - clear any existing frequency error
      this.updateValidationError_('frequency', null);
    }

    this.updateApplyButtonState_();
  }

  private bandwidthHandler_(e: Event): void {
    const inputEl = e.target as HTMLInputElement;
    const rawValue = inputEl.value;

    // Store exact user input for display preservation
    this.stagedInputStrings_.set('bandwidth', rawValue);

    const value = parseLocalizedNumber(rawValue);
    if (!isNaN(value)) {
      // Validate and update error state
      const error = validateModemBandwidth(value);
      this.updateValidationError_('bandwidth', error);

      // Still update receiver for live preview
      this.receiver.handleBandwidthChange(value);
    } else {
      // Invalid number - clear any existing bandwidth error
      this.updateValidationError_('bandwidth', null);
    }

    this.updateApplyButtonState_();
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
    // Don't apply if there are validation errors
    if (this.validationErrors_.length > 0) {
      return;
    }

    this.receiver.applyChanges();

    // Clear staged inputs after successful apply
    this.stagedInputStrings_.clear();

    this.syncDomWithState_();
  }

  private powerSwitchHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.pendingPowerState_ = isEnabled;
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

    const modemSignalStatus = this.receiver.state.modems.map((modem) => ({
      modemNumber: modem.modemNumber,
      hasSignal: this.receiver.hasSignalForModem(modem),
      isDegraded: this.receiver.isSignalDegraded(modem),
      snr: this.receiver.getSnrForModem(modem),
      power: this.receiver.getPowerForModem(modem),
    }));

    // Include visible signals for active modem to detect degradation changes
    const activeSignalState = visibleSignals.map((s) => ({
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
    return this.receiver.state.modems.find((m) => m.modemNumber === this.receiver.state.activeModem);
  }

  private updateModemButtons_(): void {
    for (let i = 1; i <= 4; i++) {
      const btn = this.domCache_.get(`modem-btn-${i}`);
      if (!btn) continue;

      const modem = this.receiver.state.modems.find((m) => m.modemNumber === i);
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

    // Same grading as the status bar and the alarm badge
    switch (classifyRxSignal(signalInfo)) {
      case 'good':
        return 'btn-rx-signal-good';
      case 'degraded':
      case 'acquiring':
        return 'btn-rx-signal-degraded';
      default:
        return 'btn-rx-signal-error';
    }
  }

  private updateConfigurationInputs_(modem: ReceiverModemState): void {
    // Antenna selector - skip if user is focused
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    if (antennaSelect && document.activeElement !== antennaSelect) {
      antennaSelect.value = String(modem.antenna_id);
    }

    // Frequency input - use staged value if available, otherwise from state
    const frequencyInput = this.domCache_.get('frequency-input') as HTMLInputElement;
    if (frequencyInput && document.activeElement !== frequencyInput) {
      const staged = this.stagedInputStrings_.get('frequency');
      if (staged !== undefined) {
        frequencyInput.value = staged;
      } else {
        frequencyInput.value = String(modem.frequency);
      }
    }

    // Bandwidth input - use staged value if available, otherwise from state
    const bandwidthInput = this.domCache_.get('bandwidth-input') as HTMLInputElement;
    if (bandwidthInput && document.activeElement !== bandwidthInput) {
      const staged = this.stagedInputStrings_.get('bandwidth');
      if (staged !== undefined) {
        bandwidthInput.value = staged;
      } else {
        bandwidthInput.value = String(modem.bandwidth);
      }
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

    // Update validation visual feedback
    this.updateValidationDisplay_();
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
    if (!monitor) return;

    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    const allStates = ['no-power', 'no-signal', 'signal-found', 'signal-degraded', 'signal-no-video', 'signal-no-lock'];
    const setState = (...states: string[]) => {
      monitor.classList.remove(...allStates.filter((c) => !states.includes(c)));
      monitor.classList.add(...states);
    };

    if (!activeModem.isPowered) {
      setState('no-power');
      this.drawVideoMonitor_(false);
      return;
    }

    const visibleSignals = this.receiver.getVisibleSignals(activeModem);
    if (visibleSignals.length === 0) {
      setState('no-signal');
      this.drawVideoMonitor_(false);
      return;
    }

    // Only claim a picture or "SIGNAL LOCKED" when the modem holds
    // demodulation lock; otherwise the overlay reads "CARRIER PRESENT / NO LOCK"
    const hasLock = this.receiver.getSignalsInBandwidth(activeModem)?.hasLock ?? false;
    const hasVideoFeed = visibleSignals.some((s) => s.feed !== '');
    // Payload decoding: the frame sync the payload card reads is held
    const isDecoding = this.getPayloadProblem_() !== 'Frame sync lost';

    if (hasVideoFeed && hasLock && isDecoding) {
      setState('signal-found');
      monitor.classList.toggle('signal-degraded', this.receiver.isSignalDegraded(activeModem));
      this.drawVideoMonitor_(true);
      return;
    }

    setState('signal-no-video');
    monitor.classList.toggle('signal-no-lock', !hasLock);
    this.drawVideoMonitor_(false);
  }

  /** SMPTE-style colour bars (top band, then the castellation and PLUGE rows) */
  private static readonly BAR_COLOURS_ = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  private static readonly CASTELLATION_COLOURS_ = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];

  /**
   * Video Monitor picture (Phase 30 D14, nats-r5-s07-F3): a synthetic monitor
   * drawn on the canvas, never an external asset. Colour bars while the
   * carrier is locked and the payload decodes; otherwise a dark slate under
   * the overlay text ("NO SIGNAL", "NO POWER", "CARRIER PRESENT / NO LOCK").
   */
  private drawVideoMonitor_(isPicture: boolean): void {
    const canvas = this.domCache_.get('video-feed');
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const picture = isPicture ? 'bars' : 'slate';
    if (canvas.dataset.picture === picture) return;
    canvas.dataset.picture = picture;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;

    if (!isPicture) {
      ctx.fillStyle = '#0b0d10';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const barWidth = width / ReceiverAdapter.BAR_COLOURS_.length;
    const topHeight = Math.round(height * 0.67);
    const midHeight = Math.round(height * 0.08);
    ReceiverAdapter.BAR_COLOURS_.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(Math.floor(i * barWidth), 0, Math.ceil(barWidth), topHeight);
    });
    ReceiverAdapter.CASTELLATION_COLOURS_.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(Math.floor(i * barWidth), topHeight, Math.ceil(barWidth), midHeight);
    });
    // Bottom row: -I, white, +Q, black, then the PLUGE steps
    const bottomY = topHeight + midHeight;
    const bottomHeight = height - bottomY;
    const quarter = (width * 5) / 7 / 4;
    const bottom = ['#00214c', '#ffffff', '#32006a', '#131313'];
    bottom.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(Math.floor(i * quarter), bottomY, Math.ceil(quarter), bottomHeight);
    });
    const plugeX = (width * 5) / 7;
    const plugeWidth = (width - plugeX) / 3;
    ['#090909', '#131313', '#1d1d1d'].forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(Math.floor(plugeX + i * plugeWidth), bottomY, Math.ceil(plugeWidth), bottomHeight);
    });
  }

  private updatePowerAndSignal_(): void {
    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    // Power Switch - show user's pending request until actual state catches up
    const powerSwitch = this.domCache_.get('power-switch') as HTMLInputElement;
    if (powerSwitch) {
      if (this.pendingPowerState_ !== null) {
        // User has a pending request - show what they clicked
        powerSwitch.checked = this.pendingPowerState_;
        // Clear pending state once actual state matches
        if (activeModem.isPowered === this.pendingPowerState_) {
          this.pendingPowerState_ = null;
        }
      } else {
        // No pending request - show actual state
        powerSwitch.checked = activeModem.isPowered;
      }
    }

    // Signal Quality Status Badge
    const signalStatus = this.domCache_.get('signal-status');

    // When modem is powered off, clear all signal-related displays
    if (!activeModem.isPowered) {
      if (signalStatus) {
        signalStatus.className = 'status-badge status-badge-none';
        signalStatus.textContent = 'Off';
      }
      this.clearSignalDisplays_();
      this.signalSampleListener_?.(null);
      // Update alarm badge for powered-off state
      this.syncAlarmBadge_();
      return;
    }

    // Get signal info for C/N and ADC data (only when powered on)
    const signalInfo = this.receiver.getSignalsInBandwidth(activeModem);
    this.signalSampleListener_?.(signalInfo);

    // Signal Quality Status Badge - the card's one verdict (margin grade + payload)
    if (signalStatus) {
      if (!signalInfo.hasCarrier) {
        signalStatus.className = 'status-badge status-badge-none';
        signalStatus.textContent = 'None';
      } else {
        const verdict = this.getVerdict_(activeModem.modemNumber, signalInfo);
        signalStatus.className = `status-badge ${verdict.badgeClass}`;
        signalStatus.textContent = verdict.badgeText;
      }
    }

    // Use hasCarrier for all display logic (consistent with signal quality badge)
    const hasCarrier = signalInfo.hasCarrier;

    // Raw C/N display - only show when we have a carrier
    const cnRawDisplay = this.domCache_.get('cn-raw-display');
    if (cnRawDisplay) {
      const cn = signalInfo.cnRatio_dB;
      // A format mismatch leaves the raw figure measuring the wrong carrier next to a good Es/N0 (nats-eu-r1 s14-F4)
      cnRawDisplay.textContent = hasCarrier && !signalInfo.formatMismatch && cn > -50 ? `${cn.toFixed(1)} dB` : '-- dB';
    }

    // Effective C/N display - only show when we have a carrier
    const cnEffectiveDisplay = this.domCache_.get('cn-effective-display');
    if (cnEffectiveDisplay) {
      const effectiveCn = signalInfo.effectiveCnRatio_dB ?? signalInfo.cnRatio_dB;
      cnEffectiveDisplay.textContent = hasCarrier && effectiveCn > -50 ? `${effectiveCn.toFixed(1)} dB` : '-- dB';
    }

    // Es/N0 (after the ADC: what the demodulator locks on), C/N0 and the
    // MODCOD's requirement - only with a carrier
    this.setReadout_('esn0-display', hasCarrier ? signalInfo.effectiveEsN0_dB : undefined, 'dB');
    this.setReadout_('cn0-display', hasCarrier ? signalInfo.cn0_dBHz : undefined, 'dB-Hz');
    const requiredEl = this.domCache_.get('required-esn0-display');
    if (requiredEl) {
      const need = signalInfo.requiredEsN0_dB;
      // Both numbers the status texts quote: the MODCOD line and the acquisition line (nats-eu-r1 s02-F6, s17-F6)
      requiredEl.textContent =
        need !== undefined && Number.isFinite(need) ? `${need.toFixed(1)} dB (${signalInfo.modcod?.name ?? '--'}), locks at ${(need + LOCK_HYSTERESIS_DB).toFixed(1)} dB` : '-- dB';
    }

    // Power level display - only show when we have a carrier
    const powerLevelDisplay = this.domCache_.get('power-level-display');
    if (powerLevelDisplay) {
      const power = signalInfo.signalLevel_dBm;
      powerLevelDisplay.textContent = hasCarrier && power !== undefined ? `${power.toFixed(1)} dBm` : '-- dBm';
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
    this.syncAlarmBadge_();
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

    // Show/hide degradation breakdown - only when the drive is off its sweet
    // spot. At OPTIMAL a very clean carrier (a loopback at ~50 dB Es/N0) still
    // loses a little to the converter; that is its ceiling, not a fault, so it
    // reads as one neutral line instead of red penalties (phase 31 D10,
    // r5-s07-F1). The line quotes the ceiling that closes Raw (+) ceiling =
    // Effective on screen (Phase 32 D17, nats-r7-s07-F1). Effective C/N stays
    // as computed.
    const isOptimal = !!showAdcValues && adcDeg.status === 'optimal';
    const ceilingLine = this.domCache_.get('adc-ceiling-display');
    if (ceilingLine) {
      const rawCn = signalInfo.cnRatio_dB;
      const effectiveCn = signalInfo.effectiveCnRatio_dB ?? rawCn;
      const ceiling_dB = isOptimal && rawCn - effectiveCn > ReceiverAdapter.CEILING_LINE_MIN_DROP_DB ? ReceiverAdapter.converterCeilingDb(rawCn, effectiveCn) : Number.NaN;
      if (Number.isFinite(ceiling_dB)) {
        ceilingLine.textContent = `Converter ceiling: ~${ReceiverAdapter.formatHalfDb_(ceiling_dB)} dB`;
        ceilingLine.classList.remove('d-none');
      } else {
        ceilingLine.classList.add('d-none');
      }
    }

    const degradationSection = this.domCache_.get('degradation-section');
    if (degradationSection) {
      if (showAdcValues && !isOptimal && adcDeg.totalPenalty_dB > 0.1) {
        degradationSection.classList.remove('d-none');
        this.updatePenaltyDisplay_('clip-penalty-display', adcDeg.clipPenalty_dB);
        this.updatePenaltyDisplay_('quant-penalty-display', adcDeg.quantizationPenalty_dB);
        this.updatePenaltyDisplay_('total-penalty-display', adcDeg.totalPenalty_dB);
      } else {
        degradationSection.classList.add('d-none');
      }
    }
  }

  /**
   * Clear all signal-related displays when modem is powered off
   */
  private clearSignalDisplays_(): void {
    // Clear C/N displays
    const cnRawDisplay = this.domCache_.get('cn-raw-display');
    if (cnRawDisplay) cnRawDisplay.textContent = '-- dB';

    const cnEffectiveDisplay = this.domCache_.get('cn-effective-display');
    if (cnEffectiveDisplay) cnEffectiveDisplay.textContent = '-- dB';

    this.setReadout_('esn0-display', undefined, 'dB');
    this.setReadout_('cn0-display', undefined, 'dB-Hz');
    const requiredEl = this.domCache_.get('required-esn0-display');
    if (requiredEl) requiredEl.textContent = '-- dB';

    // Clear power and noise displays
    const powerLevelDisplay = this.domCache_.get('power-level-display');
    if (powerLevelDisplay) powerLevelDisplay.textContent = '-- dBm';

    const noiseFloorDisplay = this.domCache_.get('noise-floor-display');
    if (noiseFloorDisplay) noiseFloorDisplay.textContent = '-- dBm';

    // Clear ADC displays
    const adcLevelEl = this.domCache_.get('adc-level-display');
    if (adcLevelEl) {
      adcLevelEl.textContent = '-- dBFS';
      adcLevelEl.className = 'fw-bold font-monospace';
    }

    const adcStatusEl = this.domCache_.get('adc-status-display');
    if (adcStatusEl) {
      adcStatusEl.textContent = '--';
      adcStatusEl.className = 'status-badge status-badge-none';
    }

    // Hide degradation section and the ADC ceiling line
    const degradationSection = this.domCache_.get('degradation-section');
    if (degradationSection) {
      degradationSection.classList.add('d-none');
    }
    this.domCache_.get('adc-ceiling-display')?.classList.add('d-none');
  }

  /** Status bar alert class for each verdict severity */
  private static readonly STATUS_ALERTS: Record<RxModemSeverity, string> = {
    success: 'alert-success',
    info: 'alert-info',
    warning: 'alert-warning',
    error: 'alert-danger',
  };

  /** Write a readout, or "--" when the value is missing or meaningless */
  private setReadout_(elementId: string, value: number | undefined, unit: string): void {
    const el = this.domCache_.get(elementId);
    if (!el) return;
    el.textContent = value !== undefined && Number.isFinite(value) && value > -100 ? `${value.toFixed(1)} ${unit}` : `-- ${unit}`;
  }

  /** The ceiling line shows only when Effective C/N sits this far under Raw, dB */
  static readonly CEILING_LINE_MIN_DROP_DB = 0.3;

  /**
   * The converter's ceiling as the screen implies it (Phase 32 D17,
   * nats-r7-s07-F1): the one SNR that, power-added to the Raw C/N, gives the
   * Effective C/N, N = -10 log10(10^(-Eff/10) - 10^(-Raw/10)). It folds in
   * every term between the two readouts (ADC quantisation on the C/N footing
   * and LO phase noise), so the line, Raw and Effective always add up. NaN
   * when Effective is not below Raw.
   */
  static converterCeilingDb(rawCn_dB: number, effectiveCn_dB: number): number {
    const inverse = 10 ** (-effectiveCn_dB / 10) - 10 ** (-rawCn_dB / 10);
    return inverse > 0 ? -10 * Math.log10(inverse) : Number.NaN;
  }

  /** `40` or `39.5`: rounded to the nearest 0.5 dB */
  private static formatHalfDb_(value_dB: number): string {
    const rounded = Math.round(value_dB * 2) / 2;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }

  private updatePenaltyDisplay_(elementId: string, penalty: number): void {
    const el = this.domCache_.get(elementId);
    if (el) {
      el.textContent = `${penalty.toFixed(1)} dB`;
    }
  }

  private getAdcLevelClass_(status: ADCStatus): string {
    switch (status) {
      case 'optimal':
        return 'text-success';
      case 'clipping':
      case 'severe-clipping':
        return 'text-danger';
      case 'low-level':
      case 'severe-low':
        return 'text-info';
      default:
        return '';
    }
  }

  private getAdcStatusText_(status: ADCStatus): string {
    switch (status) {
      case 'optimal':
        return 'Optimal';
      case 'clipping':
        return 'Clipping';
      case 'severe-clipping':
        return 'CLIPPING!';
      case 'low-level':
        return 'Low Level';
      case 'severe-low':
        return 'LOW LEVEL!';
      default:
        return '--';
    }
  }

  private getAdcStatusBadgeClass_(status: ADCStatus): string {
    switch (status) {
      case 'optimal':
        return 'status-badge-good';
      case 'clipping':
        return 'status-badge-degraded';
      case 'severe-clipping':
        return 'status-badge-error';
      case 'low-level':
        return 'status-badge-degraded';
      case 'severe-low':
        return 'status-badge-error';
      default:
        return 'status-badge-none';
    }
  }

  private updateStatusBar_(): void {
    const statusBar = this.domCache_.get('status-bar');
    if (!statusBar) return;

    // Validation errors take priority
    if (this.validationErrors_.length > 0) {
      const err = this.validationErrors_[0];
      statusBar.className = 'alert alert-danger mt-3';
      const hint = err.educationalHint ? '<br><small>' + err.educationalHint + '</small>' : '';
      statusBar.innerHTML = '<strong>' + err.message + '</strong>' + hint;
      return;
    }

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

    // One verdict for the status bar, the alarm badge and the signal badge
    const verdict = this.getVerdict_(activeModem.modemNumber, signalInfo);
    statusBar.className = `alert ${ReceiverAdapter.STATUS_ALERTS[verdict.severity]} mt-3`;
    statusBar.textContent = verdict.statusText;
  }

  /** Grey LED title for a powered modem with no carrier it ever locked to (the Dashboard dot's wording) */
  private static readonly NO_CARRIER_IDLE_ = 'No carrier';

  /** Paint the card LED from the active modem's alarms and idle state */
  private syncAlarmBadge_(): void {
    const { alarms, idleStatus } = this.getAlarmBadgeState_();
    this.alarmBadge_.update(alarms, true, idleStatus);
  }

  /**
   * The card LED's alarms, plus the grey idle title when there is nothing to
   * report. Lock history first (Phase 34 D5, nats-r8-s24-F1): a modem that
   * had lock on this tuning and lost it reads the Dashboard's red "Carrier
   * lock lost - Modem N: ..." whether or not the carrier is still there; a
   * modem with no carrier and no loss is idle grey "No carrier", not a fault.
   */
  private getAlarmBadgeState_(): { alarms: AlarmStatus[]; idleStatus?: string } {
    const alarms: AlarmStatus[] = [];
    const activeModem = this.getActiveModem_();

    if (!activeModem) {
      return { alarms };
    }

    if (!activeModem.isPowered) {
      alarms.push({ severity: 'info', message: 'Modem powered off' });
      return { alarms };
    }

    const signalInfo = this.receiver.getSignalsInBandwidth(activeModem);
    // Read after getSignalsInBandwidth advanced the lock tracker
    const transition = typeof this.receiver.getLockTransition === 'function' ? this.receiver.getLockTransition(activeModem) : null;
    const lockAlarm = modemLockAlarm(activeModem.modemNumber, signalInfo, transition);

    if (lockAlarm?.label === LOCK_LOST_LABEL) {
      alarms.push({ severity: 'error', message: `${LOCK_LOST_LABEL} - ${lockAlarm.detail}` });
      return { alarms };
    }

    if (!signalInfo.hasCarrier) {
      return { alarms, idleStatus: ReceiverAdapter.NO_CARRIER_IDLE_ };
    }

    // Same verdict as the status bar and the signal badge. An interferer is
    // named inside the degraded-margin line, never as its own warning: a
    // notched spike at a good margin still clears the receiver's -10 dB
    // presence gate (Phase 33 D4, nats-r8-s05-F2)
    const verdict = this.getVerdict_(activeModem.modemNumber, signalInfo);
    if (verdict.alarmMessage) {
      alarms.push({ severity: verdict.severity, message: verdict.alarmMessage });
    }

    return { alarms };
  }

  /**
   * Validation Helper Methods
   */

  private updateValidationError_(field: 'frequency' | 'bandwidth', error: ValidationError | null): void {
    // Remove existing error for this field
    this.validationErrors_ = this.validationErrors_.filter((e) => e.field !== field);

    // Add new error if present
    if (error) {
      this.validationErrors_.push(error);
    }

    this.updateValidationDisplay_();
  }

  private updateApplyButtonState_(): void {
    const applyBtn = this.domCache_.get('apply-btn') as HTMLButtonElement;
    if (applyBtn) {
      applyBtn.disabled = this.validationErrors_.length > 0;
    }
  }

  private updateValidationDisplay_(): void {
    // Visual feedback on input fields
    const freqInput = this.domCache_.get('frequency-input');
    const freqError = this.validationErrors_.find((e) => e.field === 'frequency');
    freqInput?.classList.toggle('is-invalid', !!freqError);

    const bwInput = this.domCache_.get('bandwidth-input');
    const bwError = this.validationErrors_.find((e) => e.field === 'bandwidth');
    bwInput?.classList.toggle('is-invalid', !!bwError);
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
