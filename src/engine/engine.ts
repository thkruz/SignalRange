import { Milliseconds } from 'ootk';
import { EventBus } from './events/event-bus';
import { EventBusEvent } from './events/event-bus-events';
import { errorManagerInstance } from './utils/errorManager';
import { isThisNode } from './utils/isThisNode';


export interface Application {
  isReady: boolean;
  init: () => void;
  update: () => void;
  draw: () => void;
}

export class Engine {
  private static readonly instance_: Engine;
  private readonly containerElementId = 'root';
  /** Flag to enable/disable global error trapping */
  isGlobalErrorTrapOn = true;

  static getInstance(): Engine {
    if (!Engine.instance_) {
      throw new Error('Engine instance not initialized');
    }
    return Engine.instance_;
  }

  private isRunning_ = false;
  private isReady_ = false;
  containerRoot: HTMLElement | null = null;

  private readonly application_: Application;
  private isPaused: boolean = false;
  private lastFrameTime_ = <Milliseconds>0;

  // Core engine systems
  readonly eventBus: EventBus;

  constructor(application: Application) {
    // Initialize core engine systems
    this.application_ = application;
    this.eventBus = EventBus.getInstance();

    // find container root
    this.containerRoot = document.getElementById(this.containerElementId);
    if (!this.containerRoot) {
      errorManagerInstance.warn('Root element not found!');
    }
  }

  init() {
    this.addErrorTrap_();

    this.eventBus.init();
    this.application_.init();

    this.isReady_ = true;
  }

  private addErrorTrap_() {
    globalThis.addEventListener('error', (e: ErrorEvent) => {
      if (!this.isGlobalErrorTrapOn) {
        return;
      }
      if (isThisNode()) {
        throw e.error;
      }
      errorManagerInstance.error(e.error, 'Global Error Trapper');
    });
  }

  run() {
    if (!this.isReady_) {
      throw new Error('Application is not ready');
    }

    if (this.isRunning_) {
      throw new Error('Application is already running');
    }

    this.gameLoop_();

    // Main game loop
    this.isRunning_ = true;
  }

  private gameLoop_(timestamp: number = 0): void {
    requestAnimationFrame(this.gameLoop_.bind(this));
    const dt = <Milliseconds>(timestamp - this.lastFrameTime_);

    this.lastFrameTime_ = <Milliseconds>timestamp;

    if (!this.isPaused && this.application_.isReady) {
      this.update_(dt); // Do any per frame calculations
      this.draw_(dt);
    }
  }

  private update_(dt = <Milliseconds>0) {
    this.application_.update();
    this.eventBus.emit(EventBusEvent.update, dt);
  }

  private draw_(dt = <Milliseconds>0) {
    this.application_.draw();
    this.eventBus.emit(EventBusEvent.draw, dt);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    this.isRunning_ = false;
  }
}
