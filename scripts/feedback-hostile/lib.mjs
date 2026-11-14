// Shared helpers for the feedback hostile-input suite. LOCAL ONLY: every request is checked
// against a 127.0.0.1 / localhost allowlist before it is sent.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';

export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertLocal(url) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`ABORT: refusing non-local host ${host}`);
    process.exit(2);
  }
}

// Remote-project credentials must never reach this process.
export function scrubEnv() {
  for (const k of Object.keys(process.env)) if (k.startsWith('SUPABASE_')) delete process.env[k];
}

export function localStatus() {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true, env: process.env });
  const env = {};
  for (const line of out.split(/\r?\n/u)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/u.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  assertLocal(env.API_URL);
  return env;
}

export const DB_CONTAINER = 'supabase_db_signalrange-local';

/** Run SQL in the local Postgres container as the postgres superuser. Returns trimmed stdout. */
export function psql(sql) {
  return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-F', '|'], { input: sql, encoding: 'utf8' }).trim();
}
export function psqlTry(sql) {
  try {
    return { ok: true, out: psql(sql) };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message).trim().split('\n').slice(0, 3).join(' ') };
  }
}

export function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
export function signJwt(payload, secret, alg = 'HS256') {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  if (alg === 'none') return `${header}.${body}.`;
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

/** fetch wrapper that measures time to the full response body. */
export async function timedFetch(url, init = {}) {
  assertLocal(url);
  const t0 = performance.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, ms, text, json, headers: res.headers };
  } catch (err) {
    return { status: 0, ms: Math.round(performance.now() - t0), text: '', json: null, headers: new Headers(), error: String(err.cause?.code || err.message) };
  }
}

/** Streams a body of `bytes` bytes without holding it in memory. Resolves with status or a connection error. */
export function streamBody(url, headers, bytes, { lieContentLength } = {}) {
  assertLocal(url);
  return new Promise((resolve) => {
    const u = new URL(url);
    const t0 = performance.now();
    const h = { ...headers };
    if (lieContentLength !== undefined) h['content-length'] = String(lieContentLength);
    else h['transfer-encoding'] = 'chunked';
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: h }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, ms: Math.round(performance.now() - t0), text: data }));
    });
    req.on('error', (e) => resolve({ status: 0, ms: Math.round(performance.now() - t0), text: '', error: e.code || e.message }));
    const chunk = Buffer.alloc(65536, 0x20);
    let sent = 0;
    const pump = () => {
      while (sent < bytes) {
        const n = Math.min(chunk.length, bytes - sent);
        sent += n;
        if (!req.write(n === chunk.length ? chunk : chunk.subarray(0, n))) {
          req.once('drain', pump);
          return;
        }
      }
      req.end();
    };
    req.write('{"x":"');
    pump();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
