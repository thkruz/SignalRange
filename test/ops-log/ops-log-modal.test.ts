import { Mock, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { Events, SimulatedTimeTickData } from '../../src/events/events';
import { OpsLogEntry } from '../../src/ops-log/ops-log-types';

// Mock DraggableModal (parent class) to avoid DOM issues
vi.mock('../../src/engine/ui/draggable-modal', () => ({
  DraggableModal: class MockDraggableModal {
    protected boxId: string;
    protected width: string;
    protected title: string;
    boxEl: HTMLElement | null = null;

    constructor(id: string, options: { width?: string; title?: string }) {
      this.boxId = id;
      this.width = options.width || '';
      this.title = options.title || '';
    }

    protected getModalContentHtml(): string {
      return '';
    }

    open(cb?: () => void): void {
      if (cb) cb();
    }

    close(cb?: () => void): void {
      if (this.boxEl) {
        this.boxEl.style.display = 'none';
      }
      if (cb) cb();
    }
  },
}));

// Mock html utility
vi.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => result + str + (values[i] ?? ''), '');
  },
}));

// Mock getEl
const mockElements: Map<string, HTMLElement> = new Map();

vi.mock('../../src/engine/utils/get-el', () => ({
  getEl: (id: string) => mockElements.get(id) || null,
  showEl: (el: HTMLElement) => {
    if (el) el.style.display = 'block';
  },
}));

// Mock CSS import
vi.mock('../../src/ops-log/ops-log-modal.css', () => ({}));

// Mock OpsLogManager
const mockManagerInstance = {
  getEntries: vi.fn(() => []),
  getCurrentTimeFormatted: vi.fn(() => '01 JAN 2026 12:00:00'),
};

vi.mock('../../src/ops-log/ops-log-manager', () => ({
  OpsLogManager: {
    getInstance: vi.fn(() => mockManagerInstance),
    initialize: vi.fn(),
    destroy: vi.fn(),
    isInitialized: vi.fn(() => true),
  },
}));

// Import after mocks
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { OpsLogModal } from '../../src/ops-log/ops-log-modal';

describe('OpsLogModal', () => {
  let modal: OpsLogModal;
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singletons
    (OpsLogModal as any).instance_ = null;
    EventBus.destroy();

    // Reset DOM
    document.body.innerHTML = '';
    mockElements.clear();

    // Setup mock DOM elements
    const entriesContainer = document.createElement('div');
    entriesContainer.id = 'ops-log-entries';
    mockElements.set('ops-log-entries', entriesContainer);

    const clockEl = document.createElement('span');
    clockEl.id = 'ops-log-clock';
    mockElements.set('ops-log-clock', clockEl);

    eventBus = EventBus.getInstance();
    modal = OpsLogModal.getInstance();

    // Reset mock functions
    mockManagerInstance.getEntries.mockClear();
    mockManagerInstance.getCurrentTimeFormatted.mockClear();
    mockManagerInstance.getEntries.mockReturnValue([]);
    mockManagerInstance.getCurrentTimeFormatted.mockReturnValue('01 JAN 2026 12:00:00');
  });

  afterEach(() => {
    OpsLogModal.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
    mockElements.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = OpsLogModal.getInstance();
      const instance2 = OpsLogModal.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create instance on first getInstance() call', () => {
      (OpsLogModal as any).instance_ = null;
      const instance = OpsLogModal.getInstance();

      expect(instance).toBeInstanceOf(OpsLogModal);
    });
  });

  describe('constructor', () => {
    it('should set correct boxId', () => {
      expect((modal as any).boxId).toBe('ops-log-modal');
    });

    it('should register OPS_LOG_ENTRY_ADDED event listener', () => {
      const onSpy = vi.spyOn(eventBus, 'on');

      (OpsLogModal as any).instance_ = null;
      OpsLogModal.getInstance();

      expect(onSpy).toHaveBeenCalledWith(Events.OPS_LOG_ENTRY_ADDED, expect.any(Function));
    });

    it('should register SIMULATED_TIME_TICK event listener', () => {
      const onSpy = vi.spyOn(eventBus, 'on');

      (OpsLogModal as any).instance_ = null;
      OpsLogModal.getInstance();

      expect(onSpy).toHaveBeenCalledWith(Events.SIMULATED_TIME_TICK, expect.any(Function));
    });
  });

  describe('destroy', () => {
    it('should unsubscribe from OPS_LOG_ENTRY_ADDED event', () => {
      const offSpy = vi.spyOn(eventBus, 'off');

      OpsLogModal.destroy();

      expect(offSpy).toHaveBeenCalledWith(Events.OPS_LOG_ENTRY_ADDED, expect.any(Function));
    });

    it('should unsubscribe from SIMULATED_TIME_TICK event', () => {
      const offSpy = vi.spyOn(eventBus, 'off');

      OpsLogModal.destroy();

      expect(offSpy).toHaveBeenCalledWith(Events.SIMULATED_TIME_TICK, expect.any(Function));
    });

    it('should set instance to null', () => {
      OpsLogModal.destroy();

      expect((OpsLogModal as any).instance_).toBeNull();
    });

    it('should not throw when destroy called twice', () => {
      OpsLogModal.destroy();
      expect(() => OpsLogModal.destroy()).not.toThrow();
    });

    it('should not throw when destroy called before getInstance', () => {
      (OpsLogModal as any).instance_ = null;
      expect(() => OpsLogModal.destroy()).not.toThrow();
    });
  });

  describe('getModalContentHtml', () => {
    it('should return HTML structure with clock and entries container', () => {
      const html = (modal as any).getModalContentHtml();

      expect(html).toContain('ops-log-content');
      expect(html).toContain('ops-log-clock');
      expect(html).toContain('ops-log-entries');
      expect(html).toContain('Station Operations Log');
    });

    it('should include default clock value', () => {
      const html = (modal as any).getModalContentHtml();

      expect(html).toContain('--:--:--');
    });
  });

  describe('open', () => {
    it('should call callback when provided', () => {
      const callback = vi.fn();

      modal.open(callback);

      expect(callback).toHaveBeenCalled();
    });

    it('should render entries when opened', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'Test entry', category: 'action' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);

      modal.open();

      expect(mockManagerInstance.getEntries).toHaveBeenCalled();
    });

    it('should update clock when opened', () => {
      modal.open();

      expect(mockManagerInstance.getCurrentTimeFormatted).toHaveBeenCalled();
    });
  });

  describe('renderEntries_', () => {
    it('should show empty message when no entries', () => {
      mockManagerInstance.getEntries.mockReturnValue([]);
      const container = mockElements.get('ops-log-entries')!;

      // Call the private method through open
      modal.open();

      expect(container.innerHTML).toContain('No log entries yet.');
    });

    it('should render entries in reverse order (newest first)', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'First entry', category: 'action' },
        { timestamp: '12:05:00', message: 'Second entry', category: 'system' },
        { timestamp: '12:10:00', message: 'Third entry', category: 'alert' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      // Check that entries are rendered in reverse order
      const renderedHtml = container.innerHTML;
      const thirdPos = renderedHtml.indexOf('Third entry');
      const firstPos = renderedHtml.indexOf('First entry');

      expect(thirdPos).toBeLessThan(firstPos);
    });

    it('should render entry with category class', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'Alert entry', category: 'alert' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      expect(container.innerHTML).toContain('ops-log-entry--alert');
    });

    it('should render entry with source when provided', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'System event', category: 'system', source: 'HPA-001' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      expect(container.innerHTML).toContain('ops-log-source');
      expect(container.innerHTML).toContain('[HPA-001]');
    });

    it('should not render source element when source is undefined', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'No source entry', category: 'action' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      // Source span should not be in the output
      expect(container.innerHTML).not.toContain('ops-log-source');
    });

    it('should handle OpsLogManager not initialized gracefully', () => {
      (OpsLogManager.getInstance as Mock).mockImplementation(() => {
        throw new Error('OpsLogManager not initialized');
      });
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      expect(container.innerHTML).toContain('Operations log not available.');

      // Restore mock
      (OpsLogManager.getInstance as Mock).mockReturnValue(mockManagerInstance);
    });

    it('should handle missing container element gracefully', () => {
      mockElements.delete('ops-log-entries');

      // Should not throw
      expect(() => modal.open()).not.toThrow();
    });
  });

  describe('updateClock_', () => {
    it('should update clock element with formatted time', () => {
      mockManagerInstance.getCurrentTimeFormatted.mockReturnValue('15 MAR 2026 14:30:45');
      const clockEl = mockElements.get('ops-log-clock')!;

      modal.open();

      expect(clockEl.textContent).toBe('15 MAR 2026 14:30:45');
    });

    it('should show fallback when OpsLogManager not initialized', () => {
      (OpsLogManager.getInstance as Mock).mockImplementation(() => {
        throw new Error('OpsLogManager not initialized');
      });
      const clockEl = mockElements.get('ops-log-clock')!;

      modal.open();

      expect(clockEl.textContent).toBe('--:--:--');

      // Restore mock
      (OpsLogManager.getInstance as Mock).mockReturnValue(mockManagerInstance);
    });

    it('should handle missing clock element gracefully', () => {
      mockElements.delete('ops-log-clock');

      // Should not throw
      expect(() => modal.open()).not.toThrow();
    });
  });

  describe('event handlers', () => {
    it('should re-render entries when OPS_LOG_ENTRY_ADDED event fires and modal is visible', () => {
      // Setup modal as open with boxEl that has display block
      const boxEl = document.createElement('div');
      boxEl.style.display = 'block';
      (modal as any).boxEl = boxEl;

      const newEntry: OpsLogEntry = {
        timestamp: '12:15:00',
        message: 'New entry added',
        category: 'action',
      };

      mockManagerInstance.getEntries.mockClear();
      eventBus.emit(Events.OPS_LOG_ENTRY_ADDED, newEntry);

      expect(mockManagerInstance.getEntries).toHaveBeenCalled();
    });

    it('should not re-render when OPS_LOG_ENTRY_ADDED fires and modal is hidden', () => {
      // Setup modal as closed (display: none)
      const boxEl = document.createElement('div');
      boxEl.style.display = 'none';
      (modal as any).boxEl = boxEl;

      mockManagerInstance.getEntries.mockClear();
      eventBus.emit(Events.OPS_LOG_ENTRY_ADDED, {
        timestamp: '12:15:00',
        message: 'New entry',
        category: 'action',
      });

      expect(mockManagerInstance.getEntries).not.toHaveBeenCalled();
    });

    it('should not re-render when boxEl is null', () => {
      (modal as any).boxEl = null;

      mockManagerInstance.getEntries.mockClear();
      eventBus.emit(Events.OPS_LOG_ENTRY_ADDED, {
        timestamp: '12:15:00',
        message: 'New entry',
        category: 'action',
      });

      expect(mockManagerInstance.getEntries).not.toHaveBeenCalled();
    });

    it('should update clock when SIMULATED_TIME_TICK event fires and modal is visible', () => {
      // Setup modal as open
      const boxEl = document.createElement('div');
      boxEl.style.display = 'block';
      (modal as any).boxEl = boxEl;

      const tickData: SimulatedTimeTickData = {
        timeFormatted: '01 JAN 2026 12:30:00',
        timestampMs: Date.now(),
      };

      mockManagerInstance.getCurrentTimeFormatted.mockClear();
      eventBus.emit(Events.SIMULATED_TIME_TICK, tickData);

      expect(mockManagerInstance.getCurrentTimeFormatted).toHaveBeenCalled();
    });

    it('should not update clock when SIMULATED_TIME_TICK fires and modal is hidden', () => {
      // Setup modal as closed
      const boxEl = document.createElement('div');
      boxEl.style.display = 'none';
      (modal as any).boxEl = boxEl;

      mockManagerInstance.getCurrentTimeFormatted.mockClear();
      eventBus.emit(Events.SIMULATED_TIME_TICK, {
        timeFormatted: '01 JAN 2026 12:30:00',
        timestampMs: Date.now(),
      });

      expect(mockManagerInstance.getCurrentTimeFormatted).not.toHaveBeenCalled();
    });

    it('should not update clock when boxEl is null', () => {
      (modal as any).boxEl = null;

      mockManagerInstance.getCurrentTimeFormatted.mockClear();
      eventBus.emit(Events.SIMULATED_TIME_TICK, {
        timeFormatted: '01 JAN 2026 12:30:00',
        timestampMs: Date.now(),
      });

      expect(mockManagerInstance.getCurrentTimeFormatted).not.toHaveBeenCalled();
    });
  });

  describe('renderEntry_', () => {
    it('should render entry with timestamp', () => {
      const entry: OpsLogEntry = {
        timestamp: '14:30:45',
        message: 'Test message',
        category: 'action',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).toContain('14:30:45');
      expect(html).toContain('ops-log-timestamp');
    });

    it('should render entry with message', () => {
      const entry: OpsLogEntry = {
        timestamp: '14:30:45',
        message: 'Important log message here',
        category: 'system',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).toContain('Important log message here');
      expect(html).toContain('ops-log-message');
    });

    it('should render previous-shift category', () => {
      const entry: OpsLogEntry = {
        timestamp: 'Earlier Today',
        message: 'Previous shift entry',
        category: 'previous-shift',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).toContain('ops-log-entry--previous-shift');
    });

    it('should handle entry without category', () => {
      const entry: OpsLogEntry = {
        timestamp: '14:30:45',
        message: 'No category entry',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).toContain('ops-log-entry');
      // Should not have double dash from undefined category
      expect(html).not.toContain('ops-log-entry--undefined');
    });

    it('should render source when provided', () => {
      const entry: OpsLogEntry = {
        timestamp: '14:30:45',
        message: 'Entry with source',
        category: 'action',
        source: 'LNB-002',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).toContain('[LNB-002]');
      expect(html).toContain('ops-log-source');
    });

    it('should not render source element when source is undefined', () => {
      const entry: OpsLogEntry = {
        timestamp: '14:30:45',
        message: 'No source',
        category: 'action',
      };

      const html = (modal as any).renderEntry_(entry);

      expect(html).not.toContain('ops-log-source');
    });
  });

  describe('integration scenarios', () => {
    it('should handle entry with all fields populated', () => {
      const entry: OpsLogEntry = {
        timestamp: '15:45:30',
        message: 'Full entry with all fields',
        category: 'alert',
        source: 'ANTENNA-001',
      };
      mockManagerInstance.getEntries.mockReturnValue([entry]);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      expect(container.innerHTML).toContain('15:45:30');
      expect(container.innerHTML).toContain('Full entry with all fields');
      expect(container.innerHTML).toContain('ops-log-entry--alert');
      expect(container.innerHTML).toContain('[ANTENNA-001]');
    });

    it('should handle multiple entries with different categories', () => {
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'Action entry', category: 'action' },
        { timestamp: '12:01:00', message: 'System entry', category: 'system' },
        { timestamp: '12:02:00', message: 'Previous shift', category: 'previous-shift' },
        { timestamp: '12:03:00', message: 'Alert entry', category: 'alert' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      const container = mockElements.get('ops-log-entries')!;

      modal.open();

      expect(container.innerHTML).toContain('ops-log-entry--action');
      expect(container.innerHTML).toContain('ops-log-entry--system');
      expect(container.innerHTML).toContain('ops-log-entry--previous-shift');
      expect(container.innerHTML).toContain('ops-log-entry--alert');
    });

    it('should handle full lifecycle: create, open, receive events, destroy', () => {
      // Get instance
      const instance = OpsLogModal.getInstance();

      // Setup as open modal
      const boxEl = document.createElement('div');
      boxEl.style.display = 'block';
      (instance as any).boxEl = boxEl;

      // Open
      instance.open();
      expect(mockManagerInstance.getEntries).toHaveBeenCalled();
      expect(mockManagerInstance.getCurrentTimeFormatted).toHaveBeenCalled();

      // Clear mocks
      mockManagerInstance.getEntries.mockClear();
      mockManagerInstance.getCurrentTimeFormatted.mockClear();

      // Receive log entry event
      const entries: OpsLogEntry[] = [
        { timestamp: '12:00:00', message: 'Log entry', category: 'action' },
      ];
      mockManagerInstance.getEntries.mockReturnValue(entries);
      eventBus.emit(Events.OPS_LOG_ENTRY_ADDED, entries[0]);
      expect(mockManagerInstance.getEntries).toHaveBeenCalled();

      // Receive time tick event
      mockManagerInstance.getCurrentTimeFormatted.mockClear();
      eventBus.emit(Events.SIMULATED_TIME_TICK, {
        timeFormatted: '01 JAN 2026 12:00:01',
        timestampMs: Date.now(),
      });
      expect(mockManagerInstance.getCurrentTimeFormatted).toHaveBeenCalled();

      // Destroy
      const offSpy = vi.spyOn(eventBus, 'off');
      OpsLogModal.destroy();

      // Verify cleanup
      expect((OpsLogModal as any).instance_).toBeNull();
      expect(offSpy).toHaveBeenCalledWith(Events.OPS_LOG_ENTRY_ADDED, expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith(Events.SIMULATED_TIME_TICK, expect.any(Function));
    });
  });
});
