import { DraggableBox } from "../../engine/ui/draggable-box";
import { html } from "../../engine/utils/development/formatter";
import { getEl } from "../../engine/utils/get-el";
import { AnalyzerControl } from "./analyzer-control";
import { RealTimeSpectrumAnalyzer } from "./real-time-spectrum-analyzer";

export class AnalyzerControlBox extends DraggableBox {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private popupDom: HTMLElement | null = null;
  private control: AnalyzerControl | null = null;

  constructor(specA: RealTimeSpectrumAnalyzer) {
    super(`spec-a-${specA.state.id}-control-popup-box`, { title: `Spectrum Analyzer ${specA.state.id} Control Panel`, width: 'fit-content' });
    this.spectrumAnalyzer = specA;
  }

  protected getBoxContentHtml(): string {
    return html`
      <div id="spec-a-${this.spectrumAnalyzer.state.id}-control-popup-content">
      </div>
    `.trim();
  }

  protected onOpen(): void {
    super.onOpen();

    this.popupDom = getEl(`spec-a-${this.spectrumAnalyzer.state.id}-control-popup-content`)!;

    this.control ??= new AnalyzerControl({
      element: this.popupDom,
      spectrumAnalyzer: this.spectrumAnalyzer,
    });

    this.control.init_(this.popupDom.id, 'replace');
  }

  close(cb?: () => void): void {
    super.close(cb);
  }
}
