import { formStepState, handoverConditionId, sampleStepState } from '@app/pages/mission-control/tabs/form-step-state';
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

describe('sampleStepState', () => {
  const sampleStep = (id: string, isActive: boolean, isCompleted: boolean) => ({ isActive, isCompleted, objective: { conditions: [{ id }] } });

  it('reports later only for steps that read samples of that service', () => {
    const id = 'c6:layerObserved:skylink:registration:up:current';
    expect(sampleStepState('skylink', [sampleStep(id, false, false)])).toBe('later');
    expect(sampleStepState('skylink', [sampleStep(id, true, false)])).toBe('active');
    expect(sampleStepState('skylink', [sampleStep(id, false, true)])).toBe('done');
    expect(sampleStepState('local', [sampleStep(id, false, false)])).toBe('none');
  });
});
