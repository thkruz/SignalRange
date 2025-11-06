import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-sweep-btn.css';

export class ACSweepBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
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
    return new ACSweepBtn(analyzerControl);
  }

  static getInstance(): ACSweepBtn {
    return new ACSweepBtn();
  }

  protected handleClick(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('sweep');
    }
  }
}
