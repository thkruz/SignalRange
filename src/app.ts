import { BaseElement } from './components/base-element';
import { getEl } from './engine/utils/get-el';
import { EventBus } from './events/event-bus';
import { Events } from './events/events';
import { Body } from './pages/layout/body/body';
import { Footer } from './pages/layout/footer/footer';
import { Header } from './pages/layout/header/header';
import { SandboxPage } from './pages/sandbox-page';
import { ScenarioSelectionPage } from './pages/scenario-selection';
import { StudentEquipment } from './pages/student-page/student-equipment';
import { Router } from './router';
import { SimulationManager } from './simulation/simulation-manager';

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
  equipment: StudentEquipment;
  isDeveloperMode = false;
  private readonly router = Router.getInstance();

  private constructor() {
    super();
  }

  static create(): App {
    if (App.instance_) {
      throw new Error("App instance already exists.");
    }

    App.instance_ = new App();
    window.signalRange = App.instance_;
    SimulationManager.getInstance();
    App.instance_.init_();
    EventBus.getInstance().emit(Events.DOM_READY);


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

    // Initialize pages
    ScenarioSelectionPage.create();
    SandboxPage.create();

    SimulationManager.getInstance();

    // Initialize router
    this.router.add(ScenarioSelectionPage.getInstance());
    this.router.add(SandboxPage.getInstance());
    this.router.init();

    return rootDom;
  }

  protected addEventListeners_(): void {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
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