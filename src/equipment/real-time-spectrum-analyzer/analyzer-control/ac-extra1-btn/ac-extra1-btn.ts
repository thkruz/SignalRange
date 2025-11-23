import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra1-btn.css';

export class ACExtra1Btn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-extra1-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Extra1',
      ariaLabel: 'Extra 1',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra1', this);
    }
  }
}
