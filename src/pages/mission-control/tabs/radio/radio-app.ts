import padPng from '@app/assets/images/ui/field-radio/call-log-pad.png';
import radioPng from '@app/assets/images/ui/field-radio/radio-body.png';
import { CharacterNames } from '@app/modal/character-enum';
import { DialogHistoryManager } from '@app/modal/dialog-history-manager';
import type { ServiceModel } from '@app/physical/service-model';
import type { SampleProvenance, ServiceLayer, ServiceSample } from '@app/physical/service-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import { callLog, type RadioChannel, type RadioQuestion, radioChannels, replyText } from './radio-calls';
import './radio-app.css';

/**
 * FieldRadio - The C6 handheld radio, held fullscreen (Phase 44 slice 3; pilot-report and endpoint-report evidence).
 *
 * The player turns the channel knob to a party (the pilot, the remote operator, each named endpoint), steps
 * through what to ask with the keys under the display, and presses the push-to-talk bar. The question goes out
 * (TX), the answer comes back over the speaker as a subtitle (RX), and the reading is written on the call-log
 * pad clipped beside the radio with its time and whether it still counts. Every answer is the owner's `check`,
 * so time cost, provenance and freshness follow the same rules as the old Check button.
 */

type Check = (serviceId: string, layer: ServiceLayer, via: SampleProvenance, endpointId?: string) => ServiceSample | null;

/** How long the press-and-answer takes on screen (real ms; the scenario time cost is spent by `check`) */
export const RADIO_TX_MS = 700;

/** Wheel travel that turns the channel knob one detent */
export const WHEEL_DETENT_PX = 50;

export class FieldRadio {
  private channels_: RadioChannel[] = [];
  private channelIndex_ = 0;
  private questionIndex_ = 0;
  private busy_ = false;
  private builtKey_ = '';
  private note_ = '';
  private reply_: { party: string; subject: string; text: string } | null = null;
  private page_: 'calls' | 'conversations' = 'calls';
  private wheelAcc_ = 0;
  private timer_: number | null = null;
  /** Set by the owner so a press can reach the live model */
  modelForClick: (() => ServiceModel | null) | null = null;
  afterRun: (() => void) | null = null;
  /** Set by the owner: whether the scenario has a dialog history to show as the pad's second page */
  conversationsAvailable: (() => boolean) | null = null;

  constructor(
    private readonly host_: HTMLElement,
    private readonly check_: Check
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('keydown', this.onKey_);
    this.host_.addEventListener('wheel', this.onWheel_, { passive: false });
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('keydown', this.onKey_);
    this.host_.removeEventListener('wheel', this.onWheel_);
    if (this.timer_ !== null) window.clearTimeout(this.timer_);
  }

  setNote(note: string): void {
    this.note_ = note;
  }

  /** Start on the channel that answers a source (the pilot for pilot reports, the remote operator for endpoint reports) */
  tuneTo(via: SampleProvenance): void {
    const i = this.channels_.findIndex((c) => c.via === via);
    if (i >= 0 && i !== this.channelIndex_) {
      this.channelIndex_ = i;
      this.questionIndex_ = 0;
    }
    this.pendingTune_ = this.channels_.length === 0 ? via : null;
  }

  private pendingTune_: SampleProvenance | null = null;

  get channel(): RadioChannel | null {
    return this.channels_[this.channelIndex_] ?? null;
  }

  get question(): RadioQuestion | null {
    return this.channel?.questions[this.questionIndex_] ?? null;
  }

  sync(model: ServiceModel, nowS: number): void {
    this.channels_ = radioChannels(model);
    if (this.pendingTune_) {
      const via = this.pendingTune_;
      this.pendingTune_ = null;
      this.tuneTo(via);
    }
    this.channelIndex_ = Math.min(this.channelIndex_, Math.max(0, this.channels_.length - 1));
    const key = `${this.conversations_ ? 'c' : '-'}#${this.channels_.map((c) => `${c.id}:${c.questions.length}`).join('|')}`;
    if (key !== this.builtKey_) {
      this.build_();
      this.builtKey_ = key;
    }
    this.patch_(model);
    void nowS;
  }

  private get conversations_(): boolean {
    return this.conversationsAvailable?.() ?? false;
  }

  private build_(): void {
    const max = Math.max(1, this.channels_.length);
    this.host_.innerHTML = `
      <div class="frd" data-radio-device>
        <div class="frd-stage">
          <div class="frd-radio" data-radio-state="idle">
            <img class="frd-body" src="${radioPng}" alt="" draggable="false" />
            <div class="frd-knob frd-knob-channel" role="slider" tabindex="0" aria-label="Channel knob" aria-valuemin="1" aria-valuemax="${max}" data-radio-knob="channel"><span class="frd-knob-grip"></span></div>
            <div class="frd-lcd" data-radio-lcd aria-live="polite">
              <div class="frd-lcd-top"><span class="frd-lcd-ch" data-radio="ch"></span><span class="frd-lcd-mode" data-radio="mode"></span></div>
              <div class="frd-lcd-q" data-radio="question"></div>
              <div class="frd-lcd-hint" data-radio="hint"></div>
            </div>
            <div class="frd-speaker" aria-hidden="true"></div>
            <div class="frd-keys" role="group" aria-label="Question keys">
              <button type="button" class="frd-key" data-radio-ask="prev" aria-label="Previous question">◄</button>
              <span class="frd-key-label">ASK</span>
              <button type="button" class="frd-key" data-radio-ask="next" aria-label="Next question">►</button>
            </div>
            <button type="button" class="frd-ptt" data-radio-ptt aria-label="Push to talk"><span>PTT</span></button>
          </div>
          <div class="frd-subtitle" data-radio="reply" aria-live="polite"></div>
        </div>
        <aside class="frd-pad" aria-label="Call log" style="--frd-pad: url('${padPng}')">
          <div class="frd-pad-sheet">
            <div class="frd-pad-tabs" role="tablist" aria-label="Pad pages">
              <button type="button" role="tab" class="frd-pad-tab" data-radio-page="calls" aria-selected="true">Call log</button>
              ${this.conversations_ ? '<button type="button" role="tab" class="frd-pad-tab" data-radio-page="conversations" aria-selected="false" tabindex="-1">Conversations</button>' : ''}
            </div>
            <ol class="frd-log" data-radio="log"></ol>
            <p class="frd-pad-note" data-radio="note"></p>
          </div>
        </aside>
      </div>`;
  }

  private el_(key: string): HTMLElement | null {
    return this.host_.querySelector<HTMLElement>(`[data-radio="${key}"]`);
  }

  private setText_(key: string, text: string): void {
    const el = this.el_(key);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private patch_(model: ServiceModel): void {
    const ch = this.channel;
    const q = this.question;
    const lcd = this.host_.querySelector<HTMLElement>('[data-radio-lcd]');
    if (lcd) {
      lcd.dataset.radioChannel = ch?.id ?? '';
      lcd.dataset.radioQuestion = q?.key ?? '';
    }
    const knob = this.host_.querySelector<HTMLElement>('[data-radio-knob="channel"]');
    if (knob && ch) {
      knob.setAttribute('aria-valuenow', String(ch.number));
      knob.setAttribute('aria-valuetext', `Channel ${ch.number}, ${ch.party}`);
      knob.style.setProperty('--frd-turn', `${-120 + (240 * this.channelIndex_) / Math.max(1, this.channels_.length - 1)}deg`);
    }
    this.setText_('ch', ch ? `CH${ch.number} ${ch.tag}` : 'NO NET');
    this.setText_('mode', this.busy_ ? 'TX' : this.reply_ ? 'RX' : '');
    this.setText_('question', q ? q.text : 'Nobody to call on this channel.');
    this.setText_('hint', ch && ch.questions.length > 1 ? `Ask ${this.questionIndex_ + 1} of ${ch.questions.length}` : '');
    const radio = this.host_.querySelector<HTMLElement>('.frd-radio');
    const state = this.busy_ ? 'tx' : this.reply_ ? 'rx' : 'idle';
    if (radio && radio.dataset.radioState !== state) radio.dataset.radioState = state;
    // aria-disabled, not `disabled`: a disabled button drops keyboard focus, and PTT must keep it through TX and RX.
    // The busy_ guards in press_ / stepQuestion / turnChannel do the blocking.
    for (const b of this.host_.querySelectorAll<HTMLButtonElement>('[data-radio-ptt], [data-radio-ask]'))
      b.setAttribute('aria-disabled', String(this.busy_ || (b.hasAttribute('data-radio-ptt') && !q)));

    const sub = this.el_('reply');
    if (sub) {
      const html = this.busy_
        ? '<span class="frd-sub-static">Calling…</span>'
        : this.reply_
          ? `<b>${escapeHtml(this.reply_.party)}${this.reply_.subject ? ` (${escapeHtml(this.reply_.subject)})` : ''}:</b> ${escapeHtml(this.reply_.text)}`
          : '';
      if (sub.dataset.sig !== html) {
        sub.dataset.sig = html;
        sub.innerHTML = html;
        sub.hidden = html === '';
      }
    }

    this.patchPad_(model);
    this.setText_('note', this.note_);
  }

  private patchPad_(model: ServiceModel): void {
    if (this.page_ === 'conversations' && !this.conversations_) this.page_ = 'calls';
    for (const tab of this.host_.querySelectorAll<HTMLElement>('[data-radio-page]')) {
      const on = tab.dataset.radioPage === this.page_;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    const log = this.el_('log');
    if (!log) return;
    const html = this.page_ === 'conversations' ? this.conversationsHtml_() : this.callsHtml_(model);
    if (log.dataset.sig !== html) {
      log.dataset.sig = html;
      log.innerHTML = html;
    }
  }

  private callsHtml_(model: ServiceModel): string {
    const entries = callLog(model);
    if (entries.length === 0) return '<li class="frd-log-none">No calls yet.</li>';

    return entries
      .map(
        (e) => `<li class="frd-entry frd-f-${e.freshness}${e.down ? ' frd-down' : ''}" data-radio-entry="${escapeHtml(e.sampleId)}">
          <div class="frd-entry-line"><span class="frd-entry-who">${escapeHtml(e.party)}</span> <span class="frd-entry-subject">${escapeHtml(e.subject)}</span></div>
          <div class="frd-entry-line frd-entry-reading" data-radio-reading>${escapeHtml(e.reading)}</div>
          <div class="frd-entry-line"><span class="frd-entry-time">${escapeHtml(e.time.replace('elapsed ', ''))}</span> <span class="frd-entry-badge" data-radio-badge>${escapeHtml(e.badge)}</span></div>
        </li>`
      )
      .join('');
  }

  /** Earlier calls on the net (the dialog history), newest first, as the pad's second page */
  private conversationsHtml_(): string {
    const history = DialogHistoryManager.getInstance().getHistory();
    if (history.length === 0) return '<li class="frd-log-none">No conversations yet.</li>';

    return [...history]
      .reverse()
      .map(
        (h) => `<li class="frd-entry frd-talk" data-radio-talk>
          <div class="frd-entry-line"><span class="frd-entry-who">${escapeHtml(CharacterNames[h.character] ?? '')}</span> <span class="frd-entry-time">${escapeHtml(new Date(h.timestamp).toISOString().slice(11, 19))}</span></div>
          <div class="frd-entry-line frd-entry-subject">${escapeHtml(h.title)}</div>
          <div class="frd-talk-text">${escapeHtml(h.text)}</div>
        </li>`
      )
      .join('');
  }

  setPage(page: 'calls' | 'conversations'): void {
    if (page === 'conversations' && !this.conversations_) return;
    this.page_ = page;
    this.afterRun?.();
  }

  turnChannel(step: number): void {
    if (this.busy_ || this.channels_.length === 0) return;
    this.channelIndex_ = (this.channelIndex_ + step + this.channels_.length) % this.channels_.length;
    this.questionIndex_ = 0;
    this.reply_ = null;
    this.afterRun?.();
  }

  stepQuestion(step: number): void {
    const n = this.channel?.questions.length ?? 0;
    if (this.busy_ || n === 0) return;
    this.questionIndex_ = (this.questionIndex_ + step + n) % n;
    this.reply_ = null;
    this.afterRun?.();
  }

  /** Key up and ask the shown question; the answer is a sample taken through `check` */
  call(model: ServiceModel): ServiceSample | null {
    const ch = this.channel;
    const q = this.question;
    if (!ch || !q) return null;
    const sample = this.check_(q.serviceId, q.layer, ch.via, q.endpointId);
    this.reply_ = sample ? { party: ch.party, subject: model.getPath(q.serviceId)?.label ?? '', text: replyText(model, sample) } : null;

    return sample;
  }

  private press_(): void {
    const model = this.modelForClick?.();
    if (!model || this.busy_ || !this.question) return;
    this.busy_ = true;
    this.reply_ = null;
    this.afterRun?.();
    this.timer_ = window.setTimeout(() => {
      this.timer_ = null;
      this.busy_ = false;
      this.call(model);
      this.afterRun?.();
    }, RADIO_TX_MS);
  }

  private readonly onClick_ = (e: MouseEvent): void => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-radio-ptt]')) {
      this.press_();
      return;
    }
    const page = t.closest<HTMLElement>('[data-radio-page]');
    if (page) {
      this.setPage(page.dataset.radioPage === 'conversations' ? 'conversations' : 'calls');
      return;
    }
    const ask = t.closest<HTMLElement>('[data-radio-ask]');
    if (ask) {
      this.stepQuestion(ask.dataset.radioAsk === 'prev' ? -1 : 1);
      return;
    }
    const knob = t.closest<HTMLElement>('[data-radio-knob="channel"]');
    if (knob) {
      const r = knob.getBoundingClientRect();
      this.turnChannel(e.clientX < r.left + r.width / 2 ? -1 : 1);
      knob.focus();
    }
  };

  private readonly onKey_ = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement).closest('[data-radio-page]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.conversations_) {
      e.preventDefault();
      this.setPage(this.page_ === 'calls' ? 'conversations' : 'calls');
      this.host_.querySelector<HTMLElement>(`[data-radio-page="${this.page_}"]`)?.focus();
      return;
    }
    const knob = (e.target as HTMLElement).closest('[data-radio-knob="channel"]');
    if (!knob) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      this.turnChannel(step);
    }
  };

  private readonly onWheel_ = (e: WheelEvent): void => {
    if (!(e.target as HTMLElement).closest('[data-radio-knob="channel"]')) return;
    e.preventDefault();
    // A detent is ~50 px of wheel travel: a trackpad flick or a smooth wheel must not spin through channels
    this.wheelAcc_ += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    while (Math.abs(this.wheelAcc_) >= WHEEL_DETENT_PX) {
      const dir = this.wheelAcc_ > 0 ? 1 : -1;
      this.wheelAcc_ -= dir * WHEEL_DETENT_PX;
      this.turnChannel(dir);
    }
  };
}
