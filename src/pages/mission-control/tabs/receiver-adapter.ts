import { Receiver, ReceiverModemState, ReceiverState } from '@app/equipment/receiver/receiver';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { qs } from '@app/engine/utils/query-selector';

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
  private readonly receiver: Receiver;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;
  private lastStateString: string = '';

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
      this.syncDomWithState_(this.receiver.state);
    };

    // Initialize
    this.setupDomCache_();
    this.setupEventListeners_();
    this.subscribeToStateChanges_();

    // Initial sync
    this.syncDomWithState_(this.receiver.state);
  }

  /**
   * Subscribe to receiver state changes
   */
  private subscribeToStateChanges_(): void {
    EventBus.getInstance().on(Events.RX_CONFIG_CHANGED, this.stateChangeHandler_);
    EventBus.getInstance().on(Events.RX_ACTIVE_MODEM_CHANGED, this.stateChangeHandler_);
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

    // SNR and power level displays
    this.cacheElement_('snr-display');
    this.cacheElement_('power-level-display');

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
    this.syncDomWithState_(this.receiver.state);
  }

  private antennaHandler_(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
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
    this.syncDomWithState_(this.receiver.state);
  }

  private powerSwitchHandler_(e: Event): void {
    const isEnabled = (e.target as HTMLInputElement).checked;
    this.receiver.handlePowerToggle(isEnabled);
    this.syncDomWithState_(this.receiver.state);
  }

  /**
   * Sync DOM with receiver state
   * Uses state string comparison to prevent circular updates
   */
  private syncDomWithState_(state: Partial<ReceiverState>): void {
    // Prevent circular updates
    const stateString = JSON.stringify(state);
    if (stateString === this.lastStateString) return;
    this.lastStateString = stateString;

    // Update modem buttons (active state + signal quality indicators)
    this.updateModemButtons_();

    // Sync configuration inputs/displays for active modem
    const activeModem = this.getActiveModem_();
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

    const hasSignal = this.receiver.hasSignalForModem(modem);
    const isDegraded = this.receiver.isSignalDegraded(modem);

    if (!hasSignal) return '';
    if (isDegraded) return 'btn-rx-signal-degraded';
    return 'btn-rx-signal-good';
  }

  private updateConfigurationInputs_(modem: ReceiverModemState): void {
    // Antenna selector
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    if (antennaSelect) {
      antennaSelect.value = modem.antennaUuid;
    }

    // Frequency input
    const frequencyInput = this.domCache_.get('frequency-input') as HTMLInputElement;
    if (frequencyInput) {
      frequencyInput.value = String(modem.frequency);
    }

    // Bandwidth input
    const bandwidthInput = this.domCache_.get('bandwidth-input') as HTMLInputElement;
    if (bandwidthInput) {
      bandwidthInput.value = String(modem.bandwidth);
    }

    // Modulation selector
    const modulationSelect = this.domCache_.get('modulation-select') as HTMLSelectElement;
    if (modulationSelect) {
      modulationSelect.value = modem.modulation;
    }

    // FEC selector
    const fecSelect = this.domCache_.get('fec-select') as HTMLSelectElement;
    if (fecSelect) {
      fecSelect.value = modem.fec;
    }
  }

  private updateCurrentValueDisplays_(modem: ReceiverModemState): void {
    // Antenna current value
    const antennaCurrent = this.domCache_.get('antenna-current');
    if (antennaCurrent) {
      antennaCurrent.textContent = modem.antennaUuid;
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

    // Signal Quality Status Badge
    const signalStatus = this.domCache_.get('signal-status');
    if (signalStatus) {
      if (!activeModem.isPowered) {
        signalStatus.className = 'status-badge status-badge-none';
        signalStatus.textContent = 'Off';
      } else {
        const hasSignal = this.receiver.hasSignalForModem(activeModem);
        const isDegraded = this.receiver.isSignalDegraded(activeModem);

        if (!hasSignal) {
          signalStatus.className = 'status-badge status-badge-none';
          signalStatus.textContent = 'None';
        } else if (isDegraded) {
          signalStatus.className = 'status-badge status-badge-degraded';
          signalStatus.textContent = 'Degraded';
        } else {
          signalStatus.className = 'status-badge status-badge-good';
          signalStatus.textContent = 'Good';
        }
      }
    }

    // SNR display
    const snrDisplay = this.domCache_.get('snr-display');
    if (snrDisplay) {
      const snr = this.receiver.getSnrForModem(activeModem);
      snrDisplay.textContent = snr !== null ? `${snr.toFixed(1)} dB` : '-- dB';
    }

    // Power level display
    const powerLevelDisplay = this.domCache_.get('power-level-display');
    if (powerLevelDisplay) {
      const power = this.receiver.getPowerForModem(activeModem);
      powerLevelDisplay.textContent = power !== null ? `${power.toFixed(1)} dBm` : '-- dBm';
    }

    // Update alarm badge
    const alarms = this.getAlarmsFromReceiver_();
    this.alarmBadge_.update(alarms);
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

    const hasSignal = this.receiver.hasSignalForModem(activeModem);
    const isDegraded = this.receiver.isSignalDegraded(activeModem);

    if (!hasSignal) {
      statusBar.className = 'alert alert-info mt-3';
      statusBar.textContent = 'Searching for signal...';
    } else if (isDegraded) {
      statusBar.className = 'alert alert-warning mt-3';
      statusBar.textContent = 'Signal detected (degraded quality)';
    } else {
      statusBar.className = 'alert alert-success mt-3';
      statusBar.textContent = 'Signal locked - Good quality';
    }
  }

  /**
   * Get current alarms from receiver as AlarmStatus array
   */
  private getAlarmsFromReceiver_(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];
    const activeModem = this.getActiveModem_();

    if (!activeModem) return alarms;

    if (activeModem.isPowered) {
      const hasSignal = this.receiver.hasSignalForModem(activeModem);
      const isDegraded = this.receiver.isSignalDegraded(activeModem);

      if (!hasSignal) {
        alarms.push({ severity: 'warning', message: 'No signal detected' });
      } else if (isDegraded) {
        alarms.push({ severity: 'warning', message: 'Signal degraded' });
      }
    } else {
      alarms.push({ severity: 'info', message: 'Modem powered off' });
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
