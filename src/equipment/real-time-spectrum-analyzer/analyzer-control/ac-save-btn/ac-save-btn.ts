import { getEl } from "@app/engine/utils/get-el";
import { AnalyzerControl } from "../../analyzer-control";
import { BaseControlButton } from "../base-control-button";
import './ac-save-btn.css';

export class ACSaveBtn extends BaseControlButton {
  private static instance_: ACSaveBtn;
  private readonly analyzerControl: AnalyzerControl;

  private constructor(analyzerControl: AnalyzerControl) {
    super({
      uniqueId: `ac-save-btn-${analyzerControl.specA.state.uuid}`,
      label: 'Save',
      ariaLabel: 'Save',
    });
    if (analyzerControl) {
      this.analyzerControl = analyzerControl;
    }
  }

  static create(analyzerControl: AnalyzerControl): ACSaveBtn {
    this.instance_ = new ACSaveBtn(analyzerControl);
    return this.instance_;
  }

  static getInstance(): ACSaveBtn {
    return this.instance_;
  }

  protected handleClick_(): void {
    const currentMode = this.analyzerControl.specA.state.screenMode;

    switch (currentMode) {
      case 'spectralDensity':
        this.saveSpectralDensity();
        break;
      case 'waterfall':
        this.saveWaterfall();
        break;
      case 'both':
        this.saveCombined();
        break;
      default:
        console.warn(`Unknown screen mode: ${currentMode}`);
    }
  }

  private saveSpectralDensity(): void {
    // Save the spectral density canvas as an image
    const canvas = getEl(this.analyzerControl.specA.spectralDensity.canvas.id) as HTMLCanvasElement;
    const link = document.createElement('a');
    link.download = 'spectrum-analyzer-spectral-density.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  private saveWaterfall(): void {
    // Save the waterfall canvas as an image
    const canvas = getEl(this.analyzerControl.specA.waterfall.canvas.id) as HTMLCanvasElement;
    const link = document.createElement('a');
    link.download = 'spectrum-analyzer-waterfall.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  private saveCombined(): void {
    // Save the combined canvas as an image
    const canvas1 = getEl(this.analyzerControl.specA.spectralDensityBoth.canvas.id) as HTMLCanvasElement;
    const canvas2 = getEl(this.analyzerControl.specA.waterfallBoth.canvas.id) as HTMLCanvasElement;
    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = canvas1.width;
    combinedCanvas.height = canvas1.height + canvas2.height;
    const combinedCtx = combinedCanvas.getContext('2d');
    if (combinedCtx) {
      combinedCtx.drawImage(canvas1, 0, 0);
      combinedCtx.drawImage(canvas2, 0, canvas1.height);
      const combinedLink = document.createElement('a');
      combinedLink.download = 'spectrum-analyzer-combined.png';
      combinedLink.href = combinedCanvas.toDataURL('image/png');
      combinedLink.click();
    }
  }
}
