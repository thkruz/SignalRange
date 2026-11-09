import type { EvidenceEntry, EvidenceKind, EvidenceLog, HypothesisEntry } from '@app/physical/evidence-log';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-notebook-panel.css';

/**
 * FieldNotebookPanel - Evidence notebook (Phase 38.2, M12)
 *
 * A timeline of what the player observed, did and measured (the immutable `EvidenceLog` entries,
 * newest first) and a hypothesis form: scope, target, cause, confidence and the entries that back
 * it. A hypothesis is written to the log like any other entry; the panel never grades it and never
 * shows fault truth. Without an evidence log (no authored services or events) the panel is hidden.
 */

export type HypothesisScope = HypothesisEntry['claim']['scope'];
export type HypothesisConfidence = HypothesisEntry['confidence'];

export interface NotebookTarget {
  id: string;
  label: string;
}

export const SCOPES: readonly HypothesisScope[] = ['part', 'segment', 'power', 'provider', 'endpoint'];
export const CONFIDENCES: readonly HypothesisConfidence[] = ['low', 'medium', 'high'];

const SCOPE_LABEL: Record<HypothesisScope, string> = {
  part: 'A part, connector or cable',
  segment: 'A service path segment',
  power: 'Power supply',
  provider: 'The provider',
  endpoint: 'The far endpoint',
};

/** One authored cause the notebook offers (M21) */
export interface CauseOption {
  id: string;
  label: string;
}

const KIND_LABEL: Record<EvidenceKind, string> = { observation: 'Observed', action: 'Did', result: 'Result', hypothesis: 'Hypothesis' };

const HISTORY_SHOWN = 60;

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Plain-language sentence a hypothesis freezes into the log */
export function describeHypothesis(claim: HypothesisEntry['claim'], targetLabel: string, confidence: HypothesisConfidence, citedCount: number): string {
  const cause = claim.cause?.trim();
  const what = cause ? `${targetLabel}: ${cause}` : targetLabel;
  const basis = citedCount === 0 ? 'no cited entries' : `${citedCount} cited ${citedCount === 1 ? 'entry' : 'entries'}`;

  return `Suspect ${what} (${SCOPE_LABEL[claim.scope].toLowerCase()}), ${confidence} confidence, ${basis}.`;
}

export interface NotebookLine {
  id: string;
  kind: EvidenceKind;
  kindLabel: string;
  stamp: string;
  text: string;
  /** Hypotheses only: cited entry stamps like "#3" */
  cites: string;
}

/** Everything one timeline row prints */
export function buildNotebookLine(entry: EvidenceEntry, all: readonly EvidenceEntry[]): NotebookLine {
  let cites = '';
  if (entry.kind === 'hypothesis') {
    const ids = (entry as HypothesisEntry).citedEntryIds;
    cites = ids
      .map((id) => all.findIndex((e) => e.id === id))
      .filter((i) => i >= 0)
      .map((i) => `#${i + 1}`)
      .join(', ');
  }

  return { id: entry.id, kind: entry.kind, kindLabel: KIND_LABEL[entry.kind], stamp: clock(entry.tS), text: entry.text, cites };
}

export class FieldNotebookPanel {
  private built_ = false;
  private lineKey_: string | null = null;
  private citeKey_: string | null = null;
  private targetKey_ = '';
  private lastMsg_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly getLog_: () => EvidenceLog | null,
    /** Selectable targets for a scope */
    private readonly getTargets_: (scope: HypothesisScope) => NotebookTarget[],
    /** Authored cause options (M21). When present the cause is a select of option ids plus an "other" that never matches; absent = free text */
    private readonly getCauseOptions_: () => CauseOption[] | null = () => null
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
  }

  /** Write a hypothesis as if the player pressed Add; returns the entry or a reason */
  addHypothesis(input: { scope: HypothesisScope; targetId: string; cause?: string; confidence: HypothesisConfidence; citedEntryIds: string[] }): HypothesisEntry | string {
    const log = this.getLog_();
    if (!log) return 'no-log';
    const target = this.getTargets_(input.scope).find((t) => t.id === input.targetId);
    if (!target) {
      this.lastMsg_ = 'Pick what you suspect first.';
      this.sync();

      return 'no-target';
    }
    const known = new Set(log.entries().map((e) => e.id));
    const cited = input.citedEntryIds.filter((id) => known.has(id));
    const options = this.getCauseOptions_();
    const cause = input.cause?.trim() || undefined;
    const causeLabel = options?.find((o) => o.id === cause)?.label;
    const claim: HypothesisEntry['claim'] = { scope: input.scope, targetId: input.targetId, ...(cause ? { cause } : {}) };
    const entry = log.addHypothesis({
      subject: input.targetId,
      source: {},
      facts: [],
      text: describeHypothesis(causeLabel ? { ...claim, cause: causeLabel } : claim, target.label, input.confidence, cited.length),
      claim,
      confidence: input.confidence,
      citedEntryIds: cited,
    });
    this.lastMsg_ = `Hypothesis saved at ${clock(entry.tS)}.`;
    this.sync();

    return entry;
  }

  private readonly onClick_ = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-nb-act="add"]');
    if (!btn) return;
    const q = <T extends HTMLElement>(sel: string): T | null => this.host_.querySelector<T>(sel);
    const cited = [...this.host_.querySelectorAll<HTMLInputElement>('input[data-nb-cite]:checked')].map((i) => i.dataset.nbCite ?? '');
    const res = this.addHypothesis({
      scope: (q<HTMLSelectElement>('select[data-nb-scope]')?.value ?? 'part') as HypothesisScope,
      targetId: q<HTMLSelectElement>('select[data-nb-target]')?.value ?? '',
      cause: q<HTMLInputElement | HTMLSelectElement>('[data-nb-cause]')?.value,
      confidence: (q<HTMLSelectElement>('select[data-nb-confidence]')?.value ?? 'medium') as HypothesisConfidence,
      citedEntryIds: cited,
    });
    if (typeof res !== 'string') {
      const cause = q<HTMLInputElement | HTMLSelectElement>('[data-nb-cause]');
      if (cause) cause.value = '';
      for (const box of this.host_.querySelectorAll<HTMLInputElement>('input[data-nb-cite]')) box.checked = false;
    }
  };

  private readonly onChange_ = (e: Event): void => {
    if ((e.target as HTMLElement).closest('select[data-nb-scope]')) {
      this.targetKey_ = '';
      this.sync();
    }
  };

  sync(): void {
    const log = this.getLog_();
    if (!log) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    if (!this.built_) {
      this.build_();
      this.built_ = true;
    }
    this.patch_(log);
  }

  private build_(): void {
    const scopes = SCOPES.map((s) => `<option value="${s}">${SCOPE_LABEL[s]}</option>`).join('');
    const causeOptions = this.getCauseOptions_();
    const causeField = causeOptions
      ? `<label>Cause <select class="form-select form-select-sm" data-nb-cause aria-label="Hypothesis cause"><option value="">Choose a cause</option>${causeOptions.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('')}<option value="other">Something else</option></select></label>`
      : '<label>Cause (optional) <input class="form-control form-control-sm" type="text" maxlength="80" data-nb-cause aria-label="Hypothesis cause" /></label>';
    const conf = CONFIDENCES.map((c) => `<option value="${c}"${c === 'medium' ? ' selected' : ''}>${c[0].toUpperCase()}${c.slice(1)}</option>`).join('');
    this.host_.innerHTML = `
      <details class="fnb" open>
        <summary class="fnb-summary"><b>Notebook</b> <span class="fnb-last" data-fnb="last" aria-live="polite"></span></summary>
        <div class="fnb-body">
          <div class="fnb-group-title">Timeline</div>
          <ol class="fnb-lines" data-fnb="lines" reversed></ol>
          <div class="fnb-group-title">Hypothesis</div>
          <div class="fnb-form">
            <label>I suspect <select class="form-select form-select-sm" data-nb-scope aria-label="Hypothesis scope">${scopes}</select></label>
            <label>Target <select class="form-select form-select-sm" data-nb-target aria-label="Hypothesis target"></select></label>
            ${causeField}
            <label>Confidence <select class="form-select form-select-sm" data-nb-confidence aria-label="Hypothesis confidence">${conf}</select></label>
            <fieldset class="fnb-cites"><legend>Backed by</legend><div data-fnb="cites"></div></fieldset>
            <button type="button" class="btn btn-sm btn-outline-primary" data-nb-act="add">Add hypothesis</button>
          </div>
        </div>
      </details>`;
  }

  private patch_(log: EvidenceLog): void {
    const last = this.host_.querySelector<HTMLElement>('[data-fnb="last"]');
    if (last && last.textContent !== this.lastMsg_) last.textContent = this.lastMsg_;

    const all = log.entries();
    const lines = all
      .map((e) => buildNotebookLine(e, all))
      .slice(-HISTORY_SHOWN)
      .reverse();
    const lineKey = lines.map((l) => l.id).join('|');
    const list = this.host_.querySelector<HTMLElement>('[data-fnb="lines"]');
    if (list && lineKey !== this.lineKey_) {
      this.lineKey_ = lineKey;
      list.innerHTML =
        lines.length === 0
          ? '<li class="fnb-none">Nothing recorded yet. Inspect, measure or fix something and it appears here.</li>'
          : lines
              .map((l) => {
                const n = all.findIndex((e) => e.id === l.id) + 1;

                return `<li class="fnb-line fnb-k-${l.kind}" data-nb-entry="${escapeHtml(l.id)}" value="${n}"><span class="fnb-meta">${escapeHtml(l.stamp)}</span> <span class="fnb-badge">${escapeHtml(l.kindLabel)}</span> ${escapeHtml(l.text)}${l.cites ? ` <span class="fnb-meta">cites ${escapeHtml(l.cites)}</span>` : ''}</li>`;
              })
              .join('');
    }

    const scope = (this.host_.querySelector<HTMLSelectElement>('select[data-nb-scope]')?.value ?? 'part') as HypothesisScope;
    const targets = this.getTargets_(scope);
    const targetKey = `${scope}:${targets.map((t) => t.id).join(',')}`;
    const targetSel = this.host_.querySelector<HTMLSelectElement>('select[data-nb-target]');
    if (targetSel && targetKey !== this.targetKey_) {
      const keep = targetSel.value;
      this.targetKey_ = targetKey;
      targetSel.innerHTML = targets.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`).join('');
      if (targets.some((t) => t.id === keep)) targetSel.value = keep;
    }

    const citable = all.filter((e) => e.kind !== 'hypothesis');
    const citeKey = citable.map((e) => e.id).join('|');
    const cites = this.host_.querySelector<HTMLElement>('[data-fnb="cites"]');
    if (cites && citeKey !== this.citeKey_) {
      const checked = new Set([...cites.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.dataset.nbCite));
      this.citeKey_ = citeKey;
      cites.innerHTML =
        citable.length === 0
          ? '<span class="fnb-none">No entries to cite yet.</span>'
          : citable
              .map((e) => {
                const n = all.findIndex((x) => x.id === e.id) + 1;

                return `<label class="fnb-cite"><input type="checkbox" data-nb-cite="${escapeHtml(e.id)}"${checked.has(e.id) ? ' checked' : ''} /> #${n} ${escapeHtml(clock(e.tS))} ${escapeHtml(e.text)}</label>`;
              })
              .join('');
    }
  }
}
