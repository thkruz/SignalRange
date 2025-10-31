import { Logger } from "../logging/logger";

/**
 * EventBus - Simple pub/sub for cross-component communication
 * Replaces the need for prop drilling or complex state management
 */
export class EventBus {
  private static instance: EventBus;
  private readonly events: Map<string, Array<(data?: any) => void>> = new Map();

  private constructor() { }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   */
  public on(event: string, callback: (data?: any) => void): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    this.events.get(event)!.push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  public off(event: string, callback: (data?: any) => void): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  public emit(event: string, data?: any): void {
    Logger.log(`EventBus: Emitting event '${event}' with data:`, data);
    const callbacks = this.events.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }

  /**
   * Clear all listeners for an event
   */
  public clear(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  /**
   * Get all registered events (for debugging)
   */
  public getEvents(): string[] {
    return Array.from(this.events.keys());
  }
}
