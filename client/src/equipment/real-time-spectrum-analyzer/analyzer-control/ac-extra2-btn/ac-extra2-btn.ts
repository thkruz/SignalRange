import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra2-btn.css';

export class ACExtra2Btn extends BaseControlButton {
  private static instance_: ACExtra2Btn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-extra2-btn',
      label: 'Extra2',
      ariaLabel: 'Extra 2',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACExtra2Btn {
    this.instance_ = new ACExtra2Btn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACExtra2Btn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra2');
    }
  }
}
