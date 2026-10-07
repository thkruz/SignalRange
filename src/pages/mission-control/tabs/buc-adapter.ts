import { CardAlarmBadge } from '@app/components/card-alarm-badge/card-alarm-badge';
import { qs } from '@app/engine/utils/query-selector';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { BUCModuleCore, BUCState } from '@app/equipment/rf-front-end/buc-module/buc-module-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { parseLocalizedNumber } from '@app/utils/parse-number';

/**
 * BUCAdapter - Bridges BUCModuleCore state to web controls
 *
 * Provides bidirectional synchronization between:
 * - DOM input controls (sliders, switches) → BUC Core handlers
 * - BUC Core state changes → DOM updates
 *
 * Prevents circular updates via state comparison
 */
export class BUCAdapter {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly bucModule: BUCModuleCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private lastSyncTime_: number = 0;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<BUCState>) => void;
  private readonly boundUpdateHandler_: () => void;
  private readonly alarmBadge_: CardAlarmBadge;

  // Staged values - not applied until Apply button is clicked
  private stagedLoFrequency_: number = 6425;
  private stagedGain_: number = 58;
  /**
   * Pending (staged but not applied) edits. Toggles and external state events
   * must not overwrite a pending staged value; it clears on Apply or when the
   * staged value is brought back to the applied one.
   */
  private hasPendingLoEdit_ = false;
  private hasPendingGainEdit_ = false;

  constructor(bucModule: BUCModuleCore, containerEl: HTMLElement) {
    this.bucModule = bucModule;
    this.containerEl = containerEl;

    // Create alarm badge
    this.alarmBadge_ = CardAlarmBadge.create('buc-alarm-badge-led');
    const badgeContainer = qs('#buc-alarm-badge', containerEl);
    if (badgeContainer) {
      badgeContainer.innerHTML = this.alarmBadge_.html;
    }

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<BUCState>) => {
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

    // Listen to BUC state changes via EventBus
    EventBus.getInstance().on(Events.RF_FE_BUC_CHANGED, this.stateChangeHandler as any);

    // Listen to UPDATE event for periodic sync of continuously-changing values
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    // Initial sync
    this.syncDomWithState_(this.bucModule.state);
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < BUCAdapter.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    // Only sync read-only displays, not user-editable inputs
    this.syncReadOnlyDisplays_();
  }

  /**
   * Sync only read-only status displays (not user inputs)
   * Used by throttled UPDATE handler to avoid overwriting staged values
   */
  /** The case temperature trend: slope, the reading ten minutes back, and a 30-minute sparkline with the trip line (nats-s13-F1) */
  private syncTemperatureTrend_(): void {
    const isPowered = this.bucModule.state.isPowered;
    const log = this.bucModule.temperatureLog;
    const trend = isPowered ? this.bucModule.temperatureTrendCPerMin() : null;

    const trendDisplay = this.domCache_.get('trendDisplay');
    if (trendDisplay) {
      if (trend === null) {
        trendDisplay.textContent = '-- °C/min';
      } else {
        const arrow = trend > 0.05 ? '▲' : trend < -0.05 ? '▼' : '→';
        trendDisplay.textContent = `${trend >= 0 ? '+' : ''}${trend.toFixed(2)} °C/min ${arrow}`;
      }
    }

    const tenMinDisplay = this.domCache_.get('tenMinDisplay');
    if (tenMinDisplay) {
      const past = isPowered ? log.readingMinutesAgo(10) : null;
      tenMinDisplay.textContent = past === null ? '-- °C' : `${past.toFixed(1)} °C`;
    }

    const path = this.domCache_.get('sparklinePath');
    const tripLine = this.domCache_.get('sparklineTrip');
    const samples = log.samples;
    if (!path || samples.length < 2 || !isPowered) {
      path?.setAttribute('points', '');
      tripLine?.setAttribute('y1', '-10');
      tripLine?.setAttribute('y2', '-10');
      return;
    }
    const tEnd = samples[samples.length - 1].tMs;
    const tStart = tEnd - log.windowS * 1000;
    let lo = Math.min(...samples.map((x) => x.celsius));
    let hi = Math.max(...samples.map((x) => x.celsius));
    // Show the trip point when it is within reach of the curve
    if (BUCAdapter.TRIP_C - hi < 15) hi = Math.max(hi, BUCAdapter.TRIP_C);
    if (hi - lo < 4) {
      const mid = (hi + lo) / 2;
      lo = mid - 2;
      hi = mid + 2;
    }
    const x = (tMs: number) => ((tMs - tStart) / (tEnd - tStart)) * 120;
    const y = (c: number) => 28 - ((c - lo) / (hi - lo)) * 26;
    path.setAttribute('points', samples.map((s) => `${x(s.tMs).toFixed(1)},${y(s.celsius).toFixed(1)}`).join(' '));
    const tripY = BUCAdapter.TRIP_C <= hi ? y(BUCAdapter.TRIP_C).toFixed(1) : '-10';
    tripLine?.setAttribute('y1', tripY);
    tripLine?.setAttribute('y2', tripY);
  }

  /** The over-temperature alarm point, °C (BUCModuleCore alarms above 70) */
  private static readonly TRIP_C = 70;

  private syncReadOnlyDisplays_(): void {
    const state = this.bucModule.state;
    const isPowered = state.isPowered;

    // Sync switches from external changes (scenario events, faults, other consoles)
    this.syncSwitch_('powerSwitch', state.isPowered);
    this.syncSwitch_('muteSwitch', state.isMuted);
    this.syncSwitch_('loopbackSwitch', state.isLoopback);

    // Applied values can change without an event; keep staged inputs and the
    // pending indicator honest (pending edits are preserved)
    this.syncStagedFromState_(state.loFrequency, state.gain);

    // Update RF Status displays - show actual output signal power for consistency with HPA input
    const outputPowerDisplay = this.domCache_.get('outputPowerDisplay');
    if (outputPowerDisplay) {
      if (isPowered && this.bucModule.outputSignals.length > 0) {
        outputPowerDisplay.textContent = `${this.bucModule.outputSignals[0].power.toFixed(1)} dBm`;
      } else {
        outputPowerDisplay.textContent = '-- dBm';
      }
    }

    // Display RF output frequency (after LO mixing and bandpass filter)
    const rfFrequencyDisplay = this.domCache_.get('rfFrequencyDisplay');
    if (rfFrequencyDisplay) {
      if (isPowered && this.bucModule.outputSignals.length > 0) {
        const rfFreqHz = this.bucModule.outputSignals[0].frequency;
        const rfFreqMHz = rfFreqHz / 1e6;
        rfFrequencyDisplay.textContent = `${rfFreqMHz.toFixed(2)} MHz`;
      } else {
        rfFrequencyDisplay.textContent = '-- MHz';
      }
    }

    // Calculate and display P1dB margin
    const p1dbMarginDisplay = this.domCache_.get('p1dbMarginDisplay');
    if (p1dbMarginDisplay) {
      p1dbMarginDisplay.textContent = this.formatP1dbMargin_(state);
    }

    // Update lock status
    const lockStatus = this.domCache_.get('lockStatus');
    if (lockStatus) {
      if (isPowered) {
        lockStatus.textContent = state.isExtRefLocked ? 'Locked' : 'Unlocked';
        lockStatus.className = state.isExtRefLocked ? 'status-badge status-badge-locked' : 'status-badge status-badge-unlocked';
      } else {
        lockStatus.textContent = '--';
        lockStatus.className = 'status-badge status-badge-off';
      }
    }

    // Update sideband status
    const sidebandStatus = this.domCache_.get('sidebandStatus');
    if (sidebandStatus) {
      if (isPowered) {
        const mode = this.bucModule.getActiveInjectionMode();
        if (mode === 'low') {
          sidebandStatus.textContent = 'USB';
          sidebandStatus.className = 'status-badge status-badge-good';
        } else if (mode === 'high') {
          sidebandStatus.textContent = 'LSB';
          sidebandStatus.className = 'status-badge status-badge-good';
        } else {
          sidebandStatus.textContent = 'Out of Band';
          sidebandStatus.className = 'status-badge status-badge-warning';
        }
      } else {
        sidebandStatus.textContent = '--';
        sidebandStatus.className = 'status-badge status-badge-off';
      }
    }

    // Update Thermal displays
    const temperatureDisplay = this.domCache_.get('temperatureDisplay');
    if (temperatureDisplay) {
      temperatureDisplay.textContent = isPowered ? `${state.temperature.toFixed(1)} °C` : '-- °C';
    }

    const currentDisplay = this.domCache_.get('currentDisplay');
    if (currentDisplay) {
      currentDisplay.textContent = isPowered ? `${state.currentDraw.toFixed(2)} A` : '-- A';
    }

    this.syncTemperatureTrend_();

    // Update Signal Quality displays
    const phaseNoiseDisplay = this.domCache_.get('phaseNoiseDisplay');
    if (phaseNoiseDisplay) {
      phaseNoiseDisplay.textContent = isPowered ? `${state.phaseNoise.toFixed(0)} dBc/Hz` : '-- dBc/Hz';
    }

    const freqErrorDisplay = this.domCache_.get('freqErrorDisplay');
    if (freqErrorDisplay) {
      if (isPowered) {
        const absError = Math.abs(state.frequencyError);
        if (absError >= 1000) {
          freqErrorDisplay.textContent = `${(state.frequencyError / 1000).toFixed(1)} kHz`;
        } else {
          freqErrorDisplay.textContent = `${state.frequencyError.toFixed(0)} Hz`;
        }
      } else {
        freqErrorDisplay.textContent = '-- Hz';
      }
    }

    // Update alarm badge
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  private setupDomCache_(): void {
    // LO Frequency controls (input field is now the display)
    this.domCache_.set('loFreqInput', qs('#buc-lo-frequency', this.containerEl));
    this.domCache_.set('loDecCoarse', qs('#buc-lo-dec-coarse', this.containerEl));
    this.domCache_.set('loDecFine', qs('#buc-lo-dec-fine', this.containerEl));
    this.domCache_.set('loIncFine', qs('#buc-lo-inc-fine', this.containerEl));
    this.domCache_.set('loIncCoarse', qs('#buc-lo-inc-coarse', this.containerEl));

    // Gain controls (input field is now the display)
    this.domCache_.set('gainInput', qs('#buc-gain', this.containerEl));
    this.domCache_.set('gainDecCoarse', qs('#buc-gain-dec-coarse', this.containerEl));
    this.domCache_.set('gainDecFine', qs('#buc-gain-dec-fine', this.containerEl));
    this.domCache_.set('gainIncFine', qs('#buc-gain-inc-fine', this.containerEl));
    this.domCache_.set('gainIncCoarse', qs('#buc-gain-inc-coarse', this.containerEl));

    // Apply button
    this.domCache_.set('applyBtn', qs('#buc-apply-btn', this.containerEl));

    // Switches
    this.domCache_.set('powerSwitch', qs('#buc-power', this.containerEl));
    this.domCache_.set('muteSwitch', qs('#buc-mute', this.containerEl));
    this.domCache_.set('loopbackSwitch', qs('#buc-loopback', this.containerEl));

    // Sideband status
    this.domCache_.set('sidebandStatus', qs('#buc-sideband-status', this.containerEl));

    // RF Status displays
    this.domCache_.set('outputPowerDisplay', qs('#buc-output-power-display', this.containerEl));
    this.domCache_.set('rfFrequencyDisplay', qs('#buc-rf-frequency-display', this.containerEl));
    this.domCache_.set('p1dbMarginDisplay', qs('#buc-p1db-margin-display', this.containerEl));
    this.domCache_.set('lockStatus', qs('#buc-lock-status', this.containerEl));

    // Thermal displays
    this.domCache_.set('temperatureDisplay', qs('#buc-temperature-display', this.containerEl));
    this.domCache_.set('currentDisplay', qs('#buc-current-display', this.containerEl));
    // Trend readout (nats-s13-F1): optional, a host layout may not carry it
    for (const [key, selector] of [
      ['trendDisplay', '#buc-temp-trend-display'],
      ['tenMinDisplay', '#buc-temp-10min-display'],
      ['sparklinePath', '#buc-temp-sparkline-path'],
      ['sparklineTrip', '#buc-temp-trip-line'],
    ] as const) {
      const el = this.containerEl.querySelector<HTMLElement>(selector);
      if (el) this.domCache_.set(key, el);
    }

    // Signal Quality displays
    this.domCache_.set('phaseNoiseDisplay', qs('#buc-phase-noise-display', this.containerEl));
    this.domCache_.set('freqErrorDisplay', qs('#buc-freq-error-display', this.containerEl));
  }

  private setupInputListeners_(): void {
    // Initialize staged values from current state
    this.stagedLoFrequency_ = this.bucModule.state.loFrequency;
    this.stagedGain_ = this.bucModule.state.gain;

    // LO Frequency input and buttons - update staged values only
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const loDecCoarse = this.domCache_.get('loDecCoarse') as HTMLButtonElement;
    const loDecFine = this.domCache_.get('loDecFine') as HTMLButtonElement;
    const loIncFine = this.domCache_.get('loIncFine') as HTMLButtonElement;
    const loIncCoarse = this.domCache_.get('loIncCoarse') as HTMLButtonElement;

    loFreqInput?.addEventListener('change', this.loFreqInputHandler_.bind(this));
    this.boundHandlers.set('loFreqInput', this.loFreqInputHandler_.bind(this));

    loDecCoarse?.addEventListener('click', () => this.adjustStagedLoFrequency_(-100));
    loDecFine?.addEventListener('click', () => this.adjustStagedLoFrequency_(-10));
    loIncFine?.addEventListener('click', () => this.adjustStagedLoFrequency_(10));
    loIncCoarse?.addEventListener('click', () => this.adjustStagedLoFrequency_(100));

    // Gain input and buttons - update staged values only
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const gainDecCoarse = this.domCache_.get('gainDecCoarse') as HTMLButtonElement;
    const gainDecFine = this.domCache_.get('gainDecFine') as HTMLButtonElement;
    const gainIncFine = this.domCache_.get('gainIncFine') as HTMLButtonElement;
    const gainIncCoarse = this.domCache_.get('gainIncCoarse') as HTMLButtonElement;

    gainInput?.addEventListener('change', this.gainInputHandler_.bind(this));
    this.boundHandlers.set('gainInput', this.gainInputHandler_.bind(this));

    gainDecCoarse?.addEventListener('click', () => this.adjustStagedGain_(-1));
    gainDecFine?.addEventListener('click', () => this.adjustStagedGain_(-0.5));
    gainIncFine?.addEventListener('click', () => this.adjustStagedGain_(0.5));
    gainIncCoarse?.addEventListener('click', () => this.adjustStagedGain_(1));

    // Apply button - applies staged values to core
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;
    applyBtn?.addEventListener('click', this.applyHandler_.bind(this));
    this.boundHandlers.set('apply', this.applyHandler_.bind(this));

    // Power switch - immediate effect
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // Mute switch - immediate effect
    const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;
    muteSwitch?.addEventListener('change', this.muteHandler_.bind(this));
    this.boundHandlers.set('mute', this.muteHandler_.bind(this));

    // Loopback switch - immediate effect
    const loopbackSwitch = this.domCache_.get('loopbackSwitch') as HTMLInputElement;
    loopbackSwitch?.addEventListener('change', this.loopbackHandler_.bind(this));
    this.boundHandlers.set('loopback', this.loopbackHandler_.bind(this));
  }

  private loFreqInputHandler_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.setStagedLoFrequency_(value);
    }
  }

  private adjustStagedLoFrequency_(delta: number): void {
    this.setStagedLoFrequency_(this.stagedLoFrequency_ + delta);
  }

  /** Player edit: stage a new LO and mark it pending until applied. */
  private setStagedLoFrequency_(value: number): void {
    this.stagedLoFrequency_ = Math.max(6000, Math.min(7500, value));
    this.hasPendingLoEdit_ = this.stagedLoFrequency_ !== this.bucModule.state.loFrequency;
    this.updateStagedDisplay_(true);
  }

  private gainInputHandler_(e: Event): void {
    const value = parseLocalizedNumber((e.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.setStagedGain_(value);
    }
  }

  private adjustStagedGain_(delta: number): void {
    this.setStagedGain_(this.stagedGain_ + delta);
  }

  /** Player edit: stage a new gain and mark it pending until applied. */
  private setStagedGain_(value: number): void {
    this.stagedGain_ = Math.max(0, Math.min(70, value));
    this.hasPendingGainEdit_ = this.stagedGain_ !== this.bucModule.state.gain;
    this.updateStagedDisplay_(true);
  }

  /**
   * Follow the applied values only where the player has no pending edit, so a
   * toggle or external state event never silently discards a staged value.
   */
  private syncStagedFromState_(appliedLo: number | undefined, appliedGain: number | undefined): void {
    if (appliedLo !== undefined) {
      if (!this.hasPendingLoEdit_) {
        this.stagedLoFrequency_ = appliedLo;
      } else if (this.stagedLoFrequency_ === appliedLo) {
        this.hasPendingLoEdit_ = false;
      }
    }
    if (appliedGain !== undefined) {
      if (!this.hasPendingGainEdit_) {
        this.stagedGain_ = appliedGain;
      } else if (this.stagedGain_ === appliedGain) {
        this.hasPendingGainEdit_ = false;
      }
    }
    this.updateStagedDisplay_();
  }

  /**
   * @param isUserEdit true when called from the player's own edit; otherwise a
   *   focused input is left alone (CLAUDE.md "Protecting Input Fields").
   */
  private updateStagedDisplay_(isUserEdit = false): void {
    const isPowered = this.bucModule.state.isPowered;
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;

    if (loFreqInput) {
      if (isUserEdit || document.activeElement !== loFreqInput) {
        loFreqInput.value = isPowered ? this.stagedLoFrequency_.toString() : '--';
      }
      loFreqInput.disabled = !isPowered;
    }
    if (gainInput) {
      if (isUserEdit || document.activeElement !== gainInput) {
        gainInput.value = isPowered ? this.stagedGain_.toString() : '--';
      }
      gainInput.disabled = !isPowered;
    }

    // Disable adjust buttons when powered off
    this.setControlButtonsEnabled_(isPowered);
    this.updatePendingIndicator_();
  }

  /** Staged vs applied: pending style on the inputs and Apply, applied value in the tooltip. */
  private updatePendingIndicator_(): void {
    const state = this.bucModule.state;
    const isLoPending = state.isPowered && this.stagedLoFrequency_ !== state.loFrequency;
    const isGainPending = state.isPowered && this.stagedGain_ !== state.gain;
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const applyBtn = this.domCache_.get('applyBtn') as HTMLButtonElement;

    if (loFreqInput) {
      loFreqInput.classList.toggle('is-pending', isLoPending);
      loFreqInput.title = `Applied: ${state.loFrequency} MHz${isLoPending ? ' (staged change not applied)' : ''}`;
    }
    if (gainInput) {
      gainInput.classList.toggle('is-pending', isGainPending);
      gainInput.title = `Applied: ${state.gain} dB${isGainPending ? ' (staged change not applied)' : ''}`;
    }
    applyBtn?.classList.toggle('is-pending', isLoPending || isGainPending);
  }

  /** Sync a switch from state; never fight a switch the player is interacting with. */
  private syncSwitch_(cacheKey: string, isChecked: boolean): void {
    const el = this.domCache_.get(cacheKey) as HTMLInputElement | undefined;
    if (el && document.activeElement !== el && el.checked !== isChecked) {
      el.checked = isChecked;
    }
  }

  /** P1dB margin, or "--" when the BUC has no real RF output (off, muted, nothing in band). */
  private formatP1dbMargin_(state: BUCState): string {
    if (!this.bucModule.hasRfOutput()) {
      return '-- dB';
    }
    return `${(state.saturationPower - state.outputPower).toFixed(1)} dB`;
  }

  private setControlButtonsEnabled_(enabled: boolean): void {
    const buttonKeys = ['loDecCoarse', 'loDecFine', 'loIncFine', 'loIncCoarse', 'gainDecCoarse', 'gainDecFine', 'gainIncFine', 'gainIncCoarse', 'applyBtn'];
    for (const key of buttonKeys) {
      const btn = this.domCache_.get(key) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    }
  }

  private applyHandler_(): void {
    // Apply staged values to the core module
    this.bucModule.handleLoFrequencyChange(this.stagedLoFrequency_);
    this.bucModule.handleGainChange(this.stagedGain_);
    this.hasPendingLoEdit_ = false;
    this.hasPendingGainEdit_ = false;
    this.syncDomWithState_(this.bucModule.state);
    this.updateStagedDisplay_();
  }

  private powerHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.bucModule.handlePowerToggle(isChecked);
    this.syncDomWithState_(this.bucModule.state);
  }

  private muteHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.bucModule.handleMuteToggle(isChecked);
    this.syncDomWithState_(this.bucModule.state);
  }

  private loopbackHandler_(e: Event): void {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.bucModule.handleLoopbackToggle(isChecked);
    this.syncDomWithState_(this.bucModule.state);
  }

  update(): void {
    this.syncDomWithState_(this.bucModule.state);
  }

  private syncDomWithState_(state: Partial<BUCState>): void {
    // Prevent circular updates
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) return;
    this.lastStateString = stateStr;

    const isPowered = state.isPowered ?? this.bucModule.state.isPowered;

    // Follow applied values unless the player has a pending staged edit
    this.syncStagedFromState_(state.loFrequency, state.gain);

    // Update Power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch) powerSwitch.checked = state.isPowered;
    }

    // Update Mute switch
    if (state.isMuted !== undefined) {
      const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;
      if (muteSwitch) muteSwitch.checked = state.isMuted;
    }

    // Update Loopback switch
    if (state.isLoopback !== undefined) {
      const loopbackSwitch = this.domCache_.get('loopbackSwitch') as HTMLInputElement;
      if (loopbackSwitch) loopbackSwitch.checked = state.isLoopback;
    }

    // Update RF Status displays - show actual output signal power for consistency with HPA input
    const outputPowerDisplay = this.domCache_.get('outputPowerDisplay');
    if (outputPowerDisplay) {
      if (isPowered && this.bucModule.outputSignals.length > 0) {
        outputPowerDisplay.textContent = `${this.bucModule.outputSignals[0].power.toFixed(1)} dBm`;
      } else {
        outputPowerDisplay.textContent = '-- dBm';
      }
    }

    // Display RF output frequency (after LO mixing and bandpass filter)
    const rfFrequencyDisplay = this.domCache_.get('rfFrequencyDisplay');
    if (rfFrequencyDisplay) {
      if (isPowered && this.bucModule.outputSignals.length > 0) {
        const rfFreqHz = this.bucModule.outputSignals[0].frequency;
        const rfFreqMHz = rfFreqHz / 1e6;
        rfFrequencyDisplay.textContent = `${rfFreqMHz.toFixed(2)} MHz`;
      } else {
        rfFrequencyDisplay.textContent = '-- MHz';
      }
    }

    // Calculate and display P1dB margin
    const p1dbMarginDisplay = this.domCache_.get('p1dbMarginDisplay');
    if (p1dbMarginDisplay) {
      p1dbMarginDisplay.textContent = this.formatP1dbMargin_({ ...this.bucModule.state, ...state });
    }

    // Update lock status
    const lockStatus = this.domCache_.get('lockStatus');
    if (lockStatus) {
      if (isPowered && state.isExtRefLocked !== undefined) {
        lockStatus.textContent = state.isExtRefLocked ? 'Locked' : 'Unlocked';
        lockStatus.className = state.isExtRefLocked ? 'status-badge status-badge-locked' : 'status-badge status-badge-unlocked';
      } else if (!isPowered) {
        lockStatus.textContent = '--';
        lockStatus.className = 'status-badge status-badge-off';
      }
    }

    // Update Thermal displays
    const temperatureDisplay = this.domCache_.get('temperatureDisplay');
    if (temperatureDisplay) {
      if (isPowered && state.temperature !== undefined) {
        temperatureDisplay.textContent = `${state.temperature.toFixed(1)} °C`;
      } else if (!isPowered) {
        temperatureDisplay.textContent = '-- °C';
      }
    }

    const currentDisplay = this.domCache_.get('currentDisplay');
    if (currentDisplay) {
      if (isPowered && state.currentDraw !== undefined) {
        currentDisplay.textContent = `${state.currentDraw.toFixed(2)} A`;
      } else if (!isPowered) {
        currentDisplay.textContent = '-- A';
      }
    }

    // Update Signal Quality displays
    const phaseNoiseDisplay = this.domCache_.get('phaseNoiseDisplay');
    if (phaseNoiseDisplay) {
      if (isPowered && state.phaseNoise !== undefined) {
        phaseNoiseDisplay.textContent = `${state.phaseNoise.toFixed(0)} dBc/Hz`;
      } else if (!isPowered) {
        phaseNoiseDisplay.textContent = '-- dBc/Hz';
      }
    }

    const freqErrorDisplay = this.domCache_.get('freqErrorDisplay');
    if (freqErrorDisplay) {
      if (isPowered && state.frequencyError !== undefined) {
        const absError = Math.abs(state.frequencyError);
        if (absError >= 1000) {
          freqErrorDisplay.textContent = `${(state.frequencyError / 1000).toFixed(1)} kHz`;
        } else {
          freqErrorDisplay.textContent = `${state.frequencyError.toFixed(0)} Hz`;
        }
      } else if (!isPowered) {
        freqErrorDisplay.textContent = '-- Hz';
      }
    }

    // Update alarm badge - immediate feedback
    const alarms = this.getAlarmsFromModule_();
    this.alarmBadge_.update(alarms);
  }

  /**
   * Get current alarms from BUC module as AlarmStatus array
   */
  private getAlarmsFromModule_(): AlarmStatus[] {
    const alarmStrings = this.bucModule.getAlarms();
    return alarmStrings.map((message) => ({
      severity: this.classifySeverity_(message),
      message,
    }));
  }

  /**
   * Classify alarm message severity based on content
   */
  private classifySeverity_(message: string): AlarmStatus['severity'] {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('error') || lowerMsg.includes('fault') || lowerMsg.includes('fail')) {
      return 'error';
    }
    if (lowerMsg.includes('not locked') || lowerMsg.includes('saturation') || lowerMsg.includes('approaching')) {
      return 'warning';
    }
    return 'warning'; // Default to warning for any alarm
  }

  dispose(): void {
    // Dispose alarm badge
    this.alarmBadge_.dispose();

    // Remove EventBus listeners
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.RF_FE_BUC_CHANGED, this.stateChangeHandler as any);

    // Remove DOM event listeners for inputs
    const loFreqInput = this.domCache_.get('loFreqInput') as HTMLInputElement;
    const gainInput = this.domCache_.get('gainInput') as HTMLInputElement;
    const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
    const muteSwitch = this.domCache_.get('muteSwitch') as HTMLInputElement;
    const loopbackSwitch = this.domCache_.get('loopbackSwitch') as HTMLInputElement;

    const loFreqHandler = this.boundHandlers.get('loFreqInput');
    const gainHandler = this.boundHandlers.get('gainInput');
    const powerHandler = this.boundHandlers.get('power');
    const muteHandler = this.boundHandlers.get('mute');
    const loopbackHandler = this.boundHandlers.get('loopback');

    if (loFreqInput && loFreqHandler) loFreqInput.removeEventListener('change', loFreqHandler);
    if (gainInput && gainHandler) gainInput.removeEventListener('change', gainHandler);
    if (powerSwitch && powerHandler) powerSwitch.removeEventListener('change', powerHandler);
    if (muteSwitch && muteHandler) muteSwitch.removeEventListener('change', muteHandler);
    if (loopbackSwitch && loopbackHandler) loopbackSwitch.removeEventListener('change', loopbackHandler);

    // Note: Button click handlers use inline arrow functions and are cleaned up when DOM is removed
    this.boundHandlers.clear();
    this.domCache_.clear();
  }
}
