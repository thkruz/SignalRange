import { EventBus } from '@app/events/event-bus';
import { type AggregatedAlarm, Events } from '@app/events/events';
import { Ambience } from '@app/sound/ambience';
import { Sfx } from '@app/sound/sfx-enum';
import { SoundEvents } from '@app/sound/sound-events';
import SoundManager from '@app/sound/sound-manager';
import { vi } from 'vitest';

const alarm = (message: string, severity: AggregatedAlarm['severity'] = 'error', index = 1): AggregatedAlarm => ({
  severity,
  message,
  assetId: 'gs-1',
  equipmentType: 'hpa',
  equipmentIndex: index,
});

describe('SoundEvents alarm tones', () => {
  let play: ReturnType<typeof vi.fn>;

  const raise = (...alarms: AggregatedAlarm[]) => EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, { alarms, highestSeverity: alarms[0]?.severity ?? 'success' });
  const after = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const alarmTones = () => play.mock.calls.map(([s]) => s).filter((s) => s === Sfx.ALARM_MAJOR || s === Sfx.ALARM_MINOR);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    EventBus.destroy();
    play = vi.fn();
    vi.spyOn(SoundManager, 'getInstance').mockReturnValue({ play, stop: vi.fn(), setMissionActive: vi.fn(), stopCustom: vi.fn() } as unknown as SoundManager);
    SoundEvents.start();
    SoundEvents.arm();
    after(2000);
  });

  afterEach(() => {
    SoundEvents.destroy();
    EventBus.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('acknowledges the correct quiz answer immediately and uses only a click for Continue', () => {
    const bus = EventBus.getInstance();
    bus.emit(Events.QUIZ_PASSED, { objectiveId: 'quiz', conditionIndex: 0, attempts: 1, pointsDeducted: 0 });
    expect(play).toHaveBeenLastCalledWith(Sfx.UI_CONFIRM);
    play.mockClear();
    bus.emit(Events.QUIZ_COMPLETED, { objectiveId: 'quiz', conditionIndex: 0, totalAttempts: 1, totalPointsDeducted: 0 });
    bus.emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'quiz', objective: {}, completedAt: 0 } as never);
    vi.advanceTimersByTime(100);
    expect(play.mock.calls.map(([sound]) => sound)).toEqual([Sfx.UI_CLICK]);
    bus.emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'equipment', objective: {}, completedAt: 0 } as never);
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenLastCalledWith(Sfx.OBJECTIVE_COMPLETE);
  });

  it('avoids the quiz completion chime when an objective listener runs before the Continue listener', () => {
    const bus = EventBus.getInstance();
    bus.emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'quiz', objective: {}, completedAt: 0 } as never);
    bus.emit(Events.QUIZ_COMPLETED, { objectiveId: 'quiz', conditionIndex: 0, totalAttempts: 1, totalPointsDeducted: 0 });
    vi.advanceTimersByTime(100);
    expect(play.mock.calls.map(([sound]) => sound)).toEqual([Sfx.UI_CLICK]);
  });

  it('sounds the major tone for a new error and the minor tone for a new warning', () => {
    raise(alarm('HPA over temp'));
    raise(alarm('HPA over temp'), alarm('LNB current low', 'warning', 2));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR, Sfx.ALARM_MINOR]);
  });

  it('does not re-sound when only a live number in the alarm text moves', () => {
    raise(alarm('Reflected power 3.2 dB'));
    raise(alarm('Reflected power 3.9 dB'));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR]);
  });

  it('keeps an alarm that clears and comes straight back quiet (chatter)', () => {
    raise(alarm('Carrier lock lost'));
    raise();
    after(5000);
    raise(alarm('Carrier lock lost'));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR]);
    raise();
    after(20_000);
    raise(alarm('Carrier lock lost'));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR, Sfx.ALARM_MAJOR]);
  });

  it('mute keeps an intermittent alarm quiet until it is turned off', () => {
    raise(alarm('Carrier lock lost'));
    SoundEvents.setAlarmsMuted(true);
    expect(SoundEvents.alarmsMuted).toBe(true);
    expect(play).toHaveBeenCalledWith(Sfx.UI_CLICK);

    for (let i = 0; i < 6; i++) {
      raise();
      after(60_000);
      raise(alarm('Carrier lock lost'), alarm(`New fault ${i}`, 'error', 10 + i));
    }
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR]);

    SoundEvents.setAlarmsMuted(false);
    raise();
    after(20_000);
    raise(alarm('Carrier lock lost'));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR, Sfx.ALARM_MAJOR]);
  });

  it('every scenario starts with alarm tones on', () => {
    SoundEvents.setAlarmsMuted(true);
    SoundEvents.start();
    expect(SoundEvents.alarmsMuted).toBe(false);
  });

  it('leaves backyard rooms quiet and restores the room bed for professional stations', () => {
    const start = vi.spyOn(Ambience.getInstance(), 'start');
    SoundEvents.arm([{ stationClass: 'backyard' }, { stationClass: 'backyard' }]);
    expect(start).toHaveBeenLastCalledWith(false);
    SoundEvents.arm([{ stationClass: 'professional' }]);
    expect(start).toHaveBeenLastCalledWith(true);
    SoundEvents.arm([{}]);
    expect(start).toHaveBeenLastCalledWith(true);
  });

  it('ends ambience and event sounds at completion, then enables them for the next mission', () => {
    const destroy = vi.spyOn(Ambience, 'destroy');
    const sound = SoundManager.getInstance();
    SoundEvents.finish();
    expect(sound.setMissionActive).toHaveBeenLastCalledWith(false);
    expect(sound.stopCustom).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledWith(true);
    raise(alarm('Fault after completion'));
    expect(alarmTones()).toEqual([]);
    SoundEvents.arm();
    after(2000);
    raise(alarm('Still complete'));
    expect(alarmTones()).toEqual([]);
    SoundEvents.start();
    SoundEvents.arm();
    after(2000);
    expect(sound.setMissionActive).toHaveBeenLastCalledWith(true);
    raise(alarm('New mission fault'));
    expect(alarmTones()).toEqual([Sfx.ALARM_MAJOR]);
  });

  it('does not voice alarms already active while the scenario loads', () => {
    SoundEvents.start();
    raise(alarm('HPA over temp'));
    SoundEvents.arm();
    after(2000);
    raise(alarm('HPA over temp'));
    expect(alarmTones()).toEqual([]);
  });

  it('setting the mute to its current state plays nothing', () => {
    SoundEvents.setAlarmsMuted(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays equipment cues only after loading and leaves restored alarms silent', () => {
    const bus = EventBus.getInstance();
    SoundEvents.start();
    bus.emit(Events.RX_SIGNAL_LOST, { uuid: 'rx', modem: 1 });
    expect(play).not.toHaveBeenCalled();
    SoundEvents.arm();
    after(2000);
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [alarm('Carrier lock lost')], highestSeverity: 'error', restored: true });
    raise(alarm('Carrier lock lost'));
    expect(alarmTones()).toEqual([]);
    bus.emit(Events.RX_SIGNAL_LOST, { uuid: 'rx', modem: 1 });
    bus.emit(Events.AUDIT_EVENT_ACKNOWLEDGED, { id: 'event' });
    bus.emit(Events.EQUIPMENT_ACTION, { message: 'HPA Power ON', system: 'RF FE', module: {} });
    expect(play.mock.calls.map(([cue]) => cue)).toEqual([Sfx.STATIC_BURST, Sfx.ALARM_ACK, Sfx.HPA_WARMUP]);
  });
});
