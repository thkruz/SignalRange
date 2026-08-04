import { vi } from 'vitest';
import { CampaignManager } from '../src/campaigns/campaign-manager';
import { EventBus } from '../src/events/event-bus';
import { Router } from '../src/router';

// Mock dependencies
vi.mock('../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: vi.fn(() => ({
      registerCampaign: vi.fn(),
      // The router reads chromeVariant off the campaign to tag <body>. The
      // campaign data is mocked away here, so this returns undefined and the
      // router takes its 'standard' fallback - which is the path worth
      // exercising anyway (a campaign that declares no variant).
      getCampaign: vi.fn(() => undefined),
    })),
  },
}));

vi.mock('../src/campaigns/nats/campaign-data', () => ({
  natsCampaignData: {},
}));

vi.mock('../src/campaigns/nats-eu/campaign-data', () => ({
  natsEuCampaignData: {},
}));

vi.mock('../src/pages/campaign-selection', () => ({
  CampaignSelectionPage: {
    getInstance: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
    })),
  },
}));

vi.mock('../src/pages/scenario-selection', () => ({
  ScenarioSelectionPage: {
    getInstance: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      setCampaign: vi.fn(),
    })),
  },
}));

vi.mock('../src/pages/sandbox-page', () => ({
  SandboxPage: {
    create: vi.fn(),
    getInstance: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
    })),
  },
}));

vi.mock('../src/pages/mission-control/mission-control-page', () => ({
  MissionControlPage: {
    create: vi.fn(),
    getInstance: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
    })),
  },
}));

vi.mock('../src/pages/layout/header/header', () => ({
  Header: {
    getInstance: vi.fn(() => ({
      makeSmall: vi.fn(),
    })),
  },
}));

vi.mock('../src/pages/layout/footer/footer', () => ({
  Footer: {
    getInstance: vi.fn(() => ({
      makeSmall: vi.fn(),
    })),
  },
}));

vi.mock('../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      scenario: null,
    })),
  },
}));

vi.mock('../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    destroy: vi.fn(),
  },
}));

describe('Router', () => {
  let router: Router;
  let pushStateSpy: SpyInstance;

  beforeEach(() => {
    // Reset singletons
    Router.destroy();
    EventBus.destroy();

    // Set initial URL
    window.history.pushState({}, '', '/');

    // Spy on pushState to track navigation calls
    pushStateSpy = vi.spyOn(window.history, 'pushState');

    router = Router.getInstance();
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    Router.destroy();
    EventBus.destroy();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = Router.getInstance();
      const instance2 = Router.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('getCurrentPath', () => {
    it('should return the current path', () => {
      const path = router.getCurrentPath();

      expect(typeof path).toBe('string');
    });
  });

  describe('navigate', () => {
    it('should update browser history', () => {
      router.navigate('/sandbox');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/sandbox');
    });

    it('should accept navigation options', () => {
      const options = { continueFromCheckpoint: true };

      router.navigate('/sandbox', options);

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/sandbox');
    });

    it('should update currentPath after navigation', () => {
      router.navigate('/sandbox');

      expect(router.getCurrentPath()).toBe('/sandbox');
    });
  });

  describe('body classes', () => {
    /**
     * The chrome variant is what makes two campaigns feel like the same
     * system. It reaches CSS only through this class, so the tagging is worth
     * asserting: a wrong or stale class silently renders the wrong console.
     */
    const mockActiveCampaign = (campaign: unknown): void => {
      vi.mocked(CampaignManager.getInstance).mockReturnValue({
        registerCampaign: vi.fn(),
        getCampaign: vi.fn(() => campaign),
      } as unknown as ReturnType<typeof CampaignManager.getInstance>);
    };

    it('should tag the campaign and its chrome variant', () => {
      mockActiveCampaign({ id: 'ccs', chromeVariant: 'astro' });

      router.navigate('/campaigns/ccs');

      expect(document.body.classList.contains('campaign-ccs')).toBe(true);
      expect(document.body.classList.contains('chrome-astro')).toBe(true);
    });

    it('should fall back to standard chrome when the campaign declares no variant', () => {
      mockActiveCampaign({ id: 'nats' });

      router.navigate('/campaigns/nats');

      expect(document.body.classList.contains('chrome-standard')).toBe(true);
    });

    it('should drop the previous campaign and chrome classes on navigation', () => {
      mockActiveCampaign({ id: 'ccs', chromeVariant: 'astro' });
      router.navigate('/campaigns/ccs');

      mockActiveCampaign({ id: 'nats', chromeVariant: 'standard' });
      router.navigate('/campaigns/nats');

      expect(document.body.classList.contains('campaign-ccs')).toBe(false);
      expect(document.body.classList.contains('chrome-astro')).toBe(false);
      expect(document.body.classList.contains('chrome-standard')).toBe(true);
    });

    it('should carry no campaign or chrome class outside a campaign route', () => {
      mockActiveCampaign({ id: 'ccs', chromeVariant: 'astro' });
      router.navigate('/campaigns/ccs');

      router.navigate('/sandbox');

      expect([...document.body.classList].some(c => c.startsWith('campaign-'))).toBe(false);
      expect([...document.body.classList].some(c => c.startsWith('chrome-'))).toBe(false);
    });
  });

  describe('unknown route redirect', () => {
    it('should redirect /student to root path', () => {
      router.navigate('/student');

      // Should have called pushState twice: once for /student, then for /
      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/student');
      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
      expect(router.getCurrentPath()).toBe('/');
    });

    it('should redirect /invalid-path to root path', () => {
      router.navigate('/invalid-path');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
      expect(router.getCurrentPath()).toBe('/');
    });

    it('should redirect /foo/bar/baz to root path', () => {
      router.navigate('/foo/bar/baz');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
      expect(router.getCurrentPath()).toBe('/');
    });

    it('should redirect /instructor to root path', () => {
      router.navigate('/instructor');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
      expect(router.getCurrentPath()).toBe('/');
    });

    it('should redirect /login to root path', () => {
      router.navigate('/login');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/');
      expect(router.getCurrentPath()).toBe('/');
    });
  });

  describe('valid routes should not redirect', () => {
    it('should stay on root path', () => {
      router.navigate('/');

      expect(router.getCurrentPath()).toBe('/');
      // pushState called only once for the navigation
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should stay on /sandbox', () => {
      router.navigate('/sandbox');

      expect(router.getCurrentPath()).toBe('/sandbox');
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should stay on /mission-control', () => {
      router.navigate('/mission-control');

      expect(router.getCurrentPath()).toBe('/mission-control');
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should stay on valid campaign path', () => {
      router.navigate('/campaigns/nats');

      expect(router.getCurrentPath()).toBe('/campaigns/nats');
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should stay on valid scenario path', () => {
      router.navigate('/campaigns/nats/scenarios/scenario1');

      expect(router.getCurrentPath()).toBe('/campaigns/nats/scenarios/scenario1');
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('legacy route redirects', () => {
    it('should redirect /scenarios/1 to new format', () => {
      router.navigate('/scenarios/1');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/campaigns/nats/scenarios/scenario1');
      expect(router.getCurrentPath()).toBe('/campaigns/nats/scenarios/scenario1');
    });

    it('should redirect /scenarios/2 to new format', () => {
      router.navigate('/scenarios/2');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/campaigns/nats/scenarios/first-light2');
      expect(router.getCurrentPath()).toBe('/campaigns/nats/scenarios/first-light2');
    });

    it('should redirect /scenarios/3 to new format', () => {
      router.navigate('/scenarios/3');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/campaigns/nats/scenarios/scenario3');
      expect(router.getCurrentPath()).toBe('/campaigns/nats/scenarios/scenario3');
    });
  });

  describe('destroy', () => {
    it('should reset the singleton instance', () => {
      const instance1 = Router.getInstance();
      Router.destroy();
      const instance2 = Router.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });
});
