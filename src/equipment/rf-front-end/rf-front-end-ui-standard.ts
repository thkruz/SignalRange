import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { BUCState } from './buc-module/buc-module-core';
import { createBUC } from './buc-module/buc-module-factory';
import { BUCModuleUIStandard } from './buc-module/buc-module-ui-standard';
import { CouplerModule, CouplerState } from "./coupler-module/coupler-module";
import { createCoupler } from './coupler-module/coupler-module-factory';
import { IfFilterBankState } from './filter-module/filter-module-core';
import { createIfFilterBank } from './filter-module/filter-module-factory';
import { IfFilterBankModuleUIStandard } from './filter-module/filter-module-ui-standard';
import { GPSDOState } from './gpsdo-module/gpsdo-state';
import { createGPSDO } from './gpsdo-module/gpsdo-module-factory';
import { GPSDOModuleUIStandard } from './gpsdo-module/gpsdo-module-ui-standard';
import { HPAState } from './hpa-module/hpa-module-core';
import { createHPA } from './hpa-module/hpa-module-factory';
import { HPAModuleUIStandard } from './hpa-module/hpa-module-ui-standard';
import { LNBState } from './lnb-module/lnb-module-core';
import { createLNB } from './lnb-module/lnb-module-factory';
import { LNBModuleUIStandard } from './lnb-module/lnb-module-ui-standard';
import { OMTModule, OMTState } from "./omt-module/omt-module";
import { createOMT } from "./omt-module/omt-module-factory";
import { RFFrontEndCore, RFFrontEndState } from './rf-front-end-core';
import './rf-front-end.css';

/**
 * RFFrontEndUIStandard - Standard UI Implementation
 * Extends core with custom composite layouts
 * Bypasses module.html and arranges components directly
 */
export class RFFrontEndUIStandard extends RFFrontEndCore {
  // Type-safe module references (UI variants)
  declare omtModule: OMTModule;
  declare bucModule: BUCModuleUIStandard;
  declare hpaModule: HPAModuleUIStandard;
  declare filterModule: IfFilterBankModuleUIStandard;
  declare lnbModule: LNBModuleUIStandard;
  declare couplerModule: CouplerModule;
  declare gpsdoModule: GPSDOModuleUIStandard;

  constructor(parentId: string, state?: Partial<RFFrontEndState>, teamId = 1, serverId = 1) {
    super(state, teamId, serverId, parentId);
    this.build(parentId);
  }

  /**
   * Create modules - placeholder during super() call
   * Actual modules created in build() after parentId is available
   */
  protected createModules(): void {
    // Placeholder - modules will be created in build()
    // This satisfies the abstract method requirement during super() construction
  }

  /**
   * Build UI with composite layouts
   */
  protected build(parentId: string): void {
    // Create UI-enabled modules WITHOUT parentId (they should only generate HTML, not build)
    // We'll inject their HTML via innerHTML and add event listeners afterward
    // Using factories to create standard UI variants
    // Using 'as any' for rfFrontEnd parameter until module constructors are updated to accept RFFrontEndCore
    this.omtModule = createOMT(this.state.omt, this as any, 1, '', 'standard');
    this.bucModule = createBUC(this.state.buc, this as any, 1, '', 'standard') as BUCModuleUIStandard;
    this.hpaModule = createHPA(this.state.hpa, this as any, 1, '', 'standard') as HPAModuleUIStandard;
    this.filterModule = createIfFilterBank(this.state.filter, this as any, 1, '', 'standard') as IfFilterBankModuleUIStandard;
    this.lnbModule = createLNB(this.state.lnb, this as any, 1, '', 'standard') as LNBModuleUIStandard;
    this.couplerModule = createCoupler(this.state.coupler, this as any, 1, '', 'standard');
    this.gpsdoModule = createGPSDO(this.state.gpsdo, this as any, 1, '', 'standard') as GPSDOModuleUIStandard;

    // Initialize DOM with composite layout
    super.build(parentId);
  }

  /**
   * Initialize DOM with custom composite layouts
   * Bypasses module.html and arranges components directly
   */
  protected initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    // Build custom composite layout using module component getters
    parentDom.innerHTML = html`
      <div id="rf-fe-box-${this.state.uuid}-a" class="equipment-case rf-front-end-box" data-unit="${this.state.uuid}">
        <!-- Top Status Bar -->
        <div class="equipment-case-header">
          <div class="equipment-case-title">
            <span>RF FRONT END 1 of 2 | ${this.uuidShort}</span>
          </div>
          <div class="equipment-case-power-controls">
            <div id="rf-fe-power-${this.state.uuid}" class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div id="rf-fe-led-${this.state.uuid}-1" class="led led-green"></div>
            </div>
          </div>
        </div>

        <!-- Main Module Container -->
        <div class="rf-fe-modules">
          <div class="stacked-modules">
            ${this.omtModule.html}
            ${this.couplerModule.html}
          </div>
          <div class="stacked-modules">
            ${this.bucModule.html}
            ${this.hpaModule.html}
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div id="rf-fe-status-${this.state.uuid}-1" class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
        </div>
      </div>

      <div id="rf-fe-box-${this.state.uuid}-b" class="equipment-case rf-front-end-box" data-unit="${this.state.uuid}">
        <!-- Top Status Bar -->
        <div class="equipment-case-header">
          <div class="equipment-case-title">
            <span>RF FRONT END 2 of 2 | ${this.uuidShort}</span>
          </div>
          <div class="equipment-case-power-controls">
            <div id="rf-fe-power-${this.state.uuid}" class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div id="rf-fe-led-${this.state.uuid}-2" class="led led-green"></div>
            </div>
          </div>
        </div>

        <!-- Main Module Container -->
        <div class="rf-fe-modules">
          ${this.gpsdoModule.html}
          <div class="stacked-modules">
            ${this.lnbModule.html}
            ${this.filterModule.html}
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div id="rf-fe-status-${this.state.uuid}-2" class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
        </div>
      </div>
    `;

    return parentDom;
  }

  /**
   * Add event listeners for modules
   * Called AFTER innerHTML is set, so components can find their DOM elements
   */
  protected addListeners_(_parentDom: HTMLElement): void {
    // Wire module event listeners
    this.omtModule.addEventListeners((state: OMTState) => {
      this.state.omt = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);
    });

    this.bucModule.addEventListeners((state: BUCState) => {
      this.state.buc = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_BUC_CHANGED, state);
    });

    this.hpaModule.addEventListeners((state: HPAState) => {
      this.state.hpa = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_HPA_CHANGED, state);
    });

    this.filterModule.addEventListeners((state: IfFilterBankState) => {
      this.state.filter = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_FILTER_CHANGED, state);
    });

    this.lnbModule.addEventListeners((state: LNBState) => {
      this.state.lnb = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_LNB_CHANGED, state);
    });

    this.couplerModule.addEventListeners((state: CouplerState) => {
      this.state.coupler = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, state);
    });

    this.gpsdoModule.addEventListeners((state: GPSDOState) => {
      this.state.gpsdo = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_GPSDO_CHANGED, state);
    });

    // Attach additional event listeners
    this.attachEventListeners();
  }

  /**
   * Initialize after DOM is ready
   */
  protected initialize_(): void {
    this.syncDomWithState();
  }

  /**
   * Check for alarms and update status bars/LEDs
   */
  protected checkForAlarms_(): void {
    const statusBarElement1 = qs(`#rf-fe-status-${this.state.uuid}-1`);
    const ledElement1 = qs(`#rf-fe-led-${this.state.uuid}-1`);

    const alarmStatus1 = this.getStatusAlarms(1);
    this.updateStatusBar(statusBarElement1, alarmStatus1);
    this.updateStatusLed(ledElement1, alarmStatus1);

    const statusBarElement2 = qs(`#rf-fe-status-${this.state.uuid}-2`);
    const ledElement2 = qs(`#rf-fe-led-${this.state.uuid}-2`);

    const alarmStatus2 = this.getStatusAlarms(2);
    this.updateStatusBar(statusBarElement2, alarmStatus2);
    this.updateStatusLed(ledElement2, alarmStatus2);
  }

  /**
   * Attach additional event listeners (from original implementation)
   */
  private attachEventListeners(): void {
    const container = qs(`.equipment-case[data-unit="${this.state.uuid}"]`);
    if (!container) return;

    // Input change handlers
    container.querySelectorAll('input, select').forEach(element => {
      element.addEventListener('change', this.handleInputChange.bind(this));
      element.addEventListener('input', this.handleInputChange.bind(this));
    });

    // Button action handlers
    container.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', this.handleButtonAction.bind(this));
    });
  }

  /**
   * Handle input changes (from original implementation)
   */
  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    const value = target.type === 'number' ? parseFloat(target.value) : target.value;

    // Parse nested parameter path (e.g., "buc.loFrequency")
    const parts = param.split('.');
    if (parts.length === 2) {
      const [module, property] = parts;
      if (module in this.state && typeof this.state[module as keyof RFFrontEndState] === 'object') {
        (this.state[module as keyof RFFrontEndState] as any)[property] = value;
      }
    }

    this.syncDomWithState();
  }

  /**
   * Handle button actions (from original implementation)
   */
  private handleButtonAction(e: Event): void {
    const button = e.target as HTMLButtonElement;
    const action = button.dataset.action;

    switch (action) {
      case 'toggle-advanced-mode':
        // Not sure what this does yet
        break;
    }

    this.syncDomWithState();
  }
}
