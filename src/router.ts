import { EventBus } from "./events/event-bus";
import { Events } from "./events/events";
import { BasePage } from "./pages/base-page";

/**
 * Simple Router for 3 pages: login, student, instructor
 */
export class Router {
  private currentPath: string = '/';
  private pages_: { [key: string]: BasePage } = {};

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

  add(page: BasePage): void {
    this.pages_[page.id] = page;
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
      case '/':
      case '/student':
        this.showPage('student-page');
        break;
      case '/instructor':
        this.showPage('instructor-page');
        break;
      case '/login':
      default:
        this.showPage('login-page');
        break;
    }

    // Emit route change event
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path });
  }

  private hideAll(): void {
    for (const pageName in this.pages_) {
      this.pages_[pageName].hide();
    }
  }

  private showPage(pageName: string): void {
    this.pages_[pageName].show();
  }

  getCurrentPath(): string {
    return this.currentPath;
  }
}