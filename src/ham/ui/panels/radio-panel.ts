/**
 * @file radio-panel - Each radio on the bench, and the transceiver front panel you sit down at
 * @description In the bench close-up a radio offers "Operate" (and its painted faceplate above it);
 * operating it brings the front panel (radio-front-panel.ts) up fullscreen in its own ImmersiveView,
 * with the hand mic and the "heard" pad on the desk in front of it. Escape or "Step back" puts you
 * back at the bench. The panel element is borrowed by the view and returned on leave, so every
 * control keeps its test id whether or not the radio is being operated.
 * Test ids: ham-radio-<dev>-<operate|section|tab> here; the front panel's ids are listed in
 * radio-front-panel.ts.
 */

import { ImmersiveView } from '@app/presentation/immersive-view';
import type { HamStationManager } from '../../ham-station-manager';
import type { PanelContext, StationPanel } from '../station-panel';
import { button, card, h, RADIO_KINDS, Rebuilder, tid } from '../ui-kit';
import { TransceiverFront } from './radio-front-panel';

interface RadioView {
  id: string;
  section: HTMLElement;
  tabBtn: HTMLElement;
  /** SDRs have no transceiver face; theirs is the SDR console, so no front is built */
  front: TransceiverFront | null;
}

export class RadioPanel implements StationPanel {
  readonly id = 'radio';
  readonly title = 'Radio';
  private ctx_!: PanelContext;
  private root_: HTMLElement | null = null;
  private tabsHost_!: HTMLElement;
  private body_!: HTMLElement;
  private readonly rebuild_ = new Rebuilder();
  private readonly immersive_ = new ImmersiveView();
  private views_: RadioView[] = [];
  private selected_ = '';
  private operating_: string | null = null;
  private sig_ = '';

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
    c.root.classList.add('trx-bench-card');
    this.root_ = c.root;
    this.tabsHost_ = h('ul', { class: 'nav nav-pills mb-2', role: 'tablist' });
    this.body_ = h('div');
    c.body.append(this.tabsHost_, this.body_);
    host.append(c.root);
    this.update(ctx.manager);
  }

  update(m: HamStationManager): void {
    const ids = RadioPanel.radios_(m);
    const sig = ids.join('|');
    // A rebuild would orphan the front panel on screen: put it down, and sit back down at the same
    // radio on its new front panel if it is still on the bench
    const again = this.operating_ && sig !== this.sig_ ? this.operating_ : null;
    if (again) this.putDown_();
    this.sig_ = sig;
    this.rebuild_.run(this.body_, sig, () => this.build_(m, ids));
    if (again && ids.includes(again)) this.operate(again);
    for (const v of this.views_) v.front?.sync(m, false);
  }

  dispose(): void {
    this.putDown_();
    for (const v of this.views_) v.front?.dispose();
    this.root_?.remove();
    this.root_ = null;
    this.views_ = [];
  }

  /** Show one radio (the close-up uses this; the tab strip is hidden there) */
  showDevice(id: string): void {
    this.tabsHost_.hidden = true;
    this.select_(id);
  }

  /** Sit down at a radio: its front panel fills the screen */
  operate(id: string): void {
    const v = this.views_.find((x) => x.id === id);
    if (!v?.front) return;
    this.immersive_.close();
    this.operating_ = id;
    v.front.sync(this.ctx_.manager, true);
    this.immersive_.open(v.front.el, `${v.front.el.dataset.label ?? id} front panel`, 'transceiver', () => this.putDown_());
  }

  private putDown_(): void {
    this.operating_ = null;
    this.immersive_.close();
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
    for (const v of this.views_) v.front?.dispose();
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
    const dev = m.device(id);
    const label = dev?.label ?? id;
    const section = h('div', { 'data-testid': tid('ham-radio', id, 'section'), role: 'tabpanel', 'aria-label': label });
    const tabBtn = button(tid('ham-radio', id, 'tab'), label, () => this.select_(id), 'nav-link py-1');
    tabBtn.setAttribute('role', 'tab');
    if (dev?.kind === 'sdr') return { id, section, tabBtn, front: null };
    const front = new TransceiverFront(m, this.ctx_, id);
    front.el.dataset.label = label;
    // The front panel waits here, out of sight, until the player sits down at the radio
    const parked = h('div', { class: 'trx-parked' }, front.el);
    const operate = button(tid('ham-radio', id, 'operate'), `Operate ${label}`, () => this.operate(id), 'trx-operate', `Sit down at ${label}: dial, keys and mic`);
    section.append(h('p', { class: 'trx-operate-hint', text: 'Dial, keys and mic are on the front panel.' }), operate, parked);

    return { id, section, tabBtn, front };
  }
}
