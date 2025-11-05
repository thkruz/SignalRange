import { Logger } from "../logging/logger";
import { EventMap, Events } from "./events";

/**
 * EventBus - Simple pub/sub for cross-component communication
 * Replaces the need for prop drilling or complex state management
 */
export class EventBus {
  private static instance: EventBus;
  private readonly events: {
    [K in Events]?: Array<(...args: EventMap[K]) => void>;
  } = {};

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
  public on<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]!.push(cb);
  }

  /**
 * Emit an event
 */
  public emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    Logger.log(`EventBus: Emitting event '${event}' with args:`, args);
    const callbacks = this.events[event];
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }
}
