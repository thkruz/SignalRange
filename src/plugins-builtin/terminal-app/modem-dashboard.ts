/**
 * @file modem-dashboard - The EuroSat modem station tab (Campaign 6, package G)
 * @description A small operator page beside the SkyLink app: Status, Speed test, History and Restart. Only what
 * has a model behind it is shown; there are no pointing, frequency or commissioning controls. States follow the
 * SkyLink rules: laptop off shows a "cannot connect" panel; modem unreachable shows the last data under a banner.
 * The page has its own DOM ids (`eurosat-*`) so both terminals can be open together.
 */
import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { AntennaPage } from '@app/pages/mission-control/antenna-page-registry';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { JITTER_WINDOW_S } from '@app/physical/rtt-jitter';
import type { ModemHistoryEvent, ModemView } from './modem-app-model';
import { MODEM_APP_VERBS, MODEM_SCREENS, ModemRuntime, type ModemScreenId } from './modem-runtime';
import { beginSpeedTest, finishSpeedTest, type PendingSpeedTest, SPEED_TEST_WINDOW_S } from './screens/speed-test-screen';
import { formatAge, type ModemStringKey, trModem as tr } from './strings';
import './skylink-app.css';

export const EUROSAT_TAB_ID = 'eurosat-app';
export const EUROSAT_TAB_LABEL = 'EuroSat';

const SYNC_INTERVAL_MS = 1000;

const mbps = (v: number): string => tr('status.unitMbps', { value: v >= 100 ? Math.round(v) : v.toFixed(1) });
const ms = (v: number | null): string => (v === null ? tr('status.unavailable') : tr('status.unitMs', { value: v.toFixed(v < 10 ? 1 : 0) }));

export class ModemDashboardPage implements AntennaPage {
  readonly tabLabel = EUROSAT_TAB_LABEL;

  private dom_: HTMLElement | null = null;
  private readonly boundUpdate_: () => void;
  private readonly handlers_: Array<{ el: Element; fn: EventListener }> = [];
  private current_: ModemScreenId = 'status';
  private active_ = false;
  private lastSyncMs_ = 0;
  private confirmResolve_: ((ok: boolean) => void) | null = null;
  private pending_: PendingSpeedTest | null = null;
  private speedFailed_ = false;
  private restartNote_ = '';

  constructor(
    private readonly containerId_: string,
    private readonly runtime_: ModemRuntime | null
  ) {
    this.boundUpdate_ = this.throttledSync_.bind(this);
  }

  get dom(): HTMLElement | null {
    return this.dom_;
  }

  get currentScreen(): ModemScreenId {
    return this.current_;
  }

  activate(): void {
    if (!this.dom_ || !document.contains(this.dom_)) {
      this.build_();
    }
    if (!this.dom_) {
      return;
    }
    this.dom_.style.removeProperty('display');
    if (!this.active_) {
      this.active_ = true;
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
    }
    this.sync_();
    this.runtime_?.evidence.viewScreen(this.current_);
  }

  deactivate(): void {
    if (this.active_) {
      this.active_ = false;
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    }
    if (this.dom_) {
      this.dom_.style.setProperty('display', 'none', 'important');
    }
  }

  dispose(): void {
    this.deactivate();
    this.resolveConfirm_(false);
    for (const { el, fn } of this.handlers_) {
      el.removeEventListener('click', fn);
    }
    this.handlers_.length = 0;
    this.dom_?.remove();
    this.dom_ = null;
  }

  showScreen(id: ModemScreenId): void {
    if (!this.runtime_ || !MODEM_SCREENS.includes(id)) {
      return;
    }
    this.current_ = id;
    this.sync_();
    this.runtime_.evidence.viewScreen(id);
  }

  // ---- build ----------------------------------------------------------------

  private build_(): void {
    const container = document.getElementById(this.containerId_);
    if (!container) {
      return;
    }
    this.dom_?.remove();
    const root = document.createElement('div') as unknown as HTMLElement;
    root.className = 'skylink-app eurosat-app d-flex';
    root.id = 'eurosat-app-root';
    const navItems = MODEM_SCREENS.map(
      (id) =>
        `<button type="button" class="list-group-item list-group-item-action" data-eurosat-screen="${id}">${tr(`nav.${id === 'speed-test' ? 'speed' : id}` as ModemStringKey)}</button>`
    ).join('');
    root.innerHTML = `
      <nav class="skylink-nav list-group list-group-flush" aria-label="${tr('nav.label')}"><div class="skylink-brand p-3 fw-bold">${tr('title')}</div>${navItems}</nav>
      <main class="skylink-main flex-fill p-3">
        <div class="alert alert-warning" id="eurosat-banner" role="status" hidden></div>
        <div id="eurosat-blocked" hidden></div>
        <div id="eurosat-screen"></div>
      </main>
      <div class="skylink-confirm" id="eurosat-confirm" hidden role="dialog" aria-modal="true">
        <div class="card"><div class="card-body"><p id="eurosat-confirm-text"></p>
          <div class="d-flex gap-2 justify-content-end"><button type="button" class="btn btn-secondary" id="eurosat-confirm-no">${tr('confirm.cancel')}</button><button type="button" class="btn btn-danger" id="eurosat-confirm-yes"></button></div></div></div>
      </div>`;
    container.appendChild(root);
    this.dom_ = root;
    for (const btn of root.querySelectorAll<HTMLElement>('[data-eurosat-screen]')) {
      this.listen_(btn, () => this.showScreen(btn.dataset.eurosatScreen as ModemScreenId));
    }
    this.listen_(root.querySelector('#eurosat-confirm-yes') as HTMLElement, () => this.resolveConfirm_(true));
    this.listen_(root.querySelector('#eurosat-confirm-no') as HTMLElement, () => this.resolveConfirm_(false));
    // Screen buttons are delegated so a re-render never loses a click handler
    this.listen_(root.querySelector('#eurosat-screen') as HTMLElement, (e) => {
      const id = (e.target as HTMLElement | null)?.closest('button')?.id;
      if (id === 'eurosat-speed-start') {
        this.startSpeedTest_();
      } else if (id === 'eurosat-restart-button') {
        void this.restart_();
      }
    });
  }

  private listen_(el: Element, fn: EventListener): void {
    el.addEventListener('click', fn);
    this.handlers_.push({ el, fn });
  }

  private confirm_(message: string, label: string): Promise<boolean> {
    this.resolveConfirm_(false);
    const dlg = this.dom_?.querySelector('#eurosat-confirm') as HTMLElement;
    (this.dom_?.querySelector('#eurosat-confirm-text') as HTMLElement).textContent = message;
    (this.dom_?.querySelector('#eurosat-confirm-yes') as HTMLElement).textContent = label;
    dlg.hidden = false;

    return new Promise<boolean>((resolve) => {
      this.confirmResolve_ = resolve;
    });
  }

  private resolveConfirm_(ok: boolean): void {
    const dlg = this.dom_?.querySelector('#eurosat-confirm') as HTMLElement | null;
    if (dlg) {
      dlg.hidden = true;
    }
    const resolve = this.confirmResolve_;
    this.confirmResolve_ = null;
    resolve?.(ok);
  }

  // ---- actions --------------------------------------------------------------

  private backend_(): { runner: NonNullable<ReturnType<typeof PhysicalPlantService.workloadsOrNull>>; serviceId: string } | null {
    const runner = PhysicalPlantService.workloadsOrNull();
    const serviceId = this.runtime_?.model.serviceId();

    return runner && serviceId ? { runner, serviceId } : null;
  }

  private startSpeedTest_(): void {
    const backend = this.backend_();
    if (!backend || this.pending_ || this.runtime_?.model.view().link !== 'connected') {
      return;
    }
    this.speedFailed_ = false;
    this.pending_ = beginSpeedTest(backend);
    if (!this.pending_) {
      this.speedFailed_ = true;
      this.runtime_?.evidence.action('speed-test', MODEM_APP_VERBS.speedTest, 'Ran a speed test in the EuroSat modem interface; it did not finish.');
    }
    this.settleSpeedTest_();
    this.sync_();
  }

  private settleSpeedTest_(): void {
    const backend = this.backend_();
    if (!this.pending_ || !this.runtime_) {
      return;
    }
    if (!backend) {
      this.pending_ = null;
      this.speedFailed_ = true;

      return;
    }
    const result = finishSpeedTest(backend, this.runtime_.model, this.pending_);
    if (result === 'running') {
      return;
    }
    this.pending_ = null;
    this.speedFailed_ = result === null;
    if (result) this.runtime_.evidence.sampleJitter();
    this.runtime_.evidence.action(
      'speed-test',
      MODEM_APP_VERBS.speedTest,
      result
        ? `Ran a speed test in the EuroSat modem interface: ${Math.round(result.downMbps)} down, ${Math.round(result.upMbps)} up Mbps, jitter ${typeof result.jitterMs === 'number' ? `${result.jitterMs.toFixed(1)} ms` : 'unavailable'}.`
        : 'Ran a speed test in the EuroSat modem interface; it did not finish.'
    );
  }

  private async restart_(): Promise<void> {
    if (!this.runtime_ || this.runtime_.model.view().link !== 'connected') {
      return;
    }
    if (!(await this.confirm_(tr('restart.confirm'), tr('restart.confirmButton')))) {
      return;
    }
    const result = this.runtime_.restartModem();
    const started = (result.downtimeSeconds ?? 1) > 0;
    this.restartNote_ = started ? tr('restart.done') : tr('restart.failed');
    this.runtime_.evidence.action(
      'restart',
      'app-eurosat-restart',
      started ? 'Restarted the modem from the EuroSat modem interface.' : 'Tried to restart the modem from the EuroSat modem interface; it did not start.'
    );
    this.sync_();
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
    if (this.pending_) {
      this.settleSpeedTest_();
    }
    const view = this.runtime_.model.view();
    this.syncShell_(view);
    const host = this.dom_.querySelector('#eurosat-screen') as HTMLElement;
    host.hidden = view.link === 'no-laptop';
    if (!host.hidden) {
      const html = this.render_(view);
      if (host.dataset.html !== html) {
        host.dataset.html = html;
        host.innerHTML = html;
      }
    }
    for (const btn of this.dom_.querySelectorAll<HTMLElement>('[data-eurosat-screen]')) {
      btn.classList.toggle('active', btn.dataset.eurosatScreen === this.current_);
    }
  }

  private syncShell_(view: ModemView): void {
    const banner = this.dom_?.querySelector('#eurosat-banner') as HTMLElement;
    const blocked = this.dom_?.querySelector('#eurosat-blocked') as HTMLElement;
    if (view.link === 'no-laptop') {
      blocked.hidden = false;
      blocked.innerHTML = `<div class="card skylink-noroute"><div class="card-body text-center py-5"><h2 class="mb-2 skylink-noroute-title">${tr('noLaptop.title')}</h2><div class="skylink-noroute-body">${tr('noLaptop.body')}</div></div></div>`;
      banner.hidden = true;

      return;
    }
    blocked.hidden = true;
    if (view.link === 'modem-unreachable') {
      const age = view.ageS === null ? '' : view.ageS < 60 ? tr('updatedNow') : tr('updatedAgo', { age: formatAge(view.ageS) });
      banner.hidden = false;
      banner.innerHTML = `<strong>${tr('unreachable.title')}</strong> ${tr(view.ageS === null ? 'unreachable.bodyEmpty' : 'unreachable.body')} <span class="skylink-age">${age}</span>`;
    } else {
      banner.hidden = true;
    }
  }

  private render_(view: ModemView): string {
    switch (this.current_) {
      case 'status':
        return this.renderStatus_(view);
      case 'speed-test':
        return this.renderSpeed_(view);
      case 'history':
        return this.renderHistory_(view);
      default:
        return this.renderRestart_(view);
    }
  }

  private card_(title: string, body: string): string {
    return `<div class="card mb-3"><div class="card-header"><h3 class="card-title">${title}</h3></div><div class="card-body">${body}</div></div>`;
  }

  private cell_(label: string, value: string, id: string): string {
    return `<div class="col-6 col-md-3"><div class="text-secondary small">${label}</div><div class="h3 mb-0 font-monospace" id="${id}">${value}</div></div>`;
  }

  private renderStatus_(view: ModemView): string {
    const d = view.data;
    if (!d) {
      return this.card_(tr('status.registration'), `<span class="text-secondary">${tr('noData')}</span>`);
    }
    const hero = d.hero === 'registered' ? tr('status.registered') : d.hero === 'account-refused' ? tr('status.accountRefused') : tr('status.notRegistered');
    const pct = (v: number | null): string => (v === null ? tr('status.unavailable') : tr('status.unitPct', { value: v.toFixed(1) }));
    const registered = d.hero !== 'not-registered';

    return (
      this.card_(tr('status.registration'), `<div class="h2 mb-0" id="eurosat-hero">${hero}</div>`) +
      this.card_(
        tr('title'),
        `<div class="row g-3">
          ${this.cell_(tr('status.download'), registered ? mbps(d.downMbps) : tr('status.unavailable'), 'eurosat-down')}
          ${this.cell_(tr('status.upload'), registered ? mbps(d.upMbps) : tr('status.unavailable'), 'eurosat-up')}
          ${this.cell_(tr('status.delay'), ms(d.latencyMs), 'eurosat-delay')}
          ${this.cell_(tr('status.loss'), pct(d.lossPct), 'eurosat-loss')}
          ${this.cell_(tr('status.jitter'), ms(d.jitterMs), 'eurosat-jitter')}
          ${this.cell_(tr('status.power'), tr('status.unitW', { value: Math.round(d.powerW) }), 'eurosat-power')}
          ${this.cell_(tr('status.uptime'), formatAge(d.uptimeS), 'eurosat-uptime')}
          ${this.cell_(tr('status.restarts'), String(d.restartCount), 'eurosat-restarts')}
        </div>
        <div class="text-secondary small mt-2">${tr('status.jitterNote', { seconds: JITTER_WINDOW_S })}</div>`
      )
    );
  }

  private renderSpeed_(view: ModemView): string {
    const model = this.runtime_?.model;
    const connected = view.link === 'connected';
    const busy = this.pending_ !== null;
    const tests = model?.speedTests() ?? [];
    const last = tests[tests.length - 1];
    const jitter = (v: number | null | undefined): string => (typeof v === 'number' ? ms(v) : tr('speed.jitterUnavailable'));
    const nowS = model?.nowS() ?? 0;
    const progress = this.pending_
      ? tr('speed.progress', {
          done: Math.min(Math.round(this.pending_.endS - this.pending_.startS), Math.max(0, Math.round(nowS - this.pending_.startS))),
          total: Math.round(this.pending_.endS - this.pending_.startS),
        })
      : '';
    const start = this.card_(
      tr('speed.title'),
      `<p class="text-secondary">${tr('speed.body', { seconds: SPEED_TEST_WINDOW_S })}</p>
       <button type="button" class="btn btn-primary" id="eurosat-speed-start"${!connected || busy ? ' disabled' : ''}>${busy ? tr('speed.running') : tr('speed.start')}</button>
       <div class="text-secondary mt-2" id="eurosat-speed-progress">${progress}</div>
       <div class="text-secondary mt-2">${connected ? '' : tr('speed.disabled')}</div>
       <div class="text-danger mt-2">${this.speedFailed_ ? tr('speed.failed') : ''}</div>`
    );
    const result = this.card_(
      tr('speed.result'),
      last
        ? `<div class="row g-3">
            ${this.cell_(tr('speed.download'), mbps(last.downMbps), 'eurosat-speed-down')}
            ${this.cell_(tr('speed.upload'), mbps(last.upMbps), 'eurosat-speed-up')}
            ${this.cell_(tr('speed.latency'), ms(last.latencyMs), 'eurosat-speed-lat')}
            ${this.cell_(tr('speed.jitter'), jitter(last.jitterMs), 'eurosat-speed-jitter')}
          </div>
          <div class="text-secondary small mt-2">${tr('status.jitterNote', { seconds: JITTER_WINDOW_S })}</div>`
        : `<span class="text-secondary">${tr('speed.noResult')}</span>`
    );
    const earlier =
      tests.length > 1
        ? `<div class="card"><div class="card-header"><h3 class="card-title">${tr('speed.history')}</h3></div><div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr><th></th><th>${tr('speed.download')}</th><th>${tr('speed.upload')}</th><th>${tr('speed.latency')}</th><th>${tr('speed.jitter')}</th></tr></thead><tbody>${[
            ...tests,
          ]
            .slice(0, -1)
            .reverse()
            .map(
              (t) =>
                `<tr><td>${tr('speed.ago', { age: formatAge(Math.max(0, nowS - t.tS)) })}</td><td>${mbps(t.downMbps)}</td><td>${mbps(t.upMbps)}</td><td>${ms(t.latencyMs)}</td><td>${jitter(t.jitterMs)}</td></tr>`
            )
            .join('')}</tbody></table></div></div>`
        : '';

    return start + result + earlier;
  }

  private renderHistory_(view: ModemView): string {
    const events: ModemHistoryEvent[] = view.data ? [...view.data.history].reverse() : [];
    if (!view.data) {
      return this.card_(tr('history.title'), `<span class="text-secondary">${tr('noData')}</span>`);
    }
    const rows = events
      .map(
        (h) =>
          `<tr data-kind="${h.kind}" data-reason="${h.reason}"><td class="font-monospace">${formatAge(h.tS)}</td><td>${h.kind === 'lost' ? tr('history.lost') : tr('history.restored')}</td><td>${tr(`history.reason.${h.reason}` as ModemStringKey)}</td></tr>`
      )
      .join('');

    return `<div class="card"><div class="card-header"><h3 class="card-title">${tr('history.title')}</h3></div><div class="card-body"><p class="text-secondary mb-0">${tr('history.intro')}</p></div>${
      events.length > 0
        ? `<div class="table-responsive"><table class="table table-vcenter card-table" id="eurosat-history"><thead><tr><th>${tr('history.time')}</th><th>${tr('history.event')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="card-body text-secondary">${tr('history.empty')}</div>`
    }</div>`;
  }

  private renderRestart_(view: ModemView): string {
    const connected = view.link === 'connected';

    return this.card_(
      tr('restart.title'),
      `<p class="text-secondary">${tr('restart.body')}</p>
       <button type="button" class="btn btn-danger" id="eurosat-restart-button"${connected ? '' : ' disabled'}>${tr('restart.button')}</button>
       <div class="text-secondary mt-2" id="eurosat-restart-note">${connected ? this.restartNote_ : tr('restart.disabled')}</div>`
    );
  }
}

/** Station tab factory */
export function createModemDashboard(_groundStation: GroundStation, containerId: string): AntennaPage {
  return new ModemDashboardPage(containerId, ModemRuntime.forStation());
}
