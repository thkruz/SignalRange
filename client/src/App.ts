import { Router } from './Router';
import { Header } from './components/layout/Header';
import { Body } from './components/layout/Body';
import { Footer } from './components/layout/Footer';

/**
 * Main Application Class
 * Orchestrates the entire application lifecycle
 */
export class App {
  private readonly router: Router;
  private readonly header: Header;
  private readonly body: Body;
  private readonly footer: Footer;

  constructor(private readonly rootElement: HTMLElement) {
    this.router = new Router();
    console.log('Router Initialized:', this.router);
    this.header = new Header();
    this.body = new Body();
    this.footer = new Footer();
  }

  /**
   * Initialize the application
   */
  public init(): void {
    this.render();
    this.setupEventListeners();
  }

  /**
   * Render the main application structure
   */
  private render(): void {
    // Clear root element
    this.rootElement.innerHTML = '';

    // Create main structure
    const headerElement = this.header.render();
    const bodyElement = this.body.render();
    const footerElement = this.footer.render();

    // Append to root
    this.rootElement.appendChild(headerElement);
    this.rootElement.appendChild(bodyElement);
    this.rootElement.appendChild(footerElement);
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