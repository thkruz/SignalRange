import { BaseElement } from '../components/base-element';
import { eventBus } from '../events/event-bus';
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
    this.loadCSS();
    this.render();
    this.addListeners();
    this.initialize();
  }

  /**
   * Load equipment-specific CSS
   * Override to load custom CSS files
   */
  protected loadCSS(): void {
    // Base implementation - equipment can override
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
  protected emit(event: string, data?: any): void {
    eventBus.emit(event, { unit: this.unit, teamId: this.teamId, ...data });
  }

  /**
   * Helper to listen to events
   */
  protected on(event: string, callback: (data: any) => void): () => void {
    return eventBus.on(event, callback);
  }
}