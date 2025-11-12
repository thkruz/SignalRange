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
  protected updateStatusBar(element: HTMLElement, alarms: AlarmStatus[]): void {
    // Priority order: check if off, then errors first, then warnings, then info, then success
    const offAlarms = alarms.filter(a => a.severity === 'off');
    if (offAlarms.length > 0) {
      element.innerText = '';
      element.className = `bottom-status-bar status-off`;
      return;
    }

    const errors = alarms.filter(a => a.severity === 'error');
    if (errors.length > 0) {
      const message = errors.map(a => a.message).join(', ');
      element.innerText = message;
      element.className = `bottom-status-bar status-red`;
      return;
    }

    const warnings = alarms.filter(a => a.severity === 'warning');
    if (warnings.length > 0) {
      const message = warnings.map(a => a.message).join(', ');
      element.innerText = message;
      element.className = `bottom-status-bar status-amber`;
      return;
    }

    const info = alarms.filter(a => a.severity === 'info');
    if (info.length > 0) {
      const message = info.map(a => a.message).join(', ');
      element.innerText = message;
      element.className = `bottom-status-bar status-blue`;
      return;
    }

    const success = alarms.filter(a => a.severity === 'success');
    if (success.length > 0) {
      const message = success.map(a => a.message).join(', ');
      element.innerText = message;
      element.className = `bottom-status-bar status-green`;
      return;
    }

    // Default: No alarms - system normal
    element.innerText = 'SYSTEM NORMAL';
    element.className = `bottom-status-bar status-green`;
  }
}