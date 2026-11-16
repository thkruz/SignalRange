import { evaluateWith } from '../../../src/ham/ham-conditions';
import type { HamStationManager } from '../../../src/ham/ham-station-manager';
import type { Condition } from '../../../src/objectives/objective-types';
import type { ScenarioData } from '../../../src/ScenarioData';

export function practicalOf(data: ScenarioData, objectiveId: string): Condition[] {
  const o = data.objectives?.find((x) => x.id === objectiveId);
  if (!o) throw new Error(`No objective ${objectiveId}`);

  return o.conditions.filter((c) => c.type !== 'status-check' && c.type !== 'mission-brief-opened');
}

/** localIds of every quiz row in a scenario, in objective order */
export function quizLocalIds(data: ScenarioData): string[] {
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

/** Evaluate each practical condition of an objective: returns the descriptions of those that are false */
export function failing(data: ScenarioData, objectiveId: string, m: HamStationManager): string[] {
  return practicalOf(data, objectiveId)
    .filter((c) => !evaluateWith(c, m))
    .map((c) => c.description);
}

export function expectedQuizIds(n: string): string[] {
  return [...Array.from({ length: 8 }, (_, i) => `S${n}-Q${i + 1}`), `S${n}-A1`, `S${n}-A2`];
}
