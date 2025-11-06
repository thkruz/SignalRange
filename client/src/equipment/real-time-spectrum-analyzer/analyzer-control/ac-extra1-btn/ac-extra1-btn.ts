import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra1-btn.css';

export class ACExtra1Btn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-extra1-btn',
      label: 'Extra1',
      ariaLabel: 'Extra 1',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACExtra1Btn {
    return new ACExtra1Btn(analyzerControl);
  }

  static getInstance(): ACExtra1Btn {
    return new ACExtra1Btn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra1');
    }
  }
}
