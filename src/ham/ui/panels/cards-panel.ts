/**
 * @file cards-panel - Reference cards from the station config
 * @description Collapsible cards (title, body, optional image with alt text).
 * Test ids: ham-card-<id>, ham-card-<id>-toggle.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, card, h, tid } from '../ui-kit';

export class CardsPanel implements StationPanel {
  readonly id = 'cards';
  readonly title = 'Reference cards';
  private root_: HTMLElement | null = null;

  isRelevant(m: HamStationManager): boolean {
    return m.config.cards.length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    const c = card('ham-cards-card', this.title);
    this.root_ = c.root;
    for (const ref of ctx.manager.config.cards) {
      const body = h(
        'div',
        { class: 'small', hidden: true, 'data-testid': tid('ham-card', ref.id, 'body') },
        h('p', { class: 'mb-1', style: 'white-space: pre-line', text: ref.body })
      );
      if (ref.imageUrl) body.append(h('img', { src: ref.imageUrl, alt: `Illustration for ${ref.title}`, class: 'img-fluid' }));
      const toggle = button(
        tid('ham-card', ref.id, 'toggle'),
        ref.title,
        () => {
          body.hidden = !body.hidden;
          toggle.setAttribute('aria-expanded', String(!body.hidden));
        },
        'btn btn-sm btn-outline-secondary w-100 text-start mb-1',
        ref.title
      );
      toggle.setAttribute('aria-expanded', 'false');
      c.body.append(h('div', { 'data-testid': tid('ham-card', ref.id) }, toggle, body));
    }
    host.append(c.root);
  }

  update(): void {}

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }
}
