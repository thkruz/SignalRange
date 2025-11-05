import { BaseElement } from './components/base-element';
import { Milliseconds } from './engine/ootk/src/main';
import { getEl } from './engine/utils/get-el';
import { EventBus } from './events/event-bus';
import { Events } from './events/events';
import { Body } from './pages/layout/body/body';
import { Footer } from './pages/layout/footer/footer';
import { Header } from './pages/layout/header/header';
import { LoginPage } from './pages/login-page';
import { StudentPage } from './pages/student-page';
import { StudentEquipment } from './pages/student-page/student-equipment';
import { Router } from './router';

/**
 * Main Application Class
 * Orchestrates the entire application lifecycle
 */
export class App extends BaseElement {
  private static instance_: App;
  protected html_: string = ''; // No direct HTML for App
  equipment: StudentEquipment;
  isDeveloperMode = false;
  private readonly router = new Router();
  /** Delta time between frames in milliseconds */
  dt = 0 as Milliseconds;

  private constructor() {
    super();
  }

  static create(): App {
    if (App.instance_) {
      throw new Error("App instance already exists.");
    }

    App.instance_ = new App();
    App.instance_.init_();
    App.instance_.gameLoop_();

    window.signalRange = App.instance_;

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
    LoginPage.create();
    StudentPage.create();

    // Initialize router
    this.router.add(LoginPage.getInstance());
    this.router.add(StudentPage.getInstance());
    this.router.init();

    return rootDom;
  }

  protected addEventListeners_(): void {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private lastFrameTime = performance.now();

  private gameLoop_(): void {
    const now = performance.now();
    this.dt = (now - this.lastFrameTime) as Milliseconds;
    this.lastFrameTime = now;

    this.update(this.dt);
    this.draw(this.dt);
    requestAnimationFrame(this.gameLoop_.bind(this));
  }

  private update(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.UPDATE, _dt);
  }

  private draw(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.DRAW, _dt);
  }

  sync(): void {
    EventBus.getInstance().emit(Events.SYNC);
  }
}