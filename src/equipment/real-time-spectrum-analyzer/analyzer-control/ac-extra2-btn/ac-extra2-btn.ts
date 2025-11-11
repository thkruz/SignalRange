import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-extra2-btn.css';

export class ACExtra2Btn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-extra2-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Extra2',
      ariaLabel: 'Extra 2',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    if (this.analyzerControl) {
      this.analyzerControl.updateSubMenu('extra2', this);
    }
  }
}
