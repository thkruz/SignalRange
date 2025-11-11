import { DraggableBox } from "../../engine/ui/draggable-box";
import { html } from "../../engine/utils/development/formatter";
import { getEl } from "../../engine/utils/get-el";
import { AnalyzerControl } from "./analyzer-control";
import { RealTimeSpectrumAnalyzer } from "./real-time-spectrum-analyzer";

export class AnalyzerControlBox extends DraggableBox {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly popupDom: HTMLElement;
  private readonly control: AnalyzerControl;

  constructor(specA: RealTimeSpectrumAnalyzer) {
    super(`spec-a-${specA.state.uuid}-control-popup-box`,
      {
        title: `Spectrum Analyzer ${specA.state.uuid.split('-')[0]} Control Panel`,
        width: 'fit-content',
        boxContentHtml: html`
      <div id="spec-a-${specA.state.uuid}-control-popup-content">
      </div>
    `.trim()
      });

    this.spectrumAnalyzer = specA;
    this.popupDom = getEl(`spec-a-${this.spectrumAnalyzer.state.uuid}-control-popup-content`)!;
    this.control = new AnalyzerControl({
      element: this.popupDom,
      spectrumAnalyzer: this.spectrumAnalyzer,
    });

    this.control.init_(this.popupDom.id, 'replace');
    this.onOpen();
    this.close();
  }

  protected getBoxContentHtml(): string {
    return ''; // Not used
  }

  protected onOpen(): void {
    super.onOpen();
  }

  close(cb?: () => void): void {
    super.close(cb);
  }
}
