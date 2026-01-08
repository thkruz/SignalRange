import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { qs } from "@app/engine/utils/query-selector";
import { ValidationError, validateModemBandwidth, validateModemFrequency } from '@app/equipment/modem/modem-constraints';
import { Transmitter, TransmitterModem, TransmitterState } from '@app/equipment/transmitter/transmitter';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { formatBandwidthMHz, formatFrequencyMHz } from '@app/utils/format-number';
import { parseLocalizedNumber } from '@app/utils/parse-number';

/**
 * TransmitterAdapter - Bridges Transmitter equipment class to modern Mission Control UI
 *
 * Follows established adapter pattern:
 * - readonly properties for immutable references
 * - DOM caching to eliminate repeated queries
 * - Private methods with underscore suffix
 * - Extracted event handlers (not inline)
 * - Strongly-typed state handlers
 * - Circular update prevention via state string comparison
 */
export class TransmitterAdapter {
  private readonly transmitter: Transmitter;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler_: () => void;
  private lastStateString: string = '';
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged input strings for exact user input preservation
  private stagedInputStrings_: Map<string, string> = new Map();

  // Validation errors for user feedback
  private validationErrors_: ValidationError[] = [];

  constructor(transmitter: Transmitter, containerEl: HTMLElement) {
    this.transmitter = transmitter;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('tx-alarm-badge-led');
    const badgeContainer = qs('#tx-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Create state change handler
    this.stateChangeHandler_ = () => {
      this.syncDomWithState_(this.transmitter.state);
    };

    // Initialize
    this.setupDomCache_();
    this.setupEventListeners_();
    this.subscribeToStateChanges_();

    // Initial sync
    this.syncDomWithState_(this.transmitter.state);
  }

  /**
   * Subscribe to transmitter state changes
   */
  private subscribeToStateChanges_(): void {
    EventBus.getInstance().on(Events.TX_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.TX_ACTIVE_MODEM_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.TX_TRANSMIT_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.SYNC, this.stateChangeHandler_);
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

    // Configuration inputs (HTML uses tx- prefix)
    this.cacheElement_('tx-antenna-select', 'antenna-select');
    this.cacheElement_('tx-frequency-input', 'frequency-input');
    this.cacheElement_('tx-bandwidth-input', 'bandwidth-input');
    this.cacheElement_('tx-power-input', 'power-input');
    this.cacheElement_('tx-modulation-select', 'modulation-select');
    this.cacheElement_('tx-fec-select', 'fec-select');
    this.cacheElement_('tx-apply-btn', 'apply-btn');

    // Current value displays
    this.cacheElement_('tx-frequency-current', 'frequency-current');
    this.cacheElement_('tx-bandwidth-current', 'bandwidth-current');
    this.cacheElement_('tx-power-current', 'power-current');
    this.cacheElement_('tx-modulation-current', 'modulation-current');
    this.cacheElement_('tx-fec-current', 'fec-current');

    // Power budget visualization
    this.cacheElement_('tx-power-bar', 'power-bar');
    this.cacheElement_('tx-power-percentage', 'power-percentage');

    // Switches
    this.cacheElement_('tx-transmit-switch', 'tx-switch');
    this.cacheElement_('tx-fault-reset-btn', 'fault-reset-btn');
    this.cacheElement_('tx-loopback-switch', 'loopback-switch');
    this.cacheElement_('tx-power-switch', 'power-switch');

    // Status LEDs
    this.cacheElement_('tx-transmit-led', 'tx-led');
    this.cacheElement_('tx-fault-led', 'fault-led');
    this.cacheElement_('tx-loopback-led', 'loopback-led');
    this.cacheElement_('tx-online-led', 'online-led');

    // Status bar
    this.cacheElement_('tx-status-bar', 'status-bar');
  }

  /**
   * Helper to cache a single element
   * @param htmlId - The actual HTML element ID
   * @param cacheKey - The key to use in the cache (defaults to htmlId)
   */
  private cacheElement_(htmlId: string, cacheKey?: string): void {
    const el = this.containerEl.querySelector(`#${htmlId}`);
    if (el) this.domCache_.set(cacheKey || htmlId, el as HTMLElement);
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

    const powerInput = this.domCache_.get('power-input');
    if (powerInput) {
      const handler = (e: Event) => this.powerHandler_(e);
      powerInput.addEventListener('input', handler);
      this.boundHandlers.set('power', handler);
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

    // Switches
    const txSwitch = this.domCache_.get('tx-switch');
    if (txSwitch) {
      const handler = (e: Event) => this.txSwitchHandler_(e);
      txSwitch.addEventListener('change', handler);
      this.boundHandlers.set('tx-switch', handler);
    }

    const faultResetBtn = this.domCache_.get('fault-reset-btn');
    if (faultResetBtn) {
      const handler = () => this.faultResetHandler_();
      faultResetBtn.addEventListener('click', handler);
      this.boundHandlers.set('fault-reset', handler as EventListener);
    }

    const loopbackSwitch = this.domCache_.get('loopback-switch');
    if (loopbackSwitch) {
      const handler = (e: Event) => this.loopbackHandler_(e);
      loopbackSwitch.addEventListener('change', handler);
      this.boundHandlers.set('loopback', handler);
    }

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

    this.transmitter.setActiveModem(modemNumber);
    this.syncDomWithState_(this.transmitter.state);
  }

  private antennaHandler_(e: Event): void {
    const value = parseInt((e.target as HTMLSelectElement).value);
    this.transmitter.handleAntennaChange(value);
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

      // Still update transmitter for live preview
      this.transmitter.handleFrequencyChange(value);
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

      // Still update transmitter for live preview
      this.transmitter.handleBandwidthChange(value);
    } else {
      // Invalid number - clear any existing bandwidth error
      this.updateValidationError_('bandwidth', null);
    }

    this.updateApplyButtonState_();
  }

  private powerHandler_(e: Event): void {
    const inputEl = e.target as HTMLInputElement;
    const rawValue = inputEl.value;

    // Store exact user input for display preservation
    this.stagedInputStrings_.set('power', rawValue);

    const value = parseLocalizedNumber(rawValue);
    if (!isNaN(value)) {
      this.transmitter.handlePowerChange(value);
    }
  }

  private modulationHandler_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.transmitter.handleModulationChange(value);
  }

  private fecHandler_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.transmitter.handleFecChange(value);
  }

  private applyHandler_(): void {
    // Don't apply if there are validation errors
    if (this.validationErrors_.length > 0) {
      return;
    }

    this.transmitter.applyChanges();

    // Clear staged inputs after successful apply
    this.stagedInputStrings_.clear();

    this.syncDomWithState_(this.transmitter.state);
  }

  private txSwitchHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.transmitter.handleTransmitToggle(isEnabled);
    this.syncDomWithState_(this.transmitter.state);
  }

  private faultResetHandler_(): void {
    this.transmitter.handleFaultReset();
    this.syncDomWithState_(this.transmitter.state);
  }

  private loopbackHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.transmitter.handleLoopbackToggle(isEnabled);
    this.syncDomWithState_(this.transmitter.state);
  }

  private powerSwitchHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.transmitter.handlePowerToggle(isEnabled);
    this.syncDomWithState_(this.transmitter.state);
  }

  /**
   * Sync DOM with transmitter state
   * Uses state string comparison to prevent circular updates
   */
  private syncDomWithState_(state: Partial<TransmitterState>): void {
    // Prevent circular updates
    const stateString = JSON.stringify(state);
    if (stateString === this.lastStateString) return;
    this.lastStateString = stateString;

    // Update modem buttons (active state + transmitting indicator)
    this.updateModemButtons_();

    // Sync configuration inputs/displays for active modem
    const activeModem = this.getActiveModem_();
    if (activeModem) {
      this.updateConfigurationInputs_(activeModem);
      this.updateCurrentValueDisplays_(activeModem);
    }

    // Update power budget visualization
    this.updatePowerBudgetBar_();

    // Update switches/LEDs
    this.updateSwitchesAndLeds_();

    // Update status bar
    this.updateStatusBar_();
  }

  /**
   * Helper Methods
   */

  private getActiveModem_(): TransmitterModem | undefined {
    return this.transmitter.state.modems.find(
      m => m.modem_number === this.transmitter.state.activeModem
    );
  }

  private updateModemButtons_(): void {
    for (let i = 1; i <= 4; i++) {
      const btn = this.domCache_.get(`modem-btn-${i}`);
      if (!btn) continue;

      const modem = this.transmitter.state.modems.find(m => m.modem_number === i);
      const isActive = i === this.transmitter.state.activeModem;

      // Update classes
      btn.classList.remove('active', 'transmitting');
      if (isActive) btn.classList.add('active');
      if (modem?.isTransmitting) btn.classList.add('transmitting');
    }
  }

  private updateConfigurationInputs_(modem: TransmitterModem): void {
    // Antenna selector - skip if user is focused
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    if (antennaSelect && document.activeElement !== antennaSelect) {
      antennaSelect.value = String(modem.antenna_id);
    }

    // Frequency input - use staged value if available, otherwise format from state
    const frequencyInput = this.domCache_.get('frequency-input') as HTMLInputElement;
    if (frequencyInput && document.activeElement !== frequencyInput) {
      const staged = this.stagedInputStrings_.get('frequency');
      if (staged !== undefined) {
        frequencyInput.value = staged;
      } else {
        frequencyInput.value = formatFrequencyMHz(modem.ifSignal.frequency);
      }
    }

    // Bandwidth input - use staged value if available, otherwise format from state
    const bandwidthInput = this.domCache_.get('bandwidth-input') as HTMLInputElement;
    if (bandwidthInput && document.activeElement !== bandwidthInput) {
      const staged = this.stagedInputStrings_.get('bandwidth');
      if (staged !== undefined) {
        bandwidthInput.value = staged;
      } else {
        bandwidthInput.value = formatBandwidthMHz(modem.ifSignal.bandwidth);
      }
    }

    // Power input - use staged value if available
    const powerInput = this.domCache_.get('power-input') as HTMLInputElement;
    if (powerInput && document.activeElement !== powerInput) {
      const staged = this.stagedInputStrings_.get('power');
      if (staged !== undefined) {
        powerInput.value = staged;
      } else {
        powerInput.value = String(modem.ifSignal.power);
      }
    }

    // Modulation selector - skip if user is focused
    const modulationSelect = this.domCache_.get('modulation-select') as HTMLSelectElement;
    if (modulationSelect && document.activeElement !== modulationSelect) {
      modulationSelect.value = modem.ifSignal.modulation;
    }

    // FEC selector - skip if user is focused
    const fecSelect = this.domCache_.get('fec-select') as HTMLSelectElement;
    if (fecSelect && document.activeElement !== fecSelect) {
      fecSelect.value = modem.ifSignal.fec;
    }

    // Update validation visual feedback
    this.updateValidationDisplay_();
  }

  private updateCurrentValueDisplays_(modem: TransmitterModem): void {
    // Antenna current value
    const antennaCurrent = this.domCache_.get('antenna-current');
    if (antennaCurrent) {
      antennaCurrent.textContent = String(modem.antenna_id);
    }

    // Frequency current value
    const frequencyCurrent = this.domCache_.get('frequency-current');
    if (frequencyCurrent) {
      frequencyCurrent.textContent = `${(modem.ifSignal.frequency / 1e6).toFixed(1)} MHz`;
    }

    // Bandwidth current value
    const bandwidthCurrent = this.domCache_.get('bandwidth-current');
    if (bandwidthCurrent) {
      bandwidthCurrent.textContent = `${(modem.ifSignal.bandwidth / 1e6).toFixed(1)} MHz`;
    }

    // Power current value
    const powerCurrent = this.domCache_.get('power-current');
    if (powerCurrent) {
      powerCurrent.textContent = `${modem.ifSignal.power} dBm`;
    }

    // Modulation current value
    const modulationCurrent = this.domCache_.get('modulation-current');
    if (modulationCurrent) {
      modulationCurrent.textContent = modem.ifSignal.modulation;
    }

    // FEC current value
    const fecCurrent = this.domCache_.get('fec-current');
    if (fecCurrent) {
      fecCurrent.textContent = modem.ifSignal.fec;
    }
  }

  private updatePowerBudgetBar_(): void {
    const percentage = this.transmitter.getPowerPercentage();
    const bar = this.domCache_.get('power-bar');
    const display = this.domCache_.get('power-percentage');

    if (bar) {
      bar.style.width = `${Math.min(percentage, 100)}%`;

      // Color coding
      bar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
      if (percentage >= 100) {
        bar.classList.add('bg-danger');
      } else if (percentage >= 80) {
        bar.classList.add('bg-warning');
      } else {
        bar.classList.add('bg-success');
      }
    }

    if (display) {
      display.textContent = `${percentage.toFixed(1)}%`;
    }
  }

  private updateSwitchesAndLeds_(): void {
    const activeModem = this.getActiveModem_();
    if (!activeModem) return;

    // TX Switch
    const txSwitch = this.domCache_.get('tx-switch') as HTMLInputElement;
    if (txSwitch) {
      txSwitch.checked = activeModem.isTransmitting;
    }

    // Loopback Switch
    const loopbackSwitch = this.domCache_.get('loopback-switch') as HTMLInputElement;
    if (loopbackSwitch) {
      loopbackSwitch.checked = activeModem.isLoopback;
    }

    // Power Switch
    const powerSwitch = this.domCache_.get('power-switch') as HTMLInputElement;
    if (powerSwitch) {
      powerSwitch.checked = activeModem.isPowered;
    }

    // LEDs (using card-alarm-led flat style)
    const txLed = this.domCache_.get('tx-led');
    if (txLed) {
      txLed.classList.remove('off', 'success', 'error', 'warning');
      txLed.classList.add(activeModem.isTransmitting ? 'error' : 'off');
    }

    const faultLed = this.domCache_.get('fault-led');
    if (faultLed) {
      faultLed.classList.remove('off', 'success', 'error', 'warning');
      faultLed.classList.add(activeModem.isFaulted ? 'error' : 'off');
    }

    const loopbackLed = this.domCache_.get('loopback-led');
    if (loopbackLed) {
      loopbackLed.classList.remove('off', 'success', 'error', 'warning');
      loopbackLed.classList.add(activeModem.isLoopback ? 'warning' : 'off');
    }

    const onlineLed = this.domCache_.get('online-led');
    if (onlineLed) {
      onlineLed.classList.remove('off', 'success', 'error', 'warning');
      onlineLed.classList.add(activeModem.isPowered ? 'success' : 'off');
    }
  }

  private updateStatusBar_(): void {
    const statusBar = this.domCache_.get('status-bar');
    const alarms = this.transmitter.getStatusAlarms();

    // Update alarm badge - immediate feedback
    this.alarmBadge_.update(alarms);

    if (!statusBar) return;

    // Validation errors take priority - don't overwrite them
    if (this.validationErrors_.length > 0) {
      return;
    }

    if (alarms.length === 0) {
      if (this.transmitter.state.modems[this.transmitter.state.activeModem - 1]?.isTransmitting) {
        statusBar.className = 'alert alert-success mt-3';
        statusBar.textContent = 'Transmitting';
      } else {
        statusBar.className = 'alert alert-info mt-3';
        statusBar.textContent = 'Ready';
      }
    } else {
      // Show first alarm (highest priority)
      const alarm = alarms[0];
      let alertClass = 'alert-info';
      if (alarm.severity === 'error') {
        alertClass = 'alert-danger';
      } else if (alarm.severity === 'warning') {
        alertClass = 'alert-warning';
      }
      statusBar.className = `alert ${alertClass} mt-3`;
      statusBar.textContent = alarm.message;
    }
  }

  /**
   * Validation Helper Methods
   */

  private updateValidationError_(field: 'frequency' | 'bandwidth', error: ValidationError | null): void {
    // Remove existing error for this field
    this.validationErrors_ = this.validationErrors_.filter(e => e.field !== field);

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
    const freqError = this.validationErrors_.find(e => e.field === 'frequency');
    freqInput?.classList.toggle('is-invalid', !!freqError);

    const bwInput = this.domCache_.get('bandwidth-input');
    const bwError = this.validationErrors_.find(e => e.field === 'bandwidth');
    bwInput?.classList.toggle('is-invalid', !!bwError);

    // Update status bar with validation error (takes priority over normal status)
    if (this.validationErrors_.length > 0) {
      const statusBar = this.domCache_.get('status-bar');
      if (statusBar) {
        const err = this.validationErrors_[0];
        statusBar.className = 'alert alert-danger mt-3';
        const hint = err.educationalHint
          ? '<br><small>' + err.educationalHint + '</small>'
          : '';
        statusBar.innerHTML = '<strong>' + err.message + '</strong>' + hint;
      }
    } else {
      this.updateStatusBar_();
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Unsubscribe from state changes
    EventBus.getInstance().off(Events.TX_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.TX_ACTIVE_MODEM_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.TX_TRANSMIT_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().off(Events.SYNC, this.stateChangeHandler_);

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      if (key.startsWith('modem-')) {
        const modemNum = parseInt(key.split('-')[1]);
        const btn = this.domCache_.get(`modem-btn-${modemNum}`);
        btn?.removeEventListener('click', handler);
      } else {
        const el = this.domCache_.get(key);
        // Determine event type based on handler key
        let eventType: string;
        if (key.includes('switch') || key === 'antenna' || key === 'modulation' || key === 'fec') {
          eventType = 'change';
        } else if (key.includes('btn') || key === 'apply' || key === 'fault-reset') {
          eventType = 'click';
        } else {
          eventType = 'input';
        }
        el?.removeEventListener(eventType, handler);
      }
    });

    // Clear maps
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
