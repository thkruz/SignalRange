import { html } from "../engine/ui/utils/development/formatter";
import { StudentEquipment } from '../equipment/student-equipment';
import { syncEquipmentWithStore } from '../sync/storage';
import { AbstractPage } from './abstract-page';

/**
 * Student page implementation
 */
export class StudentPage extends AbstractPage {
  equipment: StudentEquipment | undefined;

  constructor() {
    super('student-page');
  }

  init(): void {
    super.init();
    this.initEquipment();
  }

  initializeDom(): HTMLElement {
    this.container.innerHTML = html`
      <div class="student-page-container">
        <!-- Team Info Bar -->
        <!-- <div class="team-info">
          <div class="team-name">Team: Persephone</div>
          <div class="server-name">Server: Server 1</div>
        </div> -->

        <!-- Equipment Container -->
        <div id="student-equipment-container"></div>
      </div>
    `;

    return this.container;
  }

  private async initEquipment(): Promise<void> {
    this.equipment = new StudentEquipment('student-equipment-container');

    // Sync with storage (automatically uses LocalStorage)
    await syncEquipmentWithStore(this.equipment);

    for (const spectrumAnalyzer of this.equipment.spectrumAnalyzers) {
      spectrumAnalyzer.syncDomWithState();
    }
    for (const receiver of this.equipment.receivers) {
      receiver.syncDomWithState();
    }
    for (const transmitter of this.equipment.transmitters) {
      transmitter.syncDomWithState();
    }

    console.log(this.equipment.getAllConfigs());
  }
}