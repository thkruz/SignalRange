import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-hz-btn.css';

export class ACHzBtn extends BaseControlButton {
  private static instance_: ACHzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-hz-btn',
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

  protected handleClick(): void {
    this.analyzerControl.specA.state.inputUnit = 'Hz';
    this.analyzerControl.specA.syncDomWithState();
  }
}
