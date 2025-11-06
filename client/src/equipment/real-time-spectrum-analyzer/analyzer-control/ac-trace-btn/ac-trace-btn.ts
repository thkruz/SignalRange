import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-trace-btn.css';

export class ACTraceBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
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
    return new ACTraceBtn(analyzerControl);
  }

  static getInstance(): ACTraceBtn {
    return new ACTraceBtn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('trace');
    }
  }
}
