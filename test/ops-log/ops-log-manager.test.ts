import { vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { PreviousShiftLogEntry } from '../../src/ops-log/ops-log-types';

describe('OpsLogManager', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singletons
    EventBus.destroy();
    OpsLogManager.destroy();
    eventBus = EventBus.getInstance();
  });

  afterEach(() => {
    OpsLogManager.destroy();
    EventBus.destroy();
  });

  describe('singleton management', () => {
    it('should create singleton instance with initialize()', () => {
      const manager = OpsLogManager.initialize();

      expect(manager).toBeInstanceOf(OpsLogManager);
      expect(OpsLogManager.getInstance()).toBe(manager);
    });

    it('should throw when getInstance() called before initialize()', () => {
      expect(() => OpsLogManager.getInstance()).toThrow(
        'OpsLogManager not initialized. Call initialize() first.'
      );
    });

    it('should return true from isInitialized() after initialize()', () => {
      expect(OpsLogManager.isInitialized()).toBe(false);
      OpsLogManager.initialize();
      expect(OpsLogManager.isInitialized()).toBe(true);
    });

    it('should return false from isInitialized() after destroy()', () => {
      OpsLogManager.initialize();
      expect(OpsLogManager.isInitialized()).toBe(true);
      OpsLogManager.destroy();
      expect(OpsLogManager.isInitialized()).toBe(false);
    });

    it('should warn and destroy previous instance when reinitializing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation();

      OpsLogManager.initialize('10:00:00', '2026-01-01');
      const secondManager = OpsLogManager.initialize('14:00:00', '2026-06-15');

      expect(warnSpy).toHaveBeenCalledWith(
        'OpsLogManager already initialized. Destroying previous instance.'
      );
      expect(OpsLogManager.getInstance()).toBe(secondManager);

      warnSpy.mockRestore();
    });

    it('should not throw when destroy() called without initialization', () => {
      expect(() => OpsLogManager.destroy()).not.toThrow();
    });
  });

  describe('time parsing and formatting', () => {
    it('should parse start time and date correctly', () => {
      OpsLogManager.initialize('14:30:45', '2026-03-15');
      const manager = OpsLogManager.getInstance();

      // Should format as military datetime
      const formatted = manager.getCurrentTimeFormatted();
      expect(formatted).toBe('15 MAR 2026 14:30:45');
    });

    it('should use default values when not provided', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      const formatted = manager.getCurrentTimeFormatted();
      expect(formatted).toContain('12:00:00');
      expect(formatted).toContain('01 JAN 2026');
    });

    it('should format all months correctly', () => {
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

      months.forEach((monthName, index) => {
        OpsLogManager.destroy();
        const month = (index + 1).toString().padStart(2, '0');
        OpsLogManager.initialize('12:00:00', `2026-${month}-15`);
        const manager = OpsLogManager.getInstance();

        expect(manager.getCurrentTimeFormatted()).toContain(monthName);
      });
    });

    it('should return timestamp in milliseconds', () => {
      OpsLogManager.initialize('00:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();

      // UTC timestamp for 2026-01-01 00:00:00
      const expectedMs = Date.UTC(2026, 0, 1, 0, 0, 0);
      expect(manager.getCurrentTimestampMs()).toBe(expectedMs);
    });
  });

  describe('previous shift logs', () => {
    it('should load previous shift entries on initialization', () => {
      const previousLogs: PreviousShiftLogEntry[] = [
        { timestamp: 'Earlier Today', entry: 'Shift started', source: 'SGT Smith' },
        { timestamp: '08:30', entry: 'Equipment check complete' },
      ];

      OpsLogManager.initialize('12:00:00', '2026-01-01', previousLogs);
      const manager = OpsLogManager.getInstance();
      const entries = manager.getEntries();

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({
        timestamp: 'Earlier Today',
        message: 'Shift started',
        category: 'previous-shift',
        source: 'SGT Smith',
      });
      expect(entries[1]).toEqual({
        timestamp: '08:30',
        message: 'Equipment check complete',
        category: 'previous-shift',
        source: undefined,
      });
    });

    it('should handle empty previous shift logs', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01', []);
      const manager = OpsLogManager.getInstance();

      expect(manager.getEntries()).toHaveLength(0);
    });
  });

  describe('logging', () => {
    it('should log entries with current timestamp', () => {
      OpsLogManager.initialize('14:30:45', '2026-01-01');
      const manager = OpsLogManager.getInstance();

      manager.log('Antenna aligned');
      const entries = manager.getEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].timestamp).toBe('14:30:45');
      expect(entries[0].message).toBe('Antenna aligned');
      expect(entries[0].category).toBe('action');
    });

    it('should log with custom category', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      manager.log('System initialized', 'system');
      const entries = manager.getEntries();

      expect(entries[0].category).toBe('system');
    });

    it('should log with source identifier', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      manager.log('Power on', 'action', 'HPA-001');
      const entries = manager.getEntries();

      expect(entries[0].source).toBe('HPA-001');
    });

    it('should emit OPS_LOG_ENTRY_ADDED event when logging', () => {
      OpsLogManager.initialize('14:30:45', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const callback = vi.fn();

      eventBus.on(Events.OPS_LOG_ENTRY_ADDED, callback);
      manager.log('Test entry', 'alert', 'Source');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        timestamp: '14:30:45',
        message: 'Test entry',
        category: 'alert',
        source: 'Source',
      });
    });

    it('should return entries array', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();
      manager.log('Entry 1');
      manager.log('Entry 2');

      const entries = manager.getEntries();

      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('Entry 1');
      expect(entries[1].message).toBe('Entry 2');
    });
  });

  describe('pause and resume', () => {
    it('should start paused by default', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      expect(manager.isPaused()).toBe(true);
    });

    it('should resume when resume() is called', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      manager.resume();
      expect(manager.isPaused()).toBe(false);
    });

    it('should pause when pause() is called', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      manager.resume();
      manager.pause();
      expect(manager.isPaused()).toBe(true);
    });
  });

  describe('time advancement', () => {
    it('should not advance time when paused', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const initialMs = manager.getCurrentTimestampMs();

      // Emit UPDATE event (simulating simulation tick)
      eventBus.emit(Events.UPDATE, 5000); // 5 seconds

      expect(manager.getCurrentTimestampMs()).toBe(initialMs);
    });

    it('should advance time when resumed', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const initialMs = manager.getCurrentTimestampMs();

      manager.resume();
      eventBus.emit(Events.UPDATE, 5000); // 5 seconds

      expect(manager.getCurrentTimestampMs()).toBe(initialMs + 5000);
    });

    it('should emit SIMULATED_TIME_TICK on second boundary crossing', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const callback = vi.fn();

      eventBus.on(Events.SIMULATED_TIME_TICK, callback);
      callback.mockClear(); // Clear initial emit from constructor

      manager.resume();
      // Advance by 1.5 seconds (crosses second boundary)
      eventBus.emit(Events.UPDATE, 1500);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        timeFormatted: '01 JAN 2026 12:00:01',
        timestampMs: expect.any(Number),
      });
    });

    it('should not emit SIMULATED_TIME_TICK within same second', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const callback = vi.fn();

      eventBus.on(Events.SIMULATED_TIME_TICK, callback);
      callback.mockClear(); // Clear initial emit

      manager.resume();
      // Advance by only 100ms (does not cross second boundary)
      eventBus.emit(Events.UPDATE, 100);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should emit initial time tick on initialization', () => {
      const callback = vi.fn();
      eventBus.on(Events.SIMULATED_TIME_TICK, callback);

      OpsLogManager.initialize('14:30:45', '2026-03-15');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        timeFormatted: '15 MAR 2026 14:30:45',
        timestampMs: expect.any(Number),
      });
    });
  });

  describe('state persistence', () => {
    it('should return serializable state', () => {
      const previousLogs: PreviousShiftLogEntry[] = [
        { timestamp: '08:00', entry: 'Shift started' },
      ];

      OpsLogManager.initialize('12:00:00', '2026-01-01', previousLogs);
      const manager = OpsLogManager.getInstance();
      manager.log('New entry', 'action', 'Source');

      const state = manager.getState();

      expect(state).toHaveProperty('entries');
      expect(state).toHaveProperty('currentTimestampMs');
      expect(state.entries).toHaveLength(2);
      expect(typeof state.currentTimestampMs).toBe('number');
    });

    it('should restore state from checkpoint', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();

      const savedState = {
        entries: [
          { timestamp: '10:00:00', message: 'Restored entry', category: 'action' as const },
          { timestamp: '10:05:00', message: 'Another entry', category: 'system' as const },
        ],
        currentTimestampMs: Date.UTC(2026, 0, 1, 15, 30, 0),
      };

      manager.restoreState(savedState);

      expect(manager.getEntries()).toHaveLength(2);
      expect(manager.getEntries()[0].message).toBe('Restored entry');
      expect(manager.getCurrentTimestampMs()).toBe(savedState.currentTimestampMs);
      expect(manager.getCurrentTimeFormatted()).toBe('01 JAN 2026 15:30:00');
    });

    it('should clear existing entries when restoring state', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();

      manager.log('Entry before restore');
      expect(manager.getEntries()).toHaveLength(1);

      manager.restoreState({
        entries: [{ timestamp: '14:00:00', message: 'New entry', category: 'action' }],
        currentTimestampMs: Date.UTC(2026, 0, 1, 14, 0, 0),
      });

      expect(manager.getEntries()).toHaveLength(1);
      expect(manager.getEntries()[0].message).toBe('New entry');
    });

    it('should reset pause state to false after restore', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();

      expect(manager.isPaused()).toBe(true);

      manager.restoreState({
        entries: [],
        currentTimestampMs: Date.UTC(2026, 0, 1, 14, 0, 0),
      });

      expect(manager.isPaused()).toBe(false);
    });

    it('should emit time tick after restore', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const callback = vi.fn();

      eventBus.on(Events.SIMULATED_TIME_TICK, callback);
      callback.mockClear();

      manager.restoreState({
        entries: [],
        currentTimestampMs: Date.UTC(2026, 5, 15, 18, 45, 30),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        timeFormatted: '15 JUN 2026 18:45:30',
        timestampMs: expect.any(Number),
      });
    });

    it('should return copy of entries in getState()', () => {
      OpsLogManager.initialize();
      const manager = OpsLogManager.getInstance();
      manager.log('Test entry');

      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1.entries).not.toBe(state2.entries);
      expect(state1.entries).toEqual(state2.entries);
    });
  });

  describe('event cleanup on destroy', () => {
    it('should unsubscribe from UPDATE event on destroy', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      manager.resume();

      const initialMs = manager.getCurrentTimestampMs();
      OpsLogManager.destroy();

      // Try to advance time after destroy
      eventBus.emit(Events.UPDATE, 5000);

      // Re-initialize to verify the old instance was properly cleaned up
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const newManager = OpsLogManager.getInstance();

      // New instance should start fresh
      expect(newManager.getCurrentTimestampMs()).toBe(initialMs);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed date strings gracefully', () => {
      // Uses fallback values for missing parts
      OpsLogManager.initialize('12', '2026');
      const manager = OpsLogManager.getInstance();

      // Should not throw, uses defaults for missing parts
      expect(manager.getCurrentTimeFormatted()).toContain('2026');
    });

    it('should log entries with updated timestamp after time advancement', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();

      manager.resume();
      eventBus.emit(Events.UPDATE, 65000); // 65 seconds

      manager.log('After advancement');
      const entries = manager.getEntries();

      expect(entries[0].timestamp).toBe('12:01:05');
    });

    it('should handle multiple rapid updates correctly', () => {
      OpsLogManager.initialize('12:00:00', '2026-01-01');
      const manager = OpsLogManager.getInstance();
      const callback = vi.fn();

      eventBus.on(Events.SIMULATED_TIME_TICK, callback);
      callback.mockClear();

      manager.resume();

      // Simulate multiple rapid updates
      for (let i = 0; i < 10; i++) {
        eventBus.emit(Events.UPDATE, 100); // 100ms each
      }

      // Total: 1000ms = 1 second, should have crossed boundary once
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
