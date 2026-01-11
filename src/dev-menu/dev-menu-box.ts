/**
 * @file DevMenuBox - Developer menu for testing and debugging
 * @description Draggable box providing dev tools: auto-skip dialogs, complete objective, set timer
 */

import { DraggableBox } from '@engine/ui/draggable-box';
import { html } from '@engine/utils/development/formatter';
import { getEl, showEl } from '@engine/utils/get-el';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { ScenarioSelectionPage } from '@app/pages/scenario-selection';
import './dev-menu.css';

declare global {
  interface Window {
    AUTO_CLOSE_DIALOGS?: boolean;
    UNLOCK_ALL_SCENARIOS?: boolean;
  }
}

/**
 * Singleton draggable box for developer menu
 */
export class DevMenuBox extends DraggableBox {
  private static instance_: DevMenuBox | null = null;
  private domCreated_: boolean = false;
  private domCache_: Map<string, HTMLElement> = new Map();

  private constructor() {
    super('dev-menu-box', { width: '300px', title: 'Developer Menu', skipDomCreation: true });
  }

  static getInstance(): DevMenuBox {
    DevMenuBox.instance_ ??= new DevMenuBox();
    return DevMenuBox.instance_;
  }

  /**
   * Toggle the dev menu visibility
   */
  static toggle(): void {
    const instance = DevMenuBox.getInstance();
    if (instance.boxEl && instance.boxEl.style.display !== 'none') {
      instance.close();
    } else {
      instance.show();
    }
  }

  /**
   * Show the dev menu
   */
  show(): void {
    if (!this.domCreated_) {
      this.createDom_();
    }
    this.open();
  }

  private getUnlockScenariosChecked_(): string {
    return window.UNLOCK_ALL_SCENARIOS ? 'checked' : '';
  }

  protected getBoxContentHtml(): string {
    const autoSkipChecked = window.AUTO_CLOSE_DIALOGS ? 'checked' : '';

    return html`
      <div class="dev-menu">
        <div class="dev-menu__section">
          <div class="form-check form-switch">
            <input type="checkbox" id="dev-auto-skip" class="form-check-input" role="switch" ${autoSkipChecked} />
            <label for="dev-auto-skip" class="form-check-label">Auto-Skip Dialogs</label>
          </div>
          <div class="form-check form-switch mt-2">
            <input type="checkbox" id="dev-unlock-scenarios" class="form-check-input" role="switch" ${this.getUnlockScenariosChecked_()} />
            <label for="dev-unlock-scenarios" class="form-check-label">Unlock All Scenarios</label>
          </div>
        </div>
        <div class="dev-menu__section">
          <button id="dev-complete-objective" class="btn btn-primary w-100">
            Complete Current Objective
          </button>
        </div>
        <div class="dev-menu__section">
          <label class="form-label">Mission Timer (seconds)</label>
          <div class="d-flex gap-2">
            <input type="number" id="dev-mission-timer-value" class="form-control" placeholder="300" min="0" />
            <button id="dev-set-mission-timer" class="btn btn-secondary">Set</button>
          </div>
        </div>
        <div class="dev-menu__section">
          <label class="form-label">Objective Timer (seconds)</label>
          <div class="d-flex gap-2">
            <input type="number" id="dev-objective-timer-value" class="form-control" placeholder="60" min="0" />
            <button id="dev-set-objective-timer" class="btn btn-secondary">Set</button>
          </div>
        </div>
      </div>
    `;
  }

  private createDom_(): void {
    if (this.domCreated_) return;

    const parentDom = document.getElementsByTagName('body')[0];

    parentDom.insertAdjacentHTML('beforeend', html`
      <div id="${this.boxId}" class="draggable-box" style="pointer-events:auto; display:none;">
        <div class="draggable-box__title-bar">
          <div class="draggable-box__title">
            <span>${this.title}</span>
          </div>
          <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
        </div>
        <div class="draggable-box__content">
          ${this.getBoxContentHtml()}
        </div>
      </div>
    `);

    this.domCreated_ = true;
    this.onOpen();
    this.setupEventListeners_();
  }

  private setupEventListeners_(): void {
    // Cache DOM elements
    const autoSkipToggle = getEl('dev-auto-skip') as HTMLInputElement;
    const unlockScenariosToggle = getEl('dev-unlock-scenarios') as HTMLInputElement;
    const completeObjectiveBtn = getEl('dev-complete-objective');
    const missionTimerInput = getEl('dev-mission-timer-value') as HTMLInputElement;
    const setMissionTimerBtn = getEl('dev-set-mission-timer');
    const objectiveTimerInput = getEl('dev-objective-timer-value') as HTMLInputElement;
    const setObjectiveTimerBtn = getEl('dev-set-objective-timer');

    this.domCache_.set('autoSkipToggle', autoSkipToggle);
    this.domCache_.set('unlockScenariosToggle', unlockScenariosToggle);
    this.domCache_.set('completeObjectiveBtn', completeObjectiveBtn);
    this.domCache_.set('missionTimerInput', missionTimerInput);
    this.domCache_.set('setMissionTimerBtn', setMissionTimerBtn);
    this.domCache_.set('objectiveTimerInput', objectiveTimerInput);
    this.domCache_.set('setObjectiveTimerBtn', setObjectiveTimerBtn);

    // Auto-skip dialogs toggle
    autoSkipToggle.addEventListener('change', () => {
      this.handleAutoSkipToggle_(autoSkipToggle.checked);
    });

    // Unlock all scenarios toggle
    unlockScenariosToggle.addEventListener('change', () => {
      this.handleUnlockScenariosToggle_(unlockScenariosToggle.checked);
    });

    // Complete current objective button
    completeObjectiveBtn.addEventListener('click', () => {
      this.handleCompleteObjective_();
    });

    // Set mission timer button
    setMissionTimerBtn.addEventListener('click', () => {
      this.handleSetMissionTimer_();
    });

    // Allow Enter key in mission timer input
    missionTimerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSetMissionTimer_();
      }
    });

    // Set objective timer button
    setObjectiveTimerBtn.addEventListener('click', () => {
      this.handleSetObjectiveTimer_();
    });

    // Allow Enter key in objective timer input
    objectiveTimerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSetObjectiveTimer_();
      }
    });
  }

  private handleAutoSkipToggle_(checked: boolean): void {
    window.AUTO_CLOSE_DIALOGS = checked;
    console.log(`[DevMenu] Auto-skip dialogs: ${checked ? 'enabled' : 'disabled'}`);
  }

  private handleUnlockScenariosToggle_(checked: boolean): void {
    window.UNLOCK_ALL_SCENARIOS = checked;
    console.log(`[DevMenu] Unlock all scenarios: ${checked ? 'enabled' : 'disabled'}`);

    // Refresh scenario selection page if it exists
    try {
      ScenarioSelectionPage.getInstance().refreshCards();
    } catch {
      // Page not instantiated yet - will pick up flag on next render
    }
  }

  private handleCompleteObjective_(): void {
    try {
      const manager = ObjectivesManager.getInstance();
      const success = manager.forceCompleteCurrentObjective();
      if (success) {
        console.log('[DevMenu] Completed current objective');
      } else {
        console.warn('[DevMenu] No active objective to complete');
      }
    } catch {
      console.warn('[DevMenu] ObjectivesManager not initialized');
    }
  }

  private handleSetMissionTimer_(): void {
    const input = this.domCache_.get('missionTimerInput') as HTMLInputElement;
    const seconds = parseInt(input.value, 10);

    if (isNaN(seconds) || seconds < 0) {
      console.warn('[DevMenu] Invalid mission timer value');
      return;
    }

    try {
      const manager = ObjectivesManager.getInstance();
      manager.setScenarioTimeRemaining(seconds);
      console.log(`[DevMenu] Set mission timer to ${seconds} seconds`);
    } catch {
      console.warn('[DevMenu] ObjectivesManager not initialized');
    }
  }

  private handleSetObjectiveTimer_(): void {
    const input = this.domCache_.get('objectiveTimerInput') as HTMLInputElement;
    const seconds = parseInt(input.value, 10);

    if (isNaN(seconds) || seconds < 0) {
      console.warn('[DevMenu] Invalid objective timer value');
      return;
    }

    try {
      const manager = ObjectivesManager.getInstance();
      const success = manager.setCurrentObjectiveTimeRemaining(seconds);
      if (success) {
        console.log(`[DevMenu] Set objective timer to ${seconds} seconds`);
      } else {
        console.warn('[DevMenu] No active objective with timer');
      }
    } catch {
      console.warn('[DevMenu] ObjectivesManager not initialized');
    }
  }

  override open(cb?: () => void): void {
    if (!this.boxEl) {
      this.boxEl = getEl(this.boxId);
    }

    if (!this.boxEl) {
      console.error('DevMenuBox: Cannot open, DOM not created');
      return;
    }

    showEl(this.boxEl);

    if (this.width) {
      this.boxEl.style.minWidth = this.width;
    }

    // Center the box
    this.boxEl.style.top = `${window.scrollY + (window.innerHeight - this.boxEl.offsetHeight) / 2}px`;
    this.boxEl.style.left = `${(window.innerWidth - this.boxEl.offsetWidth) / 2}px`;

    // Update checkboxes to reflect current state
    const autoSkipToggle = this.domCache_.get('autoSkipToggle') as HTMLInputElement;
    if (autoSkipToggle) {
      autoSkipToggle.checked = window.AUTO_CLOSE_DIALOGS ?? false;
    }

    const unlockScenariosToggle = this.domCache_.get('unlockScenariosToggle') as HTMLInputElement;
    if (unlockScenariosToggle) {
      unlockScenariosToggle.checked = window.UNLOCK_ALL_SCENARIOS ?? false;
    }

    if (cb) {
      cb();
    }
  }
}
