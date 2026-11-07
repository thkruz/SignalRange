import { EventBus } from '@app/events/event-bus';
import {
  type AggregatedAlarm,
  type AlarmStateChangedData,
  type DecisionGradedData,
  Events,
  type QuizAnsweredData,
  type TxTransmitChangedData,
  type WeatherEventData,
} from '@app/events/events';
import { Ambience, type AmbienceLayer } from './ambience';
import { Sfx } from './sfx-enum';
import SoundManager from './sound-manager';

/**
 * Plays sounds for game events on the scenario's EventBus and drives the
 * room ambience. One instance per scenario page: start() after the page
 * builds its bus, destroy() before EventBus.destroy().
 *
 * Nothing is voiced until the page calls arm() after its async init, plus a
 * short settle window (checkpoint restore replays objectives and alarms);
 * alarms raised before then are remembered so they do not sound later either.
 */
const WARMUP_MS = 1000;
const OBJECTIVE_DEFER_MS = 60;
/** An alarm back within this long of clearing is chatter and stays quiet */
const CHATTER_MS = 15_000;

const SEVERITY_INTENSITY: Record<WeatherEventData['severity'], number> = {
  minor: 0.45,
  moderate: 0.75,
  severe: 1,
};

type Handler = (...args: never[]) => void;

export class SoundEvents {
  private static instance_: SoundEvents | null = null;
  /** Operator's alarm-tone mute; every scenario starts unmuted */
  private static alarmsMuted_ = false;

  private readonly bus_: EventBus;
  private armedAt_ = Number.POSITIVE_INFINITY;
  private readonly handlers_: [Events, Handler][] = [];
  private activeAlarms_ = new Set<string>();
  private readonly clearedAt_ = new Map<string, number>();
  private readonly weather_ = new Map<string, WeatherEventData>();
  private objectiveTimer_: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.bus_ = EventBus.getInstance();
    this.bind_();
    Ambience.getInstance().start();
  }

  static start(): SoundEvents {
    SoundEvents.instance_?.dispose_();
    SoundEvents.alarmsMuted_ = false;
    SoundEvents.instance_ = new SoundEvents();

    return SoundEvents.instance_;
  }

  /** Call once the scenario has finished loading and restoring. */
  static arm(): void {
    if (SoundEvents.instance_) {
      SoundEvents.instance_.armedAt_ = Date.now();
    }
  }

  static destroy(): void {
    SoundEvents.instance_?.dispose_();
    SoundEvents.instance_ = null;
    Ambience.destroy();
  }

  private get warmingUp_(): boolean {
    return !(Date.now() - this.armedAt_ >= WARMUP_MS);
  }

  private play_(sfx: Sfx): void {
    if (this.warmingUp_) {
      return;
    }
    SoundManager.getInstance().play(sfx);
  }

  private on_<T extends Events>(event: T, handler: (...args: never[]) => void): void {
    this.bus_.on(event, handler as never);
    this.handlers_.push([event, handler]);
  }

  private bind_(): void {
    this.on_(Events.ALARM_STATE_CHANGED, (data: AlarmStateChangedData) => this.onAlarms_(data));
    this.on_(Events.FAULT_CHANGED, (data: { action: 'injected' | 'cleared' }) => {
      if (data.action === 'injected') {
        this.play_(Sfx.FAULT);
      }
    });
    this.on_(Events.TX_TRANSMIT_CHANGED, (data: TxTransmitChangedData) => this.play_(data.transmitting ? Sfx.TX_ON : Sfx.TX_OFF));
    this.on_(Events.CRYPTO_KEY_ROTATED, () => this.play_(Sfx.KEYPRESS));
    this.on_(Events.CRYPTO_ZEROIZED, () => this.play_(Sfx.ZEROIZE));

    this.on_(Events.OBJECTIVE_COMPLETED, () => this.onObjectiveCompleted_());
    this.on_(Events.OBJECTIVES_ALL_COMPLETED, () => {
      this.cancelObjectiveCue_();
      this.play_(Sfx.SCENARIO_COMPLETE);
    });
    this.on_(Events.OBJECTIVE_FAILED, () => this.play_(Sfx.SCENARIO_FAILED));
    this.on_(Events.WEATHER_MISSION_FAILURE, () => this.play_(Sfx.SCENARIO_FAILED));
    this.on_(Events.SCENARIO_TIME_EXPIRED, () => this.play_(Sfx.TIMER_WARNING));
    this.on_(Events.TIME_PENALTY_APPLIED, () => this.play_(Sfx.PENALTY));
    this.on_(Events.QUIZ_ANSWERED, (data: QuizAnsweredData) => this.play_(data.isCorrect ? Sfx.UI_CONFIRM : Sfx.UI_ERROR));
    this.on_(Events.DECISION_GRADED, (data: DecisionGradedData) => this.play_(data.correct ? Sfx.UI_CONFIRM : Sfx.UI_ERROR));
    this.on_(Events.HINT_SHOWN, () => this.play_(Sfx.NOTIFY));
    this.on_(Events.PROGRESS_SAVE_ERROR, () => this.play_(Sfx.UI_ERROR));
    this.on_(Events.SWITCH_TAB, () => this.play_(Sfx.UI_CLICK));
    this.on_(Events.HANDOVER_INITIATED, () => this.play_(Sfx.RADIO_CALL_OUT));
    this.on_(Events.HANDOVER_COMPLETE, () => this.play_(Sfx.RADIO_CALL_IN));

    this.on_(Events.WEATHER_EVENT_STARTED, (data: WeatherEventData) => {
      this.weather_.set(data.id, data);
      this.applyWeather_();
    });
    this.on_(Events.WEATHER_EVENT_ENDED, (data: WeatherEventData) => {
      this.weather_.delete(data.id);
      this.applyWeather_();
    });
  }

  /**
   * A new error sounds the major tone, a new warning the minor one. An alarm
   * that clears and comes back within CHATTER_MS stays quiet. The operator's
   * mute (setAlarmsMuted) silences every alarm tone until it is turned off,
   * so an intermittent fault does not keep sounding while it is worked.
   */
  private onAlarms_(data: AlarmStateChangedData): void {
    const now = Date.now();
    const current = new Map<string, AggregatedAlarm['severity']>();
    for (const alarm of data.alarms) {
      if (alarm.severity === 'error' || alarm.severity === 'warning') {
        current.set(SoundEvents.alarmKey_(alarm), alarm.severity);
      }
    }

    let newError = false;
    let newWarning = false;
    for (const [key, severity] of current) {
      if (this.activeAlarms_.has(key)) {
        continue;
      }
      const clearedAt = this.clearedAt_.get(key);
      if (clearedAt !== undefined && now - clearedAt < CHATTER_MS) {
        continue;
      }
      if (severity === 'error') {
        newError = true;
      } else {
        newWarning = true;
      }
    }
    for (const key of this.activeAlarms_) {
      if (!current.has(key)) {
        this.clearedAt_.set(key, now);
      }
    }
    this.activeAlarms_ = new Set(current.keys());
    for (const [key, at] of this.clearedAt_) {
      if (now - at > CHATTER_MS) {
        this.clearedAt_.delete(key);
      }
    }

    if (SoundEvents.alarmsMuted_) {
      return;
    }
    if (newError) {
      this.play_(Sfx.ALARM_MAJOR);
    } else if (newWarning) {
      this.play_(Sfx.ALARM_MINOR);
    }
  }

  /** Where an alarm is raised and what it says, without the live numbers in its text. */
  private static alarmKey_(alarm: AggregatedAlarm): string {
    const text = alarm.message.replace(/[-+]?\d+(?:\.\d+)?/gu, '#');

    return `${alarm.assetId}|${alarm.equipmentType}|${alarm.equipmentIndex}|${alarm.severity}|${text}`;
  }

  static get alarmsMuted(): boolean {
    return SoundEvents.alarmsMuted_;
  }

  /** Operator's alarm mute toggle: muting stops a tone already playing. */
  static setAlarmsMuted(muted: boolean): void {
    if (SoundEvents.alarmsMuted_ === muted) {
      return;
    }
    SoundEvents.alarmsMuted_ = muted;
    const sound = SoundManager.getInstance();
    if (muted) {
      sound.stop(Sfx.ALARM_MAJOR);
      sound.stop(Sfx.ALARM_MINOR);
    }
    sound.play(Sfx.UI_CLICK);
  }

  /** Defer the objective cue a moment so the last objective plays the scenario cue instead. */
  private onObjectiveCompleted_(): void {
    if (this.warmingUp_) {
      return;
    }
    this.cancelObjectiveCue_();
    this.objectiveTimer_ = setTimeout(() => {
      this.objectiveTimer_ = null;
      this.play_(Sfx.OBJECTIVE_COMPLETE);
    }, OBJECTIVE_DEFER_MS);
  }

  private cancelObjectiveCue_(): void {
    if (this.objectiveTimer_ !== null) {
      clearTimeout(this.objectiveTimer_);
      this.objectiveTimer_ = null;
    }
  }

  private applyWeather_(): void {
    const level: Record<Exclude<AmbienceLayer, 'room'>, number> = { rain: 0, wind: 0, storm: 0 };
    const raise = (layer: keyof typeof level, value: number) => {
      level[layer] = Math.max(level[layer], value);
    };
    for (const event of this.weather_.values()) {
      const i = SEVERITY_INTENSITY[event.severity] ?? 0.6;
      switch (event.type) {
        case 'rain':
        case 'hail':
          raise('rain', i);
          break;
        case 'storm':
          raise('storm', i);
          raise('rain', i * 0.6);
          raise('wind', i * 0.5);
          break;
        case 'wind':
          raise('wind', i);
          break;
        case 'snow':
        case 'ice':
          raise('wind', i * 0.5);
          break;
        default:
          break;
      }
    }
    const ambience = Ambience.getInstance();
    ambience.setLayer('rain', level.rain);
    ambience.setLayer('wind', level.wind);
    ambience.setLayer('storm', level.storm);
  }

  private dispose_(): void {
    this.cancelObjectiveCue_();
    for (const [event, handler] of this.handlers_) {
      this.bus_.off(event, handler as never);
    }
    this.handlers_.length = 0;
  }
}
