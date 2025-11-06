import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-khz-btn.css';

export class ACKhzBtn extends BaseControlButton {
  private static instance_: ACKhzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-khz-btn',
      classNames: 'physical-button unit-button',
      subtext: 'dBm',
      label: 'kHz',
      ariaLabel: 'kHz',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACKhzBtn {
    this.instance_ = new ACKhzBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACKhzBtn {
    return this.instance_;
  }

  protected handleClick(): void {
    this.analyzerControl.specA.state.inputUnit = 'kHz';
    this.analyzerControl.specA.syncDomWithState();
  }
}
