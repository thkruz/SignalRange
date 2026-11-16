/**
 * @file quiz-history - Study history for Campaign 3 quizzes
 * @description First-attempt result, attempts and last scenario per question id. This is study
 * history, NOT progress (progress stays remote-only by design). Stored in localStorage; every
 * storage access is wrapped so private windows and blocked storage degrade to memory only.
 *
 * Event mapping: a wrong answer arrives as QUIZ_ANSWERED, the correct one as QUIZ_PASSED. The
 * very first recorded answer for a question id decides firstAttemptCorrect.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, type QuizAnsweredData, type QuizPassedData, type QuizShowData } from '@app/events/events';

export const QUIZ_HISTORY_KEY = 'signalrange.c3.quizHistory.v1';

export interface QuizHistoryEntry {
  id: string;
  group?: string;
  firstAttemptCorrect: boolean;
  attempts: number;
  lastScenario?: number;
  markedForReview?: boolean;
}

type HistoryMap = Record<string, QuizHistoryEntry>;

function load(): HistoryMap {
  try {
    const raw = localStorage.getItem(QUIZ_HISTORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? (parsed as HistoryMap) : {};
  } catch {
    return {};
  }
}

export class QuizHistory {
  private entries_: HistoryMap;
  private readonly shown_ = new Map<string, QuizShowData>();
  private scenario_: number | undefined;
  private uninstall_: (() => void) | null = null;

  constructor() {
    this.entries_ = load();
  }

  private persist_(): void {
    try {
      localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(this.entries_));
    } catch {
      // storage unavailable: history stays in memory for this session
    }
  }

  /** Record one attempt. The first ever attempt on a question id decides firstAttemptCorrect. */
  record(id: string, correct: boolean, opts: { group?: string; scenario?: number } = {}): void {
    const entry: QuizHistoryEntry = this.entries_[id] ?? { id, firstAttemptCorrect: correct, attempts: 0 };
    if (entry.attempts === 0) entry.firstAttemptCorrect = correct;
    entry.attempts += 1;
    if (opts.group) entry.group = opts.group;
    if (opts.scenario !== undefined) entry.lastScenario = opts.scenario;
    this.entries_[id] = entry;
    this.persist_();
  }

  get(id: string): QuizHistoryEntry | undefined {
    return this.entries_[id];
  }

  all(): QuizHistoryEntry[] {
    return Object.values(this.entries_);
  }

  /** Groups with a question missed on the first attempt or marked for review, most misses first */
  missedGroups(): string[] {
    const counts = new Map<string, number>();
    for (const e of this.all()) {
      if (e.group && (!e.firstAttemptCorrect || e.markedForReview)) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  }

  markForReview(id: string, group?: string): void {
    const entry: QuizHistoryEntry = this.entries_[id] ?? { id, firstAttemptCorrect: true, attempts: 0 };
    entry.markedForReview = true;
    if (group) entry.group = group;
    this.entries_[id] = entry;
    this.persist_();
  }

  clear(): void {
    this.entries_ = {};
    try {
      localStorage.removeItem(QUIZ_HISTORY_KEY);
    } catch {
      // ignore
    }
  }

  /** Scenario number stamped on subsequent records */
  setScenario(scenario: number | undefined): void {
    this.scenario_ = scenario;
  }

  /** Listen to quiz events; returns an uninstaller. */
  install(): () => void {
    this.uninstall_?.();
    const bus = EventBus.getInstance();
    const key = (d: { objectiveId: string; conditionIndex: number }): string => `${d.objectiveId}:${d.conditionIndex}`;
    const handle = (d: QuizAnsweredData | QuizPassedData, correct: boolean): void => {
      const src = this.shown_.get(key(d))?.quizSource;
      const id = src?.kind === 'official' ? src.questionId : src?.localId;
      if (!src || !id) return;
      this.record(id, correct, { group: src.group, scenario: this.scenario_ });
    };
    const onShow = (d: QuizShowData): void => {
      this.shown_.set(key(d), d);
    };
    const onAnswered = (d: QuizAnsweredData): void => handle(d, d.isCorrect);
    const onPassed = (d: QuizPassedData): void => handle(d, true);
    bus.on(Events.QUIZ_SHOW, onShow);
    bus.on(Events.QUIZ_ANSWERED, onAnswered);
    bus.on(Events.QUIZ_PASSED, onPassed);

    this.uninstall_ = () => {
      bus.off(Events.QUIZ_SHOW, onShow);
      bus.off(Events.QUIZ_ANSWERED, onAnswered);
      bus.off(Events.QUIZ_PASSED, onPassed);
      this.uninstall_ = null;
    };

    return this.uninstall_;
  }
}
