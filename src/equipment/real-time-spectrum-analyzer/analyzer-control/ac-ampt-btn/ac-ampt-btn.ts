import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ampt-btn.css';

export class ACAmptBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;
  private subMenuSelected: 'max' | 'min' | 'ref' | null = null;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-ampt-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Ampt',
      ariaLabel: 'Amplitude',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('ampt', this);

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Reference Level';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Scale / dB per Division';
    this.analyzerControl.domCache['label-cell-3'].textContent = 'Amplitude Units';
    this.analyzerControl.domCache['label-cell-4'].textContent = 'Input Attenuation';
    this.analyzerControl.domCache['label-cell-5'].textContent = 'Preamp Gain';
    this.analyzerControl.domCache['label-cell-6'].textContent = 'Reference Level Offset';
    this.analyzerControl.domCache['label-cell-7'].textContent = 'Max Amplitude';
    this.analyzerControl.domCache['label-cell-8'].textContent = 'Min Amplitude';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleReferenceLevelClick();
    });
    this.analyzerControl.domCache['label-select-button-7']?.addEventListener('click', () => {
      this.handleMaxAmplitudeClick();
    });
    this.analyzerControl.domCache['label-select-button-8']?.addEventListener('click', () => {
      this.handleMinAmplitudeClick();
    });
  }

  private handleReferenceLevelClick(): void {
    // Update the display with current reference level
    this.subMenuSelected = 'ref';

    const refLevel = this.analyzerControl.specA.state.referenceLevel;
    this.analyzerControl.specA.state.inputValue = refLevel.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
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

  onMajorTickChange(value: number): void {
    this.applyTickAdjustment(1, value);
  }

  onMinorTickChange(value: number): void {
    this.applyTickAdjustment(10, value);
  }

  applyTickAdjustment(divisor: number, value: number): void {
    if (this.subMenuSelected === null) {
      return;
    }
    const adjustment = value / divisor;

    switch (this.subMenuSelected) {
      case 'ref':
        this.analyzerControl.specA.state.referenceLevel += adjustment;
        break;
      case 'min':
        this.analyzerControl.specA.state.minAmplitude += adjustment;
        break;
      case 'max':
        this.analyzerControl.specA.state.maxAmplitude += adjustment;
        break;
    }

    this.analyzerControl.specA.syncDomWithState();
  }

  onEnterPressed(): void {
    switch (this.subMenuSelected) {
      case null:
        return;
      case 'ref':
        {
          const refInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
          if (!isNaN(refInputValue)) {
            this.analyzerControl.specA.state.referenceLevel = refInputValue;
          }
        }
        break;
      case 'min':
        {
          const minInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
          if (!isNaN(minInputValue)) {
            this.analyzerControl.specA.state.minAmplitude = minInputValue;
          }
          break;
        }
      case 'max':
        {
          const maxInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
          if (!isNaN(maxInputValue)) {
            this.analyzerControl.specA.state.maxAmplitude = maxInputValue;
          }
        }
        break;
    }

    this.playSound();
  }
}
