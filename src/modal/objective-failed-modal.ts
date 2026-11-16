import stopwatchPng from '@app/assets/icons/stopwatch.png';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { OpsLogModal } from '@app/ops-log/ops-log-modal';
import { ScenarioManager } from '@app/scenario-manager';
import { WorkingDocumentManager } from '@app/scenarios/working-document-manager';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { clearPersistedStore } from '@app/sync/storage';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import { DialogManager } from './dialog-manager';
import { PendingQuizIndicator } from './pending-quiz-indicator';
import { QuizModal } from './quiz-modal';
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
  private hasCheckpoint_: boolean = false;

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
    const checkpointButton = this.hasCheckpoint_ ? `<button id="restart-checkpoint-btn" class="btn btn-primary">Restart from Checkpoint</button>` : '';

    // Make Restart Scenario primary when it's the only option
    const scenarioButtonClass = this.hasCheckpoint_ ? 'btn btn-secondary' : 'btn btn-primary';

    return html`
      <div class="failure-modal">
        <div class="failure-modal__icon"><img src="${stopwatchPng}" alt="Time expired" /></div>
        <div class="failure-modal__title">${this.options_.title}</div>
        <div class="failure-modal__message">${this.options_.message}</div>

        <div class="failure-modal__actions">
          ${checkpointButton}
          <button id="restart-scenario-btn" class="${scenarioButtonClass}">
            Restart Scenario
          </button>
        </div>
      </div>
    `;
  }

  protected override onOpen(): void {
    super.onOpen();

    // Hide the close button - user must use restart options
    const closeBtn = this.boxEl?.querySelector(`#${ObjectiveFailedModal.id}-close`);
    if (closeBtn) {
      (closeBtn as HTMLElement).style.display = 'none';
    }

    this.initializeEventListeners_();
  }

  private initializeEventListeners_(): void {
    const checkpointBtn = this.boxEl?.querySelector('#restart-checkpoint-btn');
    const scenarioBtn = this.boxEl?.querySelector('#restart-scenario-btn');

    checkpointBtn?.addEventListener('click', () => this.restartFromCheckpoint_());
    scenarioBtn?.addEventListener('click', () => this.restartScenario_());
  }

  private restartFromCheckpoint_(): void {
    // Simply refresh the page - checkpoint will be loaded automatically
    window.location.reload();
  }

  private async restartScenario_(): Promise<void> {
    const scenario = ScenarioManager.getInstance();
    if (!scenario?.data) {
      console.error('No active scenario to restart');
      return;
    }

    // Clear checkpoint before refreshing. A failed delete must not trap the
    // player on the failure screen (signed out it used to throw, nats-s08-F12)
    try {
      await this.progressSaveManager_.clearCheckpoint(scenario.data.id);
    } catch (error) {
      console.error('Could not clear checkpoint; restarting anyway:', error);
    }

    // Clear local equipment and objective state so scenario starts fresh
    await clearPersistedStore();

    // Refresh the page - will start fresh since no checkpoint exists
    window.location.reload();
  }

  async showFailure(options: Partial<FailureModalOptions>): Promise<void> {
    this.options_ = {
      title: 'Objective Failed',
      message: 'Time has expired.',
      isScenarioTimeout: false,
      ...options,
    };

    // Check if checkpoint exists for current scenario
    const scenario = ScenarioManager.getInstance();
    if (scenario?.data?.id) {
      this.hasCheckpoint_ = await this.progressSaveManager_.hasCheckpoint(scenario.data.id);
    } else {
      this.hasCheckpoint_ = false;
    }

    // Close any open popups before showing failure modal
    this.closeAllPopups_();

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

  /**
   * Close all open popups when failure modal is shown
   */
  private closeAllPopups_(): void {
    // Suppress pending quiz indicator permanently
    PendingQuizIndicator.getInstance().suppress();

    // Close quiz modal if open
    QuizModal.getInstance().close();

    // Close dialog if showing
    DialogManager.getInstance().hide();

    // Draggable boxes draw above modals; close them so nothing covers the buttons
    if (SimulationManager.hasInstance()) {
      const sim = SimulationManager.getInstance();
      sim.checklistBox?.close();
      sim.missionBriefBox?.close();
    }
    WorkingDocumentManager.getInstance().close();
    // The last step is often a typed log entry; the log must not sit over the result
    OpsLogModal.closeIfOpen();
  }

  override close(): void {
    // Do nothing - modal cannot be closed by X button or background click
    // Restart actions use window.location.reload() instead
  }
}
