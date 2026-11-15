import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateChecklistWithMotion } from '../../src/presentation/transitions';

const row = (id: string, state: string): string => `<li class="objective-item ${state}" data-objective-id="${id}"><div class="objective-header">${id}</div></li>`;
const list = (...rows: string[]): string => `<ul>${rows.join('')}</ul>`;

describe('checklist reveals the newly active objective', () => {
  let scrolled: string[];
  beforeEach(() => {
    scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolled.push(this.dataset.objectiveId ?? '');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('scrolls the next active row into view when the active objective changes', () => {
    const box = document.createElement('div');
    updateChecklistWithMotion(box, list(row('a', 'active'), row('b', 'locked'), row('c', 'locked')));
    scrolled.length = 0;
    updateChecklistWithMotion(box, list(row('a', 'completed'), row('b', 'active'), row('c', 'locked')));
    expect(scrolled).toEqual(['b']);
  });

  it('leaves the scroll position alone on a refresh that changes nothing', () => {
    const box = document.createElement('div');
    updateChecklistWithMotion(box, list(row('a', 'active'), row('b', 'locked')));
    scrolled.length = 0;
    updateChecklistWithMotion(box, list(row('a', 'active'), row('b', 'locked')));
    expect(scrolled).toEqual([]);
  });
});
