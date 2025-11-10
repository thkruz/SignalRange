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
      const currentInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
      if (currentUnit === 'kHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue * 1e3).toString();
      } else if (currentUnit === 'MHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue * 1e6).toString();
      } else if (currentUnit === 'GHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue * 1e9).toString();
      }

      this.analyzerControl.specA.syncDomWithState();
    }
  }
}
