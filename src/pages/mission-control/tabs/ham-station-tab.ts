/**
 * @file ham-station-tab - Station tab for Campaign 3 (ham-sdr) backyard stations
 * @description Hosts the headless HamStationManager as a point-and-click bench: a drawn scene of the
 * equipment at the current location (src/ham/ui/bench) on the left, and on the right a Close-up
 * (the selected device or cable, with its own controls). Signs on the drawing walk to the other
 * locations. Beside the bench lie the logbook (worksheets, station log, mission papers) and the
 * reference cards, picked up from the kit tray. Riley's sticky note (Ask Riley, quiz nudge) sits
 * above. Every player action goes through
 * `manager.act()`; refusals show in the feedback strip. Re-renders on
 * `Events.HAM_STATION_UPDATED` and after each action (the service flush).
 *
 * Bench ids: ham-bench-scene, ham-bench-dev-<dev>, ham-port-<dev>-<port>, ham-bench-conn-<conn>,
 * ham-closeup, ham-notebook, ham-sdr-* (sdr-app.ts header).
 * Kit tray: [data-field-kit="logbook|cards"]; logbook pages [data-field-object="ham-worksheets|ham-log"],
 * mission pages [data-field-mission="<item>"] (field-kit.ts BENCH_KIT).
 * TEST ID SCHEME (ids and data-testid are identical): `ham-<panel>-<device|id>-<control>`
 *   tab        ham-station-tab, ham-station-feedback
 *   location   ham-loc-<bench|yard|club> (walk signs; aria-pressed marks where you stand)
 *   radio      ham-radio-<dev>-<freq-input|apply|freq-dec-coarse|freq-dec-fine|freq-inc-fine|
 *              freq-inc-coarse|mode|filter-preset|filter-hz|squelch|volume|rfgain|txpower|offset|
 *              offset-khz|txtone|rxtone|mem-slot|mem-name|mem-store|mem-recall|vfo|monitor|
 *              keylock|rit-on|rit-hz|micgain|dmr-channel|smeter|snr|sql|status|rxlog|tab>
 *   ptt        ham-ptt-<dev>-<intent|target|item|message|hold|transmit|release|refusal>
 *   spectrum   ham-spectrum-<dev>-canvas, ham-spectrum-<dev>-readout (inside the SDR app, sdr-app.ts)
 *   connect    ham-conn-<deviceId|connectionId|faultId|spareId>-<inspect|seat|disconnect|power|
 *              dctest|move|repair|install|clue|signal-path> (bench close-up, closeup.ts); cabling is
 *              done on the bench itself with ham-port-<dev>-<port>
 *   instrument ham-inst-<meter|swr|analyzer|antenna|board|dc|packet|satellite>-operate lifts the
 *              instrument's panel up fullscreen (bench/instrument-face.ts)
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
import { BENCH_KIT, type FieldKitObject, type KitSheet, kitObjectFor, kitSheetsNav, missionItemBridge, offeredSheets } from '@app/pages/mission-control/tabs/field-kit';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { minimalHudShown } from '@app/presentation/minimal-hud/minimal-hud-policy';
import '@app/ham/ui/bench/bench.css';
import './ham-station-tab.css';

/** Panels that live in the logbook and the reference cards rather than on a device */
const NOTEBOOK_PANELS = ['worksheets', 'cards', 'log'];
/** Kit page id (field-kit.ts BENCH_KIT) to the panel it shows */
const PAGE_PANELS: Record<string, string> = { 'ham-worksheets': 'worksheets', 'ham-log': 'log', 'ham-cards': 'cards' };

export class HamStationTab {
  private readonly immersive_ = new ImmersiveView();
  private readonly manager_: HamStationManager;
  private readonly root_: HTMLElement;
  private readonly locationBar_: HTMLElement;
  private readonly feedback_: HTMLElement;
  private readonly hintHost_: HTMLElement;
  private readonly notebook_: HTMLElement;
  private readonly kitTray_: HTMLElement;
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
  /** The kit object held fullscreen (logbook, cards) and its page row, so a page turn happens in place */
  private heldKit_: string | null = null;
  private heldNav_: HTMLElement | undefined;
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
    const devicePanels = panels.filter((p) => p !== this.hint_ && !NOTEBOOK_PANELS.includes(p.id));
    this.locationBar_ = h('nav', { class: 'ham-walk', 'aria-label': 'Walk to' });
    this.feedback_ = h('div', {
      class: 'ham-feedback alert alert-info py-1 mb-0',
      role: 'status',
      'aria-live': 'polite',
      id: 'ham-station-feedback',
      'data-testid': 'ham-station-feedback',
      hidden: true,
    });
    this.hintHost_ = h('aside', { class: 'ham-hint-strip', 'aria-label': "Riley's note" });
    this.notebook_ = h('div', { class: 'ham-notebook', id: 'ham-notebook', 'data-testid': 'ham-notebook' });
    this.scene_ = new BenchScene(this.ctx_, (sel) => {
      this.closeup_.select(sel);
      if (sel) this.focusWork_();
    });
    this.closeup_ = new Closeup(this.ctx_, this.scene_, devicePanels);
    this.kitTray_ = h('nav', { class: 'fk-tray ham-kit-tray', 'aria-label': 'Beside the bench' });
    for (const item of BENCH_KIT) {
      const pick = h(
        'button',
        { type: 'button', class: 'fk-item', 'data-field-kit': item.id, 'aria-label': item.label, title: item.label },
        h('img', { src: item.image, alt: '', draggable: 'false' }),
        h('span', { text: item.label })
      );
      pick.addEventListener('click', () => this.pickUp_(item));
      this.kitTray_.append(pick);
    }
    this.root_ = h(
      'div',
      { class: 'ham-station-tab', id: 'ham-station-tab', 'data-testid': 'ham-station-tab' },
      h('div', { class: 'ham-station-top' }, this.feedback_),
      this.hintHost_,
      h(
        'div',
        { class: 'ham-station-main' },
        h('div', { class: 'ham-station-scene' }, this.locationBar_, this.scene_.el),
        h('div', { class: 'ham-station-side' }, h('div', { class: 'ham-side-body' }, this.closeup_.el))
      ),
      this.kitTray_,
      h('div', { class: 'ham-notebook-shelf', hidden: true }, this.notebook_)
    );
    const parent = document.getElementById(containerId);
    if (!parent) throw new Error(`Parent element ${containerId} not found`);
    parent.replaceChildren(this.root_);
    this.boundUpdate_ = this.refresh_.bind(this);
    EventBus.getInstance().on(Events.HAM_STATION_UPDATED, this.boundUpdate_);
    // Brief, checklist and history windows dock on the left so the bench stays clickable
    // Docked windows sit in a gutter at the left of the tab, so neither the asset sidebar nor the bench is covered
    const root = this.root_;
    this.dockPolicy_ = {
      // Under the bench HUD windows open below Riley's note (the watch is top right, clear of a left dock)
      get topEl(): HTMLElement {
        return (minimalHudShown() && root.querySelector<HTMLElement>(':scope > .ham-station-main')) || root;
      },
      left: () => this.root_.getBoundingClientRect().left / displayScale() + 8,
      width: () => HamStationTab.DOCK_WIDTH_PX,
      wideWidth: () => Math.max(HamStationTab.DOCK_WIDTH_PX, displayViewport().width / 2 - this.root_.getBoundingClientRect().left / displayScale()),
      onChange: (anyDocked) => {
        this.root_.classList.toggle('has-docked-window', anyDocked);
        this.syncDockGutter_(anyDocked);
      },
    };
    DraggableBox.dockLeft = this.dockPolicy_;
    this.refresh_();
  }

  get dom(): HTMLElement {
    return this.root_;
  }

  /**
   * Under the bench HUD the gutter is as wide as the docked window really is (the brief docks at half the screen,
   * wider than the fixed list-window gutter), so the whole bench stays visible beside it instead of under it.
   */
  private syncDockGutter_(anyDocked: boolean): void {
    if (!anyDocked || !minimalHudShown()) {
      this.root_.style.removeProperty('--ham-dock-gutter');

      return;
    }
    const left = this.root_.getBoundingClientRect().left;
    let right = 0;
    for (const box of document.querySelectorAll<HTMLElement>('.is-docked-left')) {
      const rect = box.getBoundingClientRect();
      if (rect.width > 0 && box.offsetParent !== null) right = Math.max(right, rect.right);
    }
    const gutter = Math.max(HamStationTab.DOCK_WIDTH_PX + 16, Math.ceil((right - left) / displayScale()) + 12);
    this.root_.style.setProperty('--ham-dock-gutter', `${gutter}px`);
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

  /** Pick up the logbook or the reference cards: `page` opens that page, otherwise the first one offered */
  pickUp(kitId: 'logbook' | 'cards', page?: string): void {
    const item = BENCH_KIT.find((k) => k.id === kitId);
    if (!item) return;
    if (page) this.openPage_({ label: '', tabId: page });
    else this.pickUp_(item);
  }

  /** The pages of a kit object this scenario offers: logbook pages whose panel is in use, mission papers that exist */
  private offered_(item: FieldKitObject): KitSheet[] {
    return offeredSheets(item, this.offeredPages_(), (mission) => missionItemBridge.available(mission));
  }

  private offeredPages_(): Set<string> {
    const m = this.manager_;

    return new Set(
      Object.entries(PAGE_PANELS)
        .filter(([, panelId]) => this.panels_.find((p) => p.id === panelId)?.isRelevant(m))
        .map(([page]) => page)
    );
  }

  /** Pick up a kit object at its first page of its own; a kit made only of mission papers opens the first paper */
  private pickUp_(item: FieldKitObject): void {
    const sheets = this.offered_(item);
    const first = sheets.find((sheet) => 'tabId' in sheet) ?? sheets[0];
    if (first) this.openPage_(first);
  }

  /** Open a page: a logbook page or the cards fullscreen as paper, or a mission paper in its own window */
  private openPage_(sheet: KitSheet): void {
    if (!('tabId' in sheet)) {
      // The logbook kit has no clipboard sheets
      if (!('mission' in sheet)) return;
      // Put the logbook down; the paper opens in its own window
      this.heldKit_ = null;
      this.immersive_.close();
      missionItemBridge.open(sheet.mission);

      return;
    }
    const panelId = PAGE_PANELS[sheet.tabId];
    if (!panelId) return;
    this.refresh_();
    this.notebook_.dataset.page = panelId;
    const item = kitObjectFor(sheet.tabId, BENCH_KIT);
    // Turning a page of the object already in hand: the page and the pressed tab change in place, focus stays put
    if (item && this.immersive_.isOpen() && this.heldKit_ === item.id) {
      for (const tab of this.heldNav_?.querySelectorAll<HTMLElement>('[data-field-object]') ?? []) {
        tab.setAttribute('aria-pressed', String(tab.dataset.fieldObject === sheet.tabId));
      }

      return;
    }
    const nav = kitSheetsNav(
      sheet.tabId,
      this.offeredPages_(),
      (mission) => missionItemBridge.available(mission),
      (next) => this.openPage_(next),
      BENCH_KIT
    );
    // Before the brief is read the scenario waits on it: the logbook's Mission brief tab is marked to read first
    const brief = nav?.querySelector<HTMLElement>('[data-field-mission="brief"]');
    if (brief && missionItemBridge.locked()) {
      brief.classList.add('is-due');
      brief.append(h('span', { class: 'visually-hidden', text: ' (read this first)' }));
    }
    this.immersive_.close();
    this.heldKit_ = item?.id ?? null;
    this.heldNav_ = nav;
    this.immersive_.open(
      this.notebook_,
      item?.label ?? 'Logbook',
      'paper',
      () => {
        this.heldKit_ = null;
        this.immersive_.close();
      },
      nav
    );
  }

  /** Lean over the bench: the drawing and the close-up of what was picked fill the screen */
  private focusWork_(): void {
    this.heldKit_ = null;
    this.immersive_.close();
    const work = this.root_.querySelector<HTMLElement>('.ham-station-main');
    if (!work) return;
    work.prepend(this.feedback_);
    this.immersive_.open(work, 'Station equipment', 'equipment', () => this.immersive_.close());
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
    this.syncKit_();
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

  /** A kit object lies beside the bench only while the scenario offers one of its pages */
  private syncKit_(): void {
    for (const item of BENCH_KIT) {
      const pick = this.kitTray_.querySelector<HTMLElement>(`[data-field-kit="${item.id}"]`);
      if (pick) pick.hidden = this.offered_(item).length === 0;
    }
  }

  /**
   * Where you can walk: a plaque for the spot you stand at and a sign for each other spot.
   * Walking is the same `go` action the old location buttons sent.
   */
  private renderLocations_(m: HamStationManager): void {
    const sig = `${m.location}|${m.config.locations.map((l) => l.id).join()}`;
    if (sig === this.locSig_) return;
    this.locSig_ = sig;
    this.locationBar_.hidden = m.config.locations.length < 2;
    this.locationBar_.replaceChildren(
      ...m.config.locations.map((l) => {
        const isHere = l.id === m.location;
        const b = button(
          tid('ham-loc', l.id),
          l.label,
          () => this.act_({ type: 'go', location: l.id }),
          isHere ? 'ham-walk-spot is-here' : 'ham-walk-spot',
          isHere ? `You are at the ${l.label}` : `Walk to the ${l.label}`
        );
        b.title = l.description;
        b.setAttribute('aria-pressed', String(isHere));
        if (!isHere) b.append(h('span', { class: 'ham-walk-arrow', 'aria-hidden': 'true', text: '\u2192' }));

        return b;
      })
    );
    this.root_.dataset.location = m.location;
  }
}
