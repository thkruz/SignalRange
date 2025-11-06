import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-freq-btn.css';

export class ACFreqBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-freq-btn',
      label: 'Freq',
      ariaLabel: 'Frequency',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACFreqBtn {
    return new ACFreqBtn(analyzerControl);
  }

  static getInstance(): ACFreqBtn {
    return new ACFreqBtn();
  }

  protected handleClick(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('freq');
    }
  }
}