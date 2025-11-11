import { EventBus } from "./events/event-bus";
import { Events } from "./events/events";
import { SandboxPage } from "./pages/sandbox-page";
import { ScenarioSelectionPage } from "./pages/scenario-selection";

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
        this.showPage('sandbox-page');
        break;
      case '/':
      case '/scenario-selection':
      default:
        this.showPage('scenario-selection-page');
        break;
    }

    // Emit route change event
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
  }

  private hideAll(): void {
    ScenarioSelectionPage.getInstance().hide();
    SandboxPage.getInstance()?.hide();
  }

  private showPage(pageName: string): void {
    switch (pageName) {
      case 'sandbox-page':
        if (!SandboxPage.getInstance()) {
          SandboxPage.create();
        }
        SandboxPage.getInstance().show();
        break;
      case 'scenario-selection-page':
        ScenarioSelectionPage.getInstance().show();
        break;
    }
  }

  getCurrentPath(): string {
    return this.currentPath;
  }
}