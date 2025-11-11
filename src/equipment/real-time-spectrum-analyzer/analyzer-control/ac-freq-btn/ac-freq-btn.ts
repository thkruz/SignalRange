import { Logger } from "@app/logging/logger";
import { Hertz } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-freq-btn.css';

export class ACFreqBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;
  private subMenuSelected: 'center' | 'start' | 'stop' = 'center';

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-freq-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Freq',
      ariaLabel: 'Frequency',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('freq', this);

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Center Freq';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Start Freq';
    this.analyzerControl.domCache['label-cell-3'].textContent = 'Stop Freq';
    this.analyzerControl.domCache['label-cell-4'].textContent = 'Auto-Tune';
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
    this.analyzerControl.domCache['label-select-button-4']?.addEventListener('click', () => {
      this.handleAutoTuneClick();
    });
  }

  private handleCenterFreqClick(): void {
    this.subMenuSelected = 'center';

    // Update the display with current center frequency
    const centerFreq = this.analyzerControl.specA.state.centerFrequency;
    this.analyzerControl.specA.state.inputValue = (centerFreq / 1e6).toFixed(2);
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleStartFreqClick(): void {
    this.subMenuSelected = 'start';

    // Update the display with current start frequency
    const startFreq = (this.analyzerControl.specA.state.centerFrequency - this.analyzerControl.specA.state.span / 2) as Hertz;
    this.analyzerControl.specA.state.inputValue = (startFreq / 1e6).toFixed(2);
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleStopFreqClick(): void {
    this.subMenuSelected = 'stop';

    // Update the display with current stop frequency
    const stopFreq = (this.analyzerControl.specA.state.centerFrequency + this.analyzerControl.specA.state.span / 2) as Hertz;
    this.analyzerControl.specA.state.inputValue = (stopFreq / 1e6).toFixed(2);
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleAutoTuneClick(): void {
    this.analyzerControl.specA.freqAutoTune();
  }

  private applyTickAdjustment(divisor: number, value: number): void {
    const analyzerState = this.analyzerControl.specA.state;
    const adjustmentInHz = (value * analyzerState.span) / divisor;
    let newVal = 0;

    if (this.subMenuSelected === 'center') {
      newVal = this.analyzerControl.specA.state.centerFrequency + adjustmentInHz;
    } else if (this.subMenuSelected === 'start') {
      const currentStartFreq = this.analyzerControl.specA.state.centerFrequency - (this.analyzerControl.specA.state.span / 2) as Hertz;
      newVal = currentStartFreq + adjustmentInHz;
    } else if (this.subMenuSelected === 'stop') {
      const currentStopFreq = this.analyzerControl.specA.state.centerFrequency + (this.analyzerControl.specA.state.span / 2) as Hertz;
      newVal = currentStopFreq + adjustmentInHz;
    }

    // Round to nearest Hertz
    newVal = Math.round(newVal);

    this.adjustFrequencyInHz((newVal as Hertz));
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

    const analyzerState = this.analyzerControl.specA.state;
    const inputValue = parseFloat(analyzerState.inputValue);
    const inputUnit = analyzerState.inputUnit;
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

    this.adjustFrequencyInHz(frequencyInHz as Hertz);

    this.playSound();
  }

  private adjustFrequencyInHz(frequencyInHz: Hertz): void {
    const analyzerState = this.analyzerControl.specA.state;

    // TODO: This should be a GUI error message
    // Ensure frequency is within allowable range
    const minFreq = analyzerState.minFrequency;
    const maxFreq = analyzerState.maxFrequency;
    if (frequencyInHz < minFreq || frequencyInHz > maxFreq) {
      Logger.error(`Input frequency ${frequencyInHz} Hz is out of range (${minFreq} Hz - ${maxFreq} Hz).`);
      alert(`Error: Input frequency is out of range (${(minFreq / 1e3).toFixed(2)} kHz - ${(maxFreq / 1e9).toFixed(2)} GHz).`);
      return;
    }

    // Update the appropriate frequency based on submenu selection
    if (this.subMenuSelected === 'center') {
      analyzerState.centerFrequency = frequencyInHz as Hertz;
    } else if (this.subMenuSelected === 'start') {
      switch (analyzerState.lockedControl) {
        case 'freq':
          {
            // Adjust the span to meet new start frequency while keeping stop frequency constant
            const currentStopFreq = (analyzerState.centerFrequency + analyzerState.span / 2) as Hertz;

            analyzerState.span = (currentStopFreq - frequencyInHz) as Hertz;
            analyzerState.centerFrequency = (frequencyInHz + analyzerState.span / 2) as Hertz;
          }
          break;
        case 'span':
          {
            // Update the center frequency based on new start frequency and current span
            const span = analyzerState.span;
            analyzerState.centerFrequency = (frequencyInHz + span / 2) as Hertz;
          }
          break;
      }
    } else if (this.subMenuSelected === 'stop') {
      switch (analyzerState.lockedControl) {
        case 'freq':
          {
            // Adjust the span to meet new stop frequency while keeping start frequency constant
            const currentStartFreq = (analyzerState.centerFrequency - analyzerState.span / 2) as Hertz;

            analyzerState.span = (frequencyInHz - currentStartFreq) as Hertz;
            analyzerState.centerFrequency = (currentStartFreq + analyzerState.span / 2) as Hertz;
          }
          break;
        case 'span':
          {
            // Update the center frequency based on new stop frequency and current span
            const span = analyzerState.span;
            analyzerState.centerFrequency = (frequencyInHz - span / 2) as Hertz;
          }
          break;
      }
    }

    analyzerState.lockedControl = 'freq';
  }
}