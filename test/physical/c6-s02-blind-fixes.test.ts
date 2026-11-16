import { entryDisplayText } from '@app/physical/ui/plant-ui-helpers';
import { describeFieldDiagnosis } from '@app/scoring/field-diagnosis';
import { describe, expect, it } from 'vitest';

const summary = {
  timeToCauseS: null,
  relevantTests: 1,
  irrelevantTests: 0,
  usefulNegatives: 0,
  unsupportedSpares: 0,
  supportedFixes: 0,
  unsupportedFixes: 1,
  trips: 2,
  wrongCauseActions: 0,
  wrongCauseRuleIds: [],
} as never;

describe('c6 S2 blind-playtest fixes', () => {
  it('names the part in a notebook line for plant observations only', () => {
    const plant = { getLabel: (id: string) => (id === 'generator:out' ? 'Generator output plug' : id) } as never;
    expect(entryDisplayText({ kind: 'observation', subject: 'generator:out', verb: 'inspect', text: 'Sits flush.' }, plant)).toBe('Generator output plug: Sits flush.');
    expect(entryDisplayText({ kind: 'result', subject: 's2-supply-loss', text: 'The supply drops.' }, plant)).toBe('The supply drops.');
    expect(entryDisplayText({ kind: 'observation', subject: 'unknown', verb: 'inspect', text: 'x' }, plant)).toBe('x');
  });

  it('drops only the time-to-cause line when the scenario has no hypothesis step', () => {
    const without = describeFieldDiagnosis(summary, 100, [], true, false).lines.join('\n');
    expect(without).not.toContain('Time to cause');
    expect(without).toContain('Fixes with earlier evidence');
    expect(without).toContain('Trips outside: 2');
    expect(describeFieldDiagnosis(summary, 100, [], true, true).lines.join('\n')).toContain('Time to cause');
  });
});
