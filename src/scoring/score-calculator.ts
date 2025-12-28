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
   */
  static calculate(
    objectives: ObjectiveState[],
    timeRemainingSeconds: number,
    quizPenalties: number,
    timePenalties: number = 0
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
    const sanitizedQuizPenalties = Math.max(0, quizPenalties);
    const sanitizedTimePenalties = Math.max(0, timePenalties);

    // Calculate total (minimum 0)
    const totalScore = Math.max(0, basePoints + timeBonus - sanitizedQuizPenalties - sanitizedTimePenalties);

    // Build objective breakdown for display
    const objectiveBreakdown = objectives.map((objState) => ({
      points: objState.objective.points ?? 0,
    }));

    return {
      basePoints,
      timeBonus,
      quizPenalties: sanitizedQuizPenalties,
      timePenalties: sanitizedTimePenalties,
      totalScore,
      objectiveBreakdown,
      timeRemainingSeconds,
    };
  }
}
