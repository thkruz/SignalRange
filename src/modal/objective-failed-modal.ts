import { html } from '@app/engine/utils/development/formatter';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import './objective-failed-modal.css';

interface FailureModalOptions {
  title: string;
  message: string;
  objectiveId?: string;
  isScenarioTimeout: boolean;
}

export class ObjectiveFailedModal extends DraggableModal {
  private static readonly id = 'objective-failed-modal';
  private static instance_: ObjectiveFailedModal | null = null;

  private options_: FailureModalOptions = {
    title: 'Objective Failed',
    message: 'Time has expired.',
    isScenarioTimeout: false,
  };
  private progressSaveManager_: ProgressSaveManager;

  private constructor() {
    if (ObjectiveFailedModal.instance_) {
      throw new Error('Use getInstance() instead of new.');
    }

    super(ObjectiveFailedModal.id, {
      title: 'Mission Failed',
      width: '450px',
    });

    this.progressSaveManager_ = new ProgressSaveManager();
  }

  static getInstance(): ObjectiveFailedModal {
    ObjectiveFailedModal.instance_ ??= new ObjectiveFailedModal();
    return ObjectiveFailedModal.instance_;
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="failure-modal">
        <div class="failure-modal__icon">&#9201;</div>
        <div class="failure-modal__title">${this.options_.title}</div>
        <div class="failure-modal__message">${this.options_.message}</div>

        <div class="failure-modal__actions">
          <button id="restart-checkpoint-btn" class="btn btn-primary">
            Restart from Checkpoint
          </button>
          <button id="restart-scenario-btn" class="btn btn-secondary">
            Restart Scenario
          </button>
        </div>
      </div>
    `;
  }

  protected override onOpen(): void {
    super.onOpen();
    this.initializeEventListeners_();
  }

  private initializeEventListeners_(): void {
    const checkpointBtn = this.boxEl?.querySelector('#restart-checkpoint-btn');
    const scenarioBtn = this.boxEl?.querySelector('#restart-scenario-btn');

    checkpointBtn?.addEventListener('click', () => this.restartFromCheckpoint_());
    scenarioBtn?.addEventListener('click', () => this.restartScenario_());
  }

  private async restartFromCheckpoint_(): Promise<void> {
    const scenario = ScenarioManager.getInstance();
    if (!scenario?.data) {
      console.error('No active scenario to restart');
      this.close();
      return;
    }

    const hasCheckpoint = await this.progressSaveManager_.hasCheckpoint(scenario.data.id);

    if (hasCheckpoint) {
      // Navigate with continueFromCheckpoint flag
      Router.getInstance().navigate(scenario.data.url, { continueFromCheckpoint: true });
    } else {
      // No checkpoint, restart scenario instead
      await this.restartScenario_();
    }
    this.close();
  }

  private async restartScenario_(): Promise<void> {
    const scenario = ScenarioManager.getInstance();
    if (!scenario?.data) {
      console.error('No active scenario to restart');
      this.close();
      return;
    }

    // Clear checkpoint before restarting
    await this.progressSaveManager_.clearCheckpoint(scenario.data.id);

    // Navigate to scenario URL (fresh start)
    Router.getInstance().navigate(scenario.data.url);
    this.close();
  }

  showFailure(options: Partial<FailureModalOptions>): void {
    this.options_ = {
      title: 'Objective Failed',
      message: 'Time has expired.',
      isScenarioTimeout: false,
      ...options,
    };

    // Update the modal title based on whether it's scenario or objective failure
    if (options.isScenarioTimeout) {
      this.title = 'Mission Failed';
    } else {
      this.title = 'Objective Failed';
    }

    // Force regeneration of modal content with new options
    if (this.boxEl) {
      const contentEl = this.boxEl.querySelector('.draggable-box__content');
      if (contentEl) {
        contentEl.innerHTML = this.getModalContentHtml();
        this.initializeEventListeners_();
      }
    }

    this.open();
  }

  override close(): void {
    super.close();
  }
}
