import { ScoreCalculator, ScoreBreakdown } from '../../src/scoring/score-calculator';
import type { ObjectiveState } from '../../src/objectives/objective-types';

/**
 * Creates a minimal ObjectiveState for testing
 */
function createObjectiveState(points?: number): ObjectiveState {
  return {
    objective: {
      id: `obj-${Math.random().toString(36).substr(2, 9)}`,
      title: 'Test Objective',
      description: 'Test description',
      conditions: [],
      points,
    },
    isActive: true,
    isCompleted: true,
    conditionStates: [],
    isFailed: false,
    isTimerRunning: false,
  };
}

describe('ScoreCalculator', () => {
  describe('TIME_BONUS_DIVISOR', () => {
    it('should be 5', () => {
      expect(ScoreCalculator.TIME_BONUS_DIVISOR).toBe(5);
    });
  });

  describe('calculate', () => {
    describe('base points calculation', () => {
      it('should return 0 base points for empty objectives array', () => {
        const result = ScoreCalculator.calculate([], 0, 0, 0);
        expect(result.basePoints).toBe(0);
      });

      it('should sum points from single objective', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(100);
      });

      it('should sum points from multiple objectives', () => {
        const objectives = [
          createObjectiveState(100),
          createObjectiveState(200),
          createObjectiveState(50),
        ];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(350);
      });

      it('should treat undefined points as 0', () => {
        const objectives = [
          createObjectiveState(100),
          createObjectiveState(undefined),
          createObjectiveState(50),
        ];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(150);
      });

      it('should handle all objectives having undefined points', () => {
        const objectives = [
          createObjectiveState(undefined),
          createObjectiveState(undefined),
        ];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(0);
      });
    });

    describe('time bonus calculation', () => {
      it('should return 0 time bonus when no time remaining', () => {
        const result = ScoreCalculator.calculate([], 0, 0, 0);
        expect(result.timeBonus).toBe(0);
      });

      it('should return 0 time bonus for negative time remaining', () => {
        const result = ScoreCalculator.calculate([], -10, 0, 0);
        expect(result.timeBonus).toBe(0);
      });

      it('should calculate 1 point per 5 seconds remaining', () => {
        const result = ScoreCalculator.calculate([], 25, 0, 0);
        expect(result.timeBonus).toBe(5);
      });

      it('should floor time bonus (no partial points)', () => {
        const result = ScoreCalculator.calculate([], 14, 0, 0);
        expect(result.timeBonus).toBe(2); // 14 / 5 = 2.8, floor = 2
      });

      it('should give 0 bonus for less than 5 seconds', () => {
        const result = ScoreCalculator.calculate([], 4, 0, 0);
        expect(result.timeBonus).toBe(0);
      });

      it('should handle large time values', () => {
        const result = ScoreCalculator.calculate([], 3600, 0, 0); // 1 hour
        expect(result.timeBonus).toBe(720); // 3600 / 5 = 720
      });
    });

    describe('quiz penalties', () => {
      it('should subtract quiz penalties from total', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, 25, 0);
        expect(result.totalScore).toBe(75);
        expect(result.quizPenalties).toBe(25);
      });

      it('should sanitize negative quiz penalties to 0', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, -10, 0);
        expect(result.quizPenalties).toBe(0);
        expect(result.totalScore).toBe(100);
      });

      it('should handle zero quiz penalties', () => {
        const result = ScoreCalculator.calculate([], 0, 0, 0);
        expect(result.quizPenalties).toBe(0);
      });
    });

    describe('time penalties', () => {
      it('should subtract time penalties from total', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 30);
        expect(result.totalScore).toBe(70);
        expect(result.timePenalties).toBe(30);
      });

      it('should sanitize negative time penalties to 0', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, 0, -15);
        expect(result.timePenalties).toBe(0);
        expect(result.totalScore).toBe(100);
      });

      it('should default to 0 when time penalties not provided', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 0, 0);
        expect(result.timePenalties).toBe(0);
        expect(result.totalScore).toBe(100);
      });
    });

    describe('total score calculation', () => {
      it('should combine all score components correctly', () => {
        const objectives = [createObjectiveState(100), createObjectiveState(50)];
        const result = ScoreCalculator.calculate(objectives, 50, 10, 5);
        // basePoints=150, timeBonus=10 (50/5), quizPenalties=10, timePenalties=5
        // total = 150 + 10 - 10 - 5 = 145
        expect(result.totalScore).toBe(145);
      });

      it('should never return negative total score', () => {
        const objectives = [createObjectiveState(10)];
        const result = ScoreCalculator.calculate(objectives, 0, 100, 50);
        expect(result.totalScore).toBe(0);
      });

      it('should clamp to zero when penalties exceed points', () => {
        const objectives = [createObjectiveState(50)];
        const result = ScoreCalculator.calculate(objectives, 10, 30, 40);
        // basePoints=50, timeBonus=2, quizPenalties=30, timePenalties=40
        // 50 + 2 - 30 - 40 = -18 → clamped to 0
        expect(result.totalScore).toBe(0);
      });
    });

    describe('objective breakdown', () => {
      it('should return empty breakdown for no objectives', () => {
        const result = ScoreCalculator.calculate([], 0, 0, 0);
        expect(result.objectiveBreakdown).toEqual([]);
      });

      it('should include points for each objective', () => {
        const objectives = [
          createObjectiveState(100),
          createObjectiveState(50),
          createObjectiveState(75),
        ];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.objectiveBreakdown).toEqual([
          { points: 100 },
          { points: 50 },
          { points: 75 },
        ]);
      });

      it('should use 0 for undefined objective points in breakdown', () => {
        const objectives = [
          createObjectiveState(100),
          createObjectiveState(undefined),
        ];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.objectiveBreakdown).toEqual([
          { points: 100 },
          { points: 0 },
        ]);
      });
    });

    describe('timeRemainingSeconds in result', () => {
      it('should include the original time remaining value', () => {
        const result = ScoreCalculator.calculate([], 123, 0, 0);
        expect(result.timeRemainingSeconds).toBe(123);
      });

      it('should preserve negative time values', () => {
        const result = ScoreCalculator.calculate([], -5, 0, 0);
        expect(result.timeRemainingSeconds).toBe(-5);
      });

      it('should preserve zero time', () => {
        const result = ScoreCalculator.calculate([], 0, 0, 0);
        expect(result.timeRemainingSeconds).toBe(0);
      });
    });

    describe('complete ScoreBreakdown structure', () => {
      it('should return all required fields', () => {
        const objectives = [createObjectiveState(100)];
        const result = ScoreCalculator.calculate(objectives, 60, 10, 5);

        expect(result).toEqual<ScoreBreakdown>({
          basePoints: 100,
          timeBonus: 12, // 60 / 5 = 12
          quizPenalties: 10,
          timePenalties: 5,
          hintPenalties: 0,
          totalScore: 97, // 100 + 12 - 10 - 5 = 97
          objectiveBreakdown: [{ points: 100 }],
          timeRemainingSeconds: 60,
        });
      });
    });

    describe('edge cases', () => {
      it('should handle very large point values', () => {
        const objectives = [createObjectiveState(999999)];
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(999999);
        expect(result.totalScore).toBe(999999);
      });

      it('should handle decimal time remaining (floored)', () => {
        const result = ScoreCalculator.calculate([], 17.9, 0, 0);
        expect(result.timeBonus).toBe(3); // Math.floor(17.9 / 5) = 3
      });

      it('should handle many objectives', () => {
        const objectives = Array.from({ length: 100 }, () => createObjectiveState(10));
        const result = ScoreCalculator.calculate(objectives, 0, 0, 0);
        expect(result.basePoints).toBe(1000);
        expect(result.objectiveBreakdown).toHaveLength(100);
      });
    });
  });
});
