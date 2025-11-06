import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ampt-btn.css';

export class ACAmptBtn extends BaseControlButton {
  private static instance_: ACAmptBtn;
  private readonly analyzerControl: AnalyzerControl;
  private subMenuSelected: 'max' | 'min' | null = null;

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
    this.analyzerControl.controlSelection = this;

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Max Amplitude';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Min Amplitude';
    this.analyzerControl.domCache['label-cell-3'].textContent = '';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleMaxAmplitudeClick();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleMinAmplitudeClick();
    });
  }

  private handleMinAmplitudeClick(): void {
    // Update the display with current min amplitude
    this.subMenuSelected = 'min';
    const minAmp = this.analyzerControl.specA.state.minAmplitude;
    this.analyzerControl.specA.state.inputValue = minAmp.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleMaxAmplitudeClick(): void {
    // Update the display with current max amplitude
    this.subMenuSelected = 'max';
    const maxAmp = this.analyzerControl.specA.state.maxAmplitude;
    this.analyzerControl.specA.state.inputValue = maxAmp.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  onEnterPressed(): void {
    if (this.subMenuSelected === 'min') {
      const inputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
      if (!isNaN(inputValue)) {
        this.analyzerControl.specA.state.minAmplitude = inputValue;
      }
    } else if (this.subMenuSelected === 'max') {
      const inputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
      if (!isNaN(inputValue)) {
        this.analyzerControl.specA.state.maxAmplitude = inputValue;
      }
    }

    // Reset submenu selection after processing
    this.subMenuSelected = null;

    this.playSound();
  }
}
