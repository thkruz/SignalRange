/**
 * Voice-over review tool: a local page to read each dialog line, hear every
 * take recorded for it, tag and write notes per take, and approve the best one.
 *
 *   node scripts/vo-review.mjs                 -> serves http://127.0.0.1:5180
 *   node scripts/vo-review.mjs --port 5190 --target -22.6
 *   node scripts/vo-review.mjs --rejected      -> clips whose every take is rejected (JSON), then exits
 *   node scripts/vo-review.mjs --summary       -> counts by status, character and tag, then exits
 *   node scripts/vo-review.mjs --outdated      -> clips with no usable current-tempo take (JSON), then exits
 *   node scripts/vo-review.mjs --archive       -> copies every live mp3 into the take archive, then exits
 *   node scripts/vo-review.mjs --add-take <asset path> <new mp3> '<json>'
 *                                              -> adds a newly generated take, then exits
 *   node scripts/vo-review.mjs --record-take <asset path> '<json>'
 *                                              -> records how the live file at that path was made, then exits
 *
 * The clip list comes from scripts/vo-manifest.mjs, run once per campaign that
 * has dialog clips, so it always matches the scenario files. The live file of a
 * clip is the one the game plays: public/ at the clip's authored audioUrl, or
 * the manifest target when the clip has none yet.
 *
 * Takes are never deleted. Every take of a clip is kept in the archive,
 * src/private/vo-takes/<asset path without assets/ and .mp3>/<sha1>.mp3 (the
 * private submodule, so paid generations are versioned and pushed). The live
 * file is copied into the archive before anything replaces it, on every start
 * and by --archive. New takes come in only through --add-take: it archives the
 * live file first, stores the new take, and makes it live only when the clip
 * has no live file yet; otherwise it waits for Ted's verdict.
 *
 * Verdicts are per take. Approving a take copies it over the live file (the
 * old live file is already archived). Rejecting the live take while another
 * take is approved puts that approved take back live. A clip is:
 * - approved when any take is approved (the live take is then an approved one);
 * - rejected when it has takes and every one is rejected (needs regenerating);
 * - unreviewed otherwise.
 *
 * Files in src/private/notes, written only by this tool:
 * - vo-review.json: per clip (keyed by asset path under public/), per take
 *   (keyed by SHA-1): status, tags, notes, the text it was judged against.
 * - vo-takes.json: how each take was made (voice, model, text, generation id,
 *   credits), keyed by SHA-1. `scriptText` is the scenario text the take was
 *   recorded from; when it no longer matches the scenario, the take is flagged
 *   "recorded from older text".
 * Loudness (integrated LUFS and true peak, from ffmpeg loudnorm) is measured in
 * the background and cached by hash in node_modules/.cache, so it is not
 * evidence and can be deleted. A take more than 2 LU from --target (default
 * -22.6, Campaign 1's intro-v2.mp3) or with a true peak above -1 dBTP is flagged.
 *
 * Outdated audio: a take is outdated when it was recorded before --outdated-before
 * (default 2026-10-16, the day Charlie's tempo moved to speed 1.12 through the
 * REST API) or when its take record has no voiceSettings (made through the
 * hosted MCP, which ignored the voice's stored speed). A clip needs a redo when
 * it has no take that is current and not rejected; `--outdated` lists those.
 *
 * Bump SCHEMA when a field in vo-review.json or vo-takes.json changes meaning;
 * adding a field does not bump it. Schema 1 (one verdict per clip) is migrated
 * on read.
 */
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 2;

/** Fixed tags, each a lever the regeneration pass can pull. */
const TAGS = [
  'mispronounced',
  'wrong emotion',
  'flat',
  'over-acted',
  'too fast',
  'too slow',
  'too loud',
  'too quiet',
  'glitch',
  'cut off',
  'wrong voice',
  'text wrong',
];

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const publicDir = join(repoRoot, 'public');
const campaignsDir = join(repoRoot, 'src', 'campaigns');
const notesDir = join(repoRoot, 'src', 'private', 'notes');
const archiveRoot = join(repoRoot, 'src', 'private', 'vo-takes');
const reviewPath = join(notesDir, 'vo-review.json');
const takesPath = join(notesDir, 'vo-takes.json');
const loudnessCachePath = join(repoRoot, 'node_modules', '.cache', 'vo-review-loudness.json');
const portraitDir = join(publicDir, 'assets', 'characters');
const thumbDir = join(repoRoot, 'node_modules', '.cache', 'vo-review-portraits');
const pagePath = join(scriptsDir, 'vo-review.html');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const port = Number(opt('--port', '5180'));
const targetLufs = Number(opt('--target', '-22.6'));
const outdatedBefore = opt('--outdated-before', '2026-10-16');

const STATUSES = new Set(['unreviewed', 'approved', 'rejected']);
const SHA_RE = /^[0-9a-f]{40}$/u;

/** Campaign folders that hold scenarioN.ts files. */
function campaignIds() {
  return readdirSync(campaignsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(join(campaignsDir, d.name)).some((f) => /^scenario\d+\.ts$/u.test(f)))
    .map((d) => d.name)
    .sort();
}

function sha1(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex');
}

/** The asset path under public/ that the game plays for this clip. */
function assetPath(clip) {
  const url = clip.audioUrl?.trim();
  if (url?.startsWith('/assets/')) return url.slice(1);
  return clip.target;
}

const liveFile = (path) => join(publicDir, path);
const archiveDir = (path) => join(archiveRoot, path.replace(/^assets\//u, '').replace(/\.mp3$/u, ''));
const archiveFile = (path, hash) => join(archiveDir(path), `${hash}.mp3`);

/** Copy the live file into the archive if it is not there yet. Never removes anything. */
function archiveLive(path) {
  const file = liveFile(path);
  if (!existsSync(file)) return null;
  const hash = sha1(file);
  const dest = archiveFile(path, hash);
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    const { atime, mtime } = statSync(file);
    utimesSync(dest, atime, mtime); // keep the take's original date for ordering
  }
  return hash;
}

/** Every dialog clip in every campaign, flattened, with its live file's hash. */
function loadClips() {
  const tmp = mkdtempSync(join(tmpdir(), 'vo-review-'));
  const clips = [];
  for (const campaign of campaignIds()) {
    const out = join(tmp, `${campaign}.json`);
    execFileSync(process.execPath, [join(scriptsDir, 'vo-manifest.mjs'), '--campaign', campaign, '--out', out], { stdio: 'ignore' });
    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    for (const s of manifest.scenarios) {
      for (const c of s.clips) {
        const path = assetPath(c);
        const hash = archiveLive(path);
        clips.push({
          campaign,
          scenario: c.scenario,
          number: c.number,
          key: c.key,
          character: c.character,
          characterName: c.characterName,
          emotion: c.emotion,
          text: c.text,
          textOnly: c.textOnly === true,
          path,
          exists: hash !== null,
          sha1: hash,
        });
      }
    }
  }
  return clips;
}

/** The archived takes of a clip, oldest first. */
function listTakes(clip) {
  const dir = archiveDir(clip.path);
  const takes = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^[0-9a-f]{40}\.mp3$/u.test(f))
        .map((f) => ({ sha1: f.slice(0, 40), addedAt: statSync(join(dir, f)).mtimeMs }))
    : [];
  return takes.sort((a, b) => a.addedAt - b.addedAt || a.sha1.localeCompare(b.sha1));
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

/** Write JSON atomically with sorted entries under `key`. */
function writeEvidence(path, comment, key, entries) {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ $comment: comment, schema: SCHEMA, [key]: sorted }, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

/** Schema 1 kept one verdict per clip plus a history; schema 2 keys verdicts by take. */
function migrateEntry(entry) {
  if (entry.takes) return entry;
  const { sha1: hash, status, tags, notes, text, reviewedAt, history = [], ...clipMeta } = entry;
  const takes = {};
  for (const v of [...history].reverse()) {
    if (v.sha1) takes[v.sha1] = { status: v.status, tags: v.tags ?? [], notes: v.notes ?? '', text: v.text, reviewedAt: v.reviewedAt };
  }
  if (hash) takes[hash] = { status, tags: tags ?? [], notes: notes ?? '', text, reviewedAt };
  return { ...clipMeta, takes };
}

function readReview() {
  const review = readJson(reviewPath, { clips: {} });
  for (const [path, entry] of Object.entries(review.clips)) review.clips[path] = migrateEntry(entry);
  return review;
}

const readTakes = () => readJson(takesPath, { takes: {} });

function writeReview(review) {
  writeEvidence(
    reviewPath,
    'VO review verdicts from scripts/vo-review.mjs; do not edit by hand. Keyed by asset path under public/, then by take SHA-1 (the take files are in src/private/vo-takes). A take with no entry is unreviewed.',
    'clips',
    review.clips,
  );
}

function writeTakes(takes) {
  writeEvidence(
    takesPath,
    'How each VO take was made, keyed by the mp3 SHA-1. Written by `node scripts/vo-review.mjs --add-take` / `--record-take`; do not edit by hand.',
    'takes',
    takes.takes,
  );
}

// ---------------------------------------------------------------- loudness

const loudness = new Map(Object.entries(readJson(loudnessCachePath, {})));
const loudnessQueue = [];
let loudnessRunning = 0;
let ffmpegMissing = false;
let cacheDirty = false;

function measure(file) {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], (err, _out, stderr) => {
      if (err?.code === 'ENOENT') {
        ffmpegMissing = true;
        resolve(null);
        return;
      }
      const json = /\{[^{}]*"input_i"[^{}]*\}/u.exec(stderr ?? '');
      if (!json) {
        resolve(null);
        return;
      }
      const m = JSON.parse(json[0]);
      const lufs = Number(m.input_i);
      const peak = Number(m.input_tp);
      resolve({ lufs: Number.isFinite(lufs) ? lufs : null, peak: Number.isFinite(peak) ? peak : null });
    });
  });
}

function queueLoudness(path, hash) {
  if (loudness.has(hash) || loudnessQueue.some((q) => q.hash === hash)) return;
  loudnessQueue.push({ file: archiveFile(path, hash), hash });
  pumpLoudness();
}

function pumpLoudness() {
  while (!ffmpegMissing && loudnessRunning < 4 && loudnessQueue.length) {
    const job = loudnessQueue.shift();
    loudnessRunning++;
    measure(job.file).then((m) => {
      loudnessRunning--;
      if (m) {
        loudness.set(job.hash, m);
        cacheDirty = true;
      }
      if (!loudnessQueue.length && !loudnessRunning && cacheDirty) {
        mkdirSync(dirname(loudnessCachePath), { recursive: true });
        writeFileSync(loudnessCachePath, JSON.stringify(Object.fromEntries(loudness)), 'utf8');
        cacheDirty = false;
      }
      pumpLoudness();
    });
  }
  if (ffmpegMissing) loudnessQueue.length = 0;
}

// ---------------------------------------------------------------- views

const norm = (t) => String(t).replace(/\s+/gu, ' ').trim();

/** Why a take no longer matches the current delivery standard, or null when it does. */
function outdatedReason(addedAt, record) {
  if (addedAt.slice(0, 10) < outdatedBefore) return `Recorded ${addedAt.slice(0, 10)}, before the current tempo (${outdatedBefore})`;
  if (!record?.voiceSettings) return 'Generated without explicit voice settings (hosted MCP), so at the old, slower tempo';
  return null;
}

function clipStatus(takes) {
  if (takes.some((t) => t.status === 'approved')) return 'approved';
  if (takes.length && takes.every((t) => t.status === 'rejected')) return 'rejected';
  return 'unreviewed';
}

/** Merge a clip with its takes, their verdicts, take records and loudness into what the page shows. */
function view(clip, entry, records) {
  const takes = listTakes(clip).map((t, i) => {
    const v = entry?.takes?.[t.sha1];
    const level = loudness.get(t.sha1);
    const addedAt = new Date(t.addedAt).toISOString();
    return {
      n: i + 1,
      sha1: t.sha1,
      addedAt,
      outdated: outdatedReason(addedAt, records.takes[t.sha1]),
      live: t.sha1 === clip.sha1,
      status: v?.status ?? 'unreviewed',
      tags: v?.tags ?? [],
      notes: v?.notes ?? '',
      reviewedAt: v?.reviewedAt ?? null,
      textChanged: Boolean(v && v.text !== undefined && v.text !== clip.text),
      // The take was recorded from a script that no longer matches the scenario text
      staleScript: Boolean(records.takes[t.sha1]?.scriptText && norm(records.takes[t.sha1].scriptText) !== norm(clip.text)),
      record: records.takes[t.sha1] ?? null,
      lufs: level?.lufs ?? null,
      peak: level?.peak ?? null,
    };
  });
  const needsRedo = takes.length > 0 && !takes.some((t) => !t.outdated && t.status !== 'rejected');
  return { ...clip, status: clipStatus(takes), needsRedo, takes };
}

function views() {
  const review = readReview();
  const records = readTakes();
  return clips.map((c) => view(c, review.clips[c.path], records));
}

/** Make an archived take the live file. The current live file is archived first. */
function promote(clip, hash) {
  archiveLive(clip.path);
  const dest = liveFile(clip.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(archiveFile(clip.path, hash), dest);
  clip.sha1 = hash;
  clip.exists = true;
}

function applyReview(clip, hash, { status, notes, tags }) {
  const review = readReview();
  const entry = review.clips[clip.path] ?? { takes: {} };
  Object.assign(entry, {
    campaign: clip.campaign,
    scenario: clip.scenario,
    number: clip.number,
    key: clip.key,
    character: clip.character,
    characterName: clip.characterName,
    emotion: clip.emotion,
  });
  const prev = entry.takes[hash] ?? {};
  const next = {
    status: status ?? prev.status ?? 'unreviewed',
    tags: tags ?? prev.tags ?? [],
    notes: notes ?? prev.notes ?? '',
    text: clip.text,
    reviewedAt: new Date().toISOString(),
  };
  if (next.status === 'unreviewed' && !next.notes && next.tags.length === 0) delete entry.takes[hash];
  else entry.takes[hash] = next;

  if (status === 'approved') {
    promote(clip, hash);
  } else if (status === 'rejected' && hash === clip.sha1) {
    // The live take was rejected: put the most recently approved other take back live, if there is one
    const best = Object.entries(entry.takes)
      .filter(([h, v]) => h !== hash && v.status === 'approved' && existsSync(archiveFile(clip.path, h)))
      .sort(([, a], [, b]) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))[0];
    if (best) promote(clip, best[0]);
  }

  if (Object.keys(entry.takes).length) review.clips[clip.path] = entry;
  else delete review.clips[clip.path];
  writeReview(review);
  return view(clip, review.clips[clip.path], readTakes());
}

// ---------------------------------------------------------------- CLI modes

function recordTake(path, hash, fields) {
  const records = readTakes();
  records.takes[hash] = { ...records.takes[hash], path, ...fields, recordedAt: new Date().toISOString() };
  writeTakes(records);
}

if (args.includes('--add-take')) {
  const i = args.indexOf('--add-take');
  const path = args[i + 1]?.replace(/^\/+/u, '');
  const src = args[i + 2];
  if (!path?.startsWith('assets/') || !path.endsWith('.mp3') || !src || !existsSync(src)) {
    console.error('usage: --add-take <assets/...mp3> <new mp3 file> \'<json>\'');
    process.exit(1);
  }
  const fields = JSON.parse(args[i + 3] ?? '{}');
  const before = archiveLive(path);
  const hash = sha1(src);
  const dest = archiveFile(path, hash);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(src, dest);
  recordTake(path, hash, fields);
  if (before === null) {
    copyFileSync(dest, liveFile(path));
    console.log(`added take ${hash} for ${path} (no live file before, so it is live now)`);
  } else {
    console.log(`added take ${hash} for ${path}; live file unchanged (${before === hash ? 'same file' : 'awaiting review'})`);
  }
  process.exit(0);
}

if (args.includes('--record-take')) {
  const i = args.indexOf('--record-take');
  const path = args[i + 1]?.replace(/^\/+/u, '');
  const hash = path && archiveLive(path);
  if (!hash) {
    console.error(`--record-take: no file at public/${path ?? ''}`);
    process.exit(1);
  }
  recordTake(path, hash, JSON.parse(args[i + 2] ?? '{}'));
  console.log(`recorded take ${hash} for ${path}`);
  process.exit(0);
}

let clips = loadClips(); // archives every live file as a side effect
let byPath = new Map(clips.map((c) => [c.path, c]));

if (args.includes('--archive')) {
  const n = clips.filter((c) => c.exists).length;
  console.log(`archived: every one of ${n} live files is in ${archiveRoot}`);
  process.exit(0);
}

if (args.includes('--rejected')) {
  console.log(JSON.stringify(views().filter((c) => c.status === 'rejected'), null, 2));
  process.exit(0);
}

if (args.includes('--outdated')) {
  console.log(JSON.stringify(views().filter((c) => c.needsRedo), null, 2));
  process.exit(0);
}

if (args.includes('--summary')) {
  const everything = views();
  const textOnly = everything.filter((c) => c.textOnly);
  const all = everything.filter((c) => !c.textOnly);
  const recorded = all.filter((c) => c.takes.length);
  const count = (xs, s) => xs.filter((c) => c.status === s).length;
  const takeCount = recorded.reduce((n, c) => n + c.takes.length, 0);
  console.log(
    `${all.length} clips (+${textOnly.length} text-only), ${recorded.length} with takes (${takeCount} takes): ${count(recorded, 'unreviewed')} unreviewed, ${count(recorded, 'approved')} approved, ${count(recorded, 'rejected')} rejected`,
  );
  console.log(`${recorded.filter((c) => c.needsRedo).length} clips need a redo (only outdated or rejected takes)`);
  const by = (key) => {
    const groups = new Map();
    for (const c of recorded) groups.set(c[key], [...(groups.get(c[key]) ?? []), c]);
    return [...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
  };
  console.log('\nby character (unreviewed / approved / rejected):');
  for (const [name, xs] of by('characterName')) {
    console.log(`  ${String(name).padEnd(18)} ${String(count(xs, 'unreviewed')).padStart(4)} ${String(count(xs, 'approved')).padStart(4)} ${String(count(xs, 'rejected')).padStart(4)}`);
  }
  const tagCounts = new Map();
  for (const c of recorded) for (const t of c.takes) for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  if (tagCounts.size) {
    console.log('\ntags across takes:');
    for (const [t, n] of [...tagCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(16)} ${n}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- server

function queueAllLoudness() {
  for (const c of clips) for (const t of listTakes(c)) queueLoudness(c.path, t.sha1);
}
queueAllLoudness();

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Serve an mp3 with Range support so the player can seek. */
function sendAudio(req, res, file) {
  const { size } = statSync(file);
  const range = /^bytes=(\d*)-(\d*)$/u.exec(req.headers.range ?? '');
  const headers = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  createReadStream(file).pipe(res);
}

/** Bumped with the page whenever the API shape changes; the page refuses to render against another version. */
const API_VERSION = 4;

/**
 * The speaker's portrait as a small thumbnail, the way the game picks it (character-enum.ts
 * getCharacterAvatarUrl): <slug>-<emotion>.png, falling back to <slug>.png. The source PNGs are ~850 KB each, so
 * thumbnails are made once with ffmpeg and cached in node_modules/.cache. Returns null when there is no portrait.
 */
function portrait(name, emotion) {
  const slug = String(name).toLowerCase().trim().replace(/\s+/gu, '-');
  if (!/^[a-z-]+$/u.test(slug)) return null;
  const mood = String(emotion ?? '').toLowerCase();
  const candidates = [...(mood && mood !== 'neutral' && /^[a-z]+$/u.test(mood) ? [`${slug}-${mood}.png`] : []), `${slug}.png`];
  const source = candidates.map((f) => join(portraitDir, f)).find((f) => existsSync(f));
  if (!source) return null;
  const thumb = join(thumbDir, source.slice(portraitDir.length + 1).replace(/\.png$/u, '-192.jpg'));
  if (!existsSync(thumb) || statSync(thumb).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(thumbDir, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', 'scale=192:-2', '-q:v', '4', thumb]);
  }
  return thumb;
}

function meta() {
  return { apiVersion: API_VERSION, outdatedBefore, tags: TAGS, targetLufs, loudnessPending: loudnessQueue.length + loudnessRunning, ffmpegMissing };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(pagePath));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/clips') {
      if (url.searchParams.has('refresh')) {
        clips = loadClips();
        byPath = new Map(clips.map((c) => [c.path, c]));
        queueAllLoudness();
      }
      sendJson(res, 200, { ...meta(), clips: views() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/loudness') {
      sendJson(res, 200, { ...meta(), loudness: Object.fromEntries(loudness) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/portrait') {
      let file = null;
      try {
        file = portrait(url.searchParams.get('name') ?? '', url.searchParams.get('emotion'));
      } catch {
        file = null; // ffmpeg missing or failed: the page shows initials
      }
      if (!file) {
        sendJson(res, 404, { error: 'no portrait' });
        return;
      }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' });
      createReadStream(file).pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/audio') {
      const clip = byPath.get(url.searchParams.get('path') ?? '');
      const hash = url.searchParams.get('take') ?? '';
      const file = clip && SHA_RE.test(hash) ? archiveFile(clip.path, hash) : null;
      if (!file || !existsSync(file)) {
        sendJson(res, 404, { error: 'no such take' });
        return;
      }
      sendAudio(req, res, file);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/review') {
      const body = JSON.parse(await readBody(req));
      const clip = byPath.get(body.path);
      if (!clip) {
        sendJson(res, 404, { error: 'unknown clip' });
        return;
      }
      // Pick up a live file replaced while the page was open, archiving it before anything else
      clip.sha1 = archiveLive(clip.path);
      clip.exists = clip.sha1 !== null;
      if (!SHA_RE.test(body.take ?? '') || !existsSync(archiveFile(clip.path, body.take))) {
        sendJson(res, 404, { error: 'unknown take' });
        return;
      }
      if (body.status !== undefined && !STATUSES.has(body.status)) {
        sendJson(res, 400, { error: 'bad status' });
        return;
      }
      if (body.notes !== undefined && typeof body.notes !== 'string') {
        sendJson(res, 400, { error: 'bad notes' });
        return;
      }
      if (body.tags !== undefined && !(Array.isArray(body.tags) && body.tags.every((t) => TAGS.includes(t)))) {
        sendJson(res, 400, { error: 'bad tags' });
        return;
      }
      const tags = body.tags && TAGS.filter((t) => body.tags.includes(t));
      sendJson(res, 200, applyReview(clip, body.take, { status: body.status, notes: body.notes, tags }));
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(port, '127.0.0.1', () => {
  const withTakes = clips.filter((c) => c.exists).length;
  console.log(`vo-review: ${clips.length} clips, ${withTakes} live -> http://127.0.0.1:${port}`);
  console.log(`verdicts: ${reviewPath}`);
  console.log(`takes:    ${archiveRoot}`);
});
