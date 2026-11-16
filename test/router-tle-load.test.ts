import { vi } from 'vitest';
import { CampaignManager } from '../src/campaigns/campaign-manager';
import { EventBus } from '../src/events/event-bus';
import { Events } from '../src/events/events';
import { PluginManager } from '../src/plugins/plugin-manager';
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

vi.mock('../src/campaigns/frontline/campaign-data', () => ({
  frontlineCampaignData: {},
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

vi.mock('../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    destroy: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  ensureTleSets: vi.fn(),
  create: vi.fn(),
  show: vi.fn(),
  fail: vi.fn(),
  dispose: vi.fn(),
  setStatus: vi.fn(),
  leave: vi.fn(),
  onBack: undefined as undefined | (() => void),
}));

vi.mock('../src/pages/selection-browser', () => ({
  leaveSelection: (navigate: () => void) => mocks.leave(navigate),
  cancelSelectionExit: vi.fn(),
}));

vi.mock('../src/simulation/satellite-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/simulation/satellite-registry')>()),
  ensureTleSets: mocks.ensureTleSets,
}));
vi.mock('../src/tle-sets/tle-set-loader', () => ({ loadTleSet: vi.fn() }));

vi.mock('../src/pages/mission-control/mission-control-page', () => ({
  MissionControlPage: {
    create: mocks.create,
    getInstance: vi.fn(() => ({ show: mocks.show, hide: vi.fn() })),
  },
}));

vi.mock('../src/pages/mission-loading-screen', () => ({
  MissionLoadingScreen: class {
    fail = mocks.fail;
    dispose = mocks.dispose;
    setStatus = mocks.setStatus;
    constructor(_scenario: unknown, onBack: () => void) {
      mocks.onBack = onBack;
    }
  },
}));

vi.mock('../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      scenario: null,
      data: { title: 'Range Watch' },
      settings: { constellations: [{ id: 'starlink' }] },
    })),
  },
}));

const SCENARIO_PATH = '/campaigns/range-watch/scenarios/watch1';

describe('Router TLE set launch', () => {
  beforeEach(() => {
    Router.destroy();
    EventBus.destroy();
    PluginManager.destroy();
    PluginManager.getInstance().setManifest([]);
    window.history.pushState({}, '', '/');
    for (const mock of Object.values(mocks)) if (vi.isMockFunction(mock)) mock.mockReset();
    mocks.onBack = undefined;
    mocks.leave.mockImplementation((navigate: () => void) => navigate());
  });

  afterEach(() => {
    Router.destroy();
    EventBus.destroy();
  });

  function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('builds the mission page once the sets have loaded', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    Router.getInstance().navigate(SCENARIO_PATH);
    expect(mocks.create).not.toHaveBeenCalled();
    d.resolve();
    await d.promise;
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.show).toHaveBeenCalledTimes(1);
  });

  it('ignores a completed download after the player navigated away', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    const router = Router.getInstance();
    router.navigate(SCENARIO_PATH);
    router.navigate('/');
    d.resolve();
    await d.promise;
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('shows the loading screen failure state with a way back when the download fails', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    Router.getInstance().navigate(SCENARIO_PATH);
    d.reject(new Error('offline'));
    await d.promise.catch(() => {});
    expect(mocks.fail).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('drops a failure that arrives after the player navigated away', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = Router.getInstance();
    router.navigate(SCENARIO_PATH);
    router.navigate('/');
    d.reject(new Error('offline'));
    await d.promise.catch(() => {});
    expect(mocks.fail).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('removes the failure screen when the route changes', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = Router.getInstance();
    router.navigate(SCENARIO_PATH);
    d.reject(new Error('offline'));
    await d.promise.catch(() => {});
    router.navigate('/');
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('shows the loading screen with a download status right away', () => {
    mocks.ensureTleSets.mockReturnValue(deferred().promise);
    Router.getInstance().navigate(SCENARIO_PATH);
    expect(mocks.setStatus).toHaveBeenCalledWith('Downloading satellite data…');
  });

  it('disposes the download screen before the mission page builds', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    Router.getInstance().navigate(SCENARIO_PATH);
    d.resolve();
    await d.promise;
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.dispose.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  });

  it('Retry repeats the download with the original navigation options', async () => {
    const first = deferred();
    const second = deferred();
    mocks.ensureTleSets.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    Router.getInstance().navigate(SCENARIO_PATH, { forceReplay: true });
    first.reject(new Error('offline'));
    await first.promise.catch(() => {});
    const onRetry = mocks.fail.mock.calls[0][1] as () => void;
    expect(onRetry).toBeTypeOf('function');
    onRetry();
    expect(mocks.ensureTleSets).toHaveBeenCalledTimes(2);
    second.resolve();
    await second.promise;
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ forceReplay: true });
    error.mockRestore();
  });

  it('ignores a download that finishes during the selection leave fade', async () => {
    const d = deferred();
    mocks.ensureTleSets.mockReturnValue(d.promise);
    const router = Router.getInstance();
    router.navigate(SCENARIO_PATH);
    let finishFade!: () => void;
    mocks.leave.mockImplementation((navigate: () => void) => {
      finishFade = navigate;
    });
    router.navigate('/');
    d.resolve();
    await d.promise;
    expect(mocks.create).not.toHaveBeenCalled();
    finishFade();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('builds exactly one page when the same route is re-entered and the first download finishes late', async () => {
    const first = deferred();
    const second = deferred();
    mocks.ensureTleSets.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const router = Router.getInstance();
    router.navigate(SCENARIO_PATH);
    router.navigate('/');
    router.navigate(SCENARIO_PATH);
    first.resolve();
    await first.promise;
    expect(mocks.create).not.toHaveBeenCalled();
    second.resolve();
    await second.promise;
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('Back to missions returns to the campaign page', () => {
    mocks.ensureTleSets.mockReturnValue(deferred().promise);
    Router.getInstance().navigate(SCENARIO_PATH);
    mocks.onBack?.();
    expect(window.location.pathname).toBe('/campaigns/range-watch');
  });
});
