import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-trace-btn.css';

export class ACTraceBtn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-trace-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Trace',
      ariaLabel: 'Trace',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.specA.state.isMaxHold = !this.analyzerControl.specA.state.isMaxHold;

    // Update spectrum analyzer
    this.analyzerControl.specA.resetHoldData();


    this.playSound();
  }
}
