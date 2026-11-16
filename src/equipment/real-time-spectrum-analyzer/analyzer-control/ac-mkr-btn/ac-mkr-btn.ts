import { AnalyzerControl } from '@app/equipment/real-time-spectrum-analyzer/analyzer-control';
import { BaseControlButton } from '@app/equipment/real-time-spectrum-analyzer/analyzer-control/base-control-button';
import { Logger } from '@app/logging/logger';
import './ac-mkr-btn.css';

export class ACMkrBtn extends BaseControlButton {
  constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-mkr-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Mkr',
      ariaLabel: 'Marker',
      analyzerControl,
    });
  }

  protected handleClick_(): void {
    this.analyzerControl.updateSubMenu('mkr', this);

    this.analyzerControl.specA.state.isMarkerOn = !this.analyzerControl.specA.state.isMarkerOn;

    // Trigger marker update if marker is turned on
    this.analyzerControl.specA.state.isUpdateMarkers = this.analyzerControl.specA.state.isMarkerOn;
    // Turning the marker off (or on by hand) releases the Peak Search bin (phase 33 D10)
    this.analyzerControl.specA.state.peakMarkerBin = undefined;
    this.redrawIfPaused_();

    this.notifyStateChange_();
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
    // A marker stepped by hand leaves the Peak Search bin
    this.analyzerControl.specA.state.peakMarkerBin = undefined;
    this.analyzerControl.specA.state.markerIndex = (this.analyzerControl.specA.state.markerIndex + delta + numMarkers) % numMarkers;
    this.redrawIfPaused_();

    Logger.info('ACMkrBtn', 'changeMarkerIndex', `Marker index changed to ${this.analyzerControl.specA.state.markerIndex}`);
  }

  /** A paused screen repaints its frozen trace with the new marker (phase 33 D10) */
  private redrawIfPaused_(): void {
    const specA = this.analyzerControl.specA;
    if (specA.state.isPaused) {
      specA.redrawFrozen?.();
    }
  }
}
