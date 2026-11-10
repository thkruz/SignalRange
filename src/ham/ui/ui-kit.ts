/**
 * @file ui-kit - Tiny DOM helpers shared by the Campaign 3 Station tab panels
 * @description Builds Tabler-styled elements without innerHTML string soup, and defines the
 * stable `data-testid` / id scheme (`ham-<panel>-<device>-<control>`). Pure DOM, no state.
 */

import type { HamStationManager } from '../ham-station-manager';

type Child = Node | string | null | undefined | false;

// The engine's jQuery-style global augmentation of HTMLElement makes HTMLDivElement unassignable to HTMLElement, so div returns the base type.
export function h(tag: 'div', attrs?: Record<string, string | number | boolean | undefined>, ...kids: Child[]): HTMLElement;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | number | boolean | undefined>, ...kids: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, attrs: Record<string, string | number | boolean | undefined> = {}, ...kids: Child[]): HTMLElement {
  const e = document.createElement(tag) as HTMLElement;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k) e.append(k);

  return e;
}

/** Stable id + data-testid for an actionable element */
export const tid = (...parts: (string | number)[]): string => parts.map((p) => String(p).replace(/[^a-zA-Z0-9_-]+/gu, '-')).join('-');

export function button(testId: string, label: string, onClick: () => void, cls = 'btn btn-sm btn-outline-primary', ariaLabel?: string): HTMLButtonElement {
  const b = h('button', { type: 'button', id: testId, 'data-testid': testId, class: cls, 'aria-label': ariaLabel ?? label, text: label });
  b.addEventListener('click', onClick);

  return b;
}

export function labelled(testId: string, label: string, control: HTMLElement, cls = 'mb-2'): HTMLElement {
  control.id = testId;
  control.setAttribute('data-testid', testId);
  const l = h('label', { class: 'form-label small mb-1', for: testId, text: label });

  return h('div', { class: cls }, l, control);
}

export function textInput(testId: string, label: string, value: string, type = 'text'): HTMLInputElement {
  const i = h('input', { type, class: 'form-control form-control-sm', value, 'aria-label': label });
  i.id = testId;
  i.setAttribute('data-testid', testId);

  return i;
}

export function select(testId: string, label: string, options: { value: string; label: string }[], value: string): HTMLSelectElement {
  const s = h('select', { class: 'form-select form-select-sm', 'aria-label': label });
  for (const o of options) s.append(h('option', { value: o.value, text: o.label }));
  s.value = value;
  s.id = testId;
  s.setAttribute('data-testid', testId);

  return s;
}

export function card(testId: string, title: string): { root: HTMLElement; body: HTMLElement; header: HTMLElement } {
  const header = h('div', { class: 'card-header py-2' }, h('h4', { class: 'card-title mb-0', text: title }));
  const body = h('div', { class: 'card-body py-2' });
  const root = h('div', { class: 'card h-100', 'data-testid': testId, id: testId }, header, body);

  return { root, body, header };
}

export const badge = (text: string, kind: 'secondary' | 'success' | 'warning' | 'danger' | 'info' = 'secondary'): HTMLElement =>
  h('span', { class: `badge bg-${kind}-lt me-1`, text });

/** True when the user is typing in this element (skip overwriting it during a sync) */
export const isFocused = (e: HTMLElement | null): boolean => !!e && document.activeElement === e;

export const fmt = (v: number, digits = 3): string => (Number.isFinite(v) ? v.toFixed(digits) : '-');

/** Signature-keyed rebuild: re-runs `build` only when `sig` changed and no field inside is being edited */
export class Rebuilder {
  private sig_ = '';

  run(host: HTMLElement, sig: string, build: () => void): boolean {
    if (sig === this.sig_) return false;
    const a = document.activeElement;
    if (a && host.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/u.test(a.tagName)) return false;
    host.replaceChildren();
    build();
    this.sig_ = sig;

    return true;
  }
}

/** Cables and adapters span locations, so the player can handle them anywhere */
export const PORTABLE_KINDS: readonly string[] = ['coax', 'adapter', 'dc-lead'];
export const PASSIVE_KINDS: readonly string[] = ['antenna', 'coax', 'adapter', 'dc-lead', 'dummy-load', 'cal-load', 'headphones', 'duplexer'];
export const RADIO_KINDS: readonly string[] = ['handheld', 'mobile', 'dmr-handheld', 'hf-rig'];

/** Label for an emitter / remote station id */
export function emitterLabel(m: HamStationManager, id: string): string {
  const e = m.config.emitters.find((x) => x.id === id);
  if (e) return e.label;
  const r = m.config.remoteStations?.stations.find((x) => x.id === id);

  return r ? `${r.callsign} (${r.name})` : id;
}

/** Fill `host` with the revealed transcripts and how intelligible each was (rebuilt only on change) */
export function transcriptList(m: HamStationManager, host: HTMLElement): void {
  const entries = Object.entries(m.transcripts());
  const sig = JSON.stringify(entries);
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.replaceChildren();
  if (entries.length === 0) {
    host.append(h('div', { class: 'text-secondary small', text: 'Nothing heard yet.' }));

    return;
  }
  for (const [id, t] of entries) {
    host.append(
      h(
        'div',
        { class: 'small mb-1', 'data-testid': tid('ham-rx', id) },
        h('strong', { text: `${emitterLabel(m, id)} ` }),
        badge(`${Math.round(t.intelligibility * 100)}% readable`, t.intelligibility >= 0.6 ? 'success' : 'warning'),
        h('div', { class: 'font-monospace', text: t.text })
      )
    );
  }
}
