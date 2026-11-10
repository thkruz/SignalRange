/**
 * @file equipment-records - Equipment records, correction requests and provider notices
 * (Campaign 6, M15 records part)
 * @description The ledger holds what the paperwork says about each unit (serial, account,
 * configuration version) next to what the unit installed on site actually shows. A discrepancy is a
 * field where the two differ. The player files a correction request; the answer arrives only when an
 * authored plant event fires a `respond-request` action, so a slow player never misses it. An
 * approved correction rewrites the record field; a unit is accepted only once nothing differs.
 * Provider notices are versioned: delivering a newer version supersedes the older one, delivering
 * an older one afterwards is ignored.
 *
 * DOM-free and scenario-layer free. The service model is changed through the event target, not here.
 */

/** Record fields a correction may change */
export type CorrectionField = 'accountId' | 'configVersion';

/** Every field the discrepancy check compares */
export type RecordField = 'serial' | CorrectionField;

export interface EquipmentRecord {
  unitId: string;
  serial: string;
  accountId: string;
  configVersion: string;
  acceptedAtS?: number;
}

/** What the unit on site really carries, authored per unit */
export interface InstalledUnit {
  serial: string;
  accountId: string;
  configVersion: string;
}

export interface EquipmentUnitConfig {
  unitId: string;
  /** Label for the inventory view */
  label?: string;
  /** What the paperwork says */
  record: Omit<EquipmentRecord, 'unitId' | 'acceptedAtS'>;
  /** What the unit shows. Absent = identical to the record (no discrepancy). */
  installed?: InstalledUnit;
  /** Configuration and access history lines shown with the record (the player can read and cite them) */
  history?: Array<{ at: string; text: string }>;
  /** Heading over the history lines (default "Configuration and access history") */
  historyTitle?: string;
  /** What the depot test record shows, one line */
  depotRecord?: string;
}

export interface ProviderNotice {
  id: string;
  version: number;
  providerId: string;
  affects: { accountId?: string; endpointId?: string };
  kind: 'ground-capacity' | 'remote-mobility' | 'maintenance';
  issuedAtS: number;
  text: string;
  /** Stamp the notice with the scenario time it was delivered instead of `issuedAtS` */
  issuedOnDelivery?: boolean;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface CorrectionRequest {
  id: string;
  unitId: string;
  field: CorrectionField;
  from: string;
  to: string;
  submittedAtS: number;
  responseEventId: string;
  status: RequestStatus;
  /** A referral to a specialist: answering it changes no record */
  referral?: boolean;
  /** Scenario time the answer was applied (absent while pending) */
  decidedAtS?: number;
}

/** A correction the player may file; the response is decided by the authored event */
export interface CorrectionRequestConfig {
  id: string;
  unitId: string;
  field: CorrectionField;
  /** The value the request asks for (the player may be offered others by the UI) */
  to: string;
  /** Plant event whose `respond-request` action answers it (documentation and anchoring; not checked here) */
  responseEventId: string;
  /** M25: a referral to a specialist. Filing needs no record change and answering it never edits the record. */
  referral?: boolean;
  /** One line shown with the request, e.g. what the offered value is */
  note?: string;
  /** Notice delivered to the inbox when the request is answered */
  replyNotice?: string;
}

export interface EquipmentConfig {
  units: EquipmentUnitConfig[];
  /** Every authored notice version. Delivery is by a `deliver-notice` plant event action. */
  notices?: ProviderNotice[];
  requests?: CorrectionRequestConfig[];
}

export interface Discrepancy {
  unitId: string;
  field: RecordField;
  recorded: string;
  installed: string;
}

export type CorrectionResult = { ok: true; request: CorrectionRequest } | { ok: false; reason: 'unknown-request' | 'unknown-unit' | 'no-change' | 'already-filed' };

export type AcceptResult = { ok: true; record: EquipmentRecord } | { ok: false; reason: 'unknown-unit' | 'discrepancy'; discrepancies: Discrepancy[] };

export interface DeliveredNotice {
  id: string;
  version: number;
  deliveredAtS: number;
}

export interface EquipmentState {
  records: EquipmentRecord[];
  requests: CorrectionRequest[];
  /** Responses that arrived before the player filed the request: id to status */
  decisions: Array<[string, 'approved' | 'rejected']>;
  delivered: DeliveredNotice[];
}

const FIELDS: RecordField[] = ['serial', 'accountId', 'configVersion'];

export class EquipmentLedger {
  private readonly cfg_: EquipmentConfig;
  private readonly now_: () => number;
  private readonly installed_ = new Map<string, InstalledUnit>();
  private records_ = new Map<string, EquipmentRecord>();
  private requests_ = new Map<string, CorrectionRequest>();
  private decisions_ = new Map<string, 'approved' | 'rejected'>();
  private delivered_ = new Map<string, DeliveredNotice>();

  constructor(cfg: EquipmentConfig, now: () => number) {
    this.cfg_ = cfg;
    this.now_ = now;
    for (const u of cfg.units) {
      this.records_.set(u.unitId, { unitId: u.unitId, ...u.record });
      this.installed_.set(u.unitId, { ...(u.installed ?? u.record) });
    }
  }

  // ------------------------------------------------------------ records
  units(): EquipmentRecord[] {
    return [...this.records_.values()].map((r) => ({ ...r }));
  }

  /** Authored label for the inventory view (the id when none) */
  label(unitId: string): string {
    return this.cfg_.units.find((u) => u.unitId === unitId)?.label ?? unitId;
  }

  /** Authored configuration and access history for a unit (empty when none) */
  history(unitId: string): Array<{ at: string; text: string }> {
    return (this.cfg_.units.find((u) => u.unitId === unitId)?.history ?? []).map((h) => ({ ...h }));
  }

  /** Heading over a unit's history lines */
  historyTitle(unitId: string): string {
    return this.cfg_.units.find((u) => u.unitId === unitId)?.historyTitle ?? 'Configuration and access history';
  }

  /** Authored depot test record line for a unit */
  depotRecord(unitId: string): string | undefined {
    return this.cfg_.units.find((u) => u.unitId === unitId)?.depotRecord;
  }

  getRecord(unitId: string): EquipmentRecord | undefined {
    const r = this.records_.get(unitId);

    return r ? { ...r } : undefined;
  }

  getInstalled(unitId: string): InstalledUnit | undefined {
    const i = this.installed_.get(unitId);

    return i ? { ...i } : undefined;
  }

  /** Fields where the record and the unit on site differ (empty for an unknown unit) */
  discrepancies(unitId: string): Discrepancy[] {
    const rec = this.records_.get(unitId);
    const inst = this.installed_.get(unitId);
    if (!rec || !inst) {
      return [];
    }

    return FIELDS.filter((f) => rec[f] !== inst[f]).map((field) => ({ unitId, field, recorded: rec[field], installed: inst[field] }));
  }

  /** Accept a unit's record. Refused while any field differs, so acceptance is never a click-through. */
  accept(unitId: string): AcceptResult {
    const rec = this.records_.get(unitId);
    if (!rec) {
      return { ok: false, reason: 'unknown-unit', discrepancies: [] };
    }
    const discrepancies = this.discrepancies(unitId);
    if (discrepancies.length > 0) {
      return { ok: false, reason: 'discrepancy', discrepancies };
    }
    rec.acceptedAtS ??= this.now_();

    return { ok: true, record: { ...rec } };
  }

  isAccepted(unitId: string): boolean {
    return this.records_.get(unitId)?.acceptedAtS !== undefined;
  }

  // ----------------------------------------------------------- requests
  requestConfigs(): readonly CorrectionRequestConfig[] {
    return this.cfg_.requests ?? [];
  }

  /** Requests the player has filed, oldest first */
  requests(): CorrectionRequest[] {
    return [...this.requests_.values()].map((r) => ({ ...r }));
  }

  getRequest(id: string): CorrectionRequest | undefined {
    const r = this.requests_.get(id);

    return r ? { ...r } : undefined;
  }

  /**
   * File an authored correction request. `to` defaults to the authored value; a request that would
   * not change the record is refused. A response that already arrived is applied at once.
   */
  submitCorrection(requestId: string, to?: string): CorrectionResult {
    const cfg = this.requestConfigs().find((r) => r.id === requestId);
    if (!cfg) {
      return { ok: false, reason: 'unknown-request' };
    }
    const rec = this.records_.get(cfg.unitId);
    if (!rec) {
      return { ok: false, reason: 'unknown-unit' };
    }
    if (this.requests_.has(requestId)) {
      return { ok: false, reason: 'already-filed' };
    }
    const target = to ?? cfg.to;
    if (!cfg.referral && rec[cfg.field] === target) {
      return { ok: false, reason: 'no-change' };
    }
    const request: CorrectionRequest = {
      id: cfg.id,
      unitId: cfg.unitId,
      field: cfg.field,
      from: rec[cfg.field],
      to: target,
      submittedAtS: this.now_(),
      responseEventId: cfg.responseEventId,
      status: 'pending',
      ...(cfg.referral ? { referral: true } : {}),
    };
    this.requests_.set(requestId, request);
    const early = this.decisions_.get(requestId);
    if (early) {
      this.decisions_.delete(requestId);
      this.respond(requestId, early);
    }

    return { ok: true, request: { ...request } };
  }

  /** The anchored answer. Before the request is filed the decision is held; a decision never flips. */
  respond(requestId: string, status: 'approved' | 'rejected'): void {
    const request = this.requests_.get(requestId);
    if (!request) {
      if (this.requestConfigs().some((r) => r.id === requestId) && !this.decisions_.has(requestId)) {
        this.decisions_.set(requestId, status);
      }

      return;
    }
    if (request.status !== 'pending') {
      return;
    }
    request.status = status;
    request.decidedAtS = this.now_();
    if (status === 'approved' && !request.referral) {
      const rec = this.records_.get(request.unitId);
      if (rec) {
        rec[request.field] = request.to;
        // A changed record needs a fresh acceptance
        delete rec.acceptedAtS;
      }
    }
    const replyNotice = this.requestConfigs().find((r) => r.id === requestId)?.replyNotice;
    if (replyNotice) {
      this.deliverNotice(replyNotice);
    }
  }

  // ------------------------------------------------------------ notices
  /**
   * Deliver a notice. Without `version` the highest authored version goes out. A version at or
   * below the one already delivered is ignored. Returns the notice now in force, or null when
   * nothing was authored under that id or it was stale.
   */
  deliverNotice(noticeId: string, version?: number): ProviderNotice | null {
    const versions = (this.cfg_.notices ?? []).filter((n) => n.id === noticeId);
    if (versions.length === 0) {
      return null;
    }
    const pick = version === undefined ? versions.reduce((a, b) => (b.version > a.version ? b : a)) : versions.find((n) => n.version === version);
    if (!pick) {
      return null;
    }
    const have = this.delivered_.get(noticeId);
    if (have && have.version >= pick.version) {
      return null;
    }
    this.delivered_.set(noticeId, { id: noticeId, version: pick.version, deliveredAtS: this.now_() });

    return { ...pick };
  }

  /** Notices in force (latest delivered version of each), oldest delivery first */
  deliveredNotices(providerId?: string): ProviderNotice[] {
    const out: ProviderNotice[] = [];
    for (const d of [...this.delivered_.values()].sort((a, b) => a.deliveredAtS - b.deliveredAtS)) {
      const n = (this.cfg_.notices ?? []).find((x) => x.id === d.id && x.version === d.version);
      if (n && (providerId === undefined || n.providerId === providerId)) {
        out.push({ ...n, ...(n.issuedOnDelivery ? { issuedAtS: d.deliveredAtS } : {}) });
      }
    }

    return out;
  }

  /** Latest delivered version of a notice, or null */
  noticeVersion(noticeId: string): number | null {
    return this.delivered_.get(noticeId)?.version ?? null;
  }

  // -------------------------------------------------------------- state
  getState(): EquipmentState {
    return {
      records: [...this.records_.values()].map((r) => ({ ...r })),
      requests: [...this.requests_.values()].map((r) => ({ ...r })),
      decisions: [...this.decisions_],
      delivered: [...this.delivered_.values()].map((d) => ({ ...d })),
    };
  }

  restoreState(state: EquipmentState | undefined): void {
    if (!state) {
      return;
    }
    for (const r of state.records ?? []) {
      if (this.records_.has(r.unitId)) {
        this.records_.set(r.unitId, { ...r });
      }
    }
    const known = new Set(this.requestConfigs().map((r) => r.id));
    this.requests_ = new Map((state.requests ?? []).filter((r) => known.has(r.id)).map((r) => [r.id, { ...r }]));
    this.decisions_ = new Map((state.decisions ?? []).filter(([id]) => known.has(id)));
    this.delivered_ = new Map((state.delivered ?? []).map((d) => [d.id, { ...d }]));
  }
}
