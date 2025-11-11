import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-meas-btn.css';

export class ACMeasBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-meas-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Meas',
      ariaLabel: 'Measure',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('meas', this);
    }
  }
}
