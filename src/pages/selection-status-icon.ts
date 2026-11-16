import { selectionText } from './selection-browser';

/** Shared vector status marks; accessible names do not consume another row. */
export function selectionStatusIcon(state: 'completed' | 'locked' | 'checkpoint', label?: string): string {
  const name = label ?? { completed: 'Completed', locked: 'Locked', checkpoint: 'Checkpoint available' }[state];
  const shape = {
    completed: '<path d="m8 12 3 3 5-6" />',
    locked: '<rect x="8" y="10" width="8" height="7" rx="1" /><path d="M9.5 10V8a2.5 2.5 0 0 1 5 0v2" />',
    checkpoint: '<path d="M9 7v10m6-10v10" />',
  }[state];
  return `<span class="selection-status-icon selection-status-${state} ${state}-banner" role="img" aria-label="${selectionText(name)}" title="${selectionText(name)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" />${shape}</svg><span class="visually-hidden">${selectionText(name)}</span></span>`;
}
