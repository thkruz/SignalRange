import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SecurityConsoleCore, type AccountStatus, type AuditSeverity } from '@app/security-console/security-console-core';
import { TransecManager, type TransecMode } from '@app/transec/transec-manager';
import './security-console-tab.css';

const SEVERITY_BADGE_CLASS: Record<AuditSeverity, string> = {
  info: 'sec-badge-muted',
  warning: 'sec-badge-warn',
  critical: 'sec-badge-bad',
};

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'disabled', 'expired'];

/**
 * SecurityConsoleTab - Station security console (nats-eu M6 SOC-lite + M7 TRANSEC)
 *
 * SOC-lite panels: the operator reviews the station audit log, flags the
 * suspicious entries hiding among routine traffic, and applies access-control
 * hygiene to station accounts (SecurityConsoleCore; audit-log-reviewed /
 * security-event-acknowledged / access-control-set conditions). The TRANSEC
 * panel switches the command waveform between fixed and keyed frequency-hopping
 * modes (TransecManager; transec-mode-set / transec-sync-locked conditions).
 *
 * Panels render only for the settings blocks the scenario declares (security
 * and/or transec), and the tab itself is only registered when at least one is
 * present - legacy campaigns never see it.
 */
export class SecurityConsoleTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly hasSecurity_: boolean;
  private readonly hasTransec_: boolean;
  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;
  private lastVisibleLogCount_ = -1;

  constructor(containerId: string) {
    super();
    const settings = ScenarioManager.getInstance().settings;
    this.hasSecurity_ = settings.security !== undefined;
    this.hasTransec_ = settings.transec !== undefined;

    this.init_(containerId, 'replace');
    this.dom_ = qs('.security-console-tab');

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.renderAuditLog_();
    this.syncDomWithState_();
  }

  protected get html_(): string {
    return html`
      <div class="security-console-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="sec-title">Station Security</h2>
              <span class="text-muted small">Audit · access control · TRANSEC</span>
            </div>
          </div>

          ${this.hasSecurity_ ? this.auditLogCardHtml_() : ''}
          ${this.hasSecurity_ ? this.accessControlCardHtml_() : ''}
          ${this.hasTransec_ ? this.transecCardHtml_() : ''}
        </div>
      </div>
    `;
  }

  private auditLogCardHtml_(): string {
    return html`
      <div class="col-lg-8">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h3 class="card-title">Audit Trail</h3>
            <div class="d-flex align-items-center gap-2">
              <span id="sec-reviewed-badge" class="sec-badge sec-badge-muted">UNREVIEWED</span>
              <button id="sec-mark-reviewed" class="btn btn-sm btn-outline-secondary">Sign Off Review</button>
            </div>
          </div>
          <div class="card-body p-0">
            <table class="table table-sm sec-audit mb-0">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Category</th><th>Severity</th><th></th></tr>
              </thead>
              <tbody id="sec-audit-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private accessControlCardHtml_(): string {
    const core = SecurityConsoleCore.getInstance();
    const rows = core.getConfig().accounts.map((account) => {
      const current = core.getAccountStatus(account.id) ?? account.status;
      const options = ACCOUNT_STATUSES
        .map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`)
        .join('');

      return html`
        <tr>
          <td>
            <span class="fw-bold">${account.name}</span>
            <div class="text-muted small">${account.role}</div>
          </td>
          <td>
            <select class="form-select form-select-sm sec-account-select" data-account-id="${account.id}">
              ${options}
            </select>
          </td>
        </tr>
      `;
    }).join('');

    return html`
      <div class="col-lg-4">
        <div class="card h-100">
          <div class="card-header"><h3 class="card-title">Access Control</h3></div>
          <div class="card-body p-0">
            <table class="table table-sm sec-accounts mb-0">
              <thead><tr><th>Account</th><th>Status</th></tr></thead>
              <tbody id="sec-accounts-body">${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private transecCardHtml_(): string {
    const config = TransecManager.getInstance().getConfig();
    const hopList = (config.hopChannelsHz ?? [])
      .map((hz) => (hz / 1e6).toFixed(1))
      .join(' / ');

    return html`
      <div class="col-lg-4">
        <div class="card h-100">
          <div class="card-header"><h3 class="card-title">TRANSEC</h3></div>
          <div class="card-body">
            <label class="form-label small" for="sec-transec-mode">Waveform mode</label>
            <select id="sec-transec-mode" class="form-select form-select-sm mb-3">
              <option value="fixed" selected>Fixed carrier</option>
              <option value="hopping">Frequency hopping</option>
            </select>
            <div class="d-flex gap-2 mb-3">
              <button id="sec-transec-load-key" class="btn btn-sm btn-outline-secondary flex-fill">Load Hop-Set Key</button>
              <button id="sec-transec-drop-key" class="btn btn-sm btn-outline-secondary flex-fill">Drop Key</button>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="text-muted small">Hop-set key:</span>
              <span id="sec-transec-key-badge" class="sec-badge sec-badge-muted">NOT LOADED</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="text-muted small">Hop sync:</span>
              <span id="sec-transec-sync-badge" class="sec-badge sec-badge-muted">NO SYNC</span>
            </div>
            ${hopList ? html`
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-muted small">Hop channels:</span>
                <span class="font-monospace small">${hopList} MHz</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    if (this.hasSecurity_) {
      document.getElementById('sec-mark-reviewed')?.addEventListener('click', () => {
        SecurityConsoleCore.getInstance().markReviewed();
        this.syncDomWithState_();
      });

      // One delegated listener covers every per-entry flag button.
      document.getElementById('sec-audit-body')?.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-event-id]');
        if (button?.dataset.eventId) {
          SecurityConsoleCore.getInstance().acknowledge(button.dataset.eventId);
          this.renderAuditLog_();
        }
      });

      // One delegated listener covers every account status select.
      document.getElementById('sec-accounts-body')?.addEventListener('change', (e) => {
        const select = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-account-id]');
        if (select?.dataset.accountId) {
          SecurityConsoleCore.getInstance().setAccountStatus(select.dataset.accountId, select.value as AccountStatus);
        }
      });
    }

    if (this.hasTransec_) {
      const modeSelect = document.getElementById('sec-transec-mode') as HTMLSelectElement | null;
      modeSelect?.addEventListener('change', () => {
        const mgr = TransecManager.getInstance();
        const mode = modeSelect.value as TransecMode;
        if (!mgr.isModeSet(mode)) {
          mgr.setMode(mode);
        }
        this.syncDomWithState_();
      });

      document.getElementById('sec-transec-load-key')?.addEventListener('click', () => {
        TransecManager.getInstance().loadKey();
        this.syncDomWithState_();
      });

      document.getElementById('sec-transec-drop-key')?.addEventListener('click', () => {
        TransecManager.getInstance().clearKey();
        this.syncDomWithState_();
      });
    }
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < SecurityConsoleTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;

    // Time-scheduled audit entries can surface mid-mission; only rebuild the
    // rows when a new one appears so flag buttons aren't churned under a click.
    if (this.hasSecurity_ &&
      SecurityConsoleCore.getInstance().getVisibleLog().length !== this.lastVisibleLogCount_) {
      this.renderAuditLog_();
    }
    this.syncDomWithState_();
  }

  private renderAuditLog_(): void {
    if (!this.hasSecurity_) {
      return;
    }
    const body = this.cache_('sec-audit-body');
    if (!body) {
      return;
    }

    const core = SecurityConsoleCore.getInstance();
    const visible = core.getVisibleLog();
    this.lastVisibleLogCount_ = visible.length;

    if (visible.length === 0) {
      body.innerHTML = html`<tr><td colspan="6" class="text-muted">No audit entries yet.</td></tr>`;

      return;
    }

    body.innerHTML = visible.map((entry) => {
      const flagged = core.isEventAcknowledged(entry.id);
      const flagCell = flagged
        ? '<span class="sec-badge sec-badge-bad">FLAGGED</span>'
        : `<button class="btn btn-sm btn-outline-secondary" data-event-id="${entry.id}">Flag</button>`;

      return html`
        <tr>
          <td class="font-monospace small">${entry.timestampLabel ?? '—'}</td>
          <td class="font-monospace small">${entry.actor}</td>
          <td>${entry.action}</td>
          <td class="small">${entry.category}</td>
          <td><span class="sec-badge ${SEVERITY_BADGE_CLASS[entry.severity]}">${entry.severity.toUpperCase()}</span></td>
          <td class="text-end">${flagCell}</td>
        </tr>
      `;
    }).join('');
  }

  private syncDomWithState_(): void {
    if (this.hasSecurity_) {
      const reviewedBadge = this.cache_('sec-reviewed-badge');
      const reviewed = SecurityConsoleCore.getInstance().isReviewed;
      if (reviewedBadge) {
        reviewedBadge.textContent = reviewed ? 'SIGNED OFF' : 'UNREVIEWED';
        reviewedBadge.className = `sec-badge ${reviewed ? 'sec-badge-good' : 'sec-badge-muted'}`;
      }
      const reviewBtn = this.dom_?.querySelector<HTMLButtonElement>('#sec-mark-reviewed');
      if (reviewBtn) {
        reviewBtn.disabled = reviewed;
      }
    }

    if (this.hasTransec_) {
      const mgr = TransecManager.getInstance();

      const modeSelect = this.dom_?.querySelector<HTMLSelectElement>('#sec-transec-mode');
      if (modeSelect && document.activeElement !== modeSelect) {
        modeSelect.value = mgr.state.mode;
      }

      const keyBadge = this.cache_('sec-transec-key-badge');
      if (keyBadge) {
        keyBadge.textContent = mgr.state.keyed ? 'LOADED' : 'NOT LOADED';
        keyBadge.className = `sec-badge ${mgr.state.keyed ? 'sec-badge-good' : 'sec-badge-muted'}`;
      }

      const syncBadge = this.cache_('sec-transec-sync-badge');
      if (syncBadge) {
        const locked = mgr.isSyncLocked();
        syncBadge.textContent = locked ? 'SYNC LOCKED' : 'NO SYNC';
        syncBadge.className = `sec-badge ${locked ? 'sec-badge-good' : 'sec-badge-muted'}`;
      }
    }
  }

  private cache_(id: string): HTMLElement | null {
    const cached = this.domCache_.get(id);
    if (cached) {
      return cached;
    }
    const el = this.dom_?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (el) {
      this.domCache_.set(id, el);
    }

    return el;
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    this.renderAuditLog_();
    this.syncDomWithState_();
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
