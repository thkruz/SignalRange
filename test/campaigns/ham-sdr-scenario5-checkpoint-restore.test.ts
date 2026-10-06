import { vi } from 'vitest';
import { hamSdrScenario5Data } from '../../src/campaigns/ham-sdr/scenario5';
import { EventBus } from '../../src/events/event-bus';
import { GnssThreatManager } from '../../src/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '../../src/interference/interference-manager';
import type { ObjectiveState } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { resetMissionClock } from '../../src/simulation/mission-clock';
import { advanceSimTime } from '../helpers/sim-time';

/**
 * The one production checkpoint in a scenario phase 19.0a re-anchored
 * (Supabase read, 2026-09-27): ham-sdr S5 saved with 'spot-the-spoofer'
 * active. Before the anchor the spoofer ran at fixed 420..900 s, so a player
 * who reached the objective after 900 s had nothing left to find. The save
 * holds objective states only, never events, so the spoof and its carrier
 * must come up from the restored objective, however late the clock is.
 */

const simulationManager = {
  groundStations: [],
  satellites: [],
  get objectivesManager() {
    return ObjectivesManager.getInstance();
  },
};

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => simulationManager },
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: hamSdrScenario5Data.settings, data: hamSdrScenario5Data }) },
}));

vi.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: { getInstance: () => ({ hasQuiz: () => false, isQuizComplete: () => false, registerQuiz: () => undefined }) },
}));

const COMPLETED = ['review-mission-brief', 'find-the-hump'];

/** Objective states shaped like the production save */
function savedAtTheSpoofer(): ObjectiveState[] {
  return hamSdrScenario5Data.objectives.map((objective) => {
    const isCompleted = COMPLETED.includes(objective.id);
    const isActive = isCompleted || objective.id === 'spot-the-spoofer';

    return {
      objective,
      isActive,
      isCompleted,
      isFailed: false,
      isTimerRunning: false,
      timeRemainingSeconds: objective.timeLimitSeconds,
      conditionStates: objective.conditions.map((condition) => ({
        condition,
        isSatisfied: isCompleted,
        lostTimestamps: [],
        maintainedDuration: 0,
        isMaintenanceComplete: isCompleted,
      })),
    } as ObjectiveState;
  });
}

describe('ham-sdr S5: the checkpoint saved at spot-the-spoofer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    InterferenceManager.destroy();
    GnssThreatManager.destroy();
    resetMissionClock();
  });

  afterEach(() => {
    InterferenceManager.destroy();
    GnssThreatManager.destroy();
    ObjectivesManager.destroy();
    EventBus.destroy();
    resetMissionClock();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('brings the spoofer up after restore, even with the clock past the old 900 s end', () => {
    ObjectivesManager.initialize(hamSdrScenario5Data.objectives, hamSdrScenario5Data.timeLimitSeconds);
    const interference = InterferenceManager.getInstance();
    const gnss = GnssThreatManager.getInstance();

    // Only the brief is up while the clock runs past the old window
    for (let s = 0; s < 1000; s++) advanceSimTime(1000, { emitUpdate: true });
    expect(interference.isEventInEnvelope('l1-spoofer')).toBe(false);

    ObjectivesManager.getInstance().restoreState(savedAtTheSpoofer());

    let onAt = -1;
    for (let s = 1; s <= 60 && onAt < 0; s++) {
      advanceSimTime(1000, { emitUpdate: true });
      if (interference.isEventInEnvelope('l1-spoofer') && gnss.state.spoofActive) onAt = s;
    }

    expect(onAt).toBeGreaterThan(0);
    expect(onAt).toBeLessThanOrEqual(15);

    // It stays up for its authored 480 s, long enough to find, read and defend against
    for (let s = 0; s < 400; s++) advanceSimTime(1000, { emitUpdate: true });
    expect(interference.isEventInEnvelope('l1-spoofer')).toBe(true);
    expect(gnss.state.spoofActive).toBe(true);
  });
});
