import type { ScenarioProgress } from '@app/user-account/types';

export interface MissionRecord {
  previous: number;
  best: number;
  completedAt: string;
}
const key = (account: string, mission: string): string => `signalrange.records.v1:${encodeURIComponent(account)}:${encodeURIComponent(mission)}`;
export function readMissionRecord(account: string | null | undefined, mission: string): MissionRecord | null {
  if (!account) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key(account, mission)) ?? 'null') as MissionRecord | null;
    return value && Number.isFinite(value.previous) && Number.isFinite(value.best) ? value : null;
  } catch {
    return null;
  }
}

/** Keep the last completed result before replay resets its server row. No guest records. */
export function rememberMissionResult(account: string | null | undefined, result: Pick<ScenarioProgress, 'scenarioId' | 'score' | 'completedAt'>): void {
  if (!account || !result.completedAt || !Number.isFinite(result.score)) return;
  const previous = readMissionRecord(account, result.scenarioId);
  if (previous?.completedAt === result.completedAt) return;
  const record: MissionRecord = { previous: result.score, best: Math.max(previous?.best ?? result.score, result.score), completedAt: result.completedAt };
  try {
    localStorage.setItem(key(account, result.scenarioId), JSON.stringify(record));
  } catch {
    /* Cloud saving still works without local storage. */
  }
}
