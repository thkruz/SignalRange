import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type Clip = { key: string; target: string; group: string };
type Manifest = { scenarios: { number: number; clips: Clip[] }[] };

const root = process.cwd();
const campaignsDir = join(root, 'src', 'campaigns');
const campaigns = readdirSync(campaignsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && readdirSync(join(campaignsDir, d.name)).some((f) => /^scenario\d+\.ts$/u.test(f)))
  .map((d) => d.name);
const outDir = mkdtempSync(join(tmpdir(), 'vo-manifest-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('vo-manifest keys', () => {
  it.each(campaigns)(
    '%s has a unique key and MP3 target per clip',
    (campaign) => {
      const out = join(outDir, `${campaign}.json`);
      execFileSync(process.execPath, [join(root, 'scripts', 'vo-manifest.mjs'), '--campaign', campaign, '--out', out], { stdio: 'pipe' });
      const manifest = JSON.parse(readFileSync(out, 'utf8')) as Manifest;
      const seenKeys = new Set<string>();
      const seenTargets = new Set<string>();
      for (const scenario of manifest.scenarios) {
        for (const clip of scenario.clips) {
          const id = `${scenario.number}/${clip.key}`;
          expect(seenKeys.has(id), `duplicate key ${id}`).toBe(false);
          expect(seenTargets.has(clip.target), `duplicate target ${clip.target}`).toBe(false);
          seenKeys.add(id);
          seenTargets.add(clip.target);
        }
      }
    },
    60_000
  );
});
