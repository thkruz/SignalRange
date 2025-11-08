import { BaseElement } from "@app/components/base-element";
import { RFFrontEnd } from "@app/equipment/rf-front-end/rf-front-end";
import { StudentPage } from "@app/pages/student-page";
import { html } from "../../engine/utils/development/formatter";
import { Antenna } from '../../equipment/antenna/antenna';
import { RealTimeSpectrumAnalyzer } from '../../equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { Receiver } from '../../equipment/receiver/receiver';
import { Transmitter } from '../../equipment/transmitter/transmitter';
import './student-equipment.css';

/**
 * StudentEquipment - Orchestrates all equipment on student page
 * Creates the layout and instantiates all equipment classes
 */
export class StudentEquipment extends BaseElement {
  /** Debug flag for full equipment suite */
  readonly isFullEquipmentSuite: boolean = false;

  readonly spectrumAnalyzers: RealTimeSpectrumAnalyzer[] = [];
  readonly antennas: Antenna[] = [];
  readonly rfFrontEnds: RFFrontEnd[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];

  protected html_ = html`
      <div class="student-equipment">
        <!-- Antennas, Front Ends, and Spec Analyzers Grid -->
          <div id="antenna-spec-a-grid1" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="antenna1-container" class="antenna-container"></div>
              <div id="antenna2-container" class="antenna-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end1-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end2-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="specA1-container" class="spec-a-container"></div>
              <div id="specA2-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Spectrum Analyzers Grid -->
          <div id="antenna-spec-a-grid2" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="specA3-container" class="spec-a-container"></div>
              <div id="specA4-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Transmitters -->
          <div class="tx-grid">
            <div class="paired-equipment-container">
              <div id="tx1-container" class="tx-container"></div>
              <div id="tx2-container" class="tx-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="tx3-container" class="tx-container"></div>
              <div id="tx4-container" class="tx-container"></div>
            </div>
          </div>

        <!-- Receivers -->
          <div class="rx-grid">
            <div class="paired-equipment-container">
              <div id="rx1-container" class="rx-container"></div>
              <div id="rx2-container" class="rx-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rx3-container" class="rx-container"></div>
              <div id="rx4-container" class="rx-container"></div>
            </div>
          </div>
      </div>
    `;

  constructor() {
    super();
    this.init_(StudentPage.containerId, 'replace');
    this.initEquipment_();
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }

  private initEquipment_(): void {

    // Initialize 2 antennas
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 2 : 1); i++) {
      const antenna = new Antenna(`antenna${i}-container`);
      this.antennas.push(antenna);

      const rfFrontEnd = new RFFrontEnd(`rf-front-end${i}-container`, i, 1);
      this.rfFrontEnds.push(rfFrontEnd);
      rfFrontEnd.connectAntenna(antenna);
      antenna.attachRfFrontEnd(rfFrontEnd);
    }

    // Initialize 4 spectrum analyzers
    // First two use antenna 1, next two use antenna 2
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const antennaId = i <= 2 ? 1 : 2;
      const specA = new RealTimeSpectrumAnalyzer(`specA${i}-container`, this.rfFrontEnds[antennaId - 1]);
      this.spectrumAnalyzers.push(specA);
    }

    if (!this.isFullEquipmentSuite) {
      // Hide the second antenna container if not full suite
      const antenna2Container = document.getElementById('antenna-spec-a-grid2');
      if (antenna2Container) {
        antenna2Container.style.display = 'none';
      }

      const rfFrontEnd2Container = document.getElementById('rf-fe-box-2');
      if (rfFrontEnd2Container) {
        rfFrontEnd2Container.style.display = 'none';
      }
    }

    // Initialize 4 transmitter cases (each with 4 modems)
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const tx = new Transmitter(`tx${i}-container`);
      this.transmitters.push(tx);

      if (i <= 2) {
        this.rfFrontEnds[0].connectTransmitter(tx);
      } else {
        this.rfFrontEnds[1].connectTransmitter(tx);
      }
    }

    // Add all transmitters to all antennas
    this.antennas.forEach((antenna) => {
      this.transmitters.forEach((tx) => {
        antenna.transmitters.push(tx);
      });
    });

    // Initialize 4 receiver cases (each with 4 modems)
    for (let i = 1; i <= (this.isFullEquipmentSuite ? 4 : 2); i++) {
      const rx = new Receiver(`rx${i}-container`, this.antennas);
      this.receivers.push(rx);

      if (i <= 2) {
        rx.connectRfFrontEnd(this.rfFrontEnds[0]);
      } else {
        rx.connectRfFrontEnd(this.rfFrontEnds[1]);
      }
    }
  }
}