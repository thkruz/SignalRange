import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mode-btn.css';

export class ACModeBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-mode-btn',
      label: 'Mode',
      ariaLabel: 'Mode',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACModeBtn {
    return new ACModeBtn(analyzerControl);
  }

  static getInstance(): ACModeBtn {
    return new ACModeBtn();
  }

  protected handleClick(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('mode');
    }
  }
}
