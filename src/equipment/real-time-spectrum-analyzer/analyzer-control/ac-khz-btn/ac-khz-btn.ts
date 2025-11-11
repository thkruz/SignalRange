import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-khz-btn.css';

export class ACKhzBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-khz-btn-${analyzerControl.specA.state.uuid}`,
      classNames: 'physical-button unit-button',
      subtext: 'dBm',
      label: 'kHz',
      ariaLabel: 'kHz',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    const currentUnit = this.analyzerControl.specA.state.inputUnit;
    if (currentUnit !== 'kHz') {
      this.analyzerControl.specA.state.inputUnit = 'kHz';
      this.analyzerControl.specA.syncDomWithState();

      // Convert the value to GHz if necessary
      let currentInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);

      if (isNaN(currentInputValue)) {
        currentInputValue = 0;
      }

      if (currentUnit === 'Hz') {
        const value = currentInputValue / 1e3;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      } else if (currentUnit === 'MHz') {
        const value = currentInputValue * 1e3;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      } else if (currentUnit === 'GHz') {
        const value = currentInputValue * 1e6;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      }

      this.analyzerControl.specA.syncDomWithState();
    }
  }
}
