import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';

/**
 * GA4 measurement ID for app.signalrange.space.
 *
 * THIS IS THE ONE-LINE SWAP POINT: replace the placeholder with the real
 * measurement ID (e.g. 'G-XXXXXXXXXX') and analytics goes live. While the
 * placeholder is in place, nothing is loaded and nothing is sent.
 */
export const GA4_MEASUREMENT_ID: string = 'G-QNLH2DZXEK';

/** Sentinel meaning "not configured yet" — must never equal a real ID. */
const PLACEHOLDER_ID = 'G-PLACEHOLDER';

/**
 * Consent cookie shared with signalrange.space and docs.signalrange.space
 * (public/sr-consent.js in signal-range-home and signal-range-docs). Keep the
 * name, values and domain in step with that script.
 */
export const CONSENT_COOKIE = 'sr_analytics_consent';
const ONE_YEAR_S = 60 * 60 * 24 * 365;
const PRIVACY_URL = 'https://signalrange.space/privacy';

type ConsentChoice = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Opt-in GA4 gtag.js tagging for the SPA.
 *
 * Nothing loads until the visitor presses "Allow" on the consent banner (or
 * allowed it earlier on any signalrange.space site). The app is client-side
 * routed (see Router), so the automatic first page_view is suppressed
 * (`send_page_view: false`) and one page_view is emitted per ROUTE_CHANGED
 * event instead. The initial route also fires ROUTE_CHANGED during
 * Router.init(), so call Analytics.init() BEFORE App.create(); the latest path
 * is remembered so a page_view for it is sent the moment consent is granted.
 */
export class Analytics {
  private static isInitialized_ = false;
  private static gtag_: ((...args: unknown[]) => void) | null = null;
  private static currentPath_: string | null = null;
  private static banner_: HTMLDivElement | null = null;

  static init(): void {
    if (Analytics.isInitialized_) {
      return;
    }
    if (!GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID === PLACEHOLDER_ID) {
      // Measurement ID not configured yet: stay completely dark.
      return;
    }
    if (navigator.webdriver) {
      // Playwright and other automation: no banner over the UI, no traffic counted.
      return;
    }
    Analytics.isInitialized_ = true;

    EventBus.getInstance().on(Events.ROUTE_CHANGED, ({ path }) => {
      Analytics.currentPath_ = path;
      Analytics.sendPageView_();
    });

    const choice = Analytics.readChoice_();
    if (choice === 'granted') {
      Analytics.loadGtag_();
    } else if (choice === null) {
      Analytics.showBanner_();
    }
  }

  private static readChoice_(): ConsentChoice | null {
    const match = /(?:^|;\s*)sr_analytics_consent=(granted|denied)/u.exec(document.cookie);

    return match ? (match[1] as ConsentChoice) : null;
  }

  private static cookieDomain_(): string {
    const host = globalThis.location.hostname;

    return host === 'signalrange.space' || host.endsWith('.signalrange.space') ? '; Domain=.signalrange.space' : '';
  }

  private static writeChoice_(choice: ConsentChoice): void {
    const secure = globalThis.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${ONE_YEAR_S}; Path=/${Analytics.cookieDomain_()}; SameSite=Lax${secure}`;
  }

  private static loadGtag_(): void {
    if (Analytics.gtag_) {
      return;
    }
    window.dataLayer = window.dataLayer ?? [];
    // gtag.js requires Arguments objects on the dataLayer, so this must be a
    // plain function using `arguments`, not a rest-args push of an array.
    const gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: gtag.js requires a real Arguments object.
      window.dataLayer!.push(arguments);
    } as (...args: unknown[]) => void;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    Analytics.gtag_ = gtag;
    Analytics.sendPageView_();
  }

  private static sendPageView_(): void {
    if (!Analytics.gtag_ || Analytics.currentPath_ === null) {
      return;
    }
    Analytics.gtag_('event', 'page_view', {
      page_path: Analytics.currentPath_,
      page_location: globalThis.location.href,
      page_title: document.title,
    });
  }

  private static showBanner_(): void {
    const banner = document.createElement('div');
    banner.className = 'sr-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Analytics choice');
    banner.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;' +
      'padding:16px;border-radius:8px;background:#111827;color:#f3f4f6;border:1px solid #374151;' +
      'font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';

    const text = document.createElement('p');
    text.style.cssText = 'margin:0 0 12px';
    text.textContent = 'May we use Google Analytics to count visits and see which pages are used? It stays off unless you allow it. ';
    const link = document.createElement('a');
    link.href = PRIVACY_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Privacy policy';
    link.style.cssText = 'color:#93c5fd;text-decoration:underline';
    text.appendChild(link);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    const choices: [string, ConsentChoice][] = [
      ['Decline', 'denied'],
      ['Allow', 'granted'],
    ];
    for (const [label, choice] of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'min-width:96px;padding:8px 16px;border-radius:6px;border:1px solid #9ca3af;background:#1f2937;color:#f3f4f6;font:inherit;cursor:pointer';
      button.addEventListener('click', () => {
        Analytics.writeChoice_(choice);
        if (choice === 'granted') {
          Analytics.loadGtag_();
        }
        Analytics.banner_?.remove();
        Analytics.banner_ = null;
      });
      row.appendChild(button);
    }

    banner.append(text, row);
    document.body.appendChild(banner);
    Analytics.banner_ = banner;
  }
}
