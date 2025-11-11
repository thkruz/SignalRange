import { App } from "@app/app";
import { getEl } from "@app/engine/utils/get-el";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
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

  static create(): SandboxPage {
    if (this.instance_) {
      throw new Error("SandboxPage instance already exists.");
    }

    this.instance_ = new SandboxPage();
    return this.instance_;
  }

  static getInstance(): SandboxPage | null {
    return this.instance_;
  }

  protected html_ = html`
      <div id="${this.id}" class="sandbox-page-container">
        <div id="${SandboxPage.containerId}"></div>
      </div>
    `;

  init_(): void {
    const parentDom = document.getElementById(Body.containerId);

    try {
      // Remove any childe nodes named this.id to avoid duplicates
      const existing = qs(`#${this.id}`, parentDom!);

      if (existing) {
        existing.remove();
      }
    } catch {
      // Ignore errors
    }


    super.init_(Body.containerId, 'add');
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.initEquipment_();
    SimulationManager.getInstance();
    EventBus.getInstance().emit(Events.DOM_READY);
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }

  private initEquipment_(): void {
    App.getInstance().equipment = new StudentEquipment();

    // Sync with storage (automatically uses LocalStorage)
    syncEquipmentWithStore(App.getInstance().equipment);
  }

  hide(): void {
    SandboxPage.destroy();
  }

  static destroy(): void {
    SandboxPage.instance_ = null;
    SimulationManager.destroy();
    EventBus.destroy();
    const container = getEl(SandboxPage.containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
}