import { eventBus, Events } from './EventBus';

/**
 * Simple Router for 3 pages: login, student, instructor
 */
export class Router {
  private currentPath: string = '/';

  constructor() {
    this.init();
  }

  private init(): void {
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

  public navigate(path: string): void {
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
      case '/student':
        this.showPage('student-page');
        break;
      case '/instructor':
        this.showPage('instructor-page');
        break;
      case '/login':
      case '/':
      default:
        this.showPage('login-page');
        break;
    }

    // Emit route change event
    eventBus.emit(Events.ROUTE_CHANGED, { path });
  }

  private hideAll(): void {
    const pages = ['login-page', 'student-page', 'instructor-page'];
    for (const id of pages) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }

  private showPage(id: string): void {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
  }

  public getCurrentPath(): string {
    return this.currentPath;
  }
}