import { generateUuid } from '@app/engine/utils/uuid';
import { EventBus } from '../events/event-bus';
import { EventMap, Events } from '../events/events';
import { AntennaState } from './antenna/antenna';
import { RealTimeSpectrumAnalyzerState } from './real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { ReceiverState } from './receiver/receiver';
import { RFFrontEndState } from './rf-front-end/rf-front-end';
import { TransmitterState } from './transmitter/transmitter';

import './base-equipment.css';

/**
 * Alarm status for equipment status bar display
 */
export interface AlarmStatus {
  severity: 'error' | 'warning' | 'info' | 'success' | 'off';
  message: string;
}

/**
 * Base Equipment Class
 * All physical equipment should extend this class
 * Provides standard lifecycle methods and shared functionality
 */
export abstract class BaseEquipment {
  protected readonly uuid: string;
  protected readonly teamId: number;
  /** Current equipment state.*/
  abstract state: AntennaState | ReceiverState | TransmitterState | RealTimeSpectrumAnalyzerState | RFFrontEndState;

  private isInitialized: boolean = false;
  protected domCache: { [key: string]: HTMLElement } = {};

  constructor(parentId: string, teamId: number = 1) {
    const parentDom = document.getElementById(parentId);
    if (!parentDom) throw new Error(`Parent element ${parentId} not found`);

    this.uuid = generateUuid();
    this.teamId = teamId;
  }

  get uuidShort(): string {
    return this.uuid.split('-')[0];
  }

  // Standard initialization sequence
  protected build(parentId: string): void {
    const parentDom = this.initializeDom(parentId);
    this.addListeners_(parentDom);
    this.initialize_();
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
  protected abstract addListeners_(parentDom: HTMLElement): void;

  /**
   * Initialize equipment state and start operations
   * MUST be implemented by child classes
   */
  protected abstract initialize_(): void;

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

  /**
   * Update status bar with alarms using priority-based display
   * Priority order: error > warning > info > success
   * Multiple alarms of same severity are comma-separated
   *
   * @param element The status bar DOM element to update
   * @param alarms Array of alarm statuses to display
   */
  private lastStatusBarUpdate = 0;

  protected updateStatusBar(element: HTMLElement, alarms: AlarmStatus[]): void {
    const now = Date.now();
    if (now - this.lastStatusBarUpdate < 1000) return;
    this.lastStatusBarUpdate = now;

    // Priority order: off > error > warning > info > success
    const priorities: Array<{
      severity: AlarmStatus['severity'];
      statusClass: string;
    }> = [
        { severity: 'off', statusClass: 'status-off' },
        { severity: 'error', statusClass: 'status-red' },
        { severity: 'warning', statusClass: 'status-amber' },
        { severity: 'info', statusClass: 'status-blue' },
        { severity: 'success', statusClass: 'status-green' },
      ];

    // Default: No alarms - system normal
    let newText = 'SYSTEM NORMAL';
    let newClassName = 'bottom-status-bar status-green';

    // Find highest priority alarm and use it
    for (const { severity, statusClass } of priorities) {
      const matches = alarms.filter(a => a.severity === severity);
      if (matches.length > 0) {
        newText = severity === 'off' ? '' : matches.map(a => a.message).join(', ');
        newClassName = `bottom-status-bar ${statusClass}`;
        break; // Exit on first match due to priority order
      }
    }

    // Only update DOM if values have changed
    if (element.innerText !== newText) {
      element.innerText = newText;
    }
    if (element.className !== newClassName) {
      element.className = newClassName;
    }
  }

  private lastLedUpdate = 0;

  protected updateStatusLed(element: HTMLElement, alarms: AlarmStatus[]): void {
    const now = Date.now();
    if (now - this.lastLedUpdate < 1000) return;
    this.lastLedUpdate = now;

    // Priority order: error > warning > off > info > success
    const priorities: Array<{
      severity: AlarmStatus['severity'];
      ledClass: string;
    }> = [
        { severity: 'error', ledClass: 'led led-red' },
        { severity: 'warning', ledClass: 'led led-amber' },
        { severity: 'off', ledClass: 'led led-warning' },
        { severity: 'info', ledClass: 'led led-blue' },
      ];

    // Default: green (system normal)
    let newClassName = 'led led-green';

    // Find highest priority alarm and use it
    for (const { severity, ledClass } of priorities) {
      if (alarms.some(a => a.severity === severity)) {
        newClassName = ledClass;
        break;
      }
    }

    // Only update DOM if value has changed
    if (element.className !== newClassName) {
      element.className = newClassName;
    }
  }
}