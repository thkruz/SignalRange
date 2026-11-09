#!/usr/bin/env node
/**
 * Fetch the KeepTrack embed bundle pinned by keeptrack-embed.lock.json into public/keeptrack/.
 *
 * - Skips when public/keeptrack/.embed-version already holds the locked version.
 * - Skips entirely when KEEPTRACK_EMBED_DIR is set (rspack serves/copies that local KeepTrack build).
 * - Downloads <r2Bucket>/<r2Key> with `wrangler r2 object get --remote`. Credentials: the developer's
 *   wrangler login locally, CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in CI.
 * - Never fails the build when credentials are missing: prints one warning and leaves the embed absent
 *   (the app then keeps using GeoMap). With CI credentials present, a failure is fatal.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'keeptrack-embed.lock.json');
const outDir = path.join(root, 'public', 'keeptrack');
const stampPath = path.join(outDir, '.embed-version');
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const warn = (msg) => console.warn(`[keeptrack-embed] WARNING: ${msg}`);
const info = (msg) => console.log(`[keeptrack-embed] ${msg}`);

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function main() {
  if (process.env.KEEPTRACK_EMBED_DIR) {
    info(`KEEPTRACK_EMBED_DIR is set (${process.env.KEEPTRACK_EMBED_DIR}); skipping fetch.`);

    return;
  }
  if (!fs.existsSync(lockPath)) {
    warn('keeptrack-embed.lock.json not found; the KeepTrack embed will be absent.');

    return;
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  if (fs.existsSync(stampPath) && fs.readFileSync(stampPath, 'utf8').trim() === lock.version) {
    info(`public/keeptrack already at ${lock.version}.`);

    return;
  }

  const hasCiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const isCi = Boolean(process.env.CI);

  if (isCi && !hasCiToken) {
    warn('no CLOUDFLARE_API_TOKEN in CI; the KeepTrack embed will be absent (GeoMap fallback).');

    return;
  }

  const fail = (msg) => {
    if (hasCiToken) {
      console.error(`[keeptrack-embed] ERROR: ${msg}`);
      process.exit(1);
    }
    warn(`${msg} The KeepTrack embed will be absent (GeoMap fallback). Run \`wrangler login\` or set KEEPTRACK_EMBED_DIR.`);
  };

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-embed-'));
  const tarball = path.join(work, 'embed-bundle.tar.gz');

  try {
    info(`downloading ${lock.r2Bucket}/${lock.r2Key} ...`);
    const get = run(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'r2', 'object', 'get', `${lock.r2Bucket}/${lock.r2Key}`, '--file', tarball, '--remote']);

    if (get.status !== 0 || !fs.existsSync(tarball)) {
      const detail = `${get.stderr || ''}${get.stdout || ''}`.split('\n').filter((l) => /error|permission|auth|login|token/iu.test(l)).slice(0, 3).join(' | ');

      fail(`wrangler could not download the bundle${detail ? ` (${detail})` : ''}. In CI the API token needs R2 read access to bucket ${lock.r2Bucket}.`);

      return;
    }

    const buf = fs.readFileSync(tarball);
    const sha = createHash('sha256').update(buf).digest('hex');

    if (buf.length !== lock.sizeBytes || sha !== lock.sha256) {
      console.error(`[keeptrack-embed] ERROR: bundle mismatch (size ${buf.length} vs ${lock.sizeBytes}, sha256 ${sha} vs ${lock.sha256}).`);
      process.exit(1);
    }

    const stage = path.join(work, 'unpacked');

    fs.mkdirSync(stage);
    const tar = run('tar', ['-xzf', 'embed-bundle.tar.gz', '-C', 'unpacked'], { cwd: work });

    if (tar.status !== 0) {
      console.error(`[keeptrack-embed] ERROR: tar failed: ${tar.stderr}`);
      process.exit(1);
    }
    // Tolerate a single wrapping directory inside the tarball.
    let src = stage;
    const top = fs.readdirSync(stage);

    if (!fs.existsSync(path.join(stage, 'index.html')) && top.length === 1 && fs.statSync(path.join(stage, top[0])).isDirectory()) {
      src = path.join(stage, top[0]);
    }
    if (!fs.existsSync(path.join(src, 'index.html'))) {
      console.error('[keeptrack-embed] ERROR: bundle has no index.html at its root.');
      process.exit(1);
    }
    const tooBig = listFiles(src).filter((f) => fs.statSync(f).size > MAX_FILE_BYTES);

    if (tooBig.length > 0) {
      console.error(`[keeptrack-embed] ERROR: ${tooBig.length} file(s) exceed the 25 MiB Workers asset limit.`);
      process.exit(1);
    }

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(outDir), { recursive: true });
    fs.cpSync(src, outDir, { recursive: true });
    fs.writeFileSync(stampPath, `${lock.version}\n`);
    info(`unpacked ${lock.version} into public/keeptrack/ (sha256 verified).`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
