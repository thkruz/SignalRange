import { CampaignManager } from "@app/campaigns/campaign-manager";
import { ccsCampaignData, geolocationCampaignData, hamSdrCampaignData, natsCampaignData } from "@app/campaigns/nats/campaign-data";
import { natsEuCampaignData } from "@app/campaigns/nats-eu/campaign-data";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { CampaignSelectionPage } from "@app/pages/campaign-selection";
import { Footer } from "@app/pages/layout/footer/footer";
import { Header } from "@app/pages/layout/header/header";
import { MissionControlPage } from "@app/pages/mission-control/mission-control-page";
import { SandboxPage } from "@app/pages/sandbox-page";
import { ScenarioSelectionPage } from "@app/pages/scenario-selection";
import { ScenarioManager } from "./scenario-manager";
import { SimulationManager } from "@app/simulation/simulation-manager";

/**
 * Navigation options for router
 */
export interface NavigationOptions {
  continueFromCheckpoint?: boolean;
  /** Skip showing completion modal for already-completed scenarios (for replay) */
  forceReplay?: boolean;
}

/**
 * Simple Router for 3 pages: login, student, instructor
 */
export class Router {
  private static instance: Router;
  private currentPath: string = '/';
  private navigationOptions_: NavigationOptions = {};

  private constructor() { }

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

    // Handle initial route
    this.handleRoute();
  }

  navigate(path: string, options?: NavigationOptions): void {
    this.navigationOptions_ = options || {};
    globalThis.history.pushState({}, '', path);
    this.handleRoute();
  }

  private handleRoute(): void {
    const path = globalThis.location.pathname;
    this.currentPath = path;

    // Tag <body> with the active campaign so per-campaign themes
    // (e.g. .campaign-nats-eu) can scope CSS variable overrides
    this.updateCampaignBodyClass_(/^\/campaigns\/([^/]+)/.exec(path)?.[1]);

    // Hide all pages
    this.hideAll();

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
      // Unknown route - redirect to campaign selection
      this.navigate('/');
      return;
    }

    // Emit route change event
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
  }

  private updateCampaignBodyClass_(campaignId?: string): void {
    const body = document.body;
    for (const cls of Array.from(body.classList)) {
      if (cls.startsWith('campaign-')) {
        body.classList.remove(cls);
      }
    }
    if (campaignId) {
      body.classList.add(`campaign-${campaignId}`);
    }
  }

  private hideAll(): void {
    CampaignSelectionPage.getInstance().hide();
    ScenarioSelectionPage.getInstance().hide();
    SandboxPage.getInstance()?.hide();
    MissionControlPage.getInstance()?.hide();
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