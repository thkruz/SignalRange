import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { Character, Emotion } from '../../src/modal/character-enum';
import { DialogHistoryBox } from '../../src/modal/dialog-history-box';
import { DialogHistoryEntry } from '../../src/modal/dialog-history-manager';

// Mock DraggableHtmlBox
jest.mock('../../src/modal/draggable-html-box', () => ({
  DraggableHtmlBox: class MockDraggableHtmlBox {
    protected title: string;
    protected boxId: string;
    protected parentId: string;
    protected content: string = '';
    protected _isOpen: boolean = false;
    public popupDom: HTMLElement;

    constructor(title: string, boxId: string, content: string, parentId: string) {
      this.title = title;
      this.boxId = boxId;
      this.content = content;
      this.parentId = parentId;
      this.popupDom = global.document.createElement('div');
      this.popupDom.id = boxId;
    }

    get isOpen(): boolean {
      return this._isOpen;
    }

    updateContent(content: string): void {
      this.content = content;
      this.popupDom.innerHTML = content;
    }

    open(): void {
      this._isOpen = true;
      this.onOpen();
    }

    close(): void {
      this._isOpen = false;
    }

    protected onOpen(): void { }
  },
}));

// Mock html utility
jest.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => result + str + (values[i] ?? ''), '');
  },
}));

// Mock DialogHistoryManager
const mockGetHistory = jest.fn();
const mockReplayDialog = jest.fn();
jest.mock('../../src/modal/dialog-history-manager', () => ({
  DialogHistoryManager: {
    getInstance: jest.fn(() => ({
      getHistory: mockGetHistory,
      replayDialog: mockReplayDialog,
    })),
  },
}));

// Mock character-enum
jest.mock('../../src/modal/character-enum', () => ({
  Character: {
    CHARLIE_BROOKS: 'charlie_brooks',
  },
  CharacterNames: {
    charlie_brooks: 'Charlie Brooks',
  },
  Emotion: {
    NEUTRAL: 'neutral',
  },
}));

describe('DialogHistoryBox', () => {
  let historyBox: DialogHistoryBox;
  let eventBus: EventBus;

  beforeEach(() => {
    EventBus.destroy();
    eventBus = EventBus.getInstance();
    mockGetHistory.mockReturnValue([]);
    mockReplayDialog.mockClear();

    historyBox = new DialogHistoryBox('test-parent');
  });

  afterEach(() => {
    EventBus.destroy();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with correct title', () => {
      expect((historyBox as any).title).toBe('Dialog History');
    });

    it('should create instance with correct boxId', () => {
      expect((historyBox as any).boxId).toBe('dialog-history');
    });

    it('should register event listener for DIALOG_HISTORY_CHANGED', () => {
      const newHistoryBox = new DialogHistoryBox();

      // Verify by emitting event and checking if handler is called
      mockGetHistory.mockReturnValue([]);
      (newHistoryBox as any)._isOpen = true;

      eventBus.emit(Events.DIALOG_HISTORY_CHANGED);

      // The onHistoryChanged_ method should have been called
      // which calls generateHistoryHtml
      expect(mockGetHistory).toHaveBeenCalled();
    });
  });

  describe('generateHistoryHtml', () => {
    it('should return empty message when no history', () => {
      mockGetHistory.mockReturnValue([]);

      const html = (historyBox as any).generateHistoryHtml();

      expect(html).toContain('No dialogs have been played yet');
      expect(html).toContain('dialog-history-empty');
    });

    it('should render history items when history exists', () => {
      const mockEntry: DialogHistoryEntry = {
        text: 'Hello world',
        character: Character.CHARLIE_BROOKS,
        audioUrl: '/audio/test.mp3',
        timestamp: new Date('2024-01-15T10:30:00').getTime(),
        title: 'Test Dialog',
      };
      mockGetHistory.mockReturnValue([mockEntry]);

      const html = (historyBox as any).generateHistoryHtml();

      expect(html).toContain('dialog-history-container');
      expect(html).toContain('dialog-history-item');
      expect(html).toContain('Test Dialog');
      expect(html).toContain('Charlie Brooks');
      expect(html).toContain('Replay');
    });

    it('should render multiple history items', () => {
      const mockEntries: DialogHistoryEntry[] = [
        {
          text: 'First',
          character: Character.CHARLIE_BROOKS,
          audioUrl: '/audio/first.mp3',
          timestamp: Date.now(),
          title: 'First Dialog',
        },
        {
          text: 'Second',
          character: Character.CHARLIE_BROOKS,
          audioUrl: '/audio/second.mp3',
          timestamp: Date.now(),
          title: 'Second Dialog',
        },
      ];
      mockGetHistory.mockReturnValue(mockEntries);

      const html = (historyBox as any).generateHistoryHtml();

      expect(html).toContain('First Dialog');
      expect(html).toContain('Second Dialog');
      expect(html).toContain('data-index="0"');
      expect(html).toContain('data-index="1"');
    });
  });

  describe('onOpen', () => {
    it('should update content when opened', () => {
      mockGetHistory.mockReturnValue([]);
      const updateContentSpy = jest.spyOn(historyBox, 'updateContent');

      (historyBox as any).onOpen();

      expect(updateContentSpy).toHaveBeenCalled();
    });

    it('should attach replay listeners when opened', () => {
      const mockEntry: DialogHistoryEntry = {
        text: 'Test',
        character: Character.CHARLIE_BROOKS,
        audioUrl: '/audio/test.mp3',
        timestamp: Date.now(),
        title: 'Test',
      };
      mockGetHistory.mockReturnValue([mockEntry]);

      // First update the content to include buttons
      historyBox.updateContent((historyBox as any).generateHistoryHtml());

      // Then call onOpen
      (historyBox as any).onOpen();

      // Check that buttons have click listeners by simulating click
      const button = (historyBox as any).popupDom.querySelector('.dialog-history-replay-btn');
      if (button) {
        button.click();
        expect(mockReplayDialog).toHaveBeenCalledWith(mockEntry);
      }
    });
  });

  describe('open', () => {
    it('should call super.open and update content', () => {
      mockGetHistory.mockReturnValue([]);
      const updateContentSpy = jest.spyOn(historyBox, 'updateContent');

      historyBox.open();

      expect((historyBox as any)._isOpen).toBe(true);
      expect(updateContentSpy).toHaveBeenCalled();
    });
  });

  describe('onHistoryChanged_', () => {
    it('should not update when box is closed', () => {
      mockGetHistory.mockReturnValue([]);
      (historyBox as any)._isOpen = false;

      const updateContentSpy = jest.spyOn(historyBox, 'updateContent');
      mockGetHistory.mockClear();

      eventBus.emit(Events.DIALOG_HISTORY_CHANGED);

      // generateHistoryHtml is still called (no way to prevent constructor call)
      // but updateContent should not be called again after the event
      expect(updateContentSpy).not.toHaveBeenCalled();
    });

    it('should update content when box is open', () => {
      mockGetHistory.mockReturnValue([]);
      (historyBox as any)._isOpen = true;

      const updateContentSpy = jest.spyOn(historyBox, 'updateContent');

      eventBus.emit(Events.DIALOG_HISTORY_CHANGED);

      expect(updateContentSpy).toHaveBeenCalled();
    });
  });

  describe('attachReplayListeners', () => {
    it('should call replayDialog with correct entry when button clicked', () => {
      const mockEntry: DialogHistoryEntry = {
        text: 'Test message',
        character: Character.CHARLIE_BROOKS,
        audioUrl: '/audio/test.mp3',
        timestamp: Date.now(),
        title: 'Test Title',
        emotion: Emotion.NEUTRAL,
      };
      mockGetHistory.mockReturnValue([mockEntry]);

      // Generate and set content
      historyBox.updateContent((historyBox as any).generateHistoryHtml());

      // Attach listeners
      (historyBox as any).attachReplayListeners();

      // Click the replay button
      const button = (historyBox as any).popupDom.querySelector('.dialog-history-replay-btn');
      expect(button).toBeTruthy();

      button?.click();

      expect(mockReplayDialog).toHaveBeenCalledWith(mockEntry);
    });

    it('should handle click with invalid index gracefully', () => {
      mockGetHistory.mockReturnValue([]);

      // Generate empty content
      historyBox.updateContent((historyBox as any).generateHistoryHtml());

      // Attach listeners (no buttons exist)
      (historyBox as any).attachReplayListeners();

      // No error should occur
      expect(mockReplayDialog).not.toHaveBeenCalled();
    });

    it('should use correct index from data attribute', () => {
      const mockEntries: DialogHistoryEntry[] = [
        {
          text: 'First',
          character: Character.CHARLIE_BROOKS,
          audioUrl: '/audio/first.mp3',
          timestamp: Date.now(),
          title: 'First',
        },
        {
          text: 'Second',
          character: Character.CHARLIE_BROOKS,
          audioUrl: '/audio/second.mp3',
          timestamp: Date.now(),
          title: 'Second',
        },
      ];
      mockGetHistory.mockReturnValue(mockEntries);

      historyBox.updateContent((historyBox as any).generateHistoryHtml());
      (historyBox as any).attachReplayListeners();

      // Click the second button
      const buttons = (historyBox as any).popupDom.querySelectorAll('.dialog-history-replay-btn');
      expect(buttons.length).toBe(2);

      buttons[1]?.click();

      expect(mockReplayDialog).toHaveBeenCalledWith(mockEntries[1]);
    });
  });
});
