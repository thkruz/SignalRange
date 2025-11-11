import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-mkr-btn.css';

export class ACMkrBtn extends BaseControlButton {
  private readonly analyzerControl: AnalyzerControl;

  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mkr-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mkr',
      ariaLabel: 'Marker',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('mkr', this);

    this.analyzerControl.specA.state.isMarkerOn = !this.analyzerControl.specA.state.isMarkerOn;

    // Note: Marker drawing would need to be implemented in SpectrumAnalyzer

    this.playSound();
  }
}
