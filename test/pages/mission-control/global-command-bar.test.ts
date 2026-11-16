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
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.ALARM_STATE_CHANGED, expect.any(Function));
    });
  });

  describe('HTML rendering', () => {
    it('opens every alarm in a keyboard-accessible panel and restores focus on Escape', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      alarmHandler({
        alarms: [
          { assetId: 'VT-01', equipmentType: 'RF', equipmentIndex: 0, severity: 'warning', message: 'No carrier', detail: 'Noise only' },
          { assetId: 'ME-02', equipmentType: 'RX', equipmentIndex: 1, severity: 'info', message: '<img src=x onerror=alert(1)>' },
        ],
        highestSeverity: 'warning',
      });
      const summary = document.querySelector<HTMLButtonElement>('#alarm-summary')!;
      const panel = document.querySelector<HTMLElement>('#mission-alarm-panel')!;
      expect(panel.hidden).toBe(true);
      summary.click();
      expect(panel.hidden).toBe(false);
      expect(summary.getAttribute('aria-expanded')).toBe('true');
      expect(panel.querySelectorAll('.mission-alarm-entry')).toHaveLength(2);
      expect(panel.textContent).toContain('Noise only');
      expect(panel.textContent).toContain('ME-02');
      expect(panel.querySelector('img')).toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel.hidden).toBe(true);
      expect(document.activeElement).toBe(summary);
      summary.click();
      document.body.click();
      expect(panel.hidden).toBe(true);
    });

    it('keeps the open alarm list current when alarms clear', () => {
      document.querySelector<HTMLButtonElement>('#alarm-summary')!.click();
      const handler = mockEventBus.on.mock.calls.find((call) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      handler({ alarms: [], highestSeverity: 'success' });
      expect(document.querySelector('#mission-alarm-list')?.textContent).toBe('No active alarms');
      expect(document.querySelector('#mission-alarm-total')?.textContent).toBe('0');
      expect(document.querySelectorAll('#global-command-bar-container')).toHaveLength(1);
    });

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
      expect(clock?.textContent).toBe('--:--:-- UTC');
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
      expect(scenarioInfo?.textContent).toContain('01 · First Day');
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

    it('should render No active alarms by default', () => {
      const stableMessage = document.querySelector('.alarm-stable');
      expect(stableMessage).not.toBeNull();
      expect(stableMessage?.textContent).toContain('No active alarms');
      expect(stableMessage?.querySelector('[data-glyph="ok"] svg')).not.toBeNull();
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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

      const alarmData: AlarmStateChangedData = {
        alarms: [],
        highestSeverity: 'success',
      };

      alarmHandler?.(alarmData);

      const alarmBar = document.querySelector('#alarm-bar');
      expect(alarmBar?.classList.contains('healthy')).toBe(true);
    });

    it('should show warning state for warning severity', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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

    it('should render one priority alarm inline', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

      const mockAlarms: AggregatedAlarm[] = Array(5)
        .fill(null)
        .map((_, i) => ({
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
      expect(alarmItems.length).toBe(1);
    });

    it('draws inline severity glyphs, not Font Awesome classes the app never loads (Phase 32 D21)', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      const base = { assetId: 'GS-001', equipmentType: 'antenna', equipmentIndex: 0, timestamp: Date.now() };

      alarmHandler?.({
        alarms: [
          { ...base, alarmId: 'e', severity: 'error' as const, message: 'Lock lost' },
          { ...base, alarmId: 'w', severity: 'warning' as const, message: 'Low Eb/No' },
        ],
        highestSeverity: 'error',
      });

      const bar = document.querySelector('#global-command-bar-container');
      expect(bar?.querySelector('[class*="fa-"]')).toBeNull();
      expect(document.querySelector('.alarm-count.error [data-glyph="error"] svg')).not.toBeNull();
      expect(document.querySelector('.alarm-count.warning [data-glyph="warning"] svg')).not.toBeNull();
      const items = document.querySelectorAll('.mission-alarm-entry');
      expect(items[0].getAttribute('data-severity')).toBe('error');
      expect(items[0].querySelector('[data-glyph="error"]')?.getAttribute('aria-hidden')).toBe('true');
      expect(items[1].getAttribute('data-severity')).toBe('warning');
      expect(items[1].querySelector('[data-glyph="warning"]')).not.toBeNull();
    });

    it('should show overflow indicator when more than one alarm', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

      const mockAlarms: AggregatedAlarm[] = Array(5)
        .fill(null)
        .map((_, i) => ({
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
      expect(overflow?.textContent).toContain('+4 more');
    });

    it('lists every tier, counts them all and names the hidden ones in the tooltip (nats-r4-s16-F1)', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      const alarm = (severity: AggregatedAlarm['severity'], message: string, equipmentIndex = 0): AggregatedAlarm => ({
        severity,
        message,
        assetId: 'VT-01',
        equipmentType: 'RF',
        equipmentIndex,
      });

      alarmHandler?.({
        alarms: [
          alarm('error', 'BUC over-temperature (72.3 °C)'),
          alarm('error', 'BUC high current draw (5.37 A)'),
          alarm('warning', 'HPA overdrive - IMD degradation'),
          alarm('warning', 'LNB not locked to reference'),
          alarm('info', 'Signal(s) Detected'),
        ],
        highestSeverity: 'error',
      });

      expect(document.querySelector('.alarm-stable')).toBeNull();
      expect(document.querySelector('.alarm-count.error')?.textContent?.trim()).toBe('2 errors');
      expect(document.querySelector('.alarm-count.warning')?.textContent?.trim()).toBe('2 warnings');
      expect(document.querySelector('.alarm-count.info')?.textContent?.trim()).toBe('1 info');
      expect(document.querySelector('.alarm-overflow')?.textContent).toContain('+4 more');
      const tooltip = (document.querySelector('#alarm-messages') as HTMLElement).title;
      expect(tooltip.split('\n')).toHaveLength(5);
      expect(tooltip).toContain('LNB not locked to reference');
      expect(tooltip).toContain('Signal(s) Detected');
    });

    it('counts only unlisted alarms in "(N on other stations)" (nats-r5-s21-F1)', () => {
      const handler = (name: string) => mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === name)?.[1];
      const rx = (assetId: string): AggregatedAlarm => ({ severity: 'info', message: 'Signal(s) Detected', assetId, equipmentType: 'RX', equipmentIndex: 0 });

      handler(Events.ASSET_SELECTED)?.({ type: 'ground-station', id: 'ME-02' });
      handler(Events.ALARM_STATE_CHANGED)?.({ alarms: [rx('VT-01'), rx('ME-02')], highestSeverity: 'info' });
      expect(document.querySelector('.alarm-other-stations')).toBeNull();

      handler(Events.ALARM_STATE_CHANGED)?.({
        alarms: [
          { severity: 'error', message: 'E1', assetId: 'ME-02', equipmentType: 'RF', equipmentIndex: 0 },
          { severity: 'error', message: 'E2', assetId: 'ME-02', equipmentType: 'RF', equipmentIndex: 0 },
          { severity: 'error', message: 'E3', assetId: 'ME-02', equipmentType: 'RF', equipmentIndex: 0 },
          rx('VT-01'),
        ],
        highestSeverity: 'error',
      });
      expect(document.querySelector('.alarm-other-stations')?.textContent).toBe('(1 on other stations)');
    });

    it('keeps a fixed alarm label inline and puts its live value in the tooltip (nats-r5-s14-F2)', () => {
      const handler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      const rain = { severity: 'info', message: 'RAIN FADE', detail: 'fade 0.7 dB', assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0 };
      handler?.({ alarms: [rain], highestSeverity: 'info' });

      expect(document.querySelector('.alarm-item')?.textContent).toContain('VT-01(ANT1): RAIN FADE');
      expect(document.querySelector('.alarm-item')?.textContent).not.toContain('0.7');
      expect((document.querySelector('#alarm-messages') as HTMLElement).title).toBe('VT-01(ANT1): RAIN FADE - fade 0.7 dB');
    });

    it('should sort alarms by severity (errors first)', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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

      const alarmItems = document.querySelectorAll('.mission-alarm-entry');
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
      });

      vi.advanceTimersByTime(1000);

      const scenarioValue = document.querySelector('#scenario-timer-value');
      expect(scenarioValue?.textContent).toBe('--:--');
      expect(document.querySelector<HTMLElement>('#scenario-timer-display')?.title).toBe('No time limit');
    });

    it('should show scenario time remaining when timer is active', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 120),
        formatTimeRemaining: vi.fn(() => '02:00'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
      });

      vi.advanceTimersByTime(1000);

      const scenarioTimer = document.querySelector('#scenario-timer-display');
      expect(scenarioTimer?.classList.contains('timer-warning')).toBe(true);
    });

    it('should show objective timer with active timed objective', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
        formatTimeRemaining: vi.fn(() => '01:30'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test Objective', timeLimitSeconds: 120 },
            isActive: true,
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
        formatTimeRemaining: vi.fn(() => '00:20'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test', timeLimitSeconds: 60 },
            isActive: true,
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
        formatTimeRemaining: vi.fn(() => '00:45'),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Test', timeLimitSeconds: 120 },
            isActive: true,
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
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
        getObjectiveStates: vi.fn(() => []),
      });

      vi.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const objectiveTimer = document.querySelector('#objective-timer-display');
      expect(objectiveValue?.textContent).toBe('No limit');
      expect((objectiveTimer as HTMLElement | null)?.title).toBe('No time limit');
      expect(objectiveTimer?.classList.contains('timer-unlimited')).toBe(true);
    });

    it('shows no countdown for an objective whose timed work is done (Phase 27 Q1)', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => true),
        getMissionClockHold: vi.fn(() => null),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'obj1', title: 'Read the C/N', timeLimitSeconds: 120 },
            isActive: true,
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 90,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      const objectiveTimer = document.querySelector<HTMLElement>('#objective-timer-display');
      expect(document.querySelector('#objective-timer-value')?.textContent).toBe('No limit');
      expect(objectiveTimer?.title).toContain('No time limit on the questions');
    });
  });

  describe('simulated time handling', () => {
    it('should subscribe to SIMULATED_TIME_TICK events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.SIMULATED_TIME_TICK, expect.any(Function));
    });

    it('should update clock on SIMULATED_TIME_TICK event', () => {
      const timeTickHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SIMULATED_TIME_TICK)?.[1];

      timeTickHandler?.({ timeFormatted: '01 Jan 2024 12:34:56', timestampMs: Date.UTC(2024, 0, 1, 12, 34, 56) });

      const clock = document.querySelector('#utc-clock');
      expect(clock?.textContent).toBe('12:34:56 UTC');
    });

    it('preserves the weekday in the clock tooltip (briefs open with "Wednesday, 1430")', () => {
      const timeTickHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.SIMULATED_TIME_TICK)?.[1];

      timeTickHandler?.({ timeFormatted: '04 FEB 2026 14:30:00', timestampMs: Date.UTC(2026, 1, 4, 14, 30, 0) });

      expect(document.querySelector('#utc-clock')?.textContent).toBe('14:30:00 UTC');
      expect(document.querySelector('#utc-clock')?.getAttribute('title')).toContain('WED 04 FEB 2026 14:30:00');
    });

    it('should unsubscribe from SIMULATED_TIME_TICK on dispose', () => {
      commandBar.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.SIMULATED_TIME_TICK, expect.any(Function));
    });
  });

  describe('alarm severity colors and icons', () => {
    it('should apply success color for unknown severity', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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
      const alarmHandler = mockEventBus.on.mock.calls.find((call: [string, Function]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];

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

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.ALARM_STATE_CHANGED, expect.any(Function));
    });

    it('should clear timer interval', () => {
      const timerCount = vi.getTimerCount();
      commandBar.dispose();

      // Timer should be cleared
      vi.advanceTimersByTime(2000);
      // No errors should occur from timer callback
    });
  });

  describe('Phase 28 D1 / nats-r3 timers', () => {
    it('shows HOLD beside the MISSION timer while an objective wait holds it', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 1800),
        formatTimeRemaining: vi.fn(() => '30:00'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => ({ objectiveId: 'sustained-monitor', title: 'Hold Through the Cell', label: 'rain cell' })),
      });

      vi.advanceTimersByTime(1000);

      const tag = document.querySelector<HTMLElement>('#scenario-timer-hold');
      expect(tag?.hidden).toBe(false);
      expect(document.querySelector('#scenario-timer-display')?.classList.contains('timer-held')).toBe(true);
      expect(document.querySelector<HTMLElement>('#scenario-timer-display')?.title).toContain('rain cell');
    });

    it('hides HOLD when nothing holds the mission clock', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => true),
        getScenarioTimeRemaining: vi.fn(() => 1800),
        formatTimeRemaining: vi.fn(() => '30:00'),
        getObjectiveStates: vi.fn(() => []),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
      });

      vi.advanceTimersByTime(1000);

      expect(document.querySelector<HTMLElement>('#scenario-timer-hold')?.hidden).toBe(true);
    });

    it('reads only active objectives, like the checklist row (nats-r3-s24-F2)', () => {
      ObjectivesManager.getInstance.mockReturnValue({
        hasScenarioTimer: vi.fn(() => false),
        isQuizPassed: vi.fn(() => false),
        isObjectiveCountdownHeld: vi.fn(() => false),
        getMissionClockHold: vi.fn(() => null),
        formatTimeRemaining: vi.fn((s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`),
        getObjectiveStates: vi.fn(() => [
          {
            objective: { id: 'stale', title: 'Stale', timeLimitSeconds: 60 },
            isActive: false,
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 58,
          },
          {
            objective: { id: 'heater', title: 'Heater Before the Front', timeLimitSeconds: 180 },
            isActive: true,
            isTimerRunning: true,
            isCompleted: false,
            isFailed: false,
            timeRemainingSeconds: 180,
          },
        ]),
      });

      vi.advanceTimersByTime(1000);

      expect(document.querySelector('#objective-timer-value')?.textContent).toBe('3:00');
    });

    it('repaints the timers when an objective activates, not on the next tick', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.OBJECTIVE_ACTIVATED, expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.OBJECTIVES_ALL_COMPLETED, expect.any(Function));
    });

    it('labels an objective skip by where it lands', () => {
      const landsAtMs = Date.UTC(2026, 1, 17, 10, 0, 0);
      expect(GlobalCommandBar.objectiveSkipText({ objectiveId: 'a', deltaMs: 712_000, landsAtMs, label: 'standby' })).toBe('Skip to 10:00');
      expect(GlobalCommandBar.objectiveSkipText({ objectiveId: 'a', deltaMs: 60_000, landsAtMs: landsAtMs + 17_000, label: 'cell' })).toBe('Skip to 10:00:17');
      expect(GlobalCommandBar.objectiveSkipText({ objectiveId: 'a', deltaMs: 7.2 * 60_000, landsAtMs: null, label: 'hold' })).toBe('Skip 8 min');
      expect(GlobalCommandBar.objectiveSkipText({ objectiveId: 'a', deltaMs: 40_000, landsAtMs: null, label: 'hold' })).toBe('Skip 40 s');
    });

    it('titles an objective skip as one sentence naming the end of the wait (nats-r4-s10-F3)', () => {
      const landsAtMs = Date.UTC(2026, 1, 17, 10, 0, 0);
      expect(GlobalCommandBar.objectiveSkipTitle({ objectiveId: 'a', deltaMs: 712_000, landsAtMs, label: 'standby' })).toBe(
        'Skip to 10:00, the end of the standby. The mission clock is held while you wait, so waiting and skipping score the same.'
      );
      expect(GlobalCommandBar.objectiveSkipTitle({ objectiveId: 'a', deltaMs: 7 * 60_000, landsAtMs: null, label: 'the crew maintenance window' })).toBe(
        'Skip 7 min, the end of the crew maintenance window. The mission clock is held while you wait, so waiting and skipping score the same.'
      );
    });
  });
});
