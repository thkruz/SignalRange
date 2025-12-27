import { html } from '@app/engine/utils/development/formatter';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { ScenarioManager } from '@app/scenario-manager';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import { DialogManager } from './dialog-manager';
import { PendingQuizIndicator } from './pending-quiz-indicator';
import { QuizModal } from './quiz-modal';
import stopwatchPng from '../assets/icons/stopwatch.png';
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
        <div class="failure-modal__icon"><img src="${stopwatchPng}" alt="Time expired" /></div>
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

    // Clear checkpoint before refreshing
    await this.progressSaveManager_.clearCheckpoint(scenario.data.id);

    // Refresh the page - will start fresh since no checkpoint exists
    window.location.reload();
  }

  showFailure(options: Partial<FailureModalOptions>): void {
    this.options_ = {
      title: 'Objective Failed',
      message: 'Time has expired.',
      isScenarioTimeout: false,
      ...options,
    };

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
  }

  override close(): void {
    // Do nothing - modal cannot be closed by X button or background click
    // Restart actions use window.location.reload() instead
  }
}
