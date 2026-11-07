import { EventBus } from '@app/events/event-bus';
import { type AggregatedAlarm, Events } from '@app/events/events';
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
    vi.spyOn(SoundManager, 'getInstance').mockReturnValue({ play, stop: vi.fn() } as unknown as SoundManager);
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
    expect(play).toHaveBeenCalledWith(Sfx.ALARM_ACK);

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
});
