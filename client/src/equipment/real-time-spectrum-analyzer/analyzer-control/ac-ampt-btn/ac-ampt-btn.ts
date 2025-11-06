import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ampt-btn.css';

export class ACAmptBtn extends BaseControlButton {
  private static instance_: ACAmptBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-ampt-btn',
      label: 'Ampt',
      ariaLabel: 'Amplitude',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACAmptBtn {
    this.instance_ = new ACAmptBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACAmptBtn {
    return this.instance_;
  }

  protected handleClick(): void {
    this.analyzerControl.domCache['label-cell-1'].textContent = 'Max Amplitude';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Min Amplitude';
    this.analyzerControl.domCache['label-cell-3'].textContent = '';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleMinAmplitudeClick();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleMaxAmplitudeClick();
    });
  }

  private handleMinAmplitudeClick(): void {
    // Update the display with current min amplitude

    this.playSound();
  }

  private handleMaxAmplitudeClick(): void {
    // Update the display with current min amplitude

    this.playSound();
  }
}
