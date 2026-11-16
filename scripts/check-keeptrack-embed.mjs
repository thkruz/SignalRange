#!/usr/bin/env node
/** Fails when the vendored SDK's EMBED_API_VERSION differs from keeptrack-embed.lock.json apiVersion. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'keeptrack-embed.lock.json'), 'utf8'));
const contract = fs.readFileSync(path.join(root, 'src', 'vendor', 'keeptrack-embed', 'contract.ts'), 'utf8');
const match = /export const EMBED_API_VERSION = '([^']+)'/u.exec(contract);

if (!match) {
  console.error('check-keeptrack-embed: EMBED_API_VERSION not found in src/vendor/keeptrack-embed/contract.ts');
  process.exit(1);
}
if (match[1] !== lock.apiVersion) {
  console.error(`check-keeptrack-embed: vendored EMBED_API_VERSION ${match[1]} differs from lock apiVersion ${lock.apiVersion}. Re-vendor the SDK from KeepTrack ${lock.ktSha}.`);
  process.exit(1);
}
console.log(`check-keeptrack-embed: ok (${match[1]})`);
