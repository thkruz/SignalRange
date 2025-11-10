import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr-btn.css';

export class ACMkrBtn extends BaseControlButton {
  private static instance_: ACMkrBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mkr-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mkr',
      ariaLabel: 'Marker',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMkrBtn {
    this.instance_ = new ACMkrBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACMkrBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('mkr', this);

    this.analyzerControl.specA.state.isMarkerOn = !this.analyzerControl.specA.state.isMarkerOn;

    // Note: Marker drawing would need to be implemented in SpectrumAnalyzer

    this.playSound();
  }
}
