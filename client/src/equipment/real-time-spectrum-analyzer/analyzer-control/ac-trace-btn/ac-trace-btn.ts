import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-trace-btn.css';

export class ACTraceBtn extends BaseControlButton {
  private static instance_: ACTraceBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-trace-btn',
      label: 'Trace',
      ariaLabel: 'Trace',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACTraceBtn {
    this.instance_ = new ACTraceBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACTraceBtn {
    return this.instance_;
  }

  protected handleClick(): void {
    this.analyzerControl.specA.state.isMaxHold = !this.analyzerControl.specA.state.isMaxHold;

    // Update spectrum analyzer
    this.analyzerControl.specA.resetHoldData();


    this.playSound();
  }
}
