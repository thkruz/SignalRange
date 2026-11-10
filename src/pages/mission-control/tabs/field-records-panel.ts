import type { CorrectionField, EquipmentLedger, RecordField } from '@app/physical/equipment-records';
import type { FieldRecords } from '@app/physical/field-records';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-records-panel.css';

/**
 * FieldRecordsPanel - Equipment records and provider notices (Phase 38.2, M16)
 *
 * Shows each unit's paperwork next to what the unit on site carries, marks differences, lets the
 * player accept a unit (refused while anything differs) and file an authored correction request.
 * The notice inbox lists delivered provider notices, newest first, with an unread mark. The panel
 * never shows which side is wrong and never shows when an answer will arrive. Hidden without an
 * authored equipment ledger.
 */

export interface RecordsPanelDeps {
  records: () => FieldRecords | null;
}

const FIELD_LABEL: Record<RecordField, string> = { serial: 'Serial', accountId: 'Account', configVersion: 'Config version' };
const KIND_LABEL: Record<string, string> = { 'ground-capacity': 'Ground capacity', 'remote-mobility': 'Remote mobility', maintenance: 'Maintenance' };
const STATUS_LABEL: Record<string, string> = { pending: 'Waiting for an answer', approved: 'Approved', rejected: 'Rejected' };
const FIELDS: RecordField[] = ['serial', 'accountId', 'configVersion'];

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `elapsed ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function humanize(id: string): string {
  const t = id.replace(/[-_]+/gu, ' ').trim();

  return t.length ? `${t[0].toUpperCase()}${t.slice(1)}` : id;
}

export class FieldRecordsPanel {
  private built_ = false;
  private key_: string | null = null;
  private msg_ = '';
  private readonly read_ = new Set<string>();
  /** Chosen target value per request id (defaults to the authored one) */
  private readonly picks_ = new Map<string, string>();

  constructor(
    private readonly host_: HTMLElement,
    private readonly deps_: RecordsPanelDeps
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
  }

  // ------------------------------------------------------------------ API

  private ledger_(): EquipmentLedger | null {
    return this.deps_.records()?.equipment ?? null;
  }

  /** Accept a unit as the button does; returns true when it is now accepted */
  accept(unitId: string): boolean {
    const ledger = this.ledger_();
    if (!ledger) return false;
    const res = ledger.accept(unitId);
    if (res.ok) {
      this.msg_ = `${ledger.label(unitId)} accepted.`;
    } else if ('reason' in res && res.reason === 'discrepancy') {
      this.msg_ = `Not accepted. ${ledger.label(unitId)} has ${res.discrepancies.length} difference${res.discrepancies.length === 1 ? '' : 's'} between the record and the unit on site.`;
    } else {
      this.msg_ = 'Not accepted. That unit is not on the list.';
    }
    this.key_ = null;
    this.sync();

    return res.ok;
  }

  /** File an authored correction request; returns true when it was filed */
  requestCorrection(requestId: string, to?: string): boolean {
    const ledger = this.ledger_();
    if (!ledger) return false;
    const res = ledger.submitCorrection(requestId, to ?? this.picks_.get(requestId));
    if (res.ok) this.msg_ = 'Request filed. The reply can take a few minutes of site time. It appears here when it comes.';
    else if ('reason' in res && res.reason === 'already-filed') this.msg_ = 'That request is already filed.';
    else if ('reason' in res && res.reason === 'no-change') this.msg_ = 'That would not change the record.';
    else this.msg_ = 'That request is not available.';
    this.key_ = null;
    this.sync();

    return res.ok;
  }

  /** `noticeKey` is `<id>@<version>` as printed on the Mark as read button */
  markRead(noticeKey: string): void {
    this.read_.add(noticeKey);
    this.key_ = null;
    this.sync();
  }

  unreadCount(): number {
    const ledger = this.ledger_();

    return (ledger?.deliveredNotices() ?? []).filter((n) => !this.read_.has(`${n.id}@${n.version}`)).length;
  }

  // ---------------------------------------------------------------- events

  private readonly onClick_ = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-rp-act]');
    if (!btn) return;
    const act = btn.dataset.rpAct;
    if (act === 'accept') this.accept(btn.dataset.rpUnit ?? '');
    else if (act === 'request') this.requestCorrection(btn.dataset.rpReq ?? '');
    else if (act === 'read') this.markRead(btn.dataset.rpNotice ?? '');
  };

  private readonly onChange_ = (e: Event): void => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-rp-pick]');
    if (sel) this.picks_.set(sel.dataset.rpPick ?? '', sel.value);
  };

  // ---------------------------------------------------------------- render

  sync(): void {
    const ledger = this.ledger_();
    if (!ledger) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    if (!this.built_) {
      this.host_.innerHTML = `
      <details class="frp" open>
        <summary class="frp-summary"><b>Records and notices</b> <span class="frp-unread" data-frp="unread"></span> <span class="frp-msg" data-frp="msg" aria-live="polite"></span></summary>
        <div class="frp-body" data-frp="body"></div>
      </details>`;
      this.built_ = true;
    }
    const msg = this.host_.querySelector<HTMLElement>('[data-frp="msg"]');
    if (msg && msg.textContent !== this.msg_) msg.textContent = this.msg_;
    const unread = this.unreadCount();
    const un = this.host_.querySelector<HTMLElement>('[data-frp="unread"]');
    const unText = unread > 0 ? `${unread} new` : '';
    if (un && un.textContent !== unText) un.textContent = unText;
    this.render_(ledger);
  }

  private render_(ledger: EquipmentLedger): void {
    const body = this.host_.querySelector<HTMLElement>('[data-frp="body"]');
    if (!body) return;
    const notices = ledger.deliveredNotices();
    const key = [
      ledger
        .units()
        .map((u) => `${u.unitId}|${u.serial}|${u.accountId}|${u.configVersion}|${u.acceptedAtS ?? ''}`)
        .join(','),
      ledger
        .requests()
        .map((r) => `${r.id}${r.status}`)
        .join(','),
      notices.map((n) => `${n.id}@${n.version}${this.read_.has(`${n.id}@${n.version}`) ? 'r' : 'u'}`).join(','),
    ].join('#');
    if (key === this.key_) return;
    this.key_ = key;
    body.innerHTML = `${this.unitsHtml_(ledger)}${this.noticesHtml_(notices)}`;
  }

  private unitsHtml_(ledger: EquipmentLedger): string {
    const units = ledger.units();
    if (units.length === 0) return '';
    const cards = units
      .map((u) => {
        const id = escapeHtml(u.unitId);
        const differs = new Set(ledger.discrepancies(u.unitId).map((d) => d.field));
        const inst = ledger.getInstalled(u.unitId);
        const rows = FIELDS.map((f) => {
          const bad = differs.has(f);

          return `<tr class="${bad ? 'frp-diff' : ''}" data-frp-row="${id}:${f}"><th scope="row">${FIELD_LABEL[f]}</th><td>${escapeHtml(u[f])}</td><td>${escapeHtml(inst?.[f] ?? '')}</td><td>${bad ? 'Differs' : 'Matches'}</td></tr>`;
        }).join('');
        const action =
          u.acceptedAtS !== undefined
            ? `<span class="frp-ok" data-frp="accepted-${id}">Accepted at ${clock(u.acceptedAtS)}</span>`
            : `<button type="button" class="btn btn-sm btn-outline-primary" data-rp-act="accept" data-rp-unit="${id}">Accept this unit</button>`;
        const history = ledger.history(u.unitId);
        const historyHtml = history.length
          ? `<div class="frp-history" data-frp="history-${id}"><b>${escapeHtml(ledger.historyTitle(u.unitId))}</b><ul>${history.map((h) => `<li>${escapeHtml(h.at)}: ${escapeHtml(h.text)}</li>`).join('')}</ul></div>`
          : '';
        const depot = ledger.depotRecord(u.unitId);
        const depotHtml = depot ? `<div class="frp-depot" data-frp="depot-${id}"><b>Depot test record</b>: ${escapeHtml(depot)}</div>` : '';
        const needs =
          u.acceptedAtS === undefined && differs.size > 0
            ? `<div class="frp-hint" data-frp="accept-needs-${id}">Accepting needs every row above to read Matches. A row that Differs has to be corrected through the records office first.</div>`
            : '';
        const reqs = ledger
          .requestConfigs()
          .filter((r) => r.unitId === u.unitId)
          .map((r) => this.requestHtml_(ledger, r.id))
          .join('');

        return `<div class="frp-unit" data-frp-unit="${id}"><div class="frp-unit-title">${escapeHtml(ledger.label(u.unitId))}</div>
          <table class="frp-table"><thead><tr><th></th><th>Record</th><th>On site</th><th></th></tr></thead><tbody>${rows}</tbody></table>
          ${historyHtml}${depotHtml}<div class="frp-actions">${action}</div>${needs}${reqs}</div>`;
      })
      .join('');

    return `<div class="frp-section"><div class="frp-title">Equipment records</div>${cards}</div>`;
  }

  private requestHtml_(ledger: EquipmentLedger, requestId: string): string {
    const cfg = ledger.requestConfigs().find((r) => r.id === requestId);
    if (!cfg) return '';
    const rid = escapeHtml(requestId);
    const field = FIELD_LABEL[cfg.field as CorrectionField].toLowerCase();
    const filed = ledger.getRequest(requestId);
    if (filed?.referral) {
      return `<div class="frp-req" data-frp-req="${rid}">Referral sent at ${clock(filed.submittedAtS)}. <b data-frp="req-status-${rid}">${filed.status === 'pending' ? 'Waiting for the specialist' : STATUS_LABEL[filed.status]}</b></div>`;
    }
    if (filed) {
      return `<div class="frp-req" data-frp-req="${rid}">Correction filed at ${clock(filed.submittedAtS)}: change ${field} from ${escapeHtml(filed.from)} to ${escapeHtml(filed.to)}. <b data-frp="req-status-${rid}">${STATUS_LABEL[filed.status]}</b></div>`;
    }
    if (cfg.referral) {
      return `<div class="frp-req" data-frp-req="${rid}">Send the incident package to the specialist <button type="button" class="btn btn-sm btn-outline-secondary" data-rp-act="request" data-rp-req="${rid}">Send referral</button></div>`;
    }
    const rec = ledger.getRecord(cfg.unitId);
    const inst = ledger.getInstalled(cfg.unitId);
    const options = [...new Set([cfg.to, inst?.[cfg.field]].filter((v): v is string => !!v && v !== rec?.[cfg.field]))];
    if (options.length === 0) return '';
    const cur = this.picks_.get(requestId) ?? cfg.to;
    const select = `<select class="form-select form-select-sm" data-rp-pick="${rid}" aria-label="New ${field}">${options
      .map((o) => `<option value="${escapeHtml(o)}"${o === cur ? ' selected' : ''}>${escapeHtml(o)}</option>`)
      .join('')}</select>`;

    return `<div class="frp-req" data-frp-req="${rid}">Ask the records office to change the ${field} to ${select} <button type="button" class="btn btn-sm btn-outline-secondary" data-rp-act="request" data-rp-req="${rid}">File correction request</button>${cfg.note ? `<div class="frp-hint">${escapeHtml(cfg.note)}</div>` : ''}</div>`;
  }

  private noticesHtml_(notices: ReturnType<EquipmentLedger['deliveredNotices']>): string {
    const sorted = [...notices].sort((a, b) => b.issuedAtS - a.issuedAtS);
    const items = sorted.length
      ? sorted
          .map((n) => {
            const ver = `${n.id}@${n.version}`;
            const isRead = this.read_.has(ver);
            const kind = KIND_LABEL[n.kind] ?? humanize(n.kind);
            const mark = isRead ? '' : ` <span class="frp-badge">new</span>`;
            const btn = isRead ? '' : `<button type="button" class="btn btn-sm btn-outline-secondary" data-rp-act="read" data-rp-notice="${escapeHtml(ver)}">Mark as read</button>`;

            return `<div class="frp-notice${isRead ? '' : ' frp-new'}" data-frp-notice="${escapeHtml(n.id)}"><div><b>${escapeHtml(kind)}</b> from ${escapeHtml(humanize(n.providerId))}, version ${n.version}, ${clock(n.issuedAtS)}${mark}</div><div>${escapeHtml(n.text)}</div>${btn}</div>`;
          })
          .join('')
      : '<div class="frp-none">No notices yet.</div>';

    return `<div class="frp-section"><div class="frp-title">Notice inbox</div>${items}</div>`;
  }
}
