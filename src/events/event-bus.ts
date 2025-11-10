import { Logger } from "../logging/logger";
import { EventMap, Events } from "./events";

type EventHandlersMap = Partial<Record<Events, Array<(...args: EventMap[Events]) => void>>>;

/**
 * EventBus - Simple pub/sub for cross-component communication
 * Replaces the need for prop drilling or complex state management
 */
export class EventBus {
  private static instance: EventBus;
  private readonly events: EventHandlersMap = {};

  private constructor() { }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  /**
   * Subscribe to an event, but only run the callback once
   */
  once<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    const onceCb = (...args: EventMap[T]) => {
      cb(...args);
      this.off(event, onceCb);
    };
    this.on(event, onceCb);
  }

  /**
   * Unsubscribe a callback from an event
   */
  off<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    const callbacks = this.events[event];
    if (callbacks) {
      this.events[event] = callbacks.filter(fn => fn !== cb);
    }
  }
  /**
   * Subscribe to an event
   */
  on<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(cb);
  }

  /**
 * Emit an event
 */
  emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    Logger.log(`EventBus: Emitting event '${event}' with args:`, args);
    const callbacks = this.events[event];
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }
}
