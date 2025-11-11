import { qs } from "@app/engine/utils/query-selector";
import { Router } from "@app/router";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";

/**
 * Scenario selection page implementation
 */
export class ScenarioSelectionPage extends BasePage {
  id = 'scenario-selection-page';
  private static instance_: ScenarioSelectionPage;

  private constructor() {
    super();
    this.init_('body-content-container', 'add');
  }

  static getInstance(): ScenarioSelectionPage {
    this.instance_ ??= new ScenarioSelectionPage();

    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="scenario-selection-page">
      <h1>Select a Scenario</h1>
      <form id="scenario-form" class="scenario-form">
        <div class="form-group">
          <label>
            <input type="radio" name="scenario" value="scenario1" required>
            Scenario 1: Data Analysis
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="radio" name="scenario" value="scenario2">
            Scenario 2: Image Recognition
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="radio" name="scenario" value="scenario3">
            Scenario 3: Report Generation
          </label>
        </div>
        <button type="submit" class="btn-primary">Continue</button>
      </form>
    </div>
  `;

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.domCacehe_['scenario-form'] = qs('#scenario-form', parentDom);

    return parentDom;
  }

  protected addEventListeners_(): void {
    this.domCacehe_['scenario-form'].addEventListener('submit', this.handleScenarioSelect.bind(this));
  }

  private async handleScenarioSelect(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const selected = form.scenario.value;

    switch (selected) {
      case 'scenario1':
        Router.getInstance().navigate('scenario1');
        break;
      case 'scenario2':
        Router.getInstance().navigate('scenario2');
        break;
      case 'scenario3':
        Router.getInstance().navigate('scenario3');
        break;
      default:
        alert('Please select a valid scenario.');
        break;
    }
  }
}