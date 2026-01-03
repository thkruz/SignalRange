import { EventBus } from '../../src/events/event-bus';

// Mock dependencies before imports
jest.mock('../../src/events/event-bus');

jest.mock('../../src/engine/utils/query-selector', () => ({
  qs: jest.fn(),
  qsa: jest.fn(),
}));

jest.mock('../../src/engine/ui/modal-confirm', () => ({
  ModalConfirm: {
    getInstance: jest.fn(() => ({
      open: jest.fn((callback) => callback()),
    })),
  },
}));

jest.mock('../../src/logging/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/router', () => ({
  Router: {
    getInstance: jest.fn(() => ({
      navigate: jest.fn(),
      getCurrentPath: jest.fn(() => '/campaigns/nats'),
    })),
  },
  NavigationOptions: {},
}));

jest.mock('../../src/app', () => ({
  App: {
    authReady: Promise.resolve(),
  },
}));

jest.mock('../../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: jest.fn(() => ({
      getCampaign: jest.fn((id: string) => ({
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
      getCampaignProgress: jest.fn(() => ({
        completedScenarios: [],
        totalScenarios: 1,
        completionPercentage: 0,
      })),
    })),
  },
}));

jest.mock('../../src/scenario-manager', () => ({
  SCENARIOS: [],
  isScenarioLocked: jest.fn(() => false),
  getPrerequisiteScenarioNames: jest.fn(() => []),
  getNextPrerequisiteScenario: jest.fn(() => null),
}));

jest.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: jest.fn(() => ({
    getAllScenariosProgress: jest.fn(() => Promise.resolve({ scenarios: [] })),
    checkpointExists: jest.fn(() => Promise.resolve(false)),
    deleteCheckpoint: jest.fn(() => Promise.resolve()),
    resetScenarioForReplay: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('../../src/sync/storage', () => ({
  clearPersistedStore: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/utils/asset-url', () => ({
  getAssetUrl: jest.fn((path: string) => path),
}));

jest.mock('../../src/pages/base-page', () => {
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

      protected initProgressSaveManager_(): void {}
      protected disposeProgressSaveManager_(): void {}
      protected async initializeObjectivesAndDialogs_(): Promise<void> {}
    },
  };
});

jest.mock('../../src/pages/layout/body/body', () => ({
  Body: {
    containerId: 'body-content-container',
  },
}));

// Import after mocks
import { ScenarioSelectionPage } from '../../src/pages/scenario-selection';
import { qs, qsa } from '../../src/engine/utils/query-selector';

// Setup qs/qsa mock to use actual DOM
const mockQs = qs as jest.Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

const mockQsa = qsa as jest.Mock;
mockQsa.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelectorAll(selector);
});

// Helper to flush all pending promises
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ScenarioSelectionPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    (ScenarioSelectionPage as any).instance_ = undefined;

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

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
      const { isScenarioLocked, getNextPrerequisiteScenario } = require('../../src/scenario-manager');
      (isScenarioLocked as jest.Mock).mockReturnValue(true);
      (getNextPrerequisiteScenario as jest.Mock).mockReturnValue({
        id: 'prereq-scenario',
        title: 'Prerequisite Scenario',
      });
    });

    afterEach(() => {
      const { isScenarioLocked, getNextPrerequisiteScenario } = require('../../src/scenario-manager');
      (isScenarioLocked as jest.Mock).mockReturnValue(false);
      (getNextPrerequisiteScenario as jest.Mock).mockReturnValue(null);
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
    const originalMock = jest.fn();

    beforeEach(() => {
      const { CampaignManager } = require('../../src/campaigns/campaign-manager');
      originalMock.mockImplementation(CampaignManager.getInstance);
      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getCampaign: jest.fn(() => ({
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
        getCampaignProgress: jest.fn(() => ({
          completedScenarios: [],
          totalScenarios: 1,
          completionPercentage: 0,
        })),
      });
    });

    afterEach(() => {
      // Restore the original CampaignManager mock
      const { CampaignManager } = require('../../src/campaigns/campaign-manager');
      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getCampaign: jest.fn((id: string) => ({
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
        getCampaignProgress: jest.fn(() => ({
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
      const { CampaignManager } = require('../../src/campaigns/campaign-manager');
      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getCampaign: jest.fn(() => ({
          id: 'empty',
          title: 'Empty Campaign',
          subtitle: 'No scenarios',
          scenarios: [],
        })),
        getCampaignProgress: jest.fn(() => ({
          completedScenarios: [],
          totalScenarios: 0,
          completionPercentage: 0,
        })),
      });
    });

    afterEach(() => {
      // Restore the original CampaignManager mock
      const { CampaignManager } = require('../../src/campaigns/campaign-manager');
      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getCampaign: jest.fn((id: string) => ({
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
        getCampaignProgress: jest.fn(() => ({
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
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [
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
      ];

      // Setup user data service to return checkpoint exists
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }],
          })
        ),
        checkpointExists: jest.fn((scenarioId: string) => Promise.resolve(scenarioId === 'scenario1')),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });
    });

    afterEach(() => {
      // Restore SCENARIOS
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [];

      // Restore default mock
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });
    });

    it('should render continue button when checkpoint exists', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      // Wait for checkpoint loading
      await flushPromises();

      const continueBtn = document.querySelector('.btn-continue');
      expect(continueBtn).not.toBeNull();
    });

    it('should render start fresh button when checkpoint exists', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const startFreshBtn = document.querySelector('.btn-start-fresh');
      expect(startFreshBtn).not.toBeNull();
    });

    it('should render checkpoint banner when checkpoint exists', async () => {
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
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
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
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });
    });

    afterEach(() => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });
    });

    it('should render play again button for completed scenario', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const playAgainBtn = document.querySelector('.btn-play-again');
      expect(playAgainBtn).not.toBeNull();
      expect(playAgainBtn?.textContent).toContain('Play Again');
    });

    it('should render completed banner for completed scenario', async () => {
      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      const banner = document.querySelector('.completed-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Completed');
    });
  });

  describe('button click handlers', () => {
    let mockNavigate: jest.Mock;

    beforeEach(() => {
      mockNavigate = jest.fn();
      const { Router } = require('../../src/router');
      (Router.getInstance as jest.Mock).mockReturnValue({
        navigate: mockNavigate,
        getCurrentPath: jest.fn(() => '/campaigns/nats'),
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
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [
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
      ];

      // Setup checkpoint exists
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(true)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
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
      scenarioManager.SCENARIOS = [];
    });

    it('should show confirmation and navigate when start fresh is clicked', async () => {
      // Setup SCENARIOS with the test scenario
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [
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
      ];

      // Setup checkpoint exists
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockDeleteCheckpoint = jest.fn(() => Promise.resolve());
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(true)),
        deleteCheckpoint: mockDeleteCheckpoint,
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
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
      scenarioManager.SCENARIOS = [];
    });

    it('should reset scenario and navigate when play again is clicked', async () => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockResetScenario = jest.fn(() => Promise.resolve());
      const mockDeleteCheckpoint = jest.fn(() => Promise.resolve());
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 100 }],
          })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
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
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockGetAllProgress = jest.fn(() =>
        Promise.resolve({
          scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 50 }],
        })
      );
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: mockGetAllProgress,
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });

      ScenarioSelectionPage.getInstance();

      await flushPromises();

      expect(mockGetAllProgress).toHaveBeenCalled();
    });

    it('should handle checkpoint loading error gracefully', async () => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() => Promise.reject(new Error('Network error'))),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Should still render the page without crashing
      const grid = document.querySelector('.scenario-grid');
      expect(grid).not.toBeNull();
    });

    it('should track scenarios with completedAt for prerequisites', async () => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({
            scenarios: [
              { scenarioId: 'scenario1', completedAt: '2024-01-01', score: 0 },
            ],
          })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
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
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockGetAllProgress = jest.fn(() => Promise.resolve({ scenarios: [] }));
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: mockGetAllProgress,
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
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
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [
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
      ];

      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockDeleteCheckpoint = jest.fn(() => Promise.reject(new Error('Delete failed')));
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({ scenarios: [{ scenarioId: 'scenario1', completedAt: null, score: 0 }] })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(true)),
        deleteCheckpoint: mockDeleteCheckpoint,
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });

      const { Logger } = require('../../src/logging/logger');

      const page = ScenarioSelectionPage.getInstance();
      page.setCampaign('nats');

      await flushPromises();

      // Mock window.alert
      const mockAlert = jest.fn();
      global.alert = mockAlert;

      const startFreshBtn = document.querySelector('.btn-start-fresh') as HTMLElement;
      startFreshBtn?.click();

      await flushPromises();

      expect(Logger.error).toHaveBeenCalledWith('Failed to clear checkpoint:', expect.any(Error));
      expect(mockAlert).toHaveBeenCalledWith('Failed to clear checkpoint. Please try again.');

      // Cleanup
      scenarioManager.SCENARIOS = [];
    });

    it('should handle error when resetScenarioForReplay fails', async () => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() =>
          Promise.resolve({
            scenarios: [{ scenarioId: 'scenario1', completedAt: '2024-01-01', score: 100 }],
          })
        ),
        checkpointExists: jest.fn(() => Promise.resolve(false)),
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.reject(new Error('Reset failed'))),
      });

      const { Logger } = require('../../src/logging/logger');
      const mockNavigate = jest.fn();
      const { Router } = require('../../src/router');
      (Router.getInstance as jest.Mock).mockReturnValue({
        navigate: mockNavigate,
        getCurrentPath: jest.fn(() => '/campaigns/nats'),
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
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [
        {
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
        },
      ];
    });

    afterEach(() => {
      const scenarioManager = require('../../src/scenario-manager');
      scenarioManager.SCENARIOS = [];
    });

    it('should check checkpoints for all SCENARIOS', async () => {
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      const mockCheckpointExists = jest.fn(() => Promise.resolve(true));
      (getUserDataService as jest.Mock).mockReturnValue({
        getAllScenariosProgress: jest.fn(() => Promise.resolve({ scenarios: [] })),
        checkpointExists: mockCheckpointExists,
        deleteCheckpoint: jest.fn(() => Promise.resolve()),
        resetScenarioForReplay: jest.fn(() => Promise.resolve()),
      });

      ScenarioSelectionPage.getInstance();

      await flushPromises();

      expect(mockCheckpointExists).toHaveBeenCalledWith('global-scenario');
    });
  });
});
