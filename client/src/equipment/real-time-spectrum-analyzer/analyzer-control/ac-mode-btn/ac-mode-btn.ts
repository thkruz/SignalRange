import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mode-btn.css';

export class ACModeBtn extends BaseControlButton {
  private static instance_: ACModeBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mode-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mode',
      ariaLabel: 'Mode',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACModeBtn {
    this.instance_ = new ACModeBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACModeBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('mode', this);
    }
  }
}
