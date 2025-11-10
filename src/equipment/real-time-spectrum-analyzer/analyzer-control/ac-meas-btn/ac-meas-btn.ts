import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-meas-btn.css';

export class ACMeasBtn extends BaseControlButton {
  private static instance_: ACMeasBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-meas-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Meas',
      ariaLabel: 'Measure',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMeasBtn {
    this.instance_ = new ACMeasBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACMeasBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('meas', this);
    }
  }
}
