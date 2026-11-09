/**
 * @file skylink-dashboard - The SkyLink station tab: a desktop status page with a left nav (phase 40, WP3)
 * @description Shell only. Screens are separate modules behind `TerminalScreen`. Connection states
 * (D6): no router shows a full "cannot connect" panel; dish unreachable shows the last data under
 * a "Can't reach your SkyLink" banner. A ~1 Hz `Events.UPDATE` sync, never over a focused input
 * (screens guard their own inputs).
 */
import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { AntennaPage } from '@app/pages/mission-control/antenna-page-registry';
import { createHomeScreen } from './screens/home-screen';
import { placeholderScreen } from './screens/placeholder-screen';
import { createSettingsScreen } from './screens/settings-screen';
import type { TerminalScreen, TerminalScreenContext, TerminalScreenFactory } from './screens/terminal-screen';
import { formatAge, type TerminalStringKey, tr } from './strings';
import type { TerminalView } from './terminal-app-model';
import { TerminalRuntime } from './terminal-runtime';
import type { TerminalScreenId } from './terminal-skin';
import './skylink-app.css';

export const SKYLINK_TAB_ID = 'skylink-app';
export const SKYLINK_TAB_LABEL = 'SkyLink';

/** Screen id -> factory. WP4-6 replace the placeholders here. */
export const SCREEN_FACTORIES: Record<TerminalScreenId, TerminalScreenFactory> = {
  home: createHomeScreen,
  obstructions: placeholderScreen('obstructions'),
  statistics: placeholderScreen('statistics'),
  'speed-test': placeholderScreen('speed-test'),
  settings: createSettingsScreen,
  advanced: placeholderScreen('advanced'),
};

const SYNC_INTERVAL_MS = 1000;

export class SkylinkDashboardPage implements AntennaPage {
  readonly tabLabel = SKYLINK_TAB_LABEL;

  private dom_: HTMLElement | null = null;
  private readonly boundUpdate_: () => void;
  private readonly screens_ = new Map<TerminalScreenId, { screen: TerminalScreen; host: HTMLElement }>();
  private readonly navHandlers_: Array<{ el: Element; fn: EventListener }> = [];
  private current_: TerminalScreenId = 'home';
  private active_ = false;
  private lastSyncMs_ = 0;
  private confirmResolve_: ((ok: boolean) => void) | null = null;

  constructor(
    private readonly containerId_: string,
    private readonly runtime_: TerminalRuntime | null,
    private readonly factories_: Record<TerminalScreenId, TerminalScreenFactory> = SCREEN_FACTORIES
  ) {
    this.boundUpdate_ = this.throttledSync_.bind(this);
  }

  get dom(): HTMLElement | null {
    return this.dom_;
  }

  /** The screen shown now (tests, later packages) */
  get currentScreen(): TerminalScreenId {
    return this.current_;
  }

  activate(): void {
    if (!this.dom_ || !document.contains(this.dom_)) {
      this.build_();
    }
    if (!this.dom_) {
      return;
    }
    this.dom_.style.display = '';
    if (!this.active_) {
      this.active_ = true;
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
    }
    this.sync_();
  }

  deactivate(): void {
    if (this.active_) {
      this.active_ = false;
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    }
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  dispose(): void {
    this.deactivate();
    this.resolveConfirm_(false);
    for (const { screen } of this.screens_.values()) {
      screen.dispose();
    }
    this.screens_.clear();
    for (const { el, fn } of this.navHandlers_) {
      el.removeEventListener('click', fn);
    }
    this.navHandlers_.length = 0;
    this.dom_?.remove();
    this.dom_ = null;
  }

  /** Show a screen by id (nav click, tests) */
  showScreen(id: TerminalScreenId): void {
    if (!this.runtime_ || !this.runtime_.skin.screens.includes(id)) {
      return;
    }
    this.current_ = id;
    this.ensureScreen_(id);
    this.sync_();
  }

  // ---- build ----------------------------------------------------------------

  private build_(): void {
    const container = document.getElementById(this.containerId_);
    if (!container) {
      return;
    }
    this.dom_?.remove();
    this.screens_.clear();
    const root = document.createElement('div') as unknown as HTMLElement;
    root.className = 'skylink-app d-flex';
    root.id = 'skylink-app-root';
    const navItems = (this.runtime_?.skin.screens ?? [])
      .map((id) => `<button type="button" class="list-group-item list-group-item-action" data-screen="${id}">${tr(`nav.${id}` as TerminalStringKey)}</button>`)
      .join('');
    root.innerHTML = `
      <nav class="skylink-nav list-group list-group-flush" aria-label="${tr('shell.nav.label')}"><div class="skylink-brand p-3 fw-bold">${tr('shell.title')}</div>${navItems}</nav>
      <main class="skylink-main flex-fill p-3">
        <div class="alert alert-warning" id="skylink-banner" role="status" hidden></div>
        <div id="skylink-blocked" hidden></div>
        <div id="skylink-screen"></div>
      </main>
      <div class="skylink-confirm" id="skylink-confirm" hidden role="dialog" aria-modal="true">
        <div class="card"><div class="card-body"><p id="skylink-confirm-text"></p>
          <div class="d-flex gap-2 justify-content-end"><button type="button" class="btn btn-secondary" id="skylink-confirm-no">${tr('confirm.cancel')}</button><button type="button" class="btn btn-danger" id="skylink-confirm-yes"></button></div></div></div>
      </div>`;
    container.appendChild(root);
    this.dom_ = root;
    for (const btn of root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const fn = (): void => this.showScreen(btn.dataset.screen as TerminalScreenId);
      btn.addEventListener('click', fn);
      this.navHandlers_.push({ el: btn, fn });
    }
    const yes = root.querySelector('#skylink-confirm-yes') as HTMLElement;
    const no = root.querySelector('#skylink-confirm-no') as HTMLElement;
    const yesFn = (): void => this.resolveConfirm_(true);
    const noFn = (): void => this.resolveConfirm_(false);
    yes.addEventListener('click', yesFn);
    no.addEventListener('click', noFn);
    this.navHandlers_.push({ el: yes, fn: yesFn }, { el: no, fn: noFn });
    this.ensureScreen_(this.current_);
  }

  private ensureScreen_(id: TerminalScreenId): void {
    if (!this.dom_ || !this.runtime_ || this.screens_.has(id)) {
      return;
    }
    const host = document.createElement('div') as unknown as HTMLElement;
    host.dataset.screenHost = id;
    host.hidden = true;
    (this.dom_.querySelector('#skylink-screen') as HTMLElement).appendChild(host);
    const ctx: TerminalScreenContext = {
      skin: this.runtime_.skin,
      model: this.runtime_.model,
      actions: this.runtime_,
      confirm: (message, label) => this.confirm_(message, label),
      refresh: () => this.sync_(),
    };
    const screen = this.factories_[id](ctx);
    screen.mount(host);
    this.screens_.set(id, { screen, host });
  }

  private confirm_(message: string, label: string): Promise<boolean> {
    this.resolveConfirm_(false);
    const dlg = this.dom_?.querySelector('#skylink-confirm') as HTMLElement;
    (this.dom_?.querySelector('#skylink-confirm-text') as HTMLElement).textContent = message;
    (this.dom_?.querySelector('#skylink-confirm-yes') as HTMLElement).textContent = label;
    dlg.hidden = false;

    return new Promise<boolean>((resolve) => {
      this.confirmResolve_ = resolve;
    });
  }

  private resolveConfirm_(ok: boolean): void {
    const dlg = this.dom_?.querySelector('#skylink-confirm') as HTMLElement | null;
    if (dlg) {
      dlg.hidden = true;
    }
    const resolve = this.confirmResolve_;
    this.confirmResolve_ = null;
    resolve?.(ok);
  }

  // ---- sync -----------------------------------------------------------------

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncMs_ < SYNC_INTERVAL_MS) {
      return;
    }
    this.lastSyncMs_ = now;
    this.sync_();
  }

  private sync_(): void {
    if (!this.dom_ || !this.runtime_) {
      return;
    }
    const view = this.runtime_.model.view();
    this.syncShell_(view);
    for (const [id, { screen, host }] of this.screens_) {
      const shown = id === this.current_ && view.link !== 'no-router';
      host.hidden = !shown;
      if (shown) {
        screen.sync(view);
      }
    }
    for (const btn of this.dom_.querySelectorAll<HTMLElement>('[data-screen]')) {
      btn.classList.toggle('active', btn.dataset.screen === this.current_);
    }
  }

  private syncShell_(view: TerminalView): void {
    const banner = this.dom_?.querySelector('#skylink-banner') as HTMLElement;
    const blocked = this.dom_?.querySelector('#skylink-blocked') as HTMLElement;
    if (view.link === 'no-router') {
      blocked.hidden = false;
      blocked.innerHTML = `<div class="card"><div class="card-body text-center py-5"><h2 class="mb-2">${tr('shell.noRouter.title')}</h2><div class="text-secondary">${tr('shell.noRouter.body')}</div></div></div>`;
      banner.hidden = true;

      return;
    }
    blocked.hidden = true;
    if (view.link === 'dish-unreachable') {
      const age = view.ageS === null ? '' : view.ageS < 60 ? tr('shell.updatedNow') : tr('shell.updatedAgo', { age: formatAge(view.ageS) });
      banner.hidden = false;
      banner.innerHTML = `<strong>${tr('shell.unreachable.title')}</strong> ${tr('shell.unreachable.body')} <span class="skylink-age">${age}</span>`;
    } else {
      banner.hidden = true;
    }
  }
}

/** Station tab factory */
export function createSkylinkDashboard(groundStation: GroundStation, containerId: string): AntennaPage {
  const runtime = TerminalRuntime.forStation(TerminalRuntime.arraySlice(groundStation.antennas));

  return new SkylinkDashboardPage(containerId, runtime);
}
