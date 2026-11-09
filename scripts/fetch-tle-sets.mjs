#!/usr/bin/env node
/**
 * Fetch the TLE sets pinned by tle-sets.lock.json into public/assets/tle-sets/<id>/<id>.json.gz
 * (gitignored, served same-origin as static files).
 *
 * - Skips a set whose file is already present and matches the locked sha256.
 * - Downloads <r2Bucket>/<r2Key> with `wrangler r2 object get --remote`. Credentials: the developer's
 *   wrangler login locally, CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in CI.
 * - Never fails the build when credentials are missing: prints one warning and leaves the sets absent.
 *   With CI credentials present, a download failure is fatal. A sha256 or size mismatch is always fatal.
 *
 * Test hooks: TLE_SETS_LOCK (lock path), TLE_SETS_OUT (output dir), TLE_SETS_SOURCE_DIR (copy
 * <dir>/<r2Key> instead of calling wrangler).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = process.env.TLE_SETS_LOCK || path.join(root, 'tle-sets.lock.json');
const outDir = process.env.TLE_SETS_OUT || path.join(root, 'public', 'assets', 'tle-sets');
const sourceDir = process.env.TLE_SETS_SOURCE_DIR;

const warn = (msg) => console.warn(`[tle-sets] WARNING: ${msg}`);
const info = (msg) => console.log(`[tle-sets] ${msg}`);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function main() {
  if (!fs.existsSync(lockPath)) {
    warn('tle-sets.lock.json not found; no TLE sets will be available.');

    return;
  }
  const entries = Object.values(JSON.parse(fs.readFileSync(lockPath, 'utf8')).sets ?? {});
  const hasCiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);

  if (!sourceDir && process.env.CI && !hasCiToken) {
    warn('no CLOUDFLARE_API_TOKEN in CI; TLE sets will be absent.');

    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-tle-sets-'));

  try {
    for (const e of entries) {
      const dest = path.join(outDir, e.id, `${e.id}.json.gz`);

      if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === e.sha256) {
        info(`${e.id} already present.`);
        continue;
      }
      const tmp = path.join(work, `${e.id}.json.gz`);

      if (sourceDir) {
        fs.copyFileSync(path.join(sourceDir, e.r2Key), tmp);
      } else {
        info(`downloading ${e.r2Bucket}/${e.r2Key} ...`);
        const get = spawnSync(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'r2', 'object', 'get', `${e.r2Bucket}/${e.r2Key}`, '--file', tmp, '--remote'], { cwd: root, encoding: 'utf8' });

        if (get.status !== 0 || !fs.existsSync(tmp)) {
          const detail = `${get.stderr || ''}${get.stdout || ''}`.split('\n').filter((l) => /error|permission|auth|login|token/iu.test(l)).slice(0, 3).join(' | ');
          const msg = `wrangler could not download ${e.id}${detail ? ` (${detail})` : ''}. In CI the API token needs R2 read access to bucket ${e.r2Bucket}.`;

          if (hasCiToken) {
            console.error(`[tle-sets] ERROR: ${msg}`);
            process.exit(1);
          }
          warn(`${msg} TLE sets will be absent. Run \`wrangler login\`.`);

          return;
        }
      }
      const buf = fs.readFileSync(tmp);
      const sha = sha256(buf);

      if (buf.length !== e.sizeBytes || sha !== e.sha256) {
        console.error(`[tle-sets] ERROR: ${e.id} mismatch (size ${buf.length} vs ${e.sizeBytes}, sha256 ${sha} vs ${e.sha256}).`);
        process.exit(1);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(tmp, dest);
      info(`${e.id}: ${buf.length} bytes placed in ${path.relative(root, dest)} (sha256 verified).`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
