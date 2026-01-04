import { ScenarioDialogManager } from '../../src/scenarios/scenario-dialog-manager';
import { EventBus } from '../../src/events/event-bus';
import { Events, ObjectiveCompletedData } from '../../src/events/events';
import { DialogManager } from '../../src/modal/dialog-manager';
import { ScenarioManager } from '../../src/scenario-manager';
import type { ScenarioData } from '../../src/ScenarioData';
import type { Character, Emotion } from '../../src/modal/character-enum';

jest.mock('../../src/modal/dialog-manager');
jest.mock('../../src/scenario-manager');

describe('ScenarioDialogManager', () => {
  let mockDialogManager: jest.Mocked<DialogManager>;
  let mockScenarioManager: jest.Mocked<ScenarioManager>;

  // Reset singleton and mocks between tests
  const resetInstance = (): void => {
    ScenarioDialogManager.reset();
  };

  const createMockScenarioData = (overrides: Partial<ScenarioData> = {}): ScenarioData => ({
    id: 'test-scenario',
    title: 'Test Scenario',
    subtitle: 'Test',
    url: 'test',
    imageUrl: 'test.jpg',
    number: 1,
    duration: '30 min',
    difficulty: 'beginner',
    missionType: 'Training',
    description: 'Test',
    equipment: [],
    settings: {
      isSync: false,
      groundStations: [],
      antennas: [],
      satellites: [],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    EventBus.destroy();
    resetInstance();

    mockDialogManager = {
      show: jest.fn(),
      clearQueue: jest.fn(),
      hide: jest.fn(),
    } as unknown as jest.Mocked<DialogManager>;
    (DialogManager.getInstance as jest.Mock).mockReturnValue(mockDialogManager);

    mockScenarioManager = {
      data: createMockScenarioData(),
    } as unknown as jest.Mocked<ScenarioManager>;
    (ScenarioManager.getInstance as jest.Mock).mockReturnValue(mockScenarioManager);
  });

  afterEach(() => {
    jest.useRealTimers();
    EventBus.destroy();
    resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ScenarioDialogManager.getInstance();
      const instance2 = ScenarioDialogManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance if none exists', () => {
      const instance = ScenarioDialogManager.getInstance();

      expect(instance).toBeInstanceOf(ScenarioDialogManager);
    });
  });

  describe('initialize', () => {
    it('should register OBJECTIVE_COMPLETED event listener', () => {
      const eventBus = EventBus.getInstance();
      const onSpy = jest.spyOn(eventBus, 'on');

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      expect(onSpy).toHaveBeenCalledWith(
        Events.OBJECTIVE_COMPLETED,
        expect.any(Function)
      );
    });
  });

  describe('handleObjectiveCompleted', () => {
    it('should show dialog when objective has dialog clip', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [
          { id: 'obj-1', title: 'Find the beacon' } as any,
        ],
        dialogClips: {
          objectives: {
            'obj-1': {
              text: 'Great job finding the beacon!',
              character: 'alex' as Character,
              audioUrl: 'audio/success.mp3',
              emotion: 'happy' as Emotion,
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      // Emit objective completed event
      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      // Fast-forward the 500ms timeout
      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).toHaveBeenCalledWith(
        'Great job finding the beacon!',
        'alex',
        'audio/success.mp3',
        'Find the beacon',
        'happy'
      );
    });

    it('should not show dialog when objective has no dialog clip', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [
          { id: 'obj-1', title: 'Find the beacon' } as any,
        ],
        dialogClips: {
          objectives: {},
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).not.toHaveBeenCalled();
    });

    it('should not show dialog when dialogClips is undefined', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [
          { id: 'obj-1', title: 'Find the beacon' } as any,
        ],
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).not.toHaveBeenCalled();
    });

    it('should use objective ID as fallback title', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [], // No matching objective
        dialogClips: {
          objectives: {
            'obj-no-title': {
              text: 'Dialog text',
              character: 'alex' as Character,
              audioUrl: 'audio/clip.mp3',
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-no-title' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).toHaveBeenCalledWith(
        'Dialog text',
        'alex',
        'audio/clip.mp3',
        'obj-no-title', // Falls back to objective ID
        undefined
      );
    });

    it('should delay dialog by 500ms', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [{ id: 'obj-1', title: 'Test' } as any],
        dialogClips: {
          objectives: {
            'obj-1': {
              text: 'Success!',
              character: 'alex' as Character,
              audioUrl: 'audio/clip.mp3',
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      // Not called immediately
      expect(mockDialogManager.show).not.toHaveBeenCalled();

      // Not called at 400ms
      jest.advanceTimersByTime(400);
      expect(mockDialogManager.show).not.toHaveBeenCalled();

      // Called at 500ms
      jest.advanceTimersByTime(100);
      expect(mockDialogManager.show).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should unregister OBJECTIVE_COMPLETED event listener', () => {
      const eventBus = EventBus.getInstance();
      const offSpy = jest.spyOn(eventBus, 'off');

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();
      manager.destroy();

      expect(offSpy).toHaveBeenCalledWith(
        Events.OBJECTIVE_COMPLETED,
        expect.any(Function)
      );
    });

    it('should clear dialog queue', () => {
      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();
      manager.destroy();

      expect(mockDialogManager.clearQueue).toHaveBeenCalled();
    });

    it('should stop responding to events after destroy', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [{ id: 'obj-1', title: 'Test' } as any],
        dialogClips: {
          objectives: {
            'obj-1': {
              text: 'Success!',
              character: 'alex' as Character,
              audioUrl: 'audio/clip.mp3',
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();
      manager.destroy();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);

      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should destroy existing instance', () => {
      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      ScenarioDialogManager.reset();

      expect(mockDialogManager.clearQueue).toHaveBeenCalled();
    });

    it('should clear singleton instance', () => {
      const instance1 = ScenarioDialogManager.getInstance();

      ScenarioDialogManager.reset();

      const instance2 = ScenarioDialogManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should be safe to call when no instance exists', () => {
      expect(() => {
        ScenarioDialogManager.reset();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined objectives array', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: undefined,
        dialogClips: {
          objectives: {
            'obj-1': {
              text: 'Success!',
              character: 'alex' as Character,
              audioUrl: 'audio/clip.mp3',
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      const eventData: ObjectiveCompletedData = { objectiveId: 'obj-1' };

      expect(() => {
        EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, eventData);
        jest.advanceTimersByTime(500);
      }).not.toThrow();
    });

    it('should handle multiple objective completions', () => {
      mockScenarioManager.data = createMockScenarioData({
        objectives: [
          { id: 'obj-1', title: 'First' } as any,
          { id: 'obj-2', title: 'Second' } as any,
        ],
        dialogClips: {
          objectives: {
            'obj-1': {
              text: 'First complete!',
              character: 'alex' as Character,
              audioUrl: 'audio/1.mp3',
            },
            'obj-2': {
              text: 'Second complete!',
              character: 'alex' as Character,
              audioUrl: 'audio/2.mp3',
            },
          },
        },
      });

      const manager = ScenarioDialogManager.getInstance();
      manager.initialize();

      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'obj-1' });
      EventBus.getInstance().emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'obj-2' });

      jest.advanceTimersByTime(500);

      expect(mockDialogManager.show).toHaveBeenCalledTimes(2);
    });
  });
});
