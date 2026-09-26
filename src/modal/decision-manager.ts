/**
 * @file Decision Manager - owns the answer-time side of decision conditions
 * @description Mirrors QuizManager. ObjectivesManager registers a decision and
 * keeps polling isResolved(); this class owns the interaction: showing the
 * modal, grading the chosen option against the evidence facts at that instant,
 * the penalty tally, and dispatching the option's consequence.
 */

import { EventBus } from '@app/events/event-bus';
import { DecisionAnsweredData, DecisionDismissedData, DecisionEvidenceStatus, DecisionGradedData, DecisionResolvedData, DecisionShowData, Events } from '@app/events/events';
import { ConsequenceDispatcher } from '@app/objectives/consequence-dispatcher';
import { evaluateFactRule } from '@app/objectives/evidence-facts';
import type { DecisionOption, EvidenceFactId } from '@app/objectives/objective-types';
import type { Character } from './character-enum';

export const DEFAULT_DECISION_PENALTY = 10;
export const DEFAULT_PARTIAL_CREDIT_UNEVIDENCED = 0.5;

/** What ObjectivesManager hands over when it registers a decision */
export interface DecisionRegistration {
  prompt: string;
  options: DecisionOption[];
  explanation?: string;
  pointPenalty?: number;
  partialCreditUnevidenced?: number;
  character?: Character;
  preserveOptionOrder?: boolean;
  groundStationId?: string;
  /** Live read of a held evidence fact */
  readFact: (id: EvidenceFactId) => boolean;
  /** Evidence latches the decision depends on, with their current state */
  evidenceStatus: () => DecisionEvidenceStatus[];
}

export interface DecisionResolution {
  optionIndex: number;
  label: string;
  correct: boolean;
  evidenced: boolean;
  missingEvidence: string[];
}

/** One judgement the player made, for the completion summary */
export interface DecisionRecord {
  objectiveId: string;
  conditionIndex: number;
  prompt: string;
  attempts: number;
  pointsDeducted: number;
  resolution: DecisionResolution;
}

interface DecisionState extends DecisionRegistration {
  objectiveId: string;
  conditionIndex: number;
  attempts: number;
  totalPointsDeducted: number;
  isResolved: boolean;
  resolution: DecisionResolution | null;
}

export class DecisionManager {
  private static instance_: DecisionManager | null = null;

  private readonly decisions_ = new Map<string, DecisionState>();
  private pendingKey_: string | null = null;
  private readonly dispatcher_ = new ConsequenceDispatcher();

  private readonly boundAnsweredHandler_: (data: DecisionAnsweredData) => void;
  private readonly boundDismissedHandler_: (data: DecisionDismissedData) => void;
  private readonly boundResolvedHandler_: (data: DecisionResolvedData) => void;

  private constructor() {
    this.boundAnsweredHandler_ = this.handleAnswered_.bind(this);
    this.boundDismissedHandler_ = this.handleDismissed_.bind(this);
    this.boundResolvedHandler_ = this.handleResolved_.bind(this);

    const bus = EventBus.getInstance();
    bus.on(Events.DECISION_ANSWERED, this.boundAnsweredHandler_);
    bus.on(Events.DECISION_DISMISSED, this.boundDismissedHandler_);
    bus.on(Events.DECISION_RESOLVED, this.boundResolvedHandler_);
  }

  static getInstance(): DecisionManager {
    DecisionManager.instance_ ??= new DecisionManager();
    return DecisionManager.instance_;
  }

  static hasInstance(): boolean {
    return DecisionManager.instance_ !== null;
  }

  static destroy(): void {
    const instance = DecisionManager.instance_;
    if (!instance) return;
    const bus = EventBus.getInstance();
    bus.off(Events.DECISION_ANSWERED, instance.boundAnsweredHandler_);
    bus.off(Events.DECISION_DISMISSED, instance.boundDismissedHandler_);
    bus.off(Events.DECISION_RESOLVED, instance.boundResolvedHandler_);
    instance.dispatcher_.releaseAll();
    DecisionManager.instance_ = null;
  }

  /** Register a decision; a pending indicator is raised, the modal is not opened. */
  register(objectiveId: string, conditionIndex: number, registration: DecisionRegistration): void {
    const key = DecisionManager.keyFor_(objectiveId, conditionIndex);
    if (this.decisions_.has(key)) return;

    this.decisions_.set(key, {
      ...registration,
      objectiveId,
      conditionIndex,
      attempts: 0,
      totalPointsDeducted: 0,
      isResolved: false,
      resolution: null,
    });
    this.pendingKey_ = key;
    EventBus.getInstance().emit(Events.DECISION_PENDING, { objectiveId, conditionIndex });
  }

  has(objectiveId: string, conditionIndex: number): boolean {
    return this.decisions_.has(DecisionManager.keyFor_(objectiveId, conditionIndex));
  }

  isResolved(objectiveId: string, conditionIndex: number): boolean {
    return this.decisions_.get(DecisionManager.keyFor_(objectiveId, conditionIndex))?.isResolved ?? false;
  }

  hasPending(): boolean {
    return this.pendingKey_ !== null;
  }

  getPendingKey(): string | null {
    return this.pendingKey_;
  }

  /** Open the modal for the pending decision (pending indicator click) */
  reopenPending(): void {
    if (!this.pendingKey_) return;
    const state = this.decisions_.get(this.pendingKey_);
    if (state && !state.isResolved) this.show(state.objectiveId, state.conditionIndex);
  }

  show(objectiveId: string, conditionIndex: number): void {
    const state = this.decisions_.get(DecisionManager.keyFor_(objectiveId, conditionIndex));
    if (!state || state.isResolved) return;

    const data: DecisionShowData = {
      objectiveId,
      conditionIndex,
      prompt: state.prompt,
      options: state.options.map((o) => o.label),
      explanation: state.explanation,
      pointPenalty: state.pointPenalty ?? DEFAULT_DECISION_PENALTY,
      character: state.character,
      preserveOptionOrder: state.preserveOptionOrder,
      evidence: state.evidenceStatus(),
    };
    EventBus.getInstance().emit(Events.DECISION_SHOW, data);
  }

  /** Current evidence latches for an open decision (the modal polls this) */
  getEvidenceStatus(objectiveId: string, conditionIndex: number): DecisionEvidenceStatus[] {
    return this.decisions_.get(DecisionManager.keyFor_(objectiveId, conditionIndex))?.evidenceStatus() ?? [];
  }

  getAttempts(objectiveId: string, conditionIndex: number): number {
    return this.decisions_.get(DecisionManager.keyFor_(objectiveId, conditionIndex))?.attempts ?? 0;
  }

  getPointsDeducted(objectiveId: string, conditionIndex: number): number {
    return this.decisions_.get(DecisionManager.keyFor_(objectiveId, conditionIndex))?.totalPointsDeducted ?? 0;
  }

  /** Every resolved decision, for the completion summary */
  getRecords(): DecisionRecord[] {
    const records: DecisionRecord[] = [];
    for (const state of this.decisions_.values()) {
      if (!state.resolution) continue;
      records.push({
        objectiveId: state.objectiveId,
        conditionIndex: state.conditionIndex,
        prompt: state.prompt,
        attempts: state.attempts,
        pointsDeducted: state.totalPointsDeducted,
        resolution: state.resolution,
      });
    }
    return records;
  }

  reset(): void {
    this.decisions_.clear();
    this.pendingKey_ = null;
    this.dispatcher_.releaseAll();
  }

  /**
   * Grade an answer against the facts as they stand right now. Any option's
   * consequence fires when it is chosen, right or wrong - that is the point.
   * A wrong answer leaves the decision open, like a quiz.
   */
  private handleAnswered_(data: DecisionAnsweredData): void {
    const state = this.decisions_.get(DecisionManager.keyFor_(data.objectiveId, data.conditionIndex));
    if (!state || state.isResolved) return;
    const option = state.options[data.optionIndex];
    if (!option) return;

    state.attempts += 1;

    const correct = this.isCorrect_(state, data.optionIndex);
    const missingEvidence = state
      .evidenceStatus()
      .filter((e) => !e.ready)
      .map((e) => e.label);
    const evidenced = missingEvidence.length === 0;
    const penalty = state.pointPenalty ?? DEFAULT_DECISION_PENALTY;

    if (!correct) {
      state.totalPointsDeducted += penalty;
    } else if (!evidenced) {
      const credit = state.partialCreditUnevidenced ?? DEFAULT_PARTIAL_CREDIT_UNEVIDENCED;
      state.totalPointsDeducted += Math.round(penalty * (1 - credit));
    }

    if (option.consequence) {
      const result = this.dispatcher_.dispatch(option.consequence, { groundStationId: state.groundStationId });
      state.totalPointsDeducted += result.pointDelta;
      for (const s of result.skipped) console.warn(`decision ${data.objectiveId}[${data.conditionIndex}] consequence ${s.key} skipped: ${s.reason}`);
    }
    state.totalPointsDeducted = Math.max(0, state.totalPointsDeducted);

    if (correct) {
      state.resolution = { optionIndex: data.optionIndex, label: option.label, correct, evidenced, missingEvidence };
    }

    const graded: DecisionGradedData = {
      objectiveId: data.objectiveId,
      conditionIndex: data.conditionIndex,
      optionIndex: data.optionIndex,
      correct,
      evidenced,
      missingEvidence,
      feedback: option.feedback ?? (correct ? state.explanation : undefined),
      attempts: state.attempts,
      pointsDeducted: state.totalPointsDeducted,
    };
    EventBus.getInstance().emit(Events.DECISION_GRADED, graded);
  }

  /**
   * An option is correct when its rule holds. If no option's rule holds the
   * author has left the scenario in a state the decision cannot describe;
   * accept the answer rather than deadlock, and say so on the console.
   */
  private isCorrect_(state: DecisionState, optionIndex: number): boolean {
    const holds = state.options.map((o) => (o.correctWhen ? evaluateFactRule(o.correctWhen, state.readFact) : false));
    if (!holds.some(Boolean)) {
      console.warn(`decision ${state.objectiveId}[${state.conditionIndex}]: no option is correct for the current evidence; accepting the answer`);
      return true;
    }
    return holds[optionIndex];
  }

  private handleDismissed_(data: DecisionDismissedData): void {
    const key = DecisionManager.keyFor_(data.objectiveId, data.conditionIndex);
    const state = this.decisions_.get(key);
    if (state && !state.isResolved) this.pendingKey_ = key;
  }

  private handleResolved_(data: DecisionResolvedData): void {
    const key = DecisionManager.keyFor_(data.objectiveId, data.conditionIndex);
    const state = this.decisions_.get(key);
    if (!state) return;
    state.isResolved = true;
    if (this.pendingKey_ === key) this.pendingKey_ = null;
  }

  private static keyFor_(objectiveId: string, conditionIndex: number): string {
    return `${objectiveId}:${conditionIndex}`;
  }
}
