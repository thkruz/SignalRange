import { EventBus } from '../src/events/event-bus';
import { Events } from '../src/events/events';
import { Router } from '../src/router';

// Mock dependencies
jest.mock('../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: jest.fn(() => ({
      registerCampaign: jest.fn(),
    })),
  },
}));

jest.mock('../src/campaigns/nats/campaign-data', () => ({
  natsCampaignData: {},
}));

jest.mock('../src/pages/campaign-selection', () => ({
  CampaignSelectionPage: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
      hide: jest.fn(),
    })),
  },
}));

jest.mock('../src/pages/scenario-selection', () => ({
  ScenarioSelectionPage: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
      hide: jest.fn(),
      setCampaign: jest.fn(),
    })),
  },
}));

jest.mock('../src/pages/sandbox-page', () => ({
  SandboxPage: {
    create: jest.fn(),
    getInstance: jest.fn(() => ({
      show: jest.fn(),
      hide: jest.fn(),
    })),
  },
}));

jest.mock('../src/pages/mission-control/mission-control-page', () => ({
  MissionControlPage: {
    create: jest.fn(),
    getInstance: jest.fn(() => ({
      show: jest.fn(),
      hide: jest.fn(),
    })),
  },
}));

jest.mock('../src/pages/layout/header/header', () => ({
  Header: {
    getInstance: jest.fn(() => ({
      makeSmall: jest.fn(),
    })),
  },
}));

jest.mock('../src/pages/layout/footer/footer', () => ({
  Footer: {
    getInstance: jest.fn(() => ({
      makeSmall: jest.fn(),
    })),
  },
}));

jest.mock('../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: jest.fn(() => ({
      scenario: null,
    })),
  },
}));

jest.mock('../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    destroy: jest.fn(),
  },
}));

describe('Router', () => {
  let router: Router;
  let pushStateSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset singletons
    Router.destroy();
    EventBus.destroy();

    // Set initial URL
    window.history.pushState({}, '', '/');

    // Spy on pushState to track navigation calls
    pushStateSpy = jest.spyOn(window.history, 'pushState');

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
