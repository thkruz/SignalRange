import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-bw-btn.css';

export class ACBWBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-bw-btn',
      label: 'BW',
      ariaLabel: 'Bandwidth',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACBWBtn {
    return new ACBWBtn(analyzerControl);
  }

  static getInstance(): ACBWBtn {
    return new ACBWBtn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('bw');
    }
  }
}
