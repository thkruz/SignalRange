/**
 * @file log-panel - Station log: receptions, measurements, contacts and notes
 * @description Read-only views of what the station has logged, plus a note box (`log.note`).
 * Measurements carry a current/stale badge (stale = taken under an earlier configuration).
 * Test ids: ham-log-tab-<receptions|measurements|contacts|notes>, ham-log-<...>-list,
 * ham-log-note-input, ham-log-note-add.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, emitterLabel, fmt, h, Rebuilder, textInput, tid, transcriptList } from '../ui-kit';
import { emptyLine, sheet, stamp } from './paper';

type TabId = 'receptions' | 'measurements' | 'contacts' | 'notes';
const TABS: { id: TabId; label: string }[] = [
  { id: 'receptions', label: 'Receptions' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'notes', label: 'Events & notes' },
];

export class LogPanel implements StationPanel {
  readonly id = 'log';
  readonly title = 'Station log';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private readonly lists_: Record<TabId, HTMLElement> = {} as Record<TabId, HTMLElement>;
  private readonly tabBtns_: Record<TabId, HTMLElement> = {} as Record<TabId, HTMLElement>;
  private readonly rebuilders_: Record<TabId, Rebuilder> = { receptions: new Rebuilder(), measurements: new Rebuilder(), contacts: new Rebuilder(), notes: new Rebuilder() };
  private transcriptHost_!: HTMLElement;

  isRelevant(): boolean {
    return true;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = sheet('ham-log-card', this.title);
    this.root_ = c.root;
    const nav = h('ul', { class: 'hl-tabs', role: 'tablist', 'aria-label': 'Log sections' });
    for (const t of TABS) {
      const b = button(tid('ham-log-tab', t.id), t.label, () => this.show_(t.id), 'hl-tab');
      b.setAttribute('role', 'tab');
      this.tabBtns_[t.id] = b;
      nav.append(h('li', { role: 'presentation' }, b));
      this.lists_[t.id] = h('div', { 'data-testid': tid('ham-log', t.id, 'list'), role: 'tabpanel', 'aria-label': t.label });
    }
    this.transcriptHost_ = h('div', { class: 'hl-transcripts', 'data-testid': 'ham-log-transcripts' });
    this.lists_.receptions.append(this.transcriptHost_, h('div', { 'data-testid': 'ham-log-reception-rows' }));
    const note = textInput('ham-log-note-input', 'Log note', '');
    note.className = 'hl-input';
    note.placeholder = 'Write a note';
    const add = button(
      'ham-log-note-add',
      'Add note',
      () => {
        if (note.value.trim() === '') return;
        this.ctx_.act({ type: 'log.note', text: note.value.trim() });
        note.value = '';
      },
      'hl-btn'
    );
    this.lists_.notes.append(h('div', { class: 'hl-note-row' }, note, add), h('div', { 'data-testid': 'ham-log-note-rows' }));
    c.body.append(nav, ...TABS.map((t) => this.lists_[t.id]));
    host.append(c.root);
    this.show_('receptions');
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    transcriptList(m, this.transcriptHost_);
    this.rebuilders_.receptions.run(this.lists_.receptions.lastElementChild as HTMLElement, `${m.stateVersion}`, () => this.receptions_(m));
    this.rebuilders_.measurements.run(this.lists_.measurements, `${m.stateVersion}|${m.revision}`, () => this.measurements_(m));
    this.rebuilders_.contacts.run(this.lists_.contacts, `${m.stateVersion}`, () => this.contacts_(m));
    this.rebuilders_.notes.run(this.lists_.notes.lastElementChild as HTMLElement, `${m.notes().length}|${m.qsoNotes().length}|${this.ctx_.journal.length}`, () => this.notes_(m));
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }

  private show_(t: TabId): void {
    for (const x of TABS) {
      this.lists_[x.id].hidden = x.id !== t;
      this.tabBtns_[x.id].classList.toggle('active', x.id === t);
      this.tabBtns_[x.id].setAttribute('aria-selected', String(x.id === t));
    }
  }

  private empty_(host: HTMLElement, text: string): void {
    host.append(emptyLine(text));
  }

  private receptions_(m: HamStationManager): void {
    const host = this.lists_.receptions.lastElementChild as HTMLElement;
    const ids = new Set<string>([...Object.keys(m.transcripts()), ...m.config.emitters.map((e) => e.id), ...(m.config.remoteStations?.stations.map((s) => s.id) ?? [])]);
    const rows = [...ids]
      .flatMap((id) => m.getReception(id).map((r) => ({ id, r })))
      .sort((a, b) => b.r.seq - a.r.seq)
      .slice(0, 30);
    if (rows.length === 0) return this.empty_(host, 'No receptions logged yet.');
    const table = h('table', { class: 'hl-ledger' }, h('thead', {}, h('tr', {}, ...['Time', 'Source', 'Readable', 'SNR', 'Impairments'].map((t) => h('th', { text: t })))));
    const tb = h('tbody');
    for (const { id, r } of rows) {
      tb.append(
        h(
          'tr',
          { 'data-testid': tid('ham-log-reception', r.seq) },
          ...[`${fmt(r.tS, 0)} s`, emitterLabel(m, id), `${Math.round(r.intelligibility * 100)}%`, `${fmt(r.snrDb, 1)} dB`, r.impairments.join(', ') || '-'].map((t) =>
            h('td', { text: t })
          )
        )
      );
    }
    table.append(tb);
    host.append(table);
  }

  private measurements_(m: HamStationManager): void {
    const host = this.lists_.measurements;
    const rows = m.measurements().slice(-40).reverse();
    if (rows.length === 0) return this.empty_(host, 'No measurements yet. Use the meters.');
    const table = h(
      'table',
      { class: 'hl-ledger' },
      h('thead', {}, h('tr', {}, ...['Instrument', 'Quantity', 'Value', 'Placement', 'Load', 'Status'].map((t) => h('th', { text: t }))))
    );
    const tb = h('tbody');
    for (const x of rows) {
      const cur = m.isCurrent(x);
      tb.append(
        h(
          'tr',
          { 'data-testid': tid('ham-log-measurement', x.id) },
          h('td', { text: x.instrument }),
          h('td', { text: x.quantity }),
          h('td', { text: `${fmt(x.value, 3)} ${x.unit}` }),
          h('td', {
            text:
              Object.entries(x.placement)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ') || '-',
          }),
          h('td', { text: x.underLoad ? 'under load' : 'no load' }),
          h('td', {}, stamp(cur ? 'current' : 'stale', cur ? 'good' : 'warn'))
        )
      );
    }
    table.append(tb);
    host.append(table);
  }

  private contacts_(m: HamStationManager): void {
    const host = this.lists_.contacts;
    const rows = m.contacts();
    if (rows.length === 0) return this.empty_(host, 'No contacts yet.');
    for (const c of rows) {
      host.append(
        h(
          'div',
          { class: 'hl-entry', 'data-testid': tid('ham-log-contact', c.id) },
          h('strong', { text: `${c.remoteCallsign} ` }),
          stamp(c.path),
          stamp(c.closed ? 'complete' : 'open', c.closed ? 'good' : 'open'),
          stamp(c.identified ? 'identified' : 'not identified', c.identified ? 'good' : 'warn'),
          h('div', { text: `${c.freqMHz.toFixed(4)} MHz ${c.mode}. Exchanged: ${c.exchanged.join(', ') || 'nothing yet'}. Heard them: ${c.playerHeardRemote ? 'yes' : 'no'}.` })
        )
      );
    }
  }

  private notes_(m: HamStationManager): void {
    const host = this.lists_.notes.lastElementChild as HTMLElement;
    // What the bench strip said (refusals, results) stays readable here after the toast has gone, newest first
    const said = [...this.ctx_.journal].reverse().map((j) => ({ tS: j.tS, text: j.text }));
    const all = [
      ...said,
      ...m.notes().map((n) => ({ tS: n.tS, text: n.text })),
      ...m.qsoNotes().map((n: { tS?: number; text?: string }) => ({ tS: n.tS ?? 0, text: n.text ?? String(n) })),
    ];
    if (all.length === 0) return this.empty_(host, 'No notes yet.');
    for (const n of all.sort((a, b) => b.tS - a.tS)) host.append(h('div', { class: 'hl-entry', text: `[${fmt(n.tS, 0)} s] ${n.text}` }));
  }
}
