import { FORM_STEP_LATER_NOTE, type FormStepState } from '@app/pages/mission-control/tabs/form-step-state';
import type { EvidenceEntry, EvidenceLog } from '@app/physical/evidence-log';
import type { FieldRecords, HandoverFieldConfig, HandoverFormConfig, HandoverInput, HandoverValidation } from '@app/physical/field-records';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { ServiceModel } from '@app/physical/service-model';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import type { WorkloadRun } from '@app/physical/workload-types';
import './field-handover-panel.css';

/**
 * FieldHandoverPanel - Handover form (Phase 38.2, M14)
 *
 * Renders an authored `HandoverFormConfig` from the plant's `FieldRecords`. Each field gets the
 * widget its `ClaimRule` needs: a "use my latest reading" fill for service readings, power and
 * mode, a run picker for workloads, notebook checkboxes for citations, an answer list for choices.
 * Check shows plain-language rule failures without recording anything; Submit files the record.
 * The panel never shows the rule itself or fault truth. Without forms the panel is hidden.
 */

export interface HandoverPanelDeps {
  records: () => FieldRecords | null;
  evidence: () => EvidenceLog | null;
  service: () => ServiceModel | null;
  runs: () => readonly WorkloadRun[];
  plant: () => PhysicalPlantManager | null;
  /** Where the checklist step that reads a form stands (omitted: no note) */
  formStep?: (formId: string) => FormStepState;
  /** Bring the simulation up to the clock before the panel reads runs and evidence */
  catchUp?: () => void;
}

/** Said plainly wherever a form has a field that must match a service reading */
export const STALE_NOTE =
  'A reading goes out of date as soon as you do anything on site (inspect, switch, fix, restart). Take the reading again after your last action, then fill the field and submit.';

const KIND_LABEL: Record<string, string> = { observation: 'Observed', action: 'Did', result: 'Result', hypothesis: 'Hypothesis' };
const CHOICE_OTHER = 'other';

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function humanize(id: string): string {
  const t = id.replace(/[-_]+/gu, ' ').trim();

  return t.length ? `${t[0].toUpperCase()}${t.slice(1)}` : id;
}

/** Answers for a freshnessIs field */
const FRESHNESS_ANSWERS: ReadonlyArray<readonly [string, string]> = [
  ['current', 'Current'],
  ['last-known', 'Last-known'],
  ['unavailable', 'Unavailable'],
];

/** What the "latest reading" hint prints for a matchesCurrent field */
export function describeReading(service: ServiceModel | null, serviceId: string, layer: Parameters<ServiceModel['latest']>[1]): { text: string; value?: string; current: boolean } {
  const sample = service?.latest(serviceId, layer) ?? null;
  if (!service || !sample) return { text: `No ${layer} reading taken yet.`, current: false };
  const fresh = service.freshness(sample);
  const value = String(sample.value);
  if (fresh === 'current') return { text: `Your latest ${layer} reading, ${clock(sample.tS)}: ${value} (still current).`, value, current: true };

  return { text: `Your latest ${layer} reading, ${clock(sample.tS)}: ${value} (out of date, take a new one).`, value, current: false };
}

/** How long a press blocks a redraw of the panel (a press that never gets its release stops blocking after this) */
const POINTER_HOLD_MS = 1500;

export class FieldHandoverPanel {
  private built_ = false;
  private formId_ = '';
  private input_: HandoverInput = {};
  private dynKey_: string | null = null;
  private builtForm_ = '';
  private readonly slotHtml_ = new Map<string, string>();
  private pointerDownAtMs_ = 0;
  private msg_ = '';
  private result_: HandoverValidation | null = null;

  constructor(
    private readonly host_: HTMLElement,
    private readonly deps_: HandoverPanelDeps
  ) {
    this.host_.addEventListener('pointerdown', this.onPointerDown_);
    this.host_.addEventListener('pointerup', this.onPointerUp_);
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
    this.host_.addEventListener('input', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('pointerdown', this.onPointerDown_);
    this.host_.removeEventListener('pointerup', this.onPointerUp_);
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
    this.host_.removeEventListener('input', this.onChange_);
  }

  // ------------------------------------------------------------------ API

  selectForm(formId: string): void {
    if (formId === this.formId_) return;
    this.formId_ = formId;
    this.input_ = {};
    this.result_ = null;
    this.msg_ = '';
    this.dynKey_ = null;
    this.sync();
  }

  setValue(key: string, value: string | number | undefined): void {
    this.input_[key] = { ...this.input_[key], value };
  }

  setCites(key: string, cites: string[]): void {
    this.input_[key] = { ...this.input_[key], cites };
  }

  /** Fill a field from the current reading, as the "Use" button does; false when nothing to fill */
  fillFromReading(key: string): boolean {
    const field = this.field_(key);
    const value = field ? this.readingFor_(field) : undefined;
    if (value === undefined) {
      this.msg_ = 'There is no reading to use yet. Take one first.';
      this.sync();

      return false;
    }
    this.setValue(key, value);
    this.dynKey_ = null;
    this.msg_ = '';
    this.sync();

    return true;
  }

  check(): HandoverValidation | null {
    const records = this.deps_.records();
    if (!records || !this.formId_) return null;
    this.result_ = records.validate(this.formId_, this.input_);
    this.msg_ = this.result_.ok ? 'Everything checks out. You can submit.' : 'Not ready yet. See the notes under each field.';
    this.dynKey_ = null;
    this.sync();

    return this.result_;
  }

  /** Submit as the button does; returns true when the record was filed */
  submit(): boolean {
    const records = this.deps_.records();
    if (!records || !this.formId_) return false;
    const res = records.submit(this.formId_, this.input_);
    this.result_ = res.validation;
    if (res.ok) {
      this.msg_ = `Submitted at ${clock(res.record.submittedAtS)}.${this.deps_.formStep?.(this.formId_) === 'later' ? ` ${FORM_STEP_LATER_NOTE}` : ''}`;
      this.input_ = {};
      this.result_ = null;
    } else {
      this.msg_ = 'Rejected. Nothing was filed. See the notes under each field.';
    }
    this.dynKey_ = null;
    this.sync();

    return res.ok;
  }

  // ----------------------------------------------------------------- state

  private form_(): HandoverFormConfig | undefined {
    return this.deps_.records()?.getForm(this.formId_);
  }

  private field_(key: string): HandoverFieldConfig | undefined {
    return this.form_()?.fields.find((f) => f.key === key);
  }

  /**
   * A gauge value only counts as the player's reading once they looked at the part (an inspect entry on it).
   * The fuel gauge is read off the generator and the stored-energy figure off the power station's display;
   * the Power panel stays a live readout the player may copy by hand, but "use my latest reading" needs the look.
   */
  private hasPowerReading_(r: { metric: 'socWh' | 'fuelL'; partId?: string }): boolean {
    if (r.partId === undefined) return true;
    const log = this.deps_.evidence();
    return log === null ? false : log.entries('observation').some((e) => e.subject === r.partId && e.verb === 'inspect');
  }

  private readingFor_(field: HandoverFieldConfig): string | undefined {
    const rule = field.rule;
    if ('matchesCurrent' in rule) return describeReading(this.deps_.service(), rule.matchesCurrent.serviceId, rule.matchesCurrent.layer).value;
    const plant = this.deps_.plant();
    if ('powerWithin' in rule && plant) {
      if (!this.hasPowerReading_(rule.powerWithin)) return undefined;
      const table = plant.getPowerReadings()[rule.powerWithin.metric];
      const v = rule.powerWithin.partId === undefined ? Object.values(table).reduce((a, b) => a + b, 0) : table[rule.powerWithin.partId];

      return v === undefined ? undefined : String(Math.round(v * 10) / 10);
    }
    if ('modeIs' in rule && plant) return plant.getPartMode(rule.modeIs.partId);
    if ('measured' in rule) {
      const v = this.deps_.records()?.latestMeasured(rule.measured.serviceId, rule.measured.metric);

      return v == null ? undefined : String(Math.round(v * 10) / 10);
    }
    if ('runRate' in rule) {
      const v = this.deps_.records()?.latestRunRateW(rule.runRate.cardId, rule.runRate.serviceId);

      return v == null ? undefined : String(Math.round(v * 10) / 10);
    }
    if ('interval' in rule) {
      const v = this.deps_.service()?.intervalSpanS(rule.interval.id, rule.interval.span);

      return v == null ? undefined : String(Math.round(v * 10) / 10);
    }

    return undefined;
  }

  private readonly onPointerDown_ = (): void => {
    this.pointerDownAtMs_ = Date.now();
  };

  private readonly onPointerUp_ = (): void => {
    this.pointerDownAtMs_ = 0;
  };

  private readonly onClick_ = (e: Event): void => {
    const el = e.target as HTMLElement;
    const fill = el.closest<HTMLButtonElement>('button[data-hf-fill]');
    if (fill) {
      this.fillFromReading(fill.dataset.hfFill ?? '');

      return;
    }
    const act = el.closest<HTMLButtonElement>('button[data-hf-act]')?.dataset.hfAct;
    if (act === 'check') this.check();
    else if (act === 'submit') this.submit();
  };

  private readonly onChange_ = (e: Event): void => {
    const el = e.target as HTMLElement;
    const formSel = el.closest<HTMLSelectElement>('select[data-hf-form]');
    if (formSel) {
      this.selectForm(formSel.value);

      return;
    }
    const cite = el.closest<HTMLInputElement>('input[data-hf-cite]');
    if (cite) {
      const key = cite.dataset.hfKey ?? '';
      const set = new Set(this.input_[key]?.cites ?? []);
      if (cite.checked) set.add(cite.dataset.hfCite ?? '');
      else set.delete(cite.dataset.hfCite ?? '');
      this.setCites(key, [...set]);

      return;
    }
    const field = el.closest<HTMLInputElement | HTMLSelectElement>('[data-hf-field]');
    if (field) this.setValue(field.dataset.hfField ?? '', field.value === '' ? undefined : field.value);
  };

  // ---------------------------------------------------------------- render

  sync(): void {
    this.deps_.catchUp?.();
    const records = this.deps_.records();
    const forms = records?.forms() ?? [];
    if (!records || forms.length === 0) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    if (!this.formId_ || !records.getForm(this.formId_)) {
      this.formId_ = forms[0].id;
      this.input_ = {};
      this.dynKey_ = null;
    }
    if (!this.built_) {
      this.host_.innerHTML = `
      <details class="fhf" open>
        <summary class="fhf-summary"><b>Handover</b> <span class="fhf-msg" data-fhf="msg" aria-live="polite"></span></summary>
        <div class="fhf-body" data-fhf="body"></div>
      </details>`;
      this.built_ = true;
    }
    const msg = this.host_.querySelector<HTMLElement>('[data-fhf="msg"]');
    if (msg && msg.textContent !== this.msg_) msg.textContent = this.msg_;
    this.render_(records, forms);
  }

  private render_(records: FieldRecords, forms: HandoverFormConfig[]): void {
    const form = records.getForm(this.formId_);
    const body = this.host_.querySelector<HTMLElement>('[data-fhf="body"]');
    if (!form || !body) return;
    const log = this.deps_.evidence();
    const entries = log?.entries() ?? [];
    const runs = this.deps_.runs();
    const readings = form.fields.map((f) => this.readingHint_(f)).join('~');
    const resultKey = this.result_ ? this.result_.fields.map((c) => `${c.key}${c.ok ? 1 : 0}${c.reason ?? ''}`).join('|') : '';
    const key = [
      this.formId_,
      entries.map((e) => e.id).join(','),
      runs.map((r) => `${r.id}${r.status}`).join(','),
      readings,
      resultKey,
      records.recordsFor(form.id).length,
      records.staleNote(form.id) ?? '',
      records
        .incoming()
        .map((i) => `${i.id}${i.source}`)
        .join(','),
    ].join('#');
    if (key === this.dynKey_) return;
    // A press is in progress on this panel: redrawing now would swap the element under the pointer. The next sync catches up.
    if (this.dynKey_ !== null && Date.now() - this.pointerDownAtMs_ < POINTER_HOLD_MS) return;
    this.dynKey_ = key;

    const numbering = new Map(entries.map((e, i) => [e.id, i + 1] as const));
    const checks = new Map((this.result_?.fields ?? []).map((c) => [c.key, c] as const));
    const picker =
      forms.length > 1
        ? `<label class="fhf-row">Form <select class="form-select form-select-sm" data-hf-form aria-label="Handover form">${forms
            .map((f) => `<option value="${escapeHtml(f.id)}"${f.id === this.formId_ ? ' selected' : ''}>${escapeHtml(f.title)}</option>`)
            .join('')}</select></label>`
        : '';
    const outOfDate = records.staleNote(form.id);
    const stale =
      (form.fields.some((f) => 'matchesCurrent' in f.rule) ? `<div class="fhf-stale" data-fhf="stale">${escapeHtml(STALE_NOTE)}</div>` : '') +
      (outOfDate ? `<div class="fhf-stale" data-fhf="out-of-date">${escapeHtml(outOfDate)}</div>` : '');
    const incoming = records
      .incoming()
      .map(
        (i) =>
          `<div class="fhf-incoming" data-fhf="incoming" data-incoming-source="${i.source}"><div class="fhf-incoming-title">${escapeHtml(i.title)}</div><div class="fhf-incoming-from" data-fhf="incoming-from">${escapeHtml(i.provenance)}</div><div class="fhf-incoming-note">${escapeHtml(i.note)}</div>${i.rows
            .map((row) => `<div class="fhf-incoming-row"><span>${escapeHtml(row.label)}</span> <strong>${escapeHtml(row.text)}</strong></div>`)
            .join('')}</div>`
      )
      .join('');
    const fields = form.fields.map((f) => this.fieldHtml_(f, entries, numbering, runs, checks.get(f.key))).join('');
    const filed = records.recordsFor(form.id);
    const last = filed.length
      ? `<div class="fhf-filed" data-fhf="filed">Filed ${filed.length} time${filed.length === 1 ? '' : 's'}; last at ${clock(filed[filed.length - 1].submittedAtS)}.</div>`
      : '';
    // The picker, title and Check/Submit buttons are built once per form and patched in place: a redraw that
    // replaces the node under the pointer swallows the click. Only the field list is rebuilt when evidence changes.
    if (this.builtForm_ !== form.id || !body.querySelector('[data-slot="fields"]')) {
      body.innerHTML = `<div data-slot="picker"></div><div class="fhf-title" data-slot="title"></div><div data-slot="incoming"></div><div data-slot="stale"></div><div class="fhf-fields" data-slot="fields"></div>
      <div class="fhf-actions" data-slot="actions"><button type="button" class="btn btn-sm btn-outline-secondary" data-hf-act="check">Check</button> <button type="button" class="btn btn-sm btn-outline-primary" data-hf-act="submit">Submit</button></div><div data-slot="filed"></div>`;
      this.builtForm_ = form.id;
      this.slotHtml_.clear();
    }
    this.patchSlot_(body, 'picker', picker);
    this.patchSlot_(body, 'title', escapeHtml(form.title));
    this.patchSlot_(body, 'incoming', incoming);
    this.patchSlot_(body, 'stale', stale);
    this.patchSlot_(body, 'filed', last);
    this.patchSlot_(body, 'fields', fields, true);
  }

  /** Replace a slot's markup only when it changed; the fields slot keeps the player's focus across the redraw */
  private patchSlot_(body: HTMLElement, name: string, markup: string, keepFocus = false): void {
    if (this.slotHtml_.get(name) === markup) return;
    const slot = body.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    if (!slot) return;
    const focused = keepFocus ? this.focusKey_(slot) : null;
    slot.innerHTML = markup;
    this.slotHtml_.set(name, markup);
    if (focused) this.restoreFocus_(slot, focused);
  }

  private focusKey_(slot: HTMLElement): { sel: string; start: number | null; end: number | null } | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !slot.contains(active)) return null;
    const field = active.getAttribute('data-hf-field');
    const cite = active.getAttribute('data-hf-cite');
    const sel = field !== null ? `[data-hf-field="${field}"]` : cite !== null ? `[data-hf-cite="${cite}"][data-hf-key="${active.getAttribute('data-hf-key') ?? ''}"]` : null;
    if (sel === null) return null;
    const input = active as HTMLInputElement;
    const textual = active.tagName === 'INPUT' && input.type !== 'checkbox';

    return { sel, start: textual ? input.selectionStart : null, end: textual ? input.selectionEnd : null };
  }

  private restoreFocus_(slot: HTMLElement, key: { sel: string; start: number | null; end: number | null }): void {
    const next = slot.querySelector<HTMLInputElement>(key.sel);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (key.start !== null && key.end !== null) {
      try {
        next.setSelectionRange(key.start, key.end);
      } catch {
        // number inputs do not support selection ranges
      }
    }
  }

  private readingHint_(f: HandoverFieldConfig): string {
    const rule = f.rule;
    if ('matchesCurrent' in rule) return describeReading(this.deps_.service(), rule.matchesCurrent.serviceId, rule.matchesCurrent.layer).text;

    return this.readingFor_(f) ?? '';
  }

  private fieldHtml_(
    f: HandoverFieldConfig,
    entries: readonly EvidenceEntry[],
    numbering: Map<string, number>,
    runs: readonly WorkloadRun[],
    check: { ok: boolean; reason?: string } | undefined
  ): string {
    const rule = f.rule;
    const cur = this.input_[f.key] ?? {};
    const val = cur.value === undefined ? '' : String(cur.value);
    const k = escapeHtml(f.key);
    const label = `<span class="fhf-label">${escapeHtml(f.label)}${f.required ? '' : ' (optional)'}</span>`;
    const citeBoxes = (kind: string | null): string => {
      const list = entries.filter((e) => (kind === null ? e.kind !== 'hypothesis' : e.kind === kind));
      if (list.length === 0) return `<span class="fhf-none">No ${kind ? KIND_LABEL[kind]?.toLowerCase() : 'notebook'} entries yet.</span>`;
      const picked = new Set(cur.cites ?? []);

      return list
        .map(
          (e) =>
            `<label class="fhf-cite"><input type="checkbox" data-hf-key="${k}" data-hf-cite="${escapeHtml(e.id)}"${picked.has(e.id) ? ' checked' : ''} /> #${numbering.get(e.id)} ${escapeHtml(clock(e.tS))} ${escapeHtml(e.text)}</label>`
        )
        .join('');
    };
    let widget: string;
    if ('cites' in rule) {
      const min = rule.min ?? 1;
      widget = `<div class="fhf-cites" data-hf-cites="${k}"><div class="fhf-hint">Tick at least ${min} ${escapeHtml(KIND_LABEL[rule.cites]?.toLowerCase() ?? rule.cites)} entr${min === 1 ? 'y' : 'ies'} from the notebook.</div>${citeBoxes(rule.cites)}</div>`;
    } else if ('evidence' in rule) {
      const needs = rule.evidence.map((g) => `<li>${escapeHtml(g.label)}${(g.min ?? 1) > 1 ? ` (${g.min})` : ''}</li>`).join('');
      widget = `<div class="fhf-cites" data-hf-cites="${k}"><div class="fhf-hint">Tick notebook entries that show each of these. One entry counts once.</div><ul class="fhf-needs" data-fhf="needs-${k}">${needs}</ul>${citeBoxes(null)}</div>`;
    } else if ('workload' in rule) {
      const mine = runs.filter((r) => r.cardId === rule.workload.cardId);
      const opts = mine
        .map((r) => `<option value="${escapeHtml(r.id)}"${r.id === val ? ' selected' : ''}>${escapeHtml(r.id)} (${escapeHtml(r.status)}, started ${clock(r.startS)})</option>`)
        .join('');
      widget = `<select class="form-select form-select-sm" data-hf-field="${k}" aria-label="${escapeHtml(f.label)}"><option value="">${mine.length ? 'Pick a run' : 'No runs yet'}</option>${opts}</select>`;
    } else if ('freshnessIs' in rule) {
      const opts = FRESHNESS_ANSWERS.map(([id, text]) => `<option value="${id}"${id === val ? ' selected' : ''}>${text}</option>`).join('');
      widget = `<select class="form-select form-select-sm" data-hf-field="${k}" aria-label="${escapeHtml(f.label)}"><option value="">Pick one</option>${opts}</select>`;
    } else if ('choice' in rule) {
      const opts = [...rule.choice, ...(rule.choice.includes(CHOICE_OTHER) ? [] : [CHOICE_OTHER])]
        .map((c) => `<option value="${escapeHtml(c)}"${c === val ? ' selected' : ''}>${escapeHtml(rule.labels?.[c] ?? humanize(c))}</option>`)
        .join('');
      widget = `<select class="form-select form-select-sm" data-hf-field="${k}" aria-label="${escapeHtml(f.label)}"><option value="">Pick one</option>${opts}</select>`;
    } else {
      const hint = this.readingHint_(f);
      const type = 'powerWithin' in rule || 'measured' in rule || 'interval' in rule || 'runRate' in rule ? 'number' : 'text';
      widget = `<span class="fhf-input"><input class="form-control form-control-sm" type="${type}"${type === 'number' ? ' step="any"' : ''} value="${escapeHtml(val)}" data-hf-field="${k}" aria-label="${escapeHtml(f.label)}" /> <button type="button" class="btn btn-sm btn-outline-secondary" data-hf-fill="${k}">Use my latest reading</button></span>${hint ? `<div class="fhf-hint" data-fhf="reading-${k}">${escapeHtml(hint)}</div>` : ''}`;
    }
    const backing =
      'cites' in rule || 'evidence' in rule
        ? ''
        : `<details class="fhf-backing"><summary>Back this with notebook entries${(cur.cites?.length ?? 0) > 0 ? ` (${cur.cites?.length})` : ''}</summary><div class="fhf-cites">${citeBoxes(null)}</div></details>`;
    const note = check ? `<div class="fhf-note ${check.ok ? 'fhf-ok' : 'fhf-bad'}" data-hf-note="${k}">${check.ok ? 'OK' : escapeHtml(check.reason ?? 'Not accepted.')}</div>` : '';

    return `<div class="fhf-field" data-hf-row="${k}">${label}${widget}${backing}${note}</div>`;
  }
}
