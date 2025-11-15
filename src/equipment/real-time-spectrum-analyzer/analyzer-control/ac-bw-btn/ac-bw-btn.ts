import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-bw-btn.css';

export class ACBWBtn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-bw-btn-${analyzerControl.specA.state.uuid}`,
      label: 'BW',
      ariaLabel: 'Bandwidth',
      analyzerControl,
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('bw', this);
    }
  }
}
