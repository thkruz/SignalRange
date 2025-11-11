import { App } from "@app/app";
import { getEl } from "@app/engine/utils/get-el";
import { qs } from "@app/engine/utils/query-selector";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { html } from "../engine/utils/development/formatter";
import { syncEquipmentWithStore } from '../sync/storage';
import { BasePage } from "./base-page";
import { Body } from "./layout/body/body";
import { StudentEquipment } from './student-page/student-equipment';

/**
 * Student page implementation
 */
export class SandboxPage extends BasePage {
  readonly id = 'sandbox-page';
  static readonly containerId = 'sandbox-page-container';
  private static instance_: SandboxPage | null = null;

  private constructor() {
    super();
    this.init_()
  }

  static create(): void {
    if (SandboxPage.instance_) {
      throw new Error("SandboxPage instance already exists.");
    }

    SandboxPage.instance_ = new SandboxPage();
  }

  static getInstance(): SandboxPage | null {
    if (!SandboxPage.instance_) {
      return null;
    }

    return this.instance_;
  }

  protected html_ = html`
      <div id="${this.id}" class="sandbox-page-container">
        <div id="${SandboxPage.containerId}"></div>
      </div>
    `;

  init_(): void {
    super.init_(Body.containerId, 'add');
    const parentDom = getEl(Body.containerId);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.initEquipment_();
    SimulationManager.getInstance();
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }

  private initEquipment_(): void {
    App.getInstance().equipment = new StudentEquipment();

    // Sync with storage (automatically uses LocalStorage)
    syncEquipmentWithStore(App.getInstance().equipment);
  }

  static destroy(): void {
    SandboxPage.instance_ = null;
  }
}