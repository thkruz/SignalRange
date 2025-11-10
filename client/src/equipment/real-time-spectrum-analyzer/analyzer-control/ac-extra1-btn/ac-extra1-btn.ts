import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra1-btn.css';

export class ACExtra1Btn extends BaseControlButton {
  private static instance_: ACExtra1Btn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-extra1-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Extra1',
      ariaLabel: 'Extra 1',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACExtra1Btn {
    this.instance_ = new ACExtra1Btn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACExtra1Btn {
    return this.instance_;
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra1', this);
    }
  }
}
