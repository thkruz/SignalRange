import { EventBus } from "./events/event-bus";
import { Events } from "./events/events";
import { Footer } from "./pages/layout/footer/footer";
import { Header } from "./pages/layout/header/header";
import { SandboxPage } from "./pages/sandbox-page";
import { ScenarioSelectionPage } from "./pages/scenario-selection";
import { ScenarioManager } from "./scenario-manager";
import { SimulationManager } from "./simulation/simulation-manager";

/**
 * Simple Router for 3 pages: login, student, instructor
 */
export class Router {
  private static instance: Router;
  private currentPath: string = '/';

  private constructor() { }

  static getInstance(): Router {
    if (!Router.instance) {
      Router.instance = new Router();
    }
    return Router.instance;
  }

  init(): void {
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

  navigate(path: string): void {
    globalThis.history.pushState({}, '', path);
    this.handleRoute();
  }

  private handleRoute(): void {
    const path = globalThis.location.pathname;
    this.currentPath = path;

    // Hide all pages
    this.hideAll();

    // Show the appropriate page
    switch (path) {
      case '/sandbox':
        this.showPage('sandbox');
        break;
      case '/scenarios/1':
        this.showPage('scenario1');
        break;
      case '/scenarios/2':
        this.showPage('scenario2');
        break;
      case '/scenarios/3':
        this.showPage('scenario3');
        break;
      case '/':
      default:
        this.showPage('scenarios');
    }

    // Emit route change event
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
  }

  private hideAll(): void {
    ScenarioSelectionPage.getInstance().hide();
    SandboxPage.getInstance()?.hide();
  }

  private showPage(pageName: string): void {
    SimulationManager.destroy();
    switch (pageName) {
      case 'sandbox':
        Header.getInstance().makeSmall(true);
        ScenarioManager.getInstance().scenario = 'sandbox';
        SandboxPage.create();
        SandboxPage.getInstance().show();
        break;
      case 'scenario1':
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        ScenarioManager.getInstance().scenario = 'scenario1';
        SandboxPage.create();
        SandboxPage.getInstance().show();
        break;
      case 'scenario2':
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        ScenarioManager.getInstance().scenario = 'scenario2';
        SandboxPage.create();
        SandboxPage.getInstance().show();
        break;
      case 'scenario3':
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        ScenarioManager.getInstance().scenario = 'scenario3';
        SandboxPage.create();
        SandboxPage.getInstance().show();
        break;
      case 'scenarios':
        Header.getInstance().makeSmall(true);
        Footer.getInstance().makeSmall(true);
        ScenarioSelectionPage.getInstance().show();
        break;
    }
  }

  getCurrentPath(): string {
    return this.currentPath;
  }
}