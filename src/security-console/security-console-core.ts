/**
 * @file SecurityConsoleCore - SOC-lite station security console (nats-eu M6)
 * @description The load-bearing cybersecurity mechanic for Campaign 2's gray-zone
 * arc. Deliberately NOT a network simulation (no packets/firewall/IDS): it is a
 * reviewable station audit log with time-scheduled entries - some of them
 * injected anomalies (off-hours auth failures, unauthorized config changes,
 * replayed commands) hiding among genuine operational traffic - plus a small
 * access-control panel (accounts with active/disabled/expired states). The
 * operator reviews the log, acknowledges the suspicious entries, and applies
 * access-control hygiene. The audit-log-reviewed / security-event-acknowledged /
 * access-control-set conditions read this state.
 *
 * Started only when settings.security is present. Log visibility is a pure
 * function of the mission clock, so it is deterministic and unit-testable.
 * An entry with startAfterObjectiveId counts its timeS from that objective
 * instead; only then does the core subscribe to UPDATE, to poll the anchor.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { fillDialogTokens, formatStationTime } from '@app/modal/dialog-tokens';
import { ObjectiveAnchors } from '@app/objectives/objective-anchor';
import { ScenarioManager } from '@app/scenario-manager';
import { CampaignDocumentStore, campaignIdOf } from '@app/scenarios/campaign-document-store';
import { missionNowMs } from '@app/simulation/mission-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import type { SecuritySnapshot } from '@app/sync/manager-state-types';

export type AccountStatus = 'active' | 'disabled' | 'expired';
export type AuditCategory = 'auth' | 'config' | 'command' | 'access';
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** settings.security.accounts[] */
export interface SecurityAccountConfig {
  id: string;
  name: string;
  role: string;
  status: AccountStatus;
}

/** settings.security.events[] - one audit-log entry */
export interface AuditEventConfig {
  id: string;
  /** Elapsed second the entry appears (default 0 = present from scenario start) */
  timeS?: number;
  /** Count timeS from this objective going live (see objective-anchor.ts) */
  startAfterObjectiveId?: string;
  /** Wall-clock label shown in the log (e.g. "03:14 UTC") */
  timestampLabel?: string;
  actor: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  /** True if this entry is an anomaly the operator is expected to flag */
  isAnomaly?: boolean;
  /**
   * This entry carries evidence forward from an earlier scenario. If the
   * campaign record says a decision destroyed that evidence there, the entry
   * is dropped from this log at load (and evidence-chain-intact reads false).
   */
  requiresCampaignEvidence?: { scenarioId: string; eventId: string };
}

/**
 * Order entries by the clock time they display, not by insertion (Phase 35
 * s17-F5: a 01:58 row listed before 01:55). Applies only when every entry
 * carries an "HH:MM" label; a label that rolls past midnight sorts after the
 * evening ones. Equal times keep their authored order.
 */
/**
 * An injected entry with no authored label is stamped with the station clock
 * at the moment of injection, so its time cell is never blank.
 */
export function stampInjectedEvent(event: AuditEventConfig, elapsedS: number, nowMs: number): AuditEventConfig {
  return { ...event, timeS: event.timeS ?? elapsedS, timestampLabel: event.timestampLabel ?? `${formatStationTime(nowMs)} UTC` };
}

export function sortAuditByTimestamp(events: AuditEventConfig[]): AuditEventConfig[] {
  const minutes = events.map((e) => {
    const m = /(\d{1,2}):(\d{2})/u.exec(fillDialogTokens(e.timestampLabel ?? ''));

    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  });
  if (events.length < 2 || minutes.some((m) => m === null)) return events;
  const first = minutes[0] as number;
  const keyed = events.map((event, i) => {
    const raw = minutes[i] as number;

    return { event, key: raw < first - 720 ? raw + 1440 : raw, i };
  });
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);

  return keyed.map((k) => k.event);
}

/** settings.security */
export interface SecurityConfig {
  accounts: SecurityAccountConfig[];
  events: AuditEventConfig[];
}

export class SecurityConsoleCore {
  private static instance_: SecurityConsoleCore | null = null;

  private readonly config_: SecurityConfig;
  private missionStartTime_ = missionNowMs();
  private readonly acknowledged_ = new Set<string>();
  private readonly accountStatus_ = new Map<string, AccountStatus>();
  private reviewed_ = false;
  /** Entries dropped at load because their carried-forward evidence was destroyed */
  private readonly droppedEvidence_: AuditEventConfig[] = [];
  private readonly anchors_: ObjectiveAnchors;
  private readonly boundUpdateHandler_ = (): void => this.anchors_.poll(this.elapsedS_());

  private constructor() {
    const settings = ScenarioManager.getInstance().settings;
    const configured = (settings.security as SecurityConfig | undefined) ?? { accounts: [], events: [] };
    const campaignId = campaignIdOf(ScenarioManager.getInstance().data);
    const kept = configured.events.filter((e) => {
      const req = e.requiresCampaignEvidence;
      const destroyed = !!req && CampaignDocumentStore.wasEvidenceDestroyed(campaignId, req.scenarioId, req.eventId);
      if (destroyed) this.droppedEvidence_.push(e);
      return !destroyed;
    });
    // Copy the list: injectEvent/removeEvent mutate it, and the scenario
    // definition must stay pristine for a replay.
    this.config_ = { accounts: configured.accounts, events: kept };
    this.config_.accounts.forEach((a) => this.accountStatus_.set(a.id, a.status));
    this.anchors_ = new ObjectiveAnchors(kept.map((e) => e.startAfterObjectiveId));
    if (this.anchors_.hasAnchors) {
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    }
  }

  /** Entries this log should have carried forward but could not (evidence destroyed earlier). */
  get droppedEvidence(): readonly AuditEventConfig[] {
    return this.droppedEvidence_;
  }

  static getInstance(): SecurityConsoleCore {
    this.instance_ ??= new SecurityConsoleCore();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  /** Snapshot for a checkpoint (Phase 35 rt-s24-F4); droppedEvidence_ is derived at load. */
  getState(): SecuritySnapshot {
    return {
      events: structuredClone(this.config_.events),
      missionStartTimeMs: this.missionStartTime_,
      acknowledged: [...this.acknowledged_],
      accountStatus: [...this.accountStatus_],
      reviewed: this.reviewed_,
      anchors: this.anchors_.getState(),
    };
  }

  /** Restore a snapshot; account ids this scenario does not define are ignored. */
  restoreState(snapshot: SecuritySnapshot | undefined): void {
    if (!snapshot) {
      return;
    }
    if (Array.isArray(snapshot.events)) this.config_.events = structuredClone(snapshot.events);
    if (Number.isFinite(snapshot.missionStartTimeMs)) this.missionStartTime_ = snapshot.missionStartTimeMs!;
    this.acknowledged_.clear();
    for (const id of snapshot.acknowledged ?? []) {
      if (typeof id === 'string') {
        this.acknowledged_.add(id);
      }
    }
    for (const [id, status] of snapshot.accountStatus ?? []) {
      if (this.accountStatus_.has(id)) {
        this.accountStatus_.set(id, status as AccountStatus);
      }
    }
    this.reviewed_ = snapshot.reviewed === true;
    this.anchors_.restoreState(snapshot.anchors);
  }

  static destroy(): void {
    if (this.instance_?.anchors_.hasAnchors) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
    }
    this.instance_ = null;
  }

  getConfig(): SecurityConfig {
    return this.config_;
  }

  /** Whether the operator has opened and reviewed the log. */
  get isReviewed(): boolean {
    return this.reviewed_;
  }

  /** Audit-log entries visible at the given elapsed time (real mission clock if omitted). */
  getVisibleLog(atElapsedS?: number): AuditEventConfig[] {
    const elapsed = atElapsedS ?? this.elapsedS_();

    const visible = this.config_.events.filter((e) => this.anchors_.atS(e.timeS ?? 0, e.startAfterObjectiveId) <= elapsed);

    return sortAuditByTimestamp(visible);
  }

  private elapsedS_(): number {
    return (missionNowMs() - this.missionStartTime_) / 1000;
  }

  /** Visible anomaly entries (the ones the operator ought to flag). */
  getVisibleAnomalies(atElapsedS?: number): AuditEventConfig[] {
    return this.getVisibleLog(atElapsedS).filter((e) => e.isAnomaly === true);
  }

  /** Mark the log reviewed (operator opened the console and interacted with it). */
  markReviewed(): void {
    this.reviewed_ = true;
  }

  /** Acknowledge / flag a specific audit-log entry (must be visible). */
  acknowledge(eventId: string, atElapsedS?: number): void {
    if (!this.acknowledged_.has(eventId) && this.getVisibleLog(atElapsedS).some((e) => e.id === eventId)) {
      this.acknowledged_.add(eventId);
      EventBus.getInstance().emit(Events.AUDIT_EVENT_ACKNOWLEDGED, { id: eventId });
    }
  }

  isEventAcknowledged(eventId: string): boolean {
    return this.acknowledged_.has(eventId);
  }

  /** Whether any visible anomaly is still unacknowledged */
  hasUnacknowledgedAnomaly(atElapsedS?: number): boolean {
    return this.getVisibleAnomalies(atElapsedS).some((e) => !this.acknowledged_.has(e.id));
  }

  /**
   * Add an entry at runtime (decision consequences). Appears now unless the
   * entry carries its own timeS. An id already in the log is left alone.
   */
  injectEvent(event: AuditEventConfig): void {
    if (this.config_.events.some((e) => e.id === event.id)) return;
    this.config_.events.push(stampInjectedEvent(event, this.elapsedS_(), getSimulatedNowMs()));
  }

  /**
   * Remove an entry from the log entirely - evidence destroyed. Returns
   * whether anything was removed.
   */
  removeEvent(eventId: string): boolean {
    const index = this.config_.events.findIndex((e) => e.id === eventId);
    if (index < 0) return false;
    this.config_.events.splice(index, 1);
    this.acknowledged_.delete(eventId);
    return true;
  }

  /** Apply an access-control action to a station account. */
  setAccountStatus(accountId: string, status: AccountStatus): void {
    if (this.accountStatus_.has(accountId)) {
      this.accountStatus_.set(accountId, status);
    }
  }

  getAccountStatus(accountId: string): AccountStatus | undefined {
    return this.accountStatus_.get(accountId);
  }
}
