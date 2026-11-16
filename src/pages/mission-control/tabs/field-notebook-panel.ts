import notebookDesk from '@app/assets/images/ui/field-notebook.png';
import { displayViewport } from '@app/game-menu/display-viewport';
import type { EvidenceEntry, EvidenceKind, EvidenceLog, HypothesisEntry } from '@app/physical/evidence-log';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-notebook-panel.css';

/**
 * FieldNotebookPanel - Evidence notebook (Phase 38.2, M12)
 *
 * An in-world notebook with chronological observation pages and a hypothesis composed through
 * editable handwritten phrases. Margin marks cite evidence across page turns.
 * A hypothesis is written to the log like any other entry; the panel never grades it and never
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

const ENTRIES_PER_PAGE = 4;

function choices(attribute: string, options: { id: string; label: string }[], selected = ''): string {
  return options
    .map(
      (o) =>
        `<label class="fnb-choice"><input type="radio" name="${attribute}" ${attribute} value="${escapeHtml(o.id)}"${o.id === selected ? ' checked' : ''} /><span>${escapeHtml(o.label)}</span></label>`
    )
    .join('');
}

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `elapsed ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
export function buildNotebookLine(entry: EvidenceEntry, all: readonly EvidenceEntry[], textOf: (e: EvidenceEntry) => string = (e) => e.text): NotebookLine {
  let cites = '';
  if (entry.kind === 'hypothesis') {
    const ids = (entry as HypothesisEntry).citedEntryIds;
    cites = ids
      .map((id) => all.findIndex((e) => e.id === id))
      .filter((i) => i >= 0)
      .map((i) => `#${i + 1}`)
      .join(', ');
  }

  return { id: entry.id, kind: entry.kind, kindLabel: KIND_LABEL[entry.kind], stamp: clock(entry.tS), text: textOf(entry), cites };
}

export class FieldNotebookPanel {
  private built_ = false;
  private lineKey_: string | null = null;
  private readonly cited_ = new Set<string>();
  private page_ = -1;
  private targetKey_ = '';
  private lastMsg_ = '';
  private immersive_: HTMLDialogElement | null = null;
  private returnPoint_: Comment | null = null;

  constructor(
    private readonly host_: HTMLElement,
    private readonly getLog_: () => EvidenceLog | null,
    /** Selectable targets for a scope */
    private readonly getTargets_: (scope: HypothesisScope) => NotebookTarget[],
    /** Authored cause choices (M21), plus an "other" that never matches; absent = free text */
    private readonly getCauseOptions_: () => CauseOption[] | null = () => null,
    /** Scenario check of a saved hypothesis: the reason it does not hold up yet, or null. Never blocks saving. */
    private readonly getFeedback_: (entry: HypothesisEntry) => string | null = () => null,
    /** Wording of one entry (part prefix); default is the entry text */
    private readonly textOf_: (entry: EvidenceEntry) => string = (e) => e.text,
    /** Requirement lines per alternative evidence route, from the scenario's hypothesis specs; empty = none authored */
    private readonly getRequirements_: () => string[][] = () => [],
    private readonly onPutDown_: (() => void) | null = null
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
    this.host_.addEventListener('input', this.onInput_);
    this.host_.addEventListener('keydown', this.onKeydown_);
  }

  destroy(): void {
    this.setImmersive(false);
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
    this.host_.removeEventListener('input', this.onInput_);
    this.host_.removeEventListener('keydown', this.onKeydown_);
  }

  /** Pick up the existing notebook, retaining drafts, page position and evidence marks. */
  setImmersive(open: boolean): void {
    if (!open) {
      if (!this.immersive_) return;
      window.removeEventListener('resize', this.resizeImmersive_);
      this.closePicker_();
      this.immersive_.close();
      this.returnPoint_?.replaceWith(this.host_);
      this.returnPoint_ = null;
      this.immersive_.remove();
      this.immersive_ = null;
      return;
    }
    if (this.immersive_?.open || !this.host_.isConnected) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'fnb-immersive';
    dialog.setAttribute('aria-label', 'Field notebook');
    dialog.setAttribute('aria-modal', 'true');
    const putDown = document.createElement('button');
    putDown.type = 'button';
    putDown.className = 'fnb-put-down';
    putDown.textContent = 'Put notebook down · Esc';
    putDown.setAttribute('aria-label', 'Put notebook down');
    putDown.addEventListener('click', this.putDown_);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.putDown_();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        const targets = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length > 0);
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      // A phrase choice consumes Escape first; the next Escape puts the book down.
      if (event.key === 'Escape') {
        event.preventDefault();
        this.putDown_();
      }
      event.stopPropagation();
    });
    this.returnPoint_ = document.createComment('notebook-resting-place');
    this.host_.before(this.returnPoint_);
    dialog.append(this.host_, putDown);
    document.body.append(dialog);
    this.immersive_ = dialog;
    this.resizeImmersive_();
    window.addEventListener('resize', this.resizeImmersive_);
    dialog.showModal();
    putDown.focus({ preventScroll: true });
  }

  private readonly putDown_ = (): void => {
    this.setImmersive(false);
    this.onPutDown_?.();
  };

  private readonly resizeImmersive_ = (): void => {
    if (!this.immersive_) return;
    const { width, height } = displayViewport();
    this.immersive_.style.width = `${width}px`;
    this.immersive_.style.height = `${height}px`;
    this.immersive_.style.setProperty('--fnb-scene-width', `${width}px`);
    this.immersive_.style.setProperty('--fnb-scene-height', `${height}px`);
  };

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
    const why = this.getFeedback_(entry);
    this.lastMsg_ = why ? `Hypothesis saved at ${clock(entry.tS)}, but it doesn't hold up yet. ${why}` : `Hypothesis saved at ${clock(entry.tS)}.`;
    this.sync();

    return entry;
  }

  private readonly onClick_ = (e: Event): void => {
    if ((e.target as HTMLElement).matches('input[type="radio"]')) {
      this.syncDraft_();
      this.closePicker_();
    }
    const pick = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-nb-pick]');
    if (pick) {
      const key = pick.dataset.nbPick;
      const wasOpen = pick.getAttribute('aria-expanded') === 'true';
      this.closePicker_();
      if (!wasOpen) {
        const sheet = this.host_.querySelector<HTMLElement>(`[data-nb-picker="${key}"]`);
        if (sheet) {
          sheet.hidden = false;
          pick.setAttribute('aria-expanded', 'true');
          sheet.querySelector<HTMLInputElement>('input:checked, input[type="text"], input[type="search"]')?.focus();
        }
      }
      return;
    }
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-nb-act]');
    if (!btn) return;
    if (btn.dataset.nbAct === 'close-picker') {
      this.closePicker_();
      return;
    }
    if (btn.dataset.nbAct === 'older' || btn.dataset.nbAct === 'newer') {
      const lastPage = Math.max(0, Math.ceil((this.getLog_()?.entries().length ?? 0) / ENTRIES_PER_PAGE) - 1);
      this.page_ = (this.page_ < 0 ? lastPage : this.page_) + (btn.dataset.nbAct === 'older' ? -1 : 1);
      this.sync();
      return;
    }
    if (btn.dataset.nbAct === 'clear') {
      this.cited_.clear();
      this.sync();
      return;
    }
    const q = <T extends HTMLElement>(sel: string): T | null => this.host_.querySelector<T>(sel);
    const res = this.addHypothesis({
      scope: (q<HTMLInputElement>('[data-nb-scope]:checked')?.value ?? 'part') as HypothesisScope,
      targetId: q<HTMLInputElement>('[data-nb-target]:checked')?.value ?? '',
      cause: q<HTMLInputElement>('[data-nb-cause]:checked, input[type="text"][data-nb-cause]')?.value,
      confidence: (q<HTMLInputElement>('[data-nb-confidence]:checked')?.value ?? 'medium') as HypothesisConfidence,
      citedEntryIds: [...this.cited_],
    });
    if (typeof res !== 'string') {
      for (const cause of this.host_.querySelectorAll<HTMLInputElement>('[data-nb-cause]')) {
        if (cause.type === 'radio') cause.checked = false;
        else cause.value = '';
      }
      this.cited_.clear();
      this.page_ = -1;
      this.sync();
    }
  };

  private readonly onChange_ = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-nb-cite]')) {
      const id = input.dataset.nbCite!;
      if (input.checked) this.cited_.add(id);
      else this.cited_.delete(id);
      this.sync();
    }
    if (input.matches('[data-nb-scope]')) {
      this.targetKey_ = '';
      const search = this.host_.querySelector<HTMLInputElement>('[data-nb-search]');
      if (search) search.value = '';
      this.sync();
    }
    if (input.matches('input[type="radio"]')) {
      this.syncDraft_();
      this.closePicker_();
    }
  };

  private readonly onInput_ = (e: Event): void => {
    if ((e.target as HTMLElement).matches('[data-nb-search]')) this.filterTargets_();
    if ((e.target as HTMLElement).matches('[data-nb-cause]')) this.syncDraft_();
  };

  private closePicker_(): void {
    const opener = this.host_.querySelector<HTMLButtonElement>('[data-nb-pick][aria-expanded="true"]');
    const inSheet = document.activeElement?.closest('[data-nb-picker]');
    for (const sheet of this.host_.querySelectorAll<HTMLElement>('[data-nb-picker]')) sheet.hidden = true;
    for (const button of this.host_.querySelectorAll<HTMLElement>('[data-nb-pick]')) button.setAttribute('aria-expanded', 'false');
    if (inSheet && this.host_.contains(inSheet)) opener?.focus();
  }

  private readonly onKeydown_ = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.host_.querySelector('[data-nb-pick][aria-expanded="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      this.closePicker_();
    }
  };

  private syncDraft_(): void {
    for (const key of ['scope', 'target', 'cause', 'confidence']) {
      const selected = this.host_.querySelector<HTMLInputElement>(`[data-nb-${key}]:checked, input[type="text"][data-nb-${key}]`);
      const label = selected?.type === 'text' ? selected.value : selected?.nextElementSibling?.textContent;
      const button = this.host_.querySelector<HTMLElement>(`[data-nb-pick="${key}"]`);
      if (button) button.textContent = label || (key === 'cause' ? 'choose a possible cause' : 'choose');
    }
  }

  private filterTargets_(): void {
    const text = this.host_.querySelector<HTMLInputElement>('[data-nb-search]')?.value.trim().toLowerCase() ?? '';
    for (const label of this.host_.querySelectorAll<HTMLElement>('.fnb-targets label')) label.hidden = !label.textContent?.toLowerCase().includes(text);
  }

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
    const scopes = choices(
      'data-nb-scope',
      SCOPES.map((s) => ({ id: s, label: SCOPE_LABEL[s] })),
      'part'
    );
    const causeOptions = this.getCauseOptions_();
    const causeField = causeOptions
      ? `<fieldset><legend>Possible cause</legend><div class="fnb-choices">${choices('data-nb-cause', [...causeOptions, { id: 'other', label: 'Something else' }])}</div></fieldset>`
      : '<label class="fnb-written">Possible cause <input type="text" maxlength="80" data-nb-cause aria-label="Hypothesis cause" placeholder="What might explain the observations?" /></label>';
    const conf = choices(
      'data-nb-confidence',
      CONFIDENCES.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) })),
      'medium'
    );
    const word = (key: string, label: string): string =>
      `<button type="button" class="fnb-word" data-nb-pick="${key}" aria-label="Choose ${label}" aria-expanded="false" aria-controls="nb-picker-${key}">choose</button>`;
    const sheet = (key: string, title: string, content: string): string =>
      `<div class="fnb-pencil-sheet" data-nb-picker="${key}" id="nb-picker-${key}" hidden><div class="fnb-sheet-heading">${title}<button type="button" data-nb-act="close-picker" aria-label="Finish choosing ${key}">×</button></div>${content}</div>`;
    this.host_.innerHTML = `
      <details class="fnb" open>
        <summary class="fnb-summary"><b>Notebook</b></summary>
        <div class="fnb-body" style="background-image:url('${notebookDesk}')">
          <section class="fnb-page fnb-observations" aria-label="Observation pages">
            <div class="fnb-page-heading"><span>FIELD NOTES</span><span data-fnb="page-number"></span></div>
            <h3>Observations &amp; readings</h3>
            <p class="fnb-instruction">Mark anything that supports the theory →</p>
            <ol class="fnb-lines" data-fnb="lines"></ol>
            <nav class="fnb-page-turn" aria-label="Notebook pages"><button type="button" data-nb-act="older" aria-label="Earlier entries">‹</button><span data-fnb="page-range"></span><button type="button" data-nb-act="newer" aria-label="Later entries">›</button></nav>
          </section>
          <section class="fnb-page fnb-form" aria-label="Working hypothesis">
            <div class="fnb-page-heading">WORKING THEORY</div>
            <h3>What explains it?</h3>
            <p class="fnb-instruction">Select an underlined phrase to write.</p>
            <div class="fnb-theory">
              <p>Check ${word('scope', 'scope')}:<br>${word('target', 'target')}.</p>
              <p>Possible explanation:<br>${word('cause', 'cause')}.</p>
              <p>${word('confidence', 'confidence')} confidence.</p>
            </div>
            <div class="fnb-cites"><p data-fnb="cites" aria-live="polite"></p><button type="button" data-nb-act="clear">Erase marks</button> · <button type="button" data-nb-pick="requirements" aria-expanded="false" aria-controls="nb-picker-requirements">Review case notes</button></div>
            <button type="button" class="fnb-save" data-nb-act="add">✓ Keep this theory</button>
            <p class="fnb-last" data-fnb="last" aria-live="polite"></p>
            ${sheet('scope', 'What am I investigating?', `<div class="fnb-choices">${scopes}</div>`)}
            ${sheet('target', 'Where should I look?', '<input type="search" data-nb-search aria-label="Find a hypothesis target" placeholder="Find in equipment notes…" /><div class="fnb-choices fnb-targets" data-fnb="targets"></div>')}
            ${sheet('cause', 'What could explain it?', causeField)}
            ${sheet('confidence', 'How certain am I?', `<div class="fnb-choices">${conf}</div>`)}
            ${sheet('requirements', 'Case notes', '<div class="fnb-needs" data-fnb="needs"></div>')}
          </section>
        </div>
      </details>`;
  }

  private patch_(log: EvidenceLog): void {
    const last = this.host_.querySelector<HTMLElement>('[data-fnb="last"]');
    if (last && last.textContent !== this.lastMsg_) last.textContent = this.lastMsg_;

    const all = log.entries();
    const pages = Math.max(1, Math.ceil(all.length / ENTRIES_PER_PAGE));
    const page = this.page_ < 0 ? pages - 1 : Math.min(pages - 1, this.page_);
    const start = page * ENTRIES_PER_PAGE;
    const end = Math.min(all.length, start + ENTRIES_PER_PAGE);
    const lines = all.slice(start, end).map((e) => buildNotebookLine(e, all, this.textOf_));
    const lineKey = lines.map((l) => l.id).join('|');
    const pageNumber = this.host_.querySelector('[data-fnb="page-number"]');
    if (pageNumber) pageNumber.textContent = `Page ${page + 1} / ${pages}`;
    const pageRange = this.host_.querySelector('[data-fnb="page-range"]');
    if (pageRange) pageRange.textContent = all.length ? `${start + 1}–${end} of ${all.length}` : 'Blank page';
    this.host_.querySelector<HTMLButtonElement>('[data-nb-act="older"]')!.disabled = page === 0;
    this.host_.querySelector<HTMLButtonElement>('[data-nb-act="newer"]')!.disabled = page >= pages - 1;
    const list = this.host_.querySelector<HTMLElement>('[data-fnb="lines"]');
    if (list && lineKey !== this.lineKey_) {
      this.lineKey_ = lineKey;
      list.innerHTML =
        lines.length === 0
          ? '<li class="fnb-none">Nothing recorded yet. Inspect, measure or fix something and it appears here.</li>'
          : lines
              .map((l) => {
                const n = all.findIndex((e) => e.id === l.id) + 1;

                const mark =
                  l.kind === 'hypothesis'
                    ? ''
                    : `<label class="fnb-mark"><input type="checkbox" data-nb-cite="${escapeHtml(l.id)}" aria-label="Cite entry ${n}" /><span>cite</span></label>`;
                return `<li class="fnb-line fnb-k-${l.kind}" data-nb-entry="${escapeHtml(l.id)}" value="${n}">${mark}<div class="fnb-entry-heading"><span>No. ${String(n).padStart(2, '0')}</span><span>${escapeHtml(l.stamp)} · ${escapeHtml(l.kindLabel)}</span></div><p>${escapeHtml(l.text)}</p>${l.cites ? `<small class="fnb-meta">cites ${escapeHtml(l.cites)}</small>` : ''}</li>`;
              })
              .join('');
    }

    for (const box of this.host_.querySelectorAll<HTMLInputElement>('[data-nb-cite]')) box.checked = this.cited_.has(box.dataset.nbCite!);
    const scope = (this.host_.querySelector<HTMLInputElement>('[data-nb-scope]:checked')?.value ?? 'part') as HypothesisScope;
    const targets = this.getTargets_(scope);
    const targetKey = `${scope}:${targets.map((t) => t.id).join(',')}`;
    const targetSel = this.host_.querySelector<HTMLElement>('[data-fnb="targets"]');
    if (targetSel && targetKey !== this.targetKey_) {
      const keep = targetSel.querySelector<HTMLInputElement>('input:checked')?.value;
      this.targetKey_ = targetKey;
      targetSel.innerHTML = choices('data-nb-target', targets, targets.some((t) => t.id === keep) ? keep : targets[0]?.id);
      this.filterTargets_();
    }

    const needs = this.host_.querySelector<HTMLElement>('[data-fnb="needs"]');
    if (needs) {
      const routes = this.getRequirements_();
      const needsKey = JSON.stringify(routes);
      if (needsKey !== needs.dataset.key) {
        needs.dataset.key = needsKey;
        const list = (lines: string[]): string => `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
        needs.innerHTML =
          routes.length === 0
            ? 'Mark the observations that support your explanation. Keep a theory when you can connect the suspected cause to what you observed.'
            : routes.length === 1
              ? `<div class="fnb-hint">Required: tick entries that show each of these.</div>${list(routes[0])}`
              : `<div class="fnb-hint">Required: tick entries that show every item in one of these sets.</div>${routes.map((r, i) => `<div class="fnb-hint">Set ${i + 1}</div>${list(r)}`).join('')}`;
      }
    }

    const cites = this.host_.querySelector<HTMLElement>('[data-fnb="cites"]');
    if (cites)
      cites.textContent = this.cited_.size
        ? `Marked entries: ${all.flatMap((e, i) => (this.cited_.has(e.id) ? [`#${i + 1}`] : [])).join(', ')}`
        : 'No entries marked. Tick the margin beside an observation to cite it.';
    this.syncDraft_();
  }
}
