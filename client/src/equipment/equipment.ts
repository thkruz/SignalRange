import { eventBus } from '../events/event-bus';
import './equipment.css';

/**
 * Base Equipment Class
 * All physical equipment should extend this class
 * Provides standard lifecycle methods and shared functionality
 */
export abstract class Equipment {
  protected element: HTMLElement;
  protected readonly unit: number;
  protected readonly teamId: number;

  constructor(parentId: string, unit: number, teamId: number = 1) {
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
   * Render the equipment HTML structure
   * MUST be implemented by child classes
   */
  protected abstract render(): void;

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
   * Cleanup and destroy the equipment
   * Can be overridden by child classes for custom cleanup
   */
  public destroy(): void {
    // Remove all event listeners for this equipment
    this.removeListeners();
    // Clear the element
    this.element.innerHTML = '';
  }

  /**
   * Remove event listeners
   * Can be overridden by child classes
   */
  protected removeListeners(): void {
    // Default implementation - child classes can override
  }

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
   * Helper to create DOM elements
   */
  protected createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
      className?: string;
      id?: string;
      innerHTML?: string;
      textContent?: string;
    }
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (options?.className) {
      element.className = options.className;
    }
    if (options?.id) {
      element.id = options.id;
    }
    if (options?.innerHTML) {
      element.innerHTML = options.innerHTML;
    }
    if (options?.textContent) {
      element.textContent = options.textContent;
    }

    return element;
  }

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