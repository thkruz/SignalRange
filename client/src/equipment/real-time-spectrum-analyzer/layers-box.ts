import { DraggableBox } from "../../engine/ui/draggable-box";
import { html } from "../../engine/ui/utils/development/formatter";
import { getEl } from "../../engine/ui/utils/get-el";
import { AnalyzerControl } from "./analyzer-control";
import { RealTimeSpectrumAnalyzer } from "./real-time-spectrum-analyzer";

export class AnalyzerControlBox extends DraggableBox {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private popupDom: HTMLElement | null = null;

  constructor(specA: RealTimeSpectrumAnalyzer) {
    super(`spec-a-${specA.state.unit}-control-popup-box`, { title: `Spectrum Analyzer ${specA.state.unit} Control Panel`, width: 'fit-content' });
    this.spectrumAnalyzer = specA;
  }

  protected getBoxContentHtml(): string {
    return html`
      <div id="spec-a-${this.spectrumAnalyzer.state.unit}-control-popup-content">
      </div>
    `.trim();
  }

  protected onOpen(): void {
    super.onOpen();

    this.popupDom = getEl(`spec-a-${this.spectrumAnalyzer.state.unit}-control-popup-content`)!;

    const control = new AnalyzerControl({
      element: this.popupDom,
      spectrumAnalyzer: this.spectrumAnalyzer,
    });

    control.init();
  }

  close(cb?: () => void): void {
    super.close(cb);
  }
}
