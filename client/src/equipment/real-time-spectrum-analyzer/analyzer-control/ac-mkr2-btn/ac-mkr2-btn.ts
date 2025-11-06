import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr2-btn.css';

export class ACMkr2Btn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-mkr2-btn',
      label: 'Mkr2',
      ariaLabel: 'Marker 2',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMkr2Btn {
    return new ACMkr2Btn(analyzerControl);
  }

  static getInstance(): ACMkr2Btn {
    return new ACMkr2Btn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('mkr2');
    }
  }
}
