/**
 * @file Fault Injector Service
 * @description Centralized fault injection service for training scenarios.
 *
 * Provides a clean API for scenarios to inject, clear, and query fault
 * conditions that override normal equipment state displays.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { RxPayloadState } from '@app/pages/mission-control/tabs/rx-payload-adapter';
import { TxPayloadState } from '@app/pages/mission-control/tabs/tx-payload-adapter';
import {
  FaultDefinition,
  FaultInput,
  FaultTarget,
  FAULT_TEMPLATES,
  FaultTemplateKey,
} from './fault-types';

/**
 * FaultInjector - Centralized fault injection service
 *
 * Features:
 * - Type-safe fault definitions
 * - Multiple faults can be active (stacking)
 * - Priority-based override resolution
 * - Auto-expiration support
 * - Ground station scoping
 * - Automatic cleanup on scenario change
 */
export class FaultInjector {
  private static instance_: FaultInjector | null = null;

  private activeFaults_: Map<string, FaultDefinition> = new Map();
  private faultCounter_: number = 0;

  private constructor() {
    // Listen for scenario changes to auto-clear faults
    EventBus.getInstance().on(Events.SCENARIO_CHANGED, () => {
      this.clearAll();
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FaultInjector {
    if (!FaultInjector.instance_) {
      FaultInjector.instance_ = new FaultInjector();
    }
    return FaultInjector.instance_;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (FaultInjector.instance_) {
      FaultInjector.instance_.clearAll();
      FaultInjector.instance_ = null;
    }
  }

  /**
   * Inject a fault condition
   *
   * @param id Unique identifier for this fault (for later clearing)
   * @param fault Fault definition
   */
  inject(id: string, fault: FaultInput): void {
    const faultDef: FaultDefinition = {
      id,
      target: fault.target,
      groundStationId: fault.groundStationId,
      state: fault.state,
      priority: fault.priority ?? 10,
      expiresAt: fault.expiresAt,
    };

    this.activeFaults_.set(id, faultDef);
    this.emitFaultChanged_(id, 'injected');
  }

  /**
   * Inject a fault using a pre-defined template
   *
   * @param templateKey Key from FAULT_TEMPLATES
   * @param groundStationId Ground station to apply fault to
   * @param overrides Optional state overrides to merge with template
   * @returns Generated fault ID
   */
  injectTemplate(
    templateKey: FaultTemplateKey,
    groundStationId: string,
    overrides?: Partial<RxPayloadState> | Partial<TxPayloadState>
  ): string {
    const template = FAULT_TEMPLATES[templateKey];
    const id = `${templateKey}-${++this.faultCounter_}`;

    this.inject(id, {
      target: template.target,
      groundStationId,
      state: { ...template.state, ...overrides },
      priority: template.priority,
    });

    return id;
  }

  /**
   * Clear a specific fault
   */
  clear(id: string): boolean {
    const existed = this.activeFaults_.has(id);
    if (existed) {
      this.activeFaults_.delete(id);
      this.emitFaultChanged_(id, 'cleared');
    }
    return existed;
  }

  /**
   * Clear all faults, optionally filtered by ground station
   */
  clearAll(groundStationId?: string): void {
    if (groundStationId) {
      // Clear only faults for specified ground station
      const toDelete: string[] = [];
      this.activeFaults_.forEach((fault, id) => {
        if (fault.groundStationId === groundStationId) {
          toDelete.push(id);
        }
      });
      toDelete.forEach(id => this.clear(id));
    } else {
      // Clear all faults
      const ids = Array.from(this.activeFaults_.keys());
      this.activeFaults_.clear();
      ids.forEach(id => this.emitFaultChanged_(id, 'cleared'));
    }
  }

  /**
   * Clear all faults for a specific target type
   */
  clearByTarget(target: FaultTarget, groundStationId?: string): void {
    const toDelete: string[] = [];
    this.activeFaults_.forEach((fault, id) => {
      if (fault.target === target) {
        if (!groundStationId || fault.groundStationId === groundStationId) {
          toDelete.push(id);
        }
      }
    });
    toDelete.forEach(id => this.clear(id));
  }

  /**
   * Check if a specific fault is active
   */
  isActive(id: string): boolean {
    const fault = this.activeFaults_.get(id);
    if (!fault) return false;

    // Check expiration
    if (fault.expiresAt && Date.now() > fault.expiresAt) {
      this.clear(id);
      return false;
    }

    return true;
  }

  /**
   * Get all active faults, optionally filtered
   */
  getActiveFaults(groundStationId?: string, target?: FaultTarget): FaultDefinition[] {
    this.cleanupExpired_();

    const faults: FaultDefinition[] = [];
    this.activeFaults_.forEach(fault => {
      if (groundStationId && fault.groundStationId !== groundStationId) return;
      if (target && fault.target !== target) return;
      faults.push({ ...fault });
    });

    // Sort by priority (highest first)
    return faults.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get computed state overrides for a target
   *
   * Merges all active faults for the target, respecting priority order.
   * Higher priority faults override lower priority for conflicting keys.
   */
  getComputedState(
    target: FaultTarget,
    groundStationId: string
  ): Partial<RxPayloadState> | Partial<TxPayloadState> {
    const faults = this.getActiveFaults(groundStationId, target);

    // Merge faults in reverse priority order (lowest first)
    // so higher priority faults override
    const reversed = [...faults].reverse();

    let computed: Partial<RxPayloadState> | Partial<TxPayloadState> = {};
    for (const fault of reversed) {
      computed = { ...computed, ...fault.state };
    }

    return computed;
  }

  /**
   * Get RX payload fault overrides
   */
  getRxPayloadOverrides(groundStationId: string): Partial<RxPayloadState> {
    return this.getComputedState('rx-payload', groundStationId) as Partial<RxPayloadState>;
  }

  /**
   * Get TX payload fault overrides
   */
  getTxPayloadOverrides(groundStationId: string): Partial<TxPayloadState> {
    return this.getComputedState('tx-payload', groundStationId) as Partial<TxPayloadState>;
  }

  /**
   * Check if any faults are active for a ground station
   */
  hasFaults(groundStationId: string): boolean {
    return this.getActiveFaults(groundStationId).length > 0;
  }

  /**
   * Get fault count
   */
  get faultCount(): number {
    this.cleanupExpired_();
    return this.activeFaults_.size;
  }

  /**
   * Clean up expired faults
   */
  private cleanupExpired_(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.activeFaults_.forEach((fault, id) => {
      if (fault.expiresAt && now > fault.expiresAt) {
        toDelete.push(id);
      }
    });

    toDelete.forEach(id => this.clear(id));
  }

  /**
   * Emit fault change event
   */
  private emitFaultChanged_(id: string, action: 'injected' | 'cleared'): void {
    EventBus.getInstance().emit(Events.FAULT_CHANGED, { id, action });
  }
}
