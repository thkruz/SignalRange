/**
 * @file ham-station-tab - Station tab for Campaign 3 (ham-sdr) backyard stations
 * @description Hosts the headless HamStationManager: a location bar, an Equipment column and a
 * responsive grid of panels (src/ham/ui/panels). Every player action goes through
 * `manager.act()`; refusals show in the feedback strip. Re-renders on
 * `Events.HAM_STATION_UPDATED` and after each action (the service flush).
 *
 * TEST ID SCHEME (ids and data-testid are identical): `ham-<panel>-<device|id>-<control>`
 *   tab        ham-station-tab, ham-station-feedback, ham-station-panels
 *   location   ham-loc-<bench|yard|club>
 *   equipment  ham-equip-<deviceId>, ham-equip-spare-<deviceId>
 *   radio      ham-radio-<dev>-<freq-input|apply|freq-dec-coarse|freq-dec-fine|freq-inc-fine|
 *              freq-inc-coarse|mode|filter-preset|filter-hz|squelch|volume|rfgain|txpower|offset|
 *              offset-khz|txtone|rxtone|mem-slot|mem-name|mem-store|mem-recall|vfo|monitor|
 *              keylock|rit-on|rit-hz|micgain|dmr-channel|smeter|snr|sql|status|rxlog|tab>
 *   ptt        ham-ptt-<dev>-<intent|target|item|message|hold|transmit|release|refusal>
 *   spectrum   ham-spectrum-<dev>-canvas, ham-spectrum-<dev>-readout, ham-spectrum-select
 *   connect    ham-conn-<deviceId|connectionId|faultId|spareId>-<inspect|seat|disconnect|power|
 *              move|move-to|repair|install|replaces|clue>, ham-conn-new-<a|b>-<device|port>,
 *              ham-conn-new-connect, ham-conn-path-radio, ham-conn-path-text
 *   worksheet  ham-ws-<id>-<fieldId>, ham-ws-<id>-<fieldId>-<matchKey>, ham-ws-<id>-submit,
 *              ham-ws-<id>-feedback, ham-ws-<id>-status
 *   cards      ham-card-<id>, ham-card-<id>-toggle
 *   log        ham-log-tab-<receptions|measurements|contacts|notes>, ham-log-note-input,
 *              ham-log-note-add
 *   hint       ham-hint-<objectiveId>-ask, ham-hint-<objectiveId>-text
 * Instrument panels (meter/swr/analyzer/antenna/board/dc/packet/satellite) follow the same
 * `ham-<panel>-<device>-<control>` form.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { HamAction, HamStationManager } from '@app/ham/ham-station-manager';
import { HamStationService } from '@app/ham/ham-station-service';
import { createStationPanels } from '@app/ham/ui/panels';
import type { FeedbackKind, PanelContext, StationPanel } from '@app/ham/ui/station-panel';
import { badge, button, h, PASSIVE_KINDS, tid } from '@app/ham/ui/ui-kit';
import './ham-station-tab.css';

/** Panels that get the full grid width; everything else shares a row */
const WIDE_PANELS = new Set(['radio', 'spectrum', 'connections', 'log', 'worksheets', 'packet', 'satellite']);

export class HamStationTab {
  private readonly manager_: HamStationManager;
  private readonly root_: HTMLElement;
  private readonly locationBar_: HTMLElement;
  private readonly feedback_: HTMLElement;
  private readonly equipment_: HTMLElement;
  private readonly grid_: HTMLElement;
  private readonly panels_: StationPanel[];
  private readonly slots_ = new Map<string, HTMLElement>();
  private readonly mounted_ = new Set<string>();
  private readonly boundUpdate_: () => void;
  private readonly ctx_: PanelContext;
  private equipSig_ = '';
  private locSig_ = '';
  private disposed_ = false;

  constructor(manager: HamStationManager, containerId: string, panels: StationPanel[] = createStationPanels()) {
    this.manager_ = manager;
    this.panels_ = panels;
    this.ctx_ = {
      manager,
      act: (a: HamAction) => this.act_(a),
      feedback: (msg, kind) => this.feedback(msg, kind),
    };
    this.locationBar_ = h('div', { class: 'btn-group ham-location-bar', role: 'group', 'aria-label': 'Location' });
    this.feedback_ = h('div', {
      class: 'ham-feedback alert alert-info py-1 mb-2',
      role: 'status',
      'aria-live': 'polite',
      id: 'ham-station-feedback',
      'data-testid': 'ham-station-feedback',
      hidden: true,
    });
    this.equipment_ = h('div', { class: 'ham-equipment' });
    this.grid_ = h('div', { class: 'row row-cards ham-panel-grid', id: 'ham-station-panels', 'data-testid': 'ham-station-panels' });
    this.root_ = h(
      'div',
      { class: 'ham-station-tab', id: 'ham-station-tab', 'data-testid': 'ham-station-tab' },
      h('div', { class: 'd-flex flex-wrap align-items-center gap-2 mb-2' }, h('strong', { text: 'Location' }), this.locationBar_),
      this.feedback_,
      h(
        'div',
        { class: 'row g-2' },
        h(
          'div',
          { class: 'col-12 col-lg-3' },
          h(
            'div',
            { class: 'card' },
            h('div', { class: 'card-header py-2' }, h('h4', { class: 'card-title mb-0', text: 'Equipment' })),
            h('div', { class: 'card-body py-2' }, this.equipment_)
          )
        ),
        h('div', { class: 'col-12 col-lg-9' }, this.grid_)
      )
    );
    const parent = document.getElementById(containerId);
    if (!parent) throw new Error(`Parent element ${containerId} not found`);
    parent.replaceChildren(this.root_);
    this.boundUpdate_ = this.refresh_.bind(this);
    EventBus.getInstance().on(Events.HAM_STATION_UPDATED, this.boundUpdate_);
    this.refresh_();
  }

  get dom(): HTMLElement {
    return this.root_;
  }

  /** Show a message in the feedback strip */
  feedback(msg: string, kind: FeedbackKind): void {
    this.feedback_.hidden = msg === '';
    this.feedback_.className = `ham-feedback alert alert-${kind} py-1 mb-2`;
    this.feedback_.textContent = msg;
  }

  activate(): void {
    this.root_.style.display = 'block';
    this.refresh_();
  }

  deactivate(): void {
    this.root_.style.display = 'none';
  }

  dispose(): void {
    if (this.disposed_) return;
    this.disposed_ = true;
    EventBus.getInstance().off(Events.HAM_STATION_UPDATED, this.boundUpdate_);
    for (const p of this.panels_) p.dispose();
    this.root_.remove();
  }

  private act_(a: HamAction): ReturnType<HamStationManager['act']> {
    const r = this.manager_.act(a);
    const correct = r.data?.correct;
    this.feedback(r.message, !r.ok ? 'warning' : correct === false ? 'warning' : 'success');
    const svc = HamStationService.getInstance();
    if (svc && svc.manager === this.manager_) svc.flush();
    else this.refresh_();

    return r;
  }

  private refresh_(): void {
    if (this.disposed_) return;
    const m = this.manager_;
    this.renderLocations_(m);
    this.renderEquipment_(m);
    for (const p of this.panels_) {
      let slot = this.slots_.get(p.id);
      const relevant = p.isRelevant(m);
      if (!slot) {
        slot = h('div', { class: `col-12 ${WIDE_PANELS.has(p.id) ? '' : 'col-xl-6'}`, 'data-panel': p.id, hidden: true });
        this.slots_.set(p.id, slot);
        this.grid_.append(slot);
      }
      slot.hidden = !relevant;
      if (relevant && !this.mounted_.has(p.id)) {
        p.mount(slot, this.ctx_);
        this.mounted_.add(p.id);
      }
      if (relevant) p.update(m);
    }
  }

  private renderLocations_(m: HamStationManager): void {
    const sig = `${m.location}|${m.config.locations.map((l) => l.id).join()}`;
    if (sig === this.locSig_) return;
    this.locSig_ = sig;
    this.locationBar_.replaceChildren(
      ...m.config.locations.map((l) => {
        const b = button(
          tid('ham-loc', l.id),
          l.label,
          () => this.act_({ type: 'go', location: l.id }),
          `btn btn-sm ${l.id === m.location ? 'btn-primary' : 'btn-outline-primary'}`,
          `Go to ${l.label}`
        );
        b.title = l.description;
        b.setAttribute('aria-pressed', String(l.id === m.location));

        return b;
      })
    );
  }

  private renderEquipment_(m: HamStationManager): void {
    const here = m.devices().filter((d) => !d.removed && !d.spare && d.location === m.location);
    const spares = m.devices().filter((d) => d.spare && !d.removed);
    const sig = JSON.stringify([m.location, here.map((d) => [d.id, d.powered]), spares.map((d) => d.id)]);
    if (sig === this.equipSig_) return;
    this.equipSig_ = sig;
    const list = h('ul', { class: 'list-unstyled small mb-2', 'aria-label': `Equipment at ${m.location}` });
    for (const d of here) {
      list.append(
        h(
          'li',
          { id: tid('ham-equip', d.id), 'data-testid': tid('ham-equip', d.id) },
          d.label,
          ' ',
          PASSIVE_KINDS.includes(d.kind) ? null : badge(d.powered ? 'on' : 'off', d.powered ? 'success' : 'secondary')
        )
      );
    }
    this.equipment_.replaceChildren(list);
    if (spares.length > 0) {
      const shelf = h('ul', { class: 'list-unstyled small mb-0', 'aria-label': 'Spares shelf' });
      for (const s of spares) shelf.append(h('li', { id: tid('ham-equip-spare', s.id), 'data-testid': tid('ham-equip-spare', s.id), text: s.label }));
      this.equipment_.append(h('h5', { class: 'mt-2', text: 'Spares shelf' }), shelf);
    }
  }
}
