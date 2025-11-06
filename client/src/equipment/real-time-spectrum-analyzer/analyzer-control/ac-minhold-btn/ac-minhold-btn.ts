import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-minhold-btn.css';

export class ACMinHoldBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-minhold-btn',
      label: 'MinHold',
      ariaLabel: 'Min Hold',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMinHoldBtn {
    return new ACMinHoldBtn(analyzerControl);
  }

  static getInstance(): ACMinHoldBtn {
    return new ACMinHoldBtn();
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('minhold');
    }
  }
}
