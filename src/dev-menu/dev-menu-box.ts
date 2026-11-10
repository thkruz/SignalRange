import { displayViewport } from '@app/game-menu/display-viewport';
/**
 * @file DevMenuBox - Developer menu for testing and debugging
 * @description Draggable box providing dev tools: auto-skip dialogs, complete objective, set timer
 */

import { CampaignManager } from '@app/campaigns/campaign-manager';
import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { getEl, showEl } from '@app/engine/utils/get-el';
import { t7e } from '@app/locales/i18n';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { Header } from '@app/pages/layout/header/header';
import { ScenarioSelectionPage } from '@app/pages/scenario-selection';
import { PluginManager } from '@app/plugins/plugin-manager';
import { SettingsManager } from '@app/settings/settings-manager';
import { achievementCatalog } from '@app/user-account/achievement-catalog';
import { achievementToast } from '@app/user-account/achievement-toast';
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
    // A previously dragged position can be outside a resized viewport.
    if (this.boxEl) {
      const bounds = this.boxEl.getBoundingClientRect();
      if (bounds.left < 0 || bounds.right > window.innerWidth || bounds.top < 0 || bounds.bottom > window.innerHeight) {
        this.placeOnFirstOpen(this.boxEl);
      }
    }
  }

  private getUnlockScenariosChecked_(): string {
    return window.UNLOCK_ALL_SCENARIOS ? 'checked' : '';
  }

  protected override placeOnFirstOpen(box: HTMLElement): void {
    super.placeOnFirstOpen(box);
    box.style.left = `${window.scrollX + (displayViewport().width - box.offsetWidth) / 2}px`;
  }

  private getForceEngButtonChecked_(): string {
    return window.FORCE_ENGINEERING_BUTTON ? 'checked' : '';
  }

  protected getBoxContentHtml(): string {
    const autoSkipChecked = window.AUTO_CLOSE_DIALOGS ? 'checked' : '';

    return html`
      <div class="dev-menu">
        <div class="dev-menu__section">
          <h3 class="dev-menu__heading">Session controls</h3>
          <div class="form-check form-switch">
            <input type="checkbox" id="dev-auto-skip" class="form-check-input" role="switch" ${autoSkipChecked} />
            <label for="dev-auto-skip" class="form-check-label">Auto-Skip Dialogs</label>
          </div>
          <div class="form-check form-switch mt-2">
            <input type="checkbox" id="dev-unlock-scenarios" class="form-check-input" role="switch" ${this.getUnlockScenariosChecked_()} />
            <label for="dev-unlock-scenarios" class="form-check-label">Unlock All Scenarios</label>
          </div>
          <div class="form-check form-switch mt-2">
            <input type="checkbox" id="dev-force-eng-button" class="form-check-input" role="switch" ${this.getForceEngButtonChecked_()} />
            <label for="dev-force-eng-button" class="form-check-label">Force Engineering Button</label>
          </div>
        </div>
        <div class="dev-menu__section">
          <h3 class="dev-menu__heading">Objectives</h3>
          <div class="dev-menu__actions">
          <button id="dev-complete-objective" class="btn btn-primary w-100">
            Complete Current Objective
          </button>
          <button id="dev-uncomplete-objective" class="btn btn-warning w-100">
            Uncomplete Last Objective
          </button>
          </div>
        </div>
        <div class="dev-menu__section">
          <h3 class="dev-menu__heading">Achievement preview</h3>
          <label class="form-label" for="dev-achievement-style">Achievement style</label>
          <select id="dev-achievement-style" class="form-select mb-2">
            <option value="compact" ${achievementToast.style === 'compact' ? 'selected' : ''}>Compact (Steam-style)</option>
            <option value="card" ${achievementToast.style === 'card' ? 'selected' : ''}>Detailed card (original)</option>
          </select>
          <label class="form-label" for="dev-achievement-id">Achievement to preview</label>
          <select id="dev-achievement-id" class="form-select mb-2"></select>
          <button id="dev-test-achievement" type="button" class="btn btn-secondary w-100">Test achievement</button>
        </div>
        <div class="dev-menu__section">
          <h3 class="dev-menu__heading">Timers</h3>
          <div class="dev-menu__timers">
          <div>
          <label class="form-label" for="dev-mission-timer-value">Mission (seconds)</label>
          <div class="d-flex gap-2">
            <input type="number" id="dev-mission-timer-value" class="form-control" placeholder="300" min="0" />
            <button id="dev-set-mission-timer" class="btn btn-secondary">Set</button>
          </div>
        </div>
        <div>
          <label class="form-label" for="dev-objective-timer-value">Objective (seconds)</label>
          <div class="d-flex gap-2">
            <input type="number" id="dev-objective-timer-value" class="form-control" placeholder="60" min="0" />
            <button id="dev-set-objective-timer" class="btn btn-secondary">Set</button>
          </div>
        </div>
          </div>
        </div>
        <div class="dev-menu__section">
          <label class="form-label">${t7e('devMenu.pluginsSection')}</label>
          <div id="dev-plugins-list">${this.renderPluginsList_()}</div>
        </div>
      </div>
    `;
  }

  /**
   * One switch per manifest entry. Toggles persist through SettingsManager and
   * apply on the next load; a plugin with no module in this build (private-only
   * in the OSS bundle) is shown but cannot be switched on.
   */
  private renderPluginsList_(): string {
    const plugins = PluginManager.getInstance().list();

    if (plugins.length === 0) {
      return html`<div class="text-muted small">${t7e('devMenu.noPlugins')}</div>`;
    }

    const statusOf = (plugin: { error?: string; enabled: boolean }): string => {
      if (plugin.error) {
        return ` · ${t7e('devMenu.pluginFailed')}`;
      }

      return plugin.enabled ? '' : ` · ${t7e('devMenu.pluginDisabled')}`;
    };
    const rows = plugins
      .map((plugin) => {
        const status = statusOf(plugin);
        const version = plugin.version ? ` v${plugin.version}` : '';

        return html`
          <div class="form-check form-switch mt-1">
            <input type="checkbox" id="dev-plugin-${plugin.id}" class="form-check-input" role="switch" data-plugin-id="${plugin.id}"
              ${plugin.enabled ? 'checked' : ''} ${plugin.unavailable ? 'disabled' : ''} />
            <label for="dev-plugin-${plugin.id}" class="form-check-label">
              ${plugin.id} <span class="small text-muted">(${plugin.source}${version}${status})</span>
            </label>
          </div>
        `;
      })
      .join('');

    return html`${rows}<div class="text-muted small mt-2">${t7e('devMenu.reloadHint')}</div>`;
  }

  private createDom_(): void {
    if (this.domCreated_) return;

    const parentDom = document.getElementsByTagName('body')[0];

    parentDom.insertAdjacentHTML(
      'beforeend',
      html`
      <div id="${this.boxId}" class="draggable-box" style="pointer-events:auto; display:none;">
        <div class="draggable-box__title-bar">
          <div class="draggable-box__title">
            <span>${this.title}</span>
          </div>
          <button type="button" id="${this.boxId}-close" class="draggable-box__close-btn" title="Close this window" aria-label="Close">&#x2715; Close</button>
        </div>
        <div class="draggable-box__content">
          ${this.getBoxContentHtml()}
        </div>
      </div>
    `
    );

    this.domCreated_ = true;
    this.onOpen();
    this.setupEventListeners_();
  }

  private setupEventListeners_(): void {
    document.getElementById('dev-achievement-style')?.addEventListener('change', (event) => {
      achievementToast.setStyle((event.target as HTMLSelectElement).value === 'card' ? 'card' : 'compact');
    });
    const achievementPicker = document.getElementById('dev-achievement-id') as HTMLSelectElement;
    const catalog = achievementCatalog(CampaignManager.getInstance().getAllCampaigns());
    for (const achievement of catalog) achievementPicker.add(new Option(`${achievement.category} / ${achievement.title}`, achievement.id));
    document.getElementById('dev-test-achievement')?.addEventListener('click', () => {
      const achievement = catalog.find((entry) => entry.id === achievementPicker.value);
      if (achievement) achievementToast.showTest(achievement);
    });
    // Cache DOM elements
    const autoSkipToggle = getEl('dev-auto-skip') as HTMLInputElement;
    const unlockScenariosToggle = getEl('dev-unlock-scenarios') as HTMLInputElement;
    const forceEngButtonToggle = getEl('dev-force-eng-button') as HTMLInputElement;
    const completeObjectiveBtn = getEl('dev-complete-objective');
    const uncompleteObjectiveBtn = getEl('dev-uncomplete-objective');
    const missionTimerInput = getEl('dev-mission-timer-value') as HTMLInputElement;
    const setMissionTimerBtn = getEl('dev-set-mission-timer');
    const objectiveTimerInput = getEl('dev-objective-timer-value') as HTMLInputElement;
    const setObjectiveTimerBtn = getEl('dev-set-objective-timer');

    this.domCache_.set('autoSkipToggle', autoSkipToggle);
    this.domCache_.set('unlockScenariosToggle', unlockScenariosToggle);
    this.domCache_.set('forceEngButtonToggle', forceEngButtonToggle);
    this.domCache_.set('completeObjectiveBtn', completeObjectiveBtn);
    this.domCache_.set('uncompleteObjectiveBtn', uncompleteObjectiveBtn);
    this.domCache_.set('missionTimerInput', missionTimerInput);
    this.domCache_.set('setMissionTimerBtn', setMissionTimerBtn);
    this.domCache_.set('objectiveTimerInput', objectiveTimerInput);
    this.domCache_.set('setObjectiveTimerBtn', setObjectiveTimerBtn);

    // Plugin enable/disable switches (persisted; applied on next load)
    getEl('dev-plugins-list')
      .querySelectorAll<HTMLInputElement>('input[data-plugin-id]')
      .forEach((toggle) => {
        toggle.addEventListener('change', () => {
          SettingsManager.getInstance().setPluginEnabled(toggle.dataset.pluginId ?? '', toggle.checked);
        });
      });

    // Auto-skip dialogs toggle
    autoSkipToggle.addEventListener('change', () => {
      this.handleAutoSkipToggle_(autoSkipToggle.checked);
    });

    // Unlock all scenarios toggle
    unlockScenariosToggle.addEventListener('change', () => {
      this.handleUnlockScenariosToggle_(unlockScenariosToggle.checked);
    });

    // Force engineering button toggle
    forceEngButtonToggle.addEventListener('change', () => {
      this.handleForceEngButtonToggle_(forceEngButtonToggle.checked);
    });

    // Complete current objective button
    completeObjectiveBtn.addEventListener('click', () => {
      this.handleCompleteObjective_();
    });

    // Uncomplete last objective button
    uncompleteObjectiveBtn.addEventListener('click', () => {
      this.handleUncompleteObjective_();
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

  private handleForceEngButtonToggle_(checked: boolean): void {
    window.FORCE_ENGINEERING_BUTTON = checked;
    console.log(`[DevMenu] Force engineering button: ${checked ? 'enabled' : 'disabled'}`);

    // Refresh header ENG button visibility
    try {
      Header.getInstance().refreshEngButtonVisibility();
    } catch {
      // Header not instantiated yet
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

  private handleUncompleteObjective_(): void {
    try {
      const manager = ObjectivesManager.getInstance();
      const success = manager.uncompleteLastObjective();
      if (success) {
        console.log('[DevMenu] Uncompleted last objective');
      } else {
        console.warn('[DevMenu] No completed objectives to uncomplete');
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
    const achievementStyle = this.boxEl.querySelector<HTMLSelectElement>('#dev-achievement-style');
    if (achievementStyle) achievementStyle.value = achievementToast.style;

    if (this.width) {
      this.boxEl.style.minWidth = this.width;
    }

    // Center the box
    this.boxEl.style.top = `${window.scrollY + (displayViewport().height - this.boxEl.offsetHeight) / 2}px`;
    this.boxEl.style.left = `${(displayViewport().width - this.boxEl.offsetWidth) / 2}px`;

    // Update checkboxes to reflect current state
    const autoSkipToggle = this.domCache_.get('autoSkipToggle') as HTMLInputElement;
    if (autoSkipToggle) {
      autoSkipToggle.checked = window.AUTO_CLOSE_DIALOGS ?? false;
    }

    const unlockScenariosToggle = this.domCache_.get('unlockScenariosToggle') as HTMLInputElement;
    if (unlockScenariosToggle) {
      unlockScenariosToggle.checked = window.UNLOCK_ALL_SCENARIOS ?? false;
    }

    const forceEngButtonToggle = this.domCache_.get('forceEngButtonToggle') as HTMLInputElement;
    if (forceEngButtonToggle) {
      forceEngButtonToggle.checked = window.FORCE_ENGINEERING_BUTTON ?? false;
    }

    if (cb) {
      cb();
    }
  }
}
