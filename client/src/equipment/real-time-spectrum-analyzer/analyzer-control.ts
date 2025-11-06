import { Logger } from '@app/logging/logger';
import { BaseElement } from '../../components/base-element';
import { html } from "../../engine/utils/development/formatter";
import { qs, qsa } from "../../engine/utils/query-selector";
import { EventBus } from '../../events/event-bus';
import { Events } from '../../events/events';
import { Hertz } from '../../types';
import './analyzer-control.css';
import { ACAmptBtn } from './analyzer-control/ac-ampt-btn/ac-ampt-btn';
import { ACBWBtn } from './analyzer-control/ac-bw-btn/ac-bw-btn';
import { ACExtra1Btn } from './analyzer-control/ac-extra1-btn/ac-extra1-btn';
import { ACExtra2Btn } from './analyzer-control/ac-extra2-btn/ac-extra2-btn';
import { ACExtra3Btn } from './analyzer-control/ac-extra3-btn/ac-extra3-btn';
import { ACFreqBtn } from './analyzer-control/ac-freq-btn/ac-freq-btn';
import { ACMeasBtn } from './analyzer-control/ac-meas-btn/ac-meas-btn';
import { ACMinHoldBtn } from './analyzer-control/ac-minhold-btn/ac-minhold-btn';
import { ACMkrBtn } from './analyzer-control/ac-mkr-btn/ac-mkr-btn';
import { ACMkr2Btn } from './analyzer-control/ac-mkr2-btn/ac-mkr2-btn';
import { ACModeBtn } from './analyzer-control/ac-mode-btn/ac-mode-btn';
import { ACSaveBtn } from './analyzer-control/ac-save-btn/ac-save-btn';
import { ACSpanBtn } from './analyzer-control/ac-span-btn/ac-span-btn';
import { ACSweepBtn } from './analyzer-control/ac-sweep-btn/ac-sweep-btn';
import { ACTraceBtn } from './analyzer-control/ac-trace-btn/ac-trace-btn';
import { BaseControlButton } from './analyzer-control/base-control-button';
import { RealTimeSpectrumAnalyzer } from './real-time-spectrum-analyzer';

export interface AnalyzerControlOptions {
  element: HTMLElement;
  spectrumAnalyzer: RealTimeSpectrumAnalyzer;
}

/**
 * AnalyzerControl - Modal control panel for Spectrum Analyzer
 * Provides physical button interface for entering frequency and span values
 * Numbers must be "pressed" rather than typed, mimicking physical equipment
 */
export class AnalyzerControl extends BaseElement {
  protected html_ = ''; // This needs set dynamically during initDom_

  readonly specA: RealTimeSpectrumAnalyzer;
  domCache: { [key: string]: HTMLElement } = {};

  // Display state
  private ghz: string = '0';
  private mhz: string = '0';
  private khz: string = '0';

  // Control state
  controlSelection: BaseControlButton | null = null;
  private numberSelection: 'ghz' | 'mhz' | 'khz' | null = null;

  constructor(options: AnalyzerControlOptions) {
    super();
    this.specA = options.spectrumAnalyzer;
    this.dom_ = options.element;
  }

  init_(parentId: string, type: 'add' | 'replace' = 'replace'): void {
    super.init_(parentId, type);
    this.initializeValues();
  }

  private initializeValues(): void {
    // Initialize with current center frequency in MHz
    this.numberSelection = 'mhz';
    this.mhz = (this.specA.state.centerFrequency / 1e6).toFixed(3);
    this.ghz = '0';
    this.khz = '0';
    this.controlSelection = ACFreqBtn.getInstance();
    this.updateDisplay();
  }

  initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const panelElements = [
      ACFreqBtn.create(this),
      ACSpanBtn.create(this),
      ACAmptBtn.create(this),
      ACMkrBtn.create(this),
      ACMkr2Btn.create(this),
      ACBWBtn.create(this),
      ACSweepBtn.create(this),
      ACTraceBtn.create(this),
      ACMinHoldBtn.create(this),
      ACSaveBtn.create(this),
      ACMeasBtn.create(this),
      ACModeBtn.create(this),
      ACExtra1Btn.create(this),
      ACExtra2Btn.create(this),
      ACExtra3Btn.create(this),
    ];

    this.html_ = html`
    <div class="analyzer-control-content">

    <!-- Left Side: Sub-Menu Selection -->
    <div class="analyzer-control-content-left">
      <div class="sub-menu-column sub-menu-labels">
        <div class="label-cell" id="label-cell-1">Label 1</div>
        <div class="label-cell" id="label-cell-2">Label 2</div>
        <div class="label-cell" id="label-cell-3">Label 3</div>
        <div class="label-cell" id="label-cell-4">Label 4</div>
        <div class="label-cell" id="label-cell-5">Label 5</div>
        <div class="label-cell" id="label-cell-6">Label 6</div>
        <div class="label-cell" id="label-cell-7">Label 7</div>
        <div class="label-cell" id="label-cell-8">Label 8</div>
      </div>
      <div class="sub-menu-column sub-menu-buttons">
        <button class="physical-button label-select-button" id="label-select-button-1"></button>
        <button class="physical-button label-select-button" id="label-select-button-2"></button>
        <button class="physical-button label-select-button" id="label-select-button-3"></button>
        <button class="physical-button label-select-button" id="label-select-button-4"></button>
        <button class="physical-button label-select-button" id="label-select-button-5"></button>
        <button class="physical-button label-select-button" id="label-select-button-6"></button>
        <button class="physical-button label-select-button" id="label-select-button-7"></button>
        <button class="physical-button label-select-button" id="label-select-button-8"></button>
      </div>
    </div>

    <!-- Right Side: Analyzer Control -->
    <div class="analyzer-control-content-right">
      <!-- Top Row: Menu Selection -->
      <div class="analyzer-control-buttons">
        <div class="control-row">
          ${ACFreqBtn.getInstance().html}
          ${ACSpanBtn.getInstance().html}
          ${ACAmptBtn.getInstance().html}
          ${ACMkrBtn.getInstance().html}
          ${ACMkr2Btn.getInstance().html}
          </button>
        </div>
        <div class="control-row">
          ${ACBWBtn.getInstance().html}
          ${ACSweepBtn.getInstance().html}
          ${ACTraceBtn.getInstance().html}
          ${ACMinHoldBtn.getInstance().html}
          ${ACSaveBtn.getInstance().html}
        </div>
        <div class="control-row">
          ${ACMeasBtn.getInstance().html}
          ${ACModeBtn.getInstance().html}
          ${ACExtra1Btn.getInstance().html}
          ${ACExtra2Btn.getInstance().html}
          ${ACExtra3Btn.getInstance().html}
        </div>
      </div>

      <!-- Middle Row: Number Pad, Unit Selection, and Dial -->
      <div class="analyzer-control-numpad">
        <div class="numpad-row">
        <button class="physical-button num-button" data-value="7">
          <span class="button-text">7</span>
          <div class="subtext"></div>
        </button>
        <button class="physical-button num-button" data-value="8">
          <span class="button-text">8</span>
          <div class="subtext">abc</div>
        </button>
        <button class="physical-button num-button" data-value="9">
          <span class="button-text">9</span>
          <div class="subtext">def</div>
        </button>
        <button class="physical-button unit-button" id="ghz-select" aria-label="Select GHz">
          <span class="button-text">GHz</span>
        </button>
        </div>
        <div class="numpad-row">
        <button class="physical-button num-button" data-value="4">
          <span class="button-text">4</span>
          <div class="subtext">ghi</div>
        </button>
        <button class="physical-button num-button" data-value="5">
          <span class="button-text">5</span>
          <div class="subtext">jkl</div>
        </button>
        <button class="physical-button num-button" data-value="6">
          <span class="button-text">6</span>
          <div class="subtext">mno</div>
        </button>
        <button class="physical-button unit-button" id="mhz-select" aria-label="Select MHz">
          <span class="button-text">MHz</span>
        </button>
        </div>
        <div class="numpad-row">
        <button class="physical-button num-button" data-value="1">
          <span class="button-text">1</span>
          <div class="subtext">pqrs</div>
        </button>
        <button class="physical-button num-button" data-value="2">
          <span class="button-text">2</span>
          <div class="subtext">tuv</div>
        </button>
        <button class="physical-button num-button" data-value="3">
          <span class="button-text">3</span>
          <div class="subtext">wxyz</div>
        </button>
        <button class="physical-button unit-button" id="khz-select" aria-label="Select KHz">
          <span class="button-text">kHz</span>
        </button>
        </div>
        <div class="numpad-row">
        <button class="physical-button num-button" data-value="0">
          <span class="button-text">0</span>
        </button>
        <button class="physical-button num-button" data-value=".">
          <span class="button-text">.</span>
        </button>
        <button class="physical-button num-button" data-value="-">
          <span class="button-text">+/-</span>
        </button>
        <button class="physical-button unit-button" id="hz-select" aria-label="Select Hz">
          <span class="button-text">Hz</span>
        </button>
        </div>
        <div class="numpad-row">
          <button class="physical-button num-button special-button" data-value="C">
            <span class="button-text">Esc</span>
          </button>
          <button class="physical-button num-button special-button" data-value="bksp" aria-label="Backspace">
            <span class="button-text" style="display:flex;align-items:center;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
              <path d="M7 15L2 10L7 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="7" y="7" width="9" height="6" rx="1" stroke="currentColor" stroke-width="2"/>
            </svg>
            </span>
          </button>
          <button class="physical-button num-button special-button" data-value="C">
            <span class="button-text">C</span>
          </button>
        </div>
      </div>

      <!-- Bottom Row: Power Button -->
      <div class="numpad-row">
        <button class="physical-button num-button special-button" data-value="power">
          <span class="button-text">Power</span>
        </button>
      </div>
    </div>
    `

    // Reinitialize DOM with final HTML
    const parentDom = super.initDom_(parentId, type);

    for (const element of panelElements) {
      element.addEventListeners();
    }

    this.domCache['label-cell-1'] = parentDom.querySelector('#label-cell-1')!;
    this.domCache['label-cell-2'] = parentDom.querySelector('#label-cell-2')!;
    this.domCache['label-cell-3'] = parentDom.querySelector('#label-cell-3')!;
    this.domCache['label-cell-4'] = parentDom.querySelector('#label-cell-4')!;
    this.domCache['label-cell-5'] = parentDom.querySelector('#label-cell-5')!;
    this.domCache['label-cell-6'] = parentDom.querySelector('#label-cell-6')!;
    this.domCache['label-cell-7'] = parentDom.querySelector('#label-cell-7')!;
    this.domCache['label-cell-8'] = parentDom.querySelector('#label-cell-8')!;
    this.domCache['label-select-button-1'] = parentDom.querySelector('#label-select-button-1')!;
    this.domCache['label-select-button-2'] = parentDom.querySelector('#label-select-button-2')!;
    this.domCache['label-select-button-3'] = parentDom.querySelector('#label-select-button-3')!;
    this.domCache['label-select-button-4'] = parentDom.querySelector('#label-select-button-4')!;
    this.domCache['label-select-button-5'] = parentDom.querySelector('#label-select-button-5')!;
    this.domCache['label-select-button-6'] = parentDom.querySelector('#label-select-button-6')!;
    this.domCache['label-select-button-7'] = parentDom.querySelector('#label-select-button-7')!;
    this.domCache['label-select-button-8'] = parentDom.querySelector('#label-select-button-8')!;
    this.domCache['span-button'] = parentDom.querySelector('#span-button')!;
    this.domCache['ampt-button'] = parentDom.querySelector('#ampt-button')!;
    this.domCache['marker-button'] = parentDom.querySelector('#marker-button')!;
    this.domCache['mkr2-button'] = parentDom.querySelector('#mkr2-button')!;
    this.domCache['bw-button'] = parentDom.querySelector('#bw-button')!;
    this.domCache['sweep-button'] = parentDom.querySelector('#sweep-button')!;
    this.domCache['max-hold-button'] = parentDom.querySelector('#max-hold-button')!;
    this.domCache['min-hold-button'] = parentDom.querySelector('#min-hold-button')!;
    this.domCache['save-button'] = parentDom.querySelector('#save-button')!;
    this.domCache['meas-button'] = parentDom.querySelector('#meas-button')!;
    this.domCache['mode-button'] = parentDom.querySelector('#mode-button')!;
    this.domCache['extra1-button'] = parentDom.querySelector('#extra1-button')!;
    this.domCache['extra2-button'] = parentDom.querySelector('#extra2-button')!;
    this.domCache['extra3-button'] = parentDom.querySelector('#extra3-button')!;
    this.domCache['7-button'] = parentDom.querySelector('.num-button[data-value="7"]')!;
    this.domCache['8-button'] = parentDom.querySelector('.num-button[data-value="8"]')!;
    this.domCache['9-button'] = parentDom.querySelector('.num-button[data-value="9"]')!;
    this.domCache['4-button'] = parentDom.querySelector('.num-button[data-value="4"]')!;
    this.domCache['5-button'] = parentDom.querySelector('.num-button[data-value="5"]')!;
    this.domCache['6-button'] = parentDom.querySelector('.num-button[data-value="6"]')!;
    this.domCache['1-button'] = parentDom.querySelector('.num-button[data-value="1"]')!;
    this.domCache['2-button'] = parentDom.querySelector('.num-button[data-value="2"]')!;
    this.domCache['3-button'] = parentDom.querySelector('.num-button[data-value="3"]')!;
    this.domCache['0-button'] = parentDom.querySelector('.num-button[data-value="0"]')!;
    this.domCache['decimal-button'] = parentDom.querySelector('.num-button[data-value="."]')!;
    this.domCache['sign-button'] = parentDom.querySelector('.num-button[data-value="-"]')!;
    this.domCache['clear-button'] = parentDom.querySelector('.num-button[data-value="C"]')!;
    this.domCache['backspace-button'] = parentDom.querySelector('.num-button[data-value="bksp"]')!;
    this.domCache['power-button'] = parentDom.querySelector('.num-button[data-value="power"]')!;
    this.domCache['ghz-select'] = parentDom.querySelector('#ghz-select')!;
    this.domCache['mhz-select'] = parentDom.querySelector('#mhz-select')!;
    this.domCache['khz-select'] = parentDom.querySelector('#khz-select')!;
    this.domCache['hz-select'] = parentDom.querySelector('#hz-select')!;

    return parentDom;
  }

  protected addEventListeners_(): void {
    if (!this.dom_) return;

    // Unit selection buttons (GHz, MHz, KHz)
    this.domCache['ghz-select']?.addEventListener('click', () => this.handleUnitSelect('ghz'));
    this.domCache['mhz-select']?.addEventListener('click', () => this.handleUnitSelect('mhz'));
    this.domCache['khz-select']?.addEventListener('click', () => this.handleUnitSelect('khz'));

    // Control buttons (Freq, Span, Max Hold, Marker)
    this.domCache['span-button']?.addEventListener('click', () => this.handleSpanClick());
    this.domCache['max-hold-button']?.addEventListener('click', () => this.handleMaxHoldClick());
    this.domCache['min-hold-button']?.addEventListener('click', () => this.handleMinHoldClick());
    this.domCache['marker-button']?.addEventListener('click', () => this.handleMarkerClick());

    // Number pad buttons
    const numButtons = qsa<HTMLButtonElement>('.num-button', this.dom_);
    numButtons.forEach(button => {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        if (value) {
          this.handleNumberClick(value);
        }
      });
    });
  }

  private handleUnitSelect(unit: 'ghz' | 'mhz' | 'khz'): void {
    this.numberSelection = unit;

    // Reset other units to 0
    this.ghz = '0';
    this.mhz = '0';
    this.khz = '0';

    // Set the selected unit to the current value
    const currentValue = this.controlSelection === ACFreqBtn.getInstance() ? this.specA.state.centerFrequency : this.specA.state.span;

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

  updateSubMenu(subMenu: string): void {
    this.clearSubMenu();

    Logger.info(`AnalyzerControl: Updating sub-menu to ${subMenu}`);

    switch (subMenu) {
      case 'freq':
        break;
      default:
        // Other sub-menus can be implemented similarly
        break;
    }
  }

  private clearSubMenu(): void {
    // Remove any listeners attached to sub-menu buttons
    for (let i = 1; i <= 8; i++) {
      const button = this.domCache[`label-select-button-${i}`];
      const newButton = button.cloneNode(true) as HTMLElement;
      button.parentNode?.replaceChild(newButton, button);
    }
  }

  private handleSpanClick(): void {
    this.controlSelection = ACSpanBtn.getInstance();

    // Update the display with current span
    const span = this.specA.state.span;
    this.updateValueForSelection(span);
    this.updateDisplay();
    this.playSound();
  }

  private handleMaxHoldClick(): void {
    this.specA.state.isMaxHold = !this.specA.state.isMaxHold;

    // Update spectrum analyzer
    this.specA.resetHoldData();

    this.updateDisplay();
    this.playSound();
  }

  private handleMinHoldClick(): void {
    this.specA.state.isMinHold = !this.specA.state.isMinHold;

    // Update spectrum analyzer
    this.specA.resetHoldData();

    this.updateDisplay();
    this.playSound();
  }

  private handleMarkerClick(): void {
    this.specA.state.isMarkerOn = !this.specA.state.isMarkerOn;

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

    if (this.controlSelection === ACFreqBtn.getInstance()) {
      this.specA.changeCenterFreq(hzValue);
    } else if (this.controlSelection === ACSpanBtn.getInstance()) {
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

  updateValueForSelection(hertzValue: Hertz): void {
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

  updateDisplay(): void {
    if (!this.dom_) return;

    // Update display values
    const ghzDisplay = qs('#ghz-display', this.dom_);
    const mhzDisplay = qs('#mhz-display', this.dom_);
    const khzDisplay = qs('#khz-display', this.dom_);

    if (ghzDisplay) ghzDisplay.textContent = this.ghz || '0';
    if (mhzDisplay) mhzDisplay.textContent = this.mhz || '0';
    if (khzDisplay) khzDisplay.textContent = this.khz || '0';

    // Update button states - unit selection
    this.updateButtonState('#ghz-select', this.numberSelection === 'ghz');
    this.updateButtonState('#mhz-select', this.numberSelection === 'mhz');
    this.updateButtonState('#khz-select', this.numberSelection === 'khz');

    // Update button states - control selection
    this.updateButtonState('#freq-button', this.controlSelection === ACFreqBtn.getInstance());
    this.updateButtonState('#span-button', this.controlSelection === ACSpanBtn.getInstance());
    this.updateButtonState('#max-hold-button', this.specA.state.isMaxHold);
    this.updateButtonState('#min-hold-button', this.specA.state.isMinHold);
    this.updateButtonState('#marker-button', this.specA.state.isMarkerOn);

    EventBus.getInstance().emit(Events.SPEC_A_CONFIG_CHANGED, this.specA.state);
  }

  private updateButtonState(selector: string, isActive: boolean): void {
    const button = qs<HTMLButtonElement>(selector, this.dom_);
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
}