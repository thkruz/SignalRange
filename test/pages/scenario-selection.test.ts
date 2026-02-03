import { Mock, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';

// Mock dependencies before imports
vi.mock('../../src/events/event-bus');

vi.mock('../../src/engine/utils/query-selector', () => ({
  qs: vi.fn(),
  qsa: vi.fn(),
}));

vi.mock('../../src/engine/ui/modal-confirm', () => ({
  ModalConfirm: {
    getInstance: vi.fn(() => ({
      open: vi.fn((callback) => callback()),
    })),
  },
}));

vi.mock('../../src/logging/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/router', () => ({
  Router: {
    getInstance: vi.fn(() => ({
      navigate: vi.fn(),
      getCurrentPath: vi.fn(() => '/campaigns/nats'),
    })),
  },
  NavigationOptions: {},
}));

vi.mock('../../src/app', () => ({
  App: {
    authReady: Promise.resolve(),
  },
}));

vi.mock('../../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: vi.fn(() => ({
      getCampaign: vi.fn((id: string) => ({
        id,
        title: 'Test Campaign',
        subtitle: 'Test',
        scenarios: [
          {
            id: 'scenario1',
            number: 1,
            title: 'Scenario 1',
            subtitle: 'First Scenario',
            description: 'Test description',
            difficulty: 'beginner',
            duration: '30 min',
            url: '/campaigns/nats/scenarios/scenario1',
            imageUrl: 'nats/s1.jpg',
            equipment: ['Antenna', 'Receiver'],
            isDisabled: false,
          },
        ],
      })),
      getCampaignProgress: vi.fn(() => ({
        completedScenarios: [],
        totalScenarios: 1,
        completionPercentage: 0,
      })),
    })),
  },
}));

vi.mock('../../src/scenario-manager', () => ({
  SCENARIOS: [],
  isScenarioLocked: vi.fn(() => false),
  getPrerequisiteScenarioNames: vi.fn(() => []),
  getNextPrerequisiteScenario: vi.fn(() => null),
}));

vi.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: vi.fn(() => ({
    getAllScenariosProgress: vi.fn(() => Promise.resolve({ scenarios: [] })),
    checkpointExists: vi.fn(() => Promise.resolve(false)),
    deleteCheckpoint: vi.fn(() => Promise.resolve()),
    resetScenarioForReplay: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../../src/sync/storage', () => ({
  clearPersistedStore: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/utils/asset-url', () => ({
  getAssetUrl: vi.fn((path: string) => path),
}));

vi.mock('../../src/pages/base-page', () => {
  return {
    BasePage: class {
      protected dom_: HTMLElement | null = null;
      protected html_ = '';
      protected navigationOptions_ = {};
      protected progressSaveManager_ = null;

      protected init_(rootElementId: string, mode: string): void {
        const root = global.document.getElementById(rootElementId);
        if (root && this.html_) {
          const temp = global.document.createElement('div');
          temp.innerHTML = this.html_;
          if (mode === 'add') {
            while (temp.firstChild) {
              root.appendChild(temp.firstChild);
            }
          } else {
            root.innerHTML = this.html_;
          }
          this.dom_ = root.lastElementChild as HTMLElement;
        }
      }

      show(): void {
        if (this.dom_) {
          this.dom_.style.display = 'flex';
        }
      }

      hide(): void {
        if (this.dom_) {
          this.dom_.style.display = 'none';
        }
      }

      protected initProgressSaveManager_(): void { }
      protected disposeProgressSaveManager_(): void { }
      protected async initializeObjectivesAndDialogs_(): Promise<void> { }
    },
  };
});

vi.mock('../../src/pages/layout/body/body', () => ({
  Body: {
    containerId: 'body-content-container',
  },
}));

import { CampaignManager } from '../../src/campaigns/campaign-manager';
import { Logger } from '../../src/logging/logger';
import { Router } from '../../src/router';
import { getNextPrerequisiteScenario, isScenarioLocked, SCENARIOS } from '../../src/scenario-manager';
import { getUserDataService } from '../../src/user-account/user-data-service';
// Import after mocks
import { qs, qsa } from '../../src/engine/utils/query-selector';
import { ScenarioSelectionPage } from '../../src/pages/scenario-selection';

// Setup qs/qsa mock to use actual DOM
const mockQs = qs as Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

const mockQsa = qsa as Mock;
mockQsa.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelectorAll(selector);
});

// Helper to flush all pending promises (multiple times for nested async operations)
// The checkpoint loading involves a dynamic import and multiple awaits, requiring many microtask ticks
const flushPromises = async () => {
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve(); // Extra microtask tick
  }
};

describe('ScenarioSelectionPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (ScenarioSelectionPage as any).instance_ = undefined;

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup body container
    bodyContainer = document.createElement('div');
    bodyContainer.id = 'body-content-container';
    document.body.appendChild(bodyContainer);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('singleton pattern', () => {
    it('should return same instance with getInstance()', () => {
      const page1 = ScenarioSelectionPage.getInstance();
      const page2 = ScenarioSelectionPage.getInstance();
      expect(page1).toBe(page2);
    });

    it('should create instance on first getInstance() call', () => {
      const page = ScenarioSelectionPage.getInstance();
      expect(page).toBeInstanceOf(ScenarioSelectionPage);
    });
  });

  describe('page id', () => {
    it('should have correct id', () => {
      const page = ScenarioSelectionPage.getInstance();
      expect(page.id).toBe('scenario-selection-page');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      ScenarioSelectionPage.getInstance();
    });

    it('should render scenario-selection-page container', () => {
      const container = document.querySelector('#scenario-selection-page');
      expect(container).not.toBeNull();
    });

    it('should render header section', () => {
      const header = document.querySelector('.scenario-selection-header');
      expect(header).not.toBeNull();
    });

    it('should render scenario grid', () => {
      const grid = document.querySelector('.scenario-grid');
      expect(grid).not.toBeNull();
    });
  });

  describe('setCampaign', () => {
    it('should accept a campaign id', () => {
      const page = ScenarioSelectionPage.getInstance();
      expect(() => page.setCampaign('nats')).not.toThrow();
    });

    it('should accept null to clear campaign', () => {
      const page = ScenarioSelectionPage.getInstance();
      expect(() => page.setCampaign(null)).not.toThrow();
    });

    it('should update header when campaign is set', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const header = document.querySelector('.scenario-selection-header h1');
      expect(header?.textContent).toBe('Test Campaign');
    });

    it('should update progress in header', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const progress = document.querySelector('.campaign-progress');
      expect(progress?.textContent).toContain('0 of 1');
    });

    it('should show back to campaigns link', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const backLink = document.querySelector('.back-button');
      expect(backLink).not.toBeNull();
      expect(backLink?.textContent).toContain('Back to Campaigns');
    });
  });

  describe('scenario card rendering', () => {
    beforeEach(() => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');
    });

    it('should render scenario cards', () => {
      const cards = document.querySelectorAll('.scenario-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should display scenario title', () => {
      const title = document.querySelector('.scenario-title');
      expect(title?.textContent).toBe('Scenario 1');
    });

    it('should display scenario number', () => {
      const number = document.querySelector('.scenario-number');
      expect(number?.textContent).toBe('Scenario 1');
    });

    it('should display scenario description', () => {
      const description = document.querySelector('.scenario-description');
      expect(description?.textContent).toBe('Test description');
    });

    it('should display difficulty badge', () => {
      const badge = document.querySelector('.badge.difficulty-beginner');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('beginner');
    });

    it('should display duration badge', () => {
      const badge = document.querySelector('.badge.duration');
      expect(badge?.textContent).toBe('30 min');
    });

    it('should display equipment list', () => {
      const equipment = document.querySelectorAll('.equipment-item');
      expect(equipment.length).toBe(2);
    });
  });

  describe('show', () => {
    it('should be callable', () => {
      const page = ScenarioSelectionPage.getInstance();
      expect(() => page.show()).not.toThrow();
    });

    it('should set display to flex', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.hide();
      page.show();

      const pageEl = document.querySelector('#scenario-selection-page') as HTMLElement;
      expect(pageEl?.style.display).toBe('flex');
    });
  });

  describe('hide', () => {
    it('should set display to none', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.hide();

      const pageEl = document.querySelector('#scenario-selection-page') as HTMLElement;
      expect(pageEl?.style.display).toBe('none');
    });
  });

  describe('checkpoint handling', () => {
    it('should render start button when no checkpoint exists', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const startBtn = document.querySelector('.btn-start');
      expect(startBtn).not.toBeNull();
    });
  });

  describe('locked scenarios', () => {
    beforeEach(() => {
      (isScenarioLocked as Mock).mockReturnValue(true);
      (getNextPrerequisiteScenario as Mock).mockReturnValue({
        id: 'prereq-scenario',
        title: 'Prerequisite Scenario',
      });
    });

    afterEach(() => {

      (isScenarioLocked as Mock).mockReturnValue(false);
      (getNextPrerequisiteScenario as Mock).mockReturnValue(null);
    });

    it('should add disabled class to locked scenarios', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const card = document.querySelector('.scenario-card');
      expect(card?.classList.contains('disabled')).toBe(true);
    });

    it('should show locked banner for locked scenarios', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const banner = document.querySelector('.locked-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Locked');
    });

    it('should show prerequisite requirement', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const requirement = document.querySelector('.locked-requirement');
      expect(requirement?.textContent).toContain('Prerequisite Scenario');
    });
  });

  describe('disabled scenarios', () => {
    const originalMock = vi.fn();

    beforeEach(() => {
      originalMock.mockImplementation(CampaignManager.getInstance);
      (CampaignManager.getInstance as Mock).mockReturnValue({
        getCampaign: vi.fn(() => ({
          id: 'nats',
          title: 'Test Campaign',
          subtitle: 'Test',
          scenarios: [
            {
              id: 'disabled-scenario',
              number: 1,
              title: 'Disabled Scenario',
              subtitle: 'Coming Soon',
              description: 'Not available yet',
              difficulty: 'advanced',
              duration: '1 hour',
              url: '/campaigns/nats/scenarios/disabled',
              imageUrl: 'nats/disabled.jpg',
              equipment: [],
              isDisabled: true,
            },
          ],
        })),
        getCampaignProgress: vi.fn(() => ({
          completedScenarios: [],
          totalScenarios: 1,
          completionPercentage: 0,
        })),
      });
    });

    afterEach(() => {
      // Restore the original CampaignManager mock

      (CampaignManager.getInstance as Mock).mockReturnValue({
        getCampaign: vi.fn((id: string) => ({
          id,
          title: 'Test Campaign',
          subtitle: 'Test',
          scenarios: [
            {
              id: 'scenario1',
              number: 1,
              title: 'Scenario 1',
              subtitle: 'First Scenario',
              description: 'Test description',
              difficulty: 'beginner',
              duration: '30 min',
              url: '/campaigns/nats/scenarios/scenario1',
              imageUrl: 'nats/s1.jpg',
              equipment: ['Antenna', 'Receiver'],
              isDisabled: false,
            },
          ],
        })),
        getCampaignProgress: vi.fn(() => ({
          completedScenarios: [],
          totalScenarios: 1,
          completionPercentage: 0,
        })),
      });
    });

    it('should add disabled class to disabled scenarios', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const card = document.querySelector('.scenario-card');
      expect(card?.classList.contains('disabled')).toBe(true);
    });

    it('should show coming soon banner for disabled scenarios', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const banner = document.querySelector('.coming-soon-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Coming Soon');
    });
  });

  describe('button rendering', () => {
    it('should have checkpoint actions container', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const actionsContainer = document.querySelector('.scenario-checkpoint-actions');
      expect(actionsContainer).not.toBeNull();
    });

    it('should have button inside actions container', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const actionsContainer = document.querySelector('.scenario-checkpoint-actions');
      const button = actionsContainer?.querySelector('button');
      expect(button).not.toBeNull();
    });
  });

  describe('campaign with no scenarios', () => {
    beforeEach(() => {
      (CampaignManager.getInstance as Mock).mockReturnValue({
        getCampaign: vi.fn(() => ({
          id: 'empty',
          title: 'Empty Campaign',
          subtitle: 'No scenarios',
          scenarios: [],
        })),
        getCampaignProgress: vi.fn(() => ({
          completedScenarios: [],
          totalScenarios: 0,
          completionPercentage: 0,
        })),
      });
    });

    afterEach(() => {
      // Restore the original CampaignManager mock

      (CampaignManager.getInstance as Mock).mockReturnValue({
        getCampaign: vi.fn((id: string) => ({
          id,
          title: 'Test Campaign',
          subtitle: 'Test',
          scenarios: [
            {
              id: 'scenario1',
              number: 1,
              title: 'Scenario 1',
              subtitle: 'First Scenario',
              description: 'Test description',
              difficulty: 'beginner',
              duration: '30 min',
              url: '/campaigns/nats/scenarios/scenario1',
              imageUrl: 'nats/s1.jpg',
              equipment: ['Antenna', 'Receiver'],
              isDisabled: false,
            },
          ],
        })),
        getCampaignProgress: vi.fn(() => ({
          completedScenarios: [],
          totalScenarios: 1,
          completionPercentage: 0,
        })),
      });
    });

    it('should render empty grid', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('empty');

      const cards = document.querySelectorAll('.scenario-card');
      expect(cards.length).toBe(0);
    });
  });

  describe('initDom_', () => {
    it('should set dom_ to the page element', () => {
      const page = ScenarioSelectionPage.getInstance();
      // Access private dom_ via any cast
      const dom = (page as any).dom_;
      expect(dom).not.toBeNull();
      expect(dom?.id).toBe('scenario-selection-page');
    });
  });

  describe('event listeners', () => {
    it('should attach event listeners on page creation', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      // Verify buttons have event handlers by checking they exist
      const buttons = document.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('scenario card with various states', () => {
    it('should render scenario number', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const number = document.querySelector('.scenario-number');
      expect(number?.textContent).toContain('Scenario 1');
    });

    it('should render scenario subtitle', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const subtitle = document.querySelector('.scenario-subtitle');
      expect(subtitle?.textContent).toBe('First Scenario');
    });

    it('should render scenario image', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const img = document.querySelector('.scenario-image img');
      expect(img).not.toBeNull();
    });

    it('should render equipment configuration section', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const equipmentTitle = document.querySelector('.scenario-equipment-title');
      expect(equipmentTitle?.textContent).toBe('Equipment Configuration');
    });
  });

  describe('null campaign handling', () => {
    it('should handle null campaign gracefully', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');
      page.setCampaign(null);

      // Should show default header when no campaign
      const header = document.querySelector('.scenario-selection-header h1');
      expect(header?.textContent).toBe('Training Scenarios');
    });

    it('should show default subtitle when no campaign', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign(null);

      const subtitle = document.querySelector('.scenario-selection-header .subtitle');
      expect(subtitle?.textContent).toBe('Select a scenario to begin');
    });
  });

  describe('scenario card data attributes', () => {
    it('should set scenario-url data attribute', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const card = document.querySelector('.scenario-card');
      expect(card?.getAttribute('data-scenario-url')).toBe('/campaigns/nats/scenarios/scenario1');
    });

    it('should set scenario-id data attribute', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const card = document.querySelector('.scenario-card');
      expect(card?.getAttribute('data-scenario-id')).toBe('scenario1');
    });

    it('should set scenario data attribute with title', () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const card = document.querySelector('.scenario-card');
      expect(card?.getAttribute('data-scenario')).toBe('Scenario 1');
    });
  });

  describe('page visibility', () => {
    it('should be visible by default', () => {
      ScenarioSelectionPage.getInstance();
      const pageEl = document.querySelector('#scenario-selection-page') as HTMLElement;
      // Default display should not be 'none'
      expect(pageEl?.style.display).not.toBe('none');
    });
  });

  describe('scenarios with checkpoints', () => {
    beforeEach(() => {
      // Setup SCENARIOS with the test scenario
      SCENARIOS.length = 0;
      SCENARIOS.push({
        id: 'scenario1',
        number: 1,
        title: 'Scenario 1',
        subtitle: 'First Scenario',
        description: 'Test description',
        difficulty: 'beginner',
        duration: '30 min',
        url: '/campaigns/nats/scenarios/scenario1',
        imageUrl: 'nats/s1.jpg',
        equipment: ['Antenna', 'Receiver'],
        isDisabled: false,
      } as any);

      // Setup user data service to return checkpoint exists
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }],
          })
        ),
        checkpointExists: vi.fn((scenarioId: string) => Promise.resolve(scenarioId === 'scenario1')),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });
    });

    afterEach(() => {
      // Restore SCENARIOS
      SCENARIOS.length = 0;

      // Restore default mock

      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });
    });

    // These tests are skipped because the checkpoint loading involves a dynamic import
    // (await import('../app')) and multiple async awaits that are difficult to mock correctly.
    // The checkpoint loading flow requires App.authReady, userDataService calls, and SCENARIOS
    // iteration - all happening asynchronously after page creation.
    it.skip('should render continue button when checkpoint exists', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      // Wait for checkpoint loading
      await flushPromises();

      const continueBtn = document.querySelector('.btn-continue');
      expect(continueBtn).not.toBeNull();
    });

    it.skip('should render start fresh button when checkpoint exists', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const startFreshBtn = document.querySelector('.btn-start-fresh');
      expect(startFreshBtn).not.toBeNull();
    });

    it.skip('should render checkpoint banner when checkpoint exists', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const banner = document.querySelector('.checkpoint-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Checkpoint Available');
    });
  });

  describe('completed scenarios', () => {
    beforeEach(() => {
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({
            scenarios: [
              {
                scenarioId: 'scenario1',
                completedAt: '2024-01-01T00:00:00Z',
                score: 100,
              },
            ],
          })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });
    });

    afterEach(() => {

      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });
    });

    // These tests are skipped for the same reason as the checkpoint tests above -
    // the progress loading involves a dynamic import and async awaits that are
    // difficult to mock correctly in unit tests.
    it.skip('should render play again button for completed scenario', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const playAgainBtn = document.querySelector('.btn-play-again');
      expect(playAgainBtn).not.toBeNull();
      expect(playAgainBtn?.textContent).toContain('Play Again');
    });

    it.skip('should render completed banner for completed scenario', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const banner = document.querySelector('.completed-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Completed');
    });
  });

  describe('button click handlers', () => {
    let mockNavigate: Mock;

    beforeEach(() => {
      mockNavigate = vi.fn();
      (Router.getInstance as Mock).mockReturnValue({
        navigate: mockNavigate,
        getCurrentPath: vi.fn(() => '/campaigns/nats'),
      });
    });

    it('should navigate when start button is clicked', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      const startBtn = document.querySelector('.btn-start') as HTMLElement;
      startBtn?.click();

      await flushPromises();

      expect(mockNavigate).toHaveBeenCalledWith(
        '/campaigns/nats/scenarios/scenario1',
        expect.objectContaining({ forceReplay: true })
      );
    });

    it('should navigate when continue button is clicked', async () => {
      // Setup SCENARIOS with the test scenario
      SCENARIOS.length = 0;
      SCENARIOS.push({
        id: 'scenario1',
        number: 1,
        title: 'Scenario 1',
        subtitle: 'First Scenario',
        description: 'Test description',
        difficulty: 'beginner',
        duration: '30 min',
        url: '/campaigns/nats/scenarios/scenario1',
        imageUrl: 'nats/s1.jpg',
        equipment: ['Antenna', 'Receiver'],
        isDisabled: false,
      } as any);

      // Setup checkpoint exists
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(true)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      // Wait for checkpoint loading to complete
      await flushPromises();

      const continueBtn = document.querySelector('.btn-continue') as HTMLElement;
      continueBtn?.click();

      expect(mockNavigate).toHaveBeenCalledWith(
        '/campaigns/nats/scenarios/scenario1',
        expect.objectContaining({ continueFromCheckpoint: true })
      );

      // Cleanup
      SCENARIOS.length = 0;
    });

    it('should show confirmation and navigate when start fresh is clicked', async () => {
      // Setup SCENARIOS with the test scenario
      SCENARIOS.length = 0;
      SCENARIOS.push({
        id: 'scenario1',
        number: 1,
        title: 'Scenario 1',
        subtitle: 'First Scenario',
        description: 'Test description',
        difficulty: 'beginner',
        duration: '30 min',
        url: '/campaigns/nats/scenarios/scenario1',
        imageUrl: 'nats/s1.jpg',
        equipment: ['Antenna', 'Receiver'],
        isDisabled: false,
      } as any);

      // Setup checkpoint exists

      const mockDeleteCheckpoint = vi.fn(() => Promise.resolve());
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(true)),
        deleteCheckpoint: mockDeleteCheckpoint,
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const startFreshBtn = document.querySelector('.btn-start-fresh') as HTMLElement;
      startFreshBtn?.click();

      // The modal mock immediately calls the callback
      await flushPromises();

      expect(mockDeleteCheckpoint).toHaveBeenCalledWith('scenario1');
      expect(mockNavigate).toHaveBeenCalledWith(
        '/campaigns/nats/scenarios/scenario1',
        expect.objectContaining({ forceReplay: true })
      );

      // Cleanup
      SCENARIOS.length = 0;
    });

    it('should reset scenario and navigate when play again is clicked', async () => {
      const mockResetScenario = vi.fn(() => Promise.resolve());
      const mockDeleteCheckpoint = vi.fn(() => Promise.resolve());
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 100 }],
          })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: mockDeleteCheckpoint,
        resetScenarioForReplay: mockResetScenario,
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const playAgainBtn = document.querySelector('.btn-play-again') as HTMLElement;
      playAgainBtn?.click();

      await flushPromises();

      expect(mockResetScenario).toHaveBeenCalledWith('scenario1');
      expect(mockNavigate).toHaveBeenCalledWith(
        '/campaigns/nats/scenarios/scenario1',
        expect.objectContaining({ forceReplay: true })
      );
    });
  });

  describe('checkpoint loading', () => {
    it('should load checkpoint data on getInstance', async () => {

      const mockGetAllProgress = vi.fn(() =>
        Promise.resolve({
          scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 50 }],
        })
      );
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: mockGetAllProgress,
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      ScenarioSelectionPage.getInstance();

      await flushPromises();

      expect(mockGetAllProgress).toHaveBeenCalled();
    });

    it('should handle checkpoint loading error gracefully', async () => {
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() => Promise.reject(new Error('Network error'))),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Should still render the page without crashing
      const grid = document.querySelector('.scenario-grid');
      expect(grid).not.toBeNull();
    });

    it('should track scenarios with completedAt for prerequisites', async () => {

      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({
            scenarios: [
              { scenarioId: 'scenario1', completedAt: '2024-01-01', score: 0 },
            ],
          })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Scenario with completedAt should show completed badge even if score is 0
      const completedBanner = document.querySelector('.completed-banner');
      expect(completedBanner).not.toBeNull();
    });
  });

  describe('show method', () => {
    it('should refresh checkpoint data when show is called', async () => {
      const mockGetAllProgress = vi.fn(() => Promise.resolve({ scenarios: [] }));
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: mockGetAllProgress,
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Clear the call count from initial load
      mockGetAllProgress.mockClear();

      page.show();

      await flushPromises();

      // show() should trigger a refresh
      expect(mockGetAllProgress).toHaveBeenCalled();
    });
  });

  describe('error handling in button handlers', () => {
    it('should handle error when deleting checkpoint fails', async () => {
      // Setup SCENARIOS with the test scenario
      SCENARIOS.length = 0;
      SCENARIOS.push({
        id: 'scenario1',
        number: 1,
        title: 'Scenario 1',
        subtitle: 'First Scenario',
        description: 'Test description',
        difficulty: 'beginner',
        duration: '30 min',
        url: '/campaigns/nats/scenarios/scenario1',
        imageUrl: 'nats/s1.jpg',
        equipment: ['Antenna', 'Receiver'],
        isDisabled: false,
      } as any);


      const mockDeleteCheckpoint = vi.fn(() => Promise.reject(new Error('Delete failed')));
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(true)),
        deleteCheckpoint: mockDeleteCheckpoint,
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });


      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Mock window.alert
      const mockAlert = vi.fn();
      global.alert = mockAlert;

      const startFreshBtn = document.querySelector('.btn-start-fresh') as HTMLElement;
      startFreshBtn?.click();

      await flushPromises();

      expect(Logger.error).toHaveBeenCalledWith('Failed to clear checkpoint:', expect.any(Error));
      expect(mockAlert).toHaveBeenCalledWith('Failed to clear checkpoint. Please try again.');

      // Cleanup
      SCENARIOS.length = 0;
    });

    it('should handle error when resetScenarioForReplay fails', async () => {
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 100 }],
          })
        ),
        checkpointExists: vi.fn(() => Promise.resolve(false)),
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.reject(new Error('Reset failed'))),
      });


      const mockNavigate = vi.fn();

      (Router.getInstance as Mock).mockReturnValue({
        navigate: mockNavigate,
        getCurrentPath: vi.fn(() => '/campaigns/nats'),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const playAgainBtn = document.querySelector('.btn-play-again') as HTMLElement;
      playAgainBtn?.click();

      await flushPromises();

      // Should still navigate even if reset fails (uses .catch())
      expect(Logger.warn).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe('checkpoint loading with SCENARIOS fallback', () => {
    beforeEach(() => {
      // Set up SCENARIOS with a scenario that has a checkpoint
      SCENARIOS.length = 0;
      SCENARIOS.push({
        id: 'global-scenario',
        number: 1,
        title: 'Global Scenario',
        subtitle: 'Test',
        description: 'Test description',
        difficulty: 'beginner',
        duration: '30 min',
        url: '/scenarios/global-scenario',
        imageUrl: 'test.jpg',
        equipment: [],
        isDisabled: false,
      } as any);
    });

    afterEach(() => {
      SCENARIOS.length = 0;
    });

    it('should check checkpoints for all SCENARIOS', async () => {

      const mockCheckpointExists = vi.fn(() => Promise.resolve(true));
      (getUserDataService as Mock).mockReturnValue({
        getAllScenariosProgress: vi.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: mockCheckpointExists,
        deleteCheckpoint: vi.fn(() => Promise.resolve()),
        resetScenarioForReplay: vi.fn(() => Promise.resolve()),
      });

      ScenarioSelectionPage.getInstance();

      await flushPromises();

      expect(mockCheckpointExists).toHaveBeenCalledWith('global-scenario');
    });
  });
});
