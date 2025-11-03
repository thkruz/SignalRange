import { EventBus, EventMap } from '../events/event-bus';
import { Events } from '../events/events';
import { AntennaState } from './antenna/antenna';
import './equipment.css';
import { RealTimeSpectrumAnalyzerState } from './real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { ReceiverState } from './receiver/receiver';
import { TransmitterState } from './transmitter/transmitter';

/**
 * Base Equipment Class
 * All physical equipment should extend this class
 * Provides standard lifecycle methods and shared functionality
 */
export abstract class Equipment {
  protected readonly id: number;
  protected readonly teamId: number;
  /** Current equipment state.*/
  abstract state: AntennaState | ReceiverState | TransmitterState | RealTimeSpectrumAnalyzerState;

  private isInitialized: boolean = false;
  protected domCache: { [key: string]: HTMLElement } = {};

  constructor(parentId: string, unit: number, teamId: number = 1) {
    const parentDom = document.getElementById(parentId);
    if (!parentDom) throw new Error(`Parent element ${parentId} not found`);

    this.id = unit;
    this.teamId = teamId;
  }

  // Standard initialization sequence
  protected build(parentId: string): void {
    const parentDom = this.initializeDom(parentId);
    this.addListeners(parentDom);
    this.initialize();
  }

  initializeDom(parentId: string): HTMLElement {
    if (this.isInitialized) {
      throw new Error('DOM already initialized');
    }
    this.isInitialized = true;

    const parentDom = parentId ? document.getElementById(parentId) : null;
    if (!parentId || !parentDom) {
      throw new Error(`Parent element ${parentId} not found`);
    }

    return parentDom;
  }

  /**
   * Add event listeners
   * MUST be implemented by child classes
   */
  protected abstract addListeners(parentDom: HTMLElement): void;

  /**
   * Initialize equipment state and start operations
   * MUST be implemented by child classes
   */
  protected abstract initialize(): void;

  /**
   * Update equipment state
   * called in game loop
   */
  public abstract update(): void;

  /**
   * Sync equipment state
   * Can be used for hot-reloading or external state changes
   */
  public abstract sync(data: any): void;

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