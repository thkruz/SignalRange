import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr2-btn.css';

export class ACMkr2Btn extends BaseControlButton {
  private static instance_: ACMkr2Btn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mkr2-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mkr2',
      ariaLabel: 'Marker 2',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMkr2Btn {
    this.instance_ = new ACMkr2Btn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACMkr2Btn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('mkr2');
    }
  }
}
