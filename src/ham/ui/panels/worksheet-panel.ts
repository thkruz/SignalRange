/**
 * @file worksheet-panel - Configured worksheets (choice, number and match fields)
 * @description One section per `config.worksheets` entry. Submit sends `worksheet.answer`;
 * the manager's feedback or explanation is shown inline, and a correct answer locks a badge.
 * Test ids: ham-ws-<id>-<field>, ham-ws-<id>-<field>-<key> (match rows), ham-ws-<id>-submit,
 * ham-ws-<id>-feedback.
 */

import type { Worksheet, WorksheetField } from '../../ham-station-config';
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, button, card, h, labelled, select, textInput, tid } from '../ui-kit';
import { buildMatchField } from './worksheet-match';

type Answer = string | number | Record<string, string>;

export class WorksheetPanel implements StationPanel {
  readonly id = 'worksheets';
  readonly title = 'Worksheets';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private readonly status_ = new Map<string, HTMLElement>();

  isRelevant(m: HamStationManager): boolean {
    return m.config.worksheets.length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = card('ham-ws-card', this.title);
    this.root_ = c.root;
    for (const ws of ctx.manager.config.worksheets) c.body.append(this.section_(ws));
    host.append(c.root);
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    for (const [id, el] of this.status_) {
      const rec = m.worksheet(id);
      el.replaceChildren(badge(rec?.correct ? 'correct' : `${rec?.attempts ?? 0} attempts`, rec?.correct ? 'success' : 'secondary'));
    }
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.status_.clear();
  }

  private section_(ws: Worksheet): HTMLElement {
    const reads = new Map<string, () => Answer>();
    const sec = h('div', { class: 'mb-3 border-bottom pb-2', 'data-testid': tid('ham-ws', ws.id) });
    const status = h('span', { 'data-testid': tid('ham-ws', ws.id, 'status') });
    this.status_.set(ws.id, status);
    sec.append(h('h5', {}, ws.title, ' ', status), h('p', { class: 'small', text: ws.prompt }));
    if (ws.figureUrl) sec.append(h('img', { src: ws.figureUrl, alt: `Figure for ${ws.title}`, class: 'img-fluid mb-2', 'data-testid': tid('ham-ws', ws.id, 'figure') }));
    for (const f of ws.fields) sec.append(this.field_(ws, f, reads));
    const feedback = h('div', { class: 'alert alert-info py-1 small mt-2', role: 'status', 'data-testid': tid('ham-ws', ws.id, 'feedback'), hidden: true });
    const submit = button(
      tid('ham-ws', ws.id, 'submit'),
      'Submit',
      () => {
        const values: Record<string, Answer> = {};
        for (const [k, read] of reads) values[k] = read();
        const r = this.ctx_.act({ type: 'worksheet.answer', id: ws.id, values });
        const correct = r.ok && r.data?.correct === true;
        feedback.hidden = false;
        feedback.className = `alert alert-${correct ? 'success' : 'warning'} py-1 small mt-2`;
        feedback.textContent = (correct ? 'Correct. ' : '') + r.message;
      },
      'btn btn-sm btn-primary',
      `Submit ${ws.title}`
    );
    sec.append(submit, feedback);

    return sec;
  }

  private field_(ws: Worksheet, f: WorksheetField, reads: Map<string, () => Answer>): HTMLElement {
    const base = tid('ham-ws', ws.id, f.id);
    if (f.kind === 'number') {
      const i = textInput(base, f.label, '', 'number');
      i.setAttribute('step', 'any');
      reads.set(f.id, () => Number(i.value));

      return labelled(base, f.label, i);
    }
    if (f.kind === 'choice') {
      const s = select(base, f.label, [{ value: '', label: 'Choose...' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))], '');
      reads.set(f.id, () => s.value);

      return labelled(base, f.label, s);
    }
    return buildMatchField(this.ctx_.manager, ws, f, reads);
  }
}
