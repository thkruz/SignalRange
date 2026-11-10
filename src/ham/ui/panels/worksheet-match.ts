/**
 * @file worksheet-match - Match field of a worksheet, answered with job tags from the bench
 * @description Parts that stand for a bench device show their current tag (or a prompt to click the
 * part on the bench); the rest (symbols, sites, services) keep a dropdown. The value read on submit is
 * the same `{ part: job }` record the old dropdowns produced, so grading is unchanged.
 * Test ids: ham-ws-<id>-<field> (fieldset), ham-ws-<id>-<field>-<part> (the row's tag text or select).
 */

import type { Worksheet, WorksheetField } from '../../ham-station-config';
import type { HamStationManager } from '../../ham-station-manager';
import { jobTags, mapFieldParts } from '../bench/job-tags';
import { h, labelled, select, tid } from '../ui-kit';

export const NOT_TAGGED = 'not tagged yet, click it on the bench';

export function buildMatchField(m: HamStationManager, ws: Worksheet, f: WorksheetField, reads: Map<string, () => string | number | Record<string, string>>): HTMLElement {
  const base = tid('ham-ws', ws.id, f.id);
  const keys = typeof f.answer === 'object' ? Object.keys(f.answer) : [];
  const onBench = mapFieldParts(f, m.devices());
  const selects = new Map<string, HTMLSelectElement>();
  const tagEls = new Map<string, HTMLElement>();
  const wrap = h('fieldset', { class: 'mb-2', 'data-testid': base }, h('legend', { class: 'form-label small', text: f.label }));
  for (const k of keys) {
    if (onBench.has(k)) {
      const val = h('span', { class: 'small', 'data-testid': tid(base, k), 'data-tagged': 'false', text: NOT_TAGGED });
      tagEls.set(k, val);
      wrap.append(h('div', { class: 'mb-1' }, h('span', { class: 'form-label small me-2 fw-bold', text: k }), val));
    } else {
      const s = select(tid(base, k), `${f.label}: ${k}`, [{ value: '', label: 'Choose...' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))], '');
      selects.set(k, s);
      wrap.append(labelled(s.id, k, s, 'mb-1'));
    }
  }
  let seen = false;
  const refresh = (): void => {
    for (const [k, el] of tagEls) {
      const job = jobTags.get(m, ws.id, f.id, k);
      el.textContent = job ?? NOT_TAGGED;
      el.setAttribute('data-tagged', String(Boolean(job)));
    }
    if (wrap.isConnected) seen = true;
    else if (seen) unsubscribe();
  };
  const unsubscribe = tagEls.size > 0 ? jobTags.subscribe(refresh) : (): void => undefined;
  refresh();
  reads.set(f.id, () => Object.fromEntries(keys.map((k) => [k, onBench.has(k) ? (jobTags.get(m, ws.id, f.id, k) ?? '') : (selects.get(k)?.value ?? '')])));

  return wrap;
}
