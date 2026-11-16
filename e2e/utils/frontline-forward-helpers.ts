import { expect, type Page } from '@playwright/test';
import { activate, closeCloseup, goInside, goToPartFromSheet, isShown, plantInspect, setPanelOpen } from './frontline-helpers';

/**
 * Extra UI drivers for the forward site (S9+) that the camp helpers do not cover:
 * the Records and notices panel (accept a delivered unit) and the Service paths
 * diagram (select nodes, Record selection). Same rules as frontline-helpers.ts:
 * real clicks only, never force:true.
 */

/** Records and notices: press "Initial here" for a delivered unit. Returns the panel message. */
export async function recordsAcceptUnit(page: Page, unitId: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Records and notices/u, true);
  const unit = d.locator(`[data-frp-unit="${unitId}"]`);
  await expect(unit, `unit ${unitId} listed in Records and notices`).toBeVisible();
  await activate(page, unit.locator('button[data-rp-act="accept"]'), `accept unit ${unitId}`);
  await expect(d.locator(`[data-frp="accepted-${unitId}"]`), `unit ${unitId} accepted`).toBeVisible();
  const msg = (await d.locator('[data-frp="msg"]').innerText()).trim();
  await setPanelOpen(page, /Records and notices/u, false);

  return msg;
}

/** Records and notices: the unit table text (for QA reading) */
export async function readUnitTable(page: Page, unitId: string): Promise<string> {
  const d = await setPanelOpen(page, /Records and notices/u, true);
  const text = (await d.locator(`[data-frp-unit="${unitId}"]`).innerText()).replace(/\s+/gu, ' ');
  await setPanelOpen(page, /Records and notices/u, false);

  return text;
}

/** Service paths: clear, click each node, press Record selection. Returns the "last" message. */
export async function pathDiagramRecord(page: Page, nodeIds: string[]): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Service paths/u, true);
  await d.locator('button[data-pd-act="clear"]').click();
  for (const id of nodeIds) {
    const node = d.locator(`[data-pd-node="${id}"]`).first(); // shared parts (e.g. laptop) appear once per service diagram
    await expect(node, `diagram node ${id}`).toBeAttached();
    await activate(page, node, `diagram node ${id}`);
    await expect(node).toHaveAttribute('aria-pressed', 'true');
  }
  await d.locator('button[data-pd-act="record"]').click();
  const msg = (await d.locator('[data-fpd="last"]').innerText()).trim();
  await setPanelOpen(page, /Service paths/u, false);

  return msg;
}

/** Node ids the diagram offers (for QA when a selection id is unknown) */
export async function listDiagramNodes(page: Page): Promise<string[]> {
  const d = await setPanelOpen(page, /Service paths/u, true);
  const ids = await d.locator('[data-pd-node]').evaluateAll((els) => els.map((e) => e.getAttribute('data-pd-node') ?? ''));
  await setPanelOpen(page, /Service paths/u, false);

  return ids;
}

export { isShown };

/** Records and notices: press "Mark read" on every unread provider notice. Returns how many were marked. */
export async function recordsReadNotices(page: Page): Promise<number> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Records and notices/u, true);
  let n = 0;
  const btn = d.locator('button[data-rp-act="read"]');
  while ((await btn.count()) > 0 && n < 10) {
    await activate(page, btn.first(), 'notice Mark read');
    n++;
    await page.waitForTimeout(200);
  }
  await setPanelOpen(page, /Records and notices/u, false);

  return n;
}

/** Records and notices: press the filing button of a request (correction request or referral). Returns the request row text. */
export async function recordsFileRequest(page: Page, requestId: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /Records and notices/u, true);
  const row = d.locator(`[data-frp-req="${requestId}"]`);
  await expect(row, `request ${requestId} listed`).toBeVisible();
  await activate(page, row.locator('button[data-rp-act="request"]'), `file request ${requestId}`);
  await expect(row).toContainText(/filed at|sent at/iu);
  const text = (await row.innerText()).replace(/\s+/gu, ' ');
  await setPanelOpen(page, /Records and notices/u, false);

  return text;
}

/**
 * Power panel: pick a mode for one device (e.g. 'vsat-modem' -> 'run') and press Apply.
 * Returns the panel's result text. Needs the device listed in the Power table.
 */
export async function powerSetMode(page: Page, partId: string, modeId: string): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /^\s*Power/u, true);
  const sel = d.locator(`input[data-power-part="${partId}"][value="${modeId}"]`);
  await expect(sel, `Power table lists ${partId}`).toBeVisible();
  await sel.check();
  await d.locator('[data-power-action="apply"]').click();
  await goToPartFromSheet(page, d, partId);
  const control = page.locator(`#part-closeup-modal [data-equipment-mode="${modeId}"]`);
  await expect(control).toBeVisible();
  await control.click();
  const result = (await page.locator('#pcu-latest').innerText()).trim();
  await closeCloseup(page);

  return result;
}

/**
 * Inspect the power station (the objective may require it), then read the stored energy in Wh from the
 * Power panel ("Stored 343 / 1000 Wh"). The inspect text only gives a rounded percentage.
 */
export async function readBatteryWh(page: Page): Promise<number> {
  await plantInspect(page, 'power-station');
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /^\s*Power/u, true);
  const panel = (await d.innerText()).replace(/\s+/gu, ' ');
  await setPanelOpen(page, /^\s*Power/u, false);
  const m = panel.match(/Stored\s+(\d+(?:\.\d+)?)\s*\/\s*\d+\s*Wh/iu);
  if (!m) {
    throw new Error(`no stored-energy figure in the Power panel: ${panel.slice(0, 400)}`);
  }

  return Math.round(Number(m[1]));
}
