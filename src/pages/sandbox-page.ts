import { getEl } from "@app/engine/utils/get-el";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Logger } from "@app/logging/logger";
import { NavigationOptions } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { ScenarioDialogManager } from "@app/scenarios/scenario-dialog-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";
import { AppState, syncManager } from "@app/sync/storage";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { html } from "../engine/utils/development/formatter";
import { clearPersistedStore, syncEquipmentWithStore } from '../sync/storage';
import { BasePage } from "./base-page";
import { Body } from "./layout/body/body";
import { Equipment } from './sandbox/equipment';

/**
 * Student page implementation
 */
export class SandboxPage extends BasePage {
  readonly id = 'sandbox-page';
  static readonly containerId = 'sandbox-page-container';
  private static instance_: SandboxPage | null = null;

  private constructor(options?: NavigationOptions) {
    super();
    this.navigationOptions_ = options || {};
    this.init_()
  }

  static create(options?: NavigationOptions): SandboxPage {
    if (this.instance_) {
      throw new Error("SandboxPage instance already exists.");
    }

    this.instance_ = new SandboxPage(options);
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
      const existing = qs(`#${this.id}`, parentDom);

      if (existing) {
        existing.remove();
      }
    } catch {
      // Ignore errors
    }


    super.init_(Body.containerId, 'add');
    this.dom_ = qs(`#${this.id}`, parentDom);

    // Initialize progress save manager
    this.initProgressSaveManager_();

    // Initialize equipment and objectives asynchronously
    this.initializeAsync_();
  }

  /**
   * Handle async initialization of equipment and objectives
   */
  private async initializeAsync_(): Promise<void> {
    await this.initEquipment_();
    await this.initializeObjectivesAndDialogs_();
  }

  protected addEventListeners_(): void {
    // No event listeners for now
  }

  private async initEquipment_(): Promise<void> {
    const simManager = SimulationManager.getInstance();
    const scenario = ScenarioManager.getInstance();

    simManager.equipment = new Equipment(scenario.settings);

    if (scenario.settings.isSync) {
      // Only load checkpoint if explicitly continuing from checkpoint
      if (this.navigationOptions_.continueFromCheckpoint) {
        await this.loadCheckpointIfExists_();
      } else {
        // Starting fresh - clear any stale local storage
        await this.clearLocalStorage_();
      }

      // Sync from storage (automatically uses LocalStorage)
      syncEquipmentWithStore(simManager.equipment, simManager.groundStations);
    }
  }

  /**
   * Load checkpoint from backend if it exists for the current scenario
   */
  private async loadCheckpointIfExists_(): Promise<void> {
    if (!this.progressSaveManager_) {
      return;
    }

    try {
      const scenario = ScenarioManager.getInstance();
      const checkpoint = await this.progressSaveManager_.loadCheckpoint(scenario.data.id) as {
        state: AppState;
      }

      if (checkpoint) {
        Logger.info(`Loading checkpoint for scenario: ${scenario.data.id}`);

        // Restore state to sync manager so it will be synced to equipment
        if (checkpoint.state) {
          const simManager = SimulationManager.getInstance();
          syncManager.setEquipment(simManager.equipment);

          // Manually sync the checkpoint state to equipment
          // We need to access the private syncFromStorage method, so we'll use the provider
          await syncManager['provider'].write(checkpoint.state);

          simManager.equipment = { ...simManager.equipment, ...checkpoint.state.equipment } as Equipment;

          SimulationManager.getInstance().sync();
          Logger.info('Checkpoint loaded successfully');
        }
      }
    } catch (error) {
      Logger.error('Failed to load checkpoint:', error);
      // Continue with normal initialization even if checkpoint load fails
    }
  }

  /**
   * Clear local storage for the current scenario when starting fresh
   */
  private async clearLocalStorage_(): Promise<void> {
    try {
      // Clear the local storage
      await clearPersistedStore();

      Logger.info('Local storage cleared for fresh start');
    } catch (error) {
      Logger.error('Failed to clear local storage:', error);
      // Continue with normal initialization even if clear fails
    }
  }

  hide(): void {
    SandboxPage.destroy();
    // Set display to none
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  static destroy(): void {
    // Clean up progress save manager
    SandboxPage.instance_?.disposeProgressSaveManager_();

    SandboxPage.instance_ = null;
    SimulationManager.destroy();
    ObjectivesManager.destroy();
    ScenarioDialogManager.reset();
    EventBus.destroy();
    const container = getEl(SandboxPage.containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
}