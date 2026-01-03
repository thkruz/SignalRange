import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { DialogManager } from '../../src/modal/dialog-manager';
import { Character, Emotion } from '../../src/modal/character-enum';

// Create mock functions outside of jest.mock factory
const mockPlayCustom = jest.fn();
const mockStopCustom = jest.fn();
const mockIsCustomAudioPlaying = jest.fn(() => false);

// Mock SoundManager
jest.mock('../../src/sound/sound-manager', () => {
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        playCustom: mockPlayCustom,
        stopCustom: mockStopCustom,
        isCustomAudioPlaying: mockIsCustomAudioPlaying,
      }),
    },
  };
});

// Mock DialogHistoryManager
jest.mock('../../src/modal/dialog-history-manager', () => ({
  DialogHistoryManager: {
    getInstance: jest.fn(() => ({
      addEntry: jest.fn(),
    })),
  },
}));

// Mock character utilities
jest.mock('../../src/modal/character-enum', () => ({
  Character: {
    CHARLIE_BROOKS: 'charlie_brooks',
    CATHERINE_VEGA: 'catherine_vega',
  },
  Emotion: {
    NEUTRAL: 'neutral',
    HAPPY: 'happy',
    ANGRY: 'angry',
  },
  CharacterNames: {
    charlie_brooks: 'Charlie Brooks',
    catherine_vega: 'Catherine Vega',
  },
  CharacterTitles: {
    charlie_brooks: 'Senior Ground Station Operator',
    catherine_vega: 'Ground Station Operator',
  },
  CharacterCompany: {
    charlie_brooks: 'SeaLink Satellite',
    catherine_vega: 'SeaLink Satellite',
  },
  getCharacterAvatarUrl: jest.fn(() => '/test-avatar.png'),
}));

// Mock html utility
jest.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => {
      return result + str + (values[i] ?? '');
    }, '');
  },
}));

// Mock qs utility - note: can't use document directly in mock factory
jest.mock('../../src/engine/utils/query-selector', () => ({
  qs: jest.fn((selector: string, parent?: HTMLElement) => {
    const context = parent ?? global.document;
    return context?.querySelector(selector);
  }),
}));

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singleton
    (DialogManager as any).instance = null;
    EventBus.destroy();

    // Clear DOM
    document.body.innerHTML = '';

    eventBus = EventBus.getInstance();
    dialogManager = DialogManager.getInstance();

    // Disable auto-close for testing
    window.AUTO_CLOSE_DIALOGS = false;

    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clean up any dialogs
    document.body.innerHTML = '';
    (DialogManager as any).instance = null;
    EventBus.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = DialogManager.getInstance();
      const instance2 = DialogManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Show Dialog', () => {
    it('should create dialog element when showing', () => {
      expect(dialogManager.isShowing()).toBe(false);

      dialogManager.show(
        'Test message',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test Dialog'
      );

      expect(dialogManager.isShowing()).toBe(true);
      expect(document.querySelector('.dialog-overlay')).toBeTruthy();
    });

    it('should include dialog content elements', () => {
      dialogManager.show(
        'Hello world',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test'
      );

      expect(document.querySelector('.dialog-box')).toBeTruthy();
      expect(document.querySelector('.dialog-content')).toBeTruthy();
      expect(document.querySelector('.dialog-avatar')).toBeTruthy();
      expect(document.querySelector('.dialog-text')).toBeTruthy();
    });

    it('should display the dialog text', () => {
      dialogManager.show(
        'This is a test message',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      const textElement = document.querySelector('.dialog-text');
      expect(textElement?.textContent).toContain('This is a test message');
    });

    it('should add visible class after animation frame', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      // Run animation frame
      jest.runAllTimers();

      const overlay = document.querySelector('.dialog-overlay');
      expect(overlay?.classList.contains('dialog-visible')).toBe(true);
    });

    it('should set current audio URL', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/custom.mp3'
      );

      expect(dialogManager.currentAudioUrl).toBe('/audio/custom.mp3');
    });
  });

  describe('Dialog Queue', () => {
    it('should queue dialogs when one is already showing', () => {
      // Show first dialog
      dialogManager.show(
        'First message',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3'
      );

      // Queue second dialog
      dialogManager.show(
        'Second message',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3'
      );

      // Only first dialog should be visible
      const textElement = document.querySelector('.dialog-text');
      expect(textElement?.textContent).toContain('First message');
    });

    it('should show next dialog when current is hidden', () => {
      // Show first dialog
      dialogManager.show(
        'First message',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3'
      );

      // Queue second dialog
      dialogManager.show(
        'Second message',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3'
      );

      // Hide first dialog
      dialogManager.hide();

      // Wait for fade-out transition (300ms) and queue processing (50ms)
      jest.advanceTimersByTime(400);

      // Second dialog should now be visible
      expect(dialogManager.isShowing()).toBe(true);
    });

    it('should clear dialog queue', () => {
      // Show first dialog
      dialogManager.show(
        'First message',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3'
      );

      // Queue additional dialogs
      dialogManager.show(
        'Second message',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3'
      );
      dialogManager.show(
        'Third message',
        Character.CHARLIE_BROOKS,
        '/audio/third.mp3'
      );

      // Clear the queue
      dialogManager.clearQueue();

      // Hide current dialog
      dialogManager.hide();
      jest.advanceTimersByTime(400);

      // No more dialogs should appear
      expect(dialogManager.isShowing()).toBe(false);
    });
  });

  describe('Hide Dialog', () => {
    it('should remove dialog element when hiding', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      expect(dialogManager.isShowing()).toBe(true);

      dialogManager.hide();

      // Wait for fade-out transition
      jest.advanceTimersByTime(350);

      expect(dialogManager.isShowing()).toBe(false);
      expect(document.querySelector('.dialog-overlay')).toBeFalsy();
    });

    it('should clear current audio URL when hiding', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      expect(dialogManager.currentAudioUrl).toBe('/audio/test.mp3');

      dialogManager.hide();

      expect(dialogManager.currentAudioUrl).toBeNull();
    });

    it('should emit DIALOG_DISMISSED event when hiding', () => {
      const callback = jest.fn();
      eventBus.on(Events.DIALOG_DISMISSED, callback);

      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      dialogManager.hide();
      jest.advanceTimersByTime(350);

      expect(callback).toHaveBeenCalled();
    });

    it('should do nothing if no dialog is showing', () => {
      expect(() => dialogManager.hide()).not.toThrow();
      expect(dialogManager.isShowing()).toBe(false);
    });
  });

  describe('Hold to Skip', () => {
    it('should attach mouse event listeners', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      const overlay = document.querySelector('.dialog-overlay');
      expect(overlay).toBeTruthy();

      // Verify listeners are stored
      expect((overlay as any)._holdListeners).toBeDefined();
      expect((overlay as any)._holdListeners.mousedown).toBeDefined();
      expect((overlay as any)._holdListeners.mouseup).toBeDefined();
      expect((overlay as any)._holdListeners.mouseleave).toBeDefined();
    });

    it('should show skip indicator on mousedown', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      const overlay = document.querySelector('.dialog-overlay') as HTMLElement;
      const skipIndicator = document.querySelector('.dialog-skip-indicator') as HTMLElement;

      // Simulate mousedown
      const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
      overlay.dispatchEvent(mousedownEvent);

      expect(skipIndicator?.classList.contains('dialog-skip-visible')).toBe(true);
    });

    it('should hide skip indicator on mouseup', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      const overlay = document.querySelector('.dialog-overlay') as HTMLElement;
      const skipIndicator = document.querySelector('.dialog-skip-indicator') as HTMLElement;

      // Simulate mousedown then mouseup
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(skipIndicator?.classList.contains('dialog-skip-visible')).toBe(false);
    });

    it('should hide skip indicator on mouseleave', () => {
      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      const overlay = document.querySelector('.dialog-overlay') as HTMLElement;
      const skipIndicator = document.querySelector('.dialog-skip-indicator') as HTMLElement;

      // Simulate mousedown then mouseleave
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      expect(skipIndicator?.classList.contains('dialog-skip-visible')).toBe(false);
    });
  });

  describe('Auto Close Dialogs Mode', () => {
    it('should immediately hide dialog when AUTO_CLOSE_DIALOGS is true', () => {
      window.AUTO_CLOSE_DIALOGS = true;

      dialogManager.show(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3'
      );

      // The hide() would have been called synchronously
      // But since we're in a test, we verify current audio URL is cleared
      expect(dialogManager.currentAudioUrl).toBeNull();
    });
  });

  describe('Emotion Support', () => {
    it('should accept optional emotion parameter', () => {
      expect(() => {
        dialogManager.show(
          'Test message with emotion',
          Character.CHARLIE_BROOKS,
          '/audio/test.mp3',
          'Test Dialog',
          Emotion.HAPPY
        );
      }).not.toThrow();

      expect(dialogManager.isShowing()).toBe(true);
    });

    it('should queue dialog with emotion', () => {
      dialogManager.show(
        'First',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3'
      );

      dialogManager.show(
        'Second with emotion',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3',
        'Second Dialog',
        Emotion.ANGRY
      );

      // Verify dialog was queued (queue is private, so we test behavior)
      dialogManager.hide();
      jest.advanceTimersByTime(400);

      expect(dialogManager.isShowing()).toBe(true);
    });
  });
});
