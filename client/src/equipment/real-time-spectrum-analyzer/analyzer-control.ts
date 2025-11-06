import { Logger } from '@app/logging/logger';
import { BaseElement } from '../../components/base-element';
import { html } from "../../engine/utils/development/formatter";
import { qsa } from "../../engine/utils/query-selector";
import './analyzer-control.css';
import { ACAmptBtn } from './analyzer-control/ac-ampt-btn/ac-ampt-btn';
import { ACBWBtn } from './analyzer-control/ac-bw-btn/ac-bw-btn';
import { ACExtra1Btn } from './analyzer-control/ac-extra1-btn/ac-extra1-btn';
import { ACExtra2Btn } from './analyzer-control/ac-extra2-btn/ac-extra2-btn';
import { ACExtra3Btn } from './analyzer-control/ac-extra3-btn/ac-extra3-btn';
import { ACFreqBtn } from './analyzer-control/ac-freq-btn/ac-freq-btn';
import { ACGhzBtn } from './analyzer-control/ac-ghz-btn/ac-ghz-btn';
import { ACHzBtn } from './analyzer-control/ac-hz-btn/ac-hz-btn';
import { ACKhzBtn } from './analyzer-control/ac-khz-btn/ac-khz-btn';
import { ACMeasBtn } from './analyzer-control/ac-meas-btn/ac-meas-btn';
import { ACMhzBtn } from './analyzer-control/ac-mhz-btn/ac-mhz-btn';
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

  // Control state
  controlSelection: BaseControlButton | null = null;
  panelElements: BaseControlButton[];

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
    this.controlSelection = ACFreqBtn.getInstance();
    (this.controlSelection as ACFreqBtn).handleClick(); // Set up sub-menu for frequency
    const centerFreqMHz = this.specA.state.centerFrequency / 1e6;
    this.specA.state.inputValue = centerFreqMHz.toString();
    this.specA.state.inputUnit = 'MHz';
    this.specA.syncDomWithState();
  }

  initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    this.panelElements = [
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
      ACGhzBtn.create(this),
      ACMhzBtn.create(this),
      ACKhzBtn.create(this),
      ACHzBtn.create(this),
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
        ${ACGhzBtn.getInstance().html}
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
        ${ACMhzBtn.getInstance().html}
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
        ${ACKhzBtn.getInstance().html}
        </div>
        <div class="numpad-row">
        <button class="physical-button num-button" data-value="0">
          <span class="button-text">0</span>
        </button>
        <button class="physical-button num-button" data-value=".">
          <span class="button-text">.</span>
        </button>
        <button class="physical-button num-button" data-value="+/-">
          <span class="button-text">+/-</span>
        </button>
        ${ACHzBtn.getInstance().html}
        </div>
        <div class="numpad-row">
          <button class="physical-button num-button special-button" data-value="esc" aria-label="Escape">
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
          <button class="physical-button num-button special-button" data-value="enter" aria-label="Enter">
            <span class="button-text">
              &#10003;
            </span>
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

    for (const element of this.panelElements) {
      element.addEventListeners();
    }

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

  updateSubMenu(subMenu: string): void {
    this.clearSubMenu();

    Logger.info(`AnalyzerControl: Updating sub-menu to ${subMenu}`);
  }

  private clearSubMenu(): void {
    // Remove any listeners attached to sub-menu buttons
    for (let i = 1; i <= 8; i++) {
      const button = this.domCache[`label-select-button-${i}`];
      const newButton = button.cloneNode(true) as HTMLElement;
      button.parentNode?.replaceChild(newButton, button);
    }
  }

  private handleNumberClick(value: string): void {
    Logger.info(`AnalyzerControl: Number button clicked: ${value}`);
    if (!this.controlSelection) {
      // TODO: Provide user feedback - must select unit and control first
      return;
    }

    if (value === 'enter') {
      // Submit input
      Logger.info(`AnalyzerControl: Submitting input value: ${this.specA.state.inputValue} ${this.specA.state.inputUnit}`);
      const inputNumber = parseFloat(this.specA.state.inputValue.toString());
      if (isNaN(inputNumber)) {
        // Invalid number entered
        Logger.warn('AnalyzerControl: Invalid number entered');
        return;
      }

      let frequencyHz = inputNumber;
      switch (this.specA.state.inputUnit) {
        case 'GHz':
          frequencyHz *= 1e9;
          break;
        case 'MHz':
          frequencyHz *= 1e6;
          break;
        case 'kHz':
          frequencyHz *= 1e3;
          break;
        case 'Hz':
          // No conversion needed
          break;
        default:
          Logger.warn(`AnalyzerControl: Unknown unit ${this.specA.state.inputUnit}`);
          return;
      }

      Logger.info(`AnalyzerControl: Converted frequency: ${frequencyHz} Hz`);

      this.controlSelection.onEnterPressed();
    } else if (value === 'esc') {
      // Clear input
      this.specA.state.inputValue = '';
    } else if (value === 'bksp') {
      // Backspace
      this.specA.state.inputValue = this.specA.state.inputValue.toString().slice(0, -1);
    } else if (value === '+/-') {
      // Toggle sign
      if (this.specA.state.inputValue.toString().startsWith('-')) {
        this.specA.state.inputValue = this.specA.state.inputValue.toString().slice(1);
      } else {
        this.specA.state.inputValue = '-' + this.specA.state.inputValue;
      }
    } else {
      // Append number or decimal
      this.specA.state.inputValue += value;
    }

    this.specA.syncDomWithState();
    this.playSound();
  }

  private playSound(): void {
    // TODO: Integrate sound system when available
    // For now, this is a placeholder for the select sound
  }
}