import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { AGCModuleCore, AGCState } from "@app/equipment/rf-front-end/agc-module/agc-module-core";
import { qs } from "@app/engine/utils/query-selector";
import { CardAlarmBadge } from "@app/components/card-alarm-badge/card-alarm-badge";
import { AlarmStatus } from "@app/equipment/base-equipment";

/**
 * AGCAdapter - Bridges AGCModuleCore state to web controls
 *
 * AGC is fully automatic - the only user control is Bypass toggle.
 * All other values are read-only status displays.
 */
export class AGCAdapter {
  private static readonly UPDATE_INTERVAL_MS = 100; // Faster updates for AGC dynamics

  private readonly agcModule: AGCModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<AGCState>) => void;
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  constructor(agcModule: AGCModuleCore, containerEl: HTMLElement) {
    this.agcModule = agcModule;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('agc-alarm-badge-led');
    const badgeContainer = qs('#agc-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<AGCState>) => {
      this.syncDomWithState_(state);
    };

    // Bind update handler for periodic sync
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);

    this.initialize();
  }

  private initialize(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to AGC state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_AGC_CHANGED, this.stateChangeHandler as any);

    // Listen to UPDATE event for periodic sync of continuously-changing values
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.agcModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < AGCAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncReadOnlyDisplays_();
  }

  /**
   * Sync only read-only status displays
   */
  private syncReadOnlyDisplays_(): void {
    const state = this.agcModule.state;

    // Update gain display
    const gainDisplay = this.domCache_.get('gainDisplay');
    if (gainDisplay) {
      gainDisplay.textContent = `${state.currentGain.toFixed(1)} dB`;
    }

    // Update input power display
    const inputPowerDisplay = this.domCache_.get('inputPowerDisplay');
    if (inputPowerDisplay) {
      inputPowerDisplay.textContent = `${state.inputPower.toFixed(1)} dBm`;
    }

    // Update output power display
    const outputPowerDisplay = this.domCache_.get('outputPowerDisplay');
    if (outputPowerDisplay) {
      outputPowerDisplay.textContent = `${state.outputPower.toFixed(1)} dBm`;
    }

    // Update status indicator
    const statusIndicator = this.domCache_.get('statusIndicator');
    if (statusIndicator) {
      const status = this.agcModule.getStatus();
      this.updateStatusBadge_(statusIndicator, status);
    }

    // Update alarm badge
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  private updateStatusBadge_(element: HTMLElement, status: 'active' | 'bypassed' | 'at-max' | 'at-min'): void {
    switch (status) {
      case 'active':
        element.className = 'status-badge status-badge-locked';
        element.textContent = 'Active';
        break;
      case 'bypassed':
        element.className = 'status-badge status-badge-off';
        element.textContent = 'Bypassed';
        break;
      case 'at-max':
        element.className = 'status-badge status-badge-warning';
        element.textContent = 'At Max';
        break;
      case 'at-min':
        element.className = 'status-badge status-badge-warning';
        element.textContent = 'At Min';
        break;
    }
  }

  private setupDomCache_(): void {
    this.domCache_.set('bypassSwitch', qs('#agc-bypass', this.containerEl));
    this.domCache_.set('gainDisplay', qs('#agc-gain-display', this.containerEl));
    this.domCache_.set('inputPowerDisplay', qs('#agc-input-power-display', this.containerEl));
    this.domCache_.set('outputPowerDisplay', qs('#agc-output-power-display', this.containerEl));
    this.domCache_.set('statusIndicator', qs('#agc-status', this.containerEl));
  }

  private setupInputListeners_(): void {
    const bypassSwitch = this.domCache_.get('bypassSwitch') as HTMLInputElement;

    if (bypassSwitch) {
      const handler = this.bypassHandler_.bind(this);
      bypassSwitch.addEventListener('change', handler);
      this.boundHandlers.set('bypass', handler);
    }
  }

  private bypassHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.agcModule.handleBypassToggle(isChecked);
    this.syncDomWithState_(this.agcModule.state);
  }

  private syncDomWithState_(state: Partial<AGCState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    // Update bypass switch
    if (state.isBypassed !== undefined) {
      const bypassSwitch = this.domCache_.get('bypassSwitch') as HTMLInputElement;
      if (bypassSwitch) bypassSwitch.checked = state.isBypassed;
    }

    // Update all displays
    this.syncReadOnlyDisplays_();
  }

  /**
   * Get current alarms from AGC module as AlarmStatus array
   */
  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.agcModule.getAlarms();
    return alarmStrings.map(message => ({
      severity: this.classifySeverity_(message),
      message
    }));
  }

  /**
   * Classify alarm message severity based on content
   */
  private classifySeverity_(message: string): AlarmStatus['severity'] {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('interference')) {
      return 'error';
    }
    return 'warning';
  }

  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.RF_FE_AGC_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners
    const bypassSwitch = this.domCache_.get('bypassSwitch') as HTMLInputElement;
    const bypassHandler = this.boundHandlers.get('bypass');
    if (bypassSwitch && bypassHandler) {
      bypassSwitch.removeEventListener('change', bypassHandler);
    }

    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
