import { Body } from './components/layout/body';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';
import { LoginPage } from './pages/login-page';
import { StudentPage } from './pages/student-page';
import { Router } from './router';
import { html } from './utils';

/**
 * Main Application Class
 * Orchestrates the entire application lifecycle
 */
export class App {
  router!: Router;
  private readonly header: Header;
  private readonly body: Body;
  private readonly footer: Footer;
  pages: {
    login: LoginPage | null;
    student: StudentPage | null;
  } = {
      login: null,
      student: null,
    };

  constructor(private readonly rootElement: HTMLElement) {
    this.header = new Header();
    this.body = new Body();
    this.footer = new Footer();
  }

  /**
   * Initialize the application
   */
  public init(): void {
    // First render main layout so we have DOM containers available
    this.render();

    // Create page containers inside the body content area
    const contentArea = this.rootElement.querySelector('.body-content');
    if (contentArea) {
      const pageKeys: Array<keyof typeof this.pages> = ['login', 'student'];
      for (const key of pageKeys) {
        // Use a default id if the page is not yet instantiated
        const id = `${key}-page`;
        const pageEl = document.createElement('div');
        pageEl.id = id;
        contentArea.appendChild(pageEl);
      }
    }

    // Initialize router after the page placeholders exist
    this.router = new Router();
    this.pages.login = new LoginPage();
    this.pages.student = new StudentPage();

    // Initialize the router to set up routes and navigation
    this.pages.login.init();
    this.pages.student.init();
    this.setupEventListeners();
  }

  /**
   * Render the main application structure
   */
  private render(): void {
    this.rootElement.innerHTML = html`
      ${this.header.render().outerHTML}
      ${this.body.render().outerHTML}
      ${this.footer.render().outerHTML}
    `;
  }

  /**
   * Setup global event listeners
   */
  private setupEventListeners(): void {
    // Prevent context menu
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /**
   * Cleanup and destroy the application
   */
  public destroy(): void {
    this.rootElement.innerHTML = '';
  }
}