/**
 * @file OpsLogModal - Displays operations log in a draggable modal
 */

import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { getEl } from '@app/engine/utils/get-el';
import { EventBus } from '@app/events/event-bus';
import { Events, SimulatedTimeTickData } from '@app/events/events';
import { OpsLogManager } from './ops-log-manager';
import { OpsLogEntry } from './ops-log-types';
import './ops-log-modal.css';

export class OpsLogModal extends DraggableModal {
  private static readonly id = 'ops-log-modal';
  private static instance_: OpsLogModal | null = null;

  private readonly boundEntryAddedHandler_: (entry: OpsLogEntry) => void;
  private readonly boundTimeTickHandler_: (data: SimulatedTimeTickData) => void;

  private constructor() {
    super(OpsLogModal.id, {
      title: 'Operations Log',
      width: '550px',
    });

    this.boundEntryAddedHandler_ = this.handleEntryAdded_.bind(this);
    this.boundTimeTickHandler_ = this.handleTimeTick_.bind(this);
    EventBus.getInstance().on(Events.OPS_LOG_ENTRY_ADDED, this.boundEntryAddedHandler_);
    EventBus.getInstance().on(Events.SIMULATED_TIME_TICK, this.boundTimeTickHandler_);
  }

  static getInstance(): OpsLogModal {
    OpsLogModal.instance_ ??= new OpsLogModal();
    return OpsLogModal.instance_;
  }

  static destroy(): void {
    if (OpsLogModal.instance_) {
      EventBus.getInstance().off(
        Events.OPS_LOG_ENTRY_ADDED,
        OpsLogModal.instance_.boundEntryAddedHandler_
      );
      EventBus.getInstance().off(
        Events.SIMULATED_TIME_TICK,
        OpsLogModal.instance_.boundTimeTickHandler_
      );
      OpsLogModal.instance_.close();
      OpsLogModal.instance_ = null;
    }
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="ops-log-content">
        <div class="ops-log-header">
          <span class="ops-log-clock" id="ops-log-clock">--:--:--</span>
          <span class="ops-log-title">Station Operations Log</span>
        </div>
        <div class="ops-log-entries" id="ops-log-entries">
          <!-- Log entries rendered here -->
        </div>
        <div class="ops-log-input-row">
          <input type="text"
                 id="ops-log-manual-input"
                 class="form-control form-control-sm"
                 placeholder="Add log entry..." />
          <button id="ops-log-submit-btn" class="btn btn-sm btn-primary">Log</button>
        </div>
      </div>
    `;
  }

  override open(cb?: () => void): void {
    super.open(() => {
      this.renderEntries_();
      this.updateClock_();
      this.setupInputHandlers_();
      if (cb) cb();
    });
  }

  /**
   * Set up event handlers for manual log entry input
   */
  private setupInputHandlers_(): void {
    const input = getEl('ops-log-manual-input') as HTMLInputElement | null;
    const submitBtn = getEl('ops-log-submit-btn');

    if (input) {
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitManualEntry_();
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitManualEntry_());
    }
  }

  /**
   * Submit a manual log entry from user input
   */
  private submitManualEntry_(): void {
    const input = getEl('ops-log-manual-input') as HTMLInputElement | null;
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    try {
      OpsLogManager.getInstance().log(message, 'action');
      input.value = '';
      input.focus();
    } catch {
      // OpsLogManager not initialized
    }
  }

  private renderEntries_(): void {
    const container = getEl('ops-log-entries');
    if (!container) return;

    try {
      const manager = OpsLogManager.getInstance();
      const entries = manager.getEntries();

      if (entries.length === 0) {
        container.innerHTML = '<p class="ops-log-empty">No log entries yet.</p>';
        return;
      }

      // Render entries newest-first
      container.innerHTML = [...entries]
        .reverse()
        .map(entry => this.renderEntry_(entry))
        .join('');
    } catch {
      container.innerHTML = '<p class="ops-log-empty">Operations log not available.</p>';
    }
  }

  private renderEntry_(entry: OpsLogEntry): string {
    const categoryClass = entry.category ? `ops-log-entry--${entry.category}` : '';
    const sourceHtml = entry.source ? html`<span class="ops-log-source">[${entry.source}]</span>` : '';

    return html`
      <div class="ops-log-entry ${categoryClass}">
        <span class="ops-log-timestamp">${entry.timestamp}</span>
        <span class="ops-log-message">${entry.message}</span>
        ${sourceHtml}
      </div>
    `;
  }

  private updateClock_(): void {
    const clockEl = getEl('ops-log-clock');
    if (!clockEl) return;

    try {
      const manager = OpsLogManager.getInstance();
      clockEl.textContent = manager.getCurrentTimeFormatted();
    } catch {
      clockEl.textContent = '--:--:--';
    }
  }

  private handleEntryAdded_(_entry: OpsLogEntry): void {
    // Re-render entries if modal is open
    if (this.boxEl && this.boxEl.style.display !== 'none') {
      this.renderEntries_();
      this.updateClock_();
    }
  }

  private handleTimeTick_(_data: SimulatedTimeTickData): void {
    // Update clock display if modal is open
    if (this.boxEl && this.boxEl.style.display !== 'none') {
      this.updateClock_();
    }
  }
}
