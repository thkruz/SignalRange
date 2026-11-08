import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events, TimeSkipEndedData, TimeSkipStartedData } from '../../src/events/events';
import type { TimeSkipOffer } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { assetSelectionState } from '../../src/pages/mission-control/asset-selection-state';
import { PassPlannerService } from '../../src/services/pass-planner-service';
import { getSkippedMs, missionNowMs, resetMissionClock } from '../../src/simulation/mission-clock';
import { SimClock } from '../../src/simulation/sim-clock';
import { getSimulatedNowMs } from '../../src/simulation/sim-time';
import { TimeSkipController } from '../../src/simulation/time-skip-controller';

/**
 * The controller reads the scenario's satellites off SimulationManager. Building
 * a real one would drag in ground stations, equipment and the RF chain, so the
 * satellites are real (SGP4 prediction has to be genuine for the target to mean
 * anything) but the manager around them is not.
 */
const mockSatellites: unknown[] = [];
const mockGroundStations: unknown[] = [];

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    getInstance: () => ({ satellites: mockSatellites, groundStations: mockGroundStations }),
  },
}));

let mockSettings: Record<string, unknown> = {};

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ settings: mockSettings }),
  },
}));

import { meridianSar1Satellite, meridianSar2Satellite } from '../../src/campaigns/nats-eu/satellites';

/** Scenario 7's clock start, moved 10 min earlier so the lead-in clears the receivable-horizon AOS: 2027-03-15 13:50:00 UTC. */
const SCENARIO_START_TIME = '13:50:00';
const SCENARIO_START_DATE = '2027-03-15';

describe('TimeSkipController', () => {
  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    TimeSkipController.destroy();
    resetMissionClock();

    mockSatellites.length = 0;
    mockSatellites.push(meridianSar1Satellite, meridianSar2Satellite);
    mockGroundStations.length = 0;
    assetSelectionState.groundStationId = null;

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

    it('should aim at the selected station pass, not the earliest across stations', () => {
      // Galway (53.3 N) and Shetland (60.2 N) see the same bird at different times.
      mockGroundStations.push(
        { state: { id: 'GW-01', name: 'Galway', location: { latitude: 53.27, longitude: -9.05, elevation: 0 } } },
        { state: { id: 'SH-02', name: 'Shetland', location: { latitude: 60.15, longitude: -1.15, elevation: 0 } } }
      );
      const controller = TimeSkipController.getInstance();

      assetSelectionState.groundStationId = 'GW-01';
      const galway = controller.findTarget()!;
      assetSelectionState.groundStationId = 'SH-02';
      const shetland = controller.findTarget()!;
      assetSelectionState.groundStationId = null;
      const earliest = controller.findTarget()!;

      expect(galway.aosMs).not.toBe(shetland.aosMs);
      expect(earliest.aosMs).toBe(Math.min(galway.aosMs, shetland.aosMs));
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

  describe('stale targets (D6)', () => {
    it('should land at targetMs even when start() runs long after findTarget()', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      // The bar cached the target and the modal sat open for 40 s
      OpsLogManager.getInstance().advanceClock(40_000);

      expect(controller.start(target)).toBe(true);
      controller.step(controller.animationMs);

      expect(Math.abs(getSimulatedNowMs() - target.targetMs)).toBeLessThanOrEqual(1000);
    });

    it('should refuse a target whose wait has fallen below the minimum', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      OpsLogManager.getInstance().advanceClock(target.deltaMs - 30_000);

      expect(controller.start(target)).toBe(false);
    });

    it('should report a contact that is too close to skip instead of none', () => {
      const controller = TimeSkipController.getInstance();
      const target = controller.findTarget()!;

      OpsLogManager.getInstance().advanceClock(target.deltaMs - 30_000);

      expect(controller.findTarget()).toBeNull();
      const tooClose = controller.findTooCloseContact();
      expect(tooClose?.satelliteName).toBe('MERIDIAN-SAR-1');
      expect(tooClose!.untilAosMs).toBeGreaterThan(0);
    });
  });

  describe('missed-pass recovery (D4)', () => {
    function stubObjective(noradId: number, activatedAt: number): void {
      const state = {
        isActive: true,
        isCompleted: false,
        isFailed: false,
        activatedAt,
        objective: { id: 'OBJ-LOCK', conditions: [{ type: 'antenna-locked', description: 'lock', params: { noradId } }] },
      };
      vi.spyOn(ObjectivesManager, 'hasInstance').mockReturnValue(true);
      vi.spyOn(ObjectivesManager, 'getInstance').mockReturnValue({
        getObjectiveStates: () => [state],
        hasRunningObjectiveTimer: () => false,
      } as unknown as ObjectivesManager);
    }

    it('should offer the next pass once the objective satellite has set unworked', () => {
      const controller = TimeSkipController.getInstance();
      const startMs = getSimulatedNowMs();
      stubObjective(meridianSar1Satellite.noradId, startMs);

      // Before the pass: nothing is missed yet
      expect(controller.findRecoveryTarget()).toBeNull();

      // Past SAR-1's first pass
      const firstPass = new PassPlannerService().getPasses(meridianSar1Satellite, startMs, { horizonHours: 2, aosElevation: 'receivable' })[0];
      OpsLogManager.getInstance().advanceClock(firstPass.losMs - startMs + 60_000);

      const recovery = controller.findRecoveryTarget();
      expect(recovery).not.toBeNull();
      expect(recovery!.noradId).toBe(meridianSar1Satellite.noradId);
      expect(recovery!.aosMs).toBeGreaterThan(getSimulatedNowMs());
      expect(recovery!.recovery?.objectiveId).toBe('OBJ-LOCK');
    });
  });

  describe('getBlockedReason', () => {
    it('should allow a skip during dead sky', () => {
      expect(TimeSkipController.getInstance().getBlockedReason()).toBeNull();
    });

    it('should block while a satellite is in view', () => {
      vi.spyOn(meridianSar1Satellite, 'isAboveHorizon', 'get').mockReturnValue(true);

      expect(TimeSkipController.getInstance().getBlockedReason()).toBe('MERIDIAN-SAR-1 is in view - work the pass');
    });

    it('should block while the scenario clock is paused', () => {
      OpsLogManager.getInstance().pause();

      expect(TimeSkipController.getInstance().getBlockedReason()).toBe('Scenario clock is paused');
    });
  });

  describe('fast-forward', () => {
    it('stops a skip when a menu opens without spending any more mission time', () => {
      const controller = TimeSkipController.getInstance();
      expect(controller.start(controller.findTarget()!)).toBe(true);
      controller.step(controller.animationMs / 4);
      const pausedAt = missionNowMs();
      SimClock.pause('menu');
      expect(controller.step(controller.animationMs)).toBe(false);
      expect(missionNowMs()).toBe(pausedAt);
      SimClock.resume('menu');
      expect(controller.isSkipping).toBe(false);
    });
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

  describe('objective skip (Phase 27 Q4)', () => {
    let offer: TimeSkipOffer | null;
    let otherTimerRunning: boolean;
    let isObjectiveOpen: boolean;
    const objectives = {
      getAvailableTimeSkip: vi.fn(() => offer),
      markTimeSkipUsed: vi.fn(() => {
        offer = null;
      }),
      hasRunningObjectiveTimer: vi.fn(() => otherTimerRunning),
      applyTimeSkip: vi.fn(),
      getObjectiveState: vi.fn(() => ({ isActive: true, isCompleted: !isObjectiveOpen, isFailed: false })),
    };

    beforeEach(() => {
      // Phase 28 D1: the offer covers the rest of the hold
      offer = { objectiveId: 'ride-out-rain', deltaMs: 20 * 60_000, landsAtMs: null, label: 'rain cell' };
      otherTimerRunning = false;
      isObjectiveOpen = true;
      objectives.applyTimeSkip.mockClear();
      vi.spyOn(ObjectivesManager, 'hasInstance').mockReturnValue(true);
      vi.spyOn(ObjectivesManager, 'getInstance').mockReturnValue(objectives as unknown as ObjectivesManager);
    });

    it('advances scenario AND run time by the objective wait, exempting its own countdown', () => {
      const controller = TimeSkipController.getInstance();
      const scenarioBefore = missionNowMs();
      const runBefore = SimClock.runMs();
      let fired = -1;
      SimClock.setTimeout(() => {
        fired = SimClock.runMs();
      }, 10 * 60_000);

      expect(controller.findObjectiveSkip()).toEqual(offer);
      expect(controller.startObjectiveSkip()).toBe(true);
      expect(objectives.markTimeSkipUsed).toHaveBeenCalledWith('ride-out-rain');

      controller.step(controller.animationMs);

      expect(missionNowMs() - scenarioBefore).toBeCloseTo(20 * 60_000, 0);
      expect(SimClock.runMs() - runBefore).toBeCloseTo(20 * 60_000, 0);
      // A sim timer due inside the wait fired at its own due moment
      expect(fired).toBeCloseTo(runBefore + 10 * 60_000, 0);
      expect(objectives.applyTimeSkip).toHaveBeenCalledWith(expect.any(Number), 'ride-out-rain');
      expect(controller.isSkipping).toBe(false);
    });

    it('logs the wait in the Ops Log', () => {
      const controller = TimeSkipController.getInstance();
      controller.startObjectiveSkip();
      controller.step(controller.animationMs);

      const entries = OpsLogManager.getInstance().getEntries();
      expect(entries.some((e) => e.message.includes('Waited out the rain cell') && e.message.includes('20 min'))).toBe(true);
    });

    it('carries the wait label on TIME_SKIP_STARTED', () => {
      const started = vi.fn();
      EventBus.getInstance().on(Events.TIME_SKIP_STARTED, started);
      TimeSkipController.getInstance().startObjectiveSkip();

      expect(started).toHaveBeenCalledWith(expect.objectContaining({ label: 'rain cell', totalMs: 20 * 60_000 }));
    });

    it('is blocked while another objective is being timed, and never offered twice', () => {
      const controller = TimeSkipController.getInstance();
      otherTimerRunning = true;
      expect(controller.getObjectiveSkipBlockedReason('ride-out-rain')).toBe('Another timed objective is running');
      expect(controller.startObjectiveSkip()).toBe(false);

      otherTimerRunning = false;
      expect(controller.startObjectiveSkip()).toBe(true);
      controller.step(controller.animationMs);
      expect(controller.findObjectiveSkip()).toBeNull();
    });

    it('stops as soon as the objective completes, so the next step pays nothing (nats-r3-s10-F1)', () => {
      const controller = TimeSkipController.getInstance();
      const scenarioBefore = missionNowMs();
      controller.startObjectiveSkip();

      controller.step(controller.animationMs / 2);
      const halfway = missionNowMs() - scenarioBefore;
      expect(halfway).toBeCloseTo(10 * 60_000, 0);

      // The hold ended during the animation; the next frame must not advance
      isObjectiveOpen = false;
      const calls = objectives.applyTimeSkip.mock.calls.length;
      expect(controller.step(controller.animationMs)).toBe(false);
      expect(missionNowMs() - scenarioBefore).toBeCloseTo(halfway, 0);
      expect(objectives.applyTimeSkip.mock.calls.length).toBe(calls);
      expect(controller.isSkipping).toBe(false);
    });

    it('does not move run time for a pass skip', () => {
      vi.mocked(ObjectivesManager.hasInstance).mockReturnValue(false);
      const controller = TimeSkipController.getInstance();
      const runBefore = SimClock.runMs();
      controller.start(controller.findTarget()!);
      controller.step(controller.animationMs);

      expect(SimClock.runMs()).toBe(runBefore);
    });
  });
});
