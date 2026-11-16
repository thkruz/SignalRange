/**
 * GEMINI_API_KEY from the environment, else signal-range .env, else 05-games/hq/.env.
 * Simple KEY=VALUE parser. The key is never printed or written anywhere by these tools.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ENV_FILES } from './paths.mjs';

export function decodeEnvFile(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8').replace(/^﻿/u, '');
}

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) v = v.slice(1, -1);
    else {
      const hash = v.search(/\s#/u);
      if (hash >= 0) v = v.slice(0, hash).trim();
    }
    out[m[1]] = v;
  }
  return out;
}

/** Returns { key, source } or null. `source` is 'environment' or a file path, never the key. */
export function loadApiKey({ env = process.env, files = ENV_FILES } = {}) {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  for (const f of files) {
    if (!existsSync(f)) continue;
    const key = parseEnv(decodeEnvFile(readFileSync(f))).GEMINI_API_KEY?.trim();
    if (key) return { key, source: f };
  }
  return null;
}
