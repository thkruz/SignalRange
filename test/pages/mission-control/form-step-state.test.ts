import { formStepState, handoverConditionId } from '@app/pages/mission-control/tabs/form-step-state';
import { describe, expect, it } from 'vitest';

const step = (formId: string, isActive: boolean, isCompleted: boolean) => ({ isActive, isCompleted, objective: { conditions: [{ id: handoverConditionId(formId) }] } });

describe('formStepState', () => {
  it('reports none, later, active and done for the step that reads a form', () => {
    expect(formStepState('baseline', [step('other', true, false)])).toBe('none');
    expect(formStepState('baseline', [step('baseline', false, false)])).toBe('later');
    expect(formStepState('baseline', [step('baseline', true, false)])).toBe('active');
    expect(formStepState('baseline', [step('baseline', false, true)])).toBe('done');
  });
});
