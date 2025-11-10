import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-hz-btn.css';

export class ACHzBtn extends BaseControlButton {
  private static instance_: ACHzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-hz-btn-${analyzerControl.specA.state.uuid}`,
      classNames: 'physical-button unit-button',
      subtext: 'dBm',
      label: 'Hz',
      ariaLabel: 'Hz',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACHzBtn {
    this.instance_ = new ACHzBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACHzBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    const currentUnit = this.analyzerControl.specA.state.inputUnit;
    if (currentUnit !== 'Hz') {
      this.analyzerControl.specA.state.inputUnit = 'Hz';

      // Convert the value to GHz if necessary
      let currentInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);

      if (isNaN(currentInputValue)) {
        currentInputValue = 0;
      }

      if (currentUnit === 'kHz') {
        const value = currentInputValue * 1e3;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      } else if (currentUnit === 'MHz') {
        const value = currentInputValue * 1e6;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      } else if (currentUnit === 'GHz') {
        const value = currentInputValue * 1e9;
        this.analyzerControl.specA.state.inputValue = Number(value.toPrecision(12)).toString();
      }

      this.analyzerControl.specA.syncDomWithState();
    }
  }
}
