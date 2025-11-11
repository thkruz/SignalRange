import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-sweep-btn.css';

export class ACSweepBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-sweep-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Sweep',
      ariaLabel: 'Sweep',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('sweep', this);
  }
}
