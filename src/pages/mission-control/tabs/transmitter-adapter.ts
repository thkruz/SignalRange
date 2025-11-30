import { Transmitter, TransmitterModem, TransmitterState } from '@app/equipment/transmitter/transmitter';
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { qs } from "@app/engine/utils/query-selector";

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
  private lastStateString: string = '';
  private readonly alarmBadge_: CardAlarmBadge;

  constructor(transmitter: Transmitter, containerEl: HTMLElement) {
    this.transmitter = transmitter;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('tx-alarm-badge-led');
    const badgeContainer = qs('#tx-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Initialize
    this.setupDomCache_();
    this.setupEventListeners_();

    // Initial sync
    this.syncDomWithState_(this.transmitter.state);
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
    this.cacheElement_('tx-apply-btn', 'apply-btn');

    // Current value displays
    this.cacheElement_('tx-frequency-current', 'frequency-current');
    this.cacheElement_('tx-bandwidth-current', 'bandwidth-current');
    this.cacheElement_('tx-power-current', 'power-current');

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
    this.transmitter.setActiveModem(modemNumber);
    this.syncDomWithState_(this.transmitter.state);
  }

  private antennaHandler_(e: Event): void {
    const value = parseInt((e.target as HTMLSelectElement).value);
    this.transmitter.handleAntennaChange(value);
  }

  private frequencyHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.transmitter.handleFrequencyChange(value);
    }
  }

  private bandwidthHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.transmitter.handleBandwidthChange(value);
    }
  }

  private powerHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.transmitter.handlePowerChange(value);
    }
  }

  private applyHandler_(): void {
    this.transmitter.applyChanges();
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
    // Antenna selector
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    if (antennaSelect) {
      antennaSelect.value = String(modem.antenna_id);
    }

    // Frequency input (convert Hz to MHz)
    const frequencyInput = this.domCache_.get('frequency-input') as HTMLInputElement;
    if (frequencyInput) {
      frequencyInput.value = String(modem.ifSignal.frequency / 1e6);
    }

    // Bandwidth input (convert Hz to MHz)
    const bandwidthInput = this.domCache_.get('bandwidth-input') as HTMLInputElement;
    if (bandwidthInput) {
      bandwidthInput.value = String(modem.ifSignal.bandwidth / 1e6);
    }

    // Power input
    const powerInput = this.domCache_.get('power-input') as HTMLInputElement;
    if (powerInput) {
      powerInput.value = String(modem.ifSignal.power);
    }
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

    // LEDs
    const txLed = this.domCache_.get('tx-led');
    if (txLed) {
      txLed.classList.remove('led-gray', 'led-green', 'led-red');
      txLed.classList.add(activeModem.isTransmitting ? 'led-red' : 'led-gray');
    }

    const faultLed = this.domCache_.get('fault-led');
    if (faultLed) {
      faultLed.classList.remove('led-gray', 'led-green', 'led-red');
      faultLed.classList.add(activeModem.isFaulted ? 'led-red' : 'led-gray');
    }

    const loopbackLed = this.domCache_.get('loopback-led');
    if (loopbackLed) {
      loopbackLed.classList.remove('led-gray', 'led-amber');
      loopbackLed.classList.add(activeModem.isLoopback ? 'led-amber' : 'led-gray');
    }

    const onlineLed = this.domCache_.get('online-led');
    if (onlineLed) {
      onlineLed.classList.remove('led-gray', 'led-green');
      onlineLed.classList.add(activeModem.isPowered ? 'led-green' : 'led-gray');
    }
  }

  private updateStatusBar_(): void {
    const statusBar = this.domCache_.get('status-bar');
    const alarms = this.transmitter.getStatusAlarms();

    // Update alarm badge - immediate feedback
    this.alarmBadge_.update(alarms);

    if (!statusBar) return;

    if (alarms.length === 0) {
      statusBar.className = 'small text-muted mt-2 py-1 border-top';
      statusBar.textContent = 'Ready';
    } else {
      // Show first alarm (highest priority)
      const alarm = alarms[0];
      const colorClass = alarm.severity === 'error' ? 'text-danger' : alarm.severity === 'warning' ? 'text-warning' : 'text-muted';
      statusBar.className = `small ${colorClass} mt-2 py-1 border-top`;
      statusBar.textContent = alarm.message;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      if (key.startsWith('modem-')) {
        const modemNum = parseInt(key.split('-')[1]);
        const btn = this.domCache_.get(`modem-btn-${modemNum}`);
        btn?.removeEventListener('click', handler);
      } else {
        const el = this.domCache_.get(key);
        const eventType = key.includes('switch') ? 'change' : key.includes('btn') ? 'click' : 'input';
        el?.removeEventListener(eventType, handler);
      }
    });

    // Clear maps
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
