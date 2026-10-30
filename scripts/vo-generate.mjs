/**
 * Generate voice-over takes through the ElevenLabs REST API and hand each one to
 * the review tool's archive (scripts/vo-review.mjs --add-take), so nothing ever
 * overwrites a take that was already paid for.
 *
 *   node scripts/vo-generate.mjs --voice-info --voice <id>
 *       -> prints the voice's name and stored default settings, then exits
 *   node scripts/vo-generate.mjs --path assets/campaigns/nats/1/v2/obj-x.mp3 --from-scenario --character CHARLIE_BROOKS
 *   node scripts/vo-generate.mjs --path assets/campaigns/nats/1/v2/obj-x.mp3 --text-file line.txt
 *       [--character CHARLIE_BROOKS | --voice <id>] [--model eleven_multilingual_v2] [--speed 1.12]
 *       [--stability 0.5] [--similarity 0.75] [--style 0] [--count 3] [--seed 42] [--note "why"] [--dry-run] [--archive-only]
 *
 * --from-scenario reads the line the scenario plays at that path and applies the
 * pronunciation and pacing rules in scripts/vo-prompt-rules.mjs; --text-file sends
 * a hand-written prompt instead (UTF-8, so break tags and quotes never pass
 * through a shell). Either way the path must be one a scenario clip plays, and
 * --character must be that clip's speaker. Settings resolve in this order: the
 * command line, then the character's entry in src/private/notes/vo-casting.json
 * (voiceSettings, then emotionSettings for the clip's emotion, then longLine
 * speed), then the voice's own stored defaults. With --count N each take gets its own seed
 * (--seed, --seed+1, ...; random when --seed is absent), so the variations differ.
 * Output is always mp3_44100_128, the Campaign 1 format.
 *
 * The API key is ELEVENLABS_API_KEY from the environment or the gitignored .env;
 * it is never printed. Every take is recorded with its exact settings, seed,
 * request id and character cost in src/private/notes/vo-takes.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptFor, settingsFor } from './vo-prompt-rules.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const API = 'https://api.elevenlabs.io/v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
const CHARLIE = '2ajXGJNYBR0iNHpS4VZb';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const num = (name) => (opt(name) === undefined ? undefined : Number(opt(name)));

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const envFile = join(repoRoot, '.env');
  if (existsSync(envFile)) {
    const m = /^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/mu.exec(readFileSync(envFile, 'utf8'));
    if (m) return m[1].trim();
  }
  console.error('ELEVENLABS_API_KEY is not set (environment or .env)');
  process.exit(1);
}

const key = apiKey();

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${body.slice(0, 400)}`);
  }
  return res;
}

/** The approved casting for --character, if any. */
function casting() {
  const name = opt('--character');
  if (!name) return {};
  const file = join(repoRoot, 'src', 'private', 'notes', 'vo-casting.json');
  const entry = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).characters?.[name] : undefined;
  if (!entry?.voiceId) {
    console.error(`--character ${name}: no voiceId in vo-casting.json`);
    process.exit(1);
  }
  return entry;
}

const cast = casting();
const voiceId = opt('--voice', cast.voiceId ?? CHARLIE);

async function voiceInfo(id) {
  const voice = await (await api(`/voices/${id}`)).json();
  const defaults = await (await api(`/voices/${id}/settings`)).json();
  return { name: voice.name, defaults };
}

if (args.includes('--voice-info')) {
  const info = await voiceInfo(voiceId);
  console.log(JSON.stringify({ voiceId, ...info }, null, 2));
  process.exit(0);
}

const path = opt('--path')?.replace(/^\/+/u, '');
const textFile = opt('--text-file');
const fromScenario = args.includes('--from-scenario');
if (!path?.startsWith('assets/') || !path.endsWith('.mp3') || (!fromScenario && !(textFile && existsSync(textFile)))) {
  console.error('usage: --path <assets/...mp3> (--from-scenario | --text-file <file>) [options]; see the header of scripts/vo-generate.mjs');
  process.exit(1);
}
const campaignOf = (assetPath) => /^assets\/campaigns\/([^/]+)\//u.exec(assetPath)?.[1];
const tmp = mkdtempSync(join(tmpdir(), 'vo-generate-'));

/** The dialog clip that plays this path today (text, character, emotion), from the scenario files. */
function scenarioClip() {
  const campaign = /^assets\/campaigns\/([^/]+)\//u.exec(path)?.[1];
  if (!campaign) return undefined;
  const out = join(tmp, 'manifest.json');
  execFileSync(process.execPath, [join(scriptsDir, 'vo-manifest.mjs'), '--campaign', campaign, '--out', out], { stdio: 'ignore' });
  const clips = JSON.parse(readFileSync(out, 'utf8')).scenarios.flatMap((s) => s.clips);
  return clips.find((c) => c.audioUrl === `/${path}` || c.target === path);
}
const clip = scenarioClip();
if (!clip) {
  // A path no clip plays is almost always a typo; stop before spending credits on a take nothing will use
  console.error(`no dialog clip in the scenario files plays ${path}; check the path (vo-review.mjs lists the real ones)`);
  process.exit(1);
}
if (opt('--character') && clip.character !== opt('--character')) {
  console.error(`${path} is spoken by ${clip.character}, not ${opt('--character')}`);
  process.exit(1);
}
const script = clip.text;
const text = fromScenario ? promptFor(script, campaignOf(path)) : readFileSync(textFile, 'utf8').trim();
const model = opt('--model', cast.model ?? 'eleven_multilingual_v2');
const count = Math.max(1, Math.min(4, Number(opt('--count', '1'))));
const baseSeed = num('--seed');
const note = opt('--note', '');

const info = await voiceInfo(voiceId);
const base = { ...info.defaults, ...settingsFor(cast, clip.emotion, text) };
const settings = {
  stability: num('--stability') ?? base.stability,
  similarity_boost: num('--similarity') ?? base.similarity_boost,
  style: num('--style') ?? base.style ?? 0,
  use_speaker_boost: base.use_speaker_boost ?? true,
  speed: num('--speed') ?? base.speed ?? 1,
};

console.log(`${info.name} (${voiceId}), ${model}, ${count} take(s) for ${path} (${clip.emotion})`);
console.log(`settings ${JSON.stringify(settings)} (voice defaults ${JSON.stringify(info.defaults)})`);
console.log(`text (${text.length} chars): ${text}`);
if (args.includes('--dry-run')) process.exit(0);

for (let i = 0; i < count; i++) {
  const seed = baseSeed !== undefined ? baseSeed + i : Math.floor(Math.random() * 4294967295);
  const res = await api(`/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings, seed }),
  });
  const file = join(tmp, `take-${i + 1}.mp3`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const record = {
    voiceId,
    voiceName: info.name,
    model,
    outputFormat: OUTPUT_FORMAT,
    voiceSettings: settings,
    seed,
    prompt: text,
    scriptText: script,
    emotion: clip.emotion,
    requestId: res.headers.get('request-id'),
    credits: Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count') ?? text.length),
    via: `ElevenLabs REST API text-to-speech (scripts/vo-generate.mjs), variation ${i + 1} of ${count}`,
    ...(note ? { note } : {}),
  };
  // Straight to node, not through a shell, so the JSON reaches --add-take intact
  const out = execFileSync(process.execPath, [join(scriptsDir, 'vo-review.mjs'), '--add-take', path, file, JSON.stringify(record), ...(args.includes('--archive-only') ? ['--archive-only'] : [])], {
    encoding: 'utf8',
  });
  console.log(`take ${i + 1}: seed ${seed}, ${record.credits} credits -> ${out.trim()}`);
}
