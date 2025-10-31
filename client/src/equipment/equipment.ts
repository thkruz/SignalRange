import { BaseElement } from '../components/base-element';
import { EventBus, EventMap } from '../events/event-bus';
import { Events } from '../events/events';
import './equipment.css';

/**
 * Base Equipment Class
 * All physical equipment should extend this class
 * Provides standard lifecycle methods and shared functionality
 */
export abstract class Equipment extends BaseElement {
  protected element: HTMLElement;
  protected readonly unit: number;
  protected readonly teamId: number;

  constructor(parentId: string, unit: number, teamId: number = 1) {
    super();
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    this.element = parent;
    this.unit = unit;
    this.teamId = teamId;
  }

  // Standard initialization sequence
  protected build(): void {
    this.render();
    this.addListeners();
    this.initialize();
  }

  /**
   * Add event listeners
   * MUST be implemented by child classes
   */
  protected abstract addListeners(): void;

  /**
   * Initialize equipment state and start operations
   * MUST be implemented by child classes
   */
  protected abstract initialize(): void;

  /**
   * Update equipment state
   * Can be used for hot-reloading or external state changes
   */
  public abstract update(data: any): void;

  /**
   * Get current equipment configuration
   */
  public abstract getConfig(): any;

  /**
   * Helper to emit equipment events
   */
  protected emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    EventBus.getInstance().emit(event, ...args);
  }

  /**
   * Helper to listen to events
   */
  protected on<T extends Events>(event: T, callback: (...args: EventMap[T]) => void): void {
    EventBus.getInstance().on(event, callback);
  }
}