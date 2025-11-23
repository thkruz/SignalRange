import { BaseElement } from './components/base-element';
import { getEl } from './engine/utils/get-el';
import { Body } from './pages/layout/body/body';
import { Footer } from './pages/layout/footer/footer';
import { Header } from './pages/layout/header/header';
import { SandboxPage } from './pages/sandbox-page';
import { ScenarioSelectionPage } from './pages/scenario-selection';
import { Router } from './router';
import { SimulationManager } from './simulation/simulation-manager';
import { Auth } from './user-account/auth';
import { initUserDataService } from './user-account/user-data-service';
import { EventBus } from './events/event-bus';
import { Events } from './events/events';

/**
 * Main Application Class
 * Orchestrates the entire application lifecycle
 *
 * The game loop should be in SimulationManager to allow easy clear/reset without impacting
 * the rest of the app.
 */
export class App extends BaseElement {
  private static instance_: App;
  protected html_: string = ''; // No direct HTML for App
  private readonly router = Router.getInstance();
  private static authReadyPromise_: Promise<void>;

  private constructor() {
    super();
  }

  /**
   * Promise that resolves when auth is initialized and ready to use
   */
  static get authReady(): Promise<void> {
    return this.authReadyPromise_;
  }

  static create(): App {
    if (App.instance_) {
      throw new Error("App instance already exists.");
    }

    this.instance_ = new App();
    window.signalRange = this.instance_;

    // Initialize UserDataService with configuration from .env
    // The getAccessToken function returns the cached token synchronously
    let cachedAccessToken: string | null = null;

    // Initialize auth and cache the token - track when it's ready
    this.authReadyPromise_ = Auth.getSession().then((session) => {
      cachedAccessToken = session?.access_token || null;
    });

    // Listen for auth state changes to keep token updated
    Auth.onAuthStateChange((_event, _user, _profile, accessToken) => {
      cachedAccessToken = accessToken;
    });

    initUserDataService({
      apiBaseUrl: process.env.PUBLIC_USER_API_URL || 'https://user.keeptrack.space',
      getAccessToken: () => cachedAccessToken,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
    });

    this.instance_.init_();

    return App.instance_;
  }

  static getInstance(): App {
    return App.instance_;
  }

  protected initDom_(): HTMLElement {
    const rootDom = getEl('root');

    // Initialize layout components
    Header.create(rootDom.id);
    Body.create(rootDom.id);
    Footer.create(rootDom.id);

    SimulationManager.getInstance();

    // Initialize router
    this.router.init();

    return rootDom;
  }

  protected addEventListeners_(): void {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /**
   * Trigger a sync event to notify components to save their state
   */
  sync(): void {
    EventBus.getInstance().emit(Events.SYNC);
  }

  static __resetAll__(): void {
    Header['instance_'] = null;
    Body['instance_'] = null;
    Footer['instance_'] = null;
    ScenarioSelectionPage['instance_'] = null;
    SandboxPage['instance_'] = null;
    SimulationManager['instance_'] = null;
    App.instance_ = null;
  }
}