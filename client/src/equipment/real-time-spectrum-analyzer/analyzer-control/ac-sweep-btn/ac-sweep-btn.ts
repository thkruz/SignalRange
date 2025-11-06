import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-sweep-btn.css';

export class ACSweepBtn extends BaseControlButton {
  private static instance_: ACSweepBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-sweep-btn',
      label: 'Sweep',
      ariaLabel: 'Sweep',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACSweepBtn {
    this.instance_ = new ACSweepBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACSweepBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('sweep');
    }
  }
}
