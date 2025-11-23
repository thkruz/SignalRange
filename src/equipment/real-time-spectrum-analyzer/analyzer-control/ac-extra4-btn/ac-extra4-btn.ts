import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra4-btn.css';

export class ACExtra4Btn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-extra4-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Extra4',
      ariaLabel: 'Extra 4',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra4', this);
    }
  }
}
