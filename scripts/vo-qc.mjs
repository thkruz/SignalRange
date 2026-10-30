/**
 * Local, free QC for voice-over takes (Phase 35 B5). No network, no paid API.
 *
 *   node scripts/vo-qc.mjs --campaign nats [--scenario 5|nats-scenario5] [--clip key1,key2]
 *        [--take <sha1>,...] [--takes live|all] --out qc.jsonl [--python <python.exe>] [--model small.en]
 *        [--recheck medium.en] [--allow-gain]
 *
 * --recheck re-transcribes only takes that fail on WER with a bigger model and keeps the lower WER (a 7-word line
 * fails at one misheard word; the bigger model usually settles it). --allow-gain treats a loudness miss as a pass when
 * a plain gain to the target keeps the true peak under -1 dBTP (the report still carries gainToTargetDb).
 *
 * Takes: `live` (default) checks the file the game plays; `all` checks every archived take of each clip
 * (src/private/vo-takes/...). `--take` limits to those SHA-1s. Reads public/ and the archive only.
 *
 * Per take (one JSON line): transcript, WER against promptFor(text) with both sides normalised, words per
 * second (reference words / speech span with leading and trailing silence removed), integrated LUFS and true
 * peak (ffmpeg ebur128), longest internal silence (silencedetect -40 dB, leading and trailing ignored),
 * missing rule words, and a verdict with failure reasons. Criteria are plan section 2 (B5).
 *
 * Python: the venv python from --python, else $VO_QC_PYTHON, else .tools/qcvenv/Scripts/python.exe.
 * Setup is in src/private/notes/phase-35/b5-prep-qc.md.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const { promptFor, intWords } = await import(pathToFileURL(join(scriptsDir, 'vo-prompt-rules.mjs')).href);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

export const LIMITS = { wer: 0.03, wpsMin: 2.2, wpsMax: 3.2, peak: -1, lufsTarget: -22.6, lufsTol: 2, silence: 1.5 };

// ---------------------------------------------------------------- normalisation
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const UNICODE_FRACTIONS = { '¼': ' one quarter ', '½': ' one half ', '¾': ' three quarters ', '⅓': ' one third ', '⅔': ' two thirds ' };

/** Whisper spells these its own way; map them to the spoken form the prompt rules produce. */
const HYP_ALIASES = [
  [/\bdbs\b/gu, 'dee bees'],
  [/\bdbm\b/gu, 'dee bee em'],
  [/\bdbw\b/gu, 'dee bee double you'],
  [/\bdb\b/gu, 'dee bee'],
  [/\bdecibels?\b/gu, 'dee bee'],
  [/\bgeo\b/gu, 'gee oh'],
  [/\bgeos\b/gu, 'gee ohs'],
  [/\bgps do\b/gu, 'gps d o'],
  [/\bgpsdo\b/gu, 'gps d o'],
  [/\bbucs\b/gu, 'bucks'],
  [/\bbuc\b/gu, 'buck'],
  [/\bghz\b/gu, 'gigahertz'],
  [/\bmhz\b/gu, 'megahertz'],
  [/\bkhz\b/gu, 'kilohertz'],
  [/\bok\b/gu, 'okay'],
];

function digitsToWords(t) {
  return t
    .replace(/(\d+)\.(\d+)/gu, (_m, a, b) => `${intWords(Number(a))} point ${[...b].map((d) => ONES[Number(d)]).join(' ')}`)
    .replace(/\d+/gu, (m) => (m.length > 1 && m.startsWith('0') ? [...m].map((d) => ONES[Number(d)]).join(' ') : intWords(Number(m))));
}

/** Lower-case word tokens: dotted letters joined, hyphens split, numbers spelled, punctuation gone. */
export function normalise(text, { hyp = false } = {}) {
  let t = text
    .replace(/<break[^>]*>/gu, ' ')
    .toLowerCase()
    .replace(/[‘’]/gu, "'")
    .replace(/[¼½¾⅓⅔]/gu, (c) => UNICODE_FRACTIONS[c])
    .replace(/(\d) \.(\d)/gu, '$1.$2')
    .replace(/(?<=(?:^|[,:(]) ?)-(?=\d)/gu, ' minus ')
    .replace(/(?<![a-z])((?:[a-z]\.){1,}[a-z])(?![a-z])/gu, (m) => m.replace(/\./gu, ''))
    .replace(/(\d),(\d{3})/gu, '$1$2');
  t = digitsToWords(t).replace(/-/gu, ' ');
  t = t.replace(/%/gu, ' percent ').replace(/&/gu, ' and ').replace(/\//gu, ' over ');
  if (hyp) for (const [re, to] of HYP_ALIASES) t = t.replace(re, to);
  t = t.replace(/(\w)isation/gu, '$1ization').replace(/(\w)ising\b/gu, '$1izing').replace(/(\w)ised\b/gu, '$1ized');
  t = t.replace(/'s\b/gu, 's').replace(/[^a-z0-9' ]+/gu, ' ').replace(/'/gu, '');
  return t.split(/\s+/u).filter(Boolean).flatMap((w) => (w === 'oclock' ? ['o', 'clock'] : [w === 'main' ? 'maine' : w])); // Whisper hears Maine as main
}

/** Merge or split tokens so compounds match across both sides ("tide mark" -> "tidemark"). */
function reconcile(ref, hyp) {
  const refSet = new Set(ref);
  const out = [];
  for (let i = 0; i < hyp.length; i++) {
    let merged = false;
    // "HPA's" is often transcribed "HPA is"
    if (hyp[i + 1] === 'is' && refSet.has(`${hyp[i]}s`) && !refSet.has(hyp[i])) {
      out.push(`${hyp[i]}s`);
      i += 1;
      continue;
    }
    for (const n of [3, 2]) {
      if (i + n > hyp.length) continue;
      const cat = hyp.slice(i, i + n).join('');
      if (refSet.has(cat) && !(refSet.has(hyp[i]) && refSet.has(hyp[i + 1]))) {
        out.push(cat);
        i += n - 1;
        merged = true;
        break;
      }
    }
    if (!merged) out.push(hyp[i]);
  }
  const hypSet = new Set(out);
  const refOut = [];
  for (let i = 0; i < ref.length; i++) {
    const cat = i + 1 < ref.length ? ref[i] + ref[i + 1] : '';
    if (cat && hypSet.has(cat) && !hypSet.has(ref[i])) {
      refOut.push(cat);
      i += 1;
    } else refOut.push(ref[i]);
  }
  return [refOut, out];
}

export function wer(refTokens, hypTokens) {
  const [r, h] = reconcile(refTokens, hypTokens);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 0; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], refLen: r.length, rate: r.length ? d[r.length][h.length] / r.length : 0 };
}

// ---------------------------------------------------------------- rule-word spot check
/** Source spellings that promptFor rewrites for pronunciation (see scripts/vo-prompt-rules.mjs). */
const RULE_WORDS = [
  /GPSDO/gu, /\bBUCs?\b/gu, /\bACU\b/gu, /\bAGC\b/gu, /\bSLA\b/gu, /\bGEO\b/gu, /\bcoax\b/gu, /\bdBs?\b/gu, /\bdBm\b/gu, /\bdBW\b/gu,
  /\bC\/N\b/gu, /\bG\/T\b/gu, /\bKu\b/gu, /\bKa\b/gu, /\bTT&C\b/gu, /\bLNA\b/gu, /\bIMD\b/gu, /\bEIRP\b/gu, /\bGNSS\b/gu, /\bOBC\b/gu,
  /\bTRR\b/gu, /\bAOS\b/gu, /\bLOS\b/gu, /\bLEOP\b/gu, /\bNAK\b/gu, /\bACK\b/gu, /\bComReg\b/gu, /\bFaroes\b/gu, /\bUTC\b/gu,
  /\bMHz\b/gu, /\bGHz\b/gu, /\bkHz\b/gu, /\b(?:VT|ME|GW|SH|KG)-0\d\b/gu, /\bHK-DUMP\b/gu, /\bPLD-[A-Z]+\b/gu,
];

function missingRuleWords(sourceText, hypTokens) {
  const hypSquash = hypTokens.join('');
  const hypSet = new Set(hypTokens);
  const missing = [];
  for (const re of RULE_WORDS) {
    for (const m of sourceText.matchAll(re)) {
      const spoken = normalise(promptFor(m[0], 'nats-eu'));
      const squash = spoken.join('');
      if (!squash || squash === m[0].toLowerCase()) continue;
      const ok = hypSquash.includes(squash) || spoken.every((w) => hypSet.has(w));
      if (!ok && !missing.includes(m[0])) missing.push(m[0]);
    }
  }
  return missing;
}

// ---------------------------------------------------------------- audio measurements
function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true,silencedetect=n=-40dB:d=0.2', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const err = r.stderr ?? '';
  const dur = /Duration: (\d+):(\d+):([\d.]+)/u.exec(err);
  const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : NaN;
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+) LUFS/u.exec(summary);
  const peak = /Peak:\s+(-?[\d.]+) dBFS/u.exec(summary);
  const starts = [...err.matchAll(/silence_start: (-?[\d.]+)/gu)].map((m) => Number(m[1]));
  const ends = [...err.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/gu)].map((m) => ({ end: Number(m[1]), len: Number(m[2]) }));
  const eps = 0.06;
  let leading = 0;
  let trailing = 0;
  let longestInternal = 0;
  starts.forEach((s, i) => {
    const e = ends[i];
    if (s <= eps) leading = e ? e.len + Math.min(0, s) : duration;
    else if (!e || e.end >= duration - eps) trailing = duration - Math.max(s, 0);
    else longestInternal = Math.max(longestInternal, e.len);
  });
  return { duration, lufs: lufs ? Number(lufs[1]) : NaN, truePeak: peak ? Number(peak[1]) : NaN, leading, trailing, longestInternal };
}

// ---------------------------------------------------------------- take enumeration
const sha1 = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');
const archiveDir = (path) => join(repoRoot, 'src', 'private', 'vo-takes', path.replace(/^assets\//u, '').replace(/\.mp3$/u, ''));

function loadClips(campaign) {
  const tmp = mkdtempSync(join(tmpdir(), 'vo-qc-'));
  const out = join(tmp, `${campaign}.json`);
  execFileSync(process.execPath, [join(scriptsDir, 'vo-manifest.mjs'), '--campaign', campaign, '--out', out], { stdio: 'ignore' });
  const manifest = JSON.parse(readFileSync(out, 'utf8'));
  return manifest.scenarios.flatMap((s) => s.clips).map((c) => ({ ...c, path: c.audioUrl?.trim().startsWith('/assets/') ? c.audioUrl.trim().slice(1) : c.target }));
}

function takesOf(clip, mode, only) {
  const live = join(repoRoot, 'public', clip.path);
  const dir = archiveDir(clip.path);
  const list = [];
  const liveSha = existsSync(live) ? sha1(live) : null;
  if ((mode === 'all' || only) && existsSync(dir))
    for (const f of readdirSync(dir).filter((x) => /^[0-9a-f]{40}\.mp3$/u.test(x))) list.push({ sha1: f.slice(0, 40), file: join(dir, f), live: f.slice(0, 40) === liveSha });
  if (liveSha && !list.some((t) => t.sha1 === liveSha)) list.push({ sha1: liveSha, file: live, live: true });
  return only ? list.filter((t) => only.includes(t.sha1)) : mode === 'all' ? list : list.filter((t) => t.live);
}

// ---------------------------------------------------------------- main
/** Names and jargon from the line (all-caps or hyphenated ids, capitalised mid-sentence words) bias Whisper's spelling. */
function vocabPrompt(text) {
  // Built from the spoken form so a rewritten id (ME-02 -> Maine two) is never fed to Whisper in its written form.
  const spoken = promptFor(text, 'nats-eu').replace(/<break[^>]*>/gu, ' ');
  const words = spoken.match(/\b[A-Z]{3,}\b|(?<=[a-z,] )[A-Z][a-z]+/gu) ?? [];
  return `${[...new Set(words)].slice(0, 30).join(', ')}.`;
}

function transcribeAll(jobsIn, python, model) {
  const map = new Map();
  const tmp = mkdtempSync(join(tmpdir(), 'vo-qc-jobs-'));
  for (let i = 0; i < jobsIn.length; i += 40) {
    const jobsFile = join(tmp, `jobs${i}.json`);
    writeFileSync(jobsFile, JSON.stringify(jobsIn.slice(i, i + 40)));
    const r = spawnSync(python, [join(scriptsDir, 'vo-qc-transcribe.py'), '--model', model, '--jobs', jobsFile], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0 && !r.stdout) throw new Error(`transcribe failed: ${(r.stderr ?? '').split('\n').filter((l) => !/HF_TOKEN|unauthenticated/u.test(l)).slice(-4).join(' | ')}`);
    for (const line of r.stdout.split('\n').filter((l) => l.startsWith('{'))) {
      const j = JSON.parse(line);
      map.set(j.file, j);
    }
  }
  return map;
}

export function judge(m, werRate, wps, missing) {
  const reasons = [];
  if (werRate >= LIMITS.wer) reasons.push('wer');
  if (!(wps >= LIMITS.wpsMin && wps <= LIMITS.wpsMax)) reasons.push(wps < LIMITS.wpsMin ? 'wps-slow' : 'wps-fast');
  if (!(m.truePeak < LIMITS.peak)) reasons.push('peak');
  if (!(Math.abs(m.lufs - LIMITS.lufsTarget) <= LIMITS.lufsTol)) reasons.push('lufs');
  if (m.longestInternal > LIMITS.silence) reasons.push('silence');
  if (missing.length) reasons.push('rule-word');
  return reasons;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const campaign = opt('--campaign');
  const outPath = opt('--out');
  if (!campaign || !outPath) {
    console.error('usage: node scripts/vo-qc.mjs --campaign <id> --out <file.jsonl> [--scenario n] [--clip k1,k2] [--take sha,..] [--takes live|all]');
    process.exit(2);
  }
  const scen = opt('--scenario');
  const clipFilter = opt('--clip')?.split(',');
  const only = opt('--take')?.split(',');
  const mode = opt('--takes', 'live');
  const python = opt('--python', process.env.VO_QC_PYTHON ?? join(repoRoot, '.tools', 'qcvenv', 'Scripts', 'python.exe'));
  const model = opt('--model', 'small.en');
  const recheck = opt('--recheck');
  const allowGain = args.includes('--allow-gain');

  const clips = loadClips(campaign).filter(
    (c) => !c.textOnly && (!scen || c.scenario === scen || c.scenario === `${campaign}-scenario${scen}` || String(c.number) === scen) && (!clipFilter || clipFilter.includes(c.key)),
  );
  const jobs = clips.flatMap((clip) => takesOf(clip, mode, only).map((take) => ({ clip, take })));
  const transcripts = transcribeAll(jobs.map((j) => ({ file: j.take.file, prompt: vocabPrompt(j.clip.text) })), python, model);

  const score = (job, t) => {
    const ref = normalise(promptFor(job.clip.text, campaign));
    return { ref, hyp: normalise(t?.text ?? '', { hyp: true }) };
  };
  if (recheck) {
    const failing = jobs.filter((j) => {
      const { ref, hyp } = score(j, transcripts.get(j.take.file));
      return wer(ref, hyp).rate >= LIMITS.wer;
    });
    const second = transcribeAll(failing.map((j) => ({ file: j.take.file, prompt: vocabPrompt(j.clip.text) })), python, recheck);
    for (const j of failing) {
      const a = transcripts.get(j.take.file);
      const b = second.get(j.take.file);
      const wa = wer(...Object.values(score(j, a))).rate;
      const wb = b ? wer(...Object.values(score(j, b))).rate : 1;
      if (wb < wa) transcripts.set(j.take.file, { ...b, model: recheck });
    }
  }

  const lines = [];
  const tally = {};
  for (const { clip, take } of jobs) {
    const t = transcripts.get(take.file);
    const reference = promptFor(clip.text, campaign);
    const refTokens = normalise(reference);
    const hypTokens = normalise(t?.text ?? '', { hyp: true });
    const w = wer(refTokens, hypTokens);
    const m = measure(take.file);
    const speech = Math.max(m.duration - m.leading - m.trailing, 0.1);
    const wps = refTokens.length / speech;
    const missing = missingRuleWords(clip.text, hypTokens);
    const gainToTargetDb = +(LIMITS.lufsTarget - m.lufs).toFixed(2);
    const gainFixable = m.truePeak + gainToTargetDb < LIMITS.peak;
    const reasons = judge(m, w.rate, wps, missing).filter((r) => !(allowGain && r === 'lufs' && gainFixable));
    for (const r of reasons.length ? reasons : ['pass']) tally[r] = (tally[r] ?? 0) + 1;
    lines.push(
      JSON.stringify({
        campaign, scenario: clip.scenario, key: clip.key, path: clip.path, sha1: take.sha1, live: take.live,
        verdict: reasons.length ? 'fail' : 'pass', reasons,
        wer: +w.rate.toFixed(4), werErrors: w.errors, refWords: refTokens.length, wps: +wps.toFixed(2),
        lufs: m.lufs, truePeak: m.truePeak, gainToTargetDb, gainFixable, duration: +m.duration.toFixed(2), longestSilence: +m.longestInternal.toFixed(2),
        missingRuleWords: missing, model: t?.model ?? model, transcript: t?.text ?? '', reference,
      }),
    );
  }
  writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''));
  const pass = tally.pass ?? 0;
  console.log(`vo-qc ${campaign}: ${lines.length} takes, ${pass} pass, ${lines.length - pass} fail; reasons ${JSON.stringify({ ...tally, pass: undefined })} -> ${outPath}`);
}
