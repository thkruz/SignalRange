import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-sweep-btn.css';

export class ACSweepBtn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-sweep-btn-${analyzerControl.specA.state.uuid}`,
      label: '',
      ariaLabel: 'Sweep',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('sweep', this);
  }
}
