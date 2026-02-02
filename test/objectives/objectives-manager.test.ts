import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events, QuizCompletedData, QuizPassedData } from '../../src/events/events';
import { Objective, ObjectiveState } from '../../src/objectives/objective-types';
import { ObjectivesManager } from '../../src/objectives/objectives-manager';

// Mock equipment state factories
const createMockAntennaState = (overrides = {}) => ({
  isPowered: true,
  isLocked: false,
  azimuth: 180,
  elevation: 45,
  beaconFrequencyHz: 3700e6,
  trackingMode: 'manual' as const,
  isBeaconLocked: false,
  isHeaterEnabled: false,
  ...overrides,
});

const createMockGpsdoState = (overrides = {}) => ({
  isPowered: true,
  isLocked: false,
  warmupTimeRemaining: 0,
  temperature: 70,
  gnssSignalPresent: true,
  satelliteCount: 6,
  frequencyAccuracy: 3,
  allanDeviation: 3,
  phaseNoise: -130,
  isInHoldover: false,
  ...overrides,
});

const createMockBucState = (overrides = {}) => ({
  isPowered: true,
  isExtRefLocked: false,
  frequencyError: 0,
  isMuted: true,
  currentDraw: 3.5,
  outputPower: 30,
  saturationPower: 40,
  ...overrides,
});

const createMockLnbState = (overrides = {}) => ({
  isPowered: true,
  isExtRefLocked: false,
  frequencyError: 0,
  loFrequency: 5150e6,
  gain: 55,
  noiseTemperature: 80,
  temperature: 35,
  ...overrides,
});

const createMockHpaState = (overrides = {}) => ({
  isPowered: true,
  isHpaEnabled: false,
  backOff: 3,
  isOverdriven: false,
  outputPower: 50,
  ...overrides,
});

const createMockFilterState = (overrides = {}) => ({
  isPowered: true,
  bandwidthIndex: 6,
  ...overrides,
});

const createMockNotchFilterState = (overrides = {}) => ({
  isPowered: true,
  notches: [
    { enabled: false, centerFrequency: 70, bandwidth: 2, depth: 30 },
    { enabled: false, centerFrequency: 70, bandwidth: 2, depth: 30 },
    { enabled: false, centerFrequency: 70, bandwidth: 2, depth: 30 },
  ],
  ...overrides,
});

const createMockSpectrumAnalyzerState = (overrides = {}) => ({
  centerFrequency: 70e6,
  span: 40e6,
  rbw: 100e3,
  referenceLevel: -20,
  minAmplitude: -80,
  maxAmplitude: -20,
  ...overrides,
});

const createMockReceiverModemState = (overrides = {}) => ({
  modemNumber: 1,
  isPowered: true,
  frequency: 70,
  bandwidth: 36,
  modulation: 'QPSK',
  fec: '1/2',
  ...overrides,
});

const createMockTransmitterModemState = (overrides = {}) => ({
  modem_number: 1,
  isPowered: true,
  isTransmitting: false,
  ifSignal: {
    frequency: 70e6,
    power: -10,
    bandwidth: 36e6,
    modulation: 'QPSK',
    fec: '1/2',
  },
  ...overrides,
});

// Create mock equipment instances
let mockAntennaState = createMockAntennaState();
let mockGpsdoState = createMockGpsdoState();
let mockBucState = createMockBucState();
let mockLnbState = createMockLnbState();
let mockHpaState = createMockHpaState();
let mockFilterState = createMockFilterState();
let mockNotchFilterState = createMockNotchFilterState();
let mockSpectrumAnalyzerState = createMockSpectrumAnalyzerState();
let mockReceiverModemState = createMockReceiverModemState();
let mockTransmitterModemState = createMockTransmitterModemState();
let mockInputSignals: Array<{ signalId: string; power: number }> = [];
let mockReceiverHasLock = false;
let mockReceiverSnr: number | null = null;

const createMockGroundStation = () => ({
  state: { id: 'gs-1' },
  antennas: [{
    state: mockAntennaState,
  }],
  rfFrontEnds: [{
    gpsdoModule: { state: mockGpsdoState },
    bucModule: { state: mockBucState },
    lnbModule: { state: mockLnbState },
    hpaModule: { state: mockHpaState },
    filterModule: { state: mockFilterState },
    notchFilterModule: { state: mockNotchFilterState },
    couplerModule: {
      signalPathManager: {
        getTotalGainTo: vi.fn(() => 0),
      },
    },
  }],
  spectrumAnalyzers: [{
    state: mockSpectrumAnalyzerState,
    getInputSignals: vi.fn(() => mockInputSignals),
    rfFrontEnd_: {
      couplerModule: {
        signalPathManager: {
          getTotalGainTo: vi.fn(() => 0),
        },
      },
    },
  }],
  receivers: [{
    state: {
      activeModem: 1,
      modems: [mockReceiverModemState],
    },
    getSignalsInBandwidth: vi.fn(() => ({ hasLock: mockReceiverHasLock })),
    getSnrForModem: vi.fn(() => mockReceiverSnr),
  }],
  transmitters: [{
    state: {
      activeModem: 1,
      modems: [mockTransmitterModemState],
    },
  }],
});

// Mock dependencies
vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      groundStations: [createMockGroundStation()],
      getSatByNoradId: vi.fn((id: number) => {
        if (id === 12345) {
          return { az: 180, el: 45 };
        }
        return null;
      }),
      satellites: [],
    })),
  },
}));

vi.mock('../../src/modal/quiz-manager', () => ({
  QuizManager: {
    getInstance: vi.fn(() => ({
      hasQuiz: vi.fn(() => false),
      isQuizComplete: vi.fn(() => false),
      registerQuiz: vi.fn(),
    })),
  },
}));

let mockTrafficOwner: string | null = null;

vi.mock('../../src/traffic/traffic-control-manager', () => ({
  TrafficControlManager: {
    getInstance: vi.fn(() => ({
      getOwner: vi.fn(() => mockTrafficOwner),
    })),
  },
}));

// Helper to reset all mock states
const resetMockStates = () => {
  mockAntennaState = createMockAntennaState();
  mockGpsdoState = createMockGpsdoState();
  mockBucState = createMockBucState();
  mockLnbState = createMockLnbState();
  mockHpaState = createMockHpaState();
  mockFilterState = createMockFilterState();
  mockNotchFilterState = createMockNotchFilterState();
  mockSpectrumAnalyzerState = createMockSpectrumAnalyzerState();
  mockReceiverModemState = createMockReceiverModemState();
  mockTransmitterModemState = createMockTransmitterModemState();
  mockInputSignals = [];
  mockReceiverHasLock = false;
  mockReceiverSnr = null;
  mockTrafficOwner = null;
};

describe('ObjectivesManager', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    EventBus.destroy();
    ObjectivesManager.destroy();
    eventBus = EventBus.getInstance();
    resetMockStates();
  });

  afterEach(() => {
    ObjectivesManager.destroy();
    EventBus.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createTestObjective = (overrides: Partial<Objective> = {}): Objective => ({
    id: 'test-objective-1',
    title: 'Test Objective',
    description: 'A test objective',
    groundStation: 'gs-1',
    conditions: [
      {
        type: 'mission-brief-opened',
        description: 'Open mission brief',
        mustMaintain: false,
      },
    ],
    ...overrides,
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance with initialize()', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager).toBeDefined();
      expect(ObjectivesManager.getInstance()).toBe(manager);
    });

    it('should throw error when getInstance() called before initialize()', () => {
      expect(() => ObjectivesManager.getInstance()).toThrow(
        'ObjectivesManager not initialized. Call initialize() first.'
      );
    });

    it('should warn and destroy previous instance on re-initialize', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const objectives1 = [createTestObjective({ id: 'obj-1' })];
      const manager1 = ObjectivesManager.initialize(objectives1);

      const objectives2 = [createTestObjective({ id: 'obj-2' })];
      const manager2 = ObjectivesManager.initialize(objectives2);

      expect(consoleSpy).toHaveBeenCalledWith(
        'ObjectivesManager already initialized. Destroying previous instance.'
      );
      expect(manager1).not.toBe(manager2);

      consoleSpy.mockRestore();
    });
  });

  describe('Initialization', () => {
    it('should initialize objectives with correct initial state', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['obj-1'] }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const states = manager.getObjectiveStates();

      expect(states).toHaveLength(2);

      // First objective should be active (no prerequisites)
      expect(states[0].isActive).toBe(true);
      expect(states[0].isCompleted).toBe(false);

      // Second objective should be inactive (has prerequisites)
      expect(states[1].isActive).toBe(false);
      expect(states[1].isCompleted).toBe(false);
    });

    it('should initialize scenario timer when provided', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 300);

      expect(manager.hasScenarioTimer()).toBe(true);
      expect(manager.getScenarioTimeRemaining()).toBe(300);
    });

    it('should not initialize scenario timer when not provided', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.hasScenarioTimer()).toBe(false);
    });
  });

  describe('Objective State Retrieval', () => {
    it('should get objective state by ID', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const state = manager.getObjectiveState('obj-1');

      expect(state).toBeDefined();
      expect(state?.objective.id).toBe('obj-1');
    });

    it('should return undefined for non-existent objective', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const state = manager.getObjectiveState('non-existent');

      expect(state).toBeUndefined();
    });
  });

  describe('Timer Functionality', () => {
    it('should format time remaining correctly', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.formatTimeRemaining(125)).toBe('2:05');
      expect(manager.formatTimeRemaining(60)).toBe('1:00');
      expect(manager.formatTimeRemaining(59)).toBe('0:59');
      expect(manager.formatTimeRemaining(0)).toBe('0:00');
    });

    it('should countdown scenario timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 60);

      expect(manager.getScenarioTimeRemaining()).toBe(60);

      // Advance time by 1 second (timer interval)
      vi.advanceTimersByTime(1000);

      expect(manager.getScenarioTimeRemaining()).toBe(59);
    });

    it('should stop all timers when objective fails', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 5,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const failedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_FAILED, failedCallback);

      ObjectivesManager.initialize(objectives, 60);

      // Advance timer past the objective timeout
      vi.advanceTimersByTime(6000);

      expect(failedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'timed-obj',
          reason: 'timeout',
        })
      );
    });

    it('should emit SCENARIO_TIME_EXPIRED when scenario timer reaches zero', () => {
      const objectives = [createTestObjective()];
      const expiredCallback = vi.fn();
      eventBus.on(Events.SCENARIO_TIME_EXPIRED, expiredCallback);

      ObjectivesManager.initialize(objectives, 3);

      // Advance time past the scenario timeout
      vi.advanceTimersByTime(4000);

      expect(expiredCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          timeLimit: 3,
        })
      );
    });
  });

  describe('Elapsed Time Calculation', () => {
    it('should calculate elapsed time from countdown timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 300);

      vi.advanceTimersByTime(10000); // 10 seconds

      expect(manager.getElapsedTime()).toBe(10);
    });

    it('should calculate elapsed time from start time when no timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      const now = Date.now();
      vi.setSystemTime(now + 15000);

      expect(manager.getElapsedTime()).toBe(15);
    });
  });

  describe('Quiz Events Handling', () => {
    it('should pause timers on QUIZ_PASSED event', () => {
      const objectives = [createTestObjective({ id: 'quiz-obj' })];
      const manager = ObjectivesManager.initialize(objectives, 60);

      expect(manager.getScenarioTimeRemaining()).toBe(60);

      // Advance 5 seconds
      vi.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55);

      // Emit quiz passed event
      const quizPassedData: QuizPassedData = {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      };
      eventBus.emit(Events.QUIZ_PASSED, quizPassedData);

      // Timer should be paused
      vi.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55); // No change

      expect(manager.isQuizPassed()).toBe(true);
      expect(manager.getPassedObjectiveId()).toBe('quiz-obj');
    });

    it('should resume timer on QUIZ_COMPLETED if scenario not complete', () => {
      const objectives = [
        createTestObjective({ id: 'quiz-obj' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['quiz-obj'] }),
      ];
      const manager = ObjectivesManager.initialize(objectives, 60);

      // Emit quiz passed event to pause timer
      eventBus.emit(Events.QUIZ_PASSED, {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        attempts: 1,
        pointsDeducted: 0,
      });

      vi.advanceTimersByTime(5000);
      const timeAfterPause = manager.getScenarioTimeRemaining();

      // Emit quiz completed event
      const quizCompletedData: QuizCompletedData = {
        objectiveId: 'quiz-obj',
        conditionIndex: 0,
        totalAttempts: 1,
        totalPointsDeducted: 0,
      };
      eventBus.emit(Events.QUIZ_COMPLETED, quizCompletedData);

      expect(manager.isQuizPassed()).toBe(false);

      // Timer should resume
      vi.advanceTimersByTime(3000);
      expect(manager.getScenarioTimeRemaining()).toBeLessThan(timeAfterPause);
    });
  });

  describe('Opened Box Tracking', () => {
    it('should register opened boxes', () => {
      ObjectivesManager.registerOpenedBox('mission-brief-1');

      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(true);
      expect(ObjectivesManager.isBoxOpened('mission-brief-2')).toBe(false);
    });

    it('should check if any box is opened when no ID provided', () => {
      expect(ObjectivesManager.isBoxOpened()).toBe(false);

      ObjectivesManager.registerOpenedBox('mission-brief-1');

      expect(ObjectivesManager.isBoxOpened()).toBe(true);
    });

    it('should clear opened boxes on destroy', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      ObjectivesManager.registerOpenedBox('mission-brief-1');
      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(true);

      ObjectivesManager.destroy();

      expect(ObjectivesManager.isBoxOpened('mission-brief-1')).toBe(false);
    });
  });

  describe('Ground Station Selection Tracking', () => {
    it('should track selected ground station via ASSET_SELECTED event', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'ground-station',
        id: 'gs-1',
      });

      expect(ObjectivesManager.getSelectedGroundStationId()).toBe('gs-1');
    });

    it('should clear selected ground station when non-ground-station selected', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'ground-station',
        id: 'gs-1',
      });

      eventBus.emit(Events.ASSET_SELECTED, {
        type: 'satellite',
        id: 'sat-1',
      });

      expect(ObjectivesManager.getSelectedGroundStationId()).toBeNull();
    });
  });

  describe('State Restoration', () => {
    it('should restore objective states from checkpoint', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2', prerequisiteObjectiveIds: ['obj-1'] }),
      ];

      const manager = ObjectivesManager.initialize(objectives, 300);

      const savedStates: ObjectiveState[] = [
        {
          objective: objectives[0],
          isActive: true,
          activatedAt: Date.now() - 10000,
          isCompleted: true,
          completedAt: Date.now() - 5000,
          conditionStates: [
            {
              condition: objectives[0].conditions[0],
              isSatisfied: true,
              satisfiedAt: Date.now() - 5000,
              maintainedDuration: 0,
              isMaintenanceComplete: true,
            },
          ],
          isFailed: false,
          isTimerRunning: false,
        },
      ];

      manager.restoreState(savedStates, 250);

      const states = manager.getObjectiveStates();

      // First objective should be restored as completed
      expect(states[0].isCompleted).toBe(true);

      // Scenario timer should be restored
      expect(manager.getScenarioTimeRemaining()).toBe(250);
    });

    it('should handle empty saved states gracefully', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(() => manager.restoreState([], undefined)).not.toThrow();
    });
  });

  describe('HTML Checklist Generation', () => {
    it('should generate HTML checklist with correct structure', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1', title: 'First Objective' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const html = manager.generateHtmlChecklist();

      expect(html).toContain('objectives-checklist');
      expect(html).toContain('First Objective');
      expect(html).toContain('objective-item');
      expect(html).toContain('In Progress');
    });

    it('should mark completed objectives correctly', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const states = manager.getObjectiveStates();
      states[0].isCompleted = true;

      const html = manager.generateHtmlChecklist();

      expect(html).toContain('completed');
      expect(html).toContain('Completed');
    });
  });

  describe('areAllObjectivesCompleted', () => {
    it('should return false when objectives remain incomplete', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.areAllObjectivesCompleted()).toBe(false);
    });

    it('should return true when all objectives completed', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];
      const manager = ObjectivesManager.initialize(objectives);

      const states = manager.getObjectiveStates();
      states[0].isCompleted = true;

      expect(manager.areAllObjectivesCompleted()).toBe(true);
    });
  });

  describe('Collapse State Sync', () => {
    it('should sync collapsed states from DOM', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Create mock DOM
      document.body.innerHTML = `
        <div class="objectives-checklist">
          <div class="objective-item collapsed"></div>
          <div class="objective-item"></div>
        </div>
      `;

      manager.syncCollapsedStatesFromDOM();

      // Generate HTML and verify collapsed state is preserved
      const html = manager.generateHtmlChecklist();
      expect(html).toBeDefined();
    });
  });

  describe('Static Utility Methods', () => {
    it('isScenarioLocked should return false when no instance exists', () => {
      expect(ObjectivesManager.isScenarioLocked()).toBe(false);
    });

    it('isScenarioLocked should return true when freezing objective is incomplete', () => {
      const objectives = [
        createTestObjective({
          id: 'freeze-obj',
          freezesScenarioTimer: true,
        }),
      ];

      ObjectivesManager.initialize(objectives);

      expect(ObjectivesManager.isScenarioLocked()).toBe(true);
    });

    it('isScenarioLocked should return false when freezing objective is complete', () => {
      const objectives = [
        createTestObjective({
          id: 'freeze-obj',
          freezesScenarioTimer: true,
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const states = manager.getObjectiveStates();
      states[0].isCompleted = true;

      expect(ObjectivesManager.isScenarioLocked()).toBe(false);
    });

    it('hasLoadedObjectives should return false when no instance exists', () => {
      expect(ObjectivesManager.hasLoadedObjectives()).toBe(false);
    });

    it('hasLoadedObjectives should return false when initialized with empty array', () => {
      ObjectivesManager.initialize([]);
      expect(ObjectivesManager.hasLoadedObjectives()).toBe(false);
    });

    it('hasLoadedObjectives should return true when objectives are loaded', () => {
      const objectives = [createTestObjective()];
      ObjectivesManager.initialize(objectives);
      expect(ObjectivesManager.hasLoadedObjectives()).toBe(true);
    });
  });

  describe('Objective Timer Functionality', () => {
    it('getObjectiveTimeRemaining should return null for objective without timer', () => {
      const objectives = [createTestObjective({ id: 'no-timer' })];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.getObjectiveTimeRemaining('no-timer')).toBeNull();
    });

    it('getObjectiveTimeRemaining should return time for objective with timer', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 120,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.getObjectiveTimeRemaining('timed-obj')).toBe(120);
    });

    it('getObjectiveTimeRemaining should return null for non-existent objective', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives);

      expect(manager.getObjectiveTimeRemaining('non-existent')).toBeNull();
    });

    it('should start timer on-scenario-load when specified', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 60,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const state = manager.getObjectiveState('timed-obj');

      expect(state?.isTimerRunning).toBe(true);
    });

    it('should start timer on-activate for active objective without on-scenario-load', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 60,
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const state = manager.getObjectiveState('timed-obj');

      // Default timerStartTrigger is 'on-activate', and objective is active
      expect(state?.isTimerRunning).toBe(true);
    });

    it('should not start timer on-activate for inactive objective', () => {
      const objectives = [
        createTestObjective({ id: 'prereq' }),
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 60,
          prerequisiteObjectiveIds: ['prereq'],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const state = manager.getObjectiveState('timed-obj');

      expect(state?.isTimerRunning).toBe(false);
    });

    it('should decrement objective timer each second', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          timeLimitSeconds: 60,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      vi.advanceTimersByTime(5000);

      expect(manager.getObjectiveTimeRemaining('timed-obj')).toBe(55);
    });
  });

  describe('Freezes Scenario Timer Behavior', () => {
    it('should not start scenario timer when freezing objective exists', () => {
      const objectives = [
        createTestObjective({
          id: 'freeze-obj',
          freezesScenarioTimer: true,
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives, 300);

      // Timer should not countdown
      vi.advanceTimersByTime(5000);

      expect(manager.getScenarioTimeRemaining()).toBe(300);
    });

    it('should emit SCENARIO_UNLOCKED when freezing objective completes', () => {
      const objectives = [
        createTestObjective({
          id: 'freeze-obj',
          freezesScenarioTimer: true,
        }),
      ];

      const unlockedCallback = vi.fn();
      eventBus.on(Events.SCENARIO_UNLOCKED, unlockedCallback);

      const manager = ObjectivesManager.initialize(objectives, 300);

      // Complete the freezing objective by satisfying conditions
      ObjectivesManager.registerOpenedBox('mission-brief-1');

      // Trigger update
      eventBus.emit(Events.UPDATE, 16);

      expect(unlockedCallback).toHaveBeenCalled();
    });
  });

  describe('Time Penalty Application', () => {
    it('should apply time penalty when objective completed after threshold', () => {
      const objectives = [
        createTestObjective({
          id: 'penalty-obj',
          timePenalty: {
            elapsedTimeThreshold: 30,
            pointsDeducted: 10,
            message: 'Time penalty applied',
          },
        }),
      ];

      const penaltyCallback = vi.fn();
      eventBus.on(Events.TIME_PENALTY_APPLIED, penaltyCallback);

      ObjectivesManager.initialize(objectives, 300);

      // Advance time past threshold
      vi.advanceTimersByTime(35000);

      // Complete the objective
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(penaltyCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'penalty-obj',
          pointsDeducted: 10,
          message: 'Time penalty applied',
        })
      );
    });

    it('should not apply time penalty when objective completed before threshold', () => {
      const objectives = [
        createTestObjective({
          id: 'penalty-obj',
          timePenalty: {
            elapsedTimeThreshold: 30,
            pointsDeducted: 10,
          },
        }),
      ];

      const penaltyCallback = vi.fn();
      eventBus.on(Events.TIME_PENALTY_APPLIED, penaltyCallback);

      ObjectivesManager.initialize(objectives, 300);

      // Advance time but stay under threshold
      vi.advanceTimersByTime(15000);

      // Complete the objective
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(penaltyCallback).not.toHaveBeenCalled();
    });
  });

  describe('Condition Logic (AND/OR)', () => {
    it('should complete objective with AND logic when all conditions met', () => {
      const objectives = [
        createTestObjective({
          id: 'and-obj',
          conditionLogic: 'AND',
          conditions: [
            { type: 'mission-brief-opened', description: 'Condition 1', mustMaintain: false, params: { boxId: 'brief-1' } },
            { type: 'mission-brief-opened', description: 'Condition 2', mustMaintain: false, params: { boxId: 'brief-2' } },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Only satisfy first condition
      ObjectivesManager.registerOpenedBox('brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();

      // Satisfy second condition
      ObjectivesManager.registerOpenedBox('brief-2');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should complete objective with OR logic when any condition met', () => {
      const objectives = [
        createTestObjective({
          id: 'or-obj',
          conditionLogic: 'OR',
          conditions: [
            { type: 'mission-brief-opened', description: 'Condition 1', mustMaintain: false, params: { boxId: 'brief-1' } },
            { type: 'mission-brief-opened', description: 'Condition 2', mustMaintain: false, params: { boxId: 'brief-2' } },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Only satisfy first condition
      ObjectivesManager.registerOpenedBox('brief-1');
      eventBus.emit(Events.UPDATE, 16);

      // Should complete with just one condition satisfied
      expect(completedCallback).toHaveBeenCalled();
    });

    it('should default to AND logic when conditionLogic not specified', () => {
      const objectives = [
        createTestObjective({
          id: 'default-obj',
          conditions: [
            { type: 'mission-brief-opened', description: 'Condition 1', mustMaintain: false, params: { boxId: 'brief-1' } },
            { type: 'mission-brief-opened', description: 'Condition 2', mustMaintain: false, params: { boxId: 'brief-2' } },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Only satisfy first condition
      ObjectivesManager.registerOpenedBox('brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });
  });

  describe('Maintenance Duration Tracking', () => {
    it('should track maintenance duration when condition must be maintained', () => {
      const objectives = [
        createTestObjective({
          id: 'maintain-obj',
          conditions: [
            {
              type: 'mission-brief-opened',
              description: 'Maintain for 3 seconds',
              mustMaintain: true,
              maintainDuration: 3,
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      ObjectivesManager.registerOpenedBox('mission-brief-1');

      // First update - condition becomes satisfied
      eventBus.emit(Events.UPDATE, 1000);
      expect(completedCallback).not.toHaveBeenCalled();

      // Second update - 2 seconds elapsed
      eventBus.emit(Events.UPDATE, 2000);
      expect(completedCallback).not.toHaveBeenCalled();

      // Third update - 3 seconds elapsed, should complete
      eventBus.emit(Events.UPDATE, 1000);
      expect(completedCallback).toHaveBeenCalled();
    });

    it('should reset maintenance duration when condition becomes unsatisfied', () => {
      const objectives = [
        createTestObjective({
          id: 'maintain-obj',
          conditions: [
            {
              type: 'ground-station-selected',
              description: 'Maintain selection',
              mustMaintain: true,
              maintainDuration: 3,
              params: { groundStationId: 'gs-1' },
            },
          ],
        }),
      ];

      ObjectivesManager.initialize(objectives);

      // Select ground station
      eventBus.emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'gs-1' });

      // First update - condition becomes satisfied, duration starts at 0
      eventBus.emit(Events.UPDATE, 1000);

      // Second update - duration accumulates while condition remains satisfied
      eventBus.emit(Events.UPDATE, 1000);

      const manager = ObjectivesManager.getInstance();
      const state = manager.getObjectiveState('maintain-obj');
      const condState = state?.conditionStates[0];

      expect(condState?.maintainedDuration).toBeGreaterThan(0);

      // Deselect ground station
      eventBus.emit(Events.ASSET_SELECTED, { type: 'satellite', id: 'sat-1' });
      eventBus.emit(Events.UPDATE, 1000);

      expect(condState?.maintainedDuration).toBe(0);
      expect(condState?.isSatisfied).toBe(false);
    });
  });

  describe('Prerequisite Activation Flow', () => {
    it('should activate dependent objective when prerequisite completes', () => {
      const objectives = [
        createTestObjective({ id: 'prereq' }),
        createTestObjective({
          id: 'dependent',
          prerequisiteObjectiveIds: ['prereq'],
        }),
      ];

      const activatedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_ACTIVATED, activatedCallback);

      const manager = ObjectivesManager.initialize(objectives);

      // Verify dependent is initially inactive
      expect(manager.getObjectiveState('dependent')?.isActive).toBe(false);

      // Complete prerequisite
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(activatedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'dependent',
        })
      );
      expect(manager.getObjectiveState('dependent')?.isActive).toBe(true);
    });

    it('should wait for all prerequisites before activation', () => {
      const objectives = [
        createTestObjective({ id: 'prereq-1', conditions: [{ type: 'mission-brief-opened', description: 'Open 1', mustMaintain: false, params: { boxId: 'brief-1' } }] }),
        createTestObjective({ id: 'prereq-2', conditions: [{ type: 'mission-brief-opened', description: 'Open 2', mustMaintain: false, params: { boxId: 'brief-2' } }] }),
        createTestObjective({
          id: 'dependent',
          prerequisiteObjectiveIds: ['prereq-1', 'prereq-2'],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Complete first prerequisite
      ObjectivesManager.registerOpenedBox('brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(manager.getObjectiveState('dependent')?.isActive).toBe(false);

      // Complete second prerequisite
      ObjectivesManager.registerOpenedBox('brief-2');
      eventBus.emit(Events.UPDATE, 16);

      expect(manager.getObjectiveState('dependent')?.isActive).toBe(true);
    });

    it('should start timer for dependent objective when activated', () => {
      const objectives = [
        createTestObjective({ id: 'prereq' }),
        createTestObjective({
          id: 'dependent',
          prerequisiteObjectiveIds: ['prereq'],
          timeLimitSeconds: 60,
          // Use a condition that won't be immediately satisfied
          conditions: [
            {
              type: 'ground-station-selected',
              description: 'Select gs-1',
              mustMaintain: false,
              params: { groundStationId: 'gs-1' },
            },
          ],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Dependent objective timer should not be running
      expect(manager.getObjectiveState('dependent')?.isTimerRunning).toBe(false);

      // Complete prerequisite
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      // Dependent objective timer should now be running
      expect(manager.getObjectiveState('dependent')?.isTimerRunning).toBe(true);
      expect(manager.getObjectiveState('dependent')?.timeRemainingSeconds).toBe(60);
    });
  });

  describe('Mission Brief Opened Condition', () => {
    it('should satisfy condition when specific boxId is opened', () => {
      const objectives = [
        createTestObjective({
          id: 'brief-obj',
          conditions: [
            {
              type: 'mission-brief-opened',
              description: 'Open specific brief',
              mustMaintain: false,
              params: { boxId: 'mission-brief-alpha' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Open wrong brief
      ObjectivesManager.registerOpenedBox('mission-brief-beta');
      eventBus.emit(Events.UPDATE, 16);
      expect(completedCallback).not.toHaveBeenCalled();

      // Open correct brief
      ObjectivesManager.registerOpenedBox('mission-brief-alpha');
      eventBus.emit(Events.UPDATE, 16);
      expect(completedCallback).toHaveBeenCalled();
    });

    it('should satisfy condition when any mission-brief box opened (no specific boxId)', () => {
      const objectives = [
        createTestObjective({
          id: 'any-brief-obj',
          conditions: [
            {
              type: 'mission-brief-opened',
              description: 'Open any mission brief',
              mustMaintain: false,
              // No params.boxId specified
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Open any mission-brief prefixed box
      ObjectivesManager.registerOpenedBox('mission-brief-xyz');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should not satisfy condition when non-mission-brief box opened', () => {
      const objectives = [
        createTestObjective({
          id: 'any-brief-obj',
          conditions: [
            {
              type: 'mission-brief-opened',
              description: 'Open any mission brief',
              mustMaintain: false,
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Open non-mission-brief box
      ObjectivesManager.registerOpenedBox('other-document');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });
  });

  describe('HTML Checklist Edge Cases', () => {
    it('should display failed state correctly', () => {
      const objectives = [
        createTestObjective({
          id: 'failed-obj',
          title: 'Failed Objective',
          timeLimitSeconds: 2,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Let the objective timeout
      vi.advanceTimersByTime(3000);

      const html = manager.generateHtmlChecklist();

      expect(html).toContain('failed');
      expect(html).toContain('Failed');
    });

    it('should display locked state for inactive objective', () => {
      const objectives = [
        createTestObjective({ id: 'prereq' }),
        createTestObjective({
          id: 'locked-obj',
          title: 'Locked Objective',
          prerequisiteObjectiveIds: ['prereq'],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const html = manager.generateHtmlChecklist();

      expect(html).toContain('locked');
      expect(html).toContain('Locked');
    });

    it('should display timer for running objective timer', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-obj',
          title: 'Timed Objective',
          timeLimitSeconds: 90,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const html = manager.generateHtmlChecklist();

      expect(html).toContain('objective-timer');
      expect(html).toContain('1:30');
    });

    it('should display urgent class when timer is low', () => {
      const objectives = [
        createTestObjective({
          id: 'urgent-obj',
          title: 'Urgent Objective',
          timeLimitSeconds: 25,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);
      const html = manager.generateHtmlChecklist();

      expect(html).toContain('timer-urgent');
    });
  });

  describe('stopAllTimers Method', () => {
    it('should stop scenario timer', () => {
      const objectives = [createTestObjective()];
      const manager = ObjectivesManager.initialize(objectives, 60);

      vi.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55);

      manager.stopAllTimers();

      vi.advanceTimersByTime(5000);
      expect(manager.getScenarioTimeRemaining()).toBe(55); // No change
    });

    it('should stop all objective timers', () => {
      const objectives = [
        createTestObjective({
          id: 'timed-1',
          timeLimitSeconds: 60,
          timerStartTrigger: 'on-scenario-load',
        }),
        createTestObjective({
          id: 'timed-2',
          timeLimitSeconds: 120,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      vi.advanceTimersByTime(5000);
      expect(manager.getObjectiveTimeRemaining('timed-1')).toBe(55);
      expect(manager.getObjectiveTimeRemaining('timed-2')).toBe(115);

      manager.stopAllTimers();

      vi.advanceTimersByTime(5000);
      expect(manager.getObjectiveTimeRemaining('timed-1')).toBe(55);
      expect(manager.getObjectiveTimeRemaining('timed-2')).toBe(115);
    });
  });

  describe('Objectives All Completed Event', () => {
    it('should emit OBJECTIVES_ALL_COMPLETED when all objectives done', () => {
      const objectives = [
        createTestObjective({ id: 'obj-1' }),
        createTestObjective({ id: 'obj-2' }),
      ];

      const allCompletedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVES_ALL_COMPLETED, allCompletedCallback);

      ObjectivesManager.initialize(objectives);

      // Complete both objectives
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);
      eventBus.emit(Events.UPDATE, 16);

      expect(allCompletedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          completedObjectives: expect.any(Array),
          totalTime: expect.any(Number),
        })
      );
    });

    it('should stop all timers when all objectives complete', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];

      const manager = ObjectivesManager.initialize(objectives, 300);

      vi.advanceTimersByTime(10000);
      expect(manager.getScenarioTimeRemaining()).toBe(290);

      // Complete the objective
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      // Timer should be stopped
      vi.advanceTimersByTime(10000);
      expect(manager.getScenarioTimeRemaining()).toBe(290);
    });
  });

  describe('Condition State Change Events', () => {
    it('should emit OBJECTIVE_CONDITION_CHANGED when condition becomes satisfied', () => {
      const objectives = [createTestObjective({ id: 'obj-1' })];

      const conditionChangedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_CONDITION_CHANGED, conditionChangedCallback);

      ObjectivesManager.initialize(objectives);

      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(conditionChangedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          objectiveId: 'obj-1',
          conditionIndex: 0,
          isSatisfied: true,
        })
      );
    });

    it('should emit OBJECTIVE_CONDITION_CHANGED when condition becomes unsatisfied', () => {
      const objectives = [
        createTestObjective({
          id: 'obj-1',
          conditionLogic: 'AND',
          conditions: [
            {
              type: 'ground-station-selected',
              description: 'Select ground station',
              mustMaintain: true,
              maintainUntilObjectiveComplete: true,
              params: { groundStationId: 'gs-1' },
            },
            // Add second condition that won't be satisfied to prevent objective completion
            {
              type: 'mission-brief-opened',
              description: 'Open special brief',
              mustMaintain: false,
              params: { boxId: 'never-opened-brief' },
            },
          ],
        }),
      ];

      const conditionChangedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_CONDITION_CHANGED, conditionChangedCallback);

      ObjectivesManager.initialize(objectives);

      // Satisfy first condition
      eventBus.emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'gs-1' });
      eventBus.emit(Events.UPDATE, 16);

      // Unsatisfy first condition
      eventBus.emit(Events.ASSET_SELECTED, { type: 'satellite', id: 'sat-1' });
      eventBus.emit(Events.UPDATE, 16);

      const unsatisfiedCall = conditionChangedCallback.mock.calls.find(
        call => call[0].isSatisfied === false
      );

      expect(unsatisfiedCall).toBeDefined();
      expect(unsatisfiedCall[0]).toMatchObject({
        objectiveId: 'obj-1',
        conditionIndex: 0,
        isSatisfied: false,
      });
    });
  });

  describe('MaintainUntilObjectiveComplete Behavior', () => {
    it('should reset maintenance complete when condition lost with maintainUntilObjectiveComplete', () => {
      const objectives = [
        createTestObjective({
          id: 'maintain-obj',
          conditionLogic: 'AND',
          conditions: [
            {
              type: 'ground-station-selected',
              description: 'Must maintain until complete',
              mustMaintain: true,
              maintainUntilObjectiveComplete: true,
              params: { groundStationId: 'gs-1' },
            },
            // Add second condition to prevent objective completion
            {
              type: 'mission-brief-opened',
              description: 'Blocker condition',
              mustMaintain: false,
              params: { boxId: 'blocker-brief' },
            },
          ],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Satisfy first condition
      eventBus.emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'gs-1' });
      eventBus.emit(Events.UPDATE, 16);

      const state = manager.getObjectiveState('maintain-obj');
      expect(state?.conditionStates[0].isMaintenanceComplete).toBe(true);

      // Unsatisfy first condition
      eventBus.emit(Events.ASSET_SELECTED, { type: 'satellite', id: 'sat-1' });
      eventBus.emit(Events.UPDATE, 16);

      // Maintenance complete should be reset
      expect(state?.conditionStates[0].isMaintenanceComplete).toBe(false);
    });

    it('should track lost timestamps when condition lost', () => {
      const objectives = [
        createTestObjective({
          id: 'maintain-obj',
          conditions: [
            {
              type: 'ground-station-selected',
              description: 'Track losses',
              mustMaintain: true,
              params: { groundStationId: 'gs-1' },
            },
          ],
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Satisfy and then unsatisfy multiple times
      eventBus.emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'gs-1' });
      eventBus.emit(Events.UPDATE, 16);

      eventBus.emit(Events.ASSET_SELECTED, { type: 'satellite', id: 'sat-1' });
      eventBus.emit(Events.UPDATE, 16);

      eventBus.emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'gs-1' });
      eventBus.emit(Events.UPDATE, 16);

      eventBus.emit(Events.ASSET_SELECTED, { type: 'satellite', id: 'sat-1' });
      eventBus.emit(Events.UPDATE, 16);

      const state = manager.getObjectiveState('maintain-obj');
      expect(state?.conditionStates[0].lostTimestamps?.length).toBe(2);
    });
  });

  describe('Failed Objectives', () => {
    it('should not complete failed objectives', () => {
      const objectives = [
        createTestObjective({
          id: 'failed-obj',
          timeLimitSeconds: 2,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      // Let the objective timeout
      vi.advanceTimersByTime(3000);

      // Try to satisfy conditions after failure
      ObjectivesManager.registerOpenedBox('mission-brief-1');
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });

    it('should skip failed objectives in update loop', () => {
      const objectives = [
        createTestObjective({
          id: 'failed-obj',
          timeLimitSeconds: 2,
          timerStartTrigger: 'on-scenario-load',
        }),
      ];

      const manager = ObjectivesManager.initialize(objectives);

      // Let the objective timeout
      vi.advanceTimersByTime(3000);

      const state = manager.getObjectiveState('failed-obj');
      expect(state?.isFailed).toBe(true);
      expect(state?.isCompleted).toBe(false);
    });
  });

  describe('Custom Condition Type', () => {
    it('should evaluate custom condition with evaluator function', () => {
      let customValue = false;

      const objectives = [
        createTestObjective({
          id: 'custom-obj',
          conditions: [
            {
              type: 'custom',
              description: 'Custom evaluator',
              mustMaintain: false,
              params: {
                evaluator: () => customValue,
              },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.UPDATE, 16);
      expect(completedCallback).not.toHaveBeenCalled();

      customValue = true;
      eventBus.emit(Events.UPDATE, 16);
      expect(completedCallback).toHaveBeenCalled();
    });

    it('should return false for custom condition without evaluator', () => {
      const objectives = [
        createTestObjective({
          id: 'custom-obj',
          conditions: [
            {
              type: 'custom',
              description: 'No evaluator',
              mustMaintain: false,
              params: {},
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);

      eventBus.emit(Events.UPDATE, 16);
      expect(completedCallback).not.toHaveBeenCalled();
    });
  });

  describe('Service Continuity Condition', () => {
    it('should always pass service-continuity condition (placeholder)', () => {
      const objectives = [
        createTestObjective({
          id: 'service-obj',
          conditions: [
            {
              type: 'service-continuity',
              description: 'Maintain service',
              mustMaintain: false,
              params: { maxPacketLoss: 0.01 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Antenna Conditions', () => {
    it('should evaluate antenna-locked condition when locked', () => {
      mockAntennaState.isLocked = true;

      const objectives = [
        createTestObjective({
          id: 'antenna-obj',
          conditions: [
            { type: 'antenna-locked', description: 'Lock antenna', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate antenna-locked with specific satellite', () => {
      mockAntennaState.isLocked = true;
      mockAntennaState.azimuth = 180;
      mockAntennaState.elevation = 45;

      const objectives = [
        createTestObjective({
          id: 'antenna-obj',
          conditions: [
            {
              type: 'antenna-locked',
              description: 'Lock to satellite',
              mustMaintain: false,
              params: { satelliteId: 12345 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should fail antenna-locked when satellite not found', () => {
      mockAntennaState.isLocked = true;

      const objectives = [
        createTestObjective({
          id: 'antenna-obj',
          conditions: [
            {
              type: 'antenna-locked',
              description: 'Lock to satellite',
              mustMaintain: false,
              params: { satelliteId: 99999 }, // Non-existent satellite
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });

    it('should evaluate antenna-position condition', () => {
      mockAntennaState.azimuth = 180;
      mockAntennaState.elevation = 45;

      const objectives = [
        createTestObjective({
          id: 'position-obj',
          conditions: [
            {
              type: 'antenna-position',
              description: 'Position antenna',
              mustMaintain: false,
              params: { azimuth: 180, elevation: 45, tolerance: 1 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should handle antenna-position with azimuth wraparound', () => {
      mockAntennaState.azimuth = 359;

      const objectives = [
        createTestObjective({
          id: 'position-obj',
          conditions: [
            {
              type: 'antenna-position',
              description: 'Position antenna',
              mustMaintain: false,
              params: { azimuth: 1, tolerance: 3 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate antenna-beacon-frequency-set condition', () => {
      mockAntennaState.beaconFrequencyHz = 3700e6;

      const objectives = [
        createTestObjective({
          id: 'beacon-obj',
          conditions: [
            {
              type: 'antenna-beacon-frequency-set',
              description: 'Set beacon frequency',
              mustMaintain: false,
              params: { beaconFrequency: 3700e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate antenna-tracking-mode-set condition', () => {
      // Step-track is an optimization layer on top of program-track,
      // so we need program-track mode with isStepTrackEnabled = true
      mockAntennaState.trackingMode = 'program-track';
      (mockAntennaState as Record<string, unknown>).isStepTrackEnabled = true;

      const objectives = [
        createTestObjective({
          id: 'tracking-obj',
          conditions: [
            {
              type: 'antenna-tracking-mode-set',
              description: 'Set tracking mode',
              mustMaintain: false,
              params: { trackingMode: 'step-track' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate antenna-beacon-locked condition', () => {
      mockAntennaState.isBeaconLocked = true;

      const objectives = [
        createTestObjective({
          id: 'beacon-lock-obj',
          conditions: [
            { type: 'antenna-beacon-locked', description: 'Lock beacon', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate feed-heater-enabled condition', () => {
      mockAntennaState.isHeaterEnabled = true;

      const objectives = [
        createTestObjective({
          id: 'heater-obj',
          conditions: [
            { type: 'feed-heater-enabled', description: 'Enable heater', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('GPSDO Conditions', () => {
    it('should evaluate gpsdo-locked condition', () => {
      mockGpsdoState.isLocked = true;

      const objectives = [
        createTestObjective({
          id: 'gpsdo-obj',
          conditions: [
            { type: 'gpsdo-locked', description: 'Lock GPSDO', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate gpsdo-warmed-up condition', () => {
      mockGpsdoState.isPowered = true;
      mockGpsdoState.warmupTimeRemaining = 0;
      mockGpsdoState.temperature = 70;

      const objectives = [
        createTestObjective({
          id: 'gpsdo-obj',
          conditions: [
            { type: 'gpsdo-warmed-up', description: 'GPSDO warmed up', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate gpsdo-gnss-locked condition', () => {
      mockGpsdoState.isPowered = true;
      mockGpsdoState.gnssSignalPresent = true;
      mockGpsdoState.satelliteCount = 6;

      const objectives = [
        createTestObjective({
          id: 'gpsdo-obj',
          conditions: [
            { type: 'gpsdo-gnss-locked', description: 'GNSS locked', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate gpsdo-stability condition', () => {
      mockGpsdoState.isPowered = true;
      mockGpsdoState.isLocked = true;
      mockGpsdoState.frequencyAccuracy = 3;
      mockGpsdoState.allanDeviation = 3;
      mockGpsdoState.phaseNoise = -130;

      const objectives = [
        createTestObjective({
          id: 'gpsdo-obj',
          conditions: [
            {
              type: 'gpsdo-stability',
              description: 'GPSDO stable',
              mustMaintain: false,
              params: { maxFrequencyAccuracy: 5 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate gpsdo-not-in-holdover condition', () => {
      mockGpsdoState.isPowered = true;
      mockGpsdoState.isInHoldover = false;

      const objectives = [
        createTestObjective({
          id: 'gpsdo-obj',
          conditions: [
            { type: 'gpsdo-not-in-holdover', description: 'Not in holdover', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('BUC Conditions', () => {
    it('should evaluate buc-locked condition', () => {
      mockBucState.isExtRefLocked = true;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            { type: 'buc-locked', description: 'Lock BUC', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate buc-reference-locked condition', () => {
      mockBucState.isPowered = true;
      mockBucState.isExtRefLocked = true;
      mockBucState.frequencyError = 0;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            { type: 'buc-reference-locked', description: 'BUC ref locked', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate buc-muted condition', () => {
      mockBucState.isPowered = true;
      mockBucState.isMuted = true;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            { type: 'buc-muted', description: 'BUC muted', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate buc-unmuted condition', () => {
      mockBucState.isPowered = true;
      mockBucState.isMuted = false;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            { type: 'buc-unmuted', description: 'BUC unmuted', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate buc-current-normal condition', () => {
      mockBucState.isPowered = true;
      mockBucState.currentDraw = 3.5;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            {
              type: 'buc-current-normal',
              description: 'Current normal',
              mustMaintain: false,
              params: { maxCurrentDraw: 4.5 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate buc-not-saturated condition', () => {
      mockBucState.isPowered = true;
      mockBucState.outputPower = 30;
      mockBucState.saturationPower = 40;

      const objectives = [
        createTestObjective({
          id: 'buc-obj',
          conditions: [
            { type: 'buc-not-saturated', description: 'Not saturated', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('LNB Conditions', () => {
    it('should evaluate lnb-reference-locked condition', () => {
      mockLnbState.isPowered = true;
      mockLnbState.isExtRefLocked = true;
      mockLnbState.frequencyError = 0;

      const objectives = [
        createTestObjective({
          id: 'lnb-obj',
          conditions: [
            { type: 'lnb-reference-locked', description: 'LNB locked', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate lnb-lo-set condition', () => {
      mockLnbState.isPowered = true;
      mockLnbState.loFrequency = 5150e6;

      const objectives = [
        createTestObjective({
          id: 'lnb-obj',
          conditions: [
            {
              type: 'lnb-lo-set',
              description: 'LO set',
              mustMaintain: false,
              params: { loFrequency: 5150e6, loFrequencyTolerance: 1e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate lnb-gain-set condition', () => {
      mockLnbState.isPowered = true;
      mockLnbState.gain = 55;

      const objectives = [
        createTestObjective({
          id: 'lnb-obj',
          conditions: [
            {
              type: 'lnb-gain-set',
              description: 'Gain set',
              mustMaintain: false,
              params: { gain: 55, gainTolerance: 2 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate lnb-thermally-stable condition', () => {
      mockLnbState.isPowered = true;
      mockLnbState.noiseTemperature = 80;
      mockLnbState.temperature = 35;
      mockLnbState.frequencyError = 0;

      const objectives = [
        createTestObjective({
          id: 'lnb-obj',
          conditions: [
            { type: 'lnb-thermally-stable', description: 'Thermally stable', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate lnb-noise-performance condition', () => {
      mockLnbState.isPowered = true;
      mockLnbState.noiseTemperature = 80;

      const objectives = [
        createTestObjective({
          id: 'lnb-obj',
          conditions: [
            {
              type: 'lnb-noise-performance',
              description: 'Noise performance',
              mustMaintain: false,
              params: { maxNoiseTemperature: 100 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('HPA Conditions', () => {
    it('should evaluate hpa-enabled condition', () => {
      mockHpaState.isPowered = true;
      mockHpaState.isHpaEnabled = true;

      const objectives = [
        createTestObjective({
          id: 'hpa-obj',
          conditions: [
            { type: 'hpa-enabled', description: 'HPA enabled', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate hpa-disabled condition', () => {
      mockHpaState.isPowered = true;
      mockHpaState.isHpaEnabled = false;

      const objectives = [
        createTestObjective({
          id: 'hpa-obj',
          conditions: [
            { type: 'hpa-disabled', description: 'HPA disabled', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate hpa-back-off-set condition', () => {
      mockHpaState.isPowered = true;
      mockHpaState.backOff = 3;

      const objectives = [
        createTestObjective({
          id: 'hpa-obj',
          conditions: [
            {
              type: 'hpa-back-off-set',
              description: 'Back-off set',
              mustMaintain: false,
              params: { backOff: 3, backOffTolerance: 0.5 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate hpa-not-overdriven condition', () => {
      mockHpaState.isPowered = true;
      mockHpaState.isOverdriven = false;

      const objectives = [
        createTestObjective({
          id: 'hpa-obj',
          conditions: [
            { type: 'hpa-not-overdriven', description: 'Not overdriven', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate hpa-output-power-set condition', () => {
      mockHpaState.isPowered = true;
      mockHpaState.isHpaEnabled = true;
      mockHpaState.outputPower = 50;

      const objectives = [
        createTestObjective({
          id: 'hpa-obj',
          conditions: [
            {
              type: 'hpa-output-power-set',
              description: 'Output power set',
              mustMaintain: false,
              params: { minOutputPower: 45 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Equipment Power Conditions', () => {
    it('should evaluate equipment-powered for antenna', () => {
      mockAntennaState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'Antenna powered',
              mustMaintain: false,
              params: { equipment: 'antenna' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for gpsdo', () => {
      mockGpsdoState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'GPSDO powered',
              mustMaintain: false,
              params: { equipment: 'gpsdo' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for buc', () => {
      mockBucState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'BUC powered',
              mustMaintain: false,
              params: { equipment: 'buc' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for lnb', () => {
      mockLnbState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'LNB powered',
              mustMaintain: false,
              params: { equipment: 'lnb' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for hpa', () => {
      mockHpaState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'HPA powered',
              mustMaintain: false,
              params: { equipment: 'hpa' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for filter', () => {
      mockFilterState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'Filter powered',
              mustMaintain: false,
              params: { equipment: 'filter' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for spectrum-analyzer (always true)', () => {
      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'Spectrum analyzer powered',
              mustMaintain: false,
              params: { equipment: 'spectrum-analyzer' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-powered for transmitter', () => {
      mockTransmitterModemState.isPowered = true;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'Transmitter powered',
              mustMaintain: false,
              params: { equipment: 'transmitter' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-not-powered for antenna', () => {
      mockAntennaState.isPowered = false;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-not-powered',
              description: 'Antenna not powered',
              mustMaintain: false,
              params: { equipment: 'antenna' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-not-powered for gpsdo', () => {
      mockGpsdoState.isPowered = false;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-not-powered',
              description: 'GPSDO not powered',
              mustMaintain: false,
              params: { equipment: 'gpsdo' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-not-powered for hpa', () => {
      mockHpaState.isPowered = false;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-not-powered',
              description: 'HPA not powered',
              mustMaintain: false,
              params: { equipment: 'hpa' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate equipment-not-powered for transmitter', () => {
      mockTransmitterModemState.isPowered = false;

      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-not-powered',
              description: 'Transmitter not powered',
              mustMaintain: false,
              params: { equipment: 'transmitter' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should return false for equipment-powered with unknown equipment', () => {
      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'Unknown powered',
              mustMaintain: false,
              params: { equipment: 'unknown' as any },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });

    it('should return false for equipment-not-powered with unknown equipment', () => {
      const objectives = [
        createTestObjective({
          id: 'power-obj',
          conditions: [
            {
              type: 'equipment-not-powered',
              description: 'Unknown not powered',
              mustMaintain: false,
              params: { equipment: 'unknown' as any },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });
  });

  describe('Spectrum Analyzer Conditions', () => {
    it('should evaluate signal-detected condition', () => {
      mockInputSignals = [{ signalId: 'test-signal', power: -40 }];

      const objectives = [
        createTestObjective({
          id: 'signal-obj',
          conditions: [
            { type: 'signal-detected', description: 'Signal detected', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate signal-detected with specific signalId', () => {
      mockInputSignals = [{ signalId: 'target-signal', power: -40 }];

      const objectives = [
        createTestObjective({
          id: 'signal-obj',
          conditions: [
            {
              type: 'signal-detected',
              description: 'Specific signal detected',
              mustMaintain: false,
              params: { signalId: 'target-signal' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate signal-detected with minPower', () => {
      mockInputSignals = [{ signalId: 'target-signal', power: -40 }];

      const objectives = [
        createTestObjective({
          id: 'signal-obj',
          conditions: [
            {
              type: 'signal-detected',
              description: 'Signal at power level',
              mustMaintain: false,
              params: { signalId: 'target-signal', minPower: -50 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate signal-level-correct condition', () => {
      mockInputSignals = [{ signalId: 'target-signal', power: -40 }];

      const objectives = [
        createTestObjective({
          id: 'signal-obj',
          conditions: [
            {
              type: 'signal-level-correct',
              description: 'Signal level correct',
              mustMaintain: false,
              params: { signalId: 'target-signal', minPower: -50 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate frequency-set condition', () => {
      mockSpectrumAnalyzerState.centerFrequency = 70e6;

      const objectives = [
        createTestObjective({
          id: 'freq-obj',
          conditions: [
            {
              type: 'frequency-set',
              description: 'Frequency set',
              mustMaintain: false,
              params: { frequency: 70e6, frequencyTolerance: 1e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-span-set condition', () => {
      mockSpectrumAnalyzerState.span = 40e6;

      const objectives = [
        createTestObjective({
          id: 'span-obj',
          conditions: [
            {
              type: 'speca-span-set',
              description: 'Span set',
              mustMaintain: false,
              params: { span: 40e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-rbw-set condition', () => {
      mockSpectrumAnalyzerState.rbw = 100e3;

      const objectives = [
        createTestObjective({
          id: 'rbw-obj',
          conditions: [
            {
              type: 'speca-rbw-set',
              description: 'RBW set',
              mustMaintain: false,
              params: { rbw: 100e3 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-rbw-set with null (automatic)', () => {
      mockSpectrumAnalyzerState.rbw = null;

      const objectives = [
        createTestObjective({
          id: 'rbw-obj',
          conditions: [
            {
              type: 'speca-rbw-set',
              description: 'RBW automatic',
              mustMaintain: false,
              params: { rbw: null },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-reference-level-set condition', () => {
      mockSpectrumAnalyzerState.referenceLevel = -20;

      const objectives = [
        createTestObjective({
          id: 'ref-obj',
          conditions: [
            {
              type: 'speca-reference-level-set',
              description: 'Reference level set',
              mustMaintain: false,
              params: { referenceLevel: -20 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-center-frequency condition', () => {
      mockSpectrumAnalyzerState.centerFrequency = 70e6;

      const objectives = [
        createTestObjective({
          id: 'center-obj',
          conditions: [
            {
              type: 'speca-center-frequency',
              description: 'Center frequency set',
              mustMaintain: false,
              params: { centerFrequency: 70e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-noise-floor-visible condition', () => {
      mockInputSignals = [{ signalId: 'weak-signal', power: -70 }];

      const objectives = [
        createTestObjective({
          id: 'noise-obj',
          conditions: [
            {
              type: 'speca-noise-floor-visible',
              description: 'Noise floor visible',
              mustMaintain: false,
              params: { maxSignalStrength: -60 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-min-amplitude condition', () => {
      mockSpectrumAnalyzerState.minAmplitude = -80;

      const objectives = [
        createTestObjective({
          id: 'amp-obj',
          conditions: [
            {
              type: 'speca-min-amplitude',
              description: 'Min amplitude set',
              mustMaintain: false,
              params: { minAmplitude: -80 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate speca-max-amplitude condition', () => {
      mockSpectrumAnalyzerState.maxAmplitude = -20;

      const objectives = [
        createTestObjective({
          id: 'amp-obj',
          conditions: [
            {
              type: 'speca-max-amplitude',
              description: 'Max amplitude set',
              mustMaintain: false,
              params: { maxAmplitude: -20 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Filter Conditions', () => {
    it('should evaluate filter-bandwidth-set condition', () => {
      mockFilterState.bandwidthIndex = 6;

      const objectives = [
        createTestObjective({
          id: 'filter-obj',
          conditions: [
            {
              type: 'filter-bandwidth-set',
              description: 'Bandwidth set',
              mustMaintain: false,
              params: { bandwidthIndex: 6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate notch-filter-configured condition', () => {
      mockNotchFilterState.notches[0] = {
        enabled: true,
        centerFrequency: 70,
        bandwidth: 2,
        depth: 30,
      };

      const objectives = [
        createTestObjective({
          id: 'notch-obj',
          conditions: [
            {
              type: 'notch-filter-configured',
              description: 'Notch configured',
              mustMaintain: false,
              params: {
                notchCenterFrequency: 70,
                notchBandwidth: 2,
                notchDepth: 30,
              },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate notch-filter-configured with specific index', () => {
      mockNotchFilterState.notches[1] = {
        enabled: true,
        centerFrequency: 75,
        bandwidth: 3,
        depth: 25,
      };

      const objectives = [
        createTestObjective({
          id: 'notch-obj',
          conditions: [
            {
              type: 'notch-filter-configured',
              description: 'Notch at index configured',
              mustMaintain: false,
              params: {
                notchCenterFrequency: 75,
                notchIndex: 1,
              },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Receiver Conditions', () => {
    it('should evaluate receiver-signal-locked condition', () => {
      mockReceiverHasLock = true;

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            { type: 'receiver-signal-locked', description: 'Signal locked', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate receiver-snr-threshold condition', () => {
      mockReceiverSnr = 15;

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            {
              type: 'receiver-snr-threshold',
              description: 'SNR threshold met',
              mustMaintain: false,
              params: { minCNRatio: 10 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate rx-modem-frequency-set condition', () => {
      mockReceiverModemState.frequency = 70;

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            {
              type: 'rx-modem-frequency-set',
              description: 'RX frequency set',
              mustMaintain: false,
              params: { frequency: 70e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate rx-modem-bandwidth-set condition', () => {
      mockReceiverModemState.bandwidth = 36;

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            {
              type: 'rx-modem-bandwidth-set',
              description: 'RX bandwidth set',
              mustMaintain: false,
              params: { bandwidth: 36e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate rx-modem-modulation-set condition', () => {
      mockReceiverModemState.modulation = 'QPSK';

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            {
              type: 'rx-modem-modulation-set',
              description: 'RX modulation set',
              mustMaintain: false,
              params: { modulation: 'QPSK' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate rx-modem-fec-set condition', () => {
      mockReceiverModemState.fec = '1/2';

      const objectives = [
        createTestObjective({
          id: 'rx-obj',
          conditions: [
            {
              type: 'rx-modem-fec-set',
              description: 'RX FEC set',
              mustMaintain: false,
              params: { fec: '1/2' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Transmitter Conditions', () => {
    it('should evaluate tx-modem-frequency-set condition', () => {
      mockTransmitterModemState.ifSignal.frequency = 70e6;

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            {
              type: 'tx-modem-frequency-set',
              description: 'TX frequency set',
              mustMaintain: false,
              params: { frequency: 70e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate tx-modem-power-set condition', () => {
      mockTransmitterModemState.ifSignal.power = -10;

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            {
              type: 'tx-modem-power-set',
              description: 'TX power set',
              mustMaintain: false,
              params: { power: -10 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate tx-modem-bandwidth-set condition', () => {
      mockTransmitterModemState.ifSignal.bandwidth = 36e6;

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            {
              type: 'tx-modem-bandwidth-set',
              description: 'TX bandwidth set',
              mustMaintain: false,
              params: { bandwidth: 36e6 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate tx-modem-modulation-set condition', () => {
      mockTransmitterModemState.ifSignal.modulation = 'QPSK';

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            {
              type: 'tx-modem-modulation-set',
              description: 'TX modulation set',
              mustMaintain: false,
              params: { modulation: 'QPSK' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate tx-modem-fec-set condition', () => {
      mockTransmitterModemState.ifSignal.fec = '1/2';

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            {
              type: 'tx-modem-fec-set',
              description: 'TX FEC set',
              mustMaintain: false,
              params: { fec: '1/2' },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate tx-modem-transmitting condition', () => {
      mockTransmitterModemState.isPowered = true;
      mockTransmitterModemState.isTransmitting = true;

      const objectives = [
        createTestObjective({
          id: 'tx-obj',
          conditions: [
            { type: 'tx-modem-transmitting', description: 'Transmitting', mustMaintain: false },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Traffic Control Conditions', () => {
    it('should evaluate handover-complete condition', () => {
      mockTrafficOwner = 'gs-target';

      const objectives = [
        createTestObjective({
          id: 'handover-obj',
          conditions: [
            {
              type: 'handover-complete',
              description: 'Handover complete',
              mustMaintain: false,
              params: { targetGroundStationId: 'gs-target', satelliteId: 12345 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate traffic-owner condition', () => {
      mockTrafficOwner = 'gs-1';

      const objectives = [
        createTestObjective({
          id: 'traffic-obj',
          conditions: [
            {
              type: 'traffic-owner',
              description: 'Traffic owner',
              mustMaintain: false,
              params: { satelliteId: 12345 },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });

    it('should evaluate traffic-transferred condition', () => {
      mockTrafficOwner = 'gs-target';

      const objectives = [
        createTestObjective({
          id: 'transfer-obj',
          conditions: [
            {
              type: 'traffic-transferred',
              description: 'Traffic transferred',
              mustMaintain: false,
              params: {
                sourceStation: 'gs-source',
                targetStation: 'gs-target',
                satelliteId: 12345,
              },
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should warn for unknown condition type', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const objectives = [
        createTestObjective({
          id: 'unknown-obj',
          conditions: [
            { type: 'unknown-condition' as any, description: 'Unknown', mustMaintain: false },
          ],
        }),
      ];

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(consoleSpy).toHaveBeenCalledWith('Unknown condition type: unknown-condition');
      consoleSpy.mockRestore();
    });

    it('should handle missing required params gracefully', () => {
      const objectives = [
        createTestObjective({
          id: 'missing-params-obj',
          conditions: [
            {
              type: 'signal-level-correct',
              description: 'Missing params',
              mustMaintain: false,
              params: {}, // Missing signalId and minPower
            },
          ],
        }),
      ];

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle equipment-powered without equipment param', () => {
      const objectives = [
        createTestObjective({
          id: 'no-equip-obj',
          conditions: [
            {
              type: 'equipment-powered',
              description: 'No equipment',
              mustMaintain: false,
              params: {}, // Missing equipment
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
    });

    it('should handle antenna-position without required params', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const objectives = [
        createTestObjective({
          id: 'pos-obj',
          conditions: [
            {
              type: 'antenna-position',
              description: 'No position',
              mustMaintain: false,
              params: {}, // Missing azimuth and elevation
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle notch-filter-configured without center frequency', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const objectives = [
        createTestObjective({
          id: 'notch-obj',
          conditions: [
            {
              type: 'notch-filter-configured',
              description: 'No center freq',
              mustMaintain: false,
              params: {}, // Missing notchCenterFrequency
            },
          ],
        }),
      ];

      const completedCallback = vi.fn();
      eventBus.on(Events.OBJECTIVE_COMPLETED, completedCallback);

      ObjectivesManager.initialize(objectives);
      eventBus.emit(Events.UPDATE, 16);

      expect(completedCallback).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
