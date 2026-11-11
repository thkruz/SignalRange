/**
 * @file cards-panel - Reference cards from the station config
 * @description A set of index cards laid on the desk (title, body, optional image with alt text). Each card's
 * title is a button that folds the card's face open or shut; the first card lies open, so picking up the cards
 * shows a card to read rather than a row of closed titles.
 * Test ids: ham-card-<id>, ham-card-<id>-toggle, ham-card-<id>-body.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, h, tid } from '../ui-kit';
import { sheet } from './paper';

export class CardsPanel implements StationPanel {
  readonly id = 'cards';
  readonly title = 'Reference cards';
  private root_: HTMLElement | null = null;

  isRelevant(m: HamStationManager): boolean {
    return m.config.cards.length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    const c = sheet('ham-cards-card', this.title);
    c.root.classList.add('hl-cards');
    this.root_ = c.root;
    const deck = h('div', { class: 'hl-deck' });
    for (const [index, ref] of ctx.manager.config.cards.entries()) {
      const body = h(
        'div',
        { class: 'hl-card-face', hidden: index > 0, 'data-testid': tid('ham-card', ref.id, 'body') },
        h('p', { style: 'white-space: pre-line', text: ref.body })
      );
      if (ref.imageUrl) body.append(h('img', { src: ref.imageUrl, alt: `Illustration for ${ref.title}`, class: 'hl-figure' }));
      const toggle = button(
        tid('ham-card', ref.id, 'toggle'),
        ref.title,
        () => {
          body.hidden = !body.hidden;
          toggle.setAttribute('aria-expanded', String(!body.hidden));
          cardEl.classList.toggle('is-open', !body.hidden);
        },
        'hl-card-title',
        ref.title
      );
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      const cardEl = h('div', { class: `hl-card${index === 0 ? ' is-open' : ''}`, 'data-testid': tid('ham-card', ref.id) }, toggle, body);
      deck.append(cardEl);
    }
    c.body.append(deck);
    host.append(c.root);
  }

  update(): void {}

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
  }
}
