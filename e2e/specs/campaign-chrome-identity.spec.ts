import { expect, Page, test } from '@playwright/test';
import { dismissDialogIfPresent, waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Chrome identity across all five campaigns.
 *
 * Every campaign runs the same engine and the same components; what separates
 * them is a body class and the CSS hanging off it. That makes the whole thing
 * invisible to unit tests and easy to break from a distance - phase 8 shipped
 * with the command bar frozen to Campaign 1's grey because a token resolved
 * where it was declared instead of where it was used, and screenshots did not
 * catch it (a dark grey bar on a dark blue body looks plausible).
 *
 * So this asserts resolved values and geometry, not appearance:
 *
 * - `standard` (C1, C2) - identity/clock lead the bar, readable clock,
 *                         hairline panels
 * - `sdr`      (C3)     - same layout, monospace chrome, cyan accent
 * - `astro`    (C4, C5) - Astro UXDS console: year/day-of-year clock,
 *                         classification bands top and bottom, Roboto chrome
 *                         (not condensed), hairline panels, identity left
 *
 * Two things stay put in every variant and are asserted as such: the asset tree
 * on the left and the tab strip above the canvas. Both were mirrored/moved in
 * earlier revisions and both read as a broken build rather than a different
 * system - they are navigation, and novelty there costs orientation.
 *
 * C4 and C5 must agree on every structural value and differ only in hue; C1
 * and C2 likewise. That relationship is the point of the feature, so it is
 * asserted directly at the end rather than left to inspection.
 */

interface ChromeProbe {
  bodyClasses: string[];
  /** Asset tree stays left of the canvas in every variant */
  sidebarIsLeftOfCanvas: boolean;
  /** Identity/clock block sits to the right of the timers (tactical) */
  commandBarMirrored: boolean;
  /** Tab strip sits below the canvas content */
  tabsBelowContent: boolean;
  /** Satellites section is painted above the ground stations section */
  satellitesAboveStations: boolean;
  clock: string;
  objectiveTimerLabel: string;
  accent: string;
  barBg: string;
  faceplateBg: string;
  chromeFont: string;
  panelBorderWidth: string;
  classificationTop: string | null;
  classificationBottom: string | null;
  classificationBg: string;
}

const CAMPAIGNS = {
  nats: { scenario: 'nats-sandbox', variant: 'standard' },
  'nats-eu': { scenario: 'nats-eu-sandbox', variant: 'standard' },
  'ham-sdr': { scenario: 'ham-sdr-sandbox', variant: 'sdr' },
  ccs: { scenario: 'ccs-scenario1', variant: 'astro' },
  'signal-hunter': { scenario: 'signal-hunter-sandbox', variant: 'astro' },
} as const;

type CampaignId = keyof typeof CAMPAIGNS;

async function probeChrome(page: Page): Promise<ChromeProbe> {
  return page.evaluate(() => {
    const box = (selector: string): DOMRect | null =>
      document.querySelector(selector)?.getBoundingClientRect() ?? null;

    const sidebar = box('#asset-tree-sidebar-container');
    const canvas = box('#tabbed-canvas-container');
    const tabBar = box('#tab-bar');
    const content = box('#canvas-content');
    const satellites = box('.asset-group-satellites');
    const stations = box('.asset-group-stations');
    const barLeft = box('.command-bar-left');
    const barRight = box('.command-bar-right');

    const styles = getComputedStyle(document.body);
    const read = (name: string): string => styles.getPropertyValue(name).trim();

    const header = document.querySelector('.app-shell-header');
    const card = document.querySelector('.card');

    // The classification bands are ::before/::after on the page, so there is
    // no element to query - only the pseudo-element's computed style.
    const page = document.querySelector('.app-shell-page') as Element;
    const top = getComputedStyle(page, '::before');
    const bottom = getComputedStyle(page, '::after');

    return {
      bodyClasses: [...document.body.classList],
      sidebarIsLeftOfCanvas: !!sidebar && !!canvas && sidebar.x < canvas.x,
      commandBarMirrored: !!barLeft && !!barRight && barLeft.x > barRight.x,
      tabsBelowContent: !!tabBar && !!content && tabBar.y > content.y,
      satellitesAboveStations: !!satellites && !!stations && satellites.y < stations.y,
      clock: document.querySelector('#utc-clock')?.textContent?.trim() ?? '',
      objectiveTimerLabel:
        document.querySelector('#objective-timer-display .timer-label')?.textContent?.trim() ?? '',
      accent: read('--mc-accent-red'),
      barBg: header ? getComputedStyle(header).backgroundColor : '',
      faceplateBg: read('--mc-equip-panel-raised'),
      chromeFont: header ? getComputedStyle(header).fontFamily : '',
      panelBorderWidth: card ? getComputedStyle(card).borderTopWidth : '',
      classificationTop: top.content === 'none' ? null : top.content,
      classificationBottom: bottom.content === 'none' ? null : bottom.content,
      classificationBg: bottom.backgroundColor,
    };
  });
}

const probes = new Map<CampaignId, ChromeProbe>();

test.describe('Campaign chrome identity', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  for (const [campaignId, { scenario, variant }] of Object.entries(CAMPAIGNS)) {
    test(`${campaignId} wears the ${variant} chrome`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { AUTO_CLOSE_DIALOGS: boolean }).AUTO_CLOSE_DIALOGS = true;
        localStorage.clear();
        sessionStorage.clear();
      });

      await page.goto(`/campaigns/${campaignId}/scenarios/${scenario}`);
      await waitForSimulationReady(page);
      await dismissDialogIfPresent(page);

      const probe = await probeChrome(page);
      probes.set(campaignId as CampaignId, probe);

      expect(probe.bodyClasses).toContain(`campaign-${campaignId}`);
      expect(probe.bodyClasses).toContain(`chrome-${variant}`);

      // Accent and faceplates must actually resolve - an unset custom property
      // reads as an empty string, which is how a whole theme goes missing.
      expect(probe.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(probe.faceplateBg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(probe.barBg).not.toBe('rgba(0, 0, 0, 0)');

      // Navigation does not move between variants: rail left, tabs on top.
      expect(probe.sidebarIsLeftOfCanvas).toBe(true);
      expect(probe.tabsBelowContent).toBe(false);

      if (variant === 'astro') {
        // The TASK/MSN clocks lead the bar (time remaining first - the same
        // operational ordering that puts satellites above stations), so the
        // identity block paints to the right of the timers.
        expect(probe.commandBarMirrored).toBe(true);
        expect(probe.satellitesAboveStations).toBe(true);
        // `2027 074 22:05:15` - year, day-of-year, UTC
        expect(probe.clock).toMatch(/^\d{4} \d{3} \d{2}:\d{2}:\d{2}$/);
        expect(probe.objectiveTimerLabel).toBe('TASK');
        expect(probe.chromeFont).toContain('Roboto');
        expect(probe.chromeFont).not.toContain('Roboto Condensed');
        expect(probe.panelBorderWidth).toBe('1px');
        // Banded top and bottom in ladder colors with deliberately fictional
        // wording (nothing here is a real marking): C4 wears the Top Secret
        // style as "G14 CLASSIFIED", C5 the Secret style as "SPECIAL
        // PROGRAM". The color must not follow the campaign accent.
        const marking = campaignId === 'ccs'
          ? { text: 'G14 CLASSIFIED', bg: 'rgb(255, 140, 0)' }
          : { text: 'SPECIAL PROGRAM', bg: 'rgb(200, 16, 46)' };

        expect(probe.classificationTop).toContain(marking.text);
        expect(probe.classificationBottom).toContain(marking.text);
        expect(probe.classificationBg).toBe(marking.bg);
      } else {
        expect(probe.commandBarMirrored).toBe(false);
        expect(probe.satellitesAboveStations).toBe(false);
        // `15 MAR 2027 22:05:15`
        expect(probe.clock).toMatch(/^\d{2} [A-Z]{3} \d{4} \d{2}:\d{2}:\d{2}$/);
        expect(probe.objectiveTimerLabel).toBe('OBJECTIVE');
        expect(probe.panelBorderWidth).toBe('1px');
        expect(probe.classificationTop).toBeNull();
        expect(probe.classificationBottom).toBeNull();
      }

      if (variant === 'sdr') {
        expect(probe.chromeFont).toMatch(/mono/i);
      }
    });
  }

  test('siblings share structure and differ only in hue', () => {
    const structural = (p: ChromeProbe) => ({
      commandBarMirrored: p.commandBarMirrored,
      satellitesAboveStations: p.satellitesAboveStations,
      objectiveTimerLabel: p.objectiveTimerLabel,
      chromeFont: p.chromeFont,
      panelBorderWidth: p.panelBorderWidth,
      // The wording is campaign flavor (G14 CLASSIFIED vs SPECIAL PROGRAM);
      // what is structural is that the bands exist at all.
      hasClassificationBands: p.classificationTop !== null && p.classificationBottom !== null,
    });

    const nats = probes.get('nats')!;
    const natsEu = probes.get('nats-eu')!;
    const ccs = probes.get('ccs')!;
    const signalHunter = probes.get('signal-hunter')!;

    // Two facilities of one operator
    expect(structural(natsEu)).toEqual(structural(nats));
    expect(natsEu.accent).not.toBe(nats.accent);

    // Two squadrons of one service
    expect(structural(signalHunter)).toEqual(structural(ccs));
    expect(signalHunter.accent).not.toBe(ccs.accent);

    // ...and the two pairs are not the same system
    expect(structural(ccs)).not.toEqual(structural(nats));
  });
});
