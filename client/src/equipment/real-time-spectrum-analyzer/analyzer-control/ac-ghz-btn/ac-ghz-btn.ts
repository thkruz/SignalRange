import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ghz-btn.css';

export class ACGhzBtn extends BaseControlButton {
  private static instance_: ACGhzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-ghz-btn-${analyzerControl.specA.state.uuid}`,
      classNames: 'physical-button unit-button',
      subtext: 'dBm',
      label: 'GHz',
      ariaLabel: 'GHz',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACGhzBtn {
    this.instance_ = new ACGhzBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACGhzBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    const currentUnit = this.analyzerControl.specA.state.inputUnit;
    if (currentUnit !== 'GHz') {
      this.analyzerControl.specA.state.inputUnit = 'GHz';

      // Convert the value to GHz if necessary
      const currentInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
      if (currentUnit === 'Hz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue / 1e9).toString();
      } else if (currentUnit === 'kHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue / 1e6).toString();
      } else if (currentUnit === 'MHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue / 1e3).toString();
      }

      this.analyzerControl.specA.syncDomWithState();
    }
  }
}
