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

const SAMPLE_CONDITIONS = ['layerObserved', 'samplesCurrent', 'sampleAfterEvent', 'interruptionPattern', 'recoveryObserved'];

/**
 * Which state the steps that read samples of `serviceId` are in: `later` only when some have not
 * started and none is running, so a note is shown only when the sample cannot count yet.
 */
export function sampleStepState(serviceId: string, steps: readonly StepLike[]): FormStepState {
  const reads = (id: string | undefined): boolean => {
    const parts = (id ?? '').split(':');

    return parts[0] === 'c6' && SAMPLE_CONDITIONS.includes(parts[1] ?? '') && parts[2] === serviceId;
  };
  const using = steps.filter((s) => s.objective.conditions?.some((c) => reads(c.id)));
  if (using.length === 0) return 'none';
  if (using.some((s) => s.isActive)) return 'active';
  if (using.every((s) => s.isCompleted)) return 'done';

  return 'later';
}

/** Shown after a sample when the step that reads it has not started */
export const SAMPLE_STEP_LATER_NOTE = 'Noted, but the checklist step that uses this reading has not started. Check again once it is active.';
