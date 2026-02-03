import { Mock, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { AggregatedAlarm, AlarmStateChangedData, Events } from '../../../src/events/events';
import { GlobalCommandBar } from '../../../src/pages/mission-control/global-command-bar';

// Mock dependencies
vi.mock('../../../src/events/event-bus');
vi.mock('../../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    getInstance: vi.fn(() => {
      throw new Error('ObjectivesManager not initialized');
    }),
  },
}));
vi.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      data: {
        number: 1,
        title: 'First Day',
      },
    })),
  },
}));
vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

import { ObjectivesManager } from '../../../src/objectives/objectives-manager';
describe('GlobalCommandBar', () => {
  let containerEl: HTMLElement;
  let commandBar: GlobalCommandBar;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'test-container';
    document.body.appendChild(containerEl);

    commandBar = new GlobalCommandBar('test-container');
  });

  afterEach(() => {
    commandBar.dispose();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(commandBar).toBeInstanceOf(GlobalCommandBar);
    });

    it('should set correct id', () => {
      expect(commandBar.id).toBe('global-command-bar-container');
    });

    it('should subscribe to ALARM_STATE_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ALARM_STATE_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('HTML rendering', () => {
    it('should render header element', () => {
      const header = document.querySelector('#global-command-bar-container');
      expect(header).not.toBeNull();
    });

    it('should render branding section', () => {
      const brandingText = document.body.innerHTML;
      expect(brandingText).toContain('ORBITAL');
      expect(brandingText).toContain('OPS');
    });

    it('should render UTC clock element', () => {
      const clock = document.querySelector('#utc-clock');
      expect(clock).not.toBeNull();
      expect(clock?.textContent).toBe('-- --- ---- --:--:--');
    });

    it('should render AOS countdown section', () => {
      const aosCountdown = document.querySelector('.aos-countdown');
      expect(aosCountdown).not.toBeNull();
    });

    it('should render scenario info element', () => {
      const scenarioInfo = document.querySelector('#scenario-info');
      expect(scenarioInfo).not.toBeNull();
    });

    it('should render scenario number and title', () => {
      const scenarioInfo = document.querySelector('#scenario-info');
      expect(scenarioInfo?.textContent).toContain('SCENARIO 1: First Day');
    });

    it('should render alarm bar', () => {
      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar).not.toBeNull();
    });

    it('should render alarm counts container', () => {
      const alarmCounts = document.querySelector('#alarm-counts');
      expect(alarmCounts).not.toBeNull();
    });

    it('should render alarm messages container', () => {
      const alarmMessages = document.querySelector('#alarm-messages');
      expect(alarmMessages).not.toBeNull();
    });

    it('should render SYSTEM STABLE by default', () => {
      const stableMessage = document.querySelector('.alarm-stable');
      expect(stableMessage).not.toBeNull();
      expect(stableMessage?.textContent).toContain('SYSTEM STABLE');
    });

    it('should render objective timer display', () => {
      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveTimer).not.toBeNull();
    });

    it('should render scenario timer display', () => {
      const scenarioTimer = document.querySelector('#scenario-timer-display');
      expect(scenarioTimer).not.toBeNull();
    });

    it('should render timer value elements', () => {
      const objectiveValue = document.querySelector('#objective-timer-value');
      const scenarioValue = document.querySelector('#scenario-timer-value');
      expect(objectiveValue).not.toBeNull();
      expect(scenarioValue).not.toBeNull();
    });
  });

  describe('alarm state handling', () => {
    it('should update alarm bar on ALARM_STATE_CHANGED event', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'test-alarm',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'error',
          message: 'Test error message',
          timestamp: Date.now(),
        },
      ];

      const alarmData: AlarmStateChangedData = {
        alarms: mockAlarms,
        highestSeverity: 'error',
      };

      alarmHandler?.(alarmData);

      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar?.classList.contains('alarm')).toBe(true);
    });

    it('should show healthy state when no alarms', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const alarmData: AlarmStateChangedData = {
        alarms: [],
        highestSeverity: 'success',
      };

      alarmHandler?.(alarmData);

      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar?.classList.contains('healthy')).toBe(true);
    });

    it('should show warning state for warning severity', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'test-alarm',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'warning',
          message: 'Test warning',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'warning',
      });

      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar?.classList.contains('warn')).toBe(true);
    });

    it('should show info state for info severity', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'test-alarm',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'info',
          message: 'Test info',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'info',
      });

      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar?.classList.contains('info')).toBe(true);
    });

    it('should render error count badge', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'error-1',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'error',
          message: 'Error 1',
          timestamp: Date.now(),
        },
        {
          alarmId: 'error-2',
          assetId: 'GS-001',
          equipmentType: 'receiver',
          equipmentIndex: 0,
          severity: 'error',
          message: 'Error 2',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'error',
      });

      const errorBadge = document.querySelector('.alarm-count.error');
      expect(errorBadge).not.toBeNull();
      expect(errorBadge?.textContent).toContain('2');
    });

    it('should render warning count badge', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'warning-1',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'warning',
          message: 'Warning 1',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'warning',
      });

      const warningBadge = document.querySelector('.alarm-count.warning');
      expect(warningBadge).not.toBeNull();
      expect(warningBadge?.textContent).toContain('1');
    });

    it('should render max 3 inline alarms', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = Array(5).fill(null).map((_, i) => ({
        alarmId: `error-${i}`,
        assetId: 'GS-001',
        equipmentType: 'antenna',
        equipmentIndex: i,
        severity: 'error' as const,
        message: `Error ${i}`,
        timestamp: Date.now(),
      }));

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'error',
      });

      const alarmItems = document.querySelectorAll('.alarm-item');
      expect(alarmItems.length).toBe(3);
    });

    it('should show overflow indicator when more than 3 alarms', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = Array(5).fill(null).map((_, i) => ({
        alarmId: `error-${i}`,
        assetId: 'GS-001',
        equipmentType: 'antenna',
        equipmentIndex: i,
        severity: 'error' as const,
        message: `Error ${i}`,
        timestamp: Date.now(),
      }));

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'error',
      });

      const overflow = document.querySelector('.alarm-overflow');
      expect(overflow).not.toBeNull();
      expect(overflow?.textContent).toContain('+2 more');
    });

    it('should sort alarms by severity (errors first)', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'info-1',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'info',
          message: 'Info message',
          timestamp: Date.now(),
        },
        {
          alarmId: 'error-1',
          assetId: 'GS-001',
          equipmentType: 'receiver',
          equipmentIndex: 0,
          severity: 'error',
          message: 'Error message',
          timestamp: Date.now(),
        },
        {
          alarmId: 'warning-1',
          assetId: 'GS-001',
          equipmentType: 'transmitter',
          equipmentIndex: 0,
          severity: 'warning',
          message: 'Warning message',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'error',
      });

      const alarmItems = document.querySelectorAll('.alarm-item');
      expect(alarmItems[0]?.textContent).toContain('Error message');
      expect(alarmItems[1]?.textContent).toContain('Warning message');
      expect(alarmItems[2]?.textContent).toContain('Info message');
    });
  });

  describe('timer updates', () => {
    it('should start timer update interval', () => {
      // Timer should be set
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('should show pending state when ObjectivesManager not initialized', () => {
      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const scenarioValue = document.querySelector('#scenario-timer-value');

      expect(objectiveValue?.textContent).toBe('--:--');
      expect(scenarioValue?.textContent).toBe('--:--');
    });

    it('should show unlimited indicator when no scenario time limit', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
      });

      vi.advanceTimersByTime(1000);

      const scenarioValue = document.querySelector('#scenario-timer-value');
      expect(scenarioValue?.textContent).toBe('∞');
    });

    it('should show scenario time remaining when timer is active', () => {

      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 120),
        formatTimeRemaining: vi.fn(() => '02:00'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
      });

      vi.advanceTimersByTime(1000);

      const scenarioValue = document.querySelector('#scenario-timer-value');
      expect(scenarioValue?.textContent).toBe('02:00');
    });

    it('should show FAIL when scenario timer expires', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 0),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
      });

      vi.advanceTimersByTime(1000);

      const scenarioValue = document.querySelector('#scenario-timer-value');
      const scenarioTimer = document.querySelector('#scenario-timer-display');
      expect(scenarioValue?.textContent).toBe('FAIL');
      expect(scenarioTimer?.classList.contains('timer-failed')).toBe(true);
    });

    it('should add timer-urgent class when under 60 seconds', () => {

      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 30),
        formatTimeRemaining: vi.fn(() => '00:30'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
      });

      vi.advanceTimersByTime(1000);

      const scenarioTimer = document.querySelector('#scenario-timer-display');
      expect(scenarioTimer?.classList.contains('timer-urgent')).toBe(true);
    });

    it('should add timer-warning class when under 300 seconds', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 180),
        formatTimeRemaining: vi.fn(() => '03:00'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
      });

      vi.advanceTimersByTime(1000);

      const scenarioTimer = document.querySelector('#scenario-timer-display');
      expect(scenarioTimer?.classList.contains('timer-warning')).toBe(true);
    });

    it('should show objective timer with active timed objective', () => {

      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        formatTimeRemaining: vi.fn(() => '01:30'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test Objective', timeLimitSeconds: 120 },
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 90,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      expect(objectiveValue?.textContent).toBe('01:30');
    });

    it('should show PASS when quiz is passed', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => true),
        getPassedObjectiveId: vi.fn(() => 'obj1'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Quiz Objective' },
            isCompleted: true,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveValue?.textContent).toBe('PASS');
      expect(objectiveTimer?.classList.contains('timer-passed')).toBe(true);
    });

    it('should show FAIL when objective fails', () => {

      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Failed Objective', timeLimitSeconds: 60 },
            isFailed: true,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveValue?.textContent).toBe('FAIL');
      expect(objectiveTimer?.classList.contains('timer-failed')).toBe(true);
    });

    it('should add objective timer-urgent class when under 30 seconds', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        formatTimeRemaining: vi.fn(() => '00:20'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test', timeLimitSeconds: 60 },
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 20,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveTimer?.classList.contains('timer-urgent')).toBe(true);
    });

    it('should add objective timer-warning class when under 60 seconds', () => {

      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        formatTimeRemaining: vi.fn(() => '00:45'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test', timeLimitSeconds: 120 },
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 45,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveTimer?.classList.contains('timer-warning')).toBe(true);
    });

    it('should show unlimited indicator when no active objective timer', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        getObjectiveStates: vi.fn(() => []),
      });

      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveValue?.textContent).toBe('∞');
      expect(objectiveTimer?.classList.contains('timer-unlimited')).toBe(true);
    });
  });

  describe('simulated time handling', () => {
    it('should subscribe to SIMULATED_TIME_TICK events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.SIMULATED_TIME_TICK,
        expect.any(Function)
      );
    });

    it('should update clock on SIMULATED_TIME_TICK event', () => {
      const timeTickHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.SIMULATED_TIME_TICK
      )?.[1];

      timeTickHandler?.({ timeFormatted: '01 Jan 2024 12:34:56' });

      const clock = document.querySelector('#utc-clock');
      expect(clock?.textContent).toBe('01 Jan 2024 12:34:56');
    });

    it('should unsubscribe from SIMULATED_TIME_TICK on dispose', () => {
      commandBar.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.SIMULATED_TIME_TICK,
        expect.any(Function)
      );
    });
  });

  describe('alarm severity colors and icons', () => {
    it('should apply success color for unknown severity', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'success-1',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'success' as any,
          message: 'Success message',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'success',
      });

      const alarmItem = document.querySelector('.alarm-item');
      expect(alarmItem?.classList.contains('text-green-400')).toBe(true);
    });

    it('should render info count badge', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find(
        (call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED
      )?.[1];

      const mockAlarms: AggregatedAlarm[] = [
        {
          alarmId: 'info-1',
          assetId: 'GS-001',
          equipmentType: 'antenna',
          equipmentIndex: 0,
          severity: 'info',
          message: 'Info 1',
          timestamp: Date.now(),
        },
        {
          alarmId: 'info-2',
          assetId: 'GS-001',
          equipmentType: 'receiver',
          equipmentIndex: 0,
          severity: 'info',
          message: 'Info 2',
          timestamp: Date.now(),
        },
      ];

      alarmHandler?.({
        alarms: mockAlarms,
        highestSeverity: 'info',
      });

      const infoBadge = document.querySelector('.alarm-count.info');
      expect(infoBadge).not.toBeNull();
      expect(infoBadge?.textContent).toContain('2');
    });
  });

  describe('dispose', () => {
    it('should unsubscribe from EventBus events', () => {
      commandBar.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.ALARM_STATE_CHANGED,
        expect.any(Function)
      );
    });

    it('should clear timer interval', () => {
      const timerCount = vi.getTimerCount();
      commandBar.dispose();

      // Timer should be cleared
      vi.advanceTimersByTime(2000);
      // No errors should occur from timer callback
    });
  });
});
