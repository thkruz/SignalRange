/**
 * Phase 27 (2.B, Q1, Q4) objective semantics: requiresChange (B1), timed holds
 * that accrue only while watching (B3), the hidden-tab hint (B5), quizzes
 * after the doing (B7), must-hold-at-completion (B8), countdowns that time the
 * doing only (Q1), the objective time skip and weather-event-ended (Q4).
 */
import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { resolveRequiresChange } from '../../src/objectives/condition-semantics';
import type { Condition, Objective } from '../../src/objectives/objective-types';
import { TAB_HINT_DELAY_SECONDS } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';
import { TabbedCanvas } from '../../src/pages/mission-control/tabbed-canvas';
import { EventTimeLedger } from '../../src/scenarios/event-time-ledger';
import { resetMissionClock } from '../../src/simulation/mission-clock';
import { SimClock } from '../../src/simulation/sim-clock';
import { advanceSimTime } from '../helpers/sim-time';

const station = vi.hoisted(() => ({
  heaterEnabled: false,
  trackingMode: 'program-track' as string,
  snr: 12 as number | null,
  hpaEnabled: false,
  locked: true,
}));

const analyzer = vi.hoisted(() => ({ state: { span: 100e6, centerFrequency: 1458e6 } }));

const quizzes = vi.hoisted(() => ({
  registered: new Set<string>(),
  complete: new Set<string>(),
}));

const weather = vi.hoisted(() => ({ ended: new Set<string>(), untilEndS: new Map<string, number>(), untilPeakS: new Map<string, number>() }));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: [
        {
          state: { id: 'gs-1' },
          antennas: [
            {
              state: {
                get isHeaterEnabled() {
                  return station.heaterEnabled;
                },
                get trackingMode() {
                  return station.trackingMode;
                },
                isStepTrackEnabled: false,
              },
            },
          ],
          rfFrontEnds: [
            {
              hpaModule: {
                state: {
                  isPowered: true,
                  get isHpaEnabled() {
                    return station.hpaEnabled;
                  },
                },
              },
            },
          ],
          spectrumAnalyzers: [analyzer],
          receivers: [
            {
              state: { activeModem: 1, modems: [{ modemNumber: 1, isPowered: true }] },
              getSnrForModem: () => station.snr,
              getSignalsInBandwidth: () => ({ hasLock: station.locked }),
            },
          ],
          transmitters: [],
        },
      ],
      satellites: [],
      getSatByNoradId: () => null,
    }),
  },
}));

vi.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: () => ({
      hasQuiz: (id: string, i: number) => quizzes.registered.has(`${id}:${i}`),
      isQuizComplete: (id: string, i: number) => quizzes.complete.has(`${id}:${i}`),
      registerQuiz: (id: string, i: number) => {
        quizzes.registered.add(`${id}:${i}`);
      },
    }),
  },
}));

vi.mock('../../src/weather/weather-manager', () => ({
  WeatherManager: {
    hasInstance: () => true,
    getInstance: () => ({
      hasEventEnded: (id: string) => weather.ended.has(id),
      getSecondsUntilEventEnds: (id: string) => weather.untilEndS.get(id) ?? null,
      getSecondsUntilEventPeaks: (id: string, past = 0) => (weather.untilPeakS.has(id) ? Math.max(0, weather.untilPeakS.get(id)! + past) : null),
      getAllWeatherEvents: () => [{ id: 'sun', linkMarginDegradation: 6.4 }],
      hasEventPeaked: (id: string, past = 0) => weather.untilPeakS.has(id) && weather.untilPeakS.get(id)! + past <= 0,
    }),
  },
}));

const quiz = (description = 'Quiz', extra: Record<string, unknown> = {}): Condition => ({
  type: 'status-check',
  description,
  mustMaintain: false,
  params: { question: 'Q?', options: ['a', 'b'], correctIndex: 0, ...extra },
});

const objective = (id: string, conditions: Condition[], extra: Partial<Objective> = {}): Objective => ({
  id,
  title: id,
  description: id,
  groundStation: 'gs-1',
  conditions,
  ...extra,
});

const tick = (): void => {
  EventBus.getInstance().emit(Events.UPDATE, 16);
};

const stateOf = (id: string) => ObjectivesManager.getInstance().getObjectiveState(id)!;

describe('Phase 27 objective semantics', () => {
  let activeTab: string | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    resetMissionClock();
    station.heaterEnabled = false;
    station.trackingMode = 'program-track';
    station.snr = 12;
    station.hpaEnabled = false;
    station.locked = true;
    weather.untilPeakS.clear();
    quizzes.registered.clear();
    quizzes.complete.clear();
    weather.ended.clear();
    weather.untilEndS.clear();
    analyzer.state.span = 100e6;
    activeTab = null;
    vi.spyOn(TabbedCanvas, 'getActiveTab').mockImplementation(() => activeTab);
  });

  afterEach(() => {
    ObjectivesManager.destroy();
    EventBus.destroy();
    resetMissionClock();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('B1 requiresChange', () => {
    const heaterRow: Condition = { type: 'feed-heater-enabled', description: 'Heater On', mustMaintain: false };

    it('does not tick a set-type row the start state already satisfies', () => {
      station.heaterEnabled = true;
      ObjectivesManager.initialize([objective('heater', [heaterRow])]);

      tick();
      tick();
      expect(stateOf('heater').isCompleted).toBe(false);

      // The player toggles it off and on again: now it counts
      station.heaterEnabled = false;
      tick();
      station.heaterEnabled = true;
      tick();
      expect(stateOf('heater').isCompleted).toBe(true);
    });

    it('counts a value change that stays on target (watched value moved)', () => {
      station.trackingMode = 'program-track';
      const row: Condition = { type: 'antenna-tracking-mode-set', description: 'Program track', mustMaintain: false, params: { trackingMode: 'program-track' } };
      ObjectivesManager.initialize([objective('mode', [row])]);
      tick();
      expect(stateOf('mode').isCompleted).toBe(false);

      // Switching away arms it; switching back completes
      station.trackingMode = 'manual';
      tick();
      station.trackingMode = 'program-track';
      tick();
      expect(stateOf('mode').isCompleted).toBe(true);
    });

    it('ticks a set-type row false at activation as soon as the player sets it', () => {
      ObjectivesManager.initialize([objective('heater', [heaterRow])]);
      tick();
      station.heaterEnabled = true;
      tick();
      expect(stateOf('heater').isCompleted).toBe(true);
    });

    it('honours requiresChange: false', () => {
      station.heaterEnabled = true;
      ObjectivesManager.initialize([objective('heater', [{ ...heaterRow, requiresChange: false }])]);
      tick();
      expect(stateOf('heater').isCompleted).toBe(true);
    });

    it('leaves verify-type rows alone', () => {
      ObjectivesManager.initialize([objective('cn', [{ type: 'receiver-snr-threshold', description: 'C/N', mustMaintain: false, params: { minCNRatio: 10 } }])]);
      tick();
      expect(stateOf('cn').isCompleted).toBe(true);
    });

    it('defaults off for a setting an earlier objective in the chain already asked for', () => {
      const objectives = [
        objective('enable-heater', [heaterRow]),
        objective('still-running', [{ type: 'feed-heater-enabled', description: 'Heater Still Running', mustMaintain: true }], { prerequisiteObjectiveIds: ['enable-heater'] }),
      ];
      const resolved = resolveRequiresChange(objectives);
      expect(resolved.get(objectives[0].conditions[0])).toBe(true);
      expect(resolved.get(objectives[1].conditions[0])).toBe(false);

      ObjectivesManager.initialize(objectives);
      tick();
      station.heaterEnabled = true;
      tick();
      tick();
      expect(stateOf('enable-heater').isCompleted).toBe(true);
      tick();
      expect(stateOf('still-running').isCompleted).toBe(true);
    });

    it('defaults off for an observation-gated row (a reading, not an action)', () => {
      const objectives = [
        objective('read-lo', [
          { type: 'lnb-lo-set', description: 'Read the LNB LO', mustMaintain: false, params: { loFrequency: 13100, requiresObservation: true, observationTab: 'rx-analysis' } },
        ]),
        objective('set-lo', [{ type: 'lnb-lo-set', description: 'Set the LNB LO', mustMaintain: false, params: { loFrequency: 13100 } }]),
      ];
      const resolved = resolveRequiresChange(objectives as never);
      expect(resolved.get(objectives[0].conditions[0])).toBe(false);
      expect(resolved.get(objectives[1].conditions[0])).toBe(true);
    });

    it('arms restored conditions so a reload does not demand the work again', () => {
      station.heaterEnabled = true;
      const objectives = [objective('heater', [heaterRow])];
      ObjectivesManager.initialize(objectives);
      const saved = structuredClone(
        ObjectivesManager.getInstance()
          .getObjectiveStates()
          .map((s) => ({ ...s, conditionStates: s.conditionStates.map((cs) => ({ ...cs, changeArmed: undefined })) }))
      );
      ObjectivesManager.destroy();

      ObjectivesManager.initialize(objectives);
      ObjectivesManager.getInstance().restoreState(saved as never);
      tick();
      expect(stateOf('heater').isCompleted).toBe(true);
    });
  });

  describe('B8 mustMaintain with no duration holds at completion', () => {
    it('a transient true does not complete the row once it drops before the rest are done', () => {
      const objectives = [
        objective('recover', [
          { type: 'receiver-snr-threshold', description: 'C/N >= 9', mustMaintain: true, params: { minCNRatio: 9 } },
          { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false },
        ]),
      ];
      station.snr = 9.5; // a spike
      ObjectivesManager.initialize(objectives);
      tick();
      tick();
      station.snr = 7.5;
      tick();
      station.heaterEnabled = true;
      tick();
      expect(stateOf('recover').isCompleted).toBe(false);
      expect(stateOf('recover').conditionStates[0].isMaintenanceComplete).toBe(false);

      station.snr = 9.5;
      tick();
      expect(stateOf('recover').isCompleted).toBe(true);
    });
  });

  describe('B3 timed holds accrue only while watching', () => {
    it('does not accrue while the tab-active sibling is off', () => {
      ObjectivesManager.initialize([
        objective('watch', [
          { type: 'tab-active', hidden: true, description: 'RX Analysis Open', mustMaintain: true, params: { tab: 'rx-analysis' } },
          { type: 'receiver-snr-threshold', description: 'C/N held', mustMaintain: true, maintainDuration: 5, params: { minCNRatio: 7 } },
        ]),
      ]);

      activeTab = 'dashboard-0';
      advanceSimTime(10_000, { emitUpdate: true });
      expect(stateOf('watch').conditionStates[1].maintainedDuration).toBe(0);
      expect(stateOf('watch').isCompleted).toBe(false);

      activeTab = 'rx-analysis-0';
      advanceSimTime(6000, { emitUpdate: true });
      expect(stateOf('watch').isCompleted).toBe(true);
    });
  });

  describe('B5 hidden tab hint', () => {
    it('names the tab once the hidden row has blocked for the delay', () => {
      // A non-quiz step: a quiz step's tab row is a D5 gate, shown from the start
      station.heaterEnabled = true;
      ObjectivesManager.initialize([
        objective('look', [
          { type: 'tab-active', hidden: true, description: 'Dashboard Open', mustMaintain: true, params: { tab: 'dashboard' } },
          { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false, requiresChange: false },
        ]),
      ]);
      const manager = ObjectivesManager.getInstance();

      advanceSimTime(2000, { emitUpdate: true });
      expect(manager.generateHtmlChecklist()).not.toContain('open the Dashboard tab');

      advanceSimTime((TAB_HINT_DELAY_SECONDS + 1) * 1000, { emitUpdate: true });
      expect(manager.generateHtmlChecklist()).toContain('open the Dashboard tab');

      activeTab = 'dashboard-0';
      tick();
      expect(manager.generateHtmlChecklist()).not.toContain('open the Dashboard tab');
    });
  });

  describe('Phase 29 D5 tab gates on quiz steps (nats-r4-s08-F5, s17-F2)', () => {
    it('shows a hidden gate from the step start as "Open the Dashboard tab"', () => {
      ObjectivesManager.initialize([
        objective('baseline', [{ type: 'tab-active', hidden: true, description: 'Dashboard Open', mustMaintain: true, params: { tab: 'dashboard' } }, quiz('Baseline State')]),
      ]);
      tick();
      const html = ObjectivesManager.getInstance().generateHtmlChecklist();
      expect(html).toContain('Open the Dashboard tab');
      expect(html).not.toContain('Dashboard Open');
      expect(html).not.toContain('to continue)');
    });

    it('latches once the tab is opened, so the step completes when the quiz is answered on another tab', () => {
      ObjectivesManager.initialize([
        objective('verify', [{ type: 'tab-active', description: 'Dashboard Tab Open', mustMaintain: true, params: { tab: 'dashboard' } }, quiz('Link Status')]),
      ]);
      activeTab = 'dashboard';
      tick();
      tick();
      expect(stateOf('verify').conditionStates[0].isMaintenanceComplete).toBe(true);
      expect(quizzes.registered.has('verify:1')).toBe(true);

      activeTab = 'rx-analysis';
      tick();
      expect(stateOf('verify').conditionStates[0].isMaintenanceComplete).toBe(true);
      expect(ObjectivesManager.getInstance().isObjectiveCountdownHeld('verify')).toBe(true);

      quizzes.complete.add('verify:1');
      tick();
      expect(stateOf('verify').isCompleted).toBe(true);
    });

    it('keeps holding a gate that opts in with maintainUntilObjectiveComplete', () => {
      ObjectivesManager.initialize([
        objective('stay', [
          { type: 'tab-active', description: 'Stay on Dashboard', maintainUntilObjectiveComplete: true, mustMaintain: true, params: { tab: 'dashboard' } },
          quiz(),
        ]),
      ]);
      activeTab = 'dashboard';
      tick();
      tick();
      activeTab = 'rx-analysis';
      quizzes.complete.add('stay:1');
      tick();
      expect(stateOf('stay').isCompleted).toBe(false);

      activeTab = 'dashboard';
      tick();
      expect(stateOf('stay').isCompleted).toBe(true);
    });

    it('leaves a non-quiz step tab row holding at completion (B8)', () => {
      ObjectivesManager.initialize([
        objective('act', [
          { type: 'tab-active', description: 'Dashboard', mustMaintain: true, params: { tab: 'dashboard' } },
          { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false },
        ]),
      ]);
      activeTab = 'dashboard';
      tick();
      activeTab = 'rx-analysis';
      station.heaterEnabled = true;
      tick();
      tick();
      expect(stateOf('act').isCompleted).toBe(false);
    });
  });

  describe('Phase 29 D7 analyzer settings tick on the next frame (nats-r4-s20-F1)', () => {
    it('ignores an authored observation dwell on an applied span', () => {
      ObjectivesManager.initialize([
        objective('sweep', [
          {
            type: 'speca-span-set',
            description: 'Span About 50 MHz',
            mustMaintain: true,
            params: { span: 50e6, spanTolerance: 15e6, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 5 },
          },
          { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false },
        ]),
      ]);
      activeTab = 'rx-analysis-0';
      tick();
      expect(stateOf('sweep').conditionStates[0].isSatisfied).toBe(false);

      analyzer.state.span = 50e6;
      tick();
      expect(stateOf('sweep').conditionStates[0].isSatisfied).toBe(true);
      expect(stateOf('sweep').conditionStates[0].observed).toBe(true);
    });
  });

  describe('Phase 29 D10 peak and re-lock (nats-r4-s17-F1)', () => {
    it('weather-event-peaked waits for the peak, not a threshold on the way up', () => {
      weather.untilPeakS.set('sun', 90);
      ObjectivesManager.initialize([
        objective('peak', [{ type: 'weather-event-peaked', description: 'Transit Peak Passed', mustMaintain: false, params: { weatherEventId: 'sun' } }]),
      ]);
      tick();
      expect(stateOf('peak').isCompleted).toBe(false);

      weather.untilPeakS.set('sun', 0);
      tick();
      expect(stateOf('peak').isCompleted).toBe(true);
    });

    it('weather-event-peaked observes the event peak fade so {{val}} can quote it', () => {
      weather.untilPeakS.set('sun', 0);
      ObjectivesManager.initialize([
        objective('peak2', [{ type: 'weather-event-peaked', description: 'Transit Peak Passed', mustMaintain: false, params: { weatherEventId: 'sun' } }]),
      ]);
      tick();
      // Telemetry is off in play; the ledger is fed straight from the evaluator
      expect(EventTimeLedger.getValue('peak2.0')).toBe(6.4);
    });

    it('receiver-relocked needs the lock to drop first, even when the drop came during an earlier step', () => {
      ObjectivesManager.initialize([
        objective('ride', [{ type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false }]),
        objective('recover', [{ type: 'receiver-relocked', description: 'Receiver Re-Locked', mustMaintain: false, params: { lockLostAfterObjectiveId: 'ride' } }], {
          prerequisiteObjectiveIds: ['ride'],
        }),
      ]);
      tick();
      station.locked = false; // the drop, while 'recover' is still locked behind 'ride'
      tick();
      station.locked = true;
      tick();
      station.heaterEnabled = true;
      tick();
      tick();
      expect(stateOf('recover').isActive).toBe(true);
      expect(stateOf('recover').isCompleted).toBe(true);
    });

    it('receiver-relocked does not tick while the lock has never dropped', () => {
      ObjectivesManager.initialize([objective('recover', [{ type: 'receiver-relocked', description: 'Receiver Re-Locked', mustMaintain: false }])]);
      tick();
      tick();
      expect(stateOf('recover').isCompleted).toBe(false);

      station.locked = false;
      tick();
      expect(stateOf('recover').isCompleted).toBe(false);

      station.locked = true;
      tick();
      expect(stateOf('recover').isCompleted).toBe(true);
    });
  });

  describe('B7 quizzes after the doing', () => {
    it('registers a quiz only after the rows authored before it have latched', () => {
      ObjectivesManager.initialize([objective('do-then-ask', [{ type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false }, quiz()])]);
      tick();
      expect(quizzes.registered.has('do-then-ask:1')).toBe(false);

      station.heaterEnabled = true;
      tick();
      tick();
      expect(quizzes.registered.has('do-then-ask:1')).toBe(true);
    });

    it('asks a quiz authored first at once', () => {
      ObjectivesManager.initialize([objective('ask-then-do', [quiz(), { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false }])]);
      tick();
      expect(quizzes.registered.has('ask-then-do:0')).toBe(true);
    });

    it('honours quizAfterConditions true and false', () => {
      ObjectivesManager.initialize([
        objective('all', [quiz('first', { quizAfterConditions: true }), { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false }]),
        objective('none', [{ type: 'hpa-enabled', description: 'HPA', mustMaintain: false }, quiz('now', { quizAfterConditions: false })]),
      ]);
      tick();
      expect(quizzes.registered.has('all:0')).toBe(false);
      expect(quizzes.registered.has('none:1')).toBe(true);
    });
  });

  describe('Q1 countdowns time the doing', () => {
    it('stops an objective countdown once its non-quiz rows are met', () => {
      ObjectivesManager.initialize([objective('timed', [{ type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false }, quiz()], { timeLimitSeconds: 60 })]);
      advanceSimTime(5000, { emitUpdate: true });
      expect(stateOf('timed').timeRemainingSeconds).toBe(55);

      station.heaterEnabled = true;
      advanceSimTime(20_000, { emitUpdate: true });
      expect(stateOf('timed').timeRemainingSeconds).toBe(55);
      expect(ObjectivesManager.getInstance().isObjectiveCountdownHeld('timed')).toBe(true);
      expect(ObjectivesManager.getInstance().hasRunningObjectiveTimer()).toBe(false);
    });

    it('never runs the countdown of a quiz-only objective', () => {
      ObjectivesManager.initialize([objective('read', [quiz()], { timeLimitSeconds: 30 })]);
      advanceSimTime(60_000, { emitUpdate: true });
      expect(stateOf('read').timeRemainingSeconds).toBe(30);
      expect(stateOf('read').timedOut).toBeFalsy();
    });
  });

  describe('Q4 objective time skip', () => {
    it('offers the skip while active, honours availableAfterConditions, and is one-shot', () => {
      ObjectivesManager.initialize([
        objective(
          'ride-out-rain',
          [
            { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false },
            { type: 'weather-event-ended', description: 'Rain cell passed', mustMaintain: false, params: { weatherEventId: 'cell' } },
          ],
          { timeSkip: { minutes: 20, label: 'rain cell', availableAfterConditions: true } }
        ),
      ]);
      const manager = ObjectivesManager.getInstance();
      tick();
      expect(manager.getAvailableTimeSkip()).toBeNull();

      station.heaterEnabled = true;
      weather.untilEndS.set('cell', 1200);
      tick();
      // Phase 28 D1: the offer runs to the end of the cell, on the station clock
      expect(manager.getAvailableTimeSkip()).toMatchObject({ objectiveId: 'ride-out-rain', deltaMs: 1_200_000, label: 'rain cell' });
      expect(manager.getAvailableTimeSkip()?.landsAtMs).toBeCloseTo(SimClock.nowMs() + 1_200_000, 0);

      manager.markTimeSkipUsed('ride-out-rain');
      expect(manager.getAvailableTimeSkip()).toBeNull();

      weather.ended.add('cell');
      tick();
      expect(stateOf('ride-out-rain').isCompleted).toBe(true);
    });

    it('does not burn the skipped objective countdown, and credits its timed holds', () => {
      ObjectivesManager.initialize([
        objective('hold', [{ type: 'receiver-snr-threshold', description: 'C/N held', mustMaintain: true, maintainDuration: 600, params: { minCNRatio: 7 } }], {
          timeLimitSeconds: 120,
          timeSkip: { minutes: 15 },
        }),
      ]);
      const manager = ObjectivesManager.getInstance();
      tick();
      tick();
      manager.applyTimeSkip(15 * 60_000, 'hold');
      expect(stateOf('hold').timeRemainingSeconds).toBe(120);
      tick();
      expect(stateOf('hold').isCompleted).toBe(true);
    });
  });

  describe('Phase 28 D1 hold-step skips', () => {
    /** 2026-02-17 09:48:08 UTC, the S10 standby moment from nats-r3-s10-F2 */
    const STANDBY_MS = Date.UTC(2026, 1, 17, 9, 48, 8);
    const secondsOfUpdates = (seconds: number): void => {
      for (let i = 0; i < seconds * 60; i++) {
        tick();
      }
    };
    const standBy = (extra: Partial<Objective> = {}): Objective =>
      objective(
        'stand-by',
        [
          { type: 'feed-heater-enabled', description: 'Heater', mustMaintain: false, requiresChange: false },
          { type: 'scenario-time-reached', description: 'Window open (10:00)', mustMaintain: false, params: { scenarioTime: '10:00' } },
        ],
        { timeSkip: { minutes: 10, label: 'standby until the 10:00 window', availableAfterConditions: true }, ...extra }
      );

    beforeEach(() => {
      SimClock.reset(STANDBY_MS);
    });

    it('scenario-time-reached reads the station clock, first occurrence after scenario start', () => {
      expect(ObjectivesManager.scenarioTimeTargetMs('10:00')).toBe(Date.UTC(2026, 1, 17, 10, 0, 0));
      expect(ObjectivesManager.scenarioTimeTargetMs('10:30:15')).toBe(Date.UTC(2026, 1, 17, 10, 30, 15));
      // Before the start: the next day
      expect(ObjectivesManager.scenarioTimeTargetMs('06:00')).toBe(Date.UTC(2026, 1, 18, 6, 0, 0));
      expect(ObjectivesManager.scenarioTimeTargetMs('25:00')).toBeNull();
      expect(ObjectivesManager.scenarioTimeTargetMs(undefined)).toBeNull();
    });

    it('offers a skip that lands exactly on the clock time the hold waits for (s10-F2)', () => {
      station.heaterEnabled = true;
      ObjectivesManager.initialize([standBy()]);
      const manager = ObjectivesManager.getInstance();
      tick();

      const offer = manager.getAvailableTimeSkip();
      expect(offer?.landsAtMs).toBe(Date.UTC(2026, 1, 17, 10, 0, 0));
      expect(offer?.deltaMs).toBe(Date.UTC(2026, 1, 17, 10, 0, 0) - STANDBY_MS);
      expect(stateOf('stand-by').isCompleted).toBe(false);

      SimClock.skip(offer?.deltaMs ?? 0);
      manager.applyTimeSkip(offer?.deltaMs ?? 0, 'stand-by');
      tick();
      expect(stateOf('stand-by').isCompleted).toBe(true);
    });

    it('runs a timed hold to its end, not a fixed N minutes (s10-F1)', () => {
      ObjectivesManager.initialize([
        objective('hold', [{ type: 'receiver-snr-threshold', description: 'C/N held', mustMaintain: true, maintainDuration: 29 * 60, params: { minCNRatio: 7 } }], {
          timeSkip: { minutes: 30, label: 'pass window' },
        }),
      ]);
      const manager = ObjectivesManager.getInstance();
      tick();
      secondsOfUpdates(60);

      const offer = manager.getAvailableTimeSkip();
      expect(offer?.landsAtMs).toBeNull();
      // 29 min hold, about a minute already held: about 28 min left, not 30
      expect(offer?.deltaMs).toBeGreaterThan(27.9 * 60_000);
      expect(offer?.deltaMs).toBeLessThan(28.1 * 60_000);
    });

    it('holds the mission countdown and the objective countdown through the wait, not through setup (s14-F1)', () => {
      ObjectivesManager.initialize([standBy({ timeLimitSeconds: 120 })], 30 * 60);
      const manager = ObjectivesManager.getInstance();
      tick();

      // Setup (heater off): the operator is working, both clocks run
      secondsOfUpdates(5);
      expect(manager.getScenarioTimeRemaining()).toBe(30 * 60 - 5);
      expect(stateOf('stand-by').timeRemainingSeconds).toBe(115);
      expect(manager.getMissionClockHold()).toBeNull();

      // Setup done, waiting for 10:00: both clocks hold
      station.heaterEnabled = true;
      tick();
      expect(manager.getMissionClockHold()).toMatchObject({ objectiveId: 'stand-by', label: 'standby until the 10:00 window' });
      expect(manager.isObjectiveCountdownHeld('stand-by')).toBe(true);
      secondsOfUpdates(30);
      expect(manager.getScenarioTimeRemaining()).toBe(30 * 60 - 5);
      expect(stateOf('stand-by').timeRemainingSeconds).toBe(115);

      // A dev/e2e clock jump through the wait does not charge the mission either
      manager.applyTimeSkip(60_000);
      expect(manager.getScenarioTimeRemaining()).toBe(30 * 60 - 5);
    });

    it('an objective skip burns no countdown of a step it opened (s10-F1)', () => {
      ObjectivesManager.initialize([
        standBy(),
        objective('next', [{ type: 'hpa-enabled', description: 'HPA on', mustMaintain: false }], { prerequisiteObjectiveIds: ['stand-by'], timeLimitSeconds: 120 }),
      ]);
      station.heaterEnabled = true;
      const manager = ObjectivesManager.getInstance();
      tick();
      const offer = manager.getAvailableTimeSkip();
      SimClock.skip(offer?.deltaMs ?? 0);
      tick();
      expect(stateOf('next').isActive).toBe(true);

      // The animation's remaining chunks land after the wait ended
      manager.applyTimeSkip(73_000, 'stand-by');
      expect(stateOf('next').timeRemainingSeconds).toBe(120);
    });

    it('freezes the mission timer at Mission Complete, even if something restarts it (s19-F2)', () => {
      ObjectivesManager.initialize([objective('only', [{ type: 'hpa-enabled', description: 'HPA on', mustMaintain: false }])], 30 * 60);
      const manager = ObjectivesManager.getInstance();
      secondsOfUpdates(6);
      station.hpaEnabled = true;
      tick();
      expect(manager.areAllObjectivesCompleted()).toBe(true);
      const atCompletion = manager.getScenarioTimeRemaining();

      // A sync/checkpoint restore sets the running flag from the saved time
      manager.restoreState([], atCompletion);
      secondsOfUpdates(30);
      manager.applyTimeSkip(60_000);
      expect(manager.getScenarioTimeRemaining()).toBe(atCompletion);
    });
  });
});
