import type { ObjectiveState } from '@app/objectives';

/**
 * Score breakdown for a completed scenario
 */
export interface ScoreBreakdown {
  /** Points earned from completing objectives */
  basePoints: number;
  /** Bonus points from remaining time */
  timeBonus: number;
  /** Points deducted from quiz wrong answers */
  quizPenalties: number;
  /** Points deducted from time-based objective penalties */
  timePenalties: number;
  /** Points deducted from requesting hints (50% per objective) */
  hintPenalties: number;
  /** Points lost on wrong or unevidenced decisions (decision conditions) */
  decisionPenalties: number;
  /** Final calculated score */
  totalScore: number;

  /** Individual objective points for breakdown display */
  objectiveBreakdown: { points: number }[];
  /** Raw seconds remaining (used to calculate timeBonus) */
  timeRemainingSeconds: number;
}

/**
 * Stateless utility for calculating scenario scores
 */
export class ScoreCalculator {
  /** Seconds of remaining time per bonus point */
  static readonly TIME_BONUS_DIVISOR = 5;

  /**
   * Calculate the final score for a completed scenario
   * @param objectives - Completed objective states
   * @param timeRemainingSeconds - Seconds remaining on scenario timer (0 if no timer)
   * @param quizPenalties - Total points deducted from wrong quiz answers
   * @param timePenalties - Total points deducted from time-based objective penalties
   * @param hintPenalties - Total points deducted from requesting hints
   */
  static calculate(
    objectives: ObjectiveState[],
    timeRemainingSeconds: number,
    quizPenalties: number,
    timePenalties: number = 0,
    hintPenalties: number = 0,
    decisionPenalties: number = 0
  ): ScoreBreakdown {
    // Only completed objectives score. Optional objectives no longer gate
    // Mission Complete, so an unfinished one can be in this list and must not
    // award its points or count in the breakdown.
    const completedObjectives = objectives.filter((objState) => objState.isCompleted);

    // Sum objective points (default to 0 if undefined)
    const basePoints = completedObjectives.reduce((sum, objState) => sum + (objState.objective.points ?? 0), 0);

    // Time bonus: 1 point per TIME_BONUS_DIVISOR seconds remaining
    const timeBonus = timeRemainingSeconds > 0 ? Math.floor(timeRemainingSeconds / ScoreCalculator.TIME_BONUS_DIVISOR) : 0;

    // Ensure penalties are non-negative
    const sanitizedQuizPenalties = Math.max(0, quizPenalties);
    const sanitizedTimePenalties = Math.max(0, timePenalties);
    const sanitizedHintPenalties = Math.max(0, hintPenalties);
    const sanitizedDecisionPenalties = Math.max(0, decisionPenalties);

    // Calculate total (minimum 0)
    const totalScore = Math.max(0, basePoints + timeBonus - sanitizedQuizPenalties - sanitizedTimePenalties - sanitizedHintPenalties - sanitizedDecisionPenalties);

    // Build objective breakdown for display
    const objectiveBreakdown = completedObjectives.map((objState) => ({
      points: objState.objective.points ?? 0,
    }));

    return {
      basePoints,
      timeBonus,
      quizPenalties: sanitizedQuizPenalties,
      timePenalties: sanitizedTimePenalties,
      hintPenalties: sanitizedHintPenalties,
      decisionPenalties: sanitizedDecisionPenalties,
      totalScore,
      objectiveBreakdown,
      timeRemainingSeconds,
    };
  }
}
