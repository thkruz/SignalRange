import { GlobalCommandBar } from '../../../src/pages/mission-control/global-command-bar';
import { EventBus } from '../../../src/events/event-bus';
import { Events, AggregatedAlarm, AlarmStateChangedData } from '../../../src/events/events';

// Mock dependencies
jest.mock('../../../src/events/event-bus');
jest.mock('../../../src/objectives/objectives-manager', () => ({
  ObjectivesManager: {
    getInstance: jest.fn(() => {
      throw new Error('ObjectivesManager not initialized');
    }),
  },
}));
jest.mock('../../../src/engine/utils/query-selector', () => ({
  qs: jest.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

describe('GlobalCommandBar', () => {
  let containerEl: HTMLElement;
  let commandBar: GlobalCommandBar;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'test-container';
    document.body.appendChild(containerEl);

    commandBar = new GlobalCommandBar('test-container');
  });

  afterEach(() => {
    commandBar.dispose();
    document.body.innerHTML = '';
    jest.useRealTimers();
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
      expect(clock?.textContent).toBe('Loading...');
    });

    it('should render AOS countdown section', () => {
      const aosCountdown = document.querySelector('.aos-countdown');
      expect(aosCountdown).not.toBeNull();
    });

    it('should render NEXT AOS IN label', () => {
      const aosLabel = document.body.innerHTML;
      expect(aosLabel).toContain('NEXT AOS IN');
    });

    it('should render pass ID', () => {
      const passId = document.body.innerHTML;
      expect(passId).toContain('PASS ID: 9942');
    });

    it('should render satellite info', () => {
      const satInfo = document.body.innerHTML;
      expect(satInfo).toContain('SAT: GALAXY-19');
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
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('should show pending state when ObjectivesManager not initialized', () => {
      jest.advanceTimersByTime(1000);

      const objectiveValue = document.querySelector('#objective-timer-value');
      const scenarioValue = document.querySelector('#scenario-timer-value');

      expect(objectiveValue?.textContent).toBe('--:--');
      expect(scenarioValue?.textContent).toBe('--:--');
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
      const timerCount = jest.getTimerCount();
      commandBar.dispose();

      // Timer should be cleared
      jest.advanceTimersByTime(2000);
      // No errors should occur from timer callback
    });
  });
});
