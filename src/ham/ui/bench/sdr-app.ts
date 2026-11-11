/**
 * @file sdr-app - The receiver software on the laptop screen
 * @description A USB SDR has no knobs: you run it from a program on the computer it is plugged
 * into. This view is that program. It only finds a receiver when the SDR's USB plug is in the
 * laptop (and the receiver is powered). Tuning works like common SDR programs: click the top half
 * of a frequency digit to raise it, the bottom half to lower it, scroll over a digit, or click the
 * waterfall. Mode and bandwidth are toolbar buttons; volume and squelch are sliders.
 *
 * Test ids: ham-sdr-app, ham-sdr-app-nodevice, ham-sdr-<dev>-freq, ham-sdr-<dev>-digit-<place>-<up|down>,
 * ham-sdr-<dev>-freq-input, ham-sdr-<dev>-freq-enter, ham-sdr-<dev>-mode-<MODE>, ham-sdr-<dev>-bw-<hz>,
 * ham-sdr-<dev>-volume, ham-sdr-<dev>-squelch, ham-sdr-<dev>-gain, ham-sdr-<dev>-level, ham-sdr-<dev>-audio,
 * ham-sdr-<dev>-record, ham-sdr-<dev>-heard.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { RadioSettings, ReceptionImpairment, ReceptionResult } from '../../ham-types';
import { profileOf } from '../../station/station-devices';
import { SpectrumPanel } from '../panels/spectrum-panel';
import type { PanelContext } from '../station-panel';
import { button, h, isFocused, tid, transcriptList } from '../ui-kit';
import { sdrOnLaptop } from './bench-scene';

const BANDWIDTHS = [500, 2400, 6000, 12500, 15000, 25000];
/** Digit places shown, in Hz: 100 MHz down to 100 Hz */
const PLACES = [1e8, 1e7, 1e6, 1e5, 1e4, 1e3, 1e2];

const bwLabel = (hz: number): string => (hz >= 1000 ? `${(hz / 1000).toString()} kHz` : `${hz} Hz`);

/** How a voice sounds through the speaker, in the words a listener would use */
const SOUND: Partial<Record<ReceptionImpairment, string>> = {
  'filter-too-narrow': 'muffled and clipped',
  'weak-signal': 'noisy, words dropping out',
  'off-frequency': 'distorted, slightly off tune',
  'mode-mismatch': 'garbled noise',
  overload: 'harsh and buzzing',
  interference: 'another station underneath',
  collision: 'two stations on top of each other',
  fading: 'fading in and out',
};

function voiceQuality(r: ReceptionResult): string {
  const pct = Math.round(r.intelligibility * 100);
  if (pct >= 95) return 'voice, clear';
  const why = r.impairments.map((i) => SOUND[i]).find((x) => x !== undefined);

  return `voice, ${why ?? 'rough'} (about ${pct}% of the words)`;
}

export class SdrApp {
  readonly el: HTMLElement;
  private readonly ctx_: PanelContext;
  private laptopId_ = '';
  private sdrId_: string | null = null;
  private builtFor_ = '';
  private spectrum_ = new SpectrumPanel();
  private spectrumMounted_ = false;
  private syncs_: ((r: RadioSettings, m: HamStationManager) => void)[] = [];

  constructor(ctx: PanelContext) {
    this.ctx_ = ctx;
    this.el = h('div', { class: 'ham-sdr-app', id: 'ham-sdr-app', 'data-testid': 'ham-sdr-app' });
  }

  show(laptopId: string): void {
    this.laptopId_ = laptopId;
    this.update(this.ctx_.manager);
  }

  dispose(): void {
    this.spectrum_.dispose();
    this.el.remove();
  }

  update(m: HamStationManager): void {
    const laptop = m.device(this.laptopId_);
    const sdr = laptop?.powered ? sdrOnLaptop(m, this.laptopId_) : null;
    const ready = sdr !== null && m.energized(sdr);
    const key = `${this.laptopId_}|${laptop?.powered}|${sdr}|${ready}`;
    if (key !== this.builtFor_) {
      this.builtFor_ = key;
      this.sdrId_ = ready ? sdr : null;
      this.build_(m, laptop?.powered ?? false, sdr, ready);
    }
    if (this.sdrId_) {
      const r = m.radio(this.sdrId_);
      if (r) for (const s of this.syncs_) s(r, m);
      if (this.spectrumMounted_) this.spectrum_.update(m);
    }
  }

  private build_(m: HamStationManager, laptopOn: boolean, sdr: string | null, ready: boolean): void {
    this.syncs_ = [];
    if (this.spectrumMounted_) {
      this.spectrum_.dispose();
      this.spectrumMounted_ = false;
    }
    this.el.replaceChildren();
    const title = h(
      'div',
      { class: 'sdr-titlebar' },
      h('span', { text: 'SkyWatcher SDR v0.9.4 beta' }),
      h('span', { text: m.device(this.laptopId_)?.label ?? 'No computer at this location' })
    );
    this.el.append(title);
    if (!laptopOn) {
      this.el.append(h('div', { class: 'ham-sdr-empty', 'data-testid': 'ham-sdr-app-nodevice', text: 'The laptop is off.' }));

      return;
    }
    if (!sdr || !ready) {
      this.el.append(
        h(
          'div',
          { class: 'ham-sdr-empty', 'data-testid': 'ham-sdr-app-nodevice' },
          h('div', { class: 'fw-bold', text: 'No receiver found.' }),
          h('div', { class: 'small', text: sdr ? 'A receiver is plugged in but not responding.' : 'The program is waiting for a USB receiver.' })
        )
      );

      return;
    }
    const id = sdr;
    const profile = profileOf(m.device(id));
    const set = (patch: Partial<RadioSettings>): void => {
      this.ctx_.act({ type: 'radio.set', deviceId: id, patch });
    };

    // --- Frequency display: click top half of a digit to raise it, bottom half to lower it
    const freq = h('div', { class: 'ham-sdr-freq', id: tid('ham-sdr', id, 'freq'), 'data-testid': tid('ham-sdr', id, 'freq'), role: 'group', 'aria-label': 'Frequency' });
    const digits: { place: number; el: HTMLElement }[] = [];
    PLACES.forEach((place, i) => {
      if (i === 3) freq.append(h('span', { class: 'ham-sdr-dot', text: '.' }));
      const up = button(tid('ham-sdr', id, 'digit', place, 'up'), '', () => this.step_(id, place), 'ham-sdr-digit-half up', `Raise the ${placeName(place)} digit`);
      const down = button(tid('ham-sdr', id, 'digit', place, 'down'), '', () => this.step_(id, -place), 'ham-sdr-digit-half down', `Lower the ${placeName(place)} digit`);
      const face = h('span', { class: 'ham-sdr-digit-face', text: '0' });
      const cell = h('span', { class: 'ham-sdr-digit' }, face, up, down);
      cell.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.step_(id, e.deltaY < 0 ? place : -place);
      });
      freq.append(cell);
      digits.push({ place, el: face });
    });
    freq.append(h('span', { class: 'ham-sdr-unit', text: 'MHz' }));
    const typed = h('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'form-control form-control-sm ham-sdr-type',
      placeholder: 'Type MHz',
      'aria-label': 'Type a frequency in MHz',
    });
    typed.id = tid('ham-sdr', id, 'freq-input');
    typed.setAttribute('data-testid', typed.id);
    const enter = button(
      tid('ham-sdr', id, 'freq-enter'),
      'Tune',
      () => {
        const v = Number(typed.value.replace(',', '.'));
        if (Number.isFinite(v) && v > 0) {
          set({ vfoMHz: Math.round(v * 1e6) / 1e6 });
          typed.value = '';
        } else this.ctx_.feedback('Type a frequency in MHz, for example 146.52.', 'warning');
      },
      'btn btn-sm btn-outline-secondary'
    );
    typed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enter.click();
    });
    this.syncs_.push((r) => {
      const hz = Math.round(r.vfoMHz * 1e6);
      for (const d of digits) d.el.textContent = String(Math.floor(hz / d.place) % 10);
    });

    // --- Mode and bandwidth toolbars
    const modes = h('div', { class: 'ham-sdr-toolbar', role: 'group', 'aria-label': 'Mode' }, h('span', { class: 'ham-sdr-tool-label', text: 'Mode' }));
    const modeBtns = (profile?.rxModes ?? ['FM', 'AM', 'USB', 'LSB']).map((mode) => {
      const b = button(tid('ham-sdr', id, 'mode', mode), mode, () => set({ mode }), 'ham-sdr-tool');
      modes.append(b);

      return { mode, b };
    });
    const bws = h('div', { class: 'ham-sdr-toolbar', role: 'group', 'aria-label': 'Bandwidth' }, h('span', { class: 'ham-sdr-tool-label', text: 'Bandwidth' }));
    const bwBtns = BANDWIDTHS.map((hz) => {
      const b = button(tid('ham-sdr', id, 'bw', hz), bwLabel(hz), () => set({ filterHz: hz }), 'ham-sdr-tool');
      bws.append(b);

      return { hz, b };
    });
    this.syncs_.push((r) => {
      for (const x of modeBtns) {
        x.b.classList.toggle('is-active', x.mode === r.mode);
        x.b.setAttribute('aria-pressed', String(x.mode === r.mode));
      }
      for (const x of bwBtns) {
        x.b.classList.toggle('is-active', x.hz === r.filterHz);
        x.b.setAttribute('aria-pressed', String(x.hz === r.filterHz));
      }
    });

    // --- Sliders
    const slider = (key: string, label: string, min: number, max: number, read: (r: RadioSettings) => number, write: (v: number) => Partial<RadioSettings>): HTMLElement => {
      const i = h('input', { type: 'range', class: 'form-range', min, max, step: 1, 'aria-label': label });
      i.id = tid('ham-sdr', id, key);
      i.setAttribute('data-testid', i.id);
      const val = h('span', { class: 'ham-sdr-slider-val font-monospace' });
      // Show where the thumb is against the full range: "4 / 10", "10 / 10 max", "0 / 10 off"
      const fmt = (v: number): string => {
        if (min < 0) return `${v} dB`;
        if (v >= max) return `${v} / ${max} max`;

        return v <= min ? `${v} / ${max} off` : `${v} / ${max}`;
      };
      i.addEventListener('input', () => {
        val.textContent = fmt(Number(i.value));
      });
      i.addEventListener('change', () => set(write(Number(i.value))));
      this.syncs_.push((r) => {
        if (!isFocused(i)) i.value = String(read(r));
        val.textContent = fmt(read(r));
      });

      return h('label', { class: 'ham-sdr-slider', for: i.id }, h('span', { class: 'ham-sdr-slider-head' }, h('span', { class: 'ham-sdr-tool-label', text: label }), val), i);
    };
    const sliders = h(
      'div',
      { class: 'ham-sdr-sliders' },
      slider(
        'volume',
        'Volume',
        0,
        10,
        (r) => r.volume,
        (v) => ({ volume: v })
      ),
      slider(
        'squelch',
        'Squelch',
        0,
        10,
        (r) => r.squelch,
        (v) => ({ squelch: v })
      ),
      slider(
        'gain',
        'RF gain',
        -20,
        60,
        (r) => r.rfGainDb,
        (v) => ({ rfGainDb: v })
      )
    );

    // --- Signal level and what the speaker is doing
    const levelBar = h('div', { class: 'ham-sdr-level-fill' });
    const levelText = h('span', { class: 'font-monospace small' });
    const level = h(
      'div',
      { class: 'ham-sdr-level', 'data-testid': tid('ham-sdr', id, 'level'), 'aria-live': 'off' },
      h('span', { class: 'ham-sdr-tool-label', text: 'Signal' }),
      h('div', { class: 'ham-sdr-level-track' }, levelBar),
      levelText
    );
    const audio = h('div', { class: 'ham-sdr-audio', 'data-testid': tid('ham-sdr', id, 'audio'), role: 'status', 'aria-live': 'polite' });
    this.syncs_.push((r, mm) => {
      const live = mm.liveReception(id).filter((x) => x.rssiDbm > -150);
      const best = live.reduce<(typeof live)[number] | null>((a, x) => (!a || x.snrDb > a.snrDb ? x : a), null);
      levelBar.style.width = `${best ? Math.max(2, Math.min(100, ((best.rssiDbm + 130) / 80) * 100)) : 2}%`;
      levelText.textContent = best ? `${best.rssiDbm.toFixed(0)} dBm  SNR ${best.snrDb.toFixed(0)} dB` : 'noise floor';
      const heardNow = live.filter((x) => x.audible).sort((a, b) => b.intelligibility - a.intelligibility)[0];
      const hearing = heardNow !== undefined;
      const sqlOpen = live.some((x) => x.squelchOpen) || r.squelch === 0 || r.monitor;
      let text = 'Speaker silent';
      let cls = 'is-silent';
      if (r.volume <= 0) text = 'Speaker silent (volume at zero)';
      else if (hearing) {
        text = `Speaker: ${voiceQuality(heardNow)}`;
        cls = heardNow.intelligibility >= 0.8 ? 'is-voice' : 'is-rough';
      } else if (sqlOpen) {
        text = 'Speaker: hiss';
        cls = 'is-hiss';
      }
      audio.textContent = text;
      audio.className = `ham-sdr-audio ${cls}`;
    });

    const record = button(
      tid('ham-sdr', id, 'record'),
      'Record reading',
      () => {
        const live = this.ctx_.manager.liveReception(id).filter((x) => x.rssiDbm > -150);
        const best = live.reduce<(typeof live)[number] | null>((a, x) => (!a || x.snrDb > a.snrDb ? x : a), null);
        this.ctx_.act({ type: 'rx.record', deviceId: id, emitterId: best?.emissionId.split('#')[0] });
      },
      'btn btn-sm btn-outline-secondary',
      'Record a signal reading'
    );
    const heard = h('div', { class: 'ham-sdr-heard', 'data-testid': tid('ham-sdr', id, 'heard') });
    this.syncs_.push((_r, mm) => transcriptList(mm, heard));

    const specHost = h('div', { class: 'ham-sdr-spectrum' });
    const span = h('input', { type: 'range', min: 20000, max: 2000000, step: 10000, 'aria-label': 'Spectrum span', 'data-testid': tid('ham-sdr', id, 'span') });
    span.addEventListener('input', () => set({ spanHz: Number(span.value) }));
    this.syncs_.push((r) => {
      if (!isFocused(span)) span.value = String(r.spanHz);
    });
    const sidebar = h(
      'div',
      { class: 'ham-console-controls' },
      h('div', { class: 'sdr-section-header', text: 'RECEIVER' }),
      modes,
      bws,
      h('div', { class: 'sdr-section-header', text: 'AUDIO / RF' }),
      sliders,
      h('div', { class: 'sdr-section-header', text: 'DISPLAY' }),
      h('label', { class: 'ham-console-span' }, 'Span', span),
      h('div', { class: 'sdr-section-header', text: 'RECORDER' }),
      record
    );
    this.el.append(
      h('div', { class: 'sdr-topbar' }, freq, h('div', { class: 'ham-sdr-type-row' }, typed, enter), level),
      h(
        'div',
        { class: 'ham-console-body' },
        sidebar,
        h('div', { class: 'ham-console-display' }, specHost, audio, h('div', { class: 'sdr-section-header', text: 'RECEIVED TRANSMISSIONS' }), heard)
      )
    );
    this.spectrum_ = new SpectrumPanel(id);
    this.spectrum_.mount(specHost, this.ctx_);
    this.spectrumMounted_ = true;
    const r = m.radio(id);
    if (r) for (const s of this.syncs_) s(r, m);
  }

  private step_(id: string, deltaHz: number): void {
    const r = this.ctx_.manager.radio(id);
    if (!r) return;
    const hz = Math.max(0, Math.round(r.vfoMHz * 1e6) + deltaHz);
    this.ctx_.act({ type: 'radio.set', deviceId: id, patch: { vfoMHz: hz / 1e6 } });
  }
}

function placeName(place: number): string {
  if (place >= 1e6) return `${place / 1e6} MHz`;
  if (place >= 1e3) return `${place / 1e3} kHz`;

  return `${place} Hz`;
}
