import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra3-btn.css';

export class ACExtra3Btn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
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
    return new ACExtra3Btn(analyzerControl);
  }

  static getInstance(): ACExtra3Btn {
    return new ACExtra3Btn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra3');
    }
  }
}
