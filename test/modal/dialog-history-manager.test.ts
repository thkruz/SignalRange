import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { DialogHistoryManager } from '../../src/modal/dialog-history-manager';
import { Character, Emotion } from '../../src/modal/character-enum';

// Mock DialogManager
jest.mock('../../src/modal/dialog-manager', () => ({
  DialogManager: {
    getInstance: jest.fn(() => ({
      show: jest.fn(),
    })),
  },
}));

// Mock character-enum
jest.mock('../../src/modal/character-enum', () => ({
  Character: {
    CHARLIE_BROOKS: 'charlie_brooks',
    CATHERINE_VEGA: 'catherine_vega',
  },
  Emotion: {
    NEUTRAL: 'neutral',
    HAPPY: 'happy',
  },
}));

describe('DialogHistoryManager', () => {
  let historyManager: DialogHistoryManager;
  let eventBus: EventBus;

  beforeEach(() => {
    // Reset singleton
    (DialogHistoryManager as any).instance = null;
    EventBus.destroy();

    eventBus = EventBus.getInstance();
    historyManager = DialogHistoryManager.getInstance();
  });

  afterEach(() => {
    (DialogHistoryManager as any).instance = null;
    EventBus.destroy();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DialogHistoryManager.getInstance();
      const instance2 = DialogHistoryManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('addEntry', () => {
    it('should add a dialog entry to history', () => {
      historyManager.addEntry(
        'Hello world',
        Character.CHARLIE_BROOKS,
        '/audio/hello.mp3',
        'Greeting'
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('Hello world');
      expect(history[0].character).toBe(Character.CHARLIE_BROOKS);
      expect(history[0].audioUrl).toBe('/audio/hello.mp3');
      expect(history[0].title).toBe('Greeting');
    });

    it('should include timestamp', () => {
      const beforeTime = Date.now();

      historyManager.addEntry(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test'
      );

      const afterTime = Date.now();
      const history = historyManager.getHistory();

      expect(history[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(history[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should include emotion when provided', () => {
      historyManager.addEntry(
        'Happy message',
        Character.CHARLIE_BROOKS,
        '/audio/happy.mp3',
        'Happy Dialog',
        Emotion.HAPPY
      );

      const history = historyManager.getHistory();
      expect(history[0].emotion).toBe(Emotion.HAPPY);
    });

    it('should not duplicate entries with same audioUrl', () => {
      historyManager.addEntry(
        'First message',
        Character.CHARLIE_BROOKS,
        '/audio/same.mp3',
        'First'
      );

      historyManager.addEntry(
        'Second message',
        Character.CATHERINE_VEGA,
        '/audio/same.mp3',
        'Second'
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('First message');
    });

    it('should emit DIALOG_HISTORY_CHANGED event', () => {
      const callback = jest.fn();
      eventBus.on(Events.DIALOG_HISTORY_CHANGED, callback);

      historyManager.addEntry(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test'
      );

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not emit event when entry is duplicate', () => {
      historyManager.addEntry(
        'First',
        Character.CHARLIE_BROOKS,
        '/audio/same.mp3',
        'First'
      );

      const callback = jest.fn();
      eventBus.on(Events.DIALOG_HISTORY_CHANGED, callback);

      historyManager.addEntry(
        'Second',
        Character.CHARLIE_BROOKS,
        '/audio/same.mp3',
        'Second'
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('should add multiple different entries', () => {
      historyManager.addEntry(
        'First',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3',
        'First'
      );

      historyManager.addEntry(
        'Second',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3',
        'Second'
      );

      historyManager.addEntry(
        'Third',
        Character.CHARLIE_BROOKS,
        '/audio/third.mp3',
        'Third'
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(3);
    });
  });

  describe('getHistory', () => {
    it('should return empty array initially', () => {
      const history = historyManager.getHistory();
      expect(history).toEqual([]);
    });

    it('should return a copy of the history array', () => {
      historyManager.addEntry(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test'
      );

      const history1 = historyManager.getHistory();
      const history2 = historyManager.getHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    it('should not be affected by modifications to returned array', () => {
      historyManager.addEntry(
        'Test',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test'
      );

      const history = historyManager.getHistory();
      history.push({
        text: 'Fake',
        character: Character.CHARLIE_BROOKS,
        audioUrl: '/audio/fake.mp3',
        timestamp: Date.now(),
        title: 'Fake',
      });

      expect(historyManager.getHistory().length).toBe(1);
    });
  });

  describe('replayDialog', () => {
    it('should call DialogManager.show with entry data', () => {
      const mockShow = jest.fn();
      const DialogManager = require('../../src/modal/dialog-manager').DialogManager;
      DialogManager.getInstance.mockReturnValue({ show: mockShow });

      const entry = {
        text: 'Test message',
        character: Character.CHARLIE_BROOKS,
        audioUrl: '/audio/test.mp3',
        timestamp: Date.now(),
        title: 'Test Dialog',
        emotion: Emotion.HAPPY,
      };

      historyManager.replayDialog(entry);

      expect(mockShow).toHaveBeenCalledWith(
        'Test message',
        Character.CHARLIE_BROOKS,
        '/audio/test.mp3',
        'Test Dialog',
        Emotion.HAPPY
      );
    });
  });

  describe('clearHistory', () => {
    it('should clear all history entries', () => {
      historyManager.addEntry(
        'First',
        Character.CHARLIE_BROOKS,
        '/audio/first.mp3',
        'First'
      );

      historyManager.addEntry(
        'Second',
        Character.CATHERINE_VEGA,
        '/audio/second.mp3',
        'Second'
      );

      expect(historyManager.getHistory().length).toBe(2);

      historyManager.clearHistory();

      expect(historyManager.getHistory().length).toBe(0);
    });
  });

  describe('reconstructFromCompletedObjectives', () => {
    it('should do nothing when dialogClips is undefined', () => {
      historyManager.reconstructFromCompletedObjectives(
        undefined,
        [],
        []
      );

      expect(historyManager.getHistory().length).toBe(0);
    });

    it('should do nothing when objectiveStates is undefined', () => {
      historyManager.reconstructFromCompletedObjectives(
        { intro: { text: 'Intro', character: Character.CHARLIE_BROOKS, audioUrl: '/intro.mp3' } },
        undefined as any,
        []
      );

      expect(historyManager.getHistory().length).toBe(0);
    });

    it('should do nothing when no completed objectives', () => {
      historyManager.reconstructFromCompletedObjectives(
        { intro: { text: 'Intro', character: Character.CHARLIE_BROOKS, audioUrl: '/intro.mp3' } },
        [],
        []
      );

      expect(historyManager.getHistory().length).toBe(0);
    });

    it('should add intro clip first when present', () => {
      const dialogClips = {
        intro: {
          text: 'Welcome!',
          character: Character.CHARLIE_BROOKS,
          audioUrl: '/audio/intro.mp3',
          emotion: Emotion.HAPPY,
        },
        objectives: {
          'obj-1': {
            text: 'Objective complete',
            character: Character.CATHERINE_VEGA,
            audioUrl: '/audio/obj1.mp3',
          },
        },
      };

      const objectiveStates = [
        {
          objective: { id: 'obj-1', title: 'First Objective', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 1000,
        },
      ];

      const objectives = [
        { id: 'obj-1', title: 'First Objective', description: '', conditions: [] },
      ];

      historyManager.reconstructFromCompletedObjectives(
        dialogClips,
        objectiveStates,
        objectives
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].title).toBe('Introduction');
      expect(history[0].text).toBe('Welcome!');
    });

    it('should add completed objective dialogs in chronological order', () => {
      const dialogClips = {
        objectives: {
          'obj-1': {
            text: 'First complete',
            character: Character.CHARLIE_BROOKS,
            audioUrl: '/audio/obj1.mp3',
          },
          'obj-2': {
            text: 'Second complete',
            character: Character.CATHERINE_VEGA,
            audioUrl: '/audio/obj2.mp3',
          },
        },
      };

      const objectiveStates = [
        {
          objective: { id: 'obj-2', title: 'Second', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 2000,
        },
        {
          objective: { id: 'obj-1', title: 'First', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 1000,
        },
      ];

      const objectives = [
        { id: 'obj-1', title: 'First', description: '', conditions: [] },
        { id: 'obj-2', title: 'Second', description: '', conditions: [] },
      ];

      historyManager.reconstructFromCompletedObjectives(
        dialogClips,
        objectiveStates,
        objectives
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].text).toBe('First complete');
      expect(history[1].text).toBe('Second complete');
    });

    it('should skip incomplete objectives', () => {
      const dialogClips = {
        objectives: {
          'obj-1': {
            text: 'Complete',
            character: Character.CHARLIE_BROOKS,
            audioUrl: '/audio/obj1.mp3',
          },
          'obj-2': {
            text: 'Incomplete',
            character: Character.CATHERINE_VEGA,
            audioUrl: '/audio/obj2.mp3',
          },
        },
      };

      const objectiveStates = [
        {
          objective: { id: 'obj-1', title: 'First', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 1000,
        },
        {
          objective: { id: 'obj-2', title: 'Second', description: '', conditions: [] },
          isCompleted: false,
          completedAt: undefined,
        },
      ];

      const objectives = [
        { id: 'obj-1', title: 'First', description: '', conditions: [] },
        { id: 'obj-2', title: 'Second', description: '', conditions: [] },
      ];

      historyManager.reconstructFromCompletedObjectives(
        dialogClips,
        objectiveStates,
        objectives
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('Complete');
    });

    it('should use objective ID as title fallback', () => {
      const dialogClips = {
        objectives: {
          'obj-unknown': {
            text: 'Unknown objective',
            character: Character.CHARLIE_BROOKS,
            audioUrl: '/audio/unknown.mp3',
          },
        },
      };

      const objectiveStates = [
        {
          objective: { id: 'obj-unknown', title: 'Unknown', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 1000,
        },
      ];

      // Objectives list doesn't include this objective
      const objectives: any[] = [];

      historyManager.reconstructFromCompletedObjectives(
        dialogClips,
        objectiveStates,
        objectives
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].title).toBe('obj-unknown');
    });

    it('should skip objectives without dialog clips', () => {
      const dialogClips = {
        objectives: {},
      };

      const objectiveStates = [
        {
          objective: { id: 'obj-1', title: 'First', description: '', conditions: [] },
          isCompleted: true,
          completedAt: 1000,
        },
      ];

      const objectives = [
        { id: 'obj-1', title: 'First', description: '', conditions: [] },
      ];

      historyManager.reconstructFromCompletedObjectives(
        dialogClips,
        objectiveStates,
        objectives
      );

      const history = historyManager.getHistory();
      expect(history.length).toBe(0);
    });
  });
});
