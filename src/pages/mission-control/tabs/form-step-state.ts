/** Where the checklist step that reads a handover form stands */
export type FormStepState = 'active' | 'later' | 'done' | 'none';

interface StepLike {
  isActive: boolean;
  isCompleted: boolean;
  objective: { conditions?: ReadonlyArray<{ id?: string }> };
}

/** Condition id the frontline `handoverValid` factory gives a form */
export const handoverConditionId = (formId: string): string => `c6:handoverValid:${formId}`;

/**
 * Which state the step using `formId` is in: `active` when any is running, `later` when some have
 * not started, `done` when all are finished, `none` when no step reads the form.
 */
export function formStepState(formId: string, steps: readonly StepLike[]): FormStepState {
  const id = handoverConditionId(formId);
  const using = steps.filter((s) => s.objective.conditions?.some((c) => c.id === id));
  if (using.length === 0) return 'none';
  if (using.some((s) => s.isActive)) return 'active';
  if (using.every((s) => s.isCompleted)) return 'done';

  return 'later';
}

/** Shown after a filing when the step that reads the form has not started */
export const FORM_STEP_LATER_NOTE =
  'This form is on file, but the checklist step that uses it has not started. Finish the earlier steps, then check the checklist to see it counted.';
