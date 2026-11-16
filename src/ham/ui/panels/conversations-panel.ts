/**
 * @file conversations-panel - The logbook's conversations page: everything said on the radio so far
 * @description What the dialog history window listed, written out as log lines: time, who spoke, the title and the
 * words themselves, with a "Replay" mark that plays the clip again. The words are on the page, so the page is
 * readable even while a replay is playing under the held book.
 * Test ids: ham-conv-card (sheet), ham-conv-<index>, ham-conv-<index>-replay.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { CharacterNames } from '@app/modal/character-enum';
import { DialogHistoryManager } from '@app/modal/dialog-history-manager';
import { missionItemBridge } from '@app/pages/mission-control/tabs/field-kit';
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, h, Rebuilder, tid } from '../ui-kit';
import { emptyLine, sheet } from './paper';
import { htmlToParagraphs } from './plain-text';

/** Dialog text carries a little markup (p, br, entities); the paper shows it as plain lines. */
const plain = (text: string): string => htmlToParagraphs(text).join('\n');

export class ConversationsPanel implements StationPanel {
  readonly id = 'conversations';
  readonly title = 'Conversations';
  private ctx_: PanelContext | null = null;
  private root_: HTMLElement | null = null;
  private list_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private readonly bound_: () => void = () => this.render_();

  isRelevant(_m: HamStationManager): boolean {
    return missionItemBridge.available('dialog-history');
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = sheet('ham-conv-card', this.title);
    this.root_ = c.root;
    this.list_ = h('div', { class: 'hl-conversations', 'data-testid': 'ham-conv-list' });
    c.body.append(this.list_);
    host.append(c.root);
    EventBus.getInstance().on(Events.DIALOG_HISTORY_CHANGED, this.bound_);
    this.render_();
  }

  update(): void {
    this.render_();
  }

  dispose(): void {
    EventBus.getInstance().off(Events.DIALOG_HISTORY_CHANGED, this.bound_);
    this.root_?.remove();
    this.root_ = null;
  }

  /** The replay plays on the bench: the book goes down first, so the clip is seen and heard and typing is not swallowed by it */
  private replay_(entry: Parameters<DialogHistoryManager['replayDialog']>[0]): void {
    this.ctx_?.putDown?.();
    DialogHistoryManager.getInstance().replayDialog(entry);
  }

  private render_(): void {
    if (!this.root_) return;
    const history = DialogHistoryManager.getInstance().getHistory();
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && this.list_.contains(active) ? active.id : '';
    const rebuilt = this.rebuild_.run(this.list_, JSON.stringify(history.map((e) => [e.timestamp, e.title])), () => {
      if (history.length === 0) {
        this.list_.append(emptyLine('Nothing said on the radio yet.'));

        return;
      }
      history.forEach((entry, index) => {
        // Station clock time of day (UTC), as the HUD writes it
        const time = new Date(entry.timestamp).toISOString().slice(11, 19);
        this.list_.append(
          h(
            'article',
            { class: 'hl-entry hl-said', 'data-testid': tid('ham-conv', index) },
            h('div', { class: 'hl-said-head' }, h('span', { class: 'hl-time', text: time }), h('strong', { text: `${CharacterNames[entry.character]}: ` }), entry.title),
            h('p', { class: 'hl-said-text', text: plain(entry.text) }),
            button(tid('ham-conv', index, 'replay'), 'Replay', () => this.replay_(entry), 'hl-btn', `Replay ${entry.title}`)
          )
        );
      });
    });
    if (rebuilt && focused) this.list_.querySelector<HTMLElement>(`#${CSS.escape(focused)}`)?.focus();
  }
}
