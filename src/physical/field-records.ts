/**
 * @file field-records - Handover forms and records (Campaign 6, M13 handover part)
 * @description A handover form is a list of claims. Each field carries a `ClaimRule` that checks
 * what the player entered against what the plant, service model, evidence log or workload runner
 * currently shows. A submission is accepted only when every required field passes. An accepted
 * submission freezes the cited evidence entries (id, kind, time, text), writes plain lines to the
 * Working Document and hands the record to the campaign store through injected sinks, so this file
 * imports nothing from the scenario layer.
 *
 * The equipment-records part (M15) will extend `FieldRecords`; `markAccepted`/`isAccepted` is the
 * minimal stand-in the `recordAccepted` condition reads until then.
 */

import type { EquipmentLedger, EquipmentState } from './equipment-records';
import type { EvidenceEntry, EvidenceKind, EvidenceLog, SampleSnapshot } from './evidence-log';
import { assessEvidence, type EvidenceGroup } from './evidence-predicates';
import type { RecordReader } from './field-hooks';
import type { PhysicalPlantManager } from './physical-plant-manager';
import type { ServiceModel } from './service-model';
import type { ServiceLayer } from './service-types';
import type { WorkloadRun, WorkloadStatus } from './workload-types';

/** How one handover field is checked */
export type ClaimRule =
  /** The value must equal the latest sample of that layer, and the sample must still be current */
  | { matchesCurrent: { serviceId: string; layer: ServiceLayer } }
  /** The value classifies the latest sample of that layer: current, last-known (stale or invalidated) or unavailable */
  | { freshnessIs: { serviceId: string; layer: ServiceLayer } }
  /** At least `min` (default 1) cited entries of that kind must exist in the evidence log */
  | { cites: EvidenceKind; min?: number }
  /** The value is a workload run id: the run must be of this card, still count, and end in one of these states */
  | { workload: { cardId: string; is: WorkloadStatus[] /** When set, the run must also be on this service */; serviceId?: string } }
  /** The value is a number within `tol` of the plant's reading. `partId` narrows it to one part (default: sum of all) */
  | { powerWithin: { metric: 'socWh' | 'fuelL'; tol: number; partId?: string } }
  /** The value must equal the part's current mode id */
  | { modeIs: { partId: string } }
  /**
   * The value must be one of these authored answers ('other' never matches unless listed). `choice` is also
   * the list the player sees; `accept` narrows the accepted answers so the visible options can include
   * plausible alternatives (without it every listed answer is accepted).
   */
  | {
      choice: string[] /** Optional player-facing label per answer id (falls back to the humanized id) */;
      labels?: Record<string, string>;
      accept?: string[];
      /** Evidence the field's own citations must show for a given accepted answer (an assessed conclusion needs its backing) */
      backing?: Record<string, EvidenceGroup[]>;
      /** The answer must equal the one in the latest accepted record of another form (a later report cannot contradict an earlier filing) */
      sameAs?: { formId: string; key: string; label: string };
    }
  /** Cited entries must fill every group with distinct entries (typed predicates; see evidence-predicates.ts) */
  | { evidence: EvidenceGroup[] };

export interface HandoverFieldConfig {
  key: string;
  label: string;
  required: boolean;
  rule: ClaimRule;
}

export interface HandoverFormConfig {
  id: string;
  title: string;
  /** Working Document section the lines go under */
  documentSection: string;
  fields: HandoverFieldConfig[];
}

/** What the player entered for one field */
export interface HandoverFieldInput {
  value?: string | number;
  /** Evidence entry ids the player cites for this field */
  cites?: string[];
}

export type HandoverInput = Record<string, HandoverFieldInput>;

/** A cited entry as it read at submission; later log changes cannot alter it */
export interface FrozenCitation {
  id: string;
  kind: EvidenceKind;
  tS: number;
  text: string;
  /** Typed sample snapshot, when the entry was a service sample */
  sample?: SampleSnapshot;
  subject?: string;
  eventId?: string;
}

export interface FieldCheck {
  key: string;
  ok: boolean;
  /** Plain-language reason when not ok */
  reason?: string;
}

export interface HandoverValidation {
  formId: string;
  ok: boolean;
  fields: FieldCheck[];
}

export interface HandoverRecord {
  id: string;
  formId: string;
  title: string;
  section: string;
  submittedAtS: number;
  values: Record<string, string | number>;
  /** Frozen citations per field key */
  citations: Record<string, FrozenCitation[]>;
  /** The lines written to the Working Document */
  lines: string[];
}

export type SubmitResult =
  | { ok: true; record: HandoverRecord; validation: HandoverValidation }
  | { ok: false; reason: 'unknown-form' | 'rejected'; validation: HandoverValidation };

export interface FieldRecordsState {
  records: HandoverRecord[];
  attempts: Array<[string, number]>;
  seq: number;
  accepted: string[];
  equipment?: EquipmentState;
}

/** What the records need from the world; the sinks are optional so the class stays unit-testable */
export interface FieldRecordsDeps {
  plant: PhysicalPlantManager;
  service: ServiceModel | null;
  evidence: EvidenceLog | null;
  runs: () => readonly WorkloadRun[];
  getCardVersion: (cardId: string) => number | undefined;
  /** Scenario time a staged event fired, for event-relative evidence predicates (absent: such predicates never match) */
  eventFiredAtS?: (eventId: string) => number | null;
  /** Working Document line sink */
  writeLine?: (section: string, line: string) => void;
  /** Campaign record sink */
  storeRecord?: (record: HandoverRecord) => void;
  /** M15 equipment ledger (records, corrections, notices) */
  equipment?: EquipmentLedger | null;
}

const fail = (key: string, reason: string): FieldCheck => ({ key, ok: false, reason });
const pass = (key: string): FieldCheck => ({ key, ok: true });

function isBlank(v: string | number | undefined): boolean {
  return v === undefined || (typeof v === 'string' && v.trim() === '');
}

export class FieldRecords implements RecordReader {
  private readonly forms_ = new Map<string, HandoverFormConfig>();
  private readonly deps_: FieldRecordsDeps;
  private records_: HandoverRecord[] = [];
  private attempts_ = new Map<string, number>();
  private accepted_ = new Set<string>();
  private seq_ = 0;

  constructor(forms: HandoverFormConfig[], deps: FieldRecordsDeps) {
    for (const f of forms) {
      this.forms_.set(f.id, f);
    }
    this.deps_ = deps;
  }

  // ------------------------------------------------------------------ forms

  getForm(formId: string): HandoverFormConfig | undefined {
    return this.forms_.get(formId);
  }

  forms(): HandoverFormConfig[] {
    return [...this.forms_.values()];
  }

  // ------------------------------------------------------------- validation

  /** Check an entry against the form without recording anything */
  validate(formId: string, input: HandoverInput): HandoverValidation {
    const form = this.forms_.get(formId);
    if (!form) {
      return { formId, ok: false, fields: [] };
    }
    const fields = form.fields.map((f) => this.checkField_(f, input[f.key] ?? {}));

    return { formId, ok: fields.every((c) => c.ok), fields };
  }

  private checkField_(field: HandoverFieldConfig, input: HandoverFieldInput): FieldCheck {
    const rule = field.rule;
    const blank = isBlank(input.value);
    const cites = this.resolveCites_(input.cites);
    const isCitesRule = 'cites' in rule || 'evidence' in rule;
    const empty = isCitesRule ? cites.length === 0 : blank;
    if (empty) {
      return field.required ? fail(field.key, `${field.label} is empty.`) : pass(field.key);
    }
    const value = input.value;

    if ('matchesCurrent' in rule) {
      return this.checkMatchesCurrent_(field, String(value), rule.matchesCurrent);
    }
    if ('freshnessIs' in rule) {
      return this.checkFreshness_(field, String(value), rule.freshnessIs);
    }
    if ('cites' in rule) {
      const need = rule.cites;
      const min = rule.min ?? 1;
      const have = cites.filter((c) => c.kind === need).length;

      return have >= min ? pass(field.key) : fail(field.key, `${field.label} needs ${min} cited ${need} entr${min === 1 ? 'y' : 'ies'} from the notebook; ${have} cited.`);
    }
    if ('evidence' in rule) {
      const log = this.deps_.evidence;
      const verdict = assessEvidence(input.cites ?? [], rule.evidence, log?.entries() ?? [], { eventFiredAtS: (id) => this.deps_.eventFiredAtS?.(id) ?? null });

      return verdict.ok
        ? pass(field.key)
        : fail(field.key, `${field.label} needs notebook entries that show: ${verdict.missing.join('; ')}. Repeated or unrelated entries do not count.`);
    }
    if ('workload' in rule) {
      return this.checkWorkload_(field, String(value), rule.workload);
    }
    if ('powerWithin' in rule) {
      return this.checkPower_(field, Number(value), rule.powerWithin);
    }
    if ('modeIs' in rule) {
      const mode = this.deps_.plant.getPartMode(rule.modeIs.partId);

      return mode !== undefined && String(value) === mode
        ? pass(field.key)
        : fail(field.key, `${field.label} does not match what the ${this.deps_.plant.getLabel(rule.modeIs.partId)} shows now.`);
    }

    if (!(rule.accept ?? rule.choice).includes(String(value))) {
      return fail(field.key, `${field.label} is not one of the answers this form accepts.`);
    }
    if (rule.sameAs) {
      const earlier = this.recordsFor(rule.sameAs.formId).at(-1)?.values[rule.sameAs.key];
      if (earlier !== undefined && String(earlier) !== String(value)) {
        return fail(field.key, `${field.label} differs from the ${rule.sameAs.label} you filed. Change that filing first, or record why the conclusion moved.`);
      }
    }
    const needs = rule.backing?.[String(value)];
    if (needs) {
      const verdict = assessEvidence(input.cites ?? [], needs, this.deps_.evidence?.entries() ?? [], { eventFiredAtS: (id) => this.deps_.eventFiredAtS?.(id) ?? null });
      if (!verdict.ok) {
        return fail(field.key, `${field.label}: back this answer with notebook entries that show: ${verdict.missing.join('; ')}.`);
      }
    }

    return pass(field.key);
  }

  private checkFreshness_(field: HandoverFieldConfig, value: string, target: { serviceId: string; layer: ServiceLayer }): FieldCheck {
    const svc = this.deps_.service;
    const sample = svc?.latest(target.serviceId, target.layer) ?? null;
    if (!svc || !sample) {
      return fail(field.key, `${field.label}: no reading of the ${target.layer} layer has been taken yet.`);
    }
    const freshness = svc.freshness(sample);
    const truth = freshness === 'current' ? 'current' : freshness === 'unavailable' ? 'unavailable' : 'last-known';

    return value === truth ? pass(field.key) : fail(field.key, `${field.label} does not match the age of your latest reading of the ${target.layer} layer.`);
  }

  private checkMatchesCurrent_(field: HandoverFieldConfig, value: string, target: { serviceId: string; layer: ServiceLayer }): FieldCheck {
    const svc = this.deps_.service;
    const sample = svc?.latest(target.serviceId, target.layer) ?? null;
    if (!svc || !sample) {
      return fail(field.key, `${field.label}: no reading of the ${target.layer} layer has been taken yet.`);
    }
    if (svc.freshness(sample) !== 'current') {
      return fail(field.key, `${field.label}: your last reading of the ${target.layer} layer is out of date. Take a new one.`);
    }

    return String(sample.value) === value ? pass(field.key) : fail(field.key, `${field.label} does not match your current reading of the ${target.layer} layer.`);
  }

  private checkWorkload_(field: HandoverFieldConfig, runId: string, rule: { cardId: string; is: WorkloadStatus[]; serviceId?: string }): FieldCheck {
    const run = this.deps_.runs().find((r) => r.id === runId);
    if (!run || run.cardId !== rule.cardId || (rule.serviceId !== undefined && run.serviceId !== rule.serviceId)) {
      return fail(field.key, `${field.label} does not point at a run of that task.`);
    }
    if (run.invalidatedBy || run.cardVersion !== this.deps_.getCardVersion(run.cardId)) {
      return fail(field.key, `${field.label}: that run no longer counts because the setup or the requirement changed. Run it again.`);
    }

    return rule.is.includes(run.status) ? pass(field.key) : fail(field.key, `${field.label}: that run ended as ${run.status}, which this form does not accept.`);
  }

  private checkPower_(field: HandoverFieldConfig, claimed: number, rule: { metric: 'socWh' | 'fuelL'; tol: number; partId?: string }): FieldCheck {
    if (!Number.isFinite(claimed)) {
      return fail(field.key, `${field.label} needs a number.`);
    }
    const readings = this.deps_.plant.getPowerReadings();
    const table = readings[rule.metric];
    const actual = rule.partId === undefined ? Object.values(table).reduce((a, b) => a + b, 0) : table[rule.partId];
    if (actual === undefined) {
      return fail(field.key, `${field.label}: that part has no such reading.`);
    }

    return Math.abs(claimed - actual) <= rule.tol ? pass(field.key) : fail(field.key, `${field.label} is more than ${rule.tol} away from the current reading.`);
  }

  private resolveCites_(ids: string[] | undefined): FrozenCitation[] {
    const log = this.deps_.evidence;
    if (!log || !ids) {
      return [];
    }
    const byId = new Map(log.entries().map((e) => [e.id, e] as const));
    const out: FrozenCitation[] = [];
    for (const id of new Set(ids)) {
      const e = byId.get(id);
      if (e) {
        out.push(freeze(e));
      }
    }

    return out;
  }

  // ----------------------------------------------------------------- submit

  /**
   * Submit a form. A rejected submission records nothing but counts an attempt. An accepted one
   * freezes the citations, writes the Working Document lines and files the record.
   */
  submit(formId: string, input: HandoverInput): SubmitResult {
    const form = this.forms_.get(formId);
    if (!form) {
      return { ok: false, reason: 'unknown-form', validation: { formId, ok: false, fields: [] } };
    }
    const validation = this.validate(formId, input);
    this.attempts_.set(formId, (this.attempts_.get(formId) ?? 0) + 1);
    if (!validation.ok) {
      return { ok: false, reason: 'rejected', validation };
    }
    const values: Record<string, string | number> = {};
    const citations: Record<string, FrozenCitation[]> = {};
    const lines: string[] = [];
    const log = this.deps_.evidence;
    const numbering = new Map((log?.entries() ?? []).map((e, i) => [e.id, i + 1] as const));
    for (const field of form.fields) {
      const entry = input[field.key] ?? {};
      const cited = this.resolveCites_(entry.cites);
      if (cited.length) {
        citations[field.key] = cited;
      }
      if (isBlank(entry.value) && cited.length === 0) {
        continue;
      }
      if (!isBlank(entry.value)) {
        values[field.key] = entry.value as string | number;
      }
      const shown = isBlank(entry.value) ? '' : `${field.label}: ${String(entry.value)}`;
      const backing = cited.length ? `backed by ${cited.map((c) => `#${numbering.get(c.id) ?? '?'}`).join(', ')}` : '';
      lines.push([shown || field.label, backing].filter(Boolean).join(' - '));
    }
    this.seq_++;
    const record: HandoverRecord = {
      id: `handover-${this.seq_}`,
      formId,
      title: form.title,
      section: form.documentSection,
      submittedAtS: this.deps_.plant.getTimeSeconds(),
      values,
      citations,
      lines,
    };
    this.records_.push(record);
    this.publish_(record);

    return { ok: true, record, validation };
  }

  private publish_(record: HandoverRecord): void {
    for (const line of record.lines) {
      this.deps_.writeLine?.(record.section, line);
    }
    this.deps_.storeRecord?.(record);
  }

  // ----------------------------------------------------------------- reads

  /** Accepted records of a form, oldest first */
  recordsFor(formId: string): readonly HandoverRecord[] {
    return this.records_.filter((r) => r.formId === formId);
  }

  allRecords(): readonly HandoverRecord[] {
    return this.records_;
  }

  attempts(formId: string): number {
    return this.attempts_.get(formId) ?? 0;
  }

  handoverFiledAtS(formId: string): number | null {
    const filed = this.recordsFor(formId);

    return filed.length > 0 ? filed[filed.length - 1].submittedAtS : null;
  }

  isHandoverValid(formId: string): boolean {
    return this.records_.some((r) => r.formId === formId);
  }

  /** Manual acceptance for units with no authored equipment record */
  markAccepted(unitId: string): void {
    this.accepted_.add(unitId);
  }

  /** The equipment ledger (M15), or null when none is authored */
  get equipment(): EquipmentLedger | null {
    return this.deps_.equipment ?? null;
  }

  requestDecision(requestId: string): { status: 'pending' | 'approved' | 'rejected'; decidedAtS?: number } | null {
    const r = this.deps_.equipment?.getRequest(requestId);

    return r ? { status: r.status, ...(r.decidedAtS === undefined ? {} : { decidedAtS: r.decidedAtS }) } : null;
  }

  isAccepted(unitId: string): boolean {
    return this.accepted_.has(unitId) || (this.deps_.equipment?.isAccepted(unitId) ?? false);
  }

  // ----------------------------------------------------------------- state

  getState(): FieldRecordsState {
    return {
      records: this.records_.map((r) => JSON.parse(JSON.stringify(r)) as HandoverRecord),
      attempts: [...this.attempts_],
      seq: this.seq_,
      accepted: [...this.accepted_],
      ...(this.deps_.equipment ? { equipment: this.deps_.equipment.getState() } : {}),
    };
  }

  /**
   * Restore a checkpoint. Records go back to the campaign store; Working Document lines are not
   * rewritten because that panel restores its own snapshot.
   */
  restoreState(state: FieldRecordsState | undefined): void {
    if (!state) {
      return;
    }
    this.records_ = (state.records ?? []).filter((r) => this.forms_.has(r.formId)).map((r) => JSON.parse(JSON.stringify(r)) as HandoverRecord);
    this.attempts_ = new Map(state.attempts ?? []);
    this.accepted_ = new Set(state.accepted ?? []);
    this.deps_.equipment?.restoreState(state.equipment);
    this.seq_ = state.seq ?? this.records_.length;
    for (const r of this.records_) {
      this.deps_.storeRecord?.(r);
    }
  }
}

function freeze(e: EvidenceEntry): FrozenCitation {
  return {
    id: e.id,
    kind: e.kind,
    tS: e.tS,
    text: e.text,
    subject: e.subject,
    ...(e.sample ? { sample: { ...e.sample } } : {}),
    ...(e.source.eventId === undefined ? {} : { eventId: e.source.eventId }),
  };
}
