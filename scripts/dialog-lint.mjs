#!/usr/bin/env node
/**
 * dialog-lint: extract every player-facing string from the campaign scenario
 * files and score it against the dialog style rules
 * (src/private/docs/dialog/dialog-style-guide.md).
 *
 * It parses the TypeScript source with the compiler API, so it needs no build
 * and no path-alias resolution. What it collects:
 *   - dialog   any object literal with `character` + `text` (intro, objective
 *              clips, event clips)
 *   - quiz     status-check params (`question`, `options`, `explanation`)
 *   - decision decision params (`prompt`, `decisionOptions[].label/feedback`)
 *   - checklist objective `title` / `description`, condition `description`
 *              and `hint`
 *
 * Usage:
 *   node scripts/dialog-lint.mjs                      summary table per character
 *   node scripts/dialog-lint.mjs --campaign nats-eu   one campaign
 *   node scripts/dialog-lint.mjs --scenario nats-eu/scenario1.ts
 *   node scripts/dialog-lint.mjs --flags              list every flagged string
 *   node scripts/dialog-lint.mjs --dump out.jsonl     write all extracted strings
 *   node scripts/dialog-lint.mjs --json               summary as JSON
 *
 * Exit code is 0 unless --strict is passed and an error-level rule fires.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const CAMPAIGNS_DIR = join(ROOT, 'src', 'campaigns');

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);
const onlyCampaign = arg('--campaign');
const onlyScenario = arg('--scenario');
const dumpPath = arg('--dump');
const onlyCharacter = arg('--character');

// ── extraction ────────────────────────────────────────────────────────────

/** Resolve a string-ish expression to text; template spans become "{x}". */
function textOf(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `{x}${s.literal.text}`).join('');
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = textOf(node.left);
    const r = textOf(node.right);
    return l !== undefined && r !== undefined ? l + r : undefined;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return textOf(node.expression);
  return undefined;
}

function propMap(obj) {
  const m = new Map();
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      m.set(p.name.text, p.initializer);
    }
  }
  return m;
}

function characterOf(node) {
  if (!node) return undefined;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

/** Strip HTML and stage directions ("[Text message from ...]") for scoring. */
function speakable(html) {
  return html
    .replace(/<br\s*\/?>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\[[^\]]*\]/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&[a-z]+;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/^scenario\d+\.ts$/u.test(e.name) || /^(drills|sandbox)\.ts$/u.test(e.name) || /^s\d+-(?!station)[a-z0-9-]+\.ts$/u.test(e.name)) yield p;
  }
}

function keyFor(node) {
  // Nearest enclosing property name, e.g. the objective id of a clip.
  let n = node.parent;
  while (n) {
    if (ts.isPropertyAssignment(n) && n.name) {
      const name = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : '?';
      return name;
    }
    n = n.parent;
  }
  return '?';
}

function enclosingObjectiveId(node) {
  let n = node.parent;
  while (n) {
    if (ts.isObjectLiteralExpression(n)) {
      const m = propMap(n);
      if (m.has('conditions') && m.has('id')) return textOf(m.get('id'));
    }
    n = n.parent;
  }
  return undefined;
}

function extractFile(file) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const rel = relative(CAMPAIGNS_DIR, file).split(sep).join('/');
  const campaign = rel.split('/')[0];
  const out = [];
  const push = (kind, character, key, field, raw, extra = {}) => {
    if (raw === undefined || raw.trim() === '') return;
    out.push({ campaign, scenario: rel, kind, character, key, field, raw, text: speakable(raw), ...extra });
  };

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const m = propMap(node);
      const character = characterOf(m.get('character'));
      // Dialog clip
      if (m.has('text') && character) {
        push('dialog', character, keyFor(node), 'text', textOf(m.get('text')), {
          emotion: characterOf(m.get('emotion')),
          hasAudio: !!(m.get('audioUrl') && textOf(m.get('audioUrl')) !== ''),
        });
      }
      // status-check params
      if (m.has('question')) {
        const who = character ?? 'CHARLIE_BROOKS';
        const objective = enclosingObjectiveId(node);
        const options = m.get('options');
        const optionTexts = options && ts.isArrayLiteralExpression(options) ? options.elements.map(textOf) : [];
        const correctIndex = m.get('correctIndex') && ts.isNumericLiteral(m.get('correctIndex')) ? Number(m.get('correctIndex').text) : 0;
        push('quiz', who, objective, 'question', textOf(m.get('question')), { options: optionTexts, correctIndex });
        optionTexts.forEach((o, i) => push('quiz', who, objective, `option${i === correctIndex ? '*' : ''}`, o));
        push('quiz', who, objective, 'explanation', textOf(m.get('explanation')));
      }
      // decision params
      if (m.has('decisionOptions')) {
        const objective = enclosingObjectiveId(node);
        push('decision', character ?? 'SYSTEM', objective, 'prompt', textOf(m.get('prompt')));
        const opts = m.get('decisionOptions');
        if (opts && ts.isArrayLiteralExpression(opts)) {
          for (const el of opts.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue;
            const om = propMap(el);
            push('decision', character ?? 'SYSTEM', objective, 'option', textOf(om.get('label')));
            push('decision', character ?? 'SYSTEM', objective, 'feedback', textOf(om.get('feedback')));
          }
        }
        push('decision', character ?? 'SYSTEM', objective, 'explanation', textOf(m.get('explanation')));
      }
      // Objective (checklist row)
      if (m.has('conditions') && m.has('id') && m.has('title')) {
        const id = textOf(m.get('id'));
        push('checklist', 'CHECKLIST', id, 'title', textOf(m.get('title')));
        push('checklist', 'CHECKLIST', id, 'description', textOf(m.get('description')));
      }
      // Condition row
      if (m.has('type') && m.has('description') && m.has('params') !== undefined && !m.has('conditions')) {
        const parentKey = keyFor(node.parent ?? node);
        if (parentKey === 'conditions' || ts.isArrayLiteralExpression(node.parent)) {
          const objective = enclosingObjectiveId(node);
          const hidden = m.get('hidden')?.kind === ts.SyntaxKind.TrueKeyword;
          if (!hidden) push('checklist', 'CHECKLIST', objective, 'condition', textOf(m.get('description')));
          push('checklist', 'CHECKLIST', objective, 'hint', textOf(m.get('hint')));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ── scoring ───────────────────────────────────────────────────────────────

const BANNED = [
  'honest take', 'frankly', 'honestly', 'one caveat', 'one wrinkle', 'worth noting', 'worth flagging',
  'worth remembering', 'the shape of', 'load-bearing', 'heavy-lifting', 'friction', 'trade-off',
  'crucial', 'pivotal', 'underscores',
];

// Uncontracted forms that a person would normally contract in speech. Each
// requires a following word so sentence-final "that is." / "here you are."
// (which cannot contract) do not count.
const UNCONTRACTED = [
  /\b(?:do|does|did|is|are|was|were|has|have|had|would|could|should|will|must|need) not\b/giu,
  /\bcannot\b/giu,
  /\b(?:it|that|there|what|here|who|he|she|this one) is (?=[a-z])/giu,
  /\b(?:I) am (?=[a-z])/gu,
  /\b(?:you|we|they) are (?=[a-z])/giu,
  /\b(?:I|you|we|they|it|that|he|she|there) will (?=[a-z])/giu,
  /\b(?:I|you|we|they|he|she|it) would (?=[a-z])/giu,
  /\b(?:I|you|we|they) have (?=(?:been|got|done|seen|lost|had|made|never|just|already|to)\b)/giu,
  /\blet us\b/giu,
];
const CONTRACTED = /\b[a-z]+(?:'|’)(?:s|re|ve|ll|d|m|t)\b|\b(?:can't|won't|don't|isn't|aren't|didn't)\b/giu;

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=["'(]?[A-Z0-9])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
const words = (s) => (s.match(/[A-Za-z0-9][A-Za-z0-9'’./+-]*/gu) ?? []).length;

const INTERJECTIONS = /^(?:good|right|nice|okay|ok|yes|no|go|done|thanks|thank you|well done|copy|roger|perfect|great|excellent|lovely|cheers|morning|hello|hi)\b/iu;

function score(item) {
  const flags = [];
  const t = item.text;
  const spoken = item.kind === 'dialog' || item.kind === 'decision' && item.field === 'feedback';
  const sents = sentences(t);
  const wc = words(t);
  const uncontracted = [];
  for (const re of UNCONTRACTED) for (const m of t.matchAll(re)) uncontracted.push(m[0].trim());
  const contracted = (t.match(CONTRACTED) ?? []).length;
  const fragments = sents.filter((s) => words(s) <= 3 && !INTERJECTIONS.test(s));
  const longSents = sents.filter((s) => words(s) > 40);

  if (spoken || item.kind === 'quiz' && item.field === 'explanation') {
    // One long form per clip is allowed for emphasis ("Do not power-cycle the ACU").
    if (uncontracted.length > 0) flags.push({ rule: 'contractions', level: spoken && uncontracted.length >= 2 ? 'error' : 'warn', detail: [...new Set(uncontracted)].join(', ') });
    if (spoken) {
      const abbrev = [...t.matchAll(/\b(?:RX|TX|UL|DL)\b/gu)].map((m) => m[0]);
      if (abbrev.length) flags.push({ rule: 'spoken-abbrev', level: 'warn', detail: `${[...new Set(abbrev)].join(', ')}: say receive / transmit / uplink / downlink` });
    }
    if (spoken && fragments.length >= 2) flags.push({ rule: 'fragments', level: 'warn', detail: fragments.join(' | ') });
    if (longSents.length > 0) flags.push({ rule: 'long-sentence', level: 'warn', detail: `${longSents.length} over 40 words` });
  }
  if (item.kind === 'quiz' && item.field === 'question' && item.options?.length > 1) {
    const lens = item.options.map((o) => (o ?? '').length);
    const correct = lens[item.correctIndex] ?? 0;
    const others = lens.filter((_, i) => i !== item.correctIndex);
    // Guide 4.x: the correct option is never the longest. Any strict lead warns; a 25% lead is an error.
    const maxOther = others.length ? Math.max(...others) : 0;
    if (others.length && correct > maxOther) {
      flags.push({ rule: 'longest-is-correct', level: correct > maxOther * 1.25 ? 'error' : 'warn', detail: `${correct} vs max ${maxOther} chars` });
    }
  }
  const lower = t.toLowerCase();
  for (const b of BANNED) if (lower.includes(b)) flags.push({ rule: 'banned-phrase', level: 'error', detail: b });
  return { wc, sentences: sents.length, uncontracted: uncontracted.length, contracted, fragments: fragments.length, flags };
}

// ── run ───────────────────────────────────────────────────────────────────

let items = [];
for (const f of walk(CAMPAIGNS_DIR)) {
  const rel = relative(CAMPAIGNS_DIR, f).split(sep).join('/');
  if (onlyCampaign && !rel.startsWith(`${onlyCampaign}/`)) continue;
  if (onlyScenario && rel !== onlyScenario) continue;
  items.push(...extractFile(f));
}
if (onlyCharacter) items = items.filter((i) => i.character === onlyCharacter);
for (const i of items) Object.assign(i, score(i));

if (dumpPath) {
  writeFileSync(dumpPath, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
}

// Per character (dialog) and per kind (quiz/checklist) summary
const groups = new Map();
for (const i of items) {
  const g = i.kind === 'dialog' ? `${i.character}` : `${i.kind}:${i.field.replace(/\d|\*/gu, '')}`;
  const k = `${i.campaign}\t${g}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(i);
}
const rows = [...groups.entries()].map(([k, list]) => {
  const [campaign, group] = k.split('\t');
  const wc = list.reduce((a, i) => a + i.wc, 0);
  const sn = list.reduce((a, i) => a + i.sentences, 0);
  const un = list.reduce((a, i) => a + i.uncontracted, 0);
  const co = list.reduce((a, i) => a + i.contracted, 0);
  const fr = list.reduce((a, i) => a + i.fragments, 0);
  const flagged = list.filter((i) => i.flags.length > 0).length;
  const errors = list.filter((i) => i.flags.some((f) => f.level === 'error')).length;
  return {
    campaign, group, n: list.length,
    wordsPer: +(wc / list.length).toFixed(1),
    wordsPerSentence: sn ? +(wc / sn).toFixed(1) : 0,
    contractionRate: un + co ? +(co / (un + co)).toFixed(2) : null,
    fragmentsPer100Sent: sn ? +((fr / sn) * 100).toFixed(1) : 0,
    flagged,
    errors,
  };
}).sort((a, b) => a.campaign.localeCompare(b.campaign) || a.group.localeCompare(b.group));

if (has('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (has('--flags')) {
  for (const i of items.filter((x) => x.flags.length)) {
    console.log(`${i.scenario} [${i.kind}/${i.field}] ${i.character} ${i.key ?? ''}`);
    for (const f of i.flags) console.log(`  ${f.level} ${f.rule}: ${f.detail}`);
  }
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('campaign', 14)}${pad('group', 26)}${pad('n', 6)}${pad('w/item', 8)}${pad('w/sent', 8)}${pad('contr%', 8)}${pad('frag%', 7)}${pad('flagged', 9)}errors`);
  for (const r of rows) {
    const c = r.contractionRate === null ? '-' : `${Math.round(r.contractionRate * 100)}`;
    console.log(`${pad(r.campaign, 14)}${pad(r.group, 26)}${pad(r.n, 6)}${pad(r.wordsPer, 8)}${pad(r.wordsPerSentence, 8)}${pad(c, 8)}${pad(r.fragmentsPer100Sent, 7)}${pad(r.flagged, 9)}${r.errors}`);
  }
}

if (has('--strict') && items.some((i) => i.flags.some((f) => f.level === 'error'))) process.exit(1);
