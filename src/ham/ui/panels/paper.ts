/**
 * @file paper - Paper-and-pencil DOM helpers for the logbook and the reference cards
 * @description The logbook pages (worksheets, station log, front page, conversations) and the reference cards are
 * paper held fullscreen, not web cards. These helpers build the pieces they share: a titled sheet, a pencil
 * note, a rubber stamp and ruled-page controls. Pure DOM; styles live in logbook.css.
 */

import { h } from '../ui-kit';
import './logbook.css';

/** A titled sheet of the book. `testId` goes on the root, as `card()` did before. */
export function sheet(testId: string, title: string): { root: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: 'hl-sheet-body' });
  const root = h('section', { class: 'hl-sheet', 'data-testid': testId, id: testId, 'aria-label': title }, h('h2', { class: 'hl-sheet-title', text: title }), body);

  return { root, body };
}

/** A round-cornered rubber stamp: a status mark on the page */
export const stamp = (text: string, kind: 'plain' | 'good' | 'warn' | 'open' = 'plain'): HTMLElement => h('span', { class: `hl-stamp is-${kind}`, text });

/** Pencil written on the page (feedback, empty states). `role=status` so it is announced. */
export const pencil = (testId: string | undefined, kind: 'note' | 'good' | 'warn' = 'note'): HTMLElement =>
  h('div', { class: `hl-pencil is-${kind}`, role: 'status', ...(testId ? { 'data-testid': testId } : {}) });

/** A ruled empty-page line, so a page with nothing on it still reads as a page */
export const emptyLine = (text: string): HTMLElement => h('p', { class: 'hl-empty', text });

/** `labelled()` with the label and wrapper in paper classes */
export function field(wrap: HTMLElement): HTMLElement {
  wrap.className = 'hl-field';
  const label = wrap.querySelector('label');
  if (label) label.className = 'hl-label';

  return wrap;
}
