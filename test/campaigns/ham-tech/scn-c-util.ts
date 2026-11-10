import { evaluateWith } from '../../../src/ham/ham-conditions';
import type { HamStationManager } from '../../../src/ham/ham-station-manager';
import type { Condition, Objective } from '../../../src/objectives/objective-types';
import type { ScenarioData } from '../../../src/ScenarioData';

export const objective = (data: ScenarioData, id: string): Objective => {
  const o = data.objectives?.find((x) => x.id === id);
  if (!o) throw new Error(`no objective ${id}`);

  return o;
};

/** Practical (evidence) conditions of an objective: not the brief, not a quiz row */
export const practical = (o: Objective): Condition[] => o.conditions.filter((c) => c.type === 'custom');

export const quizRows = (o: Objective): Condition[] => o.conditions.filter((c) => c.type === 'status-check');

export const quizLocalIds = (data: ScenarioData): string[] =>
  (data.objectives ?? []).flatMap((o) => quizRows(o).map((c) => (c.params?.quizSource as { localId: string } | undefined)?.localId ?? ''));

export const allTrue = (o: Objective, m: HamStationManager): boolean => practical(o).every((c) => evaluateWith(c, m));

export const anyTrue = (o: Objective, m: HamStationManager): boolean => practical(o).some((c) => evaluateWith(c, m));
