import { vi } from 'vitest';
import { scenario17Data } from '../../src/campaigns/nats/scenario17';
import { EventBus } from '../../src/events/event-bus';
import type { ObjectiveState } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { resetMissionClock } from '../../src/simulation/mission-clock';
import { WeatherManager } from '../../src/weather/weather-manager';
import { advanceSimTime } from '../helpers/sim-time';

/**
 * A player stuck in S17 before the sun transit was anchored to 'observe-onset'
 * must recover on the fixed build by reloading, with no reset. Their checkpoint
 * (saved when 'notify-customer-quiz' completed) holds objective states only,
 * never weather, so the anchor has to pick the restored objective up.
 *
 * The saved states below follow the one stuck production save (2026-09-25,
 * engine 1.1.0): eight objectives complete, 'observe-onset' active with its
 * full 360 s, 1742 s of scenario time, wall-clock timestamps from before the
 * sim clock, and the old quiz copy in the stored objective.
 */

const vt01Antenna = {
  state: { uuid: 'vt01-ant', isHeaterEnabled: false, iceAccumulation_dB: 0, skyNoiseDegradation_dB: 0, rainRate_mmh: 0 },
  updateSkyNoiseDegradation: (dB: number) => {
    vt01Antenna.state.skyNoiseDegradation_dB = dB;
  },
  updateIceAccumulation: (dB: number) => {
    vt01Antenna.state.iceAccumulation_dB = dB;
  },
  updateRainRate: (mmh: number) => {
    vt01Antenna.state.rainRate_mmh = mmh;
  },
};
const vt01 = { state: { id: 'VT-01' }, antennas: [vt01Antenna], receivers: [], transmitters: [], rfFrontEnds: [], spectrumAnalyzers: [] };
const simulationManager = {
  groundStations: [vt01],
  satellites: [],
  get objectivesManager() {
    return ObjectivesManager.getInstance();
  },
};

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => simulationManager },
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: scenario17Data.settings, data: scenario17Data }) },
}));

vi.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: { getInstance: () => ({ hasQuiz: () => false, isQuizComplete: () => false, registerQuiz: () => undefined }) },
}));

const COMPLETED_BEFORE_ONSET = [
  'review-mission-brief',
  'select-vermont-station',
  'baseline-dashboard',
  'transit-geometry-quiz',
  'transit-predictability-quiz',
  'baseline-rx-check',
  'why-not-handover-quiz',
  'notify-customer-quiz',
];

/** Objective states as the pre-fix build saved them for the stuck player */
function stuckPreFixSave(): ObjectiveState[] {
  const wallClockBase = 1_790_325_885_062;

  return scenario17Data.objectives.map((objective, i) => {
    const isCompleted = COMPLETED_BEFORE_ONSET.includes(objective.id);
    const isOnset = objective.id === 'observe-onset';
    const stamp = wallClockBase + i * 10_000;
    const saved =
      objective.id === 'review-mission-brief'
        ? {
            ...objective,
            conditions: objective.conditions.map((c) =>
              c.type === 'status-check' ? { ...c, params: { ...c.params, question: 'Transit window opens five minutes into the shift. Ready?' } } : c
            ),
          }
        : objective;

    return {
      objective: saved,
      isActive: isCompleted || isOnset,
      activatedAt: isCompleted || isOnset ? stamp : undefined,
      isCompleted,
      completedAt: isCompleted ? stamp + 5_000 : undefined,
      isFailed: false,
      isTimerRunning: isOnset,
      timeRemainingSeconds: objective.timeLimitSeconds,
      timePenaltyApplied: false,
      timePenaltyPoints: 0,
      conditionStates: saved.conditions.map((condition) => ({
        condition,
        isSatisfied: isCompleted,
        satisfiedAt: isCompleted ? stamp + 4_000 : undefined,
        lostTimestamps: [],
        maintainedDuration: 0,
        isMaintenanceComplete: isCompleted,
      })),
    } as ObjectiveState;
  });
}

const onsetState = () =>
  ObjectivesManager.getInstance()
    .getObjectiveStates()
    .find((s) => s.objective.id === 'observe-onset');

describe('nats S17: a checkpoint saved while stuck before the transit fix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    WeatherManager.destroy();
    resetMissionClock();
    vt01Antenna.state.skyNoiseDegradation_dB = 0;
    (window as unknown as { signalRange?: unknown }).signalRange = { simulationManager };
  });

  afterEach(() => {
    WeatherManager.destroy();
    ObjectivesManager.destroy();
    EventBus.destroy();
    resetMissionClock();
    delete (window as unknown as { signalRange?: unknown }).signalRange;
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('restores into a winnable run: the transit arrives and Sky Noise Rising ticks before the objective times out', () => {
    ObjectivesManager.initialize(scenario17Data.objectives, scenario17Data.timeLimitSeconds);
    WeatherManager.getInstance();

    ObjectivesManager.getInstance().restoreState(stuckPreFixSave(), 1742);

    const restored = onsetState();
    expect(restored?.isActive).toBe(true);
    expect(restored?.isCompleted).toBe(false);
    expect(restored?.conditionStates[0].isSatisfied).toBe(false);

    // Stepping second by second: the transit starts 20 s after the restored
    // anchor is seen and passes 2 dB about 60 s later
    let tickedAt = -1;
    for (let s = 1; s <= 300 && tickedAt < 0; s++) {
      advanceSimTime(1000, { emitUpdate: true });
      if (onsetState()?.conditionStates[0].isSatisfied) {
        tickedAt = s;
      }
    }

    expect(tickedAt).toBeGreaterThan(0);
    expect(tickedAt).toBeLessThan(120);
    expect(vt01Antenna.state.skyNoiseDegradation_dB).toBeGreaterThan(2);

    const after = onsetState();
    expect(after?.isFailed).toBe(false);
    expect(after?.timeRemainingSeconds).toBeGreaterThan(360 - 120);
    expect(ObjectivesManager.getInstance().getScenarioTimeRemaining()).toBeGreaterThan(1742 - 120);
  });

  it('still reaches the >6 dB peak that ride-through-peak waits on', () => {
    ObjectivesManager.initialize(scenario17Data.objectives, scenario17Data.timeLimitSeconds);
    WeatherManager.getInstance();
    ObjectivesManager.getInstance().restoreState(stuckPreFixSave(), 1742);

    let peak = 0;
    for (let s = 1; s <= 330; s++) {
      advanceSimTime(1000, { emitUpdate: true });
      peak = Math.max(peak, vt01Antenna.state.skyNoiseDegradation_dB);
    }

    expect(peak).toBeGreaterThan(6);
    // ...and has cleared again, so verify-recovery's <1 dB can tick
    expect(vt01Antenna.state.skyNoiseDegradation_dB).toBeLessThan(1);
  });
});
