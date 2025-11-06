import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-ghz-btn.css';

export class ACGhzBtn extends BaseControlButton {
  private static instance_: ACGhzBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: 'ac-ghz-btn',
      classNames: 'physical-button unit-button',
      subtext: 'dBm',
      label: 'GHz',
      ariaLabel: 'GHz',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACGhzBtn {
    this.instance_ = new ACGhzBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACGhzBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    this.analyzerControl.specA.state.inputUnit = 'GHz';
    this.analyzerControl.specA.syncDomWithState();
  }
}
