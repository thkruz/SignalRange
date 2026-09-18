import { CampaignManager } from '@app/campaigns/campaign-manager';
import { ccsCampaignData, geolocationCampaignData, hamSdrCampaignData, natsCampaignData } from '@app/campaigns/nats/campaign-data';
import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { CampaignSelectionPage } from '@app/pages/campaign-selection';
import { Footer } from '@app/pages/layout/footer/footer';
import { Header } from '@app/pages/layout/header/header';
import { MissionControlPage } from '@app/pages/mission-control/mission-control-page';
import { SandboxPage } from '@app/pages/sandbox-page';
import { ScenarioSelectionPage } from '@app/pages/scenario-selection';
import { PluginManager } from '@app/plugins/plugin-manager';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { ScenarioManager } from './scenario-manager';

/**
 * Navigation options for router
 */
export interface NavigationOptions {
  continueFromCheckpoint?: boolean;
  /** Skip showing completion modal for already-completed scenarios (for replay) */
  forceReplay?: boolean;
}

/**
 * A route contributed from outside the core page set (private edition tools).
 * `pattern` is tested against `location.pathname`; named capture groups become
 * the params passed to `show`. `hide` is called whenever any other route wins.
 */
export interface ExtraRoute {
  pattern: RegExp;
  show: (params: Record<string, string>, path: string) => void;
  hide?: () => void;
}

/**
 * Simple Router for 3 pages: login, student, instructor
 */
export class Router {
  private static instance: Router;
  private currentPath: string = '/';
  private navigationOptions_: NavigationOptions = {};
  private readonly extraRoutes_: ExtraRoute[] = [];
  /**
   * Until every plugin has registered, an unknown path is held rather than
   * redirected to '/' (a deep link to a plugin route survives the async
   * import) and scenario pages are held too (a sandbox loadout may name a
   * plugin antenna). PluginManager.isReady is true from the start when the
   * manifest has nothing to load, so the plugin-free build keeps handling
   * routes synchronously.
   */
  private pluginsReady_ = PluginManager.getInstance().isReady;
  /** Path deferred while plugins were loading; replayed once they are ready. */
  private heldPath_: string | null = null;

  private constructor() {}

  static getInstance(): Router {
    if (!Router.instance) {
      Router.instance = new Router();
    }
    return Router.instance;
  }

  init(): void {
    // Register campaigns
    const campaignManager = CampaignManager.getInstance();
    campaignManager.registerCampaign(natsCampaignData);
    campaignManager.registerCampaign(natsEuCampaignData);
    campaignManager.registerCampaign(hamSdrCampaignData);
    campaignManager.registerCampaign(ccsCampaignData);
    campaignManager.registerCampaign(geolocationCampaignData);

    // Listen for popstate (back/forward buttons)
    globalThis.addEventListener('popstate', () => this.handleRoute());

    // Intercept link clicks
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' && target.dataset.link) {
        e.preventDefault();
        const href = target.getAttribute('href');
        if (href) this.navigate(href);
      }
    });

    // Plugins (private edition tools, external plugins) register routes and
    // equipment through the PluginManager, which App starts before init().
    // Nothing to wait for in a plugin-free build: isReady is already true.
    const plugins = PluginManager.getInstance();

    if (!plugins.isReady) {
      plugins.ready
        .catch((err: unknown) => console.warn('[router] plugins unavailable', err))
        .finally(() => {
          this.pluginsReady_ = true;
          if (this.heldPath_ !== null) {
            this.heldPath_ = null;
            this.handleRoute();
          }
        });
    }

    // Handle initial route
    this.handleRoute();
  }

  /** Pages that build equipment or may be a plugin route wait for plugins. */
  private static needsPlugins_(path: string): boolean {
    return path === '/sandbox' || /^\/campaigns\/[^/]+\/scenarios\/[^/]+$/u.test(path) || path === '/mission-control';
  }

  /** Register a route outside the core page set. See ExtraRoute. */
  addRoute(route: ExtraRoute): void {
    this.extraRoutes_.push(route);
  }

  private matchExtraRoute_(path: string): { route: ExtraRoute; params: Record<string, string> } | null {
    for (const route of this.extraRoutes_) {
      const match = route.pattern.exec(path);
      if (match) {
        return { route, params: { ...(match.groups ?? {}) } };
      }
    }
    return null;
  }

  navigate(path: string, options?: NavigationOptions): void {
    this.navigationOptions_ = options || {};
    globalThis.history.pushState({}, '', path);
    this.handleRoute();
  }

  private handleRoute(): void {
    const path = globalThis.location.pathname;
    this.currentPath = path;

    // Tag <body> with the active campaign and its chrome variant so per-campaign
    // themes (e.g. .campaign-nats-eu) can scope CSS variable overrides and
    // shared layouts (e.g. .chrome-tactical) can scope structure
    this.updateCampaignBodyClass_(/^\/campaigns\/([^/]+)/.exec(path)?.[1]);

    // Hide all pages
    this.hideAll();

    // Plugin antennas and plugin routes must exist before these pages build;
    // the path is replayed from init() once the PluginManager settles.
    if (!this.pluginsReady_ && Router.needsPlugins_(path)) {
      this.heldPath_ = path;
      return;
    }

    // Extra (plugin) routes take precedence over the core page set
    const extra = this.matchExtraRoute_(path);
    if (extra) {
      SimulationManager.destroy();
      extra.route.show(extra.params, path);
      EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
      return;
    }

    // Route pattern matching
    if (path === '/') {
      // Root - show campaign selection
      this.showPage('campaigns');
    } else if (path === '/mission-control') {
      // Mission Control - app-shell interface
      this.showPage('mission-control');
    } else if (path === '/sandbox') {
      // Sandbox - special case
      this.showPage('sandbox');
    } else if (path.match(/^\/campaigns\/([^/]+)$/)) {
      // /campaigns/:campaignId - show scenario selection for campaign
      const match = path.match(/^\/campaigns\/([^/]+)$/);
      const campaignId = match?.[1];
      this.showPage('campaign-scenarios', { campaignId });
    } else if (path.match(/^\/campaigns\/([^/]+)\/scenarios\/([^/]+)$/)) {
      // /campaigns/:campaignId/scenarios/:scenarioId - show simulation
      const match = path.match(/^\/campaigns\/([^/]+)\/scenarios\/([^/]+)$/);
      const campaignId = match?.[1];
      const scenarioId = match?.[2];
      this.showPage('scenario', { campaignId, scenarioId });
    } else if (path === '/scenarios/1') {
      // Legacy route - redirect to new format
      this.navigate('/campaigns/nats/scenarios/scenario1', this.navigationOptions_);
      return;
    } else if (path === '/scenarios/2') {
      // Legacy route - redirect to new format
      this.navigate('/campaigns/nats/scenarios/first-light2', this.navigationOptions_);
      return;
    } else if (path === '/scenarios/3') {
      // Legacy route - redirect to new format
      this.navigate('/campaigns/nats/scenarios/scenario3', this.navigationOptions_);
      return;
    } else {
      if (!this.pluginsReady_) {
        // Plugin routes still loading; re-evaluated once they register
        this.heldPath_ = path;
        return;
      }
      // Unknown route - redirect to campaign selection
      this.navigate('/');
      return;
    }

    // Emit route change event
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
  }

  /**
   * Tag <body> with the active campaign and the chrome variant it wears.
   *
   * Two classes, two jobs: `campaign-<id>` carries the hue (one accent per
   * campaign), `chrome-<variant>` carries layout/typography shared by the
   * campaigns that are meant to feel like the same system. A campaign that
   * declares no variant gets `chrome-standard`, which is the historic layout
   * and has no rules of its own.
   */
  private updateCampaignBodyClass_(campaignId?: string): void {
    const body = document.body;
    for (const cls of Array.from(body.classList)) {
      if (cls.startsWith('campaign-') || cls.startsWith('chrome-')) {
        body.classList.remove(cls);
      }
    }
    if (campaignId) {
      body.classList.add(`campaign-${campaignId}`);

      const variant = CampaignManager.getInstance().getCampaign(campaignId)?.chromeVariant ?? 'standard';

      body.classList.add(`chrome-${variant}`);
    }
  }

  private hideAll(): void {
    CampaignSelectionPage.getInstance().hide();
    ScenarioSelectionPage.getInstance().hide();
    SandboxPage.getInstance()?.hide();
    MissionControlPage.getInstance()?.hide();
    for (const route of this.extraRoutes_) {
      route.hide?.();
    }
  }

  private showPage(pageName: string, params?: { campaignId?: string; scenarioId?: string }): void {
    SimulationManager.destroy();
    switch (pageName) {
      case 'campaigns':
        // Campaign selection page
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        CampaignSelectionPage.getInstance().show();
        break;
      case 'campaign-scenarios':
        // Scenario selection for a specific campaign
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        if (params?.campaignId) {
          ScenarioSelectionPage.getInstance().setCampaign(params.campaignId);
        }
        ScenarioSelectionPage.getInstance().show();
        break;
      case 'sandbox':
        // Sandbox mode
        Header.getInstance().makeSmall(true);
        ScenarioManager.getInstance().scenario = 'sandbox';
        SandboxPage.create(this.navigationOptions_);
        SandboxPage.getInstance().show();
        break;
      case 'scenario':
        // Scenario simulation
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        if (params?.scenarioId) {
          ScenarioManager.getInstance().scenario = params.scenarioId;
          MissionControlPage.create(this.navigationOptions_);
          MissionControlPage.getInstance().show();
        }
        break;
      case 'mission-control':
        // Mission Control interface
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        MissionControlPage.create();
        MissionControlPage.getInstance().show();
        break;
    }

    // Reset navigation options after use
    this.navigationOptions_ = {};
  }

  getCurrentPath(): string {
    return this.currentPath;
  }

  static destroy(): void {
    Router.instance = null;
  }
}
