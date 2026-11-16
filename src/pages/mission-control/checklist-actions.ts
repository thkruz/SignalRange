import { HintManager } from '@app/modal/hint-manager';
import { HintModal } from '@app/modal/hint-modal';
import { QuizManager } from '@app/modal/quiz-manager';
import { ObjectivesManager } from '@app/objectives';
import { openReportForm } from '@app/objectives/report-form-dialog';
import { ImmersiveView } from '@app/presentation/immersive-view';

/**
 * Click handling for the buttons inside the generated objectives checklist (report form, status-check quiz, hint).
 * Shared by the checklist window and the clipboard cover sheet, so both open the same quiz and hint dialogs.
 */
export function handleChecklistClick(e: Event, fromHeldObject = false): void {
  const target = e.target as HTMLElement;
  // A window opened from a held object (the clipboard cover) would sit behind its top-layer dialog: put the object down first
  const putDown = (): void => {
    if (fromHeldObject) ImmersiveView.closeAll();
  };

  const formBtn = target.closest<HTMLButtonElement>('.condition-form-btn');
  if (formBtn?.dataset.reportForm) {
    putDown();
    openReportForm(formBtn.dataset.reportForm);

    return;
  }

  const quizBtn = target.closest<HTMLButtonElement>('.condition-quiz-btn');
  if (quizBtn) {
    const objectiveId = quizBtn.dataset.objectiveId;
    const conditionIndex = parseInt(quizBtn.dataset.conditionIndex ?? '0', 10);
    if (objectiveId) {
      putDown();
      QuizManager.getInstance().showQuiz(objectiveId, conditionIndex);
      // The window renders synchronously on the show event; its first answer takes focus
      if (fromHeldObject) document.querySelector<HTMLButtonElement>('#quiz-options .quiz-option-btn:not(:disabled)')?.focus({ preventScroll: true });
    }

    return;
  }

  const hintBtn = target.closest<HTMLButtonElement>('.condition-hint-btn');
  if (!hintBtn) return;
  const objectiveId = hintBtn.dataset.objectiveId;
  const conditionIndex = parseInt(hintBtn.dataset.conditionIndex ?? '0', 10);
  if (!objectiveId) return;
  const hintManager = HintManager.getInstance();
  const hint = hintManager.getHint(objectiveId, conditionIndex);
  if (!hint) return;
  putDown();
  if (hintBtn.dataset.hintUsed === 'true') {
    // Hint already revealed: show directly without confirmation
    HintModal.getInstance().showHintDirectly(objectiveId, conditionIndex, hint);

    return;
  }
  const penaltyPoints = hintManager.getPenaltyPoints(objectiveId);
  const objectiveTitle =
    ObjectivesManager.getInstance()
      .getObjectiveStates()
      .find((s) => s.objective.id === objectiveId)?.objective.title ?? 'Unknown';
  HintModal.getInstance().showConfirmation(objectiveId, conditionIndex, hint, penaltyPoints, objectiveTitle);
}
