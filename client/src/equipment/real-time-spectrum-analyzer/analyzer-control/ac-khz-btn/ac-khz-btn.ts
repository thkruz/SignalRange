import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-khz-btn.css';

export class ACKhzBtn extends BaseControlButton {
  private static instance_: ACKhzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
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

  static create(analyzerControl: AnalyzerControl): ACKhzBtn {
    this.instance_ = new ACKhzBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACKhzBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    const currentUnit = this.analyzerControl.specA.state.inputUnit;
    if (currentUnit !== 'kHz') {
      this.analyzerControl.specA.state.inputUnit = 'kHz';
      this.analyzerControl.specA.syncDomWithState();

      // Convert the value to GHz if necessary
      const currentInputValue = parseFloat(this.analyzerControl.specA.state.inputValue);
      if (currentUnit === 'Hz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue / 1e3).toString();
      } else if (currentUnit === 'MHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue * 1e3).toString();
      } else if (currentUnit === 'GHz') {
        this.analyzerControl.specA.state.inputValue = (currentInputValue * 1e6).toString();
      }

      this.analyzerControl.specA.syncDomWithState();
    }
  }
}
