/**
 * @file ham-station-tab - Station tab for Campaign 3 (ham-sdr) backyard stations
 * @description Hosts the headless HamStationManager as a point-and-click bench: a drawn scene of the
 * equipment at the current location (src/ham/ui/bench) on the left, and on the right a Close-up
 * (the selected device or cable, with its own controls) and a Notebook (worksheets, reference
 * cards, station log). Ask Riley sits in a strip above. Every player action goes through
 * `manager.act()`; refusals show in the feedback strip. Re-renders on
 * `Events.HAM_STATION_UPDATED` and after each action (the service flush).
 *
 * Bench ids: ham-bench-scene, ham-bench-dev-<dev>, ham-port-<dev>-<port>, ham-bench-conn-<conn>,
 * ham-closeup, ham-side-<closeup|notebook>, ham-sdr-* (sdr-app.ts header).
 * TEST ID SCHEME (ids and data-testid are identical): `ham-<panel>-<device|id>-<control>`
 *   tab        ham-station-tab, ham-station-feedback
 *   location   ham-loc-<bench|yard|club>
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

import { type DockLeftPolicy, DraggableBox } from '@app/engine/ui/draggable-box';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { displayScale, displayViewport } from '@app/game-menu/display-viewport';
import type { HamAction, HamStationManager } from '@app/ham/ham-station-manager';
import { HamStationService } from '@app/ham/ham-station-service';
import { BenchScene } from '@app/ham/ui/bench/bench-scene';
import { Closeup } from '@app/ham/ui/bench/closeup';
import { createStationPanels } from '@app/ham/ui/panels';
import type { FeedbackKind, PanelContext, StationPanel } from '@app/ham/ui/station-panel';
import { button, h, tid } from '@app/ham/ui/ui-kit';
import { ImmersiveView } from '@app/presentation/immersive-view';
import '@app/ham/ui/bench/bench.css';
import './ham-station-tab.css';

/** Panels that live in the Notebook side tab rather than on a device */
const NOTEBOOK_PANELS = ['worksheets', 'cards', 'log'];
/** Panels the bench drawing replaces or the SDR app already contains */
const REPLACED_PANELS = ['connections', 'spectrum'];

type SideTab = 'closeup' | 'notebook';

export class HamStationTab {
  private readonly immersive_ = new ImmersiveView();
  private readonly manager_: HamStationManager;
  private readonly root_: HTMLElement;
  private readonly locationBar_: HTMLElement;
  private readonly feedback_: HTMLElement;
  private readonly hintHost_: HTMLElement;
  private readonly notebook_: HTMLElement;
  private readonly sideTabs_: Record<SideTab, HTMLButtonElement>;
  private readonly sideBodies_: Record<SideTab, HTMLElement>;
  private readonly panels_: StationPanel[];
  private readonly hint_: StationPanel | undefined;
  private readonly notebookPanels_: StationPanel[];
  private readonly slots_ = new Map<string, HTMLElement>();
  private readonly mounted_ = new Set<string>();
  private readonly boundUpdate_: () => void;
  private readonly ctx_: PanelContext;
  private readonly scene_: BenchScene;
  private readonly closeup_: Closeup;
  private locSig_ = '';
  private disposed_ = false;
  private readonly dockPolicy_: DockLeftPolicy;
  /** Width of a docked list window; the tab pads its left edge by this much while one is open */
  private static readonly DOCK_WIDTH_PX = 300;

  constructor(manager: HamStationManager, containerId: string, panels: StationPanel[] = createStationPanels()) {
    this.manager_ = manager;
    this.panels_ = panels;
    this.ctx_ = {
      manager,
      act: (a: HamAction) => this.act_(a),
      feedback: (msg, kind) => this.feedback(msg, kind),
    };
    this.hint_ = panels.find((p) => p.id === 'hints');
    this.notebookPanels_ = NOTEBOOK_PANELS.map((id) => panels.find((p) => p.id === id)).filter((p): p is StationPanel => !!p);
    const devicePanels = panels.filter((p) => p !== this.hint_ && !NOTEBOOK_PANELS.includes(p.id) && !REPLACED_PANELS.includes(p.id));
    this.locationBar_ = h('div', { class: 'btn-group ham-location-bar', role: 'group', 'aria-label': 'Location' });
    this.feedback_ = h('div', {
      class: 'ham-feedback alert alert-info py-1 mb-0',
      role: 'status',
      'aria-live': 'polite',
      id: 'ham-station-feedback',
      'data-testid': 'ham-station-feedback',
      hidden: true,
    });
    this.hintHost_ = h('div', { class: 'ham-hint-strip' });
    this.notebook_ = h('div', { class: 'ham-notebook', id: 'ham-notebook', 'data-testid': 'ham-notebook' });
    this.scene_ = new BenchScene(this.ctx_, (sel) => {
      this.closeup_.select(sel);
      this.showSide_('closeup');
      if (sel) this.focusWork_('closeup');
    });
    this.closeup_ = new Closeup(this.ctx_, this.scene_, devicePanels);
    const tabBtn = (id: SideTab, label: string): HTMLButtonElement => {
      const b = button(
        tid('ham-side', id),
        label,
        () => {
          this.showSide_(id);
          this.focusWork_(id);
        },
        'ham-side-tab'
      );
      b.setAttribute('role', 'tab');

      return b;
    };
    this.sideTabs_ = { closeup: tabBtn('closeup', 'Close-up'), notebook: tabBtn('notebook', 'Notebook') };
    this.sideBodies_ = {
      closeup: h('div', { class: 'ham-side-body', role: 'tabpanel' }, this.closeup_.el),
      notebook: h('div', { class: 'ham-side-body', role: 'tabpanel', hidden: true }, this.notebook_),
    };
    this.root_ = h(
      'div',
      { class: 'ham-station-tab', id: 'ham-station-tab', 'data-testid': 'ham-station-tab' },
      h('div', { class: 'ham-station-top' }, h('div', { class: 'd-flex align-items-center gap-2' }, h('strong', { text: 'Location' }), this.locationBar_), this.feedback_),
      this.hintHost_,
      h(
        'div',
        { class: 'ham-station-main' },
        h('div', { class: 'ham-station-scene' }, this.scene_.el),
        h(
          'div',
          { class: 'ham-station-side' },
          h('div', { class: 'ham-side-tabs', role: 'tablist' }, this.sideTabs_.closeup, this.sideTabs_.notebook),
          this.sideBodies_.closeup,
          this.sideBodies_.notebook
        )
      )
    );
    const parent = document.getElementById(containerId);
    if (!parent) throw new Error(`Parent element ${containerId} not found`);
    parent.replaceChildren(this.root_);
    this.showSide_('closeup');
    this.boundUpdate_ = this.refresh_.bind(this);
    EventBus.getInstance().on(Events.HAM_STATION_UPDATED, this.boundUpdate_);
    // Brief, checklist and history windows dock on the left so the bench stays clickable
    // Docked windows sit in a gutter at the left of the tab, so neither the asset sidebar nor the bench is covered
    this.dockPolicy_ = {
      topEl: this.root_,
      left: () => this.root_.getBoundingClientRect().left / displayScale() + 8,
      width: () => HamStationTab.DOCK_WIDTH_PX,
      wideWidth: () => Math.max(HamStationTab.DOCK_WIDTH_PX, displayViewport().width / 2 - this.root_.getBoundingClientRect().left / displayScale()),
      onChange: (anyDocked) => this.root_.classList.toggle('has-docked-window', anyDocked),
    };
    DraggableBox.dockLeft = this.dockPolicy_;
    this.refresh_();
  }

  get dom(): HTMLElement {
    return this.root_;
  }

  /** Show a message in the feedback strip */
  feedback(msg: string, kind: FeedbackKind): void {
    this.feedback_.hidden = msg === '';
    this.feedback_.className = `ham-feedback alert alert-${kind} py-1 mb-0`;
    this.feedback_.textContent = msg;
  }

  activate(): void {
    DraggableBox.dockLeft = this.dockPolicy_;
    this.root_.style.display = '';
    this.refresh_();
  }

  deactivate(): void {
    this.immersive_.close();
    if (DraggableBox.dockLeft === this.dockPolicy_) DraggableBox.dockLeft = null;
    this.root_.style.display = 'none';
  }

  dispose(): void {
    this.immersive_.close();
    if (this.disposed_) return;
    this.disposed_ = true;
    if (DraggableBox.dockLeft === this.dockPolicy_) DraggableBox.dockLeft = null;
    EventBus.getInstance().off(Events.HAM_STATION_UPDATED, this.boundUpdate_);
    this.scene_.dispose();
    this.closeup_.dispose();
    for (const p of this.panels_) if (this.mounted_.has(p.id)) p.dispose();
    this.root_.remove();
  }

  /** Switch the side column between the close-up and the notebook */
  showSide(tab: SideTab): void {
    this.showSide_(tab);
    this.focusWork_(tab);
  }

  private focusWork_(tab: SideTab): void {
    this.immersive_.close();
    const work = this.root_.querySelector<HTMLElement>('.ham-station-main');
    if (!work) return;
    work.prepend(this.feedback_);
    this.immersive_.open(work, tab === 'notebook' ? 'Station notebook' : 'Station equipment', tab === 'notebook' ? 'paper' : 'equipment', () => this.immersive_.close());
  }

  private showSide_(tab: SideTab): void {
    for (const k of ['closeup', 'notebook'] as const) {
      const on = k === tab;
      this.sideBodies_[k].hidden = !on;
      this.sideTabs_[k].classList.toggle('is-active', on);
      this.sideTabs_[k].setAttribute('aria-selected', String(on));
    }
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
    this.scene_.render(m);
    this.closeup_.update(m);
    if (this.hint_) this.refreshPanel_(this.hint_, this.hintHost_, m);
    for (const p of this.notebookPanels_) this.refreshPanel_(p, this.notebook_, m);
  }

  private refreshPanel_(p: StationPanel, parent: HTMLElement, m: HamStationManager): void {
    let slot = this.slots_.get(p.id);
    if (!slot) {
      slot = h('div', { class: 'ham-slot', 'data-panel': p.id, hidden: true });
      this.slots_.set(p.id, slot);
      parent.append(slot);
    }
    const relevant = p.isRelevant(m);
    slot.hidden = !relevant;
    if (relevant && !this.mounted_.has(p.id)) {
      p.mount(slot, this.ctx_);
      this.mounted_.add(p.id);
    }
    if (relevant) p.update(m);
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
}
