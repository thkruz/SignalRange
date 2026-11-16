import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showQuiz, closeAll, openReportForm } = vi.hoisted(() => ({ showQuiz: vi.fn(), closeAll: vi.fn(), openReportForm: vi.fn() }));

vi.mock('@app/modal/quiz-manager', () => ({ QuizManager: { getInstance: () => ({ showQuiz }) } }));
vi.mock('@app/modal/hint-manager', () => ({ HintManager: { getInstance: () => ({ getHint: () => null }) } }));
vi.mock('@app/modal/hint-modal', () => ({ HintModal: { getInstance: () => ({}) } }));
vi.mock('@app/objectives', () => ({ ObjectivesManager: { getInstance: () => ({ getObjectiveStates: () => [] }) } }));
vi.mock('@app/objectives/report-form-dialog', () => ({ openReportForm }));
vi.mock('@app/presentation/immersive-view', () => ({ ImmersiveView: { closeAll } }));

import { handleChecklistClick } from '@app/pages/mission-control/checklist-actions';

function clickOn(html: string, selector: string, fromHeldObject: boolean): void {
  document.body.innerHTML = `<div id="sheet">${html}</div>`;
  const target = document.querySelector<HTMLElement>(selector)!;
  handleChecklistClick({ target } as unknown as Event, fromHeldObject);
}

describe('handleChecklistClick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts the held clipboard down before a quiz opens from the cover, and focuses the first answer', () => {
    showQuiz.mockImplementation(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="quiz-options"><button class="quiz-option-btn">A</button></div>');
    });
    clickOn('<button class="condition-quiz-btn" data-objective-id="o1" data-condition-index="2">?</button>', '.condition-quiz-btn', true);
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(showQuiz).toHaveBeenCalledWith('o1', 2);
    expect(closeAll.mock.invocationCallOrder[0]).toBeLessThan(showQuiz.mock.invocationCallOrder[0]);
    expect(document.activeElement?.textContent).toBe('A');
  });

  it('puts the held clipboard down before a report form opens from the cover', () => {
    clickOn('<button class="condition-form-btn" data-report-form="f1">File</button>', '.condition-form-btn', true);
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(openReportForm).toHaveBeenCalledWith('f1');
  });

  it('leaves held objects alone for the sidebar checklist', () => {
    clickOn('<button class="condition-quiz-btn" data-objective-id="o1" data-condition-index="0">?</button>', '.condition-quiz-btn', false);
    expect(closeAll).not.toHaveBeenCalled();
    expect(showQuiz).toHaveBeenCalledWith('o1', 0);
  });
});
