import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Analytics keeps static state, so each test imports a fresh copy of it and
// of the EventBus singleton it subscribes to.
async function loadModules() {
  vi.resetModules();
  const { Analytics } = await import('../src/analytics');
  const { EventBus } = await import('../src/events/event-bus');
  const { Events } = await import('../src/events/events');

  return { Analytics, EventBus, Events };
}

function gtagScript(): HTMLScriptElement | null {
  return document.head.querySelector('script[src*="googletagmanager.com/gtag/js"]');
}

function banner(): HTMLElement | null {
  return document.querySelector('.sr-consent-banner');
}

function clickButton(label: string): void {
  const button = [...(banner()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
  button!.click();
}

describe('Analytics consent', () => {
  beforeEach(() => {
    document.cookie = 'sr_analytics_consent=; Max-Age=0; Path=/';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.dataLayer;
  });

  afterEach(async () => {
    const { EventBus } = await import('../src/events/event-bus');
    EventBus.destroy();
  });

  it('loads nothing and asks when no choice has been made', async () => {
    const { Analytics } = await loadModules();
    Analytics.init();

    expect(gtagScript()).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(banner()).not.toBeNull();
  });

  it('stays dark under browser automation so e2e runs see no banner', async () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => true });
    const { Analytics } = await loadModules();
    Analytics.init();
    delete (navigator as { webdriver?: boolean }).webdriver;

    expect(gtagScript()).toBeNull();
    expect(banner()).toBeNull();
  });

  it('declining stores the choice and never loads gtag.js', async () => {
    const { Analytics, EventBus, Events } = await loadModules();
    Analytics.init();
    clickButton('Decline');
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path: '/campaigns' });

    expect(document.cookie).toContain('sr_analytics_consent=denied');
    expect(gtagScript()).toBeNull();
    expect(banner()).toBeNull();
  });

  it('allowing loads gtag.js and sends the current route as a page_view', async () => {
    const { Analytics, EventBus, Events } = await loadModules();
    Analytics.init();
    EventBus.getInstance().emit(Events.ROUTE_CHANGED, { path: '/campaigns' });
    clickButton('Allow');

    expect(document.cookie).toContain('sr_analytics_consent=granted');
    expect(gtagScript()).not.toBeNull();
    const pageViews = (window.dataLayer ?? []).filter((entry) => (entry as IArguments)[1] === 'page_view');
    expect(pageViews).toHaveLength(1);
    expect((pageViews[0] as IArguments)[2]).toMatchObject({ page_path: '/campaigns' });
  });

  it('an earlier "Allow" loads gtag.js without asking again', async () => {
    document.cookie = 'sr_analytics_consent=granted; Path=/';
    const { Analytics } = await loadModules();
    Analytics.init();

    expect(gtagScript()).not.toBeNull();
    expect(banner()).toBeNull();
    const config = (window.dataLayer ?? []).find((entry) => (entry as IArguments)[0] === 'config') as IArguments;
    expect(config[2]).toMatchObject({ allow_google_signals: false, allow_ad_personalization_signals: false });
  });
});
