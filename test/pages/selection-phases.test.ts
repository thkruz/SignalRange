import { describe, expect, it } from 'vitest';
import { selectionPhases } from '../../src/pages/selection-phases';
import type { ScenarioData } from '../../src/ScenarioData';

const missions = (count: number): ScenarioData[] =>
  Array.from(
    { length: count + 1 },
    (_, number) =>
      ({
        id: `mission-${number}`,
        number,
        missionType: number === 0 ? 'Sandbox' : 'Training',
      }) as ScenarioData
  );

describe('mission phase grouping', () => {
  it('keeps sandbox outside NATS numbered phases and includes each mission exactly once', () => {
    const phases = selectionPhases('nats', missions(24));
    expect(phases.map((phase) => phase.scenarios.map((scenario) => scenario.number))).toEqual([
      [0],
      [1, 2, 3, 4, 5, 6, 7, 8],
      [9, 10, 11, 12, 13, 14, 15, 16],
      [17, 18, 19, 20, 21, 22, 23, 24],
    ]);
  });

  it('keeps EU missions beyond the requested two phases accessible', () => {
    const phases = selectionPhases('nats-eu', missions(28));
    expect(phases.map((phase) => phase.scenarios.length)).toEqual([1, 8, 8, 12]);
    expect(phases[3].title).toBe('Additional missions');
  });

  it('uses one phase for other campaigns, even when mission numbers are not consecutive', () => {
    const scenarios = missions(4).filter((scenario) => scenario.number !== 2);
    const phases = selectionPhases('ccs', scenarios);
    expect(phases.map((phase) => phase.scenarios.map((scenario) => scenario.number))).toEqual([[0], [1, 3, 4]]);
  });
});
