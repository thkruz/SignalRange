import { badgeText, formatClock } from '@app/pages/mission-control/tabs/field-service-panel';
import type { ServiceModel } from '@app/physical/service-model';
import type { LayerStatus, ServiceLayer, ServiceSample } from '@app/physical/service-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './laptop-apps.css';

/**
 * PortalApp - A web browser on the laptop with each provider's customer portal (provider-portal evidence).
 *
 * Bookmarks open a service's portal. Each portal has two pages: Account (account layer) and Network
 * status (provider layer). Loading or reloading a page is one reading through the panel's `check`,
 * so it costs the same time as before. The page keeps showing what it loaded, with a banner once it
 * is out of date, the way a browser tab you left open would.
 */

type Check = (serviceId: string, layer: ServiceLayer) => ServiceSample | null;
type Page = 'account' | 'provider';
type Brand = 'skylink' | 'eurosat';

interface Tab {
  serviceId: string;
  page: Page;
}

const ACCOUNT_TEXT: Record<LayerStatus, { head: string; body: string }> = {
  up: { head: 'Active', body: 'Your subscription is active and in good standing.' },
  degraded: { head: 'Limited', body: 'Your service is limited on this account. See your plan details.' },
  down: { head: 'Not active', body: 'This account cannot use the service right now.' },
  unknown: { head: 'Unavailable', body: 'Account details could not be loaded.' },
};

const PROVIDER_TEXT: Record<LayerStatus, { head: string; body: string }> = {
  up: { head: 'All systems operational', body: 'No known problems in your area.' },
  degraded: { head: 'Degraded performance', body: 'Some customers in your area may see slower or interrupted service.' },
  down: { head: 'Service outage', body: 'There is an outage affecting your area. Engineers are working on it.' },
  unknown: { head: 'Status unavailable', body: 'The status page could not be loaded.' },
};

function brandOf(label: string): Brand {
  return label.toLowerCase().startsWith('skylink') ? 'skylink' : 'eurosat';
}

function hostFor(brand: Brand, page: Page): string {
  return brand === 'skylink'
    ? `account.skylink.example/${page === 'account' ? 'subscription' : 'status'}`
    : `portal.eurosat.example/${page === 'account' ? 'account' : 'network-status'}`;
}

export class PortalApp {
  private tab_: Tab | null = null;
  /** The reading each loaded page shows, by `serviceId|page` */
  private readonly loaded_ = new Map<string, string>();
  private loading_ = false;
  private builtKey_ = '';
  afterRun: (() => void) | null = null;

  constructor(
    private readonly host_: HTMLElement,
    private readonly check_: Check
  ) {
    this.host_.addEventListener('click', this.onClick_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
  }

  /** Navigate to a portal page and load it: one reading of that page's layer */
  open(serviceId: string, page: Page): ServiceSample | null {
    this.tab_ = { serviceId, page };
    const sample = this.check_(serviceId, page);
    if (sample) this.loaded_.set(`${serviceId}|${page}`, sample.id);

    return sample;
  }

  sync(model: ServiceModel, _nowS: number): void {
    if (this.tab_ && !model.getServiceIds().includes(this.tab_.serviceId)) this.tab_ = null;
    const key = `${model.getServiceIds().join('|')}#${this.tab_?.serviceId}:${this.tab_?.page}:${this.loading_}`;
    if (key !== this.builtKey_) {
      this.build_(model);
      this.builtKey_ = key;
    }
    this.patch_(model);
  }

  private build_(model: ServiceModel): void {
    const tab = this.tab_;
    const label = tab ? (model.getPath(tab.serviceId)?.label ?? tab.serviceId) : '';
    const brand = brandOf(label);
    const url = tab ? hostFor(brand, tab.page) : 'Search or enter address';
    const bookmarks = model
      .getServiceIds()
      .map((id) => {
        const l = model.getPath(id)?.label ?? id;
        const b = brandOf(l);
        return `<button type="button" class="pt-bookmark pt-bm-${b}" data-pt-open="${escapeHtml(id)}" data-pt-page="account"><span class="pt-favicon"></span>${escapeHtml(l)}</button>`;
      })
      .join('');
    const page = !tab
      ? `<div class="pt-newtab"><div class="pt-newtab-title">Bookmarks</div><div class="pt-tiles">${model
          .getServiceIds()
          .map((id) => {
            const l = model.getPath(id)?.label ?? id;
            const b = brandOf(l);
            return `<button type="button" class="pt-tile pt-bm-${b}" data-pt-open="${escapeHtml(id)}" data-pt-page="account"><span class="pt-tile-logo">${b === 'skylink' ? 'S' : 'E'}</span><span>${escapeHtml(l)}</span><small>${b === 'skylink' ? 'account.skylink.example' : 'portal.eurosat.example'}</small></button>`;
          })
          .join('')}</div></div>`
      : this.loading_
        ? `<div class="pt-site pt-${brand}"><div class="pt-loading"><span></span></div></div>`
        : `<div class="pt-site pt-${brand}">
            <header class="pt-site-head">
              <span class="pt-logo">${brand === 'skylink' ? 'SKYLINK' : 'EuroSat <i>Operator Portal</i>'}</span>
              <nav class="pt-site-nav">
                <button type="button" data-pt-open="${escapeHtml(tab.serviceId)}" data-pt-page="account" aria-current="${tab.page === 'account'}">Account</button>
                <button type="button" data-pt-open="${escapeHtml(tab.serviceId)}" data-pt-page="provider" aria-current="${tab.page === 'provider'}">Network status</button>
              </nav>
              <span class="pt-user">Field team · ${escapeHtml(label)}</span>
            </header>
            <div class="pt-stale" data-pt="stale" hidden></div>
            <main class="pt-body" data-pt-layer="${tab.page}">
              <h1>${tab.page === 'account' ? 'Your subscription' : 'Network status'}</h1>
              <div class="pt-card"><div class="pt-state"><span class="pt-light" data-pt="light"></span><span data-pt="head"></span></div><p data-pt="body"></p></div>
              <p class="pt-meta" data-pt="meta"></p>
            </main>
          </div>`;
    this.host_.innerHTML = `
      <div class="pt" data-laptop-surface="portal">
        <div class="pt-chrome">
          <button type="button" class="pt-nav" data-pt-home aria-label="Home" title="Home"><svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button>
          <button type="button" class="pt-nav" data-pt-reload aria-label="Reload" title="Reload" ${tab ? '' : 'disabled'}><svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
          <div class="pt-address">${tab ? '<svg viewBox="0 0 24 24" class="pt-lock"><rect x="6" y="11" width="12" height="9" rx="1.5" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' : ''}<span>${tab ? `https://${url}` : url}</span></div>
        </div>
        <div class="pt-bookmarks" aria-label="Bookmarks">${bookmarks}</div>
        <div class="pt-viewport">${page}</div>
      </div>`;
  }

  private patch_(model: ServiceModel): void {
    const tab = this.tab_;
    if (!tab || this.loading_) return;
    const id = this.loaded_.get(`${tab.serviceId}|${tab.page}`);
    const sample = id ? model.samplesFor(tab.serviceId).find((s) => s.id === id) : undefined;
    const status: LayerStatus = sample && typeof sample.value === 'string' ? sample.value : 'unknown';
    const text = (tab.page === 'account' ? ACCOUNT_TEXT : PROVIDER_TEXT)[status];
    this.setText_('head', sample ? text.head : 'Not loaded');
    this.setText_('body', sample ? text.body : 'Press reload to load this page.');
    const light = this.host_.querySelector<HTMLElement>('[data-pt="light"]');
    const cls = `pt-light pt-l-${sample ? status : 'unknown'}`;
    if (light && light.className !== cls) light.className = cls;
    const freshness = sample ? model.freshness(sample) : null;
    this.setText_('meta', sample ? `Page loaded at ${formatClock(sample.tS)}.` : '');
    const stale = this.host_.querySelector<HTMLElement>('[data-pt="stale"]');
    if (stale) {
      const why = sample && freshness === 'invalidated' ? model.invalidation(sample) : null;
      const out = sample && freshness && freshness !== 'current';
      const msg = out
        ? `${badgeText({ sample, freshness, invalidatedWhy: why ? (why.kind === 'event' ? `${why.label} at ${formatClock(why.atS)}` : `equipment or settings changed at ${formatClock(why.atS)}`) : undefined })}. This page may be out of date. Reload to check again.`
        : '';
      if (stale.textContent !== msg) stale.textContent = msg;
      stale.hidden = !out;
    }
  }

  private setText_(key: string, text: string): void {
    const el = this.host_.querySelector<HTMLElement>(`[data-pt="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private navigate_(serviceId: string, page: Page): void {
    if (this.loading_) return;
    this.tab_ = { serviceId, page };
    this.loading_ = true;
    this.afterRun?.();
    window.setTimeout(() => {
      this.loading_ = false;
      this.open(serviceId, page);
      this.afterRun?.();
    }, 700);
  }

  private readonly onClick_ = (e: Event): void => {
    const t = e.target as HTMLElement;
    const open = t.closest<HTMLElement>('[data-pt-open]');
    if (open) {
      this.navigate_(open.dataset.ptOpen!, open.dataset.ptPage as Page);
      return;
    }
    if (t.closest('[data-pt-reload]') && this.tab_) {
      this.navigate_(this.tab_.serviceId, this.tab_.page);
      return;
    }
    if (t.closest('[data-pt-home]')) {
      this.tab_ = null;
      this.afterRun?.();
    }
  };
}
