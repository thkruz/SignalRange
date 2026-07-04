/**
 * @file ContactScheduleManager - Multi-station LEO pass scheduling (nats-eu M3)
 * @description When more than one EU site is in play (Galway + Shetland), the
 * operator allocates each upcoming pass/contact to a station. Two contacts on
 * the same station whose windows overlap is a conflict; leaving a high-priority
 * contact unassigned makes the plan incomplete. This is the LEO-native
 * counterpart of the GEO traffic-handover mechanic - a fresh concept, so it does
 * NOT reuse handover/service-continuity (the latter is a known always-passes
 * placeholder).
 *
 * Started only when settings.contactSchedule is present. Pure allocation logic
 * over the declared contacts; no simulation coupling, fully unit-testable.
 */

import { ScenarioManager } from '@app/scenario-manager';

/** A single pass/contact to be allocated */
export interface ContactConfig {
  id: string;
  satelliteNoradId: number;
  label?: string;
  /** Priority, 1 = highest */
  priority: number;
  /** Pass window open, seconds since mission start */
  windowStartS: number;
  /** Pass window close, seconds since mission start */
  windowEndS: number;
}

/** settings.contactSchedule */
export interface ContactScheduleConfig {
  contacts: ContactConfig[];
  /** Ground-station ids a contact may be allocated to */
  stationIds: string[];
  /**
   * Contacts whose priority is at or above this value (i.e. priority number <=
   * this) must all be assigned for the plan to be valid. Default: all contacts.
   */
  requiredPriorityAtOrAbove?: number;
}

/** A scheduling conflict: two contacts on one station with overlapping windows */
export interface ScheduleConflict {
  stationId: string;
  contactA: string;
  contactB: string;
}

export class ContactScheduleManager {
  private static instance_: ContactScheduleManager | null = null;

  private readonly config_: ContactScheduleConfig;
  /** contactId -> stationId */
  private readonly assignments_ = new Map<string, string>();

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.contactSchedule as ContactScheduleConfig | undefined)
      ?? { contacts: [], stationIds: [] };
  }

  static getInstance(): ContactScheduleManager {
    this.instance_ ??= new ContactScheduleManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    this.instance_ = null;
  }

  getConfig(): ContactScheduleConfig {
    return this.config_;
  }

  /** Allocate a contact to a station (no-op for unknown ids). */
  assign(contactId: string, stationId: string): void {
    const known = this.config_.contacts.some((c) => c.id === contactId);
    if (!known || !this.config_.stationIds.includes(stationId)) {
      return;
    }
    this.assignments_.set(contactId, stationId);
  }

  /** Remove a contact's allocation. */
  unassign(contactId: string): void {
    this.assignments_.delete(contactId);
  }

  getAssignment(contactId: string): string | undefined {
    return this.assignments_.get(contactId);
  }

  /** Whether a contact is assigned (to `stationId` specifically, if given). */
  isContactAssigned(contactId: string, stationId?: string): boolean {
    const assigned = this.assignments_.get(contactId);
    if (assigned === undefined) {
      return false;
    }

    return stationId === undefined || assigned === stationId;
  }

  /** All same-station overlapping-window conflicts in the current plan. */
  getConflicts(): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const byId = new Map(this.config_.contacts.map((c) => [c.id, c]));
    const entries = [...this.assignments_.entries()];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, stnA] = entries[i];
        const [idB, stnB] = entries[j];
        if (stnA !== stnB) {
          continue;
        }
        const a = byId.get(idA);
        const b = byId.get(idB);
        if (a && b && a.windowStartS < b.windowEndS && b.windowStartS < a.windowEndS) {
          conflicts.push({ stationId: stnA, contactA: idA, contactB: idB });
        }
      }
    }

    return conflicts;
  }

  /** No conflicts AND every required-priority contact is assigned. */
  isPlanValid(): boolean {
    if (this.getConflicts().length > 0) {
      return false;
    }
    const requiredAtOrAbove = this.config_.requiredPriorityAtOrAbove ?? Number.POSITIVE_INFINITY;
    const required = this.config_.contacts.filter((c) => c.priority <= requiredAtOrAbove);

    return required.every((c) => this.assignments_.has(c.id));
  }
}
