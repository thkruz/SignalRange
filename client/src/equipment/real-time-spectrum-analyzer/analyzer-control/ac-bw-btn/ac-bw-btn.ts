import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-bw-btn.css';

export class ACBWBtn extends BaseControlButton {
  private static instance_: ACBWBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
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
    this.instance_ = new ACBWBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACBWBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('bw');
    }
  }
}
