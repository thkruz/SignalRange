import { vi } from 'vitest';

vi.mock('draggabilly', () => ({
  default: vi.fn(function () {
    return { on: vi.fn() };
  }),
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({
      settings: { workingDocument: { title: 'Rain Fade Log' } },
      data: {
        id: 'nats-scenario14',
        objectives: [{ id: 'quiz-obj', conditions: [{ type: 'status-check', params: { documentLine: 'Fade peaked at 2.1 dB' } }] }],
      },
    }),
  },
}));

import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { WorkingDocumentManager } from '../../src/scenarios/working-document-manager';

/**
 * Phase 27 (nats-r2 s14-F2, s24-F5): the first documentLine used to pop the
 * Working Document open, centred over the console (S24: over the ACU Feed
 * Heater switch). Now the sidebar icon pulses until the player opens it.
 */
describe('WorkingDocumentManager new entries', () => {
  beforeEach(() => {
    EventBus.destroy();
    WorkingDocumentManager.reset();
    document.body.innerHTML = '<div id="root"><div id="app-shell-page"></div><a class="working-doc-icon" data-tooltip="Working Document"></a></div>';
    WorkingDocumentManager.getInstance().initialize();
  });

  afterEach(() => {
    WorkingDocumentManager.reset();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('flags the sidebar icon instead of opening the panel over the console', () => {
    EventBus.getInstance().emit(Events.QUIZ_PASSED, { objectiveId: 'quiz-obj', conditionIndex: 0, attempts: 1, pointsDeducted: 0 });

    expect(document.getElementById('draggable-html-box-working-document')).toBeNull();
    const icon = document.querySelector('.working-doc-icon')!;
    expect(icon.classList.contains('has-new-entry')).toBe(true);
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(1);
  });

  it('opening the document shows the entry and clears the flag', () => {
    EventBus.getInstance().emit(Events.QUIZ_PASSED, { objectiveId: 'quiz-obj', conditionIndex: 0, attempts: 1, pointsDeducted: 0 });

    WorkingDocumentManager.getInstance().open();

    expect(document.getElementById('draggable-html-box-working-document')?.textContent).toContain('Fade peaked at 2.1 dB');
    expect(document.querySelector('.working-doc-icon')!.classList.contains('has-new-entry')).toBe(false);
  });
  it('restoreState brings the lines back and a re-fired quiz writes no duplicate', () => {
    const bus = EventBus.getInstance();
    bus.emit(Events.QUIZ_PASSED, { objectiveId: 'quiz-obj', conditionIndex: 0, attempts: 1, pointsDeducted: 0 });
    const saved = JSON.parse(JSON.stringify(WorkingDocumentManager.getInstance().getState()));
    expect(saved.entries).toHaveLength(1);

    // Reload: fresh manager, then restore, then the objective's quiz re-fires
    WorkingDocumentManager.getInstance().initialize();
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(0);
    WorkingDocumentManager.getInstance().restoreState(saved);
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(1);
    expect(document.querySelector('.working-doc-icon')!.classList.contains('has-new-entry')).toBe(false);

    bus.emit(Events.QUIZ_PASSED, { objectiveId: 'quiz-obj', conditionIndex: 0, attempts: 1, pointsDeducted: 0 });
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(1);
  });

  it('restoreState with no snapshot leaves the document empty', () => {
    WorkingDocumentManager.getInstance().restoreState(undefined);
    expect(WorkingDocumentManager.getInstance().getEntryCount()).toBe(0);
  });
});
