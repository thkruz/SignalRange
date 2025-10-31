import { BaseElement } from './components/base-element';
import { Body } from './components/layout/body';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';
import { AbstractPage } from './pages/abstract-page';
import { LoginPage } from './pages/login-page';
import { StudentPage } from './pages/student-page';
import { Router } from './router';
import { html } from './utils';

/**
 * Main Application Class
 * Orchestrates the entire application lifecycle
 */
export class App extends BaseElement {
  private readonly rootElement: HTMLElement;
  private readonly router = new Router();
  private readonly header = new Header();
  private readonly body = new Body();
  private readonly footer = new Footer();
  pages: { [key: string]: AbstractPage } = {};
  pagesConstructors: Array<new (...args: any[]) => AbstractPage> = [
    LoginPage,
    StudentPage,
  ];

  constructor() {
    super();
    const root = document.getElementById('root');
    if (!root) {
      throw new Error('Root element not found');
    }
    this.rootElement = root;
  }

  /**
   * Initialize the application
   */
  public init(): void {
    // First render main layout so we have DOM containers available
    this.render();

    for (const PageClass of this.pagesConstructors) {
      this.pages[PageClass.name] = new PageClass();
      this.pages[PageClass.name].init();
    }

    this.router.init();

    // Initialize the router to set up routes and navigation
    this.setupEventListeners();
  }

  /**
   * Render the main application structure
   */
  render(): HTMLElement {
    this.rootElement.innerHTML = html`
      ${this.header.render().outerHTML}
      ${this.body.render().outerHTML}
      ${this.footer.render().outerHTML}
    `;

    return this.rootElement;
  }

  /**
   * Setup global event listeners
   */
  protected setupEventListeners(): void {
    // Prevent context menu
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}