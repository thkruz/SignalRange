import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events, TimeSkipEndedData, TimeSkipStartedData } from '../../src/events/events';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { addSkippedTime, getSkippedMs, missionNowMs, resetMissionClock } from '../../src/simulation/mission-clock';
import { getSimulatedNowMs } from '../../src/simulation/sim-time';
import { TimeSkipController } from '../../src/simulation/time-skip-controller';

/**
 * The controller reads the scenario's satellites off SimulationManager. Building
 * a real one would drag in ground stations, equipment and the RF chain, so the
 * satellites are real (SGP4 prediction has to be genuine for the target to mean
 * anything) but the manager around them is not.
 */
const mockSatellites: unknown[] = [];

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    getInstance: () => ({ satellites: mockSatellites }),
  },
}));

let mockSettings: Record<string, unknown> = {};

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ settings: mockSettings }),
  },
}));

import { meridianSar1Satellite, meridianSar2Satellite } from '../../src/campaigns/nats-eu/satellites';

/** Scenario 7's clock start: 2027-03-15 14:00:00 UTC. */
const SCENARIO_START_TIME = '14:00:00';
const SCENARIO_START_DATE = '2027-03-15';

describe('TimeSkipController', () => {
  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    TimeSkipController.destroy();
    resetMissionClock();

    mockSatellites.length = 0;
    mockSatellites.push(meridianSar1Satellite, meridianSar2Satellite);

    mockSettings = {
      contactTimeline: { minElevation: 5 },
      timeSkip: { leadTimeS: 120, minSkipS: 60, horizonHours: 4 },
    };

    EventBus.getInstance();
    OpsLogManager.initialize(SCENARIO_START_TIME, SCENARIO_START_DATE);
    // The scenario clock boots paused and is resumed once the brief is closed.
    OpsLogManager.getInstance().resume();
  });

  afterEach(() => {
    TimeSkipController.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
    resetMissionClock();
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('should read the scenario opt-in block', () => {
      const controller = TimeSkipController.getInstance();

      expect(controller.leadTimeS).toBe(120);
      expect(controller.minSkipS).toBe(60);
    });

    it('should fall back to defaults when the scenario declares an empty block', () => {
      mockSettings = { timeSkip: {} };

      const controller = TimeSkipController.getInstance();

      expect(controller.leadTimeS).toBe(120);
      expect(controller.animationMs).toBe(2500);
      expect(controller.minSkipS).toBe(300);
    });
  });

  describe('findTarget', () => {
    it('should aim at the next AOS, stopping short by the lead time', () => {
      const target = TimeSkipController.getInstance().findTarget();

      expect(target).not.toBeNull();
      expect(target!.satelliteName).toBe('MERIDIAN-SAR-1');
      expect(target!.aosMs).toBeGreaterThan(getSimulatedNowMs());
      // Lands exactly leadTimeS before AOS.
      expect(target!.aosMs - target!.targetMs).toBe(120_000);
      expect(target!.deltaMs).toBe(target!.targetMs - getSimulatedNowMs());
    });

    it('should not offer a skip shorter than minSkipS', () => {
      // SAR-1 rises a couple of minutes into the shift, so a one-hour floor
      // rules its pass out as "not worth skipping".
      mockSettings = {
        contactTimeline: { minElevation: 5 },
        timeSkip: { leadTimeS: 120, minSkipS: 3600, horizonHours: 4 },
      };

      expect(TimeSkipController.getInstance().findTarget()).toBeNull();
    });

    it('should return null when the scenario has no orbital satellites', () => {
      mockSatellites.length = 0;

      expect(TimeSkipController.getInstance().findTarget()).toBeNull();
    });

    it('should never offer to skip over the next pass once its lead-in has started', () => {
      const controller = TimeSkipController.getInstance();
      const first = controller.findTarget()!;

      // Move the clock to just inside SAR-1's lead-in window - i.e. where a
      // completed skip leaves the operator.
      OpsLogManager.getInstance().advanceClock(first.deltaMs + 30_000);

      // The contact is minutes away. Offering the pass after it would let the
      // operator skip straight over the one they came here to work.
      expect(controller.findTarget()).toBeNull();
    });
  });

  describe('getBlockedReason', () => {
    it('should allow a skip during dead sky', () => {
      expect(TimeSkipController.getInstance().getBlockedReason()).toBeNull();
    });

    it('should block while a satellite is in view', () => {
      vi.spyOn(meridianSar1Satellite, 'isAboveHorizon', 'get').mockReturnValue(true);

      expect(TimeSkipController.getInstance().getBlockedReason())
        .toBe('MERIDIAN-SAR-1 is in view - work the pass');
    });

    it('should block while the scenario clock is paused', () => {
      OpsLogManager.getInstance().pause();

      expect(TimeSkipController.getInstance().getBlockedReason()).toBe('Scenario clock is paused');
    });
  });

  describe('fast-forward', () => {
    it('should advance the scenario clock to the target across the animation', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      expect(controller.start(target)).toBe(true);
      expect(controller.isSkipping).toBe(true);

      // Halfway through the animation the clock is partway there, not there yet.
      controller.step(controller.animationMs / 2);
      expect(getSimulatedNowMs()).toBeGreaterThan(target.targetMs - target.deltaMs);
      expect(getSimulatedNowMs()).toBeLessThan(target.targetMs);

      controller.step(controller.animationMs);

      expect(controller.isSkipping).toBe(false);
      expect(getSimulatedNowMs()).toBeCloseTo(target.targetMs, -1);
    });

    it('should advance the mission clock by the same amount as the scenario clock', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      controller.start(target);
      controller.step(controller.animationMs);

      // The two clocks moving together is the whole point: elapsed-keyed
      // mechanics (command windows, maneuvers) must not fall behind the sky.
      expect(getSkippedMs()).toBeCloseTo(target.deltaMs, -1);
    });

    it('should emit start, progress and end events', () => {
      const started = vi.fn();
      const progress = vi.fn();
      const ended = vi.fn();

      EventBus.getInstance().on(Events.TIME_SKIP_STARTED, started);
      EventBus.getInstance().on(Events.TIME_SKIP_PROGRESS, progress);
      EventBus.getInstance().on(Events.TIME_SKIP_ENDED, ended);

      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      controller.start(target);
      controller.step(controller.animationMs / 4);
      controller.step(controller.animationMs / 2);
      controller.step(controller.animationMs);

      expect((started.mock.calls[0][0] as TimeSkipStartedData).satelliteName).toBe('MERIDIAN-SAR-1');
      // Several progress emissions, not one jump - the clock has to be seen
      // running, and conditions have to be evaluated along the way.
      expect(progress.mock.calls.length).toBeGreaterThan(2);
      expect((ended.mock.calls[0][0] as TimeSkipEndedData).isCompleted).toBe(true);
    });

    it('should abort when the scenario clock pauses mid-skip', () => {
      const ended = vi.fn();

      EventBus.getInstance().on(Events.TIME_SKIP_ENDED, ended);

      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      controller.start(target);
      controller.step(controller.animationMs / 2);

      // An objective failing mid-skip stops the clock.
      OpsLogManager.getInstance().pause();
      controller.step(controller.animationMs);

      expect(controller.isSkipping).toBe(false);
      expect((ended.mock.calls[0][0] as TimeSkipEndedData).isCompleted).toBe(false);
      expect(getSimulatedNowMs()).toBeLessThan(target.targetMs);
    });

    it('should refuse to start while blocked', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      OpsLogManager.getInstance().pause();

      expect(controller.start(target)).toBe(false);
      expect(controller.isSkipping).toBe(false);
    });

    it('should refuse to start a second skip while one is running', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      controller.start(target);

      expect(controller.start(target)).toBe(false);
    });
  });
});

describe('mission-clock', () => {
  beforeEach(() => {
    resetMissionClock();
  });

  afterEach(() => {
    resetMissionClock();
  });

  it('should equal wall-clock time before any skip', () => {
    expect(missionNowMs()).toBeCloseTo(Date.now(), -1);
    expect(getSkippedMs()).toBe(0);
  });

  it('should run ahead of wall-clock time by the skipped amount', () => {
    const before = missionNowMs();

    addSkippedTime(600_000);

    expect(getSkippedMs()).toBe(600_000);
    expect(missionNowMs() - before).toBeGreaterThanOrEqual(600_000);
  });

  it('should accumulate across several skips', () => {
    addSkippedTime(60_000);
    addSkippedTime(30_000);

    expect(getSkippedMs()).toBe(90_000);
  });

  it('should ignore non-positive and non-finite deltas', () => {
    addSkippedTime(0);
    addSkippedTime(-1000);
    addSkippedTime(NaN);

    expect(getSkippedMs()).toBe(0);
  });

  it('should reset, so the next scenario does not inherit skipped time', () => {
    addSkippedTime(600_000);
    resetMissionClock();

    expect(getSkippedMs()).toBe(0);
  });
});
