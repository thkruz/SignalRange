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
import type { IncomingRecord } from './incoming-types';
import type { PhysicalPlantManager } from './physical-plant-manager';
import { measuredLoadW, rateAgrees } from './run-power';
import type { ServiceModel } from './service-model';
import type { SampleMetric, ServiceLayer } from './service-types';
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
  /**
   * The value is a number within `tol` of the player's own latest recorded sample of that metric on that service
   * (the recorded measurement, not authored truth); with no sample of it the field cannot be met.
   */
  | { measured: { serviceId: string; metric: SampleMetric; tol: number } }
  /**
   * The value is seconds within `tolS` of a measured recovery interval span (see ServiceModel.intervalSpanS). An
   * interval that never opened or has not closed yet cannot be claimed.
   */
  | { interval: { id: string; span: 'restoration' | 'response' | 'startup'; tolS: number } }
  /**
   * The value is the average battery draw (W) over the window of the latest counting, complete run of the card, within
   * the larger of `relTol` of the measured draw (default 10 %) and `floorW` (default 5 W). Charging during the run
   * does not enter the figure: it is the integrated load, not the change in stored energy.
   */
  | { runRate: { cardId: string; serviceId?: string; relTol?: number; floorW?: number } }
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
      /**
       * The accepted answer follows an INCOMING record (package C): the record's stored answer `key` maps to the one
       * answer this form accepts. With no incoming record, or an unmapped answer, `accept` applies.
       */
      incoming?: { id: string; key: string; map: Record<string, string> };
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
  /** Shown under the form title once the staged event has fired: "<text> at <scenario clock>" */
  eventNote?: { eventId: string; text: string };
  /**
   * Opt-in: a filing of this form can certify the CURRENT state (see `isHandoverCurrent`). Without it the
   * form is a historical filing only and is never current.
   */
  certification?: FormCertification;
}

/** What makes an accepted filing stale. Parts and events are read from the filing itself and the live world. */
export interface FormCertification {
  /** Extra parts whose mode is pinned at filing (every field with a `modeIs` rule is pinned already) */
  modes?: string[];
  /** Staged events that must not have fired since the filing (an event already fired at filing time is part of what was certified) */
  events?: string[];
  /** Any service configuration change since the filing (repair, restart, setting) makes it stale */
  config?: boolean;
}

/** Identity of the state a filing certified; stored on the record, never re-stamped by a restore */
export interface RecordCertification {
  /** Part mode per pinned part at filing */
  modes: Record<string, string>;
  /** Ids of the form's certification events that had already fired at filing */
  firedEvents: string[];
  /** Workload run ids the filing relied on */
  runIds: string[];
  /** Service configuration epoch at filing (absent when the plant has no service model) */
  configEpoch?: number;
}

/** Which kind of change made a certifying filing stale */
export type StaleCause = { kind: 'mode'; partId: string } | { kind: 'event' } | { kind: 'run' } | { kind: 'config' };

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
  /**
   * What state this filing certified. Absent on filings of forms with no `certification` and on saves that
   * predate it; such a record is readable history but can never be a current claim.
   */
  certification?: RecordCertification;
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
  /** The incoming records loaded at scenario start; restored as is so a resume does not re-read the campaign store */
  incoming?: IncomingRecord[];
}

/** What the records need from the world; the sinks are optional so the class stays unit-testable */
export interface FieldRecordsDeps {
  plant: PhysicalPlantManager;
  service: ServiceModel | null;
  evidence: EvidenceLog | null;
  runs: () => readonly WorkloadRun[];
  getCardVersion: (cardId: string) => number | undefined;
  /** Service configuration epoch now (a change after a filing makes a `config` certification stale) */
  configEpoch?: () => number | null;
  /** Scenario time a staged event fired, for event-relative evidence predicates (absent: such predicates never match) */
  eventFiredAtS?: (eventId: string) => number | null;
  /** Working Document line sink */
  writeLine?: (section: string, line: string) => void;
  /** Campaign record sink */
  storeRecord?: (record: HandoverRecord) => void;
  /** M15 equipment ledger (records, corrections, notices) */
  equipment?: EquipmentLedger | null;
  /** Bring the plant, events and runs up to the scenario clock before a verdict (a clock jump may not have been stepped yet) */
  catchUp?: () => void;
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
  private incoming_: IncomingRecord[] = [];

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
    this.deps_.catchUp?.();
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
      if (!field.required) {
        return pass(field.key);
      }
      const kind = 'evidence' in rule || 'cites' in rule ? ' Tick the notebook entries that show what it asks for (Observed or Did entries).' : '';

      return fail(field.key, `${field.label} is empty.${kind}`);
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
        : fail(
            field.key,
            `"${field.label}" needs notebook entries (Observed or Did) that show: ${verdict.missing.join('; ')}. Tick them in the "${field.label}" list only; repeated or unrelated entries do not count.`
          );
    }
    if ('workload' in rule) {
      return this.checkWorkload_(field, String(value), rule.workload);
    }
    if ('powerWithin' in rule) {
      return this.checkPower_(field, Number(value), rule.powerWithin);
    }
    if ('measured' in rule) {
      return this.checkMeasured_(field, Number(value), rule.measured);
    }
    if ('interval' in rule) {
      return this.checkInterval_(field, Number(value), rule.interval);
    }
    if ('runRate' in rule) {
      return this.checkRunRate_(field, Number(value), rule.runRate);
    }
    if ('modeIs' in rule) {
      const mode = this.deps_.plant.getPartMode(rule.modeIs.partId);

      return mode !== undefined && String(value) === mode
        ? pass(field.key)
        : fail(field.key, `${field.label} does not match what the ${this.deps_.plant.getLabel(rule.modeIs.partId)} shows now.`);
    }

    const followed = rule.incoming ? rule.incoming.map[String(this.incomingValue(rule.incoming.id, rule.incoming.key))] : undefined;
    if (followed !== undefined ? String(value) !== followed : !(rule.accept ?? rule.choice).includes(String(value))) {
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
      const age = Math.round(svc.ageS(sample));

      return fail(
        field.key,
        `${field.label}: your last reading of the ${target.layer} layer is out of date (taken ${age} s ago, readings of this kind expire after ${sample.maxAgeS} s). Take a new one.`
      );
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

  /** The player's latest recorded sample of a metric (any layer) on the service, for the claim and its fill-in */
  latestMeasured(serviceId: string, metric: SampleMetric): number | null {
    const sample = this.deps_.service
      ?.samplesFor(serviceId)
      .filter((s) => s.metric === metric && typeof s.value === 'number')
      .at(-1);

    return sample ? (sample.value as number) : null;
  }

  private checkMeasured_(field: HandoverFieldConfig, claimed: number, rule: { serviceId: string; metric: SampleMetric; tol: number }): FieldCheck {
    if (!Number.isFinite(claimed)) {
      return fail(field.key, `${field.label} needs a number.`);
    }
    const actual = this.latestMeasured(rule.serviceId, rule.metric);
    if (actual === null) {
      return fail(field.key, `${field.label}: take a measurement of this first; nothing recorded to compare with.`);
    }

    return Math.abs(claimed - actual) <= rule.tol ? pass(field.key) : fail(field.key, `${field.label} is more than ${rule.tol} away from your recorded measurement.`);
  }

  /** Measured average battery draw (W) of the latest counting, complete run of the card; null with none */
  latestRunRateW(cardId: string, serviceId?: string): number | null {
    const run = this.deps_
      .runs()
      .filter(
        (r) =>
          r.cardId === cardId &&
          (serviceId === undefined || r.serviceId === serviceId) &&
          r.status !== 'running' &&
          r.status !== 'aborted' &&
          !r.invalidatedBy &&
          r.cardVersion === this.deps_.getCardVersion(r.cardId) &&
          r.power?.complete === true
      )
      .at(-1);

    return run?.power ? measuredLoadW(run.power) : null;
  }

  private checkRunRate_(field: HandoverFieldConfig, claimed: number, rule: { cardId: string; serviceId?: string; relTol?: number; floorW?: number }): FieldCheck {
    if (!Number.isFinite(claimed)) {
      return fail(field.key, `${field.label} needs a number of watts.`);
    }
    const measured = this.latestRunRateW(rule.cardId, rule.serviceId);
    if (measured === null) {
      return fail(field.key, `${field.label}: there is no finished run with a recorded battery window to compare with. Run the task first.`);
    }

    return rateAgrees(claimed, measured, rule.relTol, rule.floorW) ? pass(field.key) : fail(field.key, `${field.label} does not match the draw recorded over the run window.`);
  }

  private checkInterval_(field: HandoverFieldConfig, claimed: number, rule: { id: string; span: 'restoration' | 'response' | 'startup'; tolS: number }): FieldCheck {
    if (!Number.isFinite(claimed)) {
      return fail(field.key, `${field.label} needs a number of seconds.`);
    }
    const actual = this.deps_.service?.intervalSpanS(rule.id, rule.span) ?? null;
    if (actual === null) {
      return fail(field.key, `${field.label}: the interval has not been completed yet, so there is nothing recorded to claim.`);
    }

    return Math.abs(claimed - actual) <= rule.tolS ? pass(field.key) : fail(field.key, `${field.label} is more than ${rule.tolS} s away from the recorded interval.`);
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
    const certification = form.certification ? this.certify_(form, values) : undefined;
    const record: HandoverRecord = {
      id: `handover-${this.seq_}`,
      formId,
      title: form.title,
      section: form.documentSection,
      submittedAtS: this.deps_.plant.getTimeSeconds(),
      values,
      citations,
      lines,
      ...(certification ? { certification } : {}),
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

  /** True when any accepted filing of the form exists (historical: a later change never un-files it) */
  isHandoverValid(formId: string): boolean {
    return this.records_.some((r) => r.formId === formId);
  }

  /** The most recent accepted filing of a form (the record every current claim uses) */
  latestRecord(formId: string): HandoverRecord | undefined {
    const filed = this.recordsFor(formId);

    return filed[filed.length - 1];
  }

  /** The earliest accepted filing of a form (the original account, kept for history) */
  firstRecord(formId: string): HandoverRecord | undefined {
    return this.recordsFor(formId)[0];
  }

  /**
   * Current certification: the LATEST accepted filing of the form carries certification metadata and the
   * state it certified still holds (pinned part modes unchanged, no listed event fired since, no config
   * change when the form asks for it, every run it relied on still counts). Never erases a filing; a fresh
   * filing becomes the latest. Unknown forms, forms without `certification` and filings without metadata
   * (old saves) are never current.
   */
  isHandoverCurrent(formId: string): boolean {
    this.deps_.catchUp?.();
    const form = this.forms_.get(formId);
    if (!form?.certification || !this.latestRecord(formId)?.certification) {
      return false;
    }

    return this.staleCause_(formId) === null;
  }

  /**
   * Why the latest certifying filing of a form is out of date, or null when there is none to judge (never filed,
   * a form or save with no certification) or it is still current. Read by the handover panel for the stale note.
   */
  staleCause(formId: string): StaleCause | null {
    this.deps_.catchUp?.();

    return this.staleCause_(formId);
  }

  /** A short, non-leading note saying which kind of change made the latest filing stale (null when current or unfiled) */
  staleNote(formId: string): string | null {
    const cause = this.staleCause(formId);
    switch (cause?.kind) {
      case undefined:
        return null;
      case 'mode':
        return `Out of date: ${this.deps_.plant.getLabel(cause.partId)} changed state after this was filed. File it again to certify the site as it stands now.`;
      case 'event':
        return 'Out of date: something changed on site after this was filed. File it again to certify the site as it stands now.';
      case 'run':
        return 'Out of date: a task window this filing relied on no longer counts. Run the window again if you need to, then file it again.';
      case 'config':
        return 'Out of date: a service setting changed after this was filed. File it again to certify the service as it stands now.';
    }
  }

  private staleCause_(formId: string): StaleCause | null {
    const form = this.forms_.get(formId);
    const cert = this.latestRecord(formId)?.certification;
    if (!form?.certification || !cert) {
      return null;
    }
    for (const [partId, mode] of Object.entries(cert.modes)) {
      if (this.deps_.plant.getPartMode(partId) !== mode) {
        return { kind: 'mode', partId };
      }
    }
    const before = new Set(cert.firedEvents);
    for (const id of form.certification.events ?? []) {
      if (!before.has(id) && this.deps_.eventFiredAtS?.(id) != null) {
        return { kind: 'event' };
      }
    }
    if (form.certification.config && cert.configEpoch !== undefined && this.deps_.configEpoch?.() !== cert.configEpoch) {
      return { kind: 'config' };
    }
    if (cert.runIds.length > 0) {
      const runs = new Map(this.deps_.runs().map((r) => [r.id, r] as const));
      if (cert.runIds.some((id) => !runs.has(id) || runs.get(id)?.invalidatedBy !== undefined || runs.get(id)?.status === 'aborted')) {
        return { kind: 'run' };
      }
    }

    return null;
  }

  private certify_(form: HandoverFormConfig, values: Record<string, string | number>): RecordCertification {
    const pinned = new Set(form.certification?.modes ?? []);
    const runIds: string[] = [];
    for (const f of form.fields) {
      if ('modeIs' in f.rule) {
        pinned.add(f.rule.modeIs.partId);
      } else if ('workload' in f.rule && values[f.key] !== undefined) {
        runIds.push(String(values[f.key]));
      }
    }
    const modes: Record<string, string> = {};
    for (const partId of pinned) {
      const mode = this.deps_.plant.getPartMode(partId);
      if (mode !== undefined) {
        modes[partId] = mode;
      }
    }
    const epoch = this.deps_.configEpoch?.();

    return {
      modes,
      firedEvents: (form.certification?.events ?? []).filter((id) => this.deps_.eventFiredAtS?.(id) != null),
      runIds,
      ...(epoch == null ? {} : { configEpoch: epoch }),
    };
  }

  // ------------------------------------------------------------- incoming

  /** Load the records this scenario receives (resolved by the service at scenario load) */
  setIncoming(records: IncomingRecord[]): void {
    this.incoming_ = records.map((r) => JSON.parse(JSON.stringify(r)) as IncomingRecord);
  }

  /** The records received from earlier scenarios, with provenance (read-only reference) */
  incoming(): readonly IncomingRecord[] {
    return this.incoming_;
  }

  /** One stored answer of an incoming record (undefined when there is none) */
  incomingValue(id: string, key: string): string | number | undefined {
    return this.incoming_.find((r) => r.id === id)?.values[key];
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
      ...(this.incoming_.length ? { incoming: JSON.parse(JSON.stringify(this.incoming_)) as IncomingRecord[] } : {}),
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
    if (Array.isArray(state.incoming)) {
      this.incoming_ = state.incoming.filter(isIncoming).map((r) => JSON.parse(JSON.stringify(r)) as IncomingRecord);
    }
    this.seq_ = state.seq ?? this.records_.length;
    for (const r of this.records_) {
      this.deps_.storeRecord?.(r);
    }
  }
}

function isIncoming(v: IncomingRecord): boolean {
  return !!v && typeof v.id === 'string' && (v.source === 'player' || v.source === 'fallback') && Array.isArray(v.rows) && !!v.values && typeof v.values === 'object';
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
