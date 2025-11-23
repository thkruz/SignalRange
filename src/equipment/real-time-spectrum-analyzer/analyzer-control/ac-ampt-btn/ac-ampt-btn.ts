import { dB } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ampt-btn.css';

export class ACAmptBtn extends BaseControlButton {
  private subMenuSelected: 'ref' | 'dbperdiv' | 'max' | 'min' | null = null;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-ampt-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Ampt',
      ariaLabel: 'Amplitude',
      analyzerControl,
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
    this.analyzerControl.domCache['label-cell-6'].textContent = 'Max Amplitude';
    this.analyzerControl.domCache['label-cell-7'].textContent = 'Min Amplitude';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleReferenceLevelClick_();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleScaleDbPerDivClick_();
    });
    this.analyzerControl.domCache['label-select-button-3']?.addEventListener('click', () => {
      alert('Amplitude Units setting not yet implemented.');
      this.playSound();
    });
    this.analyzerControl.domCache['label-select-button-4']?.addEventListener('click', () => {
      alert('Input Attenuation setting not yet implemented.');
      this.playSound();
    });
    this.analyzerControl.domCache['label-select-button-5']?.addEventListener('click', () => {
      alert('Preamp Gain setting not yet implemented.');
      this.playSound();
    });
    this.analyzerControl.domCache['label-select-button-6']?.addEventListener('click', () => {
      this.handleMaxAmplitudeClick_();
    });
    this.analyzerControl.domCache['label-select-button-7']?.addEventListener('click', () => {
      this.handleMinAmplitudeClick_();
    });
  }

  private handleReferenceLevelClick_(): void {
    // Update the display with current reference level
    this.subMenuSelected = 'ref';

    const refLevel = this.analyzerControl.specA.state.referenceLevel;
    this.analyzerControl.specA.state.inputValue = refLevel.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();

    this.notifyStateChange_();
    this.playSound();
  }

  private handleScaleDbPerDivClick_(): void {
    // Update the display with current reference level
    this.subMenuSelected = 'dbperdiv';

    // Maximum amplitude stays consistent, we change the minimum based on 10 total divisions and the new division scale
    const scaleDbPerDiv = this.analyzerControl.specA.state.scaleDbPerDiv;

    this.analyzerControl.specA.state.inputValue = scaleDbPerDiv.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm'; // TODO: Change to dB/div when implemented

    this.analyzerControl.specA.syncDomWithState();

    this.playSound();
  }

  private handleMinAmplitudeClick_(): void {
    // Update the display with current min amplitude
    this.subMenuSelected = 'min';
    const minAmp = this.analyzerControl.specA.state.minAmplitude;
    this.analyzerControl.specA.state.inputValue = minAmp.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();

    this.notifyStateChange_();
    this.playSound();
  }

  private handleMaxAmplitudeClick_(): void {
    // Update the display with current max amplitude
    this.subMenuSelected = 'max';
    const maxAmp = this.analyzerControl.specA.state.maxAmplitude;
    this.analyzerControl.specA.state.inputValue = maxAmp.toString();
    this.analyzerControl.specA.state.inputUnit = 'dBm';

    this.analyzerControl.specA.syncDomWithState();

    this.notifyStateChange_();
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
        this.analyzerControl.specA.state.scaleDbPerDiv = (this.analyzerControl.specA.state.maxAmplitude - this.analyzerControl.specA.state.minAmplitude) / 10 as dB;
        break;
      case 'max':
        this.analyzerControl.specA.state.maxAmplitude += adjustment;
        this.analyzerControl.specA.state.scaleDbPerDiv = (this.analyzerControl.specA.state.maxAmplitude - this.analyzerControl.specA.state.minAmplitude) / 10 as dB;
        break;
      case 'dbperdiv':
        {
          const newScale = this.analyzerControl.specA.state.scaleDbPerDiv + adjustment as dB;
          this.analyzerControl.specA.state.scaleDbPerDiv = newScale;
          // Adjust min amplitude to keep max amplitude consistent
          this.analyzerControl.specA.state.minAmplitude = this.analyzerControl.specA.state.maxAmplitude - (newScale * 10) as dB;
        }
        break;
    }

    this.analyzerControl.specA.syncDomWithState();
    this.notifyStateChange_();
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
            this.analyzerControl.specA.state.scaleDbPerDiv = (this.analyzerControl.specA.state.maxAmplitude - this.analyzerControl.specA.state.minAmplitude) / 10 as dB;
          }
          break;
        }
      case 'max':
        {
          const maxInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
          if (!isNaN(maxInputValue)) {
            this.analyzerControl.specA.state.maxAmplitude = maxInputValue;
            this.analyzerControl.specA.state.scaleDbPerDiv = (this.analyzerControl.specA.state.maxAmplitude - this.analyzerControl.specA.state.minAmplitude) / 10 as dB;
          }
        }
        break;
      case 'dbperdiv':
        {
          const scaleInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
          if (!isNaN(scaleInputValue)) {
            const newScale = scaleInputValue as dB;
            this.analyzerControl.specA.state.scaleDbPerDiv = newScale;
            // Adjust min amplitude to keep max amplitude consistent
            this.analyzerControl.specA.state.minAmplitude = this.analyzerControl.specA.state.maxAmplitude - (newScale * 10) as dB;
          }
        }
        break;
    }

    this.notifyStateChange_();
    this.playSound();
  }
}
