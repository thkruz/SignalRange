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
  private readonly boundHandlers: Map<string, EventListener> = new Map();

  constructor(antenna: AntennaCore, containerEl: HTMLElement) {
    this.antenna = antenna;
    this.containerEl = containerEl;
    this.initialize();

    EventBus.getInstance().on(Events.DOM_READY, this.initialize.bind(this));
  }

  private initialize(): void {
    // Get DOM elements
    const azSlider = this.containerEl.querySelector('#az-slider');
    const elSlider = this.containerEl.querySelector('#el-slider');
    const polSlider = this.containerEl.querySelector('#pol-slider');
    const powerSwitch = this.containerEl.querySelector('#power-switch');
    const autoTrackSwitch = this.containerEl.querySelector('#autotrack-switch');
    const loopbackSwitch = this.containerEl.querySelector('#loopback-switch');

    // Set up event listeners with bound handlers (for cleanup)
    if (azSlider) {
      const azHandler = (e: Event) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        this.antenna.handleAzimuthChange(value as Degrees);
      };
      this.boundHandlers.set('az', azHandler);
      azSlider.addEventListener('input', azHandler);
    }

    if (elSlider) {
      const elHandler = (e: Event) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        this.antenna.handleElevationChange(value as Degrees);
      };
      this.boundHandlers.set('el', elHandler);
      elSlider.addEventListener('input', elHandler);
    }

    if (polSlider) {
      const polHandler = (e: Event) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        this.antenna.handlePolarizationChange(value as Degrees);
      };
      this.boundHandlers.set('pol', polHandler);
      polSlider.addEventListener('input', polHandler);
    }

    if (powerSwitch) {
      const powerHandler = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.antenna.handlePowerToggle(checked);
      };
      this.boundHandlers.set('power', powerHandler);
      powerSwitch.addEventListener('change', powerHandler);
    }

    if (autoTrackSwitch) {
      const autoTrackHandler = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.antenna.handleAutoTrackToggle(checked);
      };
      this.boundHandlers.set('autoTrack', autoTrackHandler);
      autoTrackSwitch.addEventListener('change', autoTrackHandler);
    }

    if (loopbackSwitch) {
      const loopbackHandler = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.antenna.handleLoopbackToggle(checked);
      };
      this.boundHandlers.set('loopback', loopbackHandler);
      loopbackSwitch.addEventListener('change', loopbackHandler);
    }

    // Listen to antenna state changes
    const stateChangeHandler = ((state: Partial<AntennaState>) => {
      this.syncDomWithState(state);
    }) as EventListener;
    this.boundHandlers.set('stateChange', stateChangeHandler);
    EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, stateChangeHandler as any);

    // Initial sync
    this.syncDomWithState(this.antenna.state);
  }

  update(): void {
    this.syncDomWithState(this.antenna.state);
  }

  private syncDomWithState(state: Partial<AntennaState>): void {
    // Prevent circular updates by comparing serialized state
    const stateStr = JSON.stringify(state);
    if (stateStr === this.lastStateString) {
      return;
    }
    this.lastStateString = stateStr;

    // Update azimuth
    if (state.azimuth !== undefined) {
      const slider = this.containerEl.querySelector('#az-slider') as HTMLInputElement;
      const display = this.containerEl.querySelector('#az-value');
      if (slider && parseFloat(slider.value) !== state.azimuth) {
        slider.value = state.azimuth.toString();
      }
      if (display) {
        display.textContent = state.azimuth.toFixed(1);
      }
    }

    // Update elevation
    if (state.elevation !== undefined) {
      const slider = this.containerEl.querySelector('#el-slider') as HTMLInputElement;
      const display = this.containerEl.querySelector('#el-value');
      if (slider && parseFloat(slider.value) !== state.elevation) {
        slider.value = state.elevation.toString();
      }
      if (display) {
        display.textContent = state.elevation.toFixed(1);
      }
    }

    // Update polarization
    if (state.polarization !== undefined) {
      const slider = this.containerEl.querySelector('#pol-slider') as HTMLInputElement;
      const display = this.containerEl.querySelector('#pol-value');
      if (slider && parseFloat(slider.value) !== state.polarization) {
        slider.value = state.polarization.toString();
      }
      if (display) {
        display.textContent = state.polarization.toFixed(1);
      }
    }

    // Update power switch
    if (state.isPowered !== undefined) {
      const powerSwitch = this.containerEl.querySelector('#power-switch') as HTMLInputElement;
      if (powerSwitch && powerSwitch.checked !== state.isPowered) {
        powerSwitch.checked = state.isPowered;
      }
    }

    // Update auto-track switch
    if (state.isAutoTrackSwitchUp !== undefined) {
      const autoTrackSwitch = this.containerEl.querySelector('#autotrack-switch') as HTMLInputElement;
      if (autoTrackSwitch && autoTrackSwitch.checked !== state.isAutoTrackSwitchUp) {
        autoTrackSwitch.checked = state.isAutoTrackSwitchUp;
      }
    }

    // Update loopback switch
    if (state.isLoopback !== undefined) {
      const loopbackSwitch = this.containerEl.querySelector('#loopback-switch') as HTMLInputElement;
      if (loopbackSwitch && loopbackSwitch.checked !== state.isLoopback) {
        loopbackSwitch.checked = state.isLoopback;
      }
    }

    // Update RF metrics if present
    if (state.rfMetrics) {
      this.updateRfMetrics(state.rfMetrics);
    }
  }

  private updateRfMetrics(metrics: NonNullable<AntennaState['rfMetrics']>): void {
    const freqEl = this.containerEl.querySelector('#rf-metric-freq');
    const gainEl = this.containerEl.querySelector('#rf-metric-gain');
    const bwEl = this.containerEl.querySelector('#rf-metric-beamwidth');
    const gtEl = this.containerEl.querySelector('#rf-metric-gt');
    const polLossEl = this.containerEl.querySelector('#rf-metric-pol-loss');
    const skyTempEl = this.containerEl.querySelector('#rf-metric-sky-temp');

    if (freqEl) freqEl.textContent = `${metrics.frequency_GHz.toFixed(3)} GHz`;
    if (gainEl) gainEl.textContent = `${metrics.gain_dBi.toFixed(1)} dBi`;
    if (bwEl) bwEl.textContent = `${metrics.beamwidth_deg.toFixed(2)}°`;
    if (gtEl) gtEl.textContent = `${metrics.gOverT_dBK.toFixed(1)} dB/K`;
    if (polLossEl) polLossEl.textContent = `${metrics.polLoss_dB.toFixed(1)} dB`;
    if (skyTempEl) skyTempEl.textContent = `${metrics.skyTemp_K.toFixed(0)} K`;
  }

  public dispose(): void {
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

    EventBus.getInstance().off(Events.ANTENNA_STATE_CHANGED, this.boundHandlers.get('stateChange') as any);

    this.boundHandlers.clear();
  }
}
