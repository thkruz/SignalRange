import { StudentEquipment } from '../equipment/student-equipment';
import { html } from '../utils';
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
    // Initialize the page
    this.render();
    this.setupEventListeners();
    this.initEquipment();
  }

  render(): void {
    if (!this.container) return;

    this.container.innerHTML = html`
      <div class="student-page-container">
        <!-- Team Info Bar -->
        <div class="team-info">
          <div class="team-name">Team: Persephone</div>
          <div class="server-name">Server: Server 1</div>
        </div>

        <!-- Equipment Container -->
        <div id="student-equipment-container"></div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Add event listeners specific to the student page here
  }

  private initEquipment(): void {
    this.equipment = new StudentEquipment('student-equipment-container');
  }
}