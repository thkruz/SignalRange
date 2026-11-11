/**
 * @gallery Dev gallery shots: every mountable entry at 1600x1000, saved to art-review/gallery/<entry>-<state>.png.
 * No scenario runs and nothing depends on simulation time, so this runs at any worker count:
 *   npx playwright test --project=gallery --workers=4 --reporter=line
 * The entry list is read from src/dev-gallery/entries-*.ts (entries with needsCheckpoint are skipped), and a
 * guard test checks it against the index page the dev server renders.
 */

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const SRC = join(process.cwd(), 'src', 'dev-gallery');
const OUT = join(process.cwd(), 'art-review', 'gallery');

function entryIds(): string[] {
  const ids: string[] = [];
  for (const file of readdirSync(SRC).filter((f) => /^entries-.*\.ts$/u.test(f))) {
    for (const line of readFileSync(join(SRC, file), 'utf8').split('\n')) {
      const m = /entry: '([\w-]+)', state: '([\w-]+)'/u.exec(line);
      if (m && !line.includes('needsCheckpoint')) ids.push(`${m[1]}-${m[2]}`);
    }
  }

  return ids;
}

const IDS = entryIds();

test.describe('@gallery dev gallery', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  test('index lists exactly the mountable entries', async ({ page }) => {
    await page.goto('/gallery');
    await page.waitForSelector('[data-gallery="index"]');
    const listed = await page.locator('a[data-gallery-entry]').evaluateAll((links) => links.map((a) => (a as HTMLElement).dataset.galleryEntry));
    expect([...listed].sort()).toEqual([...IDS].sort());
  });

  for (const id of IDS) {
    test(`shot ${id}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const [entry, ...rest] = id.split('-');
      await page.goto(`/gallery/${entry}/${rest.join('-')}`);
      await page.waitForSelector(`body[data-gallery-ready="${id}"]`, { timeout: 30000 });
      // Art and fonts settle before the shot; the state itself never changes after mount
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))));
      });
      await page.screenshot({ path: join(OUT, `${id}.png`) });
      expect(errors).toEqual([]);
    });
  }
});
