import { Logger } from "@app/logging/logger";
import { Hertz } from "@app/types";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-bw-btn.css';

export class ACBWBtn extends BaseControlButton {
  private subMenuSelected: 'setrbw' | 'autorbw' | null = null;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-bw-btn-${analyzerControl.specA.state.uuid}`,
      label: 'BW',
      ariaLabel: 'Bandwidth',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('bw', this);

    this.analyzerControl.domCache['label-cell-1'].textContent = 'Set RBW';
    this.analyzerControl.domCache['label-cell-2'].textContent = 'Auto RBW';
    this.analyzerControl.domCache['label-cell-3'].textContent = '';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';

    this.analyzerControl.domCache['label-select-button-1']?.addEventListener('click', () => {
      this.handleSetRBWClick_();
    });
    this.analyzerControl.domCache['label-select-button-2']?.addEventListener('click', () => {
      this.handleAutoRBWClick_();
    });
  }

  private handleSetRBWClick_(): void {
    this.subMenuSelected = 'setrbw';

    // Update the display with current RBW value
    const currentRBW = this.analyzerControl.specA.state.rbw;
    if (currentRBW === null) {
      this.analyzerControl.specA.state.inputValue = this.formatRBW_(this.analyzerControl.specA.state.span);
      this.analyzerControl.specA.state.inputUnit = 'Hz';
    } else {
      this.analyzerControl.specA.state.inputValue = this.formatRBW_(currentRBW);
      this.analyzerControl.specA.state.inputUnit = 'Hz';
    }

    this.analyzerControl.specA.syncDomWithState();

    this.notifyStateChange_();
    this.playSound();
  }

  private handleAutoRBWClick_(): void {
    this.analyzerControl.specA.state.rbw = null;

    Logger.info('RBW set to Auto');

    this.notifyStateChange_();
    this.playSound();
  }

  onMajorTickChange(value: number): void {
    if (this.subMenuSelected !== 'setrbw') {
      return;
    }

    Logger.info(`Adjusting RBW by major tick: ${value}`);
    this.adjustRBW_(-value * 10000); // Major tick adjusts by 10 kHz
  }

  onMinorTickChange(value: number): void {
    if (this.subMenuSelected !== 'setrbw') {
      return;
    }

    Logger.info(`Adjusting RBW by minor tick: ${value}`);
    this.adjustRBW_(-value * 1000); // Minor tick adjusts by 1 kHz
  }

  private adjustRBW_(delta: number): void {
    const currentRBW = this.analyzerControl.specA.state.rbw ?? this.analyzerControl.specA.state.span;
    const newRBW = currentRBW + delta;

    // Validate RBW is in reasonable range (1 Hz to 300 MHz)
    if (newRBW < 1) {
      window.alert('Error: RBW must be at least 1 Hz.');
      this.playSound();
      return;
    }

    if (newRBW > 300000000) {
      window.alert('Error: RBW cannot exceed 300 MHz.');
      this.playSound();
      return;
    }

    this.analyzerControl.specA.state.rbw = newRBW as Hertz;

    // Update display
    this.analyzerControl.specA.state.inputValue = this.formatRBW_(newRBW);
    this.analyzerControl.specA.syncDomWithState();

    Logger.info(`RBW set to: ${newRBW} Hz`);
    this.notifyStateChange_();
  }

  onEnterPressed(): void {
    if (this.subMenuSelected !== 'setrbw') {
      return;
    }

    Logger.info('Processing RBW input.');

    const analyzerState = this.analyzerControl.specA.state;
    const inputValue = parseFloat(analyzerState.inputValue);
    const inputUnit = analyzerState.inputUnit;
    let bwInHz: number;

    // Convert input value to Hz based on selected unit
    switch (inputUnit) {
      case 'GHz':
        bwInHz = inputValue * 1e9;
        break;
      case 'MHz':
        bwInHz = inputValue * 1e6;
        break;
      case 'kHz':
        bwInHz = inputValue * 1e3;
        break;
      case 'Hz':
        break;
      default:
        throw new Error('Invalid frequency unit');
    }

    if (isNaN(bwInHz)) {
      window.alert('Error: Invalid RBW value. Please enter a number.');
      this.playSound();
      return;
    }

    // Validate RBW is in reasonable range (1 Hz to 300 MHz)
    if (bwInHz < 1) {
      window.alert('Error: RBW must be at least 1 Hz.');
      this.playSound();
      return;
    }

    if (bwInHz > 300000000) {
      window.alert('Error: RBW cannot exceed 300 MHz.');
      this.playSound();
      return;
    }

    this.analyzerControl.specA.state.rbw = bwInHz as Hertz;
    Logger.info(`RBW set to: ${bwInHz} Hz`);

    this.notifyStateChange_();
    this.playSound();
  }

  /**
   * Format RBW value for display
   */
  private formatRBW_(rbw: number): string {
    return rbw.toString();
  }

  /**
   * Get the current RBW value (null means auto)
   */
  getRBW(): number | null {
    return this.analyzerControl.specA.state.rbw;
  }
}
