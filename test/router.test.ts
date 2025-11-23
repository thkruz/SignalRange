import { EventBus } from '../src/events/event-bus';
import { Events } from '../src/events/events';
import { Router } from '../src/router';

// Mock dependencies
jest.mock('../src/pages/scenario-selection', () => ({
  ScenarioSelectionPage: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
      hide: jest.fn(),
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
  let eventBusEmitSpy: jest.SpyInstance;
  let pushStateMock: jest.Mock;

  beforeEach(() => {
    // Reset singleton
    Router.destroy();
    router = Router.getInstance();

    // Mock EventBus
    eventBusEmitSpy = jest.spyOn(EventBus.getInstance(), 'emit');

    // Mock window.location
    // Set initial URL via history API instead of redefining window.location (non-configurable in some envs)
    window.history.pushState({}, '', '/');

    // Mock history API
    pushStateMock = jest.fn();
    Object.defineProperty(window, 'history', {
      value: { pushState: pushStateMock },
      writable: true,
      configurable: true,
    });

    // Mock addEventListener
    jest.spyOn(window, 'addEventListener').mockImplementation(() => { });
    jest.spyOn(document, 'addEventListener').mockImplementation(() => { });
  });

  afterEach(() => {
    eventBusEmitSpy.mockRestore();
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

  describe('init', () => {
    it('should add event listeners', () => {
      router.init();

      expect(window.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('navigate', () => {
    it('should update browser history and route', () => {
      router.navigate('/sandbox');

      expect(pushStateMock).toHaveBeenCalledWith({}, '', '/sandbox');
    });

    it('should accept navigation options', () => {
      const options = { continueFromCheckpoint: true };

      router.navigate('/sandbox', options);

      expect(pushStateMock).toHaveBeenCalledWith({}, '', '/sandbox');
    });

    // TODO we have to fix how Mock window.location works to make this test pass
    it.skip('should emit ROUTE_CHANGED event', () => {
      router.navigate('/sandbox');

      expect(eventBusEmitSpy).toHaveBeenCalledWith(
        Events.ROUTE_CHANGED,
        expect.objectContaining({ path: '/sandbox' })
      );
    });
  });
});
