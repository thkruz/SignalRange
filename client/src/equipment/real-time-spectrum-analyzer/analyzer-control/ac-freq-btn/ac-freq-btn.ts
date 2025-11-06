import { Logger } from "@app/logging/logger";
import { Hertz } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-freq-btn.css';

export class ACFreqBtn extends BaseControlButton {
  private static instance_: ACFreqBtn;
  private readonly analyzerControl: AnalyzerControl;
  private subMenuSelected: 'center' | 'start' | 'stop' | null = null;

  private constructor(analyzerControl: AnalyzerControl) {
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

  init(): void {
    // Unique because its the default submenu on opening AnalyzerControl
    this.handleClick_();
    this.handleCenterFreqClick();
  }

  static getInstance(): ACFreqBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.controlSelection = this;

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
    this.subMenuSelected = 'center';

    // Update the display with current center frequency
    const centerFreq = this.analyzerControl.specA.state.centerFrequency;
    this.analyzerControl.specA.state.inputValue = (centerFreq / 1e6).toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleStartFreqClick(): void {
    this.subMenuSelected = 'start';

    // Update the display with current start frequency
    const startFreq = this.analyzerControl.specA.state.startFrequency;
    this.analyzerControl.specA.state.inputValue = (startFreq / 1e6).toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
  }

  private handleStopFreqClick(): void {
    this.subMenuSelected = 'stop';

    // Update the display with current stop frequency
    const stopFreq = this.analyzerControl.specA.state.stopFrequency;
    this.analyzerControl.specA.state.inputValue = (stopFreq / 1e6).toString();
    this.analyzerControl.specA.state.inputUnit = 'MHz';

    this.analyzerControl.specA.syncDomWithState();
    this.playSound();
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

    // Update the appropriate frequency based on submenu selection
    if (this.subMenuSelected === 'center') {
      this.analyzerControl.specA.state.centerFrequency = frequencyInHz as Hertz;
    } else if (this.subMenuSelected === 'start') {
      this.analyzerControl.specA.state.startFrequency = frequencyInHz as Hertz;
    } else if (this.subMenuSelected === 'stop') {
      this.analyzerControl.specA.state.stopFrequency = frequencyInHz as Hertz;
    }

    this.playSound();
  }
}