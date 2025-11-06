import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-meas-btn.css';

export class ACMeasBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-meas-btn',
      label: 'Meas',
      ariaLabel: 'Measure',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMeasBtn {
    return new ACMeasBtn(analyzerControl);
  }

  static getInstance(): ACMeasBtn {
    return new ACMeasBtn();
  }

  protected handleClick(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('meas');
    }
  }
}
