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
 */

import { ScenarioManager } from '@app/scenario-manager';
import { CampaignDocumentStore, campaignIdOf } from '@app/scenarios/campaign-document-store';
import { missionNowMs } from '@app/simulation/mission-clock';

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

/** settings.security */
export interface SecurityConfig {
  accounts: SecurityAccountConfig[];
  events: AuditEventConfig[];
}

export class SecurityConsoleCore {
  private static instance_: SecurityConsoleCore | null = null;

  private readonly config_: SecurityConfig;
  private readonly missionStartTime_ = missionNowMs();
  private readonly acknowledged_ = new Set<string>();
  private readonly accountStatus_ = new Map<string, AccountStatus>();
  private reviewed_ = false;
  /** Entries dropped at load because their carried-forward evidence was destroyed */
  private readonly droppedEvidence_: AuditEventConfig[] = [];

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

  static destroy(): void {
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
    const elapsed = atElapsedS ?? (missionNowMs() - this.missionStartTime_) / 1000;

    return this.config_.events.filter((e) => (e.timeS ?? 0) <= elapsed);
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
    if (this.getVisibleLog(atElapsedS).some((e) => e.id === eventId)) {
      this.acknowledged_.add(eventId);
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
    const now = (missionNowMs() - this.missionStartTime_) / 1000;
    this.config_.events.push({ ...event, timeS: event.timeS ?? now });
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
