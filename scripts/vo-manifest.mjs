/**
 * nats-eu voice-over manifest (phase 16, engine item E4).
 *
 * Dialog clips for Campaign 2 are authored as text with `audioUrl: ''` and the
 * recordings follow later. This script keeps the two in step without anyone
 * hand-editing scenario files:
 *
 *   node scripts/vo-manifest.mjs            -> writes nats-eu-vo-manifest.json
 *   node scripts/vo-manifest.mjs --apply    -> also rewrites `audioUrl` for every
 *                                              clip whose mp3 exists on disk
 *   node scripts/vo-manifest.mjs --script   -> also writes one recording script per
 *                                              character, <campaign>-vo-script-<name>.md
 *   node scripts/vo-manifest.mjs --campaign nats --out my.json
 *
 * The manifest lists every clip (scenario, key, character, emotion, plain text
 * and HTML, target asset path, whether the file exists) so a recording session
 * has a script and a file list. `--script` renders the same clips as one
 * Markdown file per character, in scenario order, with the emotion and target
 * file name above each line, which is what a voice actor or a TTS batch reads.
 * Both outputs are gitignored (`*-vo-manifest.json`, `*-vo-script-*.md`);
 * regenerate them from the scenario files. Target paths follow the Campaign 1 convention:
 * `assets/campaigns/<campaign>/<N>/intro.mp3` and `.../obj-<objective-id>.mp3`.
 *
 * `--apply` edits only the `audioUrl` initializer of a clip whose target file is
 * present under public/, replacing it with `getAssetUrl('/<target>')`, and adds
 * the `getAssetUrl` import when the file lacks it. Clips whose file is missing
 * are left as they are, so a partially recorded scenario still renders text.
 * Edits are made from TypeScript AST positions, so the surrounding formatting is
 * untouched (the authoring editor round-trips these files byte for byte).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const campaign = opt('--campaign', 'nats-eu');
const apply = flag('--apply');
const script = flag('--script');
const outPath = opt('--out', join(repoRoot, `${campaign}-vo-manifest.json`));

const campaignDir = join(repoRoot, 'src', 'campaigns', campaign);
const publicDir = join(repoRoot, 'public');

/** Display names from character-enum.ts, e.g. CHARLIE_BROOKS -> "Charlie Brooks". */
function loadCharacterNames() {
  const text = readFileSync(join(repoRoot, 'src', 'modal', 'character-enum.ts'), 'utf8');
  const start = text.indexOf('export const CharacterNames');
  const block = text.slice(start, text.indexOf('};', start));
  const names = {};
  for (const m of block.matchAll(/\[Character\.([A-Z_]+)\]:\s*'([^']*)'/g)) {
    names[m[1]] = m[2];
  }
  return names;
}

const characterNames = loadCharacterNames();

function scenarioFiles() {
  return readdirSync(campaignDir)
    .filter((f) => /^scenario\d+\.ts$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => join(campaignDir, f));
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Property name of an object-literal member as a plain string. */
function propName(prop) {
  const n = prop.name;
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return undefined;
}

function findProp(obj, name) {
  return obj.properties.find((p) => ts.isPropertyAssignment(p) && propName(p) === name);
}

function literalText(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    // Template with substitutions: keep the raw source between the backticks.
    return node.getText().slice(1, -1);
  }
  return undefined;
}

function enumMember(node) {
  // Character.X / Emotion.Y
  if (node && ts.isPropertyAccessExpression(node)) return node.name.text;
  return node ? node.getText() : undefined;
}

function audioUrlLiteral(node) {
  if (!node) return '';
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
    return node.arguments[0].text; // getAssetUrl('/assets/...')
  }
  return node.getText();
}

/**
 * Walk one scenario file and return its clips plus the AST handles needed for
 * --apply.
 */
function readScenario(file) {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  const number = Number(file.match(/scenario(\d+)\.ts$/)[1]);

  let dialogClips;
  let scenarioId;
  let scenarioTitle;
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node);
      if (name === 'dialogClips' && ts.isObjectLiteralExpression(node.initializer)) dialogClips = node.initializer;
      if (name === 'id' && !scenarioId && ts.isStringLiteral(node.initializer) && node.initializer.text.startsWith(campaign)) {
        scenarioId = node.initializer.text;
      }
      if (name === 'title' && !scenarioTitle && ts.isStringLiteral(node.initializer)) scenarioTitle = node.initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const clips = [];
  const pushClip = (key, obj) => {
    if (!obj || !ts.isObjectLiteralExpression(obj)) return;
    const textNode = findProp(obj, 'text')?.initializer;
    const audioProp = findProp(obj, 'audioUrl');
    const characterKey = enumMember(findProp(obj, 'character')?.initializer);
    const html = literalText(textNode) ?? '';
    const fileName = key === 'intro' ? 'intro.mp3' : `obj-${key}.mp3`;
    const target = `assets/campaigns/${campaign}/${number}/${fileName}`;
    clips.push({
      scenario: scenarioId ?? rel,
      number,
      key,
      character: characterKey,
      characterName: characterNames[characterKey] ?? characterKey,
      emotion: enumMember(findProp(obj, 'emotion')?.initializer) ?? 'NEUTRAL',
      text: stripHtml(html),
      html: html.trim(),
      target,
      exists: existsSync(join(publicDir, target)),
      audioUrl: audioUrlLiteral(audioProp?.initializer),
      _audioProp: audioProp,
    });
  };

  if (dialogClips) {
    pushClip('intro', findProp(dialogClips, 'intro')?.initializer);
    const objectives = findProp(dialogClips, 'objectives')?.initializer;
    if (objectives && ts.isObjectLiteralExpression(objectives)) {
      for (const p of objectives.properties) {
        if (ts.isPropertyAssignment(p)) pushClip(propName(p), p.initializer);
      }
    }
  }

  return { file, rel, number, title: scenarioTitle ?? `Scenario ${number}`, source, sf, clips };
}

/**
 * One Markdown recording script per character: every line that character
 * speaks, in scenario order, with the emotion and the file the recording must
 * be saved as. Returns what was written.
 */
function writeScripts(scenarios, dir) {
  const byCharacter = new Map();
  for (const s of scenarios) {
    for (const clip of s.clips) {
      if (!clip.character || clip.character === 'SYSTEM') continue;
      if (!byCharacter.has(clip.character)) byCharacter.set(clip.character, []);
      byCharacter.get(clip.character).push({ scenario: s, clip });
    }
  }
  const written = [];
  for (const [character, lines] of byCharacter) {
    const name = characterNames[character] ?? character;
    const slug = character.toLowerCase().replace(/_/g, '-');
    const words = lines.reduce((n, l) => n + l.clip.text.split(/\s+/).filter(Boolean).length, 0);
    const out = [`# ${name} - ${campaign} recording script`, ''];
    out.push(`${lines.length} clips, ${words} words. Generated by scripts/vo-manifest.mjs --script; regenerate, do not edit.`);
    out.push('Save each take as the file named under its heading, under public/, then run `pnpm run vo-manifest --apply`.', '');
    let current;
    for (const { scenario, clip } of lines) {
      if (scenario !== current) {
        current = scenario;
        out.push(`## S${scenario.number} ${scenario.title}`, '');
      }
      const heading = clip.key === 'intro' ? 'intro' : `obj-${clip.key}`;
      out.push(`### ${heading} (${clip.emotion.toLowerCase()})`, '', `File: \`${clip.target}\``, '', clip.text, '');
    }
    const path = join(dir, `${campaign}-vo-script-${slug}.md`);
    writeFileSync(path, `${out.join('\n')}\n`, 'utf8');
    written.push({ path, name, clips: lines.length, words });
  }
  return written;
}

function applyUrls(scenario) {
  const edits = [];
  for (const clip of scenario.clips) {
    const desired = `/${clip.target}`;
    if (!clip.exists || clip.audioUrl === desired || !clip._audioProp) continue;
    const init = clip._audioProp.initializer;
    edits.push({ start: init.getStart(scenario.sf), end: init.getEnd(), text: `getAssetUrl('${desired}')` });
  }
  if (edits.length === 0) return 0;

  let out = scenario.source;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  if (!/import \{[^}]*\bgetAssetUrl\b[^}]*\} from '@app\/utils\/asset-url'/.test(out)) {
    // Insert after the last import line to keep Biome's import order happy enough.
    const lines = out.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
    lines.splice(last + 1, 0, "import { getAssetUrl } from '@app/utils/asset-url';");
    out = lines.join('\n');
  }
  writeFileSync(scenario.file, out, 'utf8');
  return edits.length;
}

const scenarios = scenarioFiles().map(readScenario);
const manifest = {
  campaign,
  generatedAt: new Date().toISOString(),
  clipCount: scenarios.reduce((n, s) => n + s.clips.length, 0),
  scenarios: scenarios.map((s) => ({
    file: s.rel,
    number: s.number,
    clips: s.clips.map(({ _audioProp, ...clip }) => clip),
  })),
};

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const recorded = manifest.scenarios.flatMap((s) => s.clips).filter((c) => c.exists).length;
console.log(`${campaign}: ${manifest.clipCount} clips across ${scenarios.length} scenarios, ${recorded} recorded -> ${relative(repoRoot, outPath)}`);
for (const s of manifest.scenarios) {
  const words = s.clips.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
  console.log(`  S${String(s.number).padStart(2)}  ${String(s.clips.length).padStart(2)} clips  ${String(words).padStart(5)} words  ${s.clips.filter((c) => c.exists).length} recorded`);
}

if (script) {
  for (const w of writeScripts(scenarios, dirname(outPath))) {
    console.log(`  ${w.name.padEnd(16)} ${String(w.clips).padStart(3)} clips ${String(w.words).padStart(5)} words -> ${relative(repoRoot, w.path)}`);
  }
}

if (apply) {
  let total = 0;
  for (const s of scenarios) total += applyUrls(s);
  console.log(total === 0 ? 'apply: nothing to change' : `apply: rewrote ${total} audioUrl value(s)`);
}
