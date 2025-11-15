import { Logger } from "@app/logging/logger";
import { Hertz } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-span-btn.css';

export class ACSpanBtn extends BaseControlButton {
  private subMenuSelected: 'set-span' | null = null;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-span-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Span',
      ariaLabel: 'Span',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('span', this);

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Set Span';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Full Span';
    this.analyzerControl.domCache['label-cell-3'].textContent = 'Zero Span';
    this.analyzerControl.domCache['label-cell-4'].textContent = 'Last Span';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', this.handleSetSpanClick.bind(this));
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', this.handleFullSpanClick.bind(this));
    this.analyzerControl.domCache['label-select-button-3']?.addEventListener('click', this.handleZeroSpanClick.bind(this));
    this.analyzerControl.domCache['label-select-button-4']?.addEventListener('click', this.handleLastSpanClick.bind(this));
  }

  private handleSetSpanClick(): void {
    this.subMenuSelected = 'set-span';

    // Update the display with current span
    this.analyzerControl.specA.state.inputValue = (this.analyzerControl.specA.state.span / 1e6).toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.notifyStateChange_();
    this.playSound();
  }

  private handleFullSpanClick(): void {
    // Set to full span on the frequency range
    // Rohde & Schwarz FPH: 5kHz to 25.5 GHz
    const startFreq = this.analyzerControl.specA.state.minFrequency;
    const stopFreq = this.analyzerControl.specA.state.maxFrequency;
    this.analyzerControl.specA.state.lastSpan = this.analyzerControl.specA.state.span;
    this.analyzerControl.specA.state.span = (stopFreq - startFreq) as Hertz;
    // Recenter the frequency
    this.analyzerControl.specA.state.centerFrequency = ((startFreq + stopFreq) / 2) as Hertz;
    this.analyzerControl.specA.state.lockedControl = 'span';

    this.notifyStateChange_();
    this.playSound();
  }

  private handleZeroSpanClick(): void {
    Logger.error('Zero Span functionality not yet implemented.');
    alert('Zero Span functionality not yet implemented.');
    this.playSound();
  }

  private handleLastSpanClick(): void {
    // Restore the last span value
    const lastSpan = this.analyzerControl.specA.state.lastSpan;
    if (lastSpan) {
      this.analyzerControl.specA.state.span = lastSpan;
      this.analyzerControl.specA.state.lockedControl = 'span';

      this.notifyStateChange_();
    }
    this.playSound();
  }

  private applyTickAdjustment(divisor: number, value: number): void {
    let newVal = 0;

    if (this.subMenuSelected === 'set-span') {
      const analyzerState = this.analyzerControl.specA.state;
      const adjustmentInHz = (value * analyzerState.span) / divisor;
      newVal = this.analyzerControl.specA.state.span + adjustmentInHz;
    } else {
      Logger.warn('No submenu selected for span adjustment.');
      return;
    }

    // Round to nearest Hertz
    newVal = Math.round(newVal);

    this.adjustValueInHz((newVal as Hertz));
  }

  onMajorTickChange(value: number): void {
    Logger.info(`Adjusting frequency by major tick: ${value}`);
    this.applyTickAdjustment(10, value);
  }

  onMinorTickChange(value: number): void {
    Logger.info(`Adjusting frequency by minor tick: ${value}`);
    this.applyTickAdjustment(100, value);
  }

  onEnterPressed(): void {
    Logger.info(`Processing frequency input for ${this.subMenuSelected} frequency.`);

    const inputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
    const inputUnit = this.analyzerControl.specA.state.inputUnit;
    let frequencyInHz: number;

    // Convert input value to Hz based on selected unit
    switch (inputUnit) {
      case 'GHz':
        frequencyInHz = inputValue * 1e9;
        break;
      case 'MHz':
        frequencyInHz = inputValue * 1e6;
        break;
      case 'kHz':
        frequencyInHz = inputValue * 1e3;
        break;
      case 'Hz':
        break;
      default:
        throw new Error('Invalid frequency unit');
    }

    this.analyzerControl.specA.state.lastSpan = this.analyzerControl.specA.state.span;
    this.analyzerControl.specA.state.span = frequencyInHz as Hertz;
    this.analyzerControl.specA.state.lockedControl = 'span';

    this.notifyStateChange_();
    this.playSound();
  }

  private adjustValueInHz(frequencyInHz: Hertz): void {
    const analyzerState = this.analyzerControl.specA.state;

    analyzerState.span = frequencyInHz;

    analyzerState.lockedControl = 'span';
    this.notifyStateChange_();
  }
}
