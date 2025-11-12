import { Logger } from "@app/logging/logger";
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

    // Trigger marker update if marker is turned on
    this.analyzerControl.specA.state.isUpdateMarkers = this.analyzerControl.specA.state.isMarkerOn;

    // Note: Marker drawing would need to be implemented in SpectrumAnalyzer

    this.playSound();
  }

  onMajorTickChange(value: number): void {
    // Positive value means increment marker index, negative means decrement
    this.changeMarkerIndex(value < 0 ? 1 : -1);
  }

  onMinorTickChange(value: number): void {
    // Positive value means increment marker index, negative means decrement
    this.changeMarkerIndex(value < 0 ? 1 : -1);
  }

  private changeMarkerIndex(delta: number): void {
    if (!this.analyzerControl.specA.state.isMarkerOn || this.analyzerControl.specA.state.topMarkers.length === 0) {
      return;
    }

    const numMarkers = this.analyzerControl.specA.state.topMarkers.length;
    this.analyzerControl.specA.state.markerIndex =
      (this.analyzerControl.specA.state.markerIndex + delta + numMarkers) % numMarkers;

    Logger.info('ACMkrBtn', 'changeMarkerIndex', `Marker index changed to ${this.analyzerControl.specA.state.markerIndex}`);
  }
}
