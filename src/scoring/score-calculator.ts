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
  /** Final calculated score */
  totalScore: number;
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
   */
  static calculate(
    objectives: ObjectiveState[],
    timeRemainingSeconds: number,
    quizPenalties: number
  ): ScoreBreakdown {
    // Sum objective points (default to 0 if undefined)
    const basePoints = objectives.reduce((sum, objState) => {
      return sum + (objState.objective.points ?? 0);
    }, 0);

    // Time bonus: 1 point per TIME_BONUS_DIVISOR seconds remaining
    const timeBonus = timeRemainingSeconds > 0
      ? Math.floor(timeRemainingSeconds / ScoreCalculator.TIME_BONUS_DIVISOR)
      : 0;

    // Ensure penalties are non-negative
    const sanitizedPenalties = Math.max(0, quizPenalties);

    // Calculate total (minimum 0)
    const totalScore = Math.max(0, basePoints + timeBonus - sanitizedPenalties);

    return {
      basePoints,
      timeBonus,
      quizPenalties: sanitizedPenalties,
      totalScore,
    };
  }
}
