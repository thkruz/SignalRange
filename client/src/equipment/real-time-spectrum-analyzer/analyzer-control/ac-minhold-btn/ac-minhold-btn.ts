import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-minhold-btn.css';

export class ACMinHoldBtn extends BaseControlButton {
  private static instance_: ACMinHoldBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
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
    this.instance_ = new ACMinHoldBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACMinHoldBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('minhold');
    this.analyzerControl.specA.state.isMinHold = !this.analyzerControl.specA.state.isMinHold;

    // Update spectrum analyzer
    this.analyzerControl.specA.resetHoldData();


    this.playSound();
  }
}
