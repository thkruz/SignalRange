/**
 * Field report (Feedback) form for signed-in players.
 *
 * Default: a fake account and a fake Edge Function, both intercepted with page.route, so no Supabase
 * project is contacted. Build the bundle against the local address first:
 *   PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 PUBLIC_SUPABASE_ANON_KEY=local-e2e-anon-key pnpm run build:e2e
 *
 * FEEDBACK_LOCAL_STACK=1 runs the second variant against a local Supabase stack (`npx supabase start`,
 * `npx supabase functions serve feedback-submit`) with a real sign-up. It needs the bundle built with that
 * stack's anon key and FEEDBACK_LOCAL_ANON_KEY set to the same key.
 *
 * Also build with PUBLIC_USER_API_URL=http://127.0.0.1:54322 (the intercepted progress API) and PUBLIC_FEEDBACK_EDGE_LIVE=true; without it signed-in non-developers see the
 * contact link only (the Edge Function is not live for everyone yet).
 *
 * FEEDBACK_SHOT_DIR=<dir> additionally writes the review screenshots at 1600x900.
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, type Route, test } from '@playwright/test';
import { validateFeedback } from '../../src/feedback/feedback-rules';

const SCENARIO_IDS = new Set<string>(JSON.parse(readFileSync('supabase/functions/feedback-submit/scenario-ids.json', 'utf8')) as string[]);

const API = 'http://127.0.0.1:54321';
// Player progress API; the bundle is built with PUBLIC_USER_API_URL pointing here so nothing leaves the machine.
const USER_API = 'http://127.0.0.1:54322';
const USER_ID = '7d1c3a52-0b0e-4c8f-9a52-3f6a9e1d2b44';
const LOCAL_STACK = process.env.FEEDBACK_LOCAL_STACK === '1';
const SHOT_DIR = process.env.FEEDBACK_SHOT_DIR ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // The real function sends this; without it Chromium hides Retry-After from a cross-origin page.
  'Access-Control-Expose-Headers': 'Retry-After',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const b64 = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'operator@example.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.sig`,
    refresh_token: 'refresh',
    expires_in: 86400,
    expires_at: exp,
    token_type: 'bearer',
    user,
  };
}

async function seedSession(page: Page, session: unknown): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('sb-auth', JSON.stringify(value)), session);
}

/** Dimensions and baseline-ness of a JPEG, read from its markers. */
function inspectJpeg(bytes: Buffer): { baseline: boolean; width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { baseline: marker === 0xc0, height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

interface Received {
  body: Record<string, unknown>;
  authorization: string | undefined;
}

/** Fake feedback-submit: checks the payload shape, then answers from a script of statuses. */
async function installFakeApi(page: Page, statuses: Array<{ status: number; headers?: Record<string, string> }>): Promise<Received[]> {
  const received: Received[] = [];
  // Anything else aimed at the (fake) project gets an empty answer, never a real network call.
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }));
  await page.route(`${USER_API}/**`, (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname;
    // No saved checkpoint; an empty progress list and summary everywhere else.
    if (path.endsWith('/checkpoint')) return route.fulfill({ status: 404, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'none' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ scenarios: [], summary: {}, preferences: {}, achievements: [] }) });
  });
  await page.route(`${API}/auth/v1/user`, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(fakeSession().user) }));
  await page.route(`${API}/functions/v1/feedback-submit`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    received.push({ body, authorization: request.headers().authorization });
    // The same shared rules the server runs: a body the real handler would refuse fails here.
    const verdict = validateFeedback(body, 'player', { isRegisteredScenario: (id) => SCENARIO_IDS.has(id) });
    expect(verdict, JSON.stringify(verdict)).toMatchObject({ ok: true });
    const next = statuses[Math.min(received.length - 1, statuses.length - 1)];
    const ok = next.status === 200;
    return route.fulfill({
      status: next.status,
      contentType: 'application/json',
      headers: { ...CORS, ...next.headers },
      body: JSON.stringify(ok ? { ok: true, id: body.id } : { ok: false, error: 'scripted' }),
    });
  });
  return received;
}

function expectPayloadShape(received: Received): void {
  const { body } = received;
  expect(received.authorization).toMatch(/^Bearer \S+$/u);
  expect(Object.keys(body).sort()).toEqual(['category', 'id', 'message', 'screenshot', 'snapshot']);
  expect(body.id).toMatch(UUID);
  expect(['bug', 'idea', 'content', 'other']).toContain(body.category);
  expect(typeof body.message).toBe('string');
  const snapshot = body.snapshot as Record<string, unknown>;
  expect(snapshot.route).toMatch(/^\/[a-z0-9/-]{0,128}$/u);
  expect(snapshot.version).toMatch(/^\d+\.\d+\.\d+/u);
  expect(snapshot.commit).toMatch(/^[0-9a-f]{7,40}$/iu);
}

const entry = (page: Page) => page.getByRole('button', { name: 'Feedback' });

/** The campaign grid has finished downloading progress, so the tab is shown over the real menu. */
async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect(entry(page)).toBeVisible();
  await expect(page.locator('.selection-loading-screen:visible')).toHaveCount(0, { timeout: 30_000 });
}

async function openScenario(page: Page): Promise<void> {
  await page.goto('/campaigns/nats/scenarios/nats-scenario1');
  // The prologue is an open dialog, so the entry correctly stays away until the player starts the shift.
  await page.getByRole('button', { name: 'Start', exact: true }).click({ timeout: 30_000 });
  await expect(entry(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('field report form', () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test.skip(LOCAL_STACK, 'the intercepted variant is skipped when FEEDBACK_LOCAL_STACK=1');

  test('a signed-in player files a report; a failed first send is retried with the same id', async ({ page }) => {
    const received = await installFakeApi(page, [{ status: 503 }, { status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    const shot = async (name: string) => {
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
    };
    await shot('01-entry-closed');

    await entry(page).click();
    const dialog = page.locator('dialog.fr-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Field report' })).toBeVisible();
    await expect(page.locator('#fr-shot')).not.toBeChecked();
    await expect(page.locator('#fr-preview')).toBeHidden();
    await expect(page.locator('#fr-send')).toBeDisabled();
    await shot('02-open-empty');

    await dialog.getByRole('radio', { name: /Idea/u }).check();
    await page.locator('#fr-message').fill('The pass planner should remember my last station.');
    await expect(page.locator('#fr-count')).toContainText('49 / 4,000');

    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-status')).toContainText('draft is kept');
    await expect(page.locator('#fr-send')).toHaveText('Retry filing');
    await shot('04-error-retry');

    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible();
    await shot('05-filed');

    expect(received).toHaveLength(2);
    received.forEach(expectPayloadShape);
    expect(received[0].body.id).toBe(received[1].body.id);
    expect(received[1].body).toMatchObject({ category: 'idea', message: 'The pass planner should remember my last station.', screenshot: null });

    await page.locator('#fr-done').click();
    await expect(dialog).toBeHidden();
    await entry(page).click();
    await expect(page.locator('#fr-message')).toHaveValue('');
    await page.locator('#fr-message').fill('A second, separate report.');
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible();
    expect(received).toHaveLength(3);
    expect(received[2].body.id).not.toBe(received[1].body.id);
    await page.locator('#fr-done').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('dialog[open]') === null)).toBe(true);
  });

  test('the screenshot is off by default and, when attached, is a baseline JPEG inside 1920x1080', async ({ page }) => {
    const received = await installFakeApi(page, [{ status: 200 }]);
    await seedSession(page, fakeSession());
    await openScenario(page);
    await entry(page).click();
    await expect(page.locator('#fr-shot')).not.toBeChecked();
    await page.locator('#fr-message').fill('The menu looks wrong at this size.');
    await page.getByText('Attach a screen capture').click();
    await expect(page.locator('#fr-preview')).toBeVisible();
    const previewSrc = await page.locator('#fr-preview').getAttribute('src');
    await expect(page.locator('#fr-manifest')).toContainText('Screenshot');
    await expect(page.locator('.fr-consent')).toBeVisible();
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/03-screenshot-on.png` });
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible();

    expect(received).toHaveLength(1);
    expectPayloadShape(received[0]);
    const screenshot = received[0].body.screenshot as string;
    expect(screenshot).toBe(previewSrc);
    expect(screenshot.startsWith('data:image/jpeg;base64,')).toBe(true);
    const bytes = Buffer.from(screenshot.slice('data:image/jpeg;base64,'.length), 'base64');
    expect(bytes.length).toBeLessThanOrEqual(1_000_000);
    const info = inspectJpeg(bytes);
    expect(info).not.toBeNull();
    expect(info!.baseline).toBe(true);
    expect(info!.width).toBeLessThanOrEqual(1920);
    expect(info!.height).toBeLessThanOrEqual(1080);
  });

  test('a capture that was switched on and then off is not sent', async ({ page }) => {
    const received = await installFakeApi(page, [{ status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    await entry(page).click();
    await page.locator('#fr-message').fill('No picture, please.');
    await page.getByText('Attach a screen capture').click();
    await expect(page.locator('#fr-preview')).toBeVisible();
    await page.getByText('Attach a screen capture').click();
    await expect(page.locator('#fr-preview')).toBeHidden();
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible();
    expect(received).toHaveLength(1);
    expect(received[0].body.screenshot).toBeNull();
  });

  test('a 429 shows the full Retry-After countdown and it survives Escape and reopen', async ({ page }) => {
    const received = await installFakeApi(page, [{ status: 429, headers: { 'Retry-After': '3600' } }, { status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    await entry(page).click();
    await page.locator('#fr-message').fill('Hitting the hourly limit.');
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-status')).toContainText('Retry in 60 minutes');
    await expect(page.locator('#fr-send')).toBeDisabled();
    await expect(page.locator('#fr-send')).toHaveText(/^Retry in (3599|3600)s$/u);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/07-rate-limit-countdown.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.fr-dialog')).toBeHidden();
    await entry(page).click();
    await expect(page.locator('#fr-send')).toBeDisabled();
    await expect(page.locator('#fr-send')).toHaveText(/^Retry in \d+s$/u);
    expect(received).toHaveLength(1);
  });

  test('a failed capture leaves a visible note and nothing is attached', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => callback(null);
    });
    const received = await installFakeApi(page, [{ status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    await entry(page).click();
    await expect(page.locator('#fr-shot-note')).toContainText('could not be made');
    await expect(page.locator('#fr-shot')).toBeDisabled();
    await page.locator('#fr-message').fill('The capture failed on my machine.');
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/08-capture-failed-note.png` });
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible();
    expect(received[0].body.screenshot).toBeNull();
  });

  test('the entry steps aside while another dialog is open', async ({ page }) => {
    await installFakeApi(page, [{ status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    await entry(page).click();
    await expect(page.locator('dialog.fr-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.fr-dialog')).toBeHidden();
    await expect(entry(page)).toBeVisible();
    await page.evaluate(() => {
      const other = document.createElement('dialog');
      other.id = 'e2e-foreign';
      document.body.append(other);
      other.show();
    });
    await expect(entry(page)).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('#e2e-foreign')?.contains(document.querySelector('.fr-tab')))).toBe(false);
    await page.evaluate(() => document.querySelector<HTMLDialogElement>('#e2e-foreign')?.close());
    await expect(entry(page)).toBeVisible();
  });

  test('Escape puts the form away and returns focus to the entry', async ({ page }) => {
    await installFakeApi(page, [{ status: 200 }]);
    await seedSession(page, fakeSession());
    await openMenu(page);
    await entry(page).focus();
    await entry(page).click();
    await expect(page.locator('dialog.fr-dialog')).toBeVisible();
    await expect(page.locator('#fr-message')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.fr-dialog')).toBeHidden();
    await expect(entry(page)).toBeFocused();
  });

  test('a signed-out player gets a contact link and no form', async ({ page }) => {
    await installFakeApi(page, [{ status: 200 }]);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Contact' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'https://signalrange.space/contact-us');
    await expect(entry(page)).toHaveCount(0);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/06-signed-out-contact.png` });
    await expect(page.locator('dialog.fr-dialog')).toBeHidden();
  });
});

test.describe('field report form against the local stack', () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test.skip(!LOCAL_STACK, 'set FEEDBACK_LOCAL_STACK=1 with a running local Supabase stack');

  test('a signed-up player files a report through the real Edge Function', async ({ page, request }) => {
    const anon = process.env.FEEDBACK_LOCAL_ANON_KEY ?? '';
    expect(anon, 'FEEDBACK_LOCAL_ANON_KEY must be the local stack anon key').not.toBe('');
    const email = `field-report-${Date.now()}@example.invalid`;
    const signup = await request.post(`${API}/auth/v1/signup`, { headers: { apikey: anon }, data: { email, password: 'local-only-password-1' } });
    expect(signup.ok()).toBe(true);
    const session = await signup.json();
    expect(session.access_token).toBeTruthy();
    await seedSession(page, session);
    await page.goto('/');
    await entry(page).click();
    await page.locator('#fr-message').fill('Local stack field report from the e2e run.');
    await page.locator('#fr-send').click();
    await expect(page.locator('#fr-filed')).toBeVisible({ timeout: 20_000 });
  });
});
