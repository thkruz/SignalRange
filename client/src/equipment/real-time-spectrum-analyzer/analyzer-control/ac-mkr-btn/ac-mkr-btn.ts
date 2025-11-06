import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr-btn.css';

export class ACMkrBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-mkr-btn',
      label: 'Mkr',
      ariaLabel: 'Marker',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACMkrBtn {
    return new ACMkrBtn(analyzerControl);
  }

  static getInstance(): ACMkrBtn {
    return new ACMkrBtn();
  }

  protected handleClick(): void {
    this.analyzerControl.updateSubMenu('mkr');

    this.analyzerControl.specA.state.isMarkerOn = !this.analyzerControl.specA.state.isMarkerOn;

    // Note: Marker drawing would need to be implemented in SpectrumAnalyzer

    this.playSound();
  }
}
