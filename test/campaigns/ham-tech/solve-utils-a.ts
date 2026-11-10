import type { Condition } from '../../../src/objectives/objective-types';
import type { ScenarioData } from '../../../src/ScenarioData';

/** Non-quiz, non-brief conditions of one objective */
export function practical(data: ScenarioData, objectiveId: string): Condition[] {
  const o = data.objectives?.find((x) => x.id === objectiveId);
  if (!o) throw new Error(`No objective ${objectiveId}`);

  return o.conditions.filter((c) => c.type !== 'status-check' && c.type !== 'mission-brief-opened');
}

/** localIds of every quiz row in a scenario */
export function quizIds(data: ScenarioData): string[] {
  const out: string[] = [];
  for (const o of data.objectives ?? []) {
    for (const c of o.conditions) {
      if (c.type !== 'status-check') continue;
      const src = c.params?.quizSource as { localId?: string } | undefined;
      if (src?.localId) out.push(src.localId);
    }
  }

  return out;
}
