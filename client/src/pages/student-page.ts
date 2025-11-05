import { getEl } from "@app/engine/utils/get-el";
import { qs } from "@app/engine/utils/query-selector";
import { App } from "../app";
import { html } from "../engine/utils/development/formatter";
import { syncEquipmentWithStore } from '../sync/storage';
import { BasePage } from "./base-page";
import { Body } from "./layout/body/body";
import { StudentEquipment } from './student-page/student-equipment';

/**
 * Student page implementation
 */
export class StudentPage extends BasePage {
  readonly id = 'student-page';
  static readonly containerId = 'student-page-container';
  private static instance_: StudentPage;

  private constructor() {
    super();
    this.init_()
  }

  static create(): void {
    if (StudentPage.instance_) {
      throw new Error("StudentPage instance already exists.");
    }

    StudentPage.instance_ = new StudentPage();
  }

  static getInstance(): StudentPage {
    if (!StudentPage.instance_) {
      throw new Error("StudentPage instance does not exist.");
    }

    return this.instance_;
  }

  protected html_ = html`
      <div id="${this.id}" class="student-page-container">
        <div id="${StudentPage.containerId}"></div>
      </div>
    `;

  init_(): void {
    super.init_(Body.containerId, 'add');
    const parentDom = getEl(Body.containerId);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.initEquipment_();
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }

  private initEquipment_(): void {
    App.getInstance().equipment = new StudentEquipment();

    // Sync with storage (automatically uses LocalStorage)
    syncEquipmentWithStore(App.getInstance().equipment);
  }
}