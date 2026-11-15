import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { describe, expect, it } from 'vitest';

/** c6s2-r6: the player inspected the strip, kept a Notebook theory and never found the Knowledge Check that ticks the row. */
describe('C6 S2 Trace the Shared Supply: the quiz row tells the player where the control is', () => {
  const objective = frontlineScenario2Data.objectives?.find((o) => o.id === 's2-trace-dependencies');
  const quiz = objective?.conditions.find((c) => c.type === 'status-check');

  it('the Next line names Open Quiz and says the Notebook theory does not complete the row', () => {
    expect(quiz?.next ?? '').toContain('Open Quiz');
    expect(quiz?.next ?? '').toContain('Notebook');
  });

  it('the description points at the Knowledge Check', () => {
    expect(objective?.description).toContain('Knowledge Check');
  });

  it('the Next line and description do not name an answer option', () => {
    const text = `${quiz?.next ?? ''} ${objective?.description ?? ''}`.toLowerCase();
    expect(text).not.toContain('shared supply dependency');
    expect(text).not.toContain('independent power source');
  });
});
