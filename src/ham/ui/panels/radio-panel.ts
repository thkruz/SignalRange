/**
 * @file radio-panel - One card per radio/SDR: tuning, settings, live reception and PTT
 * @description Frequency is staged (input + Apply, plus coarse/fine step buttons); other
 * settings apply on change and snap back when the manager refuses. The PTT area picks a
 * transmit intent and keys through `ptt`; refusals appear inline. Several radios share tabs.
 * Test ids: ham-radio-<dev>-<freq-input|apply|freq-dec-coarse|freq-dec-fine|freq-inc-fine|
 * freq-inc-coarse|mode|filter-preset|filter-hz|squelch|volume|rfgain|txpower|offset|offset-khz|
 * txtone|rxtone|mem-slot|mem-name|mem-store|mem-recall|vfo|monitor|keylock|rit-on|rit-hz|
 * micgain|dmr-channel|smeter|snr|sql|tab>, ham-ptt-<dev>-<intent|target|item|message|hold|
 * transmit|release|status|refusal>.
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { HamMode, OffsetDirection, RadioSettings, TxIntent } from '../../ham-types';
import { CTCSS_TONES_HZ } from '../../radio/radio-settings';
import { profileOf } from '../../station/station-devices';
import type { PanelContext, StationPanel } from '../station-panel';
import { badge, button, card, fmt, h, isFocused, labelled, RADIO_KINDS, Rebuilder, select, textInput, tid, transcriptList } from '../ui-kit';

const COARSE_MHZ = 0.1;
const FINE_MHZ = 0.005;
const FILTER_PRESETS = [500, 2400, 6000, 12500, 15000, 25000];
const REPLY_ITEMS = ['report', 'name', 'location', 'grid', 'fill'];

interface RadioView {
  id: string;
  section: HTMLElement;
  tabBtn: HTMLElement;
  sync(m: HamStationManager, force: boolean): void;
}

export class RadioPanel implements StationPanel {
  readonly id = 'radio';
  readonly title = 'Radio';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private tabsHost_!: HTMLElement;
  private body_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private views_: RadioView[] = [];
  private selected_ = '';

  private static radios_(m: HamStationManager): string[] {
    return m
      .devices()
      .filter((d) => !d.removed && !d.spare && d.radio && (RADIO_KINDS.includes(d.kind) || d.kind === 'sdr') && d.location === m.location)
      .map((d) => d.id);
  }

  isRelevant(m: HamStationManager): boolean {
    return RadioPanel.radios_(m).length > 0;
  }

  mount(host: HTMLElement, ctx: PanelContext): void {
    this.ctx_ = ctx;
    const c = card('ham-radio-card', this.title);
    this.root_ = c.root;
    this.tabsHost_ = h('ul', { class: 'nav nav-pills mb-2', role: 'tablist' });
    this.body_ = h('div');
    c.body.append(this.tabsHost_, this.body_);
    host.append(c.root);
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    const ids = RadioPanel.radios_(m);
    this.rebuild_.run(this.body_, ids.join('|'), () => this.build_(m, ids));
    for (const v of this.views_) v.sync(m, false);
  }

  dispose(): void {
    this.root_?.remove();
    this.root_ = null;
    this.views_ = [];
  }

  private select_(id: string): void {
    this.selected_ = id;
    for (const v of this.views_) {
      v.section.hidden = v.id !== id;
      v.tabBtn.classList.toggle('active', v.id === id);
      v.tabBtn.setAttribute('aria-selected', String(v.id === id));
    }
  }

  private build_(m: HamStationManager, ids: string[]): void {
    this.tabsHost_.replaceChildren();
    this.views_ = ids.map((id) => this.buildRadio_(m, id));
    for (const v of this.views_) {
      this.body_.append(v.section);
      if (this.views_.length > 1) this.tabsHost_.append(h('li', { class: 'nav-item', role: 'presentation' }, v.tabBtn));
    }
    if (!ids.includes(this.selected_)) this.selected_ = ids[0] ?? '';
    this.select_(this.selected_);
  }

  private buildRadio_(m: HamStationManager, id: string): RadioView {
    const ctx = this.ctx_;
    const dev = m.device(id);
    const profile = profileOf(dev);
    const syncs: ((r: RadioSettings, force: boolean) => void)[] = [];
    const section = h('div', { 'data-testid': tid('ham-radio', id, 'section'), role: 'tabpanel', 'aria-label': dev?.label ?? id });
    const tabBtn = button(tid('ham-radio', id, 'tab'), dev?.label ?? id, () => this.select_(id), 'nav-link py-1');
    tabBtn.setAttribute('role', 'tab');

    const set = (patch: Partial<RadioSettings>): boolean => {
      const r = ctx.act({ type: 'radio.set', deviceId: id, patch });
      if (!r.ok) view.sync(ctx.manager, true);

      return r.ok;
    };
    const num = (
      key: string,
      label: string,
      kind: 'number' | 'range',
      min: number,
      max: number,
      step: number,
      read: (r: RadioSettings) => number,
      write: (v: number) => Partial<RadioSettings>
    ): HTMLElement => {
      const i = textInput(tid('ham-radio', id, key), label, '', kind);
      i.setAttribute('min', String(min));
      i.setAttribute('max', String(max));
      i.setAttribute('step', String(step));
      if (kind === 'range') i.className = 'form-range';
      i.addEventListener('change', () => {
        const v = Number(i.value);
        if (Number.isFinite(v)) set(write(v));
      });
      syncs.push((r, force) => {
        if (force || !isFocused(i)) i.value = String(read(r));
      });

      return labelled(i.id, label, i, 'mb-1');
    };
    const sel = (
      key: string,
      label: string,
      opts: { value: string; label: string }[],
      read: (r: RadioSettings) => string,
      write: (v: string) => Partial<RadioSettings>
    ): HTMLElement => {
      const s = select(tid('ham-radio', id, key), label, opts, opts[0]?.value ?? '');
      s.addEventListener('change', () => set(write(s.value)));
      syncs.push((r, force) => {
        if (force || !isFocused(s)) s.value = read(r);
      });

      return labelled(s.id, label, s, 'mb-1');
    };
    const check = (key: string, label: string, read: (r: RadioSettings) => boolean, write: (v: boolean) => Partial<RadioSettings>): HTMLElement => {
      const i = h('input', { type: 'checkbox', class: 'form-check-input', id: tid('ham-radio', id, key), 'data-testid': tid('ham-radio', id, key), 'aria-label': label });
      i.addEventListener('change', () => set(write(i.checked)));
      syncs.push((r, force) => {
        if (force || !isFocused(i)) i.checked = read(r);
      });

      return h('label', { class: 'form-check form-switch d-inline-block me-3' }, i, h('span', { class: 'form-check-label small', text: label }));
    };

    // --- header and live reception
    const status = h('span', { 'data-testid': tid('ham-radio', id, 'status') });
    const smeter = h('span', { class: 'font-monospace', 'data-testid': tid('ham-radio', id, 'smeter'), text: '-' });
    const snr = h('span', { class: 'font-monospace', 'data-testid': tid('ham-radio', id, 'snr'), text: '-' });
    const sql = h('span', { class: 'badge', 'data-testid': tid('ham-radio', id, 'sql'), text: 'SQL closed' });
    const meterBar = h(
      'div',
      { class: 'progress progress-sm', role: 'progressbar', 'aria-label': `${dev?.label ?? id} signal strength` },
      h('div', { class: 'progress-bar bg-success' })
    );
    const bar = meterBar.firstElementChild as HTMLElement;
    section.append(
      h('div', { class: 'd-flex flex-wrap gap-2 align-items-center mb-2' }, h('strong', { text: dev?.label ?? id }), status),
      h(
        'div',
        { class: 'd-flex flex-wrap gap-3 align-items-center mb-2', role: 'status', 'aria-live': 'off' },
        h('span', {}, 'RSSI ', smeter, ' dBm'),
        h('span', {}, 'SNR ', snr, ' dB'),
        sql
      ),
      meterBar
    );

    // --- frequency (staged)
    const freq = textInput(tid('ham-radio', id, 'freq-input'), `${dev?.label ?? id} frequency MHz`, '', 'number');
    freq.setAttribute('step', String(FINE_MHZ));
    let dirty = false;
    freq.addEventListener('input', () => {
      dirty = true;
    });
    const step = (d: number): void => {
      const cur = Number(freq.value);
      freq.value = String(Math.round(((Number.isFinite(cur) ? cur : 0) + d) * 1e6) / 1e6);
      dirty = true;
    };
    const apply = button(
      tid('ham-radio', id, 'apply'),
      'Apply',
      () => {
        const v = Number(freq.value);
        if (!Number.isFinite(v)) return;
        if (set({ vfoMHz: v })) dirty = false;
      },
      'btn btn-sm btn-primary',
      `Apply frequency to ${dev?.label ?? id}`
    );
    const sb = (key: string, label: string, d: number): HTMLElement =>
      button(tid('ham-radio', id, key), label, () => step(d), 'btn btn-sm btn-outline-secondary btn-equip', `Step frequency ${label} MHz`);
    syncs.push((r, force) => {
      if (force) dirty = false;
      if (!dirty && !isFocused(freq)) freq.value = String(r.vfoMHz);
    });
    section.append(
      h(
        'div',
        { class: 'equip-adjust-control mb-2' },
        h('label', { class: 'equip-adjust-label form-label small mb-1', for: freq.id, text: 'FREQUENCY (MHz)' }),
        h(
          'div',
          { class: 'equip-adjust-row d-flex flex-wrap align-items-center gap-1' },
          sb('freq-dec-coarse', `-${COARSE_MHZ}`, -COARSE_MHZ),
          sb('freq-dec-fine', `-${FINE_MHZ}`, -FINE_MHZ),
          h('div', { class: 'equip-adjust-display' }, freq),
          sb('freq-inc-fine', `+${FINE_MHZ}`, FINE_MHZ),
          sb('freq-inc-coarse', `+${COARSE_MHZ}`, COARSE_MHZ),
          apply
        )
      )
    );

    // --- settings grid
    const grid = h('div', { class: 'row g-2' });
    const col = (...e: HTMLElement[]): HTMLElement => h('div', { class: 'col-6 col-md-4' }, ...e);
    const modes = (profile?.rxModes ?? ['FM']).map((x) => ({ value: x, label: x }));
    const presets = FILTER_PRESETS.map((x) => ({ value: String(x), label: `${x} Hz` }));
    const toneOpts = [{ value: '', label: 'None' }, ...CTCSS_TONES_HZ.map((t) => ({ value: String(t), label: `${t} Hz` }))];
    const tone = (v: string): number | null => (v === '' ? null : Number(v));
    grid.append(
      col(
        sel(
          'mode',
          'Mode',
          modes,
          (r) => r.mode,
          (v) => ({ mode: v as HamMode })
        )
      ),
      col(
        sel(
          'filter-preset',
          'Filter preset',
          presets,
          (r) => String(r.filterHz),
          (v) => ({ filterHz: Number(v) })
        )
      ),
      col(
        num(
          'filter-hz',
          'Filter Hz',
          'number',
          100,
          100000,
          100,
          (r) => r.filterHz,
          (v) => ({ filterHz: v })
        )
      ),
      col(
        num(
          'squelch',
          'Squelch 0-10',
          'range',
          0,
          10,
          1,
          (r) => r.squelch,
          (v) => ({ squelch: v })
        )
      ),
      col(
        num(
          'volume',
          'Volume 0-10',
          'range',
          0,
          10,
          1,
          (r) => r.volume,
          (v) => ({ volume: v })
        )
      ),
      col(
        num(
          'rfgain',
          'RF gain dB',
          'number',
          -20,
          60,
          1,
          (r) => r.rfGainDb,
          (v) => ({ rfGainDb: v })
        )
      )
    );
    const steps = profile?.txPowerStepsW ?? [];
    if (steps.length > 0)
      grid.append(
        col(
          sel(
            'txpower',
            'TX power W',
            steps.map((w) => ({ value: String(w), label: `${w} W` })),
            (r) => String(r.txPowerW),
            (v) => ({ txPowerW: Number(v) })
          )
        )
      );
    if (profile?.txRangesMHz.length) {
      grid.append(
        col(
          sel(
            'offset',
            'Offset',
            [
              { value: 'simplex', label: 'Simplex' },
              { value: 'plus', label: '+' },
              { value: 'minus', label: '-' },
            ],
            (r) => r.offset,
            (v) => ({ offset: v as OffsetDirection })
          )
        ),
        col(
          num(
            'offset-khz',
            'Offset kHz',
            'number',
            0,
            10000,
            100,
            (r) => r.offsetKHz,
            (v) => ({ offsetKHz: v })
          )
        )
      );
    }
    if (profile?.features.ctcss) {
      grid.append(
        col(
          sel(
            'txtone',
            'TX tone',
            toneOpts,
            (r) => (r.txToneHz === null ? '' : String(r.txToneHz)),
            (v) => ({ txToneHz: tone(v) })
          )
        ),
        col(
          sel(
            'rxtone',
            'RX tone',
            toneOpts,
            (r) => (r.rxToneHz === null ? '' : String(r.rxToneHz)),
            (v) => ({ rxToneHz: tone(v) })
          )
        )
      );
    }
    if (profile?.txRangesMHz.length)
      grid.append(
        col(
          num(
            'micgain',
            'Mic gain 0-10',
            'range',
            0,
            10,
            1,
            (r) => r.micGain,
            (v) => ({ micGain: v })
          )
        )
      );
    section.append(grid);

    const toggles = h(
      'div',
      { class: 'my-2' },
      check(
        'monitor',
        'Monitor',
        (r) => r.monitor,
        (v) => ({ monitor: v })
      )
    );
    if (profile?.features.keyLock)
      toggles.append(
        check(
          'keylock',
          'Key lock',
          (r) => r.keyLock,
          (v) => ({ keyLock: v })
        )
      );
    if (profile?.features.rit) {
      toggles.append(
        check(
          'rit-on',
          'RIT',
          (r) => r.ritOn,
          (v) => ({ ritOn: v })
        )
      );
      section.append(
        toggles,
        num(
          'rit-hz',
          'RIT offset Hz',
          'number',
          -9999,
          9999,
          10,
          (r) => r.ritHz,
          (v) => ({ ritHz: v })
        )
      );
    } else {
      section.append(toggles);
    }

    // --- memories / VFO / DMR
    if ((profile?.features.memories ?? 0) > 0) {
      const slot = textInput(tid('ham-radio', id, 'mem-slot'), 'Memory slot', '1', 'number');
      const name = textInput(tid('ham-radio', id, 'mem-name'), 'Memory name', '');
      section.append(
        h(
          'div',
          { class: 'd-flex flex-wrap align-items-end gap-1 mb-2' },
          h('div', { class: 'w-25' }, h('label', { class: 'form-label small mb-1', for: slot.id, text: 'Slot' }), slot),
          h('div', { class: 'w-25' }, h('label', { class: 'form-label small mb-1', for: name.id, text: 'Name' }), name),
          button(
            tid('ham-radio', id, 'mem-store'),
            'Store',
            () => ctx.act({ type: 'radio.store', deviceId: id, slot: Number(slot.value), name: name.value }),
            'btn btn-sm btn-outline-primary',
            'Store memory'
          ),
          button(
            tid('ham-radio', id, 'mem-recall'),
            'Recall',
            () => ctx.act({ type: 'radio.recall', deviceId: id, slot: Number(slot.value) }),
            'btn btn-sm btn-outline-primary',
            'Recall memory'
          ),
          button(tid('ham-radio', id, 'vfo'), 'VFO', () => ctx.act({ type: 'radio.vfo', deviceId: id }), 'btn btn-sm btn-outline-secondary', 'Return to VFO')
        )
      );
    }
    if (profile?.features.dmr && (dev?.radio?.codeplug.length ?? 0) > 0) {
      const opts = (dev?.radio?.codeplug ?? []).map((c, i) => ({ value: String(i), label: `${i + 1}: ${c.name} (CC${c.colorCode} TS${c.timeSlot} TG${c.talkgroup})` }));
      const s = select(tid('ham-radio', id, 'dmr-channel'), 'DMR channel', opts, opts[0].value);
      s.addEventListener('change', () => {
        const r = ctx.act({ type: 'radio.dmrChannel', deviceId: id, index: Number(s.value) });
        if (!r.ok) view.sync(ctx.manager, true);
      });
      syncs.push((r, force) => {
        if ((force || !isFocused(s)) && r.activeDmrChannel !== null) s.value = String(r.activeDmrChannel);
      });
      section.append(labelled(s.id, 'DMR channel', s));
    }

    // --- record a deliberate reading (receive-only devices such as an SDR)
    if (profile && !profile.txRangesMHz.length) section.append(this.buildRecord_(m, id));

    // --- PTT
    if (profile?.txRangesMHz.length) section.append(this.buildPtt_(m, id, dev?.label ?? id));

    // --- receive log
    const log = h('div', { class: 'mt-2', 'data-testid': tid('ham-radio', id, 'rxlog') });
    section.append(h('h5', { class: 'mt-2', text: 'Receive log' }), log);

    const view: RadioView = {
      id,
      section,
      tabBtn,
      sync: (mm, force) => {
        const r = mm.radio(id);
        const d = mm.device(id);
        if (!r || !d) return;
        for (const s of syncs) s(r, force);
        status.replaceChildren(
          badge(d.powered ? 'powered' : 'power off', d.powered ? 'success' : 'warning'),
          badge(mm.keyed()?.deviceId === id ? 'TX' : 'RX', mm.keyed()?.deviceId === id ? 'danger' : 'info')
        );
        const live = mm.liveReception(id);
        const best = live.reduce<(typeof live)[number] | null>((a, x) => (!a || x.rssiDbm > a.rssiDbm ? x : a), null);
        smeter.textContent = best ? fmt(best.rssiDbm, 1) : '-';
        snr.textContent = best ? fmt(best.snrDb, 1) : '-';
        const open = live.some((x) => x.squelchOpen);
        sql.textContent = open ? 'SQL open' : 'SQL closed';
        sql.className = `badge bg-${open ? 'success' : 'secondary'}-lt`;
        bar.style.width = `${best ? Math.max(0, Math.min(100, ((best.rssiDbm + 130) / 80) * 100)) : 0}%`;
        transcriptList(mm, log);
      },
    };
    view.sync(m, true);

    return view;
  }

  private buildRecord_(m: HamStationManager, id: string): HTMLElement {
    const ctx = this.ctx_;
    const emitters = (m.config.emitters ?? []).map((e) => ({ value: e.id, label: e.label ?? e.id }));
    const emitter = select(tid('ham-radio', id, 'record-emitter'), 'Emitter to measure', [{ value: '', label: '(noise only)' }, ...emitters], emitters[0]?.value ?? '');
    const rec = button(
      tid('ham-radio', id, 'record'),
      'Record reading',
      () => ctx.act({ type: 'rx.record', deviceId: id, emitterId: emitter.value || undefined }),
      'btn btn-sm btn-outline-primary',
      'Record a reading'
    );

    return h('div', { class: 'd-flex flex-wrap align-items-end gap-2 mb-2' }, labelled(emitter.id, 'Record emitter', emitter, 'mb-0'), rec);
  }

  private buildPtt_(m: HamStationManager, id: string, label: string): HTMLElement {
    const ctx = this.ctx_;
    const intents = [
      { value: 'cq', label: 'CQ' },
      { value: 'call', label: 'Call a station' },
      { value: 'reply', label: 'Reply with' },
      { value: 'identify', label: 'Identify' },
      { value: 'net-checkin', label: 'Net check-in' },
      { value: 'message', label: 'Message' },
      { value: 'carrier', label: 'Carrier / test' },
      { value: 'test', label: 'Test tone' },
    ];
    const intent = select(tid('ham-ptt', id, 'intent'), 'Transmit intent', intents, 'cq');
    const targets = (m.config.remoteStations?.stations ?? []).map((s) => ({ value: s.callsign, label: `${s.callsign} (${s.name})` }));
    const extra = [
      { callsign: m.config.repeater?.clubOperator?.callsign, name: m.config.repeater?.clubOperator?.name },
      { callsign: m.config.dmr?.remote?.callsign, name: m.config.dmr?.remote?.name },
    ];
    for (const e of extra) if (e.callsign && !targets.some((t) => t.value === e.callsign)) targets.push({ value: e.callsign, label: `${e.callsign} (${e.name ?? 'operator'})` });
    const target = select(tid('ham-ptt', id, 'target'), 'Station to call', targets.length > 0 ? targets : [{ value: '', label: '(none)' }], targets[0]?.value ?? '');
    const item = select(
      tid('ham-ptt', id, 'item'),
      'Reply item',
      REPLY_ITEMS.map((x) => ({ value: x, label: x })),
      'report'
    );
    const message = textInput(tid('ham-ptt', id, 'message'), 'Message text', '');
    const hold = textInput(tid('ham-ptt', id, 'hold'), 'Hold seconds', '', 'number');
    hold.setAttribute('min', '0');
    const pTarget = labelled(target.id, 'Call', target, 'mb-0');
    const pItem = labelled(item.id, 'Item', item, 'mb-0');
    const pMsg = labelled(message.id, 'Message', message, 'mb-0');
    const refusal = h('div', { class: 'alert alert-warning py-1 small mt-1', role: 'alert', 'data-testid': tid('ham-ptt', id, 'refusal'), hidden: true });
    const show = (): void => {
      pTarget.hidden = intent.value !== 'call';
      pItem.hidden = intent.value !== 'reply';
      pMsg.hidden = intent.value !== 'message';
    };
    intent.addEventListener('change', show);
    show();
    const build = (): TxIntent => {
      switch (intent.value) {
        case 'call':
          return { kind: 'call', target: target.value };
        case 'reply':
          return { kind: 'reply', item: item.value };
        case 'message':
          return { kind: 'message', text: message.value };
        case 'cq':
        case 'identify':
        case 'net-checkin':
        case 'carrier':
        case 'test':
          return { kind: intent.value };
        default:
          return { kind: 'cq' };
      }
    };
    const tx = button(
      tid('ham-ptt', id, 'transmit'),
      'Transmit',
      () => {
        const hs = Number(hold.value);
        const r = ctx.act({ type: 'ptt', deviceId: id, intent: build(), holdS: hold.value !== '' && Number.isFinite(hs) ? hs : undefined });
        refusal.hidden = r.ok;
        refusal.textContent = r.ok ? '' : r.message;
      },
      'btn btn-danger',
      `Transmit with ${label}`
    );
    const rel = button(tid('ham-ptt', id, 'release'), 'Release', () => ctx.act({ type: 'pttRelease' }), 'btn btn-outline-secondary', 'Release PTT');

    return h(
      'div',
      { class: 'border rounded p-2 mt-2', 'data-testid': tid('ham-ptt', id, 'area') },
      h('h5', { text: 'Push to talk' }),
      h(
        'div',
        { class: 'd-flex flex-wrap align-items-end gap-2' },
        labelled(intent.id, 'Intent', intent, 'mb-0'),
        pTarget,
        pItem,
        pMsg,
        labelled(hold.id, 'Hold s', hold, 'mb-0'),
        tx,
        rel
      ),
      refusal
    );
  }
}
