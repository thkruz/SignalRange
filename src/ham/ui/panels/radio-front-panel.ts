/**
 * @file radio-front-panel - The C3 transceiver as a front panel you sit down at (Phase 44 slice 8)
 * @description One radio's face: a VFD with the frequency, mode, VFO/memory, filter, shift, tone, RIT,
 * lock and an S-meter; the main tuning dial with a STEP key; mode keys; a keypad for direct frequency
 * entry (F.INP); AF, SQL, RF and MIC knobs; a sub-panel of small knobs (filter width, shift, tones,
 * clarifier, memory and DMR channel); and on the desk in front of it the hand mic with the call card
 * and the pad where you note what you heard. Every control is a `radio.*`/`ptt` action on the station
 * manager (the same ones the old card sent); the panel reads state back and springs back when the
 * radio refuses. The dial commits each detent, as a real VFO does; typed entry commits on ENT.
 *
 * Test ids (dev = device id): ham-trx-<dev> (body), ham-radio-<dev>-<dial|step|finp|freq-input|apply|
 * clear|key-<0-9|dot>|band|mode-<MODE>|filter-hz|squelch|volume|rfgain|micgain|txpower|offset|
 * offset-khz|txtone|rxtone|rit-on|rit-hz|monitor|keylock|mem-slot|mem-name|mem-store|mem-recall|vfo|
 * dmr-channel|chan|record|status|smeter|snr|sql|msg|rxlog>, ham-ptt-<dev>-<intent-<kind>|target|item|
 * message|hold|transmit|release|status|refusal|area>.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { HamCapabilityProfile, HamMode, OffsetDirection, RadioSettings, TxIntent } from '../../ham-types';
import { CTCSS_TONES_HZ } from '../../radio/radio-settings';
import { profileOf } from '../../station/station-devices';
import type { PanelContext } from '../station-panel';
import { fmt, h, isFocused, tid, transcriptList } from '../ui-kit';
import { TrxKnob } from './trx-knob';
import './radio-front-panel.css';

const FACE_ART = '/assets/campaigns/home-sdr/bench/trx-face.webp';
/** Tuning steps the STEP key cycles through, MHz */
const STEPS_MHZ = [0.001, 0.005, 0.0125, 0.025, 0.1, 1];
const DEFAULT_STEP = 1;
const FILTER_PRESETS = [500, 2400, 6000, 12500, 15000, 25000];
const REPLY_ITEMS = ['report', 'name', 'location', 'grid', 'fill'];
const MSG_MS = 3500;
/** Anything this weak is the engine's "nothing heard" sentinel (-200), not a reading */
const HEARD_FLOOR_DBM = -150;
/** S-meter: 15 segments from -130 dBm (S0) to -50 dBm (S9+40ish) */
const S_SEGMENTS = 15;

const INTENTS: { kind: TxIntent['kind']; label: string }[] = [
  { kind: 'cq', label: 'CQ' },
  { kind: 'call', label: 'Call a station' },
  { kind: 'reply', label: 'Reply with' },
  { kind: 'identify', label: 'Identify' },
  { kind: 'net-checkin', label: 'Net check-in' },
  { kind: 'message', label: 'Message' },
  { kind: 'carrier', label: 'Carrier / test' },
  { kind: 'test', label: 'Test tone' },
];

const FORM_FOR_KIND: Record<string, 'desk' | 'mobile' | 'handheld'> = {
  'hf-rig': 'desk',
  mobile: 'mobile',
  handheld: 'handheld',
  'dmr-handheld': 'handheld',
  sdr: 'desk',
};

const khz = (mhz: number): string => (mhz < 0.01 ? `${Math.round(mhz * 1e4) / 10} kHz` : mhz < 1 ? `${Math.round(mhz * 1e3 * 10) / 10} kHz` : `${mhz} MHz`);

/** "145.500.00": MHz, kHz and tens of Hz in the way a VFD groups them */
function vfdDigits(mhz: number): string {
  const hz10 = Math.round(mhz * 1e5);
  const m = Math.floor(hz10 / 1e5);
  const k = Math.floor((hz10 % 1e5) / 100);
  const r = hz10 % 100;

  return `${m}.${String(k).padStart(3, '0')}.${String(r).padStart(2, '0')}`;
}

export class TransceiverFront {
  readonly el: HTMLElement;
  readonly id: string;
  private readonly ctx_: PanelContext;
  private readonly profile_: HamCapabilityProfile | null;
  private readonly label_: string;
  private readonly syncs_: ((r: RadioSettings, force: boolean) => void)[] = [];
  private readonly knobs_: TrxKnob[] = [];
  private readonly domCache_ = new Map<string, HTMLElement>();
  private readonly bandMemory_ = new Map<number, number>();
  private stepIdx_ = DEFAULT_STEP;
  private entering_ = false;
  private msgTimer_: ReturnType<typeof setTimeout> | null = null;
  private intent_: TxIntent['kind'] = 'cq';

  constructor(m: HamStationManager, ctx: PanelContext, id: string) {
    this.ctx_ = ctx;
    this.id = id;
    const dev = m.device(id);
    this.profile_ = profileOf(dev) ?? null;
    this.label_ = dev?.label ?? id;
    const form = FORM_FOR_KIND[dev?.kind ?? ''] ?? 'desk';
    const canTx = (this.profile_?.txRangesMHz.length ?? 0) > 0;
    const body = h(
      'div',
      { class: 'trx-body', 'data-form': form, 'data-testid': `ham-trx-${id}`, role: 'group', 'aria-label': `${this.label_} front panel` },
      this.buildBrand_(),
      this.buildDisplay_(),
      this.buildKnobColumn_(canTx),
      this.buildKeys_(canTx),
      this.buildDial_(),
      this.buildSub_(canTx)
    );
    body.style.backgroundImage = `url("${FACE_ART}")`;
    const desk = h('div', { class: 'trx-desk' }, canTx ? this.buildMic_(m) : null, this.buildPad_());
    this.el = h('div', { class: 'trx-room', 'data-testid': tid('ham-radio', id, 'front') }, h('div', { class: 'trx-stage' }, body), desk);
    this.sync(m, true);
  }

  dispose(): void {
    for (const k of this.knobs_) k.dispose();
    if (this.msgTimer_) clearTimeout(this.msgTimer_);
  }

  // ---- actions ---------------------------------------------------------------------------------

  /** Change a setting; a refusal springs every control back and shows on the display */
  private set_(patch: Partial<RadioSettings>): boolean {
    const r = this.ctx_.act({ type: 'radio.set', deviceId: this.id, patch });
    if (!r.ok) {
      this.flashMsg_(r.message);
      this.sync(this.ctx_.manager, true);
    }

    return r.ok;
  }

  private act_(a: Parameters<PanelContext['act']>[0]): boolean {
    const r = this.ctx_.act(a);
    this.flashMsg_(r.ok ? '' : r.message);
    this.sync(this.ctx_.manager, true);

    return r.ok;
  }

  private flashMsg_(text: string): void {
    const msg = this.domCache_.get('msg');
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = text === '';
    if (this.msgTimer_) clearTimeout(this.msgTimer_);
    if (text)
      this.msgTimer_ = setTimeout(() => {
        msg.hidden = true;
        msg.textContent = '';
      }, MSG_MS);
  }

  private t_(key: string): string {
    return tid('ham-radio', this.id, key);
  }

  private key_(key: string, text: string, onClick: () => void, aria?: string, extra = ''): HTMLButtonElement {
    const b = h('button', { type: 'button', class: `trx-key ${extra}`.trim(), id: this.t_(key), 'data-testid': this.t_(key), 'aria-label': aria ?? text, text });
    b.addEventListener('click', onClick);

    return b;
  }

  private knob_(o: ConstructorParameters<typeof TrxKnob>[0], read: (r: RadioSettings) => number): HTMLElement {
    const k = new TrxKnob(o);
    this.knobs_.push(k);
    this.syncs_.push((r) => k.show(read(r)));

    return k.el;
  }

  // ---- panel sections --------------------------------------------------------------------------

  private buildBrand_(): HTMLElement {
    const power = h('span', { class: 'trx-lamp trx-lamp-power', 'aria-hidden': 'true' });
    const air = h('span', { class: 'trx-lamp trx-lamp-tx', 'aria-hidden': 'true' });
    this.domCache_.set('lampPower', power);
    this.domCache_.set('lampTx', air);

    return h(
      'div',
      { class: 'trx-brand' },
      h('span', { class: 'trx-plate', text: this.label_ }),
      h(
        'span',
        { class: 'trx-lamps' },
        h('span', { class: 'trx-lamp-wrap' }, power, h('span', { text: 'POWER' })),
        h('span', { class: 'trx-lamp-wrap' }, air, h('span', { text: 'ON AIR' }))
      )
    );
  }

  private buildDisplay_(): HTMLElement {
    const ann = (key: string, text = ''): HTMLElement => {
      const e = h('span', { class: 'trx-ann', text, 'data-testid': key === 'vfo' ? this.t_('chan') : undefined });
      this.domCache_.set(key, e);

      return e;
    };
    const digits = h('span', { class: 'trx-digits', 'aria-hidden': 'true' });
    this.domCache_.set('digits', digits);
    // Direct entry: the frequency field lives in the display and shows only while F.INP is on
    const input = h('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'trx-entry',
      id: this.t_('freq-input'),
      'data-testid': this.t_('freq-input'),
      'aria-label': `${this.label_} frequency entry, MHz`,
      autocomplete: 'off',
      hidden: true,
    }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.enter_();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.endEntry_();
      }
    });
    this.domCache_.set('entry', input);
    const segs = h('span', { class: 'trx-smeter-segs', 'aria-hidden': 'true' });
    for (let i = 0; i < S_SEGMENTS; i++) segs.append(h('i', { class: i >= 9 ? 'over' : '' }));
    this.domCache_.set('segs', segs);
    const smeter = h('span', { 'data-testid': this.t_('smeter'), text: '-' });
    const snr = h('span', { 'data-testid': this.t_('snr'), text: '-' });
    const readout = h('span', { class: 'trx-readout' }, smeter, ' dBm  SNR ', snr, ' dB');
    const sql = h('span', { class: 'trx-ann', 'data-testid': this.t_('sql'), text: 'SQL closed' });
    const status = h('span', { class: 'trx-ann trx-ann-txrx', 'data-testid': this.t_('status') });
    const msg = h('div', { class: 'trx-msg', role: 'status', 'data-testid': this.t_('msg'), hidden: true });
    this.domCache_.set('smeter', smeter);
    this.domCache_.set('snr', snr);
    this.domCache_.set('sql', sql);
    this.domCache_.set('status', status);
    this.domCache_.set('msg', msg);
    this.domCache_.set('readout', readout);
    const freqLine = h('div', { class: 'trx-freq-line' }, digits, input, h('span', { class: 'trx-unit', text: 'MHz' }));
    this.domCache_.set('freqLine', freqLine);
    const vfd = h(
      'div',
      { class: 'trx-vfd', role: 'status', 'aria-live': 'off', 'aria-label': `${this.label_} display` },
      h(
        'div',
        { class: 'trx-ann-row' },
        status,
        ann('vfo', 'VFO'),
        ann('mode'),
        ann('filter'),
        ann('shift'),
        ann('tone'),
        ann('rit'),
        ann('lock'),
        ann('mon'),
        ann('pwr'),
        ann('step')
      ),
      freqLine,
      h('div', { class: 'trx-meter-row' }, h('span', { class: 'trx-s-label', text: 'S' }), segs, readout, sql),
      msg
    );
    this.domCache_.set('vfd', vfd);

    return h('div', { class: 'trx-display' }, vfd);
  }

  private buildKnobColumn_(canTx: boolean): HTMLElement {
    const col = h('div', { class: 'trx-knobs' });
    col.append(
      this.knob_(
        {
          testId: this.t_('volume'),
          label: 'AF, gain (volume)',
          legend: 'AF',
          min: 0,
          max: 10,
          step: 1,
          size: 'mid',
          format: (v) => `Volume ${v} of 10`,
          onTurn: (v) => this.set_({ volume: v }),
        },
        (r) => r.volume
      ),
      this.knob_(
        {
          testId: this.t_('squelch'),
          label: 'SQL, squelch',
          legend: 'SQL',
          min: 0,
          max: 10,
          step: 1,
          size: 'mid',
          format: (v) => (v === 0 ? 'Squelch open, 0 of 10' : `Squelch ${v} of 10`),
          onTurn: (v) => this.set_({ squelch: v }),
        },
        (r) => r.squelch
      ),
      this.knob_(
        {
          testId: this.t_('rfgain'),
          label: 'RF, gain',
          legend: 'RF',
          min: -20,
          max: 60,
          step: 1,
          bigStep: 10,
          size: 'mid',
          format: (v) => `RF gain ${v} dB`,
          onTurn: (v) => this.set_({ rfGainDb: v }),
        },
        (r) => r.rfGainDb
      )
    );
    if (canTx)
      col.append(
        this.knob_(
          {
            testId: this.t_('micgain'),
            label: 'MIC, gain',
            legend: 'MIC',
            min: 0,
            max: 10,
            step: 1,
            size: 'mid',
            format: (v) => `Mic gain ${v} of 10`,
            onTurn: (v) => this.set_({ micGain: v }),
          },
          (r) => r.micGain
        )
      );

    return col;
  }

  private buildKeys_(canTx: boolean): HTMLElement {
    const p = this.profile_;
    const modes = h('div', { class: 'trx-keyrow trx-modes', role: 'group', 'aria-label': 'Mode' });
    for (const mode of p?.rxModes ?? ['FM']) {
      const b = this.key_(`mode-${mode}`, mode, () => this.set_({ mode: mode as HamMode }), `Mode ${mode}`);
      modes.append(b);
      this.syncs_.push((r) => b.setAttribute('aria-pressed', String(r.mode === mode)));
    }
    const fn = h('div', { class: 'trx-keyrow trx-fn' });
    const stepKey = this.key_('step', 'STEP', () => {
      this.stepIdx_ = (this.stepIdx_ + 1) % STEPS_MHZ.length;
      this.sync(this.ctx_.manager, false);
    });
    this.syncs_.push(() => stepKey.setAttribute('aria-label', `STEP, ${khz(STEPS_MHZ[this.stepIdx_])}`));
    fn.append(stepKey);
    if ((p?.rxRangesMHz.length ?? 0) > 1) fn.append(this.key_('band', 'BAND', () => this.nextBand_(), 'BAND, next band'));
    const toggle = (key: string, text: string, aria: string, read: (r: RadioSettings) => boolean, write: (v: boolean) => Partial<RadioSettings>): void => {
      const b = this.key_(key, text, () => this.set_(write(b.getAttribute('aria-pressed') !== 'true')), aria);
      this.syncs_.push((r) => b.setAttribute('aria-pressed', String(read(r))));
      fn.append(b);
    };
    toggle(
      'monitor',
      'MONI',
      'MONI, monitor (open squelch)',
      (r) => r.monitor,
      (v) => ({ monitor: v })
    );
    if (p?.features.keyLock)
      toggle(
        'keylock',
        'LOCK',
        'LOCK, key lock',
        (r) => r.keyLock,
        (v) => ({ keyLock: v })
      );
    if (p?.features.rit)
      toggle(
        'rit-on',
        'RIT',
        'RIT, receive clarifier',
        (r) => r.ritOn,
        (v) => ({ ritOn: v })
      );
    if (canTx) {
      const order: OffsetDirection[] = ['simplex', 'plus', 'minus'];
      const shift = this.key_('offset', 'SHIFT', () => {
        const cur = (shift.dataset.value ?? 'simplex') as OffsetDirection;
        this.set_({ offset: order[(order.indexOf(cur) + 1) % order.length] });
      });
      this.syncs_.push((r) => {
        shift.dataset.value = r.offset;
        shift.setAttribute('aria-label', `SHIFT, repeater shift: ${r.offset}`);
      });
      fn.append(shift);
      const steps = p?.txPowerStepsW ?? [];
      if (steps.length > 0) {
        const pwr = this.key_('txpower', 'PWR', () => {
          const cur = Number(pwr.dataset.value);
          const i = steps.indexOf(cur);
          this.set_({ txPowerW: steps[(i + 1) % steps.length] });
        });
        this.syncs_.push((r) => {
          pwr.dataset.value = String(r.txPowerW);
          pwr.setAttribute('aria-label', `PWR, transmit power ${r.txPowerW} W`);
        });
        fn.append(pwr);
      }
    } else {
      fn.append(this.key_('record', 'REC', () => this.record_(), 'REC, record a reading of what the radio hears'));
    }
    if ((p?.features.memories ?? 0) > 0) {
      fn.append(
        this.key_('vfo', 'V/M', () => this.act_({ type: 'radio.vfo', deviceId: this.id }), 'V/M, return to VFO'),
        this.key_('mem-store', 'M.W', () => this.memWrite_(), 'M.W, memory write: store the working settings in the channel'),
        this.key_('mem-recall', 'M.R', () => this.act_({ type: 'radio.recall', deviceId: this.id, slot: this.memSlot_() }), 'M.R, memory read: recall the channel')
      );
    }

    return h('div', { class: 'trx-keys' }, modes, fn, this.buildKeypad_());
  }

  private buildKeypad_(): HTMLElement {
    const pad = h('div', { class: 'trx-keypad', role: 'group', 'aria-label': 'Keypad for direct frequency entry' });
    pad.append(this.key_('finp', 'F.INP', () => this.startEntry_(''), 'F.INP, direct frequency entry', 'trx-key-fn'));
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']) {
      pad.append(this.key_(`key-${d === '.' ? 'dot' : d}`, d, () => this.typeDigit_(d), d === '.' ? 'Decimal point' : `Digit ${d}`, 'trx-key-num'));
    }
    pad.append(
      this.key_('clear', 'CLR', () => this.endEntry_(), 'CLR, clear entry', 'trx-key-fn'),
      this.key_('apply', 'ENT', () => this.enter_(), `ENT, enter the typed frequency into ${this.label_}`, 'trx-key-ent')
    );

    return pad;
  }

  private buildDial_(): HTMLElement {
    const dial = this.knob_(
      {
        testId: this.t_('dial'),
        label: 'DIAL, main tuning',
        legend: 'DIAL',
        min: 0,
        max: 0,
        step: STEPS_MHZ[this.stepIdx_],
        endless: true,
        size: 'main',
        format: (v) => `${v.toFixed(4)} MHz, step ${khz(STEPS_MHZ[this.stepIdx_])}`,
        onTurn: (v) => this.set_({ vfoMHz: v }),
      },
      (r) => r.vfoMHz
    );
    this.domCache_.set('dial', dial);

    return h('div', { class: 'trx-dial' }, dial);
  }

  private buildSub_(canTx: boolean): HTMLElement {
    const p = this.profile_;
    const sub = h('div', { class: 'trx-sub', role: 'group', 'aria-label': 'Sub panel' });
    sub.append(
      this.knob_(
        {
          testId: this.t_('filter-hz'),
          label: 'WIDTH, filter width',
          legend: 'WIDTH',
          min: 100,
          max: 100000,
          step: 100,
          bigStep: 1000,
          detents: FILTER_PRESETS,
          format: (v) => `Filter ${v} Hz`,
          onTurn: (v) => this.set_({ filterHz: v }),
        },
        (r) => r.filterHz
      )
    );
    if (p?.features.rit)
      sub.append(
        this.knob_(
          {
            testId: this.t_('rit-hz'),
            label: 'CLAR, RIT clarifier offset',
            legend: 'CLAR',
            min: -9999,
            max: 9999,
            step: 10,
            bigStep: 100,
            format: (v) => `RIT ${v > 0 ? '+' : ''}${v} Hz`,
            onTurn: (v) => this.set_({ ritHz: v }),
          },
          (r) => r.ritHz
        )
      );
    if (canTx)
      sub.append(
        this.knob_(
          {
            testId: this.t_('offset-khz'),
            label: 'SHIFT kHz, repeater shift amount',
            legend: 'SHIFT kHz',
            min: 0,
            max: 10000,
            step: 100,
            bigStep: 1000,
            format: (v) => `Shift ${v} kHz`,
            onTurn: (v) => this.set_({ offsetKHz: v }),
          },
          (r) => r.offsetKHz
        )
      );
    if (p?.features.ctcss) {
      // Tone knobs click through Off and the CTCSS table; the value is the table index (0 = off)
      const toneOf = (i: number): number | null => (i <= 0 ? null : (CTCSS_TONES_HZ[i - 1] ?? null));
      // A tone the table lacks (set by config or a memory) parks the knob at the nearest click but is read out as it is
      const nearest = (hz: number | null): number => {
        if (hz === null) return 0;
        let best = 0;
        CTCSS_TONES_HZ.forEach((t, i) => {
          if (Math.abs(t - hz) < Math.abs(CTCSS_TONES_HZ[best] - hz)) best = i;
        });

        return best + 1;
      };
      const toneKnob = (key: 'txtone' | 'rxtone', field: 'txToneHz' | 'rxToneHz', what: string, label: string, legend: string): HTMLElement => {
        let odd: number | null = null;
        const fmtTone = (i: number): string => (odd !== null && i === nearest(odd) ? `${what} ${odd} Hz` : i === 0 ? `${what} off` : `${what} ${toneOf(i)} Hz`);

        return this.knob_(
          { testId: this.t_(key), label, legend, min: 0, max: CTCSS_TONES_HZ.length, step: 1, bigStep: 10, format: fmtTone, onTurn: (i) => this.set_({ [field]: toneOf(i) }) },
          (r) => {
            const hz = r[field];
            odd = hz !== null && !CTCSS_TONES_HZ.includes(hz) ? hz : null;

            return nearest(hz);
          }
        );
      };
      sub.append(
        toneKnob('txtone', 'txToneHz', 'TX tone', 'T TONE, transmit tone (CTCSS)', 'T TONE'),
        toneKnob('rxtone', 'rxToneHz', 'RX tone', 'TSQ, receive tone squelch (CTCSS)', 'TSQ')
      );
    }
    const mems = p?.features.memories ?? 0;
    if (mems > 0) {
      const slotKnob = new TrxKnob({
        testId: this.t_('mem-slot'),
        label: 'M.CH, memory channel',
        legend: 'M.CH',
        min: 1,
        max: mems,
        step: 1,
        format: (v) => `Memory channel ${v}${this.memName_(v) ? `, ${this.memName_(v)}` : ', empty'}`,
        onTurn: () => this.sync(this.ctx_.manager, false),
      });
      slotKnob.show(1);
      this.knobs_.push(slotKnob);
      this.domCache_.set('slot', slotKnob.el);
      const name = h('input', {
        type: 'text',
        class: 'trx-tag',
        id: this.t_('mem-name'),
        'data-testid': this.t_('mem-name'),
        'aria-label': 'Memory channel name tag',
        placeholder: 'name tag',
        maxlength: 12,
        autocomplete: 'off',
      });
      this.domCache_.set('memName', name);
      sub.append(h('div', { class: 'trx-mem' }, slotKnob.el, h('label', { class: 'trx-tag-wrap' }, h('span', { class: 'trx-legend', text: 'TAG' }), name)));
    }
    const dev = this.ctx_.manager.device(this.id);
    if (p?.features.dmr && (dev?.radio?.codeplug.length ?? 0) > 0) {
      const plug = dev?.radio?.codeplug ?? [];
      sub.append(
        this.knob_(
          {
            testId: this.t_('dmr-channel'),
            label: 'DMR CH, DMR channel',
            legend: 'DMR CH',
            // -1 is "no channel loaded": the loaner starts there, so channel 1 is one click away
            min: -1,
            max: plug.length - 1,
            step: 1,
            format: (i) => {
              if (i < 0) return 'No channel loaded';
              const c = plug[i];

              return c ? `Channel ${i + 1}: ${c.name}, color code ${c.colorCode}, slot ${c.timeSlot}, talkgroup ${c.talkgroup}` : `Channel ${i + 1}`;
            },
            onTurn: (i) => {
              // The core cannot unload a channel: turning back to "--" springs to what is loaded
              if (i < 0) this.sync(this.ctx_.manager, true);
              else this.act_({ type: 'radio.dmrChannel', deviceId: this.id, index: i });
            },
          },
          (r) => r.activeDmrChannel ?? -1
        )
      );
    }

    return sub;
  }

  /** The hand mic on the desk: what you will say (the call card), how long, and the PTT bar */
  private buildMic_(m: HamStationManager): HTMLElement {
    const id = this.id;
    const p = (key: string): string => tid('ham-ptt', id, key);
    const lines = h('div', { class: 'trx-card-lines', role: 'radiogroup', 'aria-label': 'What you will say' });
    const targets = (m.config.remoteStations?.stations ?? []).map((s) => ({ value: s.callsign, label: `${s.callsign} (${s.name})` }));
    const extra = [
      { callsign: m.config.repeater?.clubOperator?.callsign, name: m.config.repeater?.clubOperator?.name },
      { callsign: m.config.dmr?.remote?.callsign, name: m.config.dmr?.remote?.name },
    ];
    for (const e of extra) if (e.callsign && !targets.some((t) => t.value === e.callsign)) targets.push({ value: e.callsign, label: `${e.callsign} (${e.name ?? 'operator'})` });
    const sel = (key: string, aria: string, opts: { value: string; label: string }[]): HTMLSelectElement => {
      const s = h('select', { class: 'trx-card-select', id: p(key), 'data-testid': p(key), 'aria-label': aria });
      for (const o of opts) s.append(h('option', { value: o.value, text: o.label }));

      return s;
    };
    const target = sel('target', 'Station to call', targets.length > 0 ? targets : [{ value: '', label: '(none)' }]);
    const item = sel(
      'item',
      'Reply item',
      REPLY_ITEMS.map((x) => ({ value: x, label: x }))
    );
    const message = h('input', { type: 'text', class: 'trx-card-input', id: p('message'), 'data-testid': p('message'), 'aria-label': 'Message text', autocomplete: 'off' });
    const extras: Partial<Record<TxIntent['kind'], HTMLElement>> = { call: target, reply: item, message };
    const radios: HTMLButtonElement[] = [];
    for (const it of INTENTS) {
      const b = h('button', { type: 'button', class: 'trx-card-line', role: 'radio', id: p(`intent-${it.kind}`), 'data-testid': p(`intent-${it.kind}`), text: it.label });
      b.addEventListener('click', () => {
        this.intent_ = it.kind;
        paint();
      });
      radios.push(b);
      const x = extras[it.kind];
      lines.append(h('div', { class: 'trx-card-row' }, b, x ?? null));
    }
    const paint = (): void => {
      INTENTS.forEach((it, i) => {
        const on = it.kind === this.intent_;
        radios[i].setAttribute('aria-checked', String(on));
        radios[i].tabIndex = on ? 0 : -1;
        const x = extras[it.kind];
        if (x) x.hidden = !on;
      });
    };
    lines.addEventListener('keydown', (e) => {
      const i = INTENTS.findIndex((it) => it.kind === this.intent_);
      const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || !(e.target instanceof HTMLElement) || !e.target.classList.contains('trx-card-line')) return;
      e.preventDefault();
      const n = (i + d + INTENTS.length) % INTENTS.length;
      this.intent_ = INTENTS[n].kind;
      paint();
      radios[n].focus();
    });
    paint();
    const hold = h('input', {
      type: 'number',
      min: 0,
      class: 'trx-card-input trx-card-hold',
      id: p('hold'),
      'data-testid': p('hold'),
      'aria-label': 'Talk for, seconds',
      placeholder: '–',
    });
    const refusal = h('div', { class: 'trx-card-refusal', role: 'alert', 'data-testid': p('refusal'), hidden: true });
    const build = (): TxIntent => {
      switch (this.intent_) {
        case 'call':
          return { kind: 'call', target: target.value };
        case 'reply':
          return { kind: 'reply', item: item.value };
        case 'message':
          return { kind: 'message', text: message.value };
        default:
          return { kind: this.intent_ } as TxIntent;
      }
    };
    const ptt = h(
      'button',
      { type: 'button', class: 'trx-ptt', id: p('transmit'), 'data-testid': p('transmit'), 'aria-label': `Press to talk on ${this.label_}` },
      h('span', { text: 'PTT' })
    );
    ptt.addEventListener('click', () => {
      const hs = Number(hold.value);
      const r = this.ctx_.act({ type: 'ptt', deviceId: id, intent: build(), holdS: hold.value !== '' && Number.isFinite(hs) ? hs : undefined });
      refusal.hidden = r.ok;
      refusal.textContent = r.ok ? '' : r.message;
      this.sync(this.ctx_.manager, false);
    });
    const release = h('button', { type: 'button', class: 'trx-release', id: p('release'), 'data-testid': p('release'), text: 'Let go', 'aria-label': 'Release PTT' });
    release.addEventListener('click', () => {
      this.ctx_.act({ type: 'pttRelease' });
      this.sync(this.ctx_.manager, false);
    });
    const micStatus = h('span', { class: 'trx-mic-status', 'data-testid': p('status'), 'aria-live': 'polite' });
    this.domCache_.set('micStatus', micStatus);
    this.domCache_.set('ptt', ptt);

    return h(
      'div',
      { class: 'trx-micset', 'data-testid': p('area') },
      h('div', { class: 'trx-mic', 'aria-label': 'Hand microphone', role: 'group' }, h('span', { class: 'trx-mic-grille', 'aria-hidden': 'true' }), ptt, release, micStatus),
      h(
        'div',
        { class: 'trx-card' },
        h('div', { class: 'trx-card-title', text: 'On the mic' }),
        lines,
        h('label', { class: 'trx-card-row trx-card-holdrow' }, h('span', { text: 'Talk for' }), hold, h('span', { text: 's' })),
        refusal
      )
    );
  }

  /** The notepad beside the radio: what came out of the speaker */
  private buildPad_(): HTMLElement {
    const log = h('div', { class: 'trx-pad-lines', 'data-testid': this.t_('rxlog') });
    this.domCache_.set('rxlog', log);

    return h('div', { class: 'trx-pad', role: 'region', 'aria-label': 'Heard on the air' }, h('div', { class: 'trx-pad-title', text: 'Heard on the air' }), log);
  }

  // ---- keypad entry, band, memories, record ----------------------------------------------------

  private startEntry_(seed: string): void {
    const input = this.domCache_.get('entry') as HTMLInputElement;
    this.entering_ = true;
    input.hidden = false;
    this.domCache_.get('digits')?.setAttribute('hidden', '');
    input.value = seed;
    input.focus({ preventScroll: true });
  }

  private typeDigit_(d: string): void {
    const input = this.domCache_.get('entry') as HTMLInputElement;
    if (!this.entering_) this.startEntry_('');
    input.value += d;
  }

  private endEntry_(): void {
    const input = this.domCache_.get('entry') as HTMLInputElement;
    this.entering_ = false;
    input.value = '';
    input.hidden = true;
    this.domCache_.get('digits')?.removeAttribute('hidden');
  }

  private enter_(): void {
    const input = this.domCache_.get('entry') as HTMLInputElement;
    const v = Number(input.value.replace(',', '.'));
    if (!this.entering_ || input.value.trim() === '' || !Number.isFinite(v)) {
      this.endEntry_();

      return;
    }
    if (this.set_({ vfoMHz: v })) {
      this.endEntry_();
      this.sync(this.ctx_.manager, true);
    }
  }

  private nextBand_(): void {
    const ranges = this.profile_?.rxRangesMHz ?? [];
    const r = this.ctx_.manager.radio(this.id);
    if (!r || ranges.length < 2) return;
    const cur = ranges.findIndex(([lo, hi]) => r.vfoMHz >= lo && r.vfoMHz <= hi);
    if (cur >= 0) this.bandMemory_.set(cur, r.vfoMHz);
    const next = (cur + 1) % ranges.length;
    this.set_({ vfoMHz: this.bandMemory_.get(next) ?? ranges[next][0] });
  }

  private memSlot_(): number {
    const k = this.domCache_.get('slot')?.querySelector('[role="slider"]');

    return Number(k?.getAttribute('aria-valuenow') ?? 1);
  }

  private memName_(slot: number): string {
    return this.ctx_.manager.radio(this.id)?.memories.find((x) => x.slot === slot)?.name ?? '';
  }

  private memWrite_(): void {
    const name = (this.domCache_.get('memName') as HTMLInputElement | undefined)?.value ?? '';
    this.act_({ type: 'radio.store', deviceId: this.id, slot: this.memSlot_(), name });
  }

  /** Records whatever the radio is tuned to (the strongest thing it hears), like the SDR program */
  private record_(): void {
    const live = this.ctx_.manager.liveReception(this.id).filter((x) => x.rssiDbm > -150);
    const best = live.reduce<(typeof live)[number] | null>((a, x) => (!a || x.snrDb > a.snrDb ? x : a), null);
    this.act_({ type: 'rx.record', deviceId: this.id, emitterId: best?.emissionId.split('#')[0] });
  }

  // ---- read the radio back ---------------------------------------------------------------------

  sync(m: HamStationManager, force: boolean): void {
    const r = m.radio(this.id);
    const d = m.device(this.id);
    if (!r || !d) return;
    for (const s of this.syncs_) s(r, force);
    const on = m.energized(this.id);
    const keyed = m.keyed()?.deviceId === this.id;
    const get = (k: string): HTMLElement => this.domCache_.get(k) as HTMLElement;
    get('vfd').classList.toggle('is-off', !on);
    get('lampPower').classList.toggle('is-lit', on);
    get('lampTx').classList.toggle('is-lit', keyed);
    get('status').textContent = `${d.powered ? 'powered' : 'power off'} ${keyed ? 'TX' : 'RX'}`;
    get('status').classList.toggle('is-tx', keyed);
    get('digits').textContent = vfdDigits(r.vfoMHz);
    const mem = r.activeMemory !== null ? r.memories.find((x) => x.slot === r.activeMemory) : undefined;
    get('vfo').textContent = mem
      ? `M${mem.slot} ${mem.name}`
      : this.profile_?.features.dmr && (d.radio?.codeplug.length ?? 0) > 0
        ? r.activeDmrChannel !== null
          ? `CH${r.activeDmrChannel + 1}`
          : 'CH--'
        : 'VFO';
    get('mode').textContent = r.mode;
    get('filter').textContent = r.filterHz >= 1000 ? `${r.filterHz / 1000}k` : `${r.filterHz}`;
    get('shift').textContent = r.offset === 'plus' ? `+${r.offsetKHz / 1000}` : r.offset === 'minus' ? `-${r.offsetKHz / 1000}` : '';
    get('tone').textContent = r.rxToneHz !== null ? `TSQ ${r.rxToneHz}` : r.txToneHz !== null ? `T ${r.txToneHz}` : '';
    get('rit').textContent = r.ritOn ? `RIT ${r.ritHz > 0 ? '+' : ''}${r.ritHz}` : '';
    get('lock').textContent = r.keyLock ? 'LOCK' : '';
    get('mon').textContent = r.monitor ? 'MON' : '';
    get('pwr').textContent = (this.profile_?.txPowerStepsW.length ?? 0) > 0 ? `${r.txPowerW}W` : '';
    get('step').textContent = `STEP ${khz(STEPS_MHZ[this.stepIdx_])}`;
    // The dial's step follows the STEP key
    const dialKnob = this.knobs_.find((k) => k.el === get('dial'));
    dialKnob?.setStep(STEPS_MHZ[this.stepIdx_]);
    dialKnob?.show(r.vfoMHz);
    // While keyed the receiver hears nothing (the engine reports -200): show TX, not the sentinel
    const live = keyed ? [] : m.liveReception(this.id).filter((x) => x.rssiDbm > HEARD_FLOOR_DBM);
    const best = live.reduce<(typeof live)[number] | null>((a, x) => (!a || x.rssiDbm > a.rssiDbm ? x : a), null);
    get('smeter').textContent = best ? fmt(best.rssiDbm, 1) : '-';
    get('snr').textContent = best ? fmt(best.snrDb, 1) : '-';
    get('readout').hidden = keyed;
    const open = live.some((x) => x.squelchOpen);
    get('sql').textContent = keyed ? 'TX' : open ? 'SQL open' : 'SQL closed';
    get('sql').classList.toggle('is-open', open);
    const lit = best && on ? Math.round(Math.max(0, Math.min(1, (best.rssiDbm + 130) / 80)) * S_SEGMENTS) : 0;
    [...get('segs').children].forEach((seg, i) => seg.classList.toggle('is-lit', i < lit));
    const memName = this.domCache_.get('memName') as HTMLInputElement | undefined;
    if (memName && (force || !isFocused(memName)) && memName.value === '') memName.placeholder = this.memName_(this.memSlot_()) || 'name tag';
    const slot = this.domCache_.get('slot')?.querySelector('[role="slider"]');
    if (slot) slot.setAttribute('aria-valuetext', `Memory channel ${this.memSlot_()}, ${this.memName_(this.memSlot_()) || 'empty'}`);
    const micStatus = this.domCache_.get('micStatus');
    if (micStatus) micStatus.textContent = keyed ? 'ON AIR' : '';
    this.domCache_.get('ptt')?.classList.toggle('is-keyed', keyed);
    transcriptList(m, get('rxlog'));
  }
}
