import { html } from '../utils';
import { Antenna } from './antenna/antenna';
import { Receiver } from './receiver/receiver';
import { SpectrumAnalyzer } from './spectrum-analyzer/spectrum-analyzer';
import './student-equipment.css';
import { Transmitter } from './transmitter/transmitter';

/**
 * StudentEquipment - Orchestrates all equipment on student page
 * Creates the layout and instantiates all equipment classes
 */
export class StudentEquipment {
  private readonly element: HTMLElement;
  readonly spectrumAnalyzers: SpectrumAnalyzer[] = [];
  readonly antennas: Antenna[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];

  readonly isFullEquipmentSuite: boolean = false;

  constructor(parentId: string) {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    this.element = parent;
    this.render();
    this.addListeners();
    this.initEquipment();
    this.gameLoop();

    (globalThis as any).equipment = this; // For debugging
  }

  gameLoop(): void {
    requestAnimationFrame(() => this.gameLoop());
    this.updateEquipment();
    this.spectrumAnalyzers.forEach(specA => {
      specA.screen?.draw();
    });
  }

  render(): void {
    this.element.innerHTML = html`
      <div class="student-equipment">
        <!-- Antennas -->
          <div id="antenna-spec-a-grid1" class="antenna-spec-a-grid">
            <div id="antenna1-container" class="antenna-container"></div>
            <div id="specA1-container" class="spec-a-container"></div>
            <div id="specA2-container" class="spec-a-container"></div>
          </div>

        <!-- Spectrum Analyzers Grid -->
          <div id="antenna-spec-a-grid2" class="antenna-spec-a-grid">
            <div id="antenna2-container" class="antenna-container"></div>
            <div id="specA3-container" class="spec-a-container"></div>
            <div id="specA4-container" class="spec-a-container"></div>
          </div>

        <!-- Transmitters -->
          <div class="tx-grid">
            <div id="tx1-container" class="tx-container"></div>
            <div id="tx2-container" class="tx-container"></div>
            <div id="tx3-container" class="tx-container"></div>
            <div id="tx4-container" class="tx-container"></div>
          </div>

        <!-- Receivers -->
          <div class="rx-grid">
            <div id="rx1-container" class="rx-container"></div>
            <div id="rx2-container" class="rx-container"></div>
            <div id="rx3-container" class="rx-container"></div>
            <div id="rx4-container" class="rx-container"></div>
          </div>
      </div>
    `;
  }

  private addListeners(): void {
    // Add any equipment-level listeners here
    // Could listen to global events and coordinate between equipment
  }

  private initEquipment(): void {

    // Initialize 2 antennas
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 2 : 1); i++) {
      const antenna = new Antenna(`antenna${i}-container`, i, 1, 1);
      antenna.sync({
        offset: 1310,
      })
      this.antennas.push(antenna);
    }

    if (!this.isFullEquipmentSuite) {
      // Hide the second antenna container if not full suite
      const antenna2Container = document.getElementById('antenna-spec-a-grid2');
      if (antenna2Container) {
        antenna2Container.style.display = 'none';
      }
    }

    // Initialize 4 spectrum analyzers
    // First two use antenna 1, next two use antenna 2
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const antennaId = i <= 2 ? 1 : 2;
      const specA = new SpectrumAnalyzer(`specA${i}-container`, i, 1, this.antennas[antennaId - 1]);
      this.spectrumAnalyzers.push(specA);
    }

    // Initialize 4 transmitter cases (each with 4 modems)
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const tx = new Transmitter(`tx${i}-container`, i, 1, 1);
      this.transmitters.push(tx);
    }

    // Initialize 4 receiver cases (each with 4 modems)
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const rx = new Receiver(`rx${i}-container`, i, this.antennas, 1, 1);
      this.receivers.push(rx);
    }
  }

  /**
   * Update all equipment with new data from server/simulation
   */
  public updateEquipment(): void {
    // Update spectrum analyzers with signal data
    this.spectrumAnalyzers.forEach(specA => {
      specA.update();
    });

    // Update antennas
    this.antennas.forEach((antenna) => {
      antenna.update();
    });

    // Update transmitters
    this.transmitters.forEach((tx) => {
      tx.update();
    });

    // Update receivers
    this.receivers.forEach((rx) => {
      rx.update();
    });
  }

  /**
   * Get configuration from all equipment
   */
  public getAllConfigs(): any {
    return {
      spectrumAnalyzers: this.spectrumAnalyzers.map(sa => sa.getConfig()),
      antennas: this.antennas.map(a => a.getConfig()),
      transmitters: this.transmitters.map(tx => tx.getConfig()),
      receivers: this.receivers.map(rx => rx.getConfig())
    };
  }
}