import type { AlarmWithDetail } from '@app/services/alarm-service';

/** A card LED's colour class (`card-alarm-led <state>`) */
export type AlarmLedState = 'error' | 'warning' | 'success' | 'off';

/** An LED-only alarm that AlarmService does not raise (the antenna's `hasFault`) */
export interface AlarmLedExtra {
  severity: 'error' | 'warning';
  message: string;
}

export interface AlarmLedOptions {
  /** False when the equipment behind the LED is off: grey with `offTitle` */
  isPowered: boolean;
  offTitle: string;
  /**
   * Set when the equipment is powered but has nothing to report on (HPA output
   * disabled, no carrier): with no error or warning the LED is grey with this
   * title instead of the green "No alarms"
   */
  idleTitle?: string;
  extra?: AlarmLedExtra[];
}

export interface AlarmLed {
  state: AlarmLedState;
  title: string;
}

const RANK: Record<AlarmLedExtra['severity'], number> = { error: 0, warning: 1 };

/**
 * One card LED from AlarmService (Phase 33 D2, nats-r8-s02-F1/F2, s17-F1,
 * s23-F1, s24-F1, s08-F1), in the CardAlarmBadge order:
 * 1. unpowered -> grey, `offTitle`
 * 2. the worst error, then warning, among the matching alarms plus `extra`
 *    -> red / amber, titled with the top alarm ("label - detail")
 * 3. `idleTitle` set -> grey, `idleTitle`
 * 4. green "No alarms"
 *
 * Info alarms never light an LED. Ties keep AlarmService's order (most severe
 * first, then raise order), alarms before extras.
 */
export function alarmLed(alarms: readonly AlarmWithDetail[], match: (alarm: AlarmWithDetail) => boolean, opts: AlarmLedOptions): AlarmLed {
  if (!opts.isPowered) {
    return { state: 'off', title: opts.offTitle };
  }

  const candidates: { severity: AlarmLedExtra['severity']; title: string }[] = [];
  for (const alarm of alarms) {
    if ((alarm.severity === 'error' || alarm.severity === 'warning') && match(alarm)) {
      candidates.push({ severity: alarm.severity, title: alarm.detail ? `${alarm.message} - ${alarm.detail}` : alarm.message });
    }
  }
  for (const extra of opts.extra ?? []) {
    candidates.push({ severity: extra.severity, title: extra.message });
  }

  let top: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    if (!top || RANK[candidate.severity] < RANK[top.severity]) {
      top = candidate;
    }
  }
  if (top) {
    return { state: top.severity, title: top.title };
  }

  if (opts.idleTitle) {
    return { state: 'off', title: opts.idleTitle };
  }
  return { state: 'success', title: 'No alarms' };
}

const LED_STATES: readonly AlarmLedState[] = ['error', 'warning', 'success', 'off'];

/**
 * Writes an `alarmLed` result onto a `card-alarm-led` element: swaps only the
 * state class (layout classes such as `ms-2` stay) and the title
 */
export function applyAlarmLed(el: HTMLElement, led: AlarmLed): void {
  el.classList.add('card-alarm-led');
  for (const state of LED_STATES) {
    if (state !== led.state) {
      el.classList.remove(state);
    }
  }
  el.classList.add(led.state);
  if (el.title !== led.title) {
    el.title = led.title;
  }
}
