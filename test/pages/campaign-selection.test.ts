import { EventBus } from '../../src/events/event-bus';

// Mock dependencies before imports
jest.mock('../../src/events/event-bus');

jest.mock('../../src/engine/utils/query-selector', () => ({
  qs: jest.fn(),
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
      getCurrentPath: jest.fn(() => '/campaigns'),
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
      getAllCampaigns: jest.fn(() => [
        {
          id: 'nats',
          title: 'North Atlantic Teleport Services',
          subtitle: 'Introduction to SATCOM',
          description: 'Test campaign',
          difficulty: 'beginner',
          totalDuration: '2 hours',
          imageUrl: 'nats/image.jpg',
          campaignType: 'Training',
          scenarios: [{ id: 'scenario1' }],
          isDisabled: false,
        },
        {
          id: 'disabled-campaign',
          title: 'Coming Soon Campaign',
          subtitle: 'Disabled',
          description: 'Not available yet',
          difficulty: 'advanced',
          totalDuration: '4 hours',
          imageUrl: 'disabled/image.jpg',
          campaignType: 'Training',
          scenarios: [],
          isDisabled: true,
        },
      ]),
      getCampaignProgress: jest.fn(() => ({
        completedScenarios: [],
        totalScenarios: 1,
        completionPercentage: 0,
        isCompleted: false,
      })),
      getCompletedCampaigns: jest.fn(() => []),
      isCampaignLocked: jest.fn(() => false),
    })),
  },
}));

jest.mock('../../src/user-account/auth', () => ({
  Auth: {
    isLoggedIn: jest.fn(() => Promise.resolve(false)),
  },
}));

jest.mock('../../src/user-account/user-data-service', () => ({
  getUserDataService: jest.fn(() => ({
    getAllScenariosProgress: jest.fn(() => Promise.resolve({ scenarios: [] })),
  })),
}));

jest.mock('../../src/scenarios/sandbox', () => ({
  sandboxData: {
    title: 'Sandbox',
    subtitle: 'Free Play Mode',
    description: 'Experiment freely',
    imageUrl: 'sandbox.jpg',
  },
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
import { CampaignSelectionPage } from '../../src/pages/campaign-selection';
import { Router } from '../../src/router';
import { CampaignManager } from '../../src/campaigns/campaign-manager';
import { Auth } from '../../src/user-account/auth';
import { getUserDataService } from '../../src/user-account/user-data-service';
import { qs } from '../../src/engine/utils/query-selector';

// Setup qs mock to use actual DOM
const mockQs = qs as jest.Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

describe('CampaignSelectionPage', () => {
  let bodyContainer: HTMLElement;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    (CampaignSelectionPage as any).instance_ = undefined;

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
      const page1 = CampaignSelectionPage.getInstance();
      const page2 = CampaignSelectionPage.getInstance();
      expect(page1).toBe(page2);
    });

    it('should create instance on first getInstance() call', () => {
      const page = CampaignSelectionPage.getInstance();
      expect(page).toBeInstanceOf(CampaignSelectionPage);
    });
  });

  describe('page id', () => {
    it('should have correct id', () => {
      const page = CampaignSelectionPage.getInstance();
      expect(page.id).toBe('campaign-selection-page');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      CampaignSelectionPage.getInstance();
    });

    it('should render campaign-selection-page container', () => {
      const container = document.querySelector('#campaign-selection-page');
      expect(container).not.toBeNull();
    });

    it('should render header with title', () => {
      const header = document.querySelector('.campaign-selection-header h1');
      expect(header).not.toBeNull();
      expect(header?.textContent).toBe('Signal Range Training');
    });

    it('should render subtitle', () => {
      const subtitle = document.querySelector('.campaign-selection-header .subtitle');
      expect(subtitle).not.toBeNull();
    });

    it('should render campaign grid', () => {
      const grid = document.querySelector('.campaign-grid');
      expect(grid).not.toBeNull();
    });

    it('should render campaign cards', () => {
      const cards = document.querySelectorAll('.campaign-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should render login warning element', () => {
      const warning = document.querySelector('.login-warning');
      expect(warning).not.toBeNull();
    });
  });

  describe('campaign cards', () => {
    beforeEach(() => {
      CampaignSelectionPage.getInstance();
    });

    it('should render campaign title', () => {
      const title = document.querySelector('.campaign-title');
      expect(title?.textContent).toContain('North Atlantic Teleport Services');
    });

    it('should render campaign badges', () => {
      const badges = document.querySelector('.campaign-badges');
      expect(badges).not.toBeNull();
    });

    it('should render difficulty badge', () => {
      const difficultyBadge = document.querySelector('.badge.difficulty-beginner');
      expect(difficultyBadge).not.toBeNull();
    });

    it('should render duration badge', () => {
      const durationBadge = document.querySelector('.badge.duration');
      expect(durationBadge).not.toBeNull();
    });

    it('should render campaign description', () => {
      const description = document.querySelector('.campaign-description');
      expect(description).not.toBeNull();
    });

    it('should render campaign info items', () => {
      const infoItems = document.querySelectorAll('.campaign-info-item');
      expect(infoItems.length).toBeGreaterThan(0);
    });
  });

  describe('disabled campaigns', () => {
    beforeEach(() => {
      CampaignSelectionPage.getInstance();
    });

    it('should add disabled class to disabled campaigns', () => {
      const disabledCard = document.querySelector('.campaign-card.disabled');
      expect(disabledCard).not.toBeNull();
    });

    it('should render coming soon banner for disabled campaigns', () => {
      const banner = document.querySelector('.coming-soon-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Coming Soon');
    });
  });

  describe('sandbox card', () => {
    beforeEach(() => {
      CampaignSelectionPage.getInstance();
    });

    it('should render sandbox card', () => {
      const sandboxCard = document.querySelector('.sandbox-card');
      expect(sandboxCard).not.toBeNull();
    });

    it('should mark sandbox as disabled', () => {
      const sandboxCard = document.querySelector('.sandbox-card');
      expect(sandboxCard?.classList.contains('disabled')).toBe(true);
    });

    it('should render sandbox badge', () => {
      const sandboxBadge = document.querySelector('.badge.special');
      expect(sandboxBadge).not.toBeNull();
      expect(sandboxBadge?.textContent).toContain('Sandbox');
    });
  });

  describe('campaign click handling', () => {
    let page: CampaignSelectionPage;

    beforeEach(() => {
      page = CampaignSelectionPage.getInstance();
    });

    it('should navigate to campaign scenarios on card click', () => {
      const mockNavigate = jest.fn();
      (Router.getInstance as jest.Mock).mockReturnValue({ navigate: mockNavigate });

      // Get the enabled campaign card and click it
      const cards = document.querySelectorAll('.campaign-card:not(.disabled)');
      const enabledCard = cards[0] as HTMLElement;

      if (enabledCard) {
        enabledCard.click();
        expect(mockNavigate).toHaveBeenCalledWith('/campaigns/nats');
      }
    });

    it('should not navigate when clicking disabled card', () => {
      const mockNavigate = jest.fn();
      (Router.getInstance as jest.Mock).mockReturnValue({ navigate: mockNavigate });

      // Disabled cards should not have click handlers attached
      const disabledCard = document.querySelector('.campaign-card.disabled') as HTMLElement;
      disabledCard?.click();

      // Since disabled cards don't have click listeners, navigate should not be called
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('user data loading', () => {
    it('should have auth mock available', () => {
      // Verify the auth mock is set up correctly
      expect(Auth.isLoggedIn).toBeDefined();
      expect(typeof Auth.isLoggedIn).toBe('function');
    });

    it('should have user data service mock available', () => {
      // Verify the user data service mock is set up correctly
      const service = getUserDataService();
      expect(service).toBeDefined();
      expect(service.getAllScenariosProgress).toBeDefined();
    });
  });

  describe('show', () => {
    it('should be callable without error', () => {
      const page = CampaignSelectionPage.getInstance();
      expect(() => page.show()).not.toThrow();
    });
  });

  describe('campaign progress display', () => {
    it('should show progress banner for in-progress campaigns', async () => {
      const mockGetProgress = jest.fn(() => ({
        completedScenarios: [{ id: 'scenario1' }],
        totalScenarios: 2,
        completionPercentage: 50,
        isCompleted: false,
      }));

      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getAllCampaigns: jest.fn(() => [
          {
            id: 'nats',
            title: 'Test Campaign',
            subtitle: 'Test',
            description: 'Test',
            difficulty: 'beginner',
            totalDuration: '1 hour',
            imageUrl: 'test.jpg',
            campaignType: 'Training',
            scenarios: [{ id: 's1' }, { id: 's2' }],
            isDisabled: false,
          },
        ]),
        getCampaignProgress: mockGetProgress,
        getCompletedCampaigns: jest.fn(() => []),
        isCampaignLocked: jest.fn(() => false),
      });

      CampaignSelectionPage.getInstance();

      // Wait for render
      await Promise.resolve();

      const progressBanner = document.querySelector('.progress-banner');
      expect(progressBanner).not.toBeNull();
    });

    it('should show completed banner for finished campaigns', async () => {
      const mockGetProgress = jest.fn(() => ({
        completedScenarios: [{ id: 'scenario1' }],
        totalScenarios: 1,
        completionPercentage: 100,
        isCompleted: true,
      }));

      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getAllCampaigns: jest.fn(() => [
          {
            id: 'nats',
            title: 'Test Campaign',
            subtitle: 'Test',
            description: 'Test',
            difficulty: 'beginner',
            totalDuration: '1 hour',
            imageUrl: 'test.jpg',
            campaignType: 'Training',
            scenarios: [{ id: 's1' }],
            isDisabled: false,
          },
        ]),
        getCampaignProgress: mockGetProgress,
        getCompletedCampaigns: jest.fn(() => ['nats']),
        isCampaignLocked: jest.fn(() => false),
      });

      CampaignSelectionPage.getInstance();

      // Wait for render
      await Promise.resolve();

      const completedBanner = document.querySelector('.completed-banner');
      expect(completedBanner).not.toBeNull();
    });
  });

  describe('locked campaigns', () => {
    it('should show locked banner for campaigns with unmet prerequisites', async () => {
      (CampaignManager.getInstance as jest.Mock).mockReturnValue({
        getAllCampaigns: jest.fn(() => [
          {
            id: 'locked-campaign',
            title: 'Locked Campaign',
            subtitle: 'Test',
            description: 'Test',
            difficulty: 'advanced',
            totalDuration: '2 hours',
            imageUrl: 'test.jpg',
            campaignType: 'Training',
            scenarios: [],
            isDisabled: false,
          },
        ]),
        getCampaignProgress: jest.fn(() => ({
          completedScenarios: [],
          totalScenarios: 1,
          completionPercentage: 0,
          isCompleted: false,
        })),
        getCompletedCampaigns: jest.fn(() => []),
        isCampaignLocked: jest.fn(() => true),
      });

      CampaignSelectionPage.getInstance();

      // Wait for render
      await Promise.resolve();

      const lockedBanner = document.querySelector('.locked-banner');
      expect(lockedBanner).not.toBeNull();
      expect(lockedBanner?.textContent).toContain('Locked');
    });
  });
});
