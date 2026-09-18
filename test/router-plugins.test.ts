import { vi } from 'vitest';
import { EventBus } from '../src/events/event-bus';
import { Events } from '../src/events/events';
import { MissionControlPage } from '../src/pages/mission-control/mission-control-page';
import { Router } from '../src/router';

/**
 * Router + PluginManager hand-off. A plugin may contribute the antenna a
 * sandbox loadout names or a route of its own, so the router must not build a
 * scenario page or redirect an unknown path while plugins are still loading.
 * Everything else about the router is covered in router.test.ts.
 */

const mocks = vi.hoisted(() => {
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  return {
    pluginManager: { isReady: false, ready },
    resolveReady: () => resolveReady(),
  };
});

vi.mock('../src/plugins/plugin-manager', () => ({
  PluginManager: { getInstance: () => mocks.pluginManager },
}));

vi.mock('../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: vi.fn(() => ({ registerCampaign: vi.fn(), getCampaign: vi.fn(() => undefined) })),
  },
}));

vi.mock('../src/campaigns/nats/campaign-data', () => ({
  natsCampaignData: {},
  natsEuCampaignData: {},
  hamSdrCampaignData: {},
  ccsCampaignData: {},
  geolocationCampaignData: {},
}));

vi.mock('../src/campaigns/nats-eu/campaign-data', () => ({ natsEuCampaignData: {} }));

vi.mock('../src/pages/campaign-selection', () => ({
  CampaignSelectionPage: { getInstance: vi.fn(() => ({ show: vi.fn(), hide: vi.fn() })) },
}));

vi.mock('../src/pages/scenario-selection', () => ({
  ScenarioSelectionPage: { getInstance: vi.fn(() => ({ show: vi.fn(), hide: vi.fn(), setCampaign: vi.fn() })) },
}));

vi.mock('../src/pages/sandbox-page', () => ({
  SandboxPage: { create: vi.fn(), getInstance: vi.fn(() => ({ show: vi.fn(), hide: vi.fn() })) },
}));

vi.mock('../src/pages/mission-control/mission-control-page', () => ({
  MissionControlPage: { create: vi.fn(), getInstance: vi.fn(() => ({ show: vi.fn(), hide: vi.fn() })) },
}));

vi.mock('../src/pages/layout/header/header', () => ({ Header: { getInstance: vi.fn(() => ({ makeSmall: vi.fn() })) } }));
vi.mock('../src/pages/layout/footer/footer', () => ({ Footer: { getInstance: vi.fn(() => ({ makeSmall: vi.fn() })) } }));
vi.mock('../src/scenario-manager', () => ({ ScenarioManager: { getInstance: vi.fn(() => ({ scenario: null })) } }));
vi.mock('../src/simulation/simulation-manager', () => ({ SimulationManager: { destroy: vi.fn() } }));

describe('Router while plugins load', () => {
  beforeEach(() => {
    Router.destroy();
    EventBus.destroy();
    window.history.pushState({}, '', '/campaigns/nats/scenarios/nats-sandbox');
    vi.mocked(MissionControlPage.create).mockClear();
  });

  afterEach(() => {
    Router.destroy();
    EventBus.destroy();
  });

  it('holds a scenario route until PluginManager.ready settles, then builds it once', async () => {
    const router = Router.getInstance();
    const routeChanges: string[] = [];

    EventBus.getInstance().on(Events.ROUTE_CHANGED, ({ path }) => routeChanges.push(path));

    router.init();

    expect(MissionControlPage.create).not.toHaveBeenCalled();
    expect(routeChanges).toEqual([]);

    mocks.resolveReady();
    await mocks.pluginManager.ready;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(MissionControlPage.create).toHaveBeenCalledTimes(1);
    expect(routeChanges).toEqual(['/campaigns/nats/scenarios/nats-sandbox']);
  });

  it('lets a plugin route registered during loading claim a deep link', async () => {
    window.history.replaceState({}, '', '/plugin-page/42');

    const router = Router.getInstance();
    const show = vi.fn();
    const pushState = vi.spyOn(window.history, 'pushState');

    router.init();

    // Unknown path, plugins pending: neither shown nor redirected to '/'.
    expect(show).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalledWith({}, '', '/');

    // A plugin registers its route from register(), i.e. before ready settles.
    router.addRoute({ pattern: /^\/plugin-page\/(?<id>\d+)$/u, show });

    expect(show).not.toHaveBeenCalled();

    mocks.resolveReady();
    await mocks.pluginManager.ready;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(show).toHaveBeenCalledWith({ id: '42' }, '/plugin-page/42');
    pushState.mockRestore();
  });
});
