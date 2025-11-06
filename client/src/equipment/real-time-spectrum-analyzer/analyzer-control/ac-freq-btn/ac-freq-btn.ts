import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-freq-btn.css';

export class ACFreqBtn extends BaseControlButton {
  private static instance_: ACFreqBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-freq-btn',
      label: 'Freq',
      ariaLabel: 'Frequency',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACFreqBtn {
    this.instance_ = new ACFreqBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACFreqBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.domCache['label-cell-1'].textContent = 'Center Freq';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Start Freq';
    this.analyzerControl.domCache['label-cell-3'].textContent = 'Stop Freq';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleCenterFreqClick();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleStartFreqClick();
    });
    this.analyzerControl.domCache['label-select-button-3']?.addEventListener('click', () => {
      this.handleStopFreqClick();
    });
  }

  private handleCenterFreqClick(): void {
    this.analyzerControl.controlSelection = this;

    // Update the display with current center frequency
    // const centerFreq = this.analyzerControl.specA.state.centerFrequency;
    // this.analyzerControl.updateValueForSelection(centerFreq);
    this.analyzerControl.updateDisplay();
    this.playSound();
  }

  private handleStartFreqClick(): void {
    this.analyzerControl.controlSelection = this;

    // Update the display with current start frequency
    // const startFreq = this.analyzerControl.specA.state.startFrequency;
    // this.analyzerControl.updateValueForSelection(startFreq);
    this.analyzerControl.updateDisplay();
    this.playSound();
  }

  private handleStopFreqClick(): void {
    this.analyzerControl.controlSelection = this;

    // Update the display with current stop frequency
    // const stopFreq = this.analyzerControl.specA.state.stopFrequency;
    // this.analyzerControl.updateValueForSelection(stopFreq);
    this.analyzerControl.updateDisplay();
    this.playSound();
  }
}