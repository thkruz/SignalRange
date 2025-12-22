import { Sfx } from '../../src/sound/sfx-enum';
import SoundManager from '../../src/sound/sound-manager';

describe('SoundManager.getInstance', () => {
  beforeEach(() => {
    // Reset the singleton instance between tests
    (SoundManager as any).instance = undefined;
  });

  it('should return a SoundManager instance', () => {
    const instance = SoundManager.getInstance();
    expect(instance).toBeInstanceOf(SoundManager);
  });

  it('should return the same instance on multiple calls', () => {
    const instance1 = SoundManager.getInstance();
    const instance2 = SoundManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should create instance only once', () => {
    const instance1 = SoundManager.getInstance();
    const instance2 = SoundManager.getInstance();
    const instance3 = SoundManager.getInstance();

    expect(instance1).toBe(instance2);
    expect(instance2).toBe(instance3);
  });

  describe('SoundManager.stop', () => {
    let manager: SoundManager;
    let mockAudio: HTMLAudioElement;

    beforeEach(() => {
      (SoundManager as any).instance = undefined;
      manager = SoundManager.getInstance();

      // Mock HTMLAudioElement
      mockAudio = {
        volume: 1,
        pause: jest.fn(),
        currentTime: 0,
        play: jest.fn().mockResolvedValue(undefined),
        cloneNode: jest.fn().mockReturnThis(),
        addEventListener: jest.fn(),
        loop: false,
      } as any;

      global.Audio = jest.fn().mockReturnValue(mockAudio) as any;
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should do nothing if sound is not currently playing', () => {
      manager.stop(Sfx.POWER_ON); // Sfx.POWER_ON
      expect(mockAudio.pause).not.toHaveBeenCalled();
    });

    it('should fade out and stop a currently playing sound', () => {
      // Start playing a sound
      (manager as any).currentlyPlaying.set(Sfx.POWER_ON, mockAudio);

      manager.stop(Sfx.POWER_ON);

      // Fast-forward through all fade steps
      jest.runAllTimers();

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(mockAudio.currentTime).toBe(0);
      expect(mockAudio.volume).toBe(1); // Restored to initial
      expect((manager as any).currentlyPlaying.has(0)).toBe(false);
    });

    it('should gradually reduce volume over 30 steps', () => {
      mockAudio.volume = 1;
      (manager as any).currentlyPlaying.set(Sfx.POWER_ON, mockAudio);

      manager.stop(Sfx.POWER_ON);

      // Check volume at step 15 (halfway)
      jest.advanceTimersByTime(150); // 300ms / 30 steps * 15
      expect(mockAudio.volume).toBeCloseTo(0.5, 1);

      // Complete the fade
      jest.runAllTimers();
      expect(mockAudio.volume).toBe(1); // Restored
    });

    it('should preserve initial volume when restoring', () => {
      mockAudio.volume = 0.7;
      (manager as any).currentlyPlaying.set(Sfx.POWER_ON, mockAudio);

      manager.stop(Sfx.POWER_ON);
      jest.runAllTimers();

      expect(mockAudio.volume).toBe(0.7);
    });

    it('should remove sound from currentlyPlaying after fade completes', () => {
      (manager as any).currentlyPlaying.set(Sfx.POWER_ON, mockAudio);

      manager.stop(Sfx.POWER_ON);
      expect((manager as any).currentlyPlaying.has(Sfx.POWER_ON)).toBe(true);

      jest.runAllTimers();
      expect((manager as any).currentlyPlaying.has(Sfx.POWER_ON)).toBe(false);
    });

    describe('SoundManager.play', () => {
      let manager: SoundManager;
      let mockAudio: HTMLAudioElement;

      beforeEach(() => {
        (SoundManager as any).instance = undefined;
        manager = SoundManager.getInstance();

        mockAudio = {
          volume: 1,
          pause: jest.fn(),
          currentTime: 0,
          play: jest.fn().mockResolvedValue(undefined),
          cloneNode: jest.fn().mockReturnThis(),
          addEventListener: jest.fn(),
          loop: false,
        } as any;

        global.Audio = jest.fn().mockReturnValue(mockAudio) as any;
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should create and play a new audio element', () => {
        manager.play(Sfx.SWITCH);

        expect(global.Audio).toHaveBeenCalledWith('/sfx/light-switch-flip.mp3');
        expect(mockAudio.play).toHaveBeenCalled();
        expect(mockAudio.currentTime).toBe(0);
      });

      it('should throttle non-looping, non-restart sounds', () => {
        manager.play(Sfx.SWITCH);
        expect(mockAudio.play).toHaveBeenCalledTimes(1);

        // Try to play again immediately (within throttle window)
        manager.play(Sfx.SWITCH);
        expect(mockAudio.play).toHaveBeenCalledTimes(1); // Should not play

        // Advance past throttle period (200ms for SWITCH)
        jest.advanceTimersByTime(201);
        manager.play(Sfx.SWITCH);
        expect(mockAudio.play).toHaveBeenCalledTimes(2);
      });

      it('should restart sounds in SFX_RESTART_ON_PLAY set', () => {
        const firstAudio = { ...mockAudio };
        manager.play(Sfx.POWER_ON);
        (manager as any).currentlyPlaying.set(Sfx.POWER_ON, firstAudio);

        manager.play(Sfx.POWER_ON);

        expect(firstAudio.pause).toHaveBeenCalled();
        expect(firstAudio.currentTime).toBe(0);
        expect(mockAudio.play).toHaveBeenCalledTimes(2);
      });

      it('should set loop property for looping sounds', () => {
        manager.play(Sfx.SMALL_MOTOR);

        expect(mockAudio.loop).toBe(true);
        expect(mockAudio.play).toHaveBeenCalled();
      });

      it('should not restart looping sounds if already playing', () => {
        manager.play(Sfx.SMALL_MOTOR);
        expect(mockAudio.play).toHaveBeenCalledTimes(1);

        manager.play(Sfx.SMALL_MOTOR);
        expect(mockAudio.play).toHaveBeenCalledTimes(1); // Should not play again
      });

      it('should track currently playing for restart-enabled sounds', () => {
        manager.play(Sfx.POWER_ON);

        expect((manager as any).currentlyPlaying.has(Sfx.POWER_ON)).toBe(true);
        expect(mockAudio.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
      });

      it('should track currently playing for looping sounds', () => {
        manager.play(Sfx.SMALL_MOTOR);

        expect((manager as any).currentlyPlaying.has(Sfx.SMALL_MOTOR)).toBe(true);
      });

      it('should not add ended listener for looping sounds', () => {
        manager.play(Sfx.SMALL_MOTOR);

        expect(mockAudio.addEventListener).not.toHaveBeenCalled();
      });

      it('should update last play time', () => {
        const beforePlay = Date.now();
        manager.play(Sfx.SWITCH);
        const afterPlay = (manager as any).lastPlayTime.get(Sfx.SWITCH);

        expect(afterPlay).toBeGreaterThanOrEqual(beforePlay);
      });

      it('should remove from currentlyPlaying when ended event fires for non-looping restart sounds', () => {
        manager.play(Sfx.POWER_ON);

        const endedCallback = (mockAudio.addEventListener as jest.Mock).mock.calls[0][1];
        endedCallback();

        expect((manager as any).currentlyPlaying.has(Sfx.POWER_ON)).toBe(false);
      });

      it('should handle sounds not in SFX_FILE_MAP', () => {
        const invalidSfx = 999 as unknown as Sfx;
        manager.play(invalidSfx);

        expect(mockAudio.play).not.toHaveBeenCalled();
      });
    });
  });
});