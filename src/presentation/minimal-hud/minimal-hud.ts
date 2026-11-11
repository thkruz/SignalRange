import watchPng from '@app/assets/images/ui/field-kit/watch.png';
import { EventBus } from '@app/events/event-bus';
import { type AggregatedAlarm, type AlarmStateChangedData, Events } from '@app/events/events';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { MINIMAL_HUD_CLASS } from './minimal-hud-policy';
import { readWatch, type WatchReadout, type WatchTimer } from './watch-readout';
import './minimal-hud.css';

export { MINIMAL_HUD_CLASS } from './minimal-hud-policy';

/** Stable identity for an alarm across ticks: its live text can change (counts, levels) while it stays raised. */
export function alarmKey(alarm: AggregatedAlarm): string {
  return `${alarm.assetId}|${alarm.equipmentType}|${alarm.equipmentIndex}|${alarm.severity}|${alarm.raisedAtMs ?? alarm.message}`;
}

/** Only warnings and critical alarms reach the field HUD; info rows (receiver "Signal(s) Detected") stay on the equipment. */
export function hudAlarm(alarm: AggregatedAlarm): boolean {
  return alarm.severity === 'warning' || alarm.severity === 'error';
}

/** A timer worth showing on the watch: one that is counting (not "No limit" or dashes). */
export function runningTimer(timer: WatchTimer): boolean {
  return /\d/u.test(timer.value) && !/no limit/iu.test(timer.value);
}

/** Anything held fullscreen (an object, the part close-up, the notebook) or the pause menu. */
export function objectHeld(): boolean {
  return !!document.querySelector('dialog.immersive-view[open], dialog.fnb-immersive[open], dialog#game-menu[open]');
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape_(text: string): string {
  return text.replace(/[&<>"']/gu, (ch) => ESCAPES[ch] ?? ch);
}

export interface MinimalHudOptions {
  /** Where the hidden command bar lives (the watch mirrors it); the document by default. */
  readSource?: () => ParentNode;
  /** Whether an object is held fullscreen, so a new alarm notice waits until it is put down. */
  isHeld?: () => boolean;
  /** The watch's Pause pusher (the game menu); hidden when not given. */
  onPause?: () => void;
}

/**
 * The minimal HUD for stations worked with physical equipment (Campaign 6 field stations): a wristwatch top right
 * (the station clock, the timers the hidden command bar keeps, and an alarm lamp while a warning or critical alarm
 * is raised), the tent caption beside it, and a warning plate top centre that stays up until the player
 * acknowledges it. The HUD hides while an object is held fullscreen; a plate raised meanwhile waits for the
 * object to be put down.
 *
 * It keeps no timers of its own: the watch reads the hidden global command bar and its buttons call that bar's
 * controls, so skips and countdowns behave exactly as in the other campaigns.
 */
export class MinimalHud {
  private static readonly UPDATE_INTERVAL_MS = 500;

  readonly element: HTMLDivElement;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private readonly immersive_ = new ImmersiveView();
  private readonly readSource_: () => ParentNode;
  private readonly isHeld_: () => boolean;
  private readonly onPause_: (() => void) | null;
  /** Every alarm key raised on the last report, so a repeat is not news. */
  private readonly seenAlarms_ = new Set<string>();
  /** Raised warning and critical alarms, most severe first. */
  private raised_: AggregatedAlarm[] = [];
  /** Keys of new alarms the player has not acknowledged yet, oldest first. */
  private queue_: string[] = [];
  /** The key on the plate now ('' when none), so a repaint does not re-announce it. */
  private shownKey_ = '';
  private active_ = false;
  private lastSyncTime_ = 0;
  private lastReadout_: WatchReadout | null = null;
  private readonly boundUpdate_: () => void;
  private readonly boundAlarms_: (data: AlarmStateChangedData) => void;
  private readonly boundWatchClick_: () => void;
  private readonly boundAck_: () => void;
  private readonly boundWatchPanelClick_: (event: Event) => void;
  private readonly boundDialogClose_: () => void;

  constructor(host: HTMLElement, options: MinimalHudOptions = {}) {
    this.readSource_ = options.readSource ?? (() => document);
    this.isHeld_ = options.isHeld ?? objectHeld;
    this.onPause_ = options.onPause ?? null;
    this.element = document.createElement('div');
    this.element.className = 'mc-hud';
    this.element.innerHTML = `
      <div class="mc-hud-notice" id="hud-alarm-notice" hidden>
        <div class="mc-hud-plate">
          <span class="mc-hud-plate-lamp" aria-hidden="true"></span>
          <div class="mc-hud-plate-body" id="hud-alarm-body" role="alert">
            <span class="mc-hud-plate-kicker" id="hud-alarm-kicker"></span>
            <span class="mc-hud-plate-text" id="hud-alarm-text"></span>
          </div>
          <button type="button" class="mc-hud-plate-ack" id="hud-alarm-ack">Acknowledge</button>
        </div>
      </div>
      <div class="mc-hud-cluster">
        <div class="mc-hud-tent" id="hud-tent-slot"></div>
        <button type="button" class="mc-watch" id="hud-watch" aria-label="Check your watch" title="Check your watch">
          <img src="${watchPng}" alt="" draggable="false" />
          <span class="mc-watch-lcd"><span class="mc-watch-time" id="hud-watch-time">--:--</span></span>
          <span class="mc-watch-alarm" id="hud-watch-alarm" aria-hidden="true" hidden><span class="mc-watch-alarm-glyph">&#9650;</span><span id="hud-watch-alarm-count"></span></span>
        </button>
      </div>
      <div class="mc-watch-park" hidden>
        <section class="mc-watch-panel" id="hud-watch-panel">
          <div class="mc-watch-big">
            <img src="${watchPng}" alt="" draggable="false" />
            <span class="mc-watch-lcd"><span class="mc-watch-time" id="hud-watch-panel-time">--:--</span><span class="mc-watch-sub" id="hud-watch-panel-sub"></span></span>
          </div>
          <div class="mc-watch-readouts" id="hud-watch-timers"></div>
          <ul class="mc-watch-alarms" id="hud-watch-alarms" aria-label="Alarms raised" hidden></ul>
          <div class="mc-watch-skips" id="hud-watch-skips"></div>
          <p class="mc-watch-none" id="hud-watch-none">Nothing to wait for right now.</p>
          <button type="button" class="mc-watch-pusher mc-watch-pause" id="hud-watch-pause"${this.onPause_ ? '' : ' hidden'}>Pause</button>
        </section>
      </div>
    `;
    for (const el of this.element.querySelectorAll<HTMLElement>('[id]')) this.domCache_.set(el.id, el);
    host.append(this.element);

    this.boundUpdate_ = this.throttledSync_.bind(this);
    this.boundAlarms_ = this.onAlarms_.bind(this);
    this.boundWatchClick_ = this.openWatch.bind(this);
    this.boundAck_ = this.acknowledge.bind(this);
    this.boundWatchPanelClick_ = this.onWatchPanelClick_.bind(this);
    this.boundDialogClose_ = this.onDialogClose_.bind(this);
    this.domCache_.get('hud-watch')?.addEventListener('click', this.boundWatchClick_);
    this.domCache_.get('hud-alarm-ack')?.addEventListener('click', this.boundAck_);
    this.domCache_.get('hud-watch-panel')?.addEventListener('click', this.boundWatchPanelClick_);
    // `close` does not bubble; capture sees every dialog put down, so a waiting plate shows at once
    document.addEventListener('close', this.boundDialogClose_, true);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.boundAlarms_);
  }

  get isActive(): boolean {
    return this.active_;
  }

  /** The slot beside the watch where the tent caption sits while the HUD is active. */
  get tentSlot(): HTMLElement {
    return this.domCache_.get('hud-tent-slot')!;
  }

  /** Show the HUD and hide the station computer's chrome, or the reverse. */
  setActive(active: boolean): void {
    if (this.active_ === active) return;
    this.active_ = active;
    document.documentElement.classList.toggle(MINIMAL_HUD_CLASS, active);
    if (!active) {
      this.immersive_.close();
      this.queue_ = [];
    }
    this.sync();
    this.renderAlarms_();
  }

  /** The watch held up fullscreen: the clock, the timers, the alarms raised and the waits on offer. */
  openWatch(): void {
    if (!this.active_) return;
    const panel = this.domCache_.get('hud-watch-panel');
    if (!panel) return;
    this.sync();
    this.immersive_.open(panel, 'Wristwatch', 'equipment', () => this.immersive_.close());
  }

  closeWatch(): void {
    this.immersive_.close();
  }

  /** The plate's Acknowledge: the next unacknowledged alarm takes its place. The lamp stays while alarms stay raised. */
  acknowledge(): void {
    const ack = this.domCache_.get('hud-alarm-ack');
    const hadFocus = !!ack && document.activeElement === ack;
    if (this.shownKey_) this.queue_ = this.queue_.filter((key) => key !== this.shownKey_);
    this.renderAlarms_();
    if (!hadFocus) return;
    // Keep keyboard focus on the HUD: the next plate, or the watch that carries the alarm lamp
    if (this.shownKey_) ack?.focus({ preventScroll: true });
    else this.domCache_.get('hud-watch')?.focus({ preventScroll: true });
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < MinimalHud.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.sync();
    this.renderAlarms_();
  }

  /** Repaint the watch from the command bar. Cheap; a no-op while the HUD is off. */
  sync(): void {
    if (!this.active_) return;
    this.render_(readWatch(this.readSource_()));
  }

  private setText_(id: string, text: string): void {
    const el = this.domCache_.get(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private render_(readout: WatchReadout): void {
    this.lastReadout_ = readout;
    const running = readout.timers.filter(runningTimer);
    // The wrist shows HH:MM only; the raised watch has the seconds and the first running countdown
    this.setText_('hud-watch-time', readout.time.slice(0, 5));
    this.setText_('hud-watch-panel-time', readout.time);
    const first = running[0];
    this.setText_('hud-watch-panel-sub', first ? `${first.label.slice(0, 3).toUpperCase()} ${first.value}${first.hold ? ' H' : ''}` : '');
    this.syncWatchLabel_();

    const timers = this.domCache_.get('hud-watch-timers');
    const timerHtml = running
      .map(
        (timer) =>
          `<div class="mc-watch-readout"><span class="mc-watch-readout-label">${escape_(timer.label)}${timer.hold ? ' <span class="mc-watch-hold">HOLD</span>' : ''}</span><span class="mc-watch-readout-value">${escape_(timer.value)}</span></div>`
      )
      .join('');
    if (timers && timers.innerHTML !== timerHtml) timers.innerHTML = timerHtml;
    if (timers) timers.hidden = running.length === 0;

    const skips = this.domCache_.get('hud-watch-skips');
    if (skips) {
      const key = readout.skips.map((skip) => `${skip.sourceId}|${skip.label}|${skip.title}|${skip.disabled}`).join('\n');
      if (skips.dataset.key !== key) {
        skips.dataset.key = key;
        skips.innerHTML = readout.skips
          .map(
            (skip) =>
              `<button type="button" class="mc-watch-pusher mc-watch-wait" data-skip-source="${skip.sourceId}" title="${escape_(skip.title)}"${skip.disabled ? ' disabled' : ''}>${escape_(skip.label)}</button>`
          )
          .join('');
      }
    }
    const none = this.domCache_.get('hud-watch-none');
    if (none) none.hidden = readout.skips.length > 0;
  }

  /** Screen readers get the clock and the alarm lamp from the watch's name. */
  private syncWatchLabel_(): void {
    const watch = this.domCache_.get('hud-watch');
    if (!watch) return;
    const time = this.lastReadout_?.time.slice(0, 5) ?? '--:--';
    const count = this.raised_.length;
    const alarms = count === 0 ? '' : `, ${count} ${count === 1 ? 'alarm' : 'alarms'} raised`;
    const label = `Check your watch, ${time}${alarms}`;
    if (watch.getAttribute('aria-label') !== label) watch.setAttribute('aria-label', label);
  }

  private onWatchPanelClick_(event: Event): void {
    const target = event.target as Element;
    if (target.closest('#hud-watch-pause')) {
      this.immersive_.close();
      this.onPause_?.();

      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-skip-source]');
    if (!button || button.disabled) return;
    const source = this.readSource_().querySelector<HTMLButtonElement>(`#${button.dataset.skipSource}`);
    if (!source || source.disabled) return;
    // Put the watch down first: the skip asks for confirmation in its own window
    this.immersive_.close();
    source.click();
  }

  private onDialogClose_(): void {
    // The dialog's open attribute is already gone; repaint once its removal settles
    window.setTimeout(() => this.renderAlarms_(), 0);
  }

  private onAlarms_(data: AlarmStateChangedData): void {
    const notable = data.alarms.filter(hudAlarm);
    const fresh = notable.filter((alarm) => !this.seenAlarms_.has(alarmKey(alarm)));
    this.seenAlarms_.clear();
    for (const alarm of data.alarms) this.seenAlarms_.add(alarmKey(alarm));
    this.raised_ = notable;
    const current = new Set(notable.map(alarmKey));
    // A cleared alarm needs no acknowledgement
    this.queue_ = this.queue_.filter((key) => current.has(key));
    if (!data.restored && this.active_) {
      for (const alarm of fresh) this.queue_.push(alarmKey(alarm));
    }
    this.renderAlarms_();
  }

  /** The watch lamp, the close-up alarm list and the plate (unless something is held). */
  private renderAlarms_(): void {
    const lamp = this.domCache_.get('hud-watch-alarm');
    const count = this.active_ ? this.raised_.length : 0;
    if (lamp) {
      lamp.hidden = count === 0;
      lamp.dataset.severity = this.raised_.some((alarm) => alarm.severity === 'error') ? 'error' : 'warning';
    }
    this.setText_('hud-watch-alarm-count', count > 0 ? String(count) : '');
    this.syncWatchLabel_();

    const list = this.domCache_.get('hud-watch-alarms');
    if (list) {
      const listHtml = this.raised_
        .map((alarm) => `<li data-severity="${alarm.severity}"><span class="mc-watch-alarm-glyph" aria-hidden="true">&#9650;</span> ${escape_(alarm.message)}</li>`)
        .join('');
      if (list.innerHTML !== listHtml) list.innerHTML = listHtml;
      list.hidden = count === 0;
    }

    const notice = this.domCache_.get('hud-alarm-notice');
    if (!notice) return;
    const head = this.active_ && !this.isHeld_() ? this.headAlarm_() : null;
    if (!head) {
      notice.hidden = true;
      // Empty the live region so the same alarm is announced again when it reappears
      if (this.shownKey_) {
        this.setText_('hud-alarm-kicker', '');
        this.setText_('hud-alarm-text', '');
      }
      this.shownKey_ = '';

      return;
    }
    const key = alarmKey(head);
    const position = this.queue_.length > 1 ? ` · 1 of ${this.queue_.length}` : '';
    this.setText_('hud-alarm-kicker', `${head.severity === 'error' ? 'Critical' : 'Warning'}${position}`);
    this.setText_('hud-alarm-text', head.message);
    notice.dataset.severity = head.severity;
    notice.hidden = false;
    this.shownKey_ = key;
  }

  private headAlarm_(): AggregatedAlarm | null {
    for (const key of this.queue_) {
      const alarm = this.raised_.find((item) => alarmKey(item) === key);
      if (alarm) return alarm;
    }

    return null;
  }

  dispose(): void {
    this.setActive(false);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    EventBus.getInstance().off(Events.ALARM_STATE_CHANGED, this.boundAlarms_);
    document.removeEventListener('close', this.boundDialogClose_, true);
    this.domCache_.get('hud-watch')?.removeEventListener('click', this.boundWatchClick_);
    this.domCache_.get('hud-alarm-ack')?.removeEventListener('click', this.boundAck_);
    this.domCache_.get('hud-watch-panel')?.removeEventListener('click', this.boundWatchPanelClick_);
    this.domCache_.clear();
    this.element.remove();
  }
}
