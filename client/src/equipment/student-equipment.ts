import { html } from '../utils';
import { SpectrumAnalyzer } from './spectrum-analyzer/spectrum-analyzer';

/**
 * StudentEquipment - Orchestrates all equipment on student page
 * Creates the layout and instantiates all equipment classes
 */
export class StudentEquipment {
  private readonly element: HTMLElement;
  private spectrumAnalyzers: SpectrumAnalyzer[] = [];

  constructor(parentId: string) {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    console.log(parentId);

    this.element = parent;
    this.render();
    this.addListeners();
    this.initEquipment();
  }

  private render(): void {
    this.element.innerHTML = html`
      <div class="student-equipment">
        <!-- Spectrum Analyzers Grid -->
        <div class="equipment-section">
          <h2>Spectrum Analyzers</h2>
          <div class="spec-a-grid">
            <div id="specA1-container" class="spec-a-container"></div>
            <div id="specA2-container" class="spec-a-container"></div>
            <div id="specA3-container" class="spec-a-container"></div>
            <div id="specA4-container" class="spec-a-container"></div>
          </div>
        </div>

        <!-- Antennas -->
        <div class="equipment-section">
          <h2>Antennas</h2>
          <div class="antenna-grid">
            <div id="antenna1-container" class="antenna-container"></div>
            <div id="antenna2-container" class="antenna-container"></div>
          </div>
        </div>

        <!-- Transmitters -->
        <div class="equipment-section">
          <h2>Transmitters</h2>
          <div class="tx-grid">
            <div id="tx1-container" class="tx-container"></div>
            <div id="tx2-container" class="tx-container"></div>
            <div id="tx3-container" class="tx-container"></div>
            <div id="tx4-container" class="tx-container"></div>
          </div>
        </div>

        <!-- Receivers -->
        <div class="equipment-section">
          <h2>Receivers</h2>
          <div class="rx-grid">
            <div id="rx1-container" class="rx-container"></div>
            <div id="rx2-container" class="rx-container"></div>
            <div id="rx3-container" class="rx-container"></div>
            <div id="rx4-container" class="rx-container"></div>
          </div>
        </div>
      </div>
    `;
  }

  private addListeners(): void {
    // Add any equipment-level listeners here
  }

  private initEquipment(): void {
    // Initialize 4 spectrum analyzers
    for (let i = 1; i <= 4; i++) {
      const antennaId = i <= 2 ? 1 : 2; // First two specA use antenna 1, next two use antenna 2
      const specA = new SpectrumAnalyzer(`specA${i}-container`, i, 1, antennaId);
      this.spectrumAnalyzers.push(specA);
    }

    // TODO: Initialize antennas, transmitters, receivers
    // const antenna1 = new Antenna('antenna1-container', 1);
    // const tx1 = new TxCase('tx1-container', 1);
    // const rx1 = new RxCase('rx1-container', 1);
  }

  /**
   * Update all equipment with new data from server/simulation
   */
  public updateEquipment(data: {
    signals?: any[];
    target_id?: number;
    locked?: boolean;
    operational?: boolean;
  }): void {
    // Update all spectrum analyzers with new signal data
    this.spectrumAnalyzers.forEach(specA => {
      specA.update(data);
    });
  }

  /**
   * Get configuration from all equipment
   */
  public getAllConfigs(): any {
    return {
      spectrumAnalyzers: this.spectrumAnalyzers.map(sa => sa.getConfig()),
      // Add other equipment configs here
    };
  }
}