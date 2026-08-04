/**
 * @file TimeSkipOverlay - Visual feedback while the scenario clock fast-forwards
 * @description A fast-forward with no feedback is indistinguishable from a
 * freeze: the operator clicks Skip, the UI stalls for two seconds, and the clock
 * is suddenly forty minutes later. So the skip is shown happening - the UTC
 * clock races through every minute it covers, a bar fills, and the countdown to
 * AOS winds down - which also makes it obvious that time was consumed rather
 * than conjured.
 *
 * Mounted only while a skip is running, and it covers the console: acting on
 * equipment mid-skip would be acting at 400x speed.
 */

import { html } from '@app/engine/utils/development/formatter';
import { EventBus } from '@app/events/event-bus';
import { Events, TimeSkipEndedData, TimeSkipProgressData, TimeSkipStartedData } from '@app/events/events';
import { formatDuration, formatUtcClock, formatUtcDate } from './time-skip-format';
import './time-skip.css';

export class TimeSkipOverlay {
  private static readonly ELEMENT_ID = 'time-skip-overlay';

  private el_: HTMLElement | null = null;
  private targetMs_ = 0;
  private satelliteName_ = '';

  private readonly boundStartedHandler_: (data: TimeSkipStartedData) => void;
  private readonly boundProgressHandler_: (data: TimeSkipProgressData) => void;
  private readonly boundEndedHandler_: (data: TimeSkipEndedData) => void;

  constructor() {
    this.boundStartedHandler_ = this.handleStarted_.bind(this);
    this.boundProgressHandler_ = this.handleProgress_.bind(this);
    this.boundEndedHandler_ = this.handleEnded_.bind(this);

    const eventBus = EventBus.getInstance();

    eventBus.on(Events.TIME_SKIP_STARTED, this.boundStartedHandler_);
    eventBus.on(Events.TIME_SKIP_PROGRESS, this.boundProgressHandler_);
    eventBus.on(Events.TIME_SKIP_ENDED, this.boundEndedHandler_);
  }

  private handleStarted_(data: TimeSkipStartedData): void {
    this.targetMs_ = data.targetMs;
    this.satelliteName_ = data.satelliteName;

    document.body.insertAdjacentHTML('beforeend', html`
      <div id="${TimeSkipOverlay.ELEMENT_ID}" class="time-skip-overlay">
        <div class="time-skip-overlay-card">
          <div class="time-skip-overlay-label">
            <i class="fa-solid fa-forward"></i> Advancing scenario clock
          </div>
          <div class="time-skip-overlay-clock" id="time-skip-overlay-clock">--:--:--Z</div>
          <div class="time-skip-overlay-date" id="time-skip-overlay-date"></div>
          <div class="time-skip-overlay-bar">
            <div class="time-skip-overlay-bar-fill" id="time-skip-overlay-fill"></div>
          </div>
          <div class="time-skip-overlay-target" id="time-skip-overlay-target"></div>
        </div>
      </div>
    `);

    this.el_ = document.getElementById(TimeSkipOverlay.ELEMENT_ID);
  }

  private handleProgress_(data: TimeSkipProgressData): void {
    if (!this.el_) {
      return;
    }

    const clockEl = this.el_.querySelector('#time-skip-overlay-clock');
    const dateEl = this.el_.querySelector('#time-skip-overlay-date');
    const fillEl = this.el_.querySelector<HTMLElement>('#time-skip-overlay-fill');
    const targetEl = this.el_.querySelector('#time-skip-overlay-target');

    if (clockEl) {
      clockEl.textContent = formatUtcClock(data.simNowMs);
    }
    if (dateEl) {
      dateEl.textContent = formatUtcDate(data.simNowMs);
    }
    if (fillEl) {
      fillEl.style.width = `${Math.round(data.progress * 100)}%`;
    }
    if (targetEl) {
      const remainingMs = Math.max(0, this.targetMs_ - data.simNowMs);

      targetEl.innerHTML = html`
        Holding at <strong>${formatUtcClock(this.targetMs_)}</strong>
        &middot; ${formatDuration(remainingMs)} of scenario time to go
        &middot; then ${this.satelliteName_} AOS
      `;
    }
  }

  private handleEnded_(_data: TimeSkipEndedData): void {
    this.el_?.remove();
    this.el_ = null;
  }

  dispose(): void {
    const eventBus = EventBus.getInstance();

    eventBus.off(Events.TIME_SKIP_STARTED, this.boundStartedHandler_);
    eventBus.off(Events.TIME_SKIP_PROGRESS, this.boundProgressHandler_);
    eventBus.off(Events.TIME_SKIP_ENDED, this.boundEndedHandler_);
    this.el_?.remove();
    this.el_ = null;
  }
}
