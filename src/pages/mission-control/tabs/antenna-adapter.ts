import { AntennaCore, AntennaState } from '@app/equipment/antenna';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Degrees } from 'ootk';

/**
 * AntennaAdapter - Bridges AntennaCore state to web controls
 *
 * Responsibilities:
 * - Sync web control values (sliders, switches) to antenna state
 * - Listen to antenna state changes and update DOM
 * - Prevent circular updates via state comparison
 * - Clean up event listeners on dispose
 */
export class AntennaAdapter {
  private readonly antenna: AntennaCore;
  private readonly containerEl: HTMLElement;
  private lastStateString: string = '';
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<AntennaState>) => void;

  constructor(antenna: AntennaCore, containerEl: HTMLElement) {
    this.antenna = antenna;
    this.containerEl = containerEl;

    // Bind state change handler
    this.stateChangeHandler = (state: Partial<AntennaState>) => {
      this.syncDomWithState_(state);
    };

    this.initialize_();

    EventBus.getInstance().on(Events.DOM_READY, this.initialize_.bind(this));
  }

  private initialize_(): void {
    // Cache DOM elements
    this.setupDomCache_();

    // Setup DOM event listeners for user input
    this.setupInputListeners_();

    // Listen to antenna state changes
    EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, this.stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState_(this.antenna.state);
  }

  private setupDomCache_(): void {
    this.domCache_.set('azSlider', this.containerEl.querySelector('#az-slider') as HTMLElement);
    this.domCache_.set('azValue', this.containerEl.querySelector('#az-value') as HTMLElement);
    this.domCache_.set('elSlider', this.containerEl.querySelector('#el-slider') as HTMLElement);
    this.domCache_.set('elValue', this.containerEl.querySelector('#el-value') as HTMLElement);
    this.domCache_.set('polSlider', this.containerEl.querySelector('#pol-slider') as HTMLElement);
    this.domCache_.set('polValue', this.containerEl.querySelector('#pol-value') as HTMLElement);
    this.domCache_.set('powerSwitch', this.containerEl.querySelector('#power-switch') as HTMLElement);
    this.domCache_.set('autoTrackSwitch', this.containerEl.querySelector('#autotrack-switch') as HTMLElement);
    this.domCache_.set('loopbackSwitch', this.containerEl.querySelector('#loopback-switch') as HTMLElement);
    this.domCache_.set('rfMetricFreq', this.containerEl.querySelector('#rf-metric-freq') as HTMLElement);
    this.domCache_.set('rfMetricGain', this.containerEl.querySelector('#rf-metric-gain') as HTMLElement);
    this.domCache_.set('rfMetricBeamwidth', this.containerEl.querySelector('#rf-metric-beamwidth') as HTMLElement);
    this.domCache_.set('rfMetricGt', this.containerEl.querySelector('#rf-metric-gt') as HTMLElement);
    this.domCache_.set('rfMetricPolLoss', this.containerEl.querySelector('#rf-metric-pol-loss') as HTMLElement);
    this.domCache_.set('rfMetricSkyTemp', this.containerEl.querySelector('#rf-metric-sky-temp') as HTMLElement);
  }

  private setupInputListeners_(): void {
    const azSlider = this.domCache_.get('azSlider');
    const elSlider = this.domCache_.get('elSlider');
    const polSlider = this.domCache_.get('polSlider');
    const powerSwitch = this.domCache_.get('powerSwitch');
    const autoTrackSwitch = this.domCache_.get('autoTrackSwitch');
    const loopbackSwitch = this.domCache_.get('loopbackSwitch');

    // Azimuth slider
    azSlider?.addEventListener('input', this.azHandler_.bind(this));
    this.boundHandlers.set('az', this.azHandler_.bind(this));

    // Elevation slider
    elSlider?.addEventListener('input', this.elHandler_.bind(this));
    this.boundHandlers.set('el', this.elHandler_.bind(this));

    // Polarization slider
    polSlider?.addEventListener('input', this.polHandler_.bind(this));
    this.boundHandlers.set('pol', this.polHandler_.bind(this));

    // Power switch
    powerSwitch?.addEventListener('change', this.powerHandler_.bind(this));
    this.boundHandlers.set('power', this.powerHandler_.bind(this));

    // Auto-track switch
    autoTrackSwitch?.addEventListener('change', this.autoTrackHandler_.bind(this));
    this.boundHandlers.set('autoTrack', this.autoTrackHandler_.bind(this));

    // Loopback switch
    loopbackSwitch?.addEventListener('change', this.loopbackHandler_.bind(this));
    this.boundHandlers.set('loopback', this.loopbackHandler_.bind(this));
  }

  private azHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.antenna.handleAzimuthChange(value as Degrees);
  }

  private elHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.antenna.handleElevationChange(value as Degrees);
  }

  private polHandler_(e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.antenna.handlePolarizationChange(value as Degrees);
  }

  private powerHandler_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.antenna.handlePowerToggle(checked);
  }

  private autoTrackHandler_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.antenna.handleAutoTrackToggle(checked);
  }

  private loopbackHandler_(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.antenna.handleLoopbackToggle(checked);
  }

  update(): void {
    this.syncDomWithState_(this.antenna.state);
  }

  private syncDomWithState_(state: Partial<AntennaState>): void {
    // Prevent circular updates by comparing serialized state
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) {
      return;
    }
    this.lastStateString = stateStr;

    // Update azimuth
    if (state.azimuth !== undefined) {
      const slider = this.domCache_.get('azSlider') as HTMLInputElement;
      const display = this.domCache_.get('azValue');
      if (slider && parseFloat(slider.value) !== state.azimuth) {
        slider.value = state.azimuth.toString();
      }
      if (display) {
        display.textContent = state.azimuth.toFixed(1);
      }
    }

    // Update elevation
    if (state.elevation !== undefined) {
      const slider = this.domCache_.get('elSlider') as HTMLInputElement;
      const display = this.domCache_.get('elValue');
      if (slider && parseFloat(slider.value) !== state.elevation) {
        slider.value = state.elevation.toString();
      }
      if (display) {
        display.textContent = state.elevation.toFixed(1);
      }
    }

    // Update polarization
    if (state.polarization !== undefined) {
      const slider = this.domCache_.get('polSlider') as HTMLInputElement;
      const display = this.domCache_.get('polValue');
      if (slider && parseFloat(slider.value) !== state.polarization) {
        slider.value = state.polarization.toString();
      }
      if (display) {
        display.textContent = state.polarization.toFixed(1);
      }
    }

    // Update power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.domCache_.get('powerSwitch') as HTMLInputElement;
      if (powerSwitch && powerSwitch.checked !== state.isPowered) {
        powerSwitch.checked = state.isPowered;
      }
    }

    // Update auto-track switch
    if (state.isAutoTrackSwitchUp !== undefined) {
      const autoTrackSwitch = this.domCache_.get('autoTrackSwitch') as HTMLInputElement;
      if (autoTrackSwitch && autoTrackSwitch.checked !== state.isAutoTrackSwitchUp) {
        autoTrackSwitch.checked = state.isAutoTrackSwitchUp;
      }
    }

    // Update loopback switch
    if (state.isLoopback !== undefined) {
      const loopbackSwitch = this.domCache_.get('loopbackSwitch') as HTMLInputElement;
      if (loopbackSwitch && loopbackSwitch.checked !== state.isLoopback) {
        loopbackSwitch.checked = state.isLoopback;
      }
    }

    // Update RF metrics if present
    if (state.rfMetrics) {
      this.updateRfMetrics_(state.rfMetrics);
    }
  }

  private updateRfMetrics_(metrics: NonNullable<AntennaState['rfMetrics']>): void {
    const freqEl = this.domCache_.get('rfMetricFreq');
    const gainEl = this.domCache_.get('rfMetricGain');
    const bwEl = this.domCache_.get('rfMetricBeamwidth');
    const gtEl = this.domCache_.get('rfMetricGt');
    const polLossEl = this.domCache_.get('rfMetricPolLoss');
    const skyTempEl = this.domCache_.get('rfMetricSkyTemp');

    if (freqEl) freqEl.textContent = `${metrics.frequency_GHz.toFixed(3)} GHz`;
    if (gainEl) gainEl.textContent = `${metrics.gain_dBi.toFixed(1)} dBi`;
    if (bwEl) bwEl.textContent = `${metrics.beamwidth_deg.toFixed(2)}°`;
    if (gtEl) gtEl.textContent = `${metrics.gOverT_dBK.toFixed(1)} dB/K`;
    if (polLossEl) polLossEl.textContent = `${metrics.polLoss_dB.toFixed(1)} dB`;
    if (skyTempEl) skyTempEl.textContent = `${metrics.skyTemp_K.toFixed(0)} K`;
  }

  dispose(): void {
    // Remove all event listeners
    const azSlider = this.containerEl.querySelector('#az-slider');
    const elSlider = this.containerEl.querySelector('#el-slider');
    const polSlider = this.containerEl.querySelector('#pol-slider');
    const powerSwitch = this.containerEl.querySelector('#power-switch');
    const autoTrackSwitch = this.containerEl.querySelector('#autotrack-switch');
    const loopbackSwitch = this.containerEl.querySelector('#loopback-switch');

    azSlider?.removeEventListener('input', this.boundHandlers.get('az')!);
    elSlider?.removeEventListener('input', this.boundHandlers.get('el')!);
    polSlider?.removeEventListener('input', this.boundHandlers.get('pol')!);
    powerSwitch?.removeEventListener('change', this.boundHandlers.get('power')!);
    autoTrackSwitch?.removeEventListener('change', this.boundHandlers.get('autoTrack')!);
    loopbackSwitch?.removeEventListener('change', this.boundHandlers.get('loopback')!);

    EventBus.getInstance().off(Events.ANTENNA_STATE_CHANGED, this.stateChangeHandler as any);

    this.boundHandlers.clear();
  }
}
