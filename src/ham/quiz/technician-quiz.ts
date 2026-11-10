/**
 * @file technician-quiz - Typed accessors over the public Campaign 3 quiz data
 * @description Wraps the generated JSON (scripts/build-c3-quiz-data.mjs). Official items keep the
 * exact NCVEC wording and option order; applied items are authored checks.
 */

import itemsData from '@app/campaigns/ham-sdr/quiz/c3-quiz-items.json';
import poolData from '@app/campaigns/ham-sdr/quiz/technician-pool.json';
import { Character } from '@app/modal/character-enum';
import type { Condition } from '@app/objectives/objective-types';
import { getAssetUrl } from '@app/utils/asset-url';

export interface OfficialQuestion {
  id: string;
  group: string;
  revision: string;
  stem: string;
  options: string[];
  correctIndex: number;
  figure: string | null;
}

export interface ScenarioQuizItem {
  localId: string;
  scenario: number;
  checkpoint: number;
  kind: 'official' | 'applied';
  officialId: string | null;
  relatedOfficialIds?: string[];
  group: string | null;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  figure: string | null;
}

export interface BuildQuizOptions {
  /** Defaults to Riley Brooks */
  character?: Character;
  pointPenalty?: number;
  documentLine?: string;
  documentSection?: string;
  reviewHint?: string;
  /** Per-option feedback (original option order) */
  wrongAnswerFeedback?: string[];
  /** Applied items only: let the modal shuffle options (official items are never shuffled) */
  shuffleApplied?: boolean;
}

const pool = poolData.questions as OfficialQuestion[];
const items = itemsData.items as ScenarioQuizItem[];
export const POOL_REVISION: string = poolData.revision;

const poolById = new Map(pool.map((q) => [q.id, q]));
const itemById = new Map(items.map((i) => [i.localId, i]));

export function getOfficialQuestion(id: string): OfficialQuestion | undefined {
  return poolById.get(id);
}

export function allOfficialQuestions(): readonly OfficialQuestion[] {
  return pool;
}

export function getScenarioItems(scenario: number, checkpoint?: number): ScenarioQuizItem[] {
  return items.filter((i) => i.scenario === scenario && (checkpoint === undefined || i.checkpoint === checkpoint));
}

export function getScenarioItem(localId: string): ScenarioQuizItem | undefined {
  return itemById.get(localId);
}

/** Group id (e.g. "T3B") -> its official questions, in pool order */
export function groups(): Map<string, OfficialQuestion[]> {
  const map = new Map<string, OfficialQuestion[]>();
  for (const q of pool) {
    const list = map.get(q.group);
    if (list) list.push(q);
    else map.set(q.group, [q]);
  }

  return map;
}

/** Quiz params that make the modal show an official figure (also used for pool questions outside the scenario items) */
export function figureParams(figure: string): { figureUrl: string; figureAlt: string } {
  return {
    figureUrl: getAssetUrl(`/assets/campaigns/home-sdr/figures/${figure}`),
    figureAlt: `${figureLabel(figure)} from the official NCVEC Technician question pool`,
  };
}

/** "figure-T2.jpg" -> "Figure T-2" */
function figureLabel(file: string): string {
  const m = /^figure-T(\d+)\./u.exec(file);

  return m ? `Figure T-${m[1]}` : 'Figure';
}

/** Build a status-check Condition for a scenario item (localId such as "S01-Q1") */
export function buildQuizCondition(localId: string, opts: BuildQuizOptions = {}): Condition {
  const item = itemById.get(localId);
  if (!item) throw new Error(`Unknown C3 quiz item: ${localId}`);

  const official = item.kind === 'official';
  const params: NonNullable<Condition['params']> = {
    question: item.stem,
    options: [...item.options],
    correctIndex: item.correctIndex,
    explanation: item.explanation,
    preserveOptionOrder: official ? true : !opts.shuffleApplied,
    character: opts.character ?? Character.RILEY_BROOKS,
    quizSource: official
      ? { kind: 'official', questionId: item.officialId ?? undefined, group: item.group ?? undefined, poolRevision: POOL_REVISION, localId }
      : { kind: 'applied', questionId: item.officialId ?? undefined, group: item.group ?? undefined, localId },
  };
  if (opts.pointPenalty !== undefined) params.pointPenalty = opts.pointPenalty;
  if (opts.documentLine !== undefined) params.documentLine = opts.documentLine;
  if (opts.documentSection !== undefined) params.documentSection = opts.documentSection;
  if (opts.wrongAnswerFeedback) params.wrongAnswerFeedback = opts.wrongAnswerFeedback;
  if (opts.reviewHint) params.reviewHint = opts.reviewHint;
  if (item.figure) Object.assign(params, figureParams(item.figure));

  return {
    type: 'status-check',
    mustMaintain: false,
    description: official ? `Knowledge check ${item.officialId}` : 'Applied check',
    params,
  };
}
