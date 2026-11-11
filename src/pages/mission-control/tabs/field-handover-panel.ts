import { UNTESTED_APPLICATION_TEXT, untestedApplication } from '@app/pages/mission-control/tabs/field-service-panel';
import { FORM_STEP_LATER_NOTE, type FormStepState } from '@app/pages/mission-control/tabs/form-step-state';
import type { EvidenceEntry, EvidenceLog } from '@app/physical/evidence-log';
import { type EvidenceGroup, entryMatches } from '@app/physical/evidence-predicates';
import type { FieldRecords, HandoverFieldConfig, HandoverFormConfig, HandoverInput, HandoverValidation } from '@app/physical/field-records';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { METRIC_LABEL } from '@app/physical/reading-labels';
import type { ServiceModel } from '@app/physical/service-model';
import { entryDisplayText, escapeHtml } from '@app/physical/ui/plant-ui-helpers';
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
  /** Scenario time a staged event fired (lets a slot list only entries that sit after that event) */
  eventFiredAtS?: (eventId: string) => number | null;
}

/** Said plainly wherever a form has a field that must match a service reading */
export const STALE_NOTE =
  'A reading goes out of date for two reasons. It gets old: each kind of check stays good for a few minutes of game time, and every check you run uses some of that time. Or something changes on site (a fix, a restart, a setting, an outage starting or ending). Take the reading again after your last change, then fill the form right away. The instrument or application that took the reading shows how long it stays current.';

const KIND_LABEL: Record<string, string> = { observation: 'Observed', action: 'Did', result: 'Result', hypothesis: 'Hypothesis' };
const CHOICE_OTHER = 'other';

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `elapsed ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** The entry a notebook line is about: the same service layer and metric, or the same subject and verb */
function sourceKey(e: EvidenceEntry): string {
  return e.sample ? `sample|${e.sample.serviceId}|${e.sample.endpointId ?? ''}|${e.sample.layer}|${e.sample.metric}` : `${e.kind}|${e.subject}|${e.verb ?? ''}`;
}

/** Newest entry per source first (newest at the top), every earlier entry of that source behind "Show older" */
export function splitLatestPerSource(list: readonly EvidenceEntry[]): { latest: EvidenceEntry[]; older: EvidenceEntry[] } {
  const newestFirst = list.map((e, i) => ({ e, i })).sort((a, b) => b.e.tS - a.e.tS || b.i - a.i);
  const seen = new Set<string>();
  const latest: EvidenceEntry[] = [];
  const older: EvidenceEntry[] = [];
  for (const { e } of newestFirst) {
    const k = sourceKey(e);
    if (seen.has(k)) older.push(e);
    else {
      seen.add(k);
      latest.push(e);
    }
  }

  return { latest, older };
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

/** Plain names for the numeric metrics a measured field can take */
const METRIC_NAME: Record<string, string> = { jitterMs: 'jitter', rttMs: 'delay', downMbps: 'download rate', upMbps: 'upload rate', lossPct: 'loss' };
/** The NetProbe command on the laptop that measures each metric */
const METRIC_COMMAND: Record<string, string> = { jitterMs: 'Jitter', rttMs: 'Ping', downMbps: 'Throughput', upMbps: 'Throughput', lossPct: 'Ping' };

/** What the "latest reading" hint prints for a matchesCurrent field */
export function describeReading(service: ServiceModel | null, serviceId: string, layer: Parameters<ServiceModel['latest']>[1]): { text: string; value?: string; current: boolean } {
  const sample = service?.latestAny(serviceId, layer) ?? null;
  if (!service || !sample) return { text: `No ${layer} reading taken yet.`, current: false };
  // An endpoint report with no workload run behind it reads the same here as in the Service checks panel (c6-s11-F7)
  if (untestedApplication(service, serviceId, sample))
    return { text: `Your latest ${layer} reading, ${clock(sample.tS)}: ${UNTESTED_APPLICATION_TEXT}.`, value: String(sample.value), current: false };
  const fresh = service.freshness(sample);
  const value = String(sample.value);
  // The field takes the bare value; the hint names the metric and unit so "55" is never unlabelled (c6-s10-F4)
  const shown = sample.unit === 'state' ? value : `${METRIC_LABEL[sample.metric]} ${value} ${sample.unit}`;
  if (fresh === 'current') return { text: `Your latest ${layer} reading, ${clock(sample.tS)}: ${shown} (still current).`, value, current: true };

  return { text: `Your latest ${layer} reading, ${clock(sample.tS)}: ${shown} (out of date, take a new one).`, value, current: false };
}

/** The first few failing fields with their reasons, so a refusal names the slot and why (c6-s12-F2) */
function failureSummary(validation: HandoverValidation): string {
  const failing = validation.fields.filter((f) => !f.ok && f.reason);
  const shown = failing.slice(0, 3).map((f) => f.reason);
  const more = failing.length > shown.length ? ` (and ${failing.length - shown.length} more; see the notes under each field)` : '';

  return shown.length === 0 ? 'See the notes under each field.' : `${shown.join(' ')}${more}`;
}

/** How long a press blocks a redraw of the panel (a press that never gets its release stops blocking after this) */
const POINTER_HOLD_MS = 1500;

export class FieldHandoverPanel {
  private built_ = false;
  private formId_ = '';
  private input_: HandoverInput = {};
  /** Entries of the forms the player is not looking at: switching blank forms keeps each form's own pencil */
  private readonly drafts_ = new Map<string, HandoverInput>();
  private dynKey_: string | null = null;
  /** Fields whose "Show older" list the player opened (a redraw keeps it open) */
  private readonly olderOpen_ = new Set<string>();
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
    this.host_.addEventListener('toggle', this.onToggle_, true);
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
    this.host_.addEventListener('input', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('pointerdown', this.onPointerDown_);
    this.host_.removeEventListener('pointerup', this.onPointerUp_);
    this.host_.removeEventListener('toggle', this.onToggle_, true);
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
    this.host_.removeEventListener('input', this.onChange_);
  }

  // ------------------------------------------------------------------ API

  selectForm(formId: string): void {
    if (formId === this.formId_) return;
    if (this.formId_) this.drafts_.set(this.formId_, this.input_);
    this.formId_ = formId;
    this.input_ = this.drafts_.get(formId) ?? {};
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
      this.msg_ = 'There is no reading to use yet. Take one first (for a power figure, Inspect that part in the site close-up, or type the Power panel figure).';
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
    this.msg_ = this.result_.ok ? 'Everything checks out. You can submit.' : `Not ready yet. ${failureSummary(this.result_)}`.trim();
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
      const hasHypothesis = (this.deps_.plant()?.getConfig().hypothesisSpecs?.length ?? 0) > 0;
      const note = hasHypothesis
        ? ' The form clears once filed. Checklist rows about a cause also need a hypothesis in the Notebook, with the entries that back it.'
        : ' The form clears once filed.';
      this.msg_ = `Submitted at ${clock(res.record.submittedAtS)}.${note}${this.deps_.formStep?.(this.formId_) === 'later' ? ` ${FORM_STEP_LATER_NOTE}` : ''}`;
      this.input_ = {};
      this.drafts_.delete(this.formId_);
      this.result_ = null;
    } else {
      this.msg_ = `Rejected. Nothing was filed. Your entries are kept. ${failureSummary(res.validation)}`.trim();
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

  private readonly onToggle_ = (e: Event): void => {
    const d = e.target as HTMLElement;
    const key = d.getAttribute?.('data-hf-older');
    if (key === null || key === undefined) return;
    if ((d as HTMLDetailsElement).open) this.olderOpen_.add(key);
    else this.olderOpen_.delete(key);
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
    const formSel = el.closest<HTMLInputElement>('input[data-hf-form]');
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
    if (field instanceof HTMLInputElement && field.type === 'radio' && !field.checked) return;
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
      // A printed form on a clipboard sheet: the margin note (pencil) reports what the last Check or Sign did
      this.host_.innerHTML = `
      <section class="fhf" aria-label="Handover form">
        <div class="fhf-body" data-fhf="body"></div>
        <footer class="fhf-foot">
          <p class="fhf-msg" data-fhf="msg" role="status" aria-live="polite"></p>
          <div data-slot="filed"></div>
          <div class="fhf-actions" data-slot="actions"><button type="button" class="fhf-pencil-btn" data-hf-act="check">Check</button><div class="fhf-sign"><span class="fhf-sign-caption">Operator signature</span><button type="button" class="fhf-sign-btn" data-hf-act="submit">Sign</button></div></div>
        </footer>
      </section>`;
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
        ? `<div class="fhf-forms" role="radiogroup" aria-label="Handover form"><span class="fhf-forms-label">Form no.</span>${forms
            .map(
              (f, i) =>
                `<label class="fhf-formtab"><input type="radio" name="hf-form" data-hf-form value="${escapeHtml(f.id)}"${f.id === this.formId_ ? ' checked' : ''} /><span class="fhf-formtab-no">${i + 1}</span><span>${escapeHtml(f.title)}</span></label>`
            )
            .join('')}</div>`
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
      body.innerHTML = `<div data-slot="picker"></div><h2 class="fhf-title" data-slot="title"></h2><div data-slot="incoming"></div><div class="fhf-fields" data-slot="fields"></div><div data-slot="stale"></div>`;
      this.builtForm_ = form.id;
      this.slotHtml_.clear();
    }
    this.patchSlot_(body, 'picker', picker);
    const firedAtS = form.eventNote ? (this.deps_.eventFiredAtS?.(form.eventNote.eventId) ?? null) : null;
    const eventNote =
      form.eventNote && firedAtS !== null ? `<div class="fhf-incoming-note" data-fhf="event-note">${escapeHtml(form.eventNote.text)} at ${clock(firedAtS)}.</div>` : '';
    this.patchSlot_(body, 'title', escapeHtml(form.title) + eventNote);
    this.patchSlot_(body, 'incoming', incoming);
    this.patchSlot_(body, 'stale', stale);
    this.patchSlot_(body, 'filed', last);
    this.patchSlot_(body, 'fields', fields, true);
  }

  /** Replace a slot's markup only when it changed; the fields slot keeps the player's focus across the redraw */
  private patchSlot_(body: HTMLElement, name: string, markup: string, keepFocus = false): void {
    if (this.slotHtml_.get(name) === markup) return;
    const slot = (name === 'filed' ? this.host_ : body).querySelector<HTMLElement>(`[data-slot="${name}"]`);
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
    const radioValue = (active as HTMLInputElement).type === 'radio' ? `[value="${(active as HTMLInputElement).value}"]` : '';
    const sel =
      field !== null ? `[data-hf-field="${field}"]${radioValue}` : cite !== null ? `[data-hf-cite="${cite}"][data-hf-key="${active.getAttribute('data-hf-key') ?? ''}"]` : null;
    if (sel === null) return null;
    const input = active as HTMLInputElement;
    const textual = active.tagName === 'INPUT' && input.type !== 'checkbox' && input.type !== 'radio';

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

  /** The evidence groups a slot's entries must fill, or null when any notebook entry may back it */
  private slotGroups_(rule: HandoverFieldConfig['rule']): EvidenceGroup[] | null {
    if ('evidence' in rule) return rule.evidence;
    if ('choice' in rule && rule.backing) return Object.values(rule.backing).flat();

    return null;
  }

  private readingHint_(f: HandoverFieldConfig): string {
    const rule = f.rule;
    if ('matchesCurrent' in rule) return describeReading(this.deps_.service(), rule.matchesCurrent.serviceId, rule.matchesCurrent.layer).text;

    const reading = this.readingFor_(f);
    if (reading === undefined && 'measured' in rule) {
      const name = METRIC_NAME[rule.measured.metric] ?? 'reading';

      const command = METRIC_COMMAND[rule.measured.metric] ?? 'Ping';
      return `No ${name} measured yet. Run a speed test in the terminal's app, or run ${command} on the terminal in NetProbe on the laptop.`;
    }

    if (reading === undefined && 'powerWithin' in rule) {
      const part = rule.powerWithin.partId === undefined ? 'power equipment' : (this.deps_.plant()?.getLabel(rule.powerWithin.partId) ?? 'power equipment');

      return `No reading yet. Inspect the ${part} in the site close-up to read its display, then use it here. You can also type the figure shown in the Power panel.`;
    }

    return reading ?? '';
  }

  /** A written-in answer as a column of printed tick boxes, one of which is ticked */
  private ticks_(key: string, label: string, options: ReadonlyArray<readonly [string, string]>, chosen: string): string {
    const items = options
      .map(
        ([id, text]) =>
          `<label class="fhf-tick"><input type="radio" name="hf-${key}" data-hf-field="${key}" value="${escapeHtml(id)}"${id === chosen ? ' checked' : ''} /><span>${escapeHtml(text)}</span></label>`
      )
      .join('');

    return `<div class="fhf-ticks fhf-pick-one" role="radiogroup" aria-label="${escapeHtml(label)}"><span class="fhf-pick-cap">Tick one</span>${items}</div>`;
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
    const groups = this.slotGroups_(rule);
    const ctx = { eventFiredAtS: (id: string): number | null => this.deps_.eventFiredAtS?.(id) ?? null };
    const picked = new Set(cur.cites ?? []);
    const canBack = (e: EvidenceEntry): boolean =>
      groups === null || picked.has(e.id) || groups.some((g) => entryMatches(e, g.match, ctx, entries) || (g.orMatch ?? []).some((p) => entryMatches(e, p, ctx, entries)));
    const citeBoxes = (kind: string | null): string => {
      const list = entries.filter((e) => (kind === null ? e.kind !== 'hypothesis' : e.kind === kind) && canBack(e));
      if (list.length === 0)
        return `<span class="fhf-none">${groups ? 'No notebook entry can back this slot yet.' : `No ${kind ? KIND_LABEL[kind]?.toLowerCase() : 'notebook'} entries yet.`}</span>`;
      const box = (e: EvidenceEntry): string =>
        `<label class="fhf-cite fhf-tick"><input type="checkbox" data-hf-key="${k}" data-hf-cite="${escapeHtml(e.id)}"${picked.has(e.id) ? ' checked' : ''} /><span>#${numbering.get(e.id)} ${escapeHtml(clock(e.tS))} ${escapeHtml(entryDisplayText(e, this.deps_.plant()))}</span></label>`;
      const { latest, older } = splitLatestPerSource(list);
      if (older.length === 0) return latest.map(box).join('');
      const open = older.some((e) => picked.has(e.id)) || this.olderOpen_.has(f.key);

      return `${latest.map(box).join('')}<details class="fhf-older" data-hf-older="${k}"${open ? ' open' : ''}><summary>Show older (${older.length})</summary>${older.map(box).join('')}</details>`;
    };
    let widget: string;
    let okText = 'OK. Accepted for this form';
    if ('cites' in rule) {
      const min = rule.min ?? 1;
      widget = `<div class="fhf-cites" data-hf-cites="${k}"><div class="fhf-hint">Tick at least ${min} ${escapeHtml(KIND_LABEL[rule.cites]?.toLowerCase() ?? rule.cites)} entr${min === 1 ? 'y' : 'ies'} from the notebook.</div>${citeBoxes(rule.cites)}</div>`;
    } else if ('evidence' in rule) {
      const needs = rule.evidence.map((g) => `<li>${escapeHtml(g.label)}${(g.min ?? 1) > 1 ? ` (${g.min})` : ''}</li>`).join('');
      widget = `<div class="fhf-cites" data-hf-cites="${k}"><div class="fhf-hint">Required: tick notebook entries for &ldquo;${escapeHtml(f.label)}&rdquo; that show each of these. Only entries that can back this slot are listed, newest first. One entry counts once.</div><ul class="fhf-needs" data-fhf="needs-${k}">${needs}</ul>${citeBoxes(null)}</div>`;
    } else if ('workload' in rule) {
      const pathLabel = (serviceId: string): string => this.deps_.service()?.getPath(serviceId)?.label ?? serviceId;
      const runLabel = (r: WorkloadRun): string =>
        `Run ${r.id.replace(/^run-/u, '#')} on ${pathLabel(r.serviceId)}, started ${clock(r.startS)} (${r.status})${r.invalidatedBy ? ', no longer counts' : ''}`;
      // A run the plant event invalidated is hidden unless it is already the chosen value (c6-s14-F3)
      const mine = runs.filter(
        (r) => r.cardId === rule.workload.cardId && (rule.workload.serviceId === undefined || r.serviceId === rule.workload.serviceId) && (!r.invalidatedBy || r.id === val)
      );
      widget = mine.length
        ? this.ticks_(
            k,
            f.label,
            mine.map((r) => [r.id, runLabel(r)] as const),
            val
          )
        : `<p class="fhf-none" data-hf-field-group="${k}">No runs yet: start one in MissionRunner on the laptop first</p>`;
    } else if ('freshnessIs' in rule) {
      widget = this.ticks_(k, f.label, FRESHNESS_ANSWERS, val);
    } else if ('choice' in rule) {
      const options = [...rule.choice, ...(rule.choice.includes(CHOICE_OTHER) ? [] : [CHOICE_OTHER])].map((c) => [c, rule.labels?.[c] ?? humanize(c)] as const);
      widget = this.ticks_(k, f.label, options, val);
      // A long option is cut off inside the select, so the check repeats the full chosen text (c6-s10-F5)
      if (val) okText = `OK. Accepted: ${rule.labels?.[val] ?? humanize(val)}`;
    } else {
      const hint = this.readingHint_(f);
      const type = 'powerWithin' in rule || 'measured' in rule || 'interval' in rule || 'runRate' in rule ? 'number' : 'text';
      widget = `<span class="fhf-input"><input class="fhf-write" type="${type}"${type === 'number' ? ' step="any"' : ''} value="${escapeHtml(val)}" data-hf-field="${k}" aria-label="${escapeHtml(f.label)}" autocomplete="off" /><button type="button" class="fhf-pencil-btn" data-hf-fill="${k}">Copy latest reading</button></span>${hint ? `<div class="fhf-hint" data-fhf="reading-${k}">${escapeHtml(hint)}</div>` : ''}`;
    }
    const backing =
      'cites' in rule || 'evidence' in rule
        ? ''
        : `<details class="fhf-backing"><summary>Back this with notebook entries${groups === null ? ' (optional)' : ''}${(cur.cites?.length ?? 0) > 0 ? ` (${cur.cites?.length})` : ''}</summary><div class="fhf-cites">${citeBoxes(null)}</div></details>`;
    const note = check
      ? `<div class="fhf-note ${check.ok ? 'fhf-ok' : 'fhf-bad'}" data-hf-note="${k}">${check.ok ? escapeHtml(okText) : escapeHtml(check.reason ?? 'Not accepted.')}</div>`
      : '';

    return `<div class="fhf-field" data-hf-row="${k}">${label}${widget}${backing}${note}</div>`;
  }
}
