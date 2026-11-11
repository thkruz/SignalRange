/**
 * @file faceplate-kit - Shared physical-control markup for the C6 part close-ups (Phase 44, slice 7)
 * @description One small kit every close-up reuses: engraved label plates, push buttons, a guarded
 * breaker, a rocker/selector for equipment modes and a status lens. Pure markup builders: the caller
 * owns the data attributes, the click handling and the cost text. Every control is a real <button>
 * (or a fieldset of them) so it stays keyboard reachable, labelled and testable; the look comes from
 * faceplate.css. Labels are plain text, engraved by CSS (uppercase, inset shadow), never by the markup.
 */

import { escapeHtml } from './plant-ui-helpers';

/** What the control looks like and how careful it is: observation caps are neutral, fixes amber, hazards guarded */
export type FaceTone = 'observe' | 'fix' | 'hazard' | 'meter' | 'port';

export interface FacePush {
  /** Raw attribute string, already escaped (for example `data-verb="inspect"`) */
  attrs: string;
  label: string;
  /** Cost text shown small under the label (already HTML-escaped / entity-formatted) */
  costHtml?: string;
  tone: FaceTone;
  /** Full-width control (long label or spare count) */
  wide?: boolean;
  disabled?: boolean;
  /** Extra class names (existing hooks such as pp-act) */
  cls?: string;
}

/** An engraved plate: a legend stamped into the panel */
export function fpPlate(text: string, extraClass = ''): string {
  return `<div class="fp-plate${extraClass ? ` ${extraClass}` : ''}">${escapeHtml(text)}</div>`;
}

/**
 * A momentary push button (caps for observe/fix/meter/port) or a guarded breaker lever (hazard).
 * The label stays in the DOM as text, so tests and screen readers read the same words the player sees.
 */
export function fpPush(c: FacePush): string {
  const cls = ['fp-control', c.tone === 'hazard' ? 'fp-breaker' : 'fp-push', `fp-tone-${c.tone}`];
  if (c.cls) cls.push(c.cls);
  if (c.wide) cls.push('fp-wide');
  const mech = c.tone === 'hazard' ? '<span class="fp-lever" aria-hidden="true"><span class="fp-lever-arm"></span></span>' : '<span class="fp-cap" aria-hidden="true"></span>';

  return `<button type="button" class="${cls.join(' ')}" data-fp-control ${c.attrs}${c.disabled ? ' disabled' : ''}>${mech}<span class="fp-engrave">${escapeHtml(c.label)}</span>${c.costHtml ? `<span class="fp-cost">${c.costHtml}</span>` : ''}</button>`;
}

export interface FaceSelectorOption {
  id: string;
  label: string;
  on: boolean;
}

/** A rocker (two positions) or rotary selector (more): the lit position is the current equipment mode */
export function fpSelector(legend: string, options: FaceSelectorOption[], attrName: string): string {
  const kind = options.length === 2 ? 'fp-rocker' : 'fp-rotary';
  const buttons = options
    .map(
      (o) =>
        `<button type="button" class="fp-position${o.on ? ' fp-on' : ''}" ${attrName}="${escapeHtml(o.id)}" aria-pressed="${o.on}"><span class="fp-position-dot" aria-hidden="true"></span><span class="fp-engrave">${escapeHtml(o.label)}</span></button>`
    )
    .join('');

  return `<fieldset class="fp-selector ${kind}"><legend class="fp-plate">${escapeHtml(legend)}</legend><div class="fp-positions">${buttons}</div></fieldset>`;
}
