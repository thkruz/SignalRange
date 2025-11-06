import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra3-btn.css';

export class ACExtra3Btn extends BaseControlButton {
  private static instance_: ACExtra3Btn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-extra3-btn',
      label: 'Extra3',
      ariaLabel: 'Extra 3',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACExtra3Btn {
    this.instance_ = new ACExtra3Btn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACExtra3Btn {
    return this.instance_;
  }

  protected handleClick(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra3');
    }
  }
}
