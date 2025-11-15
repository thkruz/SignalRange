import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra3-btn.css';

export class ACExtra3Btn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-extra3-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Extra3',
      ariaLabel: 'Extra 3',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra3', this);
    }
  }
}
