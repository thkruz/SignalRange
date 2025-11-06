import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-span-btn.css';

export class ACSpanBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl?: AnalyzerControl) {
    super({
      uniqueId: 'ac-span-btn',
      label: 'Span',
      ariaLabel: 'Span',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACSpanBtn {
    return new ACSpanBtn(analyzerControl);
  }

  static getInstance(): ACSpanBtn {
    return new ACSpanBtn();
  }

  protected handleClick(): void {
    this.analyzerControl.domCache['label-cell-1'].textContent = 'Set Span';
    this.analyzerControl.domCache['label-cell-2'].textContent = '';
    this.analyzerControl.domCache['label-cell-3'].textContent = '';
    this.analyzerControl.domCache['label-cell-4'].textContent = '';
    this.analyzerControl.domCache['label-cell-5'].textContent = '';
    this.analyzerControl.domCache['label-cell-6'].textContent = '';
    this.analyzerControl.domCache['label-cell-7'].textContent = '';
    this.analyzerControl.domCache['label-cell-8'].textContent = '';
  }
}
