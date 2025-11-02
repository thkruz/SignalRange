import { BaseElement } from '../../components/base-element';
import { EventBus } from '../../events/event-bus';
import { Events } from '../../events/events';
import { Hertz } from '../../types';
import { html, qs, qsa } from '../../utils';
import './analyzer-control.css';
import { RealTimeSpectrumAnalyzer } from './real-time-spectrum-analyzer';

export interface AnalyzerControlOptions {
  spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  onClose?: () => void;
}

/**
 * AnalyzerControl - Modal control panel for Spectrum Analyzer
 * Provides physical button interface for entering frequency and span values
 * Numbers must be "pressed" rather than typed, mimicking physical equipment
 */
export class AnalyzerControl extends BaseElement {
  private readonly specA: RealTimeSpectrumAnalyzer;
  private onCloseCallback?: () => void;

  // Display state
  private ghz: string = '0';
  private mhz: string = '0';
  private khz: string = '0';

  // Control state
  private controlSelection: 'freq' | 'span' | null = null;
  private numberSelection: 'ghz' | 'mhz' | 'khz' | null = null;

  constructor(options: AnalyzerControlOptions) {
    super();
    this.specA = options.spectrumAnalyzer;
    this.onCloseCallback = options.onClose;
  }

  init(): void {
    this.initializeDom();
  }

  private initializeValues(): void {
    // Initialize with current center frequency in MHz
    this.numberSelection = 'mhz';
    this.mhz = (this.specA.getConfig().centerFrequency / 1e6).toFixed(3);
    this.ghz = '0';
    this.khz = '0';
    this.controlSelection = 'freq';
    this.updateDisplay();
  }

  initializeDom(): HTMLElement {
    this.html = html`
      <div class="analyzer-control-overlay" id="analyzer-control-overlay">
      <div class="analyzer-control-popup">
        <div class="analyzer-control-grid">
        <!-- Left Column: Display and Unit Selection -->
        <div class="analyzer-control-display-section">
          <div class="analyzer-control-display">
          <div class="analyzer-control-display-values">
            <div class="analyzer-control-display-row">
            <span class="value" id="ghz-display">0</span>
            <span class="unit">GHz</span>
            </div>
            <div class="analyzer-control-display-row">
            <span class="value" id="mhz-display">0</span>
            <span class="unit">MHz</span>
            </div>
            <div class="analyzer-control-display-row">
            <span class="value" id="khz-display">0</span>
            <span class="unit">KHz</span>
            </div>
          </div>
          </div>
          <div class="analyzer-control-unit-buttons">
          <button class="physical-button unit-button" id="ghz-select" aria-label="Select GHz">
            <span class="button-text">‹</span>
          </button>
          <button class="physical-button unit-button" id="mhz-select" aria-label="Select MHz">
            <span class="button-text">‹</span>
          </button>
          <button class="physical-button unit-button" id="khz-select" aria-label="Select KHz">
            <span class="button-text">‹</span>
          </button>
          </div>
        </div>

        <!-- Middle Column: Control Buttons (3 rows of 2) -->
        <div class="analyzer-control-buttons">
          <div class="control-row">
            <button class="physical-button control-button" id="freq-button" aria-label="Frequency">
              <span class="button-text">Freq</span>
            </button>
            <button class="physical-button control-button" id="span-button" aria-label="Span">
              <span class="button-text">Span</span>
            </button>
          </div>
          <div class="control-row">
            <button class="physical-button control-button" id="trace-button" aria-label="Trace">
              <span class="button-text">Trace</span>
            </button>
            <button class="physical-button control-button" id="marker-button" aria-label="Marker">
              <span class="button-text">Marker</span>
            </button>
          </div>
          <div class="control-row">
            <button class="physical-button control-button" id="max-amp-button" aria-label="Max Amplitude">
              <span class="button-text">Max Amp</span>
            </button>
            <button class="physical-button control-button" id="min-amp-button" aria-label="Min Amplitude">
              <span class="button-text">Min Amp</span>
            </button>
          </div>
        </div>

        <!-- Right Column: Number Pad -->
        <div class="analyzer-control-numpad">
          <div class="numpad-row">
          <button class="physical-button num-button" data-value="7">
            <span class="button-text">7</span>
          </button>
          <button class="physical-button num-button" data-value="8">
            <span class="button-text">8</span>
          </button>
          <button class="physical-button num-button" data-value="9">
            <span class="button-text">9</span>
          </button>
          </div>
          <div class="numpad-row">
          <button class="physical-button num-button" data-value="4">
            <span class="button-text">4</span>
          </button>
          <button class="physical-button num-button" data-value="5">
            <span class="button-text">5</span>
          </button>
          <button class="physical-button num-button" data-value="6">
            <span class="button-text">6</span>
          </button>
          </div>
          <div class="numpad-row">
          <button class="physical-button num-button" data-value="1">
            <span class="button-text">1</span>
          </button>
          <button class="physical-button num-button" data-value="2">
            <span class="button-text">2</span>
          </button>
          <button class="physical-button num-button" data-value="3">
            <span class="button-text">3</span>
          </button>
          </div>
          <div class="numpad-row">
          <button class="physical-button num-button" data-value="-">
            <span class="button-text">-</span>
          </button>
          <button class="physical-button num-button" data-value="0">
            <span class="button-text">0</span>
          </button>
          <button class="physical-button num-button" data-value=".">
            <span class="button-text">.</span>
          </button>
          </div>
          <div class="numpad-row">
          <button class="physical-button num-button special-button" data-value="bksp">
            <span class="button-text">bksp</span>
          </button>
          <button class="physical-button num-button special-button" data-value="C">
            <span class="button-text">C</span>
          </button>
          </div>
        </div>
        </div>
      </div>
      </div>
    `;

    return super.initializeDom();
  }

  protected setupEventListeners(): void {
    if (!this.element) return;

    // Overlay click to close
    const overlay = document.getElementById('analyzer-control-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    // Unit selection buttons (GHz, MHz, KHz)
    qs('#ghz-select', this.element)?.addEventListener('click', () => this.handleUnitSelect('ghz'));
    qs('#mhz-select', this.element)?.addEventListener('click', () => this.handleUnitSelect('mhz'));
    qs('#khz-select', this.element)?.addEventListener('click', () => this.handleUnitSelect('khz'));

    // Control buttons (Freq, Span, Trace, Marker)
    qs('#freq-button', this.element)?.addEventListener('click', () => this.handleFreqClick());
    qs('#span-button', this.element)?.addEventListener('click', () => this.handleSpanClick());
    qs('#max-amp-button', this.element)?.addEventListener('click', () => this.handleMaxAmpClick());
    qs('#min-amp-button', this.element)?.addEventListener('click', () => this.handleMinAmpClick());
    qs('#trace-button', this.element)?.addEventListener('click', () => this.handleTraceClick());
    qs('#marker-button', this.element)?.addEventListener('click', () => this.handleMarkerClick());

    // Number pad buttons
    const numButtons = qsa<HTMLButtonElement>('.num-button', this.element);
    numButtons.forEach(button => {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        if (value) {
          this.handleNumberClick(value);
        }
      });
    });
  }

  private handleMaxAmpClick(): void {
    // Increase maxDecibels by 5dB (or set a step as needed)
    this.specA.state.maxDecibels += 5;
    this.updateDisplay();
    this.playSound();
  }

  private handleMinAmpClick(): void {
    // Decrease minDecibels by 5dB (or set a step as needed)
    this.specA.state.minDecibels -= 5;
    this.updateDisplay();
    this.playSound();
  }

  private handleUnitSelect(unit: 'ghz' | 'mhz' | 'khz'): void {
    this.numberSelection = unit;

    // Reset other units to 0
    this.ghz = '0';
    this.mhz = '0';
    this.khz = '0';

    // Set the selected unit to the current value
    const config = this.specA.getConfig();
    const currentValue = this.controlSelection === 'freq' ? config.centerFrequency : config.span;

    if (unit === 'ghz') {
      this.ghz = (currentValue / 1e9).toFixed(6);
    } else if (unit === 'mhz') {
      this.mhz = (currentValue / 1e6).toFixed(3);
    } else if (unit === 'khz') {
      this.khz = (currentValue / 1e3).toFixed(0);
    }

    this.updateDisplay();
    this.playSound();
  }

  private handleFreqClick(): void {
    this.controlSelection = 'freq';

    // Update the display with current center frequency
    const centerFreq = this.specA.getConfig().centerFrequency;
    this.updateValueForSelection(centerFreq);
    this.updateDisplay();
    this.playSound();
  }

  private handleSpanClick(): void {
    this.controlSelection = 'span';

    // Update the display with current span
    const span = this.specA.getConfig().span;
    this.updateValueForSelection(span);
    this.updateDisplay();
    this.playSound();
  }

  private handleTraceClick(): void {
    this.specA.state.isTraceOn = !this.specA.state.isTraceOn;

    // Update spectrum analyzer
    this.specA.resetHoldData();

    this.updateDisplay();
    this.playSound();
  }

  private handleMarkerClick(): void {
    this.specA.state.isMarkerOn = !this.specA.state.isMarkerOn;

    // Update spectrum analyzer marker state
    this.specA.getConfig();

    // Note: Marker drawing would need to be implemented in SpectrumAnalyzer
    this.updateDisplay();
    this.playSound();
  }

  private handleNumberClick(value: string): void {
    if (!this.numberSelection || !this.controlSelection) {
      // TODO: Provide user feedback - must select unit and control first
      return;
    }

    let currentValue = this.getCurrentValue();

    // Handle special characters
    if (value === 'bksp') {
      currentValue = currentValue.toString().slice(0, -1);
    } else if (value === 'C') {
      currentValue = '';
    } else if (value === '.') {
      // Only add decimal if there isn't one already
      if (!currentValue.includes('.')) {
        currentValue = currentValue + '.';
      }
    } else {
      // Append the number
      currentValue = `${currentValue}${value}`;
    }

    this.setCurrentValue(currentValue);

    // Update the spectrum analyzer
    const numValue = (Number.parseFloat(currentValue) || 0) as Hertz;
    const hzValue = this.convertToHz(numValue);

    if (this.controlSelection === 'freq') {
      this.specA.changeCenterFreq(hzValue);
    } else if (this.controlSelection === 'span') {
      this.specA.changeBandwidth(hzValue);
    }

    this.updateDisplay();
    this.playSound();
  }

  private getCurrentValue(): string {
    if (this.numberSelection === 'ghz') return this.ghz;
    if (this.numberSelection === 'mhz') return this.mhz;
    if (this.numberSelection === 'khz') return this.khz;
    return '0';
  }

  private setCurrentValue(value: string): void {
    if (this.numberSelection === 'ghz') this.ghz = value;
    else if (this.numberSelection === 'mhz') this.mhz = value;
    else if (this.numberSelection === 'khz') this.khz = value;
  }

  private updateValueForSelection(hertzValue: Hertz): void {
    if (this.numberSelection === 'ghz') {
      this.ghz = (hertzValue / 1e9).toFixed(6);
    } else if (this.numberSelection === 'mhz') {
      this.mhz = (hertzValue / 1e6).toFixed(3);
    } else if (this.numberSelection === 'khz') {
      this.khz = (hertzValue / 1e3).toFixed(0);
    }
  }

  convertToHz(value: Hertz): Hertz {
    if (this.numberSelection === 'ghz') return value * 1e9 as Hertz;
    if (this.numberSelection === 'mhz') return value * 1e6 as Hertz;
    if (this.numberSelection === 'khz') return value * 1e3 as Hertz;

    return value;
  }

  private updateDisplay(): void {
    if (!this.element) return;

    // Update display values
    const ghzDisplay = qs('#ghz-display', this.element);
    const mhzDisplay = qs('#mhz-display', this.element);
    const khzDisplay = qs('#khz-display', this.element);

    if (ghzDisplay) ghzDisplay.textContent = this.ghz || '0';
    if (mhzDisplay) mhzDisplay.textContent = this.mhz || '0';
    if (khzDisplay) khzDisplay.textContent = this.khz || '0';

    // Update button states - unit selection
    this.updateButtonState('#ghz-select', this.numberSelection === 'ghz');
    this.updateButtonState('#mhz-select', this.numberSelection === 'mhz');
    this.updateButtonState('#khz-select', this.numberSelection === 'khz');

    // Update button states - control selection
    this.updateButtonState('#freq-button', this.controlSelection === 'freq');
    this.updateButtonState('#span-button', this.controlSelection === 'span');
    this.updateButtonState('#max-amp-button', false);
    this.updateButtonState('#min-amp-button', false);
    this.updateButtonState('#trace-button', this.specA.state.isTraceOn);
    this.updateButtonState('#marker-button', this.specA.state.isMarkerOn);

    EventBus.getInstance().emit(Events.SPEC_A_CONFIG_CHANGED, this.specA.getConfig());
  }

  private updateButtonState(selector: string, isActive: boolean): void {
    const button = qs<HTMLButtonElement>(selector, this.element!);
    if (button) {
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  }

  private playSound(): void {
    // TODO: Integrate sound system when available
    // For now, this is a placeholder for the select sound
  }

  public close(): void {
    if (this.element) {
      this.element.remove();
    }

    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  public show(): void {
    // Append to body
    document.body.appendChild(this.element!);
    this.setupEventListeners();
    this.initializeValues();
  }
}