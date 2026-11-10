/**
 * @file mock-exam - Pure mock exam and review selection for Campaign 3
 * @description 35 questions, one per official group, deterministic per seed. No DOM, no storage.
 */

import type { QuizHistoryEntry } from './quiz-history';
import { allOfficialQuestions, groups, type OfficialQuestion } from './technician-quiz';

export const MOCK_EXAM_SIZE = 35;
export const MOCK_EXAM_PASS = 26;

/** mulberry32: small seeded PRNG, enough for exam draws */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

/** One question per group, groups in sorted order, chosen deterministically from `seed`. */
export function selectMockExam(seed: number): OfficialQuestion[] {
  const rng = makeRng(seed);
  const picks: OfficialQuestion[] = [];
  for (const group of [...groups().keys()].sort()) {
    const list = groups().get(group) ?? [];
    picks.push(list[Math.floor(rng() * list.length)]);
  }

  return picks;
}

export interface MockExamScore {
  correct: number;
  total: number;
  passed: boolean;
  missedIds: string[];
  missedGroups: string[];
}

/** `answers` maps question id -> chosen option index. Unanswered counts as wrong. */
export function scoreMockExam(answers: Readonly<Record<string, number>>, exam?: readonly OfficialQuestion[]): MockExamScore {
  const byId = new Map(allOfficialQuestions().map((q) => [q.id, q]));
  const questions = exam ?? Object.keys(answers).flatMap((id) => byId.get(id) ?? []);
  let correct = 0;
  const missedIds: string[] = [];
  const missedGroups = new Set<string>();
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) correct++;
    else {
      missedIds.push(q.id);
      missedGroups.add(q.group);
    }
  }

  return { correct, total: MOCK_EXAM_SIZE, passed: correct >= MOCK_EXAM_PASS, missedIds, missedGroups: [...missedGroups] };
}

/**
 * Review set drawn from questions the player has already met (`introducedIds`). Questions from
 * missed groups (first-attempt wrong or marked for review) come first, then the rest; each tier
 * is shuffled deterministically from `seed`.
 */
export function selectReview(
  introducedIds: readonly string[],
  history: Readonly<Record<string, QuizHistoryEntry>> | readonly QuizHistoryEntry[],
  seed: number,
  count = 12
): OfficialQuestion[] {
  const rng = makeRng(seed);
  const entries = Array.isArray(history) ? (history as readonly QuizHistoryEntry[]) : Object.values(history as Record<string, QuizHistoryEntry>);
  const missedGroups = new Set(entries.filter((e) => e.group && (!e.firstAttemptCorrect || e.markedForReview)).map((e) => e.group as string));
  const byId = new Map(allOfficialQuestions().map((q) => [q.id, q]));
  const candidates = [...new Set(introducedIds)].flatMap((id) => byId.get(id) ?? []);
  const priority = shuffled(
    candidates.filter((q) => missedGroups.has(q.group)),
    rng
  );
  const rest = shuffled(
    candidates.filter((q) => !missedGroups.has(q.group)),
    rng
  );

  return [...priority, ...rest].slice(0, count);
}
