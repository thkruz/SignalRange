import { html } from '../utils';
import { StudentEquipment } from '../equipment/StudentEquipment';

/**
 * Student Page
 */
export class Student {
  private element: HTMLElement;
  private equipment: StudentEquipment | null = null;

  constructor(parentId: string) {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    this.element = parent;

    this.render();
    this.addListeners();
    this.initEquipment();
  }

  private render(): void {
    this.element.innerHTML = html`
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

  private addListeners(): void {
    // Add page-level listeners
  }

  private initEquipment(): void {
    this.equipment = new StudentEquipment('student-equipment-container');
  }

  public destroy(): void {
    if (this.equipment) {
      this.equipment.destroy();
    }
  }
}