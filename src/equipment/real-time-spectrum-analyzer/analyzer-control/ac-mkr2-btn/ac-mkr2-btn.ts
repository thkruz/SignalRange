import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr2-btn.css';

export class ACMkr2Btn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mkr2-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mkr2',
      ariaLabel: 'Marker 2',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('mkr2', this);
    }
  }
}
