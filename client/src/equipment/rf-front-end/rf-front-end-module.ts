import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { qs } from "@app/engine/utils/query-selector";
import { RFFrontEnd } from './rf-front-end';

/**
 * Abstract base class for RF Front End modules
 * Provides common functionality for all RF modules (LNB, OMT, BUC, etc.)
 */
export abstract class RFFrontEndModule<TState> {
  protected readonly uniqueId: string;
  protected readonly rfFrontEnd_: RFFrontEnd;
  protected html_: string = '';
  protected dom_?: HTMLElement;
  protected state_: TState;
  protected lastDraw_: number = 0;
  protected lastRenderState_: string = '';

  constructor(state: TState, rfFrontEnd: RFFrontEnd, modulePrefix: string, unit: number = 1) {
    this.state_ = state;
    this.rfFrontEnd_ = rfFrontEnd;
    this.uniqueId = `${modulePrefix}-${unit}`;

    // Register event listeners
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.DRAW, () => {
      const now = Date.now();
      if (now - this.lastDraw_ > 500) {
        this.syncDomWithState_();
        this.lastDraw_ = now;
      }
    });
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState_.bind(this));
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  get state(): TState {
    return this.state_;
  }

  /**
   * Add event listeners for user interactions
   * Must be implemented by subclasses
   */
  abstract addEventListeners(cb: (state: TState) => void): void;

  /**
   * Update component state and check for faults
   * Must be implemented by subclasses
   */
  abstract update(): void;

  /**
   * Sync state from external source
   * Can be overridden by subclasses for custom behavior
   */
  sync(state: Partial<TState>): void {
    this.state_ = { ...this.state_, ...state };
    this.syncDomWithState_();
  }

  /**
   * Check if module has alarms
   * Must be implemented by subclasses
   */
  abstract getAlarms(): string[];

  /**
   * Update the DOM to reflect current state
   * Must be implemented by subclasses
   */
  protected abstract syncDomWithState_(): void;

  /**
   * Helper method to check if state has changed
   */
  protected hasStateChanged(): boolean {
    const currentState = JSON.stringify(this.state);
    if (currentState === this.lastRenderState_) {
      return false;
    }
    this.lastRenderState_ = currentState;
    return true;
  }
}
