/**
 * @file job-tag-section - "Job on the bench" block of the Close-up
 * @description For the selected device, one row per open match-worksheet part it stands for, with one
 * button per job. The pick is stored in `jobTags`; the worksheet reads it on submit.
 * Test ids: ham-tag-<worksheetId>-<fieldId>-<part slug>-<option index>.
 */

import type { HamStationManager } from '../../ham-station-manager';
import { button, h } from '../ui-kit';
import { jobTags, tagTargets, tagTestId } from './job-tags';

/** Null when nothing on this device is waiting for a job tag */
export function buildJobTagSection(m: HamStationManager, deviceId: string, onChange: () => void): HTMLElement | null {
  const mine = tagTargets(m, true).filter((t) => t.deviceId === deviceId);
  if (mine.length === 0) return null;
  const sec = h('div', { class: 'ham-closeup-jobtags mb-2', 'data-testid': 'ham-closeup-jobtags' }, h('div', { class: 'small fw-bold', text: 'Job on the bench' }));
  for (const t of mine) {
    const chosen = jobTags.get(m, t.worksheetId, t.fieldId, t.part);
    const row = h('div', { class: 'mb-1', role: 'group', 'aria-label': `${t.part}: ${t.fieldLabel}` });
    row.append(h('div', { class: 'small text-secondary', text: `${t.fieldLabel}: what does the ${t.part} do?` }));
    t.options.forEach((job, i) => {
      const on = chosen === job;
      const b = button(
        tagTestId(t.worksheetId, t.fieldId, t.part, i),
        job,
        () => {
          jobTags.set(m, t.worksheetId, t.fieldId, t.part, job);
          onChange();
        },
        `btn btn-sm me-1 mb-1 ${on ? 'btn-primary' : 'btn-outline-secondary'}`,
        `${t.part}: ${job}`
      );
      b.setAttribute('aria-pressed', String(on));
      row.append(b);
    });
    sec.append(row);
  }

  return sec;
}
