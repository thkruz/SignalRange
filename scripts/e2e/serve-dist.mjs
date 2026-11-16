#!/usr/bin/env node
/**
 * Zero-dependency static server for the prebuilt e2e bundle.
 * Usage: node scripts/e2e/serve-dist.mjs --port 3101 [--dir dist-e2e] [--fallback-dir public]
 *
 * Mirrors the rspack dev server: files from --dir, then --fallback-dir (the dev server also serves public/),
 * /auth/callback* -> auth/callback.html, every other extensionless GET -> index.html. Mounts the private
 * dev-middleware (/__author, /__replay) when src/private/app/dev-middleware.cjs exists; silent otherwise.
 */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const port = Number(opt('port', process.env.SR_DEV_PORT || 3000));
const dir = path.resolve(root, opt('dir', 'dist-e2e'));
const fallbackDir = path.resolve(root, opt('fallback-dir', 'public'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json',
  '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.gz': 'application/gzip',
  '.pdf': 'application/pdf', '.xml': 'application/xml', '.csv': 'text/csv; charset=utf-8',
};

if (!fs.existsSync(path.join(dir, 'index.html'))) {
  console.error(`[serve-dist] ${dir} has no index.html; run pnpm run build:e2e first`);
  process.exit(1);
}

let privateHandler = null;
const privateMiddleware = path.join(root, 'src/private/app/dev-middleware.cjs');
if (fs.existsSync(privateMiddleware)) {
  try {
    const express = require('express');
    const app = express();
    require(privateMiddleware).register(app, { repoRoot: root });
    privateHandler = app;
  } catch (e) {
    console.warn(`[serve-dist] private dev-middleware not mounted: ${e.message}`);
  }
}

const resolveFile = (base, rel) => {
  const p = path.join(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  try { return fs.statSync(p).isFile() ? p : null; } catch { return null; }
};

const send = (req, res, file) => {
  const st = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
};

const serve = (req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  const file = resolveFile(dir, rel) || resolveFile(fallbackDir, rel);
  if (file) return send(req, res, file);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(404); return res.end(); }
  // Dev server's historyApiFallback only rewrites navigation-like requests (Accept: text/html).
  if (!String(req.headers.accept || '').includes('text/html')) { res.writeHead(404); return res.end(); }
  const target = /^\/auth\/callback/u.test(rel) ? 'auth/callback.html' : 'index.html';
  return send(req, res, path.join(dir, target));
};

const server = http.createServer((req, res) => {
  const p = req.url || '';
  if (privateHandler && /^\/__(author|replay)/u.test(p)) return privateHandler(req, res, () => serve(req, res));
  return serve(req, res);
});
server.listen(port, '127.0.0.1', () => console.log(`[serve-dist] ${dir} on http://127.0.0.1:${port}`));
