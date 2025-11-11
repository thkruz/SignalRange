import { qs, qsa } from "@app/engine/utils/query-selector";
import { Router } from "@app/router";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";
import "./scenario-selection.css";

interface ScenarioData {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  missionType: string;
  description: string;
  equipment: string[];
}

const SCENARIOS: ScenarioData[] = [
  {
    id: 'scenario1',
    number: 1,
    title: '"First Light"',
    subtitle: 'HELIOS-7 Initial Contact',
    duration: '25-30 min',
    difficulty: 'beginner',
    missionType: 'Commercial Communications',
    description: `You are a Ground Station Operator at Pacific Rim Communications facility in Guam. Your company has just launched HELIOS-7, a new C-band communications satellite. The satellite is now station-keeping at 145°E geostationary orbit. You will conduct the first ground station link test - a critical milestone before commercial operations begin.`,
    equipment: [
      '9-meter C-band Antenna',
      'RF Front End',
      '2× Spectrum Analyzers',
    ],
  },
  {
    id: 'scenario2',
    number: 2,
    title: '"Signal Hunt"',
    subtitle: 'Deep Space Tracking Exercise',
    duration: '35-40 min',
    difficulty: 'intermediate',
    missionType: 'Deep Space Operations',
    description: `Track and analyze signals from a deep space probe passing through the outer solar system. You'll need to compensate for Doppler shift, manage antenna pointing, and maintain signal lock despite challenging signal conditions and atmospheric interference.`,
    equipment: [
      '9-meter C-band Antenna',
      'RF Front End',
      '2× Spectrum Analyzers',
      'Receiver',
    ],
  },
  {
    id: 'scenario3',
    number: 3,
    title: '"Full Stack"',
    subtitle: 'Complete Link Budget Analysis',
    duration: '45-60 min',
    difficulty: 'advanced',
    missionType: 'Research & Development',
    description: `Conduct a comprehensive RF link analysis using the complete ground station suite. You'll establish both uplink and downlink connections, analyze signal quality, measure system performance parameters, and optimize the complete communications chain from transmitter to receiver.`,
    equipment: [
      '2× 9-meter C-band Antennas',
      '2× RF Front Ends',
      '4× Spectrum Analyzers',
      'Transmitter',
      'Receiver',
    ],
  },
];

/**
 * Scenario selection page implementation
 */
export class ScenarioSelectionPage extends BasePage {
  id = 'scenario-selection-page';
  private static instance_: ScenarioSelectionPage;
  private selectedScenario_: string | null = null;

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
      <div class="scenario-selection-header">
        <h1>Training Scenarios</h1>
        <div class="subtitle">Select a scenario to begin</div>
      </div>

      <div class="scenario-grid">
        ${SCENARIOS.map(scenario => this.renderScenarioCard_(scenario)).join('')}
      </div>

      <div class="scenario-actions">
        <button type="button" class="btn-back" id="btn-back">Back</button>
        <button type="button" class="btn-start-scenario" id="btn-start" disabled>
          Start Scenario
        </button>
      </div>
    </div>
  `;

  private renderScenarioCard_(scenario: ScenarioData): string {
    return html`
      <div class="scenario-card" data-scenario-id="${scenario.id}">
        <div class="scenario-card-header">
          <div class="scenario-number">Scenario ${scenario.number}</div>
          <div class="scenario-badges">
            <span class="badge duration">${scenario.duration}</span>
            <span class="badge difficulty-${scenario.difficulty}">${scenario.difficulty}</span>
          </div>
        </div>

        <div class="scenario-card-body">
          <h2 class="scenario-title">${scenario.title}</h2>
          <div class="scenario-subtitle">${scenario.subtitle}</div>
          <div class="scenario-mission-type">${scenario.missionType}</div>
          <p class="scenario-description">${scenario.description}</p>

          <div class="scenario-equipment">
            <div class="scenario-equipment-title">Equipment Configuration</div>
            <div class="equipment-list">
              ${scenario.equipment.map(item => `
                <div class="equipment-item">
                  <div class="equipment-icon"></div>
                  <span>${item}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="scenario-card-footer">
          <div class="scenario-status">
            <div class="status-dot"></div>
            <span>Ready</span>
          </div>
        </div>
      </div>
    `;
  }

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.domCacehe_['btn-start'] = qs('#btn-start', parentDom);
    this.domCacehe_['btn-back'] = qs('#btn-back', parentDom);

    return parentDom;
  }

  protected addEventListeners_(): void {
    // Add click handlers for scenario cards
    const cards = qsa('.scenario-card', this.dom_);
    cards.forEach(card => {
      card.addEventListener('click', this.handleScenarioCardClick_.bind(this));
    });

    // Add click handler for start button
    this.domCacehe_['btn-start'].addEventListener('click', this.handleStartScenario_.bind(this));

    // Add click handler for back button
    this.domCacehe_['btn-back'].addEventListener('click', this.handleBack_.bind(this));
  }

  private handleScenarioCardClick_(event: Event): void {
    const card = (event.currentTarget as HTMLElement);
    const scenarioId = card.dataset.scenarioId;

    if (!scenarioId) return;

    // Remove selection from all cards
    const allCards = qsa('.scenario-card', this.dom_);
    allCards.forEach(c => c.classList.remove('selected'));

    // Add selection to clicked card
    card.classList.add('selected');
    this.selectedScenario_ = scenarioId;

    // Enable start button
    (this.domCacehe_['btn-start'] as HTMLButtonElement).disabled = false;
  }

  private handleStartScenario_(): void {
    if (!this.selectedScenario_) {
      return;
    }

    Router.getInstance().navigate(this.selectedScenario_);
  }

  private handleBack_(): void {
    Router.getInstance().navigate('home');
  }
}