import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-minhold-btn.css';

export class ACMinHoldBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-minhold-btn-${analyzerControl.specA.state.uuid}`,
      label: 'MinHold',
      ariaLabel: 'Min Hold',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('minhold', this);
    this.analyzerControl.specA.state.isMinHold = !this.analyzerControl.specA.state.isMinHold;

    // Update spectrum analyzer
    this.analyzerControl.specA.resetHoldData();


    this.playSound();
  }
}
