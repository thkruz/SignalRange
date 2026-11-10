/**
 * @file hint-panel - "Ask Riley" hint button per active objective
 * @description Lists the active, unfinished objectives; each button sends `hint` and shows
 * `config.hints[objectiveId]` (or the manager's generic reply) inline.
 * Test ids: ham-hint-<objectiveId>-ask, ham-hint-<objectiveId>-text.
 */

import { ObjectivesManager } from '@app/objectives/objectives-manager';
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, card, h, Rebuilder, tid } from '../ui-kit';

export class HintPanel implements StationPanel {
  readonly id = 'hints';
  readonly title = 'Ask Riley';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private body_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private readonly shown_ = new Map<string, string>();

  private static active_(): { id: string; title: string }[] {
    if (!ObjectivesManager.hasInstance()) return [];

    return ObjectivesManager.getInstance()
      .getObjectiveStates()
      .filter((s) => s.isActive && !s.isCompleted && !s.isFailed)
      .map((s) => ({ id: s.objective.id, title: s.objective.title }));
  }

  isRelevant(): boolean {
    return HintPanel.active_().length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = card('ham-hint-card', this.title);
    this.root_ = c.root;
    this.body_ = h('div');
    c.body.append(this.body_);
    host.append(c.root);
    this.update();
  }

  update(): void {
    const active = HintPanel.active_();
    this.rebuild_.run(this.body_, JSON.stringify([active, [...this.shown_]]), () => {
      for (const o of active) {
        const text = this.shown_.get(o.id);
        this.body_.append(
          h(
            'div',
            { class: 'mb-2' },
            h('div', { class: 'small', text: o.title }),
            button(tid('ham-hint', o.id, 'ask'), 'Ask Riley', () => this.ask_(o.id), 'btn btn-sm btn-outline-info', `Ask Riley for a hint on ${o.title}`),
            text ? h('div', { class: 'alert alert-info py-1 small mt-1', role: 'status', 'data-testid': tid('ham-hint', o.id, 'text'), text }) : null
          )
        );
      }
    });
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.shown_.clear();
  }

  private ask_(objectiveId: string): void {
    const r = this.ctx_.act({ type: 'hint', objectiveId });
    const text = (this.ctx_.manager as HamStationManager).config.hints?.[objectiveId] ?? r.message;
    this.shown_.set(objectiveId, text);
    this.update();
  }
}
